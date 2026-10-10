// Fills in images for POIs that have none, by matching them against Wikidata.
//
//   node scripts/fill-images.mjs             # runs, writes src/data/pois.json
//   node scripts/fill-images.mjs --dry-run   # reports what it would do
//   node scripts/fill-images.mjs --sample 150 --dry-run  # every 37th POI, for a rate
//   node scripts/fill-images.mjs --per-city  # one POI per city, for a rate
//   node scripts/fill-images.mjs --rethumb   # re-resolve every image URL
//
// Every lookup is cached under .cache/wdimg, including misses, so an
// interrupted run resumes instead of starting over. The file only needs to be
// refreshed when new POIs appear or the matching rules change.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { findImage, commonsThumbs, commonsCredits } from "./lib-images.mjs";

const POIS = "src/data/pois.json";
const CACHE = ".cache/wdimg";

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
// One POI per city, so a measurement is not dominated by whichever city's
// POIs happen to sit first in the file.
const perCity = argv.includes("--per-city");
// Evenly spaced across the whole file. The first POI of a city is its most
// central and most documented one, so taking the first N overstates the hit
// rate an ordinary POI would get.
const spread = argv.includes("--sample");
const count = Number(argv.find((a) => /^\d+$/.test(a)) ?? Infinity);

mkdirSync(CACHE, { recursive: true });

const pois = JSON.parse(readFileSync(POIS, "utf8"));

if (argv.includes("--rethumb")) {
  // A thumb URL ends in "<width>px-<name>", an original ends in "<name>", so
  // the Commons file name is one segment further back for the first kind.
  const byName = new Map();
  for (const list of Object.values(pois)) {
    for (const p of list) {
      if (!p.image) continue;
      const segments = p.image.split("/");
      const last = segments[segments.length - 1];
      const name = decodeURIComponent(
        /^\d+px-/.test(last) ? segments[segments.length - 2] : last,
      );
      byName.set(name, [...(byName.get(name) ?? []), p]);
    }
  }
  console.log(`mevcut gorsel: ${byName.size} dosya`);
  const thumbs = await commonsThumbs([...byName.keys()]);
  let changed = 0;
  let unresolved = 0;
  for (const [name, entries] of byName) {
    const next = thumbs[name];
    if (!next) {
      unresolved++;
      continue;
    }
    for (const p of entries) {
      if (p.image !== next) {
        p.image = next;
        changed++;
      }
    }
  }
  if (unresolved) console.log(`UYARI: cozulemeyen dosya: ${unresolved}`);
  console.log(`degisen gorsel: ${changed}`);
  if (!dryRun && changed) {
    writeFileSync(POIS, JSON.stringify(pois));
    console.log("yazildi.");
  } else if (dryRun) {
    console.log("dry-run: dosya degistirilmedi.");
  }
  process.exit(0);
}

const pending = [];
if (perCity) {
  for (const [slug, list] of Object.entries(pois)) {
    const index = list.findIndex((p) => !p.image);
    if (index >= 0) pending.push({ slug, index, ...list[index] });
  }
} else {
  for (const [slug, list] of Object.entries(pois)) {
    list.forEach((p, index) => {
      if (!p.image) pending.push({ slug, index, ...p });
    });
  }
}
let queue = pending;
if (spread && count < pending.length) {
  queue = Array.from(
    { length: count },
    (_, i) => pending[Math.floor((i * pending.length) / count)],
  );
} else if (count < pending.length) {
  queue = pending.slice(0, count);
}

console.log(
  `gorseli olmayan ${pending.length} POI` +
    (queue.length !== pending.length ? `, ${queue.length} tanesi islencek` : ""),
);

function cachePath(p) {
  return `${CACHE}/${p.slug}-${encodeURIComponent(p.id).replace(/%/g, "_")}.json`;
}

function readCache(p) {
  try {
    const raw = readFileSync(cachePath(p), "utf8");
    return raw === "null" ? null : JSON.parse(raw);
  } catch {
    return undefined; // undefined = no cache entry, null = cached miss
  }
}

async function lookup(p) {
  const cached = readCache(p);
  if (cached !== undefined) return cached;

  const best = await findImage(p);
  // A null is cached as a miss on purpose: Wikidata simply having no photo for
  // a place is a fact, not a hiccup. Clearing .cache/wdimg is what re-tests the
  // rules after they change.
  writeFileSync(cachePath(p), JSON.stringify(best));
  return best;
}

// Sequential by design: every request goes through the gate in lib-images.mjs,
// which spaces calls apart to stay under Wikidata's rate limit, so parallel
// workers would only queue behind each other.
const started = Date.now();
let failed = 0;
const errors = [];
for (let i = 0; i < queue.length; i++) {
  const p = queue[i];
  try {
    await lookup(p);
  } catch (e) {
    // Deliberately left uncached: the distinction between "Wikidata has no
    // photo for this" and "the request failed" is the whole point, and only
    // the first one is worth remembering.
    failed++;
    if (errors.length < 5) errors.push(`${p.name}: ${e.message}`);
  }
  if ((i + 1) % 50 === 0) process.stdout.write(`\r  ${i + 1}/${queue.length}`);
}
process.stdout.write(`\r  ${queue.length}/${queue.length}\n`);
if (failed) {
  console.log(`UYARI: ${failed} istek basarisiz, bunlar sonraki calistirmada tekrar denenecek`);
  for (const e of errors) console.log(`   ${e}`);
}

// Collect what every POI matched, dropping duplicates: one photo cannot
// depict two places even when both sit 20m apart.
const matches = [];
const taken = new Set();
const misses = [];
for (const p of queue) {
  const best = readCache(p);
  if (!best) {
    misses.push(p);
    continue;
  }
  const file = best.file;
  if (taken.has(file)) {
    misses.push(p);
    continue;
  }
  taken.add(file);
  matches.push({ p, best });
}

console.log(
  `aday bulundu: ${matches.length}/${queue.length}  ` +
    `(${((matches.length / queue.length) * 100).toFixed(1)}%), ${misses.length} yok`,
);
for (const { p, best } of matches) {
  console.log(`  ${p.slug.padEnd(13)} ${p.name.slice(0, 30).padEnd(32)} ${Math.round(best.dist)}m  ${best.file}`);
}

if (!matches.length) {
  console.log("yazilacak gorsel yok.");
  process.exit(0);
}

const thumbs = await commonsThumbs(matches.map((m) => m.best.file));
if (!Object.keys(thumbs).length && matches.length) {
  console.log(`UYARI: commons thumbs hic donmedi (${Object.keys(thumbs).length}/${matches.length})`);
}
// CC licences require credit next to the photo, so the author and licence
// travel with the URL from the start.
const credits = await commonsCredits(matches.map((m) => m.best.file));
let added = 0;
let unresolved = 0;
for (const { p, best } of matches) {
  const url = thumbs[best.file];
  if (!url) {
    unresolved++;
    continue;
  }
  const c = credits[best.file];
  pois[p.slug][p.index].image = url;
  pois[p.slug][p.index].imageBy = c?.by ?? null;
  pois[p.slug][p.index].imageLicense = c?.license ?? null;
  pois[p.slug][p.index].imageSource = "commons";
  added++;
}

console.log(
  `commons gorseli cozulen: ${added}/${matches.length}` +
    (unresolved ? `  cozulemeyen: ${unresolved}` : ""),
);

if (dryRun) {
  console.log("dry-run: dosya degistirilmedi.");
} else {
  writeFileSync(POIS, JSON.stringify(pois));
  const all = Object.values(pois).flat();
  const withImage = all.filter((p) => p.image).length;
  console.log(
    `yazildi. toplam gorsel: ${withImage}/${all.length} ` +
    `(%${((withImage / all.length) * 100).toFixed(1)})`,
  );
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(`sure: ${seconds}sn`);