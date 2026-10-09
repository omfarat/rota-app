import { getCity } from "@/lib/data";
import { getPois } from "@/lib/pois";
import type { Poi } from "@/lib/types";
import { haversineKm, reorder, travelMinutes } from "@/lib/route";

export type ItineraryStop = Poi & {
  day: number;
  orderInDay: number;
  travelKmFromPrev: number;
  travelMinFromPrev: number;
};

export type DayItinerary = {
  day: number;
  stops: ItineraryStop[];
  distanceKm: number;
  travelMin: number;
  visitMin: number;
  totalMin: number;
};

export type CityItinerary = {
  slug: string;
  days: DayItinerary[];
  totalDays: number;
  totalPois: number;
};

const DAY_TARGET_MIN = 540;

function buildDay(
  dayNum: number,
  pois: Poi[],
  startLat: number,
  startLon: number,
): DayItinerary {
  if (pois.length === 0) {
    return {
      day: dayNum,
      stops: [],
      distanceKm: 0,
      travelMin: 0,
      visitMin: 0,
      totalMin: 0,
    };
  }

  const res: any = reorder({ stops: pois as any } as any, pois.map((_:any,i:number)=>i), { lat: startLat, lon: startLon } as any) as any; const ordered: Poi[] = res.stops || pois;
  let prevLat = startLat;
  let prevLon = startLon;
  let distanceKm = 0;
  let travelMin = 0;
  let visitMin = 0;

  const stops: ItineraryStop[] = ordered.map((p, i) => {
    const d = haversineKm({lat:prevLat,lon:prevLon}, {lat:p.lat,lon:p.lon});
    const t = travelMinutes(d);
    distanceKm += d;
    travelMin += t;
    visitMin += p.duration;
    const stop: ItineraryStop = {
      ...p,
      day: dayNum,
      orderInDay: i + 1,
      travelKmFromPrev: Number(d.toFixed(2)),
      travelMinFromPrev: t,
    };
    prevLat = p.lat;
    prevLon = p.lon;
    return stop;
  });

  return {
    day: dayNum,
    stops,
    distanceKm: Number(distanceKm.toFixed(2)),
    travelMin,
    visitMin,
    totalMin: travelMin + visitMin,
  };
}

export function buildItinerary(slug: string): CityItinerary {
  const city = getCity(slug);
  const pois = getPois(slug);
  if (!city || pois.length === 0) {
    return { slug, days: [], totalDays: 0, totalPois: pois.length };
  }

  const totalVisit = pois.reduce((s, p) => s + p.duration, 0);
  let totalDays = Math.max(1, Math.ceil(totalVisit / DAY_TARGET_MIN));
  if (totalDays < 1) totalDays = 1;
  if (pois.length > 0 && totalDays > pois.length) {
    totalDays = pois.length;
  }
  if (totalDays > 30) {
    totalDays = 30;
  }

  const perDayBase = Math.ceil(pois.length / totalDays);
  const days: DayItinerary[] = [];
  let idx = 0;
  let startLat = city.lat;
  let startLon = city.lon;

  for (let d = 1; d <= totalDays && idx < pois.length; d++) {
    let take = perDayBase;
    if (idx + take > pois.length) take = pois.length - idx;
    if (take < 1) break;
    const slice = pois.slice(idx, idx + take);
    idx += take;
    const day = buildDay(d, slice, startLat, startLon);
    days.push(day);
    if (day.stops.length > 0) {
      const last = day.stops[day.stops.length - 1];
      startLat = last.lat;
      startLon = last.lon;
    }
  }

  return {
    slug,
    days,
    totalDays: days.length,
    totalPois: pois.length,
  };
}
