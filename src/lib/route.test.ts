import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { planRoute, haversineKm } from "./route.ts";
import type { City, Poi, Theme } from "./types.ts";
import { DURATIONS, durationOf, THEMES } from "./types.ts";

const dataDir = path.join(import.meta.dirname, "..", "data");
const cities = JSON.parse(readFileSync(path.join(dataDir, "cities.json"), "utf8")) as City[];
const allPois = JSON.parse(readFileSync(path.join(dataDir, "pois.json"), "utf8")) as Record<
  string,
  Poi[]
>;

const THEMES_IDS = THEMES.map((t) => t.id);
const city = cities.find((c) => c.slug === "adana")!;

function plan(over: Partial<Parameters<typeof planRoute>[0]> = {}) {
  return planRoute({
    city,
    pois: allPois[city.slug],
    theme: "genel",
    start: { lat: city.lat, lon: city.lon },
    startLabel: `${city.name} merkezi`,
    hours: 5,
    maxKm: 7,
    maxStops: 8,
    ...over,
  });
}

test("haversineKm agrees with hand-checked great-circle distances", () => {
  const ankara = { lat: 39.9334, lon: 32.8597 };
  const istanbul = { lat: 41.0082, lon: 28.9784 };
  const izmir = { lat: 38.4237, lon: 27.1428 };
  const antalya = { lat: 36.8969, lon: 30.7133 };

  // Straight line, verified by hand from the degree offsets:
  //   Ankara-Istanbul  sqrt(119^2 + 327^2) = 348 km
  //   Ankara-Izmir     sqrt(168^2 + 494^2) = 522 km
  //   Istanbul-Antalya sqrt(457^2 + 151^2) = 481 km
  assert.ok(Math.abs(haversineKm(ankara, istanbul) - 348) < 2);
  assert.ok(Math.abs(haversineKm(ankara, izmir) - 522) < 2);
  assert.ok(Math.abs(haversineKm(istanbul, antalya) - 481) < 2);
  assert.equal(haversineKm(ankara, ankara), 0);
});

test("a plan never repeats a stop and numbers them in order", () => {
  for (const theme of THEMES_IDS) {
    const p = plan({ theme: theme as Theme });
    const ids = p.stops.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, `${theme}: yinelenen durak`);
    p.stops.forEach((s, i) => assert.equal(s.index, i + 1, `${theme}: sıra bozuk`));
  }
});

test("totalKm equals the sum of the legs actually driven", () => {
  const p = plan();
  const start = { lat: city.lat, lon: city.lon };
  let walked = 0;
  let prev = start;
  for (const s of p.stops) {
    walked += haversineKm(prev, s);
    prev = s;
  }
  assert.ok(Math.abs(walked - p.totalKm) < 0.5, `${walked} != ${p.totalKm}`);
});

test("stop count stays within the requested maximum", () => {
  for (const d of DURATIONS) {
    const p = plan({ hours: d.hours, maxKm: d.maxKm, maxStops: d.maxStops });
    assert.ok(p.stops.length <= d.maxStops, `${d.id}: ${p.stops.length} > ${d.maxStops}`);
  }
});

test("stopped time plus driving fits the requested hours", () => {
  for (const d of DURATIONS) {
    const p = plan({ hours: d.hours, maxKm: d.maxKm, maxStops: d.maxStops });
    assert.ok(p.totalMinutes <= d.hours * 60, `${d.id}: ${p.totalMinutes} dk > ${d.hours} saat`);
  }
});

test("a specific theme is honoured when the city has enough of it", () => {
  const tarih = plan({ theme: "tarih" });
  const pool = allPois[city.slug].filter((p) => p.theme === "tarih");
  if (pool.length >= 3) {
    assert.ok(
      tarih.stops.every((s) => s.theme === "tarih"),
      "tarih rotası tarih dışı durak içeriyor",
    );
  }
});

test("a thin theme falls back to the general tour and says so", () => {
  // Two themed places is below the three needed to commit to the theme, so the
  // planner must widen the pool and admit it in the notes.
  const two = allPois[city.slug].filter((p) => p.theme === "lezzet").slice(0, 2);
  assert.equal(two.length, 2, "test needs two lezzet stops in the fixture");

  const p = plan({ pois: two, theme: "lezzet" });
  assert.ok(p.stops.length > 0, "fallback rotayı boş döndürdü");
  assert.ok(
    p.notes.some((n) => n.includes("genel geziye")),
    `fallback notu yok: ${JSON.stringify(p.notes)}`,
  );
});

test("rain keeps the route indoors when enough indoor stops exist", () => {
  const wet = plan({ theme: "genel", wet: true });
  const indoor = allPois[city.slug].filter((p) => p.indoor).length;
  if (indoor >= 3) {
    assert.ok(wet.stops.every((s) => s.indoor), "yağmurda açık alan seçildi");
    assert.ok(wet.notes.some((n) => n.includes("Yağmur")));
  }
  const dry = plan({ theme: "genel", wet: false });
  assert.equal(dry.weatherApplied, false);
});

test("an empty city does not crash the planner", () => {
  const p = plan({ pois: [] });
  assert.deepEqual(p.stops, []);
  assert.equal(p.totalKm, 0);
});

test("a start far from the centre keeps the drive local", () => {
  const near = plan();
  const far = plan({ start: { lat: 39.9334, lon: 32.8597 } }); // Ankara centre
  assert.ok(far.totalKm <= near.totalKm * 4, `uzak başlangıç çok uzattı: ${far.totalKm}`);
});

test("every city in the dataset produces a usable plan", () => {
  const failures: string[] = [];
  for (const c of cities) {
    const pois = allPois[c.slug] ?? [];
    if (!pois.length) {
      failures.push(`${c.name}: veri yok`);
      continue;
    }
    for (const theme of THEMES_IDS) {
      for (const d of DURATIONS) {
        const p = planRoute({
          city: c,
          pois,
          theme: theme as Theme,
          start: { lat: c.lat, lon: c.lon },
          startLabel: `${c.name} merkezi`,
          hours: d.hours,
          maxKm: d.maxKm,
          maxStops: d.maxStops,
        });
        const ids = p.stops.map((s) => s.id);
        // An empty route is legitimate when nothing fits the budget, but it
        // must then explain itself, otherwise the page looks broken.
        if (!p.stops.length && !p.notes.length) {
          failures.push(`${c.name}/${theme}/${d.id}: durak yok, gerekçe de yok`);
        }
        if (new Set(ids).size !== ids.length) failures.push(`${c.name}/${theme}/${d.id}: tekrar`);
        if (p.stops.length > d.maxStops) failures.push(`${c.name}/${theme}/${d.id}: fazla durak`);
        if (p.totalMinutes > d.hours * 60) failures.push(`${c.name}/${theme}/${d.id}: süre aşımı`);
        if (p.totalKm > d.maxKm && !p.notes.some((n) => n.includes("önerisini aşarak"))) {
          failures.push(`${c.name}/${theme}/${d.id}: mesafe aşımı ama uyarı yok`);
        }
      }
    }
  }
  assert.deepEqual(failures, [], failures.slice(0, 20).join("\n"));
});

test("durationOf falls back to the default for unknown ids", () => {
  assert.equal(durationOf("half").id, "half");
  assert.equal(durationOf("full").id, "full");
  assert.equal(durationOf("days").id, "half");
  assert.equal(durationOf(undefined).id, "half");
  assert.equal(durationOf("nonsense").id, "half");
});