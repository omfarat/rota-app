import type { City, Poi, Theme } from "./types";

export interface LatLon {
  lat: number;
  lon: number;
}

export interface RouteStop extends Poi {
  index: number;
  distanceFromPrevKm: number;
  walkMinutes: number;
}

export interface RoutePlan {
  city: City;
  theme: Theme;
  stops: RouteStop[];
  totalKm: number;
  totalWalkMinutes: number;
  totalMinutes: number;
  indoorRatio: number;
  weatherApplied: boolean;
  notes: string[];
}

const R_KM = 6371;
const WALK_KMH = 4.6;

export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(h));
}

const pathLength = (order: number[], points: LatLon[]) => {
  let total = 0;
  for (let i = 1; i < order.length; i++) {
    total += haversineKm(points[order[i - 1]], points[order[i]]);
  }
  return total;
};

/** Nearest-neighbour seed: cheap, and the only thing that ever ships for a "2 hours" route. */
function nearestNeighbour(points: LatLon[], start: LatLon): number[] {
  const n = points.length;
  const visited = new Array(n).fill(false);
  const order: number[] = [];
  let current = start;

  for (let step = 0; step < n; step++) {
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      if (visited[i]) continue;
      const d = haversineKm(current, points[i]);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    visited[best] = true;
    order.push(best);
    current = points[best];
  }
  return order;
}

/** 2-opt: reverse segments until no swap shortens the path. Practically optimal at our sizes. */
function twoOpt(order: number[], points: LatLon[]): number[] {
  const route = [...order];
  let improved = true;
  let guard = 0;

  while (improved && guard++ < 200) {
    improved = false;
    for (let i = 0; i < route.length - 2; i++) {
      for (let j = i + 2; j < route.length; j++) {
        const before =
          haversineKm(points[route[i]], points[route[i + 1]]) +
          haversineKm(points[route[j - 1]], points[route[j]]);
        const after =
          haversineKm(points[route[i]], points[route[j - 1]]) +
          haversineKm(points[route[i + 1]], points[route[j]]);
        if (after + 1e-9 < before) {
          const slice = route.slice(i + 1, j + 1).reverse();
          route.splice(i + 1, slice.length, ...slice);
          improved = true;
        }
      }
    }
  }
  return route;
}

export function optimizeRoute(
  points: LatLon[],
  start: LatLon,
): { order: number[]; km: number } {
  const nn = nearestNeighbour(points, start);
  const optimized = twoOpt(nn, points);
  return { order: optimized, km: pathLength(optimized, points) };
}

export interface PlanInput {
  city: City;
  pois: Poi[];
  theme: Theme;
  start: LatLon;
  startLabel: string;
  hours: number;
  maxKm: number;
  maxStops: number;
  wet?: boolean;
}

export function planRoute(input: PlanInput): RoutePlan {
  const notes: string[] = [];
  const { city, theme, start, hours, maxKm, maxStops } = input;
  const wet = Boolean(input.wet);

  let pool = input.pois.filter((p) => theme === "genel" || p.theme === theme);

  if (pool.length < 3) {
    pool = [...input.pois];
    notes.push(`Bu şehirde "${theme}" teması için az yer var; genel geziye göre kuruldu.`);
  }

  if (wet) {
    const indoor = pool.filter((p) => p.indoor);
    if (indoor.length >= 3) {
      pool = indoor;
      notes.push("Yağmur nedeniyle sadece kapalı mekanlar seçildi.");
    } else {
      notes.push("Yağmur var ama kapalı mekan sayısı yetersiz; açık alanlar korundu.");
    }
  }

  // Keep the walk local: a start 20 km from the centre must not drag the
  // route out to the edge of the province just because a stop ranks well.
  const reachKm = Math.max(maxKm * 1.8, 6);
  const nearby = pool.filter((p) => haversineKm(start, p) <= reachKm);
  if (nearby.length >= 3) {
    if (nearby.length < pool.length) {
      notes.push(
        `Başlangıç noktasına ${reachKm.toFixed(0)} km'den uzak duraklar alınmadı.`,
      );
    }
    pool = nearby;
  } else {
    notes.push(
      "Başlangıç noktasına yakın yeterli durak yok; en yakın olanlar kullanıldı.",
    );
  }

  // Rank by value per kilometre: a famous stop far away should not outrank a
  // good one on the way.
  pool = [...pool]
    .sort(
      (a, b) =>
        haversineKm(start, a) / (a.priority / 20) -
        haversineKm(start, b) / (b.priority / 20),
    )
    .slice(0, Math.min(40, maxStops * 3));
  if (pool.length === 0) {
    return {
      city,
      theme,
      stops: [],
      totalKm: 0,
      totalWalkMinutes: 0,
      totalMinutes: 0,
      indoorRatio: 0,
      weatherApplied: wet,
      notes: ["Bu şehir için henüz veri yok."],
    };
  }

  const points = pool.map((p) => ({ lat: p.lat, lon: p.lon }));
  const { order } = optimizeRoute(points, start);

  const legCost = (list: number[]) =>
    haversineKm(start, points[list[0]]) + pathLength(list, points);

  // The tour is open, so its ends are arbitrary. Take the tightest window of
  // it instead of the prefix, otherwise a single far outlier burns the budget.
  const width = Math.min(maxStops, order.length);
  let selected = order.slice(0, width);
  let km = legCost(selected);
  for (let i = 1; i + width <= order.length; i++) {
    const window = order.slice(i, i + width);
    const cost = legCost(window);
    if (cost < km) {
      selected = window;
      km = cost;
    }
  }

  // Trim until the walk fits both the distance budget and the time budget.
  // The floor is one stop, not three: a "3 hour" request that quietly returns
  // three 90 minute museums is a 5 hour trip, which is not what was asked for.
  const spent = (list: number[], walkKm: number) =>
    list.reduce((acc, i) => acc + pool[i].duration, 0) +
    Math.round((walkKm / WALK_KMH) * 60);

  let minutes = spent(selected, km);
  const beforeTrim = selected.length;
  let guard = 0;
  // Drop the stop that costs the most time rather than simply the last one:
  // a 90 minute museum at the end of the list would cost two 45 minute stops.
  const costliest = (list: number[]) => {
    let worst = 0;
    let worstCost = -1;
    list.forEach((idx, i) => {
      const prev = i === 0 ? start : pool[list[i - 1]];
      const cost =
        pool[idx].duration + (haversineKm(prev, pool[idx]) / WALK_KMH) * 60;
      if (cost > worstCost) {
        worstCost = cost;
        worst = i;
      }
    });
    return worst;
  };
  while (
    selected.length > 1 &&
    (km > maxKm || minutes > hours * 60) &&
    guard++ < 60
  ) {
    selected = selected.filter((_, i) => i !== costliest(selected));
    km = legCost(selected);
    minutes = spent(selected, km);
  }

  if (selected.length < beforeTrim && selected.length <= 2) {
    notes.push(
      selected.length === 1
        ? `${hours} saatlik programa sığan tek bir durak bulundu.`
        : `${hours} saatlik programa yalnızca ${selected.length} durak sığıyor.`,
    );
  }

  // A stop an hour's walk away does not fit a three hour request, so it goes.
// Distance is treated differently: sights in a big city really are spread out,
// and dropping the only museum eight kilometres away helps nobody.
  if (selected.length === 1 && minutes > hours * 60) {
    const only = pool[selected[0]];
    selected = [];
    km = 0;
    minutes = 0;
    notes.push(
      `${hours} saatlik programa sığan durak yok: ${only.name} ` +
        `${haversineKm(start, only).toFixed(0)} km uzakta. Süreyi uzatmayı deneyin.`,
    );
  } else if (km > maxKm) {
    // The length picker promises "5 saat · 7 km". Say plainly that this one had
    // to be longer rather than letting the promise quietly break.
    notes.push(
      `Bu temada seçenekler birbirinden uzak; rota ${maxKm} km önerisini aşarak ` +
        `${km.toFixed(1)} km oldu.`,
    );
  }

  const stops: RouteStop[] = selected.map((idx, i) => {
    const poi = pool[idx];
    const prev = i === 0 ? start : pool[selected[i - 1]];
    const d = haversineKm(prev, poi);
    return {
      ...poi,
      index: i + 1,
      distanceFromPrevKm: +d.toFixed(2),
      walkMinutes: Math.max(1, Math.round((d / WALK_KMH) * 60)),
    };
  });

  const totalWalkMinutes = Math.round((km / WALK_KMH) * 60);
  const indoorCount = stops.filter((s) => s.indoor).length;

  return {
    city,
    theme,
    stops,
    totalKm: +km.toFixed(1),
    totalWalkMinutes,
    totalMinutes:
      stops.reduce((a, s) => a + s.duration, 0) + totalWalkMinutes,
    indoorRatio: stops.length ? indoorCount / stops.length : 0,
    weatherApplied: wet,
    notes,
  };
}

/**
 * Applies a visitor's own stop order. `origin` has to be the real starting
 * point, otherwise the first leg is measured from the city centre.
 */
export function reorder(
  plan: RoutePlan,
  order: number[],
  origin: LatLon = plan.city,
): RoutePlan {
  const tmp: any[] = order.map((idx) => plan.stops[idx]);
  const stops: any[] = tmp.map((s, i) => {
    const prev = i === 0 ? origin : tmp[i - 1];
    const d = haversineKm(prev, s);
    return {
      ...s,
      index: i + 1,
      distanceFromPrevKm: +d.toFixed(2),
      walkMinutes: Math.max(1, Math.round((d / WALK_KMH) * 60)),
    };
  });
  const km =
    stops.reduce((acc, s, i) => {
      const prev = i === 0 ? origin : stops[i - 1];
      return acc + haversineKm(prev, s);
    }, 0) * 0.94; // path is not a straight line
  const walk = Math.round((km / WALK_KMH) * 60);
  return {
    ...plan,
    stops,
    totalKm: +km.toFixed(1),
    totalWalkMinutes: walk,
    totalMinutes: stops.reduce((a, s) => a + s.duration, 0) + walk,
  };
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m} dk`;
  if (!m) return `${h} saat`;
  return `${h} sa ${m} dk`;
}
export function reorderPois(pois: any[], startLat: number, startLon: number): any[] {
  const order = pois.map((_: any, i: number) => i);
  const res = reorder({ stops: pois } as any, order, { lat: startLat, lon: startLon } as any) as any;
  return res.stops || pois;
}
