import { CITIES } from "./cities.mjs";

const q = `SELECT ?il ?ilLabel ?iso ?coord WHERE {
  wd:Q43 wdt:P150 ?il .
  OPTIONAL { ?il wdt:P300 ?iso }
  OPTIONAL { ?il wdt:P625 ?coord }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "tr,en". }
}`;

const res = await fetch(
  "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q),
  {
    headers: {
      "User-Agent": "rota-app/0.1",
      Accept: "application/sparql-results+json",
    },
  },
);
const json = await res.json();
const parseCoord = (value) => {
  // "Point(35.3213 37.0)" -> { lat, lon }; the hemisphere sign comes first.
  const m = /^Point\(([-\d.]+) ([-\d.]+)\)$/.exec(value || "");
  if (!m) return null;
  return { lat: Number(m[2]), lon: Number(m[1]) };
};

const official = json.results.bindings.map((b) => {
  const c = parseCoord(b.coord?.value);
  return {
    name: b.ilLabel.value,
    plate: (b.iso?.value || "").replace("TR-", ""),
    lat: c?.lat ?? null,
    lon: c?.lon ?? null,
  };
});

const norm = (s) =>
  s
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .replace(/ı/g, "i")
    .toLocaleLowerCase("tr");

const byName = new Map(official.map((o) => [norm(o.name), o]));
const mine = new Map(CITIES.map((c) => [norm(c.name), c]));

const missing = official.filter((o) => !mine.has(norm(o.name)));
console.log(`Wikidata: ${official.length} il, cities.mjs: ${CITIES.length} il`);
console.log("\nEKSIK:");
for (const o of missing) {
  console.log(`  ${o.plate} ${o.name}  lat ${o.lat} lon ${o.lon}`);
}

const wrongPlate = [];
const offCentre = [];
for (const c of CITIES) {
  const o = byName.get(norm(c.name));
  if (!o) continue;
  if (o.plate && o.plate !== c.plate) wrongPlate.push(`${c.name}: ${c.plate} -> ${o.plate}`);
  if (o.lat && o.lon) {
    const km =
      6371 *
      2 *
      Math.asin(
        Math.sqrt(
          Math.sin(((o.lat - c.lat) * Math.PI) / 360) ** 2 +
            Math.cos((c.lat * Math.PI) / 180) *
              Math.cos((o.lat * Math.PI) / 180) *
              Math.sin(((o.lon - c.lon) * Math.PI) / 360) ** 2,
        ),
      );
    if (km > 12) offCentre.push(`${c.name}: ${km.toFixed(0)} km kayik`);
  }
}
console.log("\nPLAKA HATASI:");
for (const w of wrongPlate) console.log("  " + w);
console.log("\nMERKEZ SAPMASI:");
for (const w of offCentre) console.log("  " + w);
