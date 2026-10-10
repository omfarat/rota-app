// Backfills photo credit (author + licence) for POIs that already have an
// image, so every stored Commons photo carries its legally required credit.
//
//   node scripts/fill-credits.mjs            # runs, writes src/data/pois.json
//   node scripts/fill-credits.mjs --dry-run  # reports what it would do
//
// Only touches POIs whose image URL points at upload.wikimedia.org; anything
// else (Mapillary thumbs carry their own credit fields) is left alone.
import { readFileSync, writeFileSync } from "node:fs";
import { commonsCredits } from "./lib-images.mjs";

const POIS = "src/data/pois.json";
const dryRun = process.argv.includes("--dry-run");

const pois = JSON.parse(readFileSync(POIS, "utf8"));

// Same filename recovery as fill-images --rethumb: a thumb URL ends in
// "<width>px-<name>", an original ends in "<name>".
const byName = new Map();
for (const list of Object.values(pois)) {
  for (const p of list) {
    if (!p.image || !/wikimedia\.org/.test(p.image)) continue;
    if (p.imageBy && p.imageLicense) continue;
    const segments = p.image.split("/");
    const last = segments[segments.length - 1];
    const name = decodeURIComponent(
      /^\d+px-/.test(last) ? segments[segments.length - 2] : last,
    );
    byName.set(name, [...(byName.get(name) ?? []), p]);
  }
}

console.log(`kunyesiz commons gorseli: ${byName.size} dosya`);
if (!byName.size) process.exit(0);

const credits = await commonsCredits([...byName.keys()]);
let filled = 0;
let missing = 0;
const licences = new Map();
for (const [name, entries] of byName) {
  const c = credits[name];
  if (!c) {
    missing++;
    continue;
  }
  licences.set(c.license ?? "yok", (licences.get(c.license ?? "yok") ?? 0) + 1);
  for (const p of entries) {
    p.imageBy = c.by ?? null;
    p.imageLicense = c.license ?? null;
    filled++;
  }
}

console.log(`kredi yazilan POI: ${filled}, cevapsiz dosya: ${missing}`);
console.log(
  "lisans dagilimi: " +
    [...licences.entries()].map(([l, n]) => `${l}=${n}`).join(", "),
);

if (dryRun) {
  console.log("dry-run: dosya degistirilmedi.");
} else {
  writeFileSync(POIS, JSON.stringify(pois));
  console.log("yazildi.");
}
