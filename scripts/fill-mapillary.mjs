// Fills in photos for POIs that have none, from Mapillary street imagery.
//
//   $env:MAPILLARY_TOKEN="..." ; node scripts/fill-mapillary.mjs
//   node scripts/fill-mapillary.mjs --dry-run   # reports what it would do
//   node scripts/fill-mapillary.mjs 200         # first 200 imageless POIs
//
// The token is free: mapillary.com -> account -> developers -> access token.
// Mapillary imagery is CC BY-SA 4.0, so commercial use is free with credit;
// the photographer name and licence travel with the URL like Commons photos.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const POIS = "src/data/pois.json";
const CACHE = ".cache/mapillary";
const TOKEN = process.env.MAPILLARY_TOKEN;

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const count = Number(argv.find((a) => /^\d+$/.test(a)) ?? Infinity);

if (!TOKEN) {
  console.log("MAPILLARY_TOKEN yok: once mapillary.com uzerinden ucretsiz token alip ortama koy.");
  process.exit(2);
}

mkdirSync(CACHE, { recursive: true });
const pois = JSON.parse(readFileSync(POIS, "utf8"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const haversineM = (a, b, c, d) => {
  const R = 6371000;
  const p1 = (a * Math.PI) / 180;
  const p2 = (c * Math.PI) / 180;
  const dp = ((c - a) * Math.PI) / 180;
  const dl = ((d - b) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

function cachePath(p) {
  return `${CACHE}/${p.slug}-${encodeURIComponent(p.id).replace(/%/g, "_")}.json`;
}
function readCache(p) {
  try {
    const raw = readFileSync(cachePath(p), "utf8");
    return raw === "null" ? null : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

async function lookup(p) {
  const cached = readCache(p);
  if (cached !== undefined) return cached;
  const url =
    "https://graph.mapillary.com/images?access_token=" + TOKEN +
    "&fields=id,thumb_1024_url,computed_geometry,captured_at,creator" +
    `&closeto=${p.lon},${p.lat}&radius=50&limit=5&is_pano=false`;
  const res = await fetch(url, { headers: { "User-Agent": "RotaApp/1.0" } });
  if (!res.ok) throw new Error(`mapillary HTTP ${res.status}`);
  const json = await res.json();
  let best = null;
  for (const img of json.data ?? []) {
    const [lon, lat] = img.computed_geometry?.coordinates ?? [];
    if (typeof lat !== "number" || !img.thumb_1024_url) continue;
    const dist = haversineM(p.lat, p.lon, lat, lon);
    if (dist <= 50 && (!best || dist < best.dist)) {
      best = {
        url: img.thumb_1024_url,
        by: img.creator?.username ?? null,
        dist: Math.round(dist),
      };
    }
  }
  writeFileSync(cachePath(p), JSON.stringify(best));
  await sleep(150);
  return best;
}

const pending = [];
for (const [slug, list] of Object.entries(pois)) {
  list.forEach((p, index) => {
    if (!p.image) pending.push({ slug, index, ...p });
  });
}
const queue = pending.slice(0, count);
console.log(`gorselsiz ${pending.length} POI, ${queue.length} tanesi islencek`);

let failed = 0;
let matched = 0;
const thumbs = [];
for (let i = 0; i < queue.length; i++) {
  const p = queue[i];
  try {
    const hit = await lookup(p);
    if (hit) {
      matched++;
      thumbs.push({ p, hit });
    }
  } catch (e) {
    failed++;
    if (failed <= 5) console.log(`   ${p.name}: ${e.message}`);
  }
  if ((i + 1) % 50 === 0) process.stdout.write(`\r  ${i + 1}/${queue.length}`);
}
process.stdout.write(`\r  ${queue.length}/${queue.length}\n`);
console.log(`eslesen: ${matched}/${queue.length}, basarisiz: ${failed}`);

if (dryRun) {
  console.log("dry-run: dosya degistirilmedi.");
  process.exit(0);
}
for (const { p, hit } of thumbs) {
  const target = pois[p.slug][p.index];
  target.image = hit.url;
  target.imageBy = hit.by;
  target.imageLicense = "CC BY-SA 4.0";
  target.imageSource = "mapillary";
}
writeFileSync(POIS, JSON.stringify(pois));
const withImage = Object.values(pois).flat().filter((p) => p.image).length;
console.log(`yazildi. toplam gorsel: ${withImage}`);
