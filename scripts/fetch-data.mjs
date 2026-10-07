import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { CITIES } from "./cities.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, ".cache");
const OUT = path.join(ROOT, "src", "data");
const UA = "rota-app/0.1 (turkiye-seyahat-rotasi; educational prototype)";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Cache keys for a batch must follow the batch, not its position: the QID list
// grows between runs, so a positional key hands back yesterday's shorter chunk
// and silently drops everything that was appended to it.
const digest = (s) => createHash("sha1").update(s).digest("hex").slice(0, 16);

// PowerShell writes a BOM by default; strip it or JSON.parse throws.
async function readJson(file) {
  const raw = await readFile(file, "utf8");
  return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
}

async function cached(name, fn) {
  const file = path.join(CACHE, name);
  if (existsSync(file)) return readJson(file);
  const value = await fn();
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 0));
  return value;
}

async function fetchRetry(url, init = {}, tries = 3, timeout = 60000) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "User-Agent": UA, ...(init.headers || {}) },
        signal: AbortSignal.timeout(timeout),
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(2000 * (i + 1));
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `HTTP ${res.status} ${new URL(url).host}: ${body.slice(0, 400)}`,
        );
      }
      return res;
    } catch (err) {
      if (i === tries - 1) throw err;
      await sleep(1500 * (i + 1));
    }
  }
  throw new Error("unreachable");
}

function bbox(city, scale = 1) {
  // Wider than the walking radius on purpose: in Turkey the sights are often
  // outside the province seat (Nevşehir -> Göreme, Karaman -> Başyayla).
  // The cap keeps a dense city from asking Overpass for a whole metro area,
  // which reliably times out.
  const dLat = Math.min(city.radius * scale, 0.2);
  const dLon = Math.min(city.radius * scale * 1.25, 0.27);
  return [city.lat - dLat, city.lon - dLon, city.lat + dLat, city.lon + dLon]
    .map((n) => n.toFixed(4))
    .join(",");
}

// Ordered by measured reliability: the main instance answers small filtered
// queries in about a second, the rest only come into play when it is saturated.
const OVERPASS_HOSTS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

// Nominatim below guarantees every city gets usable data, so this stays
// bounded, but wide enough to ride out a saturated mirror.
async function overpassFetch(query, offset = 0, tries = 3) {
  let lastErr;
  let empty = 0;
  for (let i = 0; i < tries; i++) {
    const host = OVERPASS_HOSTS[(offset + i) % OVERPASS_HOSTS.length];
    try {
      const res = await fetch(host, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": UA,
        },
        body: "data=" + encodeURIComponent(query),
        signal: AbortSignal.timeout(45000),
      });
      if (res.status >= 429 && res.status < 600) {
        lastErr = new Error(`${host} -> HTTP ${res.status}`);
        await sleep(2000 * (i + 1));
        continue;
      }
      if (!res.ok) throw new Error(`${host} -> HTTP ${res.status}`);
      const json = await res.json();
      if (!Array.isArray(json.elements)) throw new Error(`${host} -> bad payload`);
      // A busy or misconfigured mirror answers 200 with nothing in it. Try
      // another instance before believing that a city really has no sights.
      if (!json.elements.length) {
        empty++;
        lastErr = new Error(`${host} -> 0 sonuc`);
        if (empty < tries) continue;
      }
      return json;
    } catch (err) {
      lastErr = err;
      await sleep(2000 * (i + 1));
    }
  }
  throw lastErr ?? new Error("overpass failed");
}

// Public Overpass instances are flaky and time out on wide queries, so each
// tag family goes out as its own small, value-filtered request.
const HISTORIC =
  "^(castle|fort|archaeological_site|ruins|memorial|monument|mosque|church|tomb|monastery|necropolis|citywalls|tower|bridge|caravanserai|ruin)$";
const QUERY_SETS = [
  {
    scale: 1,
    q: (b) => `[out:json][timeout:45];(node["tourism"~"^(attraction|museum|viewpoint|gallery|artwork|theme_park)$"](${b});way["tourism"~"^(attraction|museum|viewpoint|gallery|artwork|theme_park)$"](${b}););out center tags;`,
  },
  {
    scale: 1,
    q: (b) => `[out:json][timeout:45];(node["historic"~"${HISTORIC}"](${b});way["historic"~"${HISTORIC}"](${b}););out center tags;`,
  },
  {
    scale: 0.7,
    q: (b) => `[out:json][timeout:45];(node["leisure"~"^(park|garden|nature_reserve)$"](${b});way["leisure"~"^(park|garden|nature_reserve)$"](${b}););out center tags;`,
  },
  {
    scale: 0.5,
    q: (b) => `[out:json][timeout:45];(node["amenity"="marketplace"](${b});way["amenity"="marketplace"](${b});node["shop"~"^(bakery|confectionery|deli|cheese)$"](${b}););out center tags;`,
  },
  {
    scale: 0.35,
    q: (b) => `[out:json][timeout:45];(node["amenity"~"^(restaurant|cafe|fast_food)$"](${b});way["amenity"~"^(restaurant|cafe|fast_food)$"](${b}););out center tags;`,
  },
];

// Nominatim resolves these words against the OSM name-suggestions index, so a
// handful of Turkish queries is enough to reach places Overpass missed. It is
// far more reliable than the public Overpass mirrors, so it also acts as the
// safety net: a city never ends up empty.
const NOMINATIM_TERMS = [
  { term: "müze" },
  { term: "kale hisar" },
  { term: "cami camii" },
  { term: "manzara" },
  { term: "pazar çarşı" },
  { term: "park bahçe" },
  { term: "restaurant" },
  { term: "kilise höyük" },
  { term: "kervansaray medrese" },
  { term: "hamam" },
  { term: "türbe mezar" },
  { term: "köprü" },
];

const KEEP_NOMINATIM = new Set([
  "tourism",
  "historic",
  "leisure",
  "natural",
  "man_made",
  "building",
  "amenity",
  "shop",
]);

async function nominatimQuery(q) {
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=50" +
    "&addressdetails=1&extratags=1&namedetails=1&accept-language=tr&q=" +
    encodeURIComponent(q);
  const res = await fetchRetry(
    url,
    { headers: { "Accept-Language": "tr" } },
    2,
    25000,
  );
  const json = await res.json();
  await sleep(1100); // usage policy: at most one request per second
  return json;
}

// Nominatim ranks free-text matches by textual relevance, not proximity: asking
// for "Iğdır cami camii" happily returns mosques 800 km away in Adana. Distance
// is the only trustworthy filter here, so it is applied while collecting.
async function nominatimElements(city, deadline = Infinity, reachKm = Infinity) {
  const out = [];
  const seen = new Set();
  for (const { term } of NOMINATIM_TERMS) {
    if (Date.now() > deadline) {
      console.log("  (nominatim suresi doldu, kalan terimler atlandi)");
      break;
    }
    let rows = [];
    try {
      rows = await cached(`nom-${city.slug}-${term.replace(/\s+/g, "_")}.json`, () =>
        nominatimQuery(`${city.name} ${term}`),
      );
    } catch {
      console.warn(`  ! ${city.slug}/${term}: okunamadi`);
      continue;
    }
    for (const r of rows) {
      const cat = r.category;
      // Skip administrative areas, streets and settlements.
      if (!KEEP_NOMINATIM.has(cat)) continue;
      if (r.addresstype === "boundary" || r.type === "boundary") continue;
      // Places that carry no sightseeing value on their own.
      if (["town", "village", "hamlet", "suburb", "neighbourhood", "city"].includes(r.type)) {
        continue;
      }
      if (["parking", "bench", "waste_basket", "toilets", "fuel", "bank", "pharmacy"].includes(r.type)) {
        continue;
      }
      const name = fixName(
        r.namedetails?.name || r.name || r.display_name.split(",")[0],
      );
      if (!name || name.length < 3) continue;
      const lat = Number(r.lat);
      const lon = Number(r.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (haversine(city, { lat, lon }) > reachKm) continue;
      const key = `${r.osm_type}/${r.osm_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const tags = { ...(r.extratags || {}) };
      if (!tags.tourism && cat === "tourism") tags.tourism = r.type;
      if (!tags.historic && cat === "historic") tags.historic = r.type;
      if (!tags.leisure && cat === "leisure") tags.leisure = r.type;
      if (!tags.natural && cat === "natural") tags.natural = r.type;
      if (!tags.amenity && cat === "amenity") tags.amenity = r.type;
      if (!tags.shop && cat === "shop") tags.shop = r.type;
      out.push({
        type: r.osm_type,
        id: r.osm_id,
        lat,
        lon,
        center: null,
        tags: {
          ...tags,
          name,
          "name:tr": name,
          wikidata: r.extratags?.wikidata || null,
          wikipedia: r.extratags?.wikipedia || null,
          description: r.extratags?.description || null,
          "addr:district": r.address?.suburb || r.address?.town || null,
        },
      });
    }
    if (process.env.DEBUG_FUNNEL) {
      console.warn(`  [nom] ${city.slug}/${term}: ${rows.length} satir -> ${out.length}`);
    }
  }
  return out;
}

// Turkish labels and descriptions keep their diacritics, and JS \b only knows
// about ASCII, so every rule below runs against an ASCII fold of the text.
const ascii = (s) =>
  s
    .replace(/ı/g, "i").replace(/İ/g, "I").replace(/ş/g, "s").replace(/Ş/g, "S")
    .replace(/ğ/g, "g").replace(/Ğ/g, "G").replace(/ü/g, "u").replace(/Ü/g, "U")
    .replace(/ö/g, "o").replace(/Ö/g, "O").replace(/ç/g, "c").replace(/Ç/g, "C")
    .toLowerCase();

// Something the visitor can stand in front of...
const WD_SIGHT =
  /\bmuze|kale|kilise|cami|mescit|medrese|turbe|anit|oren|harabe|sarn|kervansaray|hamam|bedesten|saray|kumbet|hoyuk|manast|sinagog|havra|\bburc\b|\bkule\b|tekke|\bhan\b|kopru|magara|carsi|selale|mesire|piknik|anitevi/i;
// ...and not a settlement, a landform or a piece of civic furniture. Wikidata
// descriptions are explicit about these ("Türkiye'de dağ", "Şırnak ilinin
// merkezi olan şehir"), so they are dropped on sight.
const WD_SKIP =
  /\bkoy|beldesi|ilcesi|ilinin|belediye|mahalle|istasyon|niversitesi|\blise\b|\bokul\b|stadyum|kulup|secim|parti|deresi|nehir|\bdagi\b|\btepe\b|\bdag\b|\bvadi\b|baraj|nufus|yuzolcumu|hastane|karakol|hukumet|kurumu|dernegi|hazire/i;

// The description doubles as the category: "Hakkari merkezde medrese, müze"
// says what the label alone cannot, and it is what themeFor/priorityFor read.
function wdTags(label, desc) {
  const t = ascii(`${label} ${desc}`);
  if (/\bmuze/.test(t)) return { tourism: "museum" };
  if (/cami|mescit/.test(t)) return { amenity: "place_of_worship" };
  if (/kilise|manast/.test(t)) return { historic: "church" };
  if (/kale|hisar/.test(t)) return { historic: "castle" };
  if (/turbe|kumbet/.test(t)) return { historic: "tomb" };
  if (/selale|mesire|piknik/.test(t)) return { tourism: "viewpoint" };
  if (/kopru|hamam|medrese|\bhan\b|kervansaray|sarn|oren|harabe|anit|burc|bedesten|carsi|hoyuk|sinagog|havra|saray|kule|tekke/.test(t)) {
    return { historic: "monument" };
  }
  return {};
}

// Overpass only sees what somebody bothered to tag, which leaves the museums
// and castles of thinly mapped towns invisible. Wikidata is queried by radius
// instead of by tag, so it finds them whether or not OSM ever heard of them.
async function wikidataElements(city, reachKm) {
  let rows;
  try {
    rows = await cached(`wdloc-${city.slug}.json`, async () => {
      const query =
        "SELECT ?item ?itemLabel ?coord ?desc WHERE {\n" +
        "  SERVICE wikibase:around {\n" +
        `    ?item wdt:P625 ?coord.\n` +
        `    bd:serviceParam wikibase:center "Point(${city.lon} ${city.lat})"^^geo:wktLiteral.\n` +
        `    bd:serviceParam wikibase:radius "${reachKm.toFixed(1)}".\n` +
        "  }\n" +
        '  ?item rdfs:label ?itemLabel. FILTER(LANG(?itemLabel) = "tr")\n' +
        '  OPTIONAL { ?item schema:description ?desc. FILTER(LANG(?desc) = "tr") }\n' +
        "} LIMIT 400";
      const url =
        "https://query.wikidata.org/sparql?format=json&query=" +
        encodeURIComponent(query);
      const res = await fetchRetry(
        url,
        { headers: { Accept: "application/sparql-results+json" } },
        2,
        45000,
      );
      const json = await res.json();
      return json.results.bindings;
    });
  } catch (err) {
    return { elements: [], problems: [`wikidata: ${err.message}`] };
  }

  const out = [];
  const seen = new Set();
  let noDesc = 0;
  let skipped = 0;
  for (const r of rows) {
    const m = String(r.coord.value).match(/Point\(([-\d.]+) ([-\d.]+)\)/);
    if (!m) continue;
    const lat = Number(m[2]);
    const lon = Number(m[1]);
    if (haversine(city, { lat, lon }) > reachKm) continue;
    const name = fixName(r.itemLabel.value);
    const desc = r.desc?.value || "";
    // Without a description there is no way to tell a monument from an event
    // that merely happened at these coordinates ("Şırnak Çatışması").
    if (!desc) {
      noDesc++;
      continue;
    }
    const text = ascii(`${name} ${desc}`);
    if (WD_SKIP.test(text) || !WD_SIGHT.test(text)) {
      skipped++;
      continue;
    }
    const qid = r.item.value.split("/").pop();
    if (seen.has(qid)) continue;
    seen.add(qid);
    out.push({
      type: "wikidata",
      id: `wd/${qid}`,
      lat,
      lon,
      center: null,
      tags: {
        ...wdTags(name, desc),
        name,
        "name:tr": name,
        wikidata: qid,
        description: desc,
      },
    });
  }
  const problems = [];
  if (process.env.DEBUG_FUNNEL && (noDesc || skipped)) {
    problems.push(`wikidata: aciklama yok=${noDesc} atlandi=${skipped} tutan=${out.length}`);
  }
  return { elements: out, problems };
}

async function overpass(city, index) {
  const set = QUERY_SETS[index];
  const b = bbox(city, set.scale);
  return cached(`osm-${city.slug}-${index}.json`, () =>
    // Each query starts on a different mirror so the whole set fans out.
    overpassFetch(set.q(b), index),
  );
}

// One request per query set, all fired at once against separate mirrors.
// Overpass throttles per client IP, so whatever is still missing afterwards is
// retried one at a time: serial requests are the only reliable ones.
async function overpassAll(city, reachKm) {
  const [osmSets, nominatim] = await Promise.allSettled([
    Promise.allSettled(QUERY_SETS.map((_, i) => overpass(city, i))),
    nominatimElements(city, Date.now() + 150000, reachKm),
  ]);

  const elements = [];
  const problems = [];
  const missing = [];
  osmSets.value.forEach((r, i) => {
    if (r.status === "fulfilled") {
      elements.push(...r.value.elements);
    } else {
      problems.push(`osm${i}: ${r.reason.message}`);
      missing.push(i);
    }
  });
  if (nominatim.status === "fulfilled") elements.push(...nominatim.value);
  else problems.push(`nom: ${nominatim.reason.message}`);

  for (const i of missing) {
    try {
      const retry = await overpass(city, i);
      elements.push(...retry.elements);
      problems.splice(problems.indexOf(problems.find((p) => p.startsWith(`osm${i}:`))), 1);
    } catch (err) {
      problems[problems.findIndex((p) => p.startsWith(`osm${i}:`))] =
        `osm${i}: ${err.message}`;
    }
  }

  return { elements, problems };
}

/** OSM occasionally carries Romanian comma-below instead of Turkish s/t. */
function fixName(name) {
  return name
    .replace(/\u0219/g, "\u015f")
    .replace(/\u0218/g, "t")
    .replace(/\u021B/g, "\u015e")
    .replace(/\u021A/g, "T")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(elements) {
  const out = [];
  for (const el of elements) {
    const tags = el.tags || {};
    const name = tags["name:tr"] || tags.name;
    if (!name) continue;
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    out.push({
      id: `${el.type}/${el.id}`,
      name: fixName(name),
      lat,
      lon: lon,
      tourism: tags.tourism || null,
      historic: tags.historic || null,
      leisure: tags.leisure || null,
      amenity: tags.amenity || null,
      shop: tags.shop || null,
      wikidata: tags.wikidata || null,
      wiki: tags.wikipedia || null,
      district:
        tags["addr:district"] || tags["addr:subdistrict"] || tags["addr:city"] || null,
      description: tags.description || tags["description:tr"] || null,
    });
  }
  return out;
}

async function sparql(q, key) {
  return cached(key, async () => {
    const url =
      "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q);
    const res = await fetchRetry(
      url,
      { headers: { Accept: "application/sparql-results+json" } },
      2,
      30000,
    );
    const json = await res.json();
    const rows = {};
    for (const b of json.results.bindings) {
      const id = b.item.value.split("/").pop();
      rows[id] = {
        label: b.label?.value || null,
        desc: b.description?.value || null,
        image: b.image ? decodeURIComponent(b.image.value.split("/Special:FilePath/")[1]) : null,
        heritage: b.heritageLabel?.value || null,
        types: b.typeLabel ? b.typeLabel.value.split(", ").map((s) => s.toLowerCase()) : [],
        articles: b.articles ? Number(b.articles.value) : 0,
      };
    }
    return rows;
  });
}

async function enrich(qids, prefix) {
  const ids = [...new Set(qids)].filter(Boolean);
  const map = {};
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    const q = `SELECT ?item ?label ?description ?image ?heritageLabel ?typeLabel (COUNT(DISTINCT ?article) AS ?articles)
WHERE {
  VALUES ?item { ${chunk.map((x) => `wd:${x}`).join(" ")} }
  OPTIONAL { ?item rdfs:label ?label. FILTER(LANG(?label) = "tr") }
  OPTIONAL { ?item schema:description ?description. FILTER(LANG(?description) = "tr") }
  OPTIONAL { ?item wdt:P18 ?image. }
  OPTIONAL { ?item wdt:P1435 ?heritage. ?heritage rdfs:label ?heritageLabel. FILTER(LANG(?heritageLabel) = "en") }
  OPTIONAL { ?item wdt:P31 ?type. ?type rdfs:label ?typeLabel. FILTER(LANG(?typeLabel) = "en") }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://tr.wikipedia.org/> . }
}
GROUP BY ?item ?label ?description ?image ?heritageLabel ?typeLabel`;
    Object.assign(map, await sparql(q, `wde-${prefix}-${digest(chunk.join(" "))}.json`));
    process.stdout.write(`\r  wikidata ${Math.min(i + 40, ids.length)}/${ids.length}`);
  }
  return map;
}

async function commonsThumbs(filenames) {
  const names = [...new Set(filenames)].filter(Boolean);
  const out = {};
  for (let i = 0; i < names.length; i += 40) {
    const chunk = names.slice(i, i + 40);
    const url =
      "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo" +
      "&iiprop=url&iiurlwidth=640&titles=" +
      encodeURIComponent(chunk.map((n) => `File:${n}`).join("|"));
    const res = await fetchRetry(url, {}, 3, 20000);
    const json = await res.json();
    for (const page of Object.values(json.query?.pages || {})) {
      const info = page.imageinfo?.[0];
      if (!info) continue;
      const title = page.title.replace(/^File:/, "");
      // Drop the analytics query string Wikimedia appends to thumbnails.
      const url = (info.thumburl || info.url).split("?")[0];
      out[title] = url;
    }
    process.stdout.write(`\r  commons ${Math.min(i + 40, names.length)}/${names.length}`);
    await sleep(120);
  }
  return out;
}

async function reverseGeocode(lat, lon) {
  return cached(`geo-${lat.toFixed(3)}-${lon.toFixed(3)}.json`, async () => {
    try {
      const res = await fetchRetry(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=12&addressdetails=1`,
        {},
        2,
        15000,
      );
      const j = await res.json();
      const a = j.address || {};
      const raw = a.suburb || a.town || a.village || a.neighbourhood || null;
      // Nominatim returns "Göreme Beldesi", "Derinkuyu İlçe Merkezi" -> "Göreme"
      return raw
        ? raw
            .split("/")[0]
            .replace(/\s+(İlçe\s+)?Merkezi$/i, "")
            .replace(/\s+(Beldesi|İlçesi|Köyü|Belde|İlçe|Kasabası)$/i, "")
            .trim()
        : null;
    } catch {
      return null;
    }
  });
}

async function cityCard(city) {
  const title = encodeURIComponent(city.name);
  return cached(`wiki-${city.slug}.json`, async () => {
    try {
      const res = await fetchRetry(
        `https://tr.wikipedia.org/api/rest_v1/page/summary/${title}`,
        { headers: { Accept: "application/json" } },
      );
      const j = await res.json();
      return {
        summary: j.extract || null,
        photo: resizeWikimedia(j.thumbnail?.source || j.originalimage?.source || null),
      };
    } catch {
      return { summary: null, photo: null };
    }
  });
}

/** Wikipedia returns giant originals plus tracking params; make it a sane 1024px thumbnail. */
function resizeWikimedia(url) {
  if (!url) return null;
  const clean = url.split("?")[0];
  return clean.replace(/\/\d+px-/, "/1024px-");
}

// Nominatim only tells us the broad category, so the name is the tie breaker:
// "Bitlis Kalesi" arrives as category=man_made with no historic= tag at all.
const NAME_THEME = [
  ["muze", /\bm[uü]ze|museum|boyutma|resim|galeri|sergi/i],
  ["lezzet", /\bpazar|çarşı|çarş[iı]|bazaar|market|restaurant|lokanta|kahve|börek|lahmacun|döner|çay\s?ocak\b/i],
  ["manzara", /manzara|seyir|platform|vadi|koy|belde|bahçe\s?üstü|piknik/i],
  ["tarih", /kale|hisar|sur\b|burç|kervansaray|han\b|medrese|cami|camii|mescit|kilise|havra|sinagog|türbe|mezarlık|höyük|kümbet|köprü|çeşme|hamam|saray|köşk|çiftlik|oda\b|kale\s?içi|antik|ören|beşik/i],
];

function themeFor(poi, wd) {
  const t = poi.tourism;
  const h = poi.historic;
  const l = poi.leisure;
  const a = poi.amenity;
  const types = wd?.types || [];

  if (a === "marketplace" || poi.shop || ["restaurant", "cafe", "fast_food"].includes(a)) {
    return "lezzet";
  }
  if (t === "museum" || t === "gallery" || types.includes("museum")) return "muze";
  if (t === "viewpoint" || types.includes("viewpoint")) return "manzara";
  if (l === "nature_reserve" || /nature reserve|national park/.test(types.join(" "))) {
    return "doga";
  }
  if (["park", "garden"].includes(l)) return "doga";
  if (t === "artwork") return "muze";
  if (t === "theme_park") return "doga";
  if (h || wd?.heritage || /mosque/.test(types.join(" "))) return "tarih";
  if (a === "place_of_worship") return "tarih";
  for (const [theme, pattern] of NAME_THEME) {
    if (pattern.test(poi.name)) return theme;
  }
  if (t === "attraction") return "genel";
  return "genel";
}

function durationFor(poi, theme) {
  if (theme === "lezzet") return 60;
  if (theme === "muze") return 90;
  if (theme === "doga") return 75;
  if (theme === "manzara") return 35;
  if (poi.historic) return 50;
  return 45;
}

function indoorFor(poi, theme) {
  if (theme === "muze" || theme === "lezzet") return true;
  if (poi.tourism === "gallery") return true;
  if (/mosque|church|monastery|tomb/.test(poi.historic || "")) return true;
  // Nominatim-sourced results carry no historic value, so fall back to the name.
  if (/cami|camii|mescit|kilise|havra|sinagog|müze|museum|medrese|hamam/i.test(poi.name)) {
    return true;
  }
  return false;
}

function priorityFor(poi, wd, distanceKm) {
  // Baseline: any named, tagged place is worth showing.
  let s = 20;

  const t = poi.tourism;
  if (t === "attraction") s += 22;
  else if (t === "museum") s += 20;
  else if (t === "viewpoint") s += 14;
  else if (t === "gallery") s += 12;
  else if (t === "artwork") s += 8;
  else if (t === "theme_park") s += 14;

  if (poi.historic) s += 18;
  if (poi.amenity === "marketplace") s += 14;
  if (poi.leisure === "nature_reserve") s += 18;
  else if (poi.leisure === "park") s += 6;
  else if (poi.leisure === "garden") s += 9;

  s += Math.min(25, (wd?.articles || 0) * 5);
  if (wd?.image) s += 8;
  if (wd?.heritage) s += 30;
  if (wd?.types?.includes("mosque")) s += 10;
  if (poi.description) s += 4;
  if (poi.name.length > 14) s += 3;

  // It is a walking tour: what sits far from the centre ranks lower.
  s -= Math.min(30, distanceKm * 1.6);

  return Math.max(1, Math.min(100, Math.round(s)));
}

const haversine = (a, b) => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

async function main() {
  const only = process.argv.slice(2);
  const targets = only.length ? CITIES.filter((c) => only.includes(c.slug)) : CITIES;
  await mkdir(OUT, { recursive: true });
  await mkdir(CACHE, { recursive: true });

  const cities = [];
  const pois = {};
  const failed = [];

  const cityFile = path.join(OUT, "cities.json");
  const poiFile = path.join(OUT, "pois.json");

  // Merge into whatever is already on disk and flush after every city, so a
  // long run never loses hours of work if it dies half way.
  const persist = async () => {
    const known = new Set(CITIES.map((c) => c.slug));
    const prev = existsSync(cityFile) ? await readJson(cityFile) : [];
    const byslug = new Map(
      // Drop entries for cities that are no longer in cities.mjs (renamed slugs).
      prev.filter((c) => known.has(c.slug)).map((c) => [c.slug, c]),
    );
    for (const c of cities) byslug.set(c.slug, c);
    const all = [...byslug.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "tr"),
    );
    const allPois = existsSync(poiFile) ? await readJson(poiFile) : {};
    for (const slug of Object.keys(allPois)) {
      if (!known.has(slug)) delete allPois[slug];
    }
    Object.assign(allPois, pois);
    await writeFile(cityFile, JSON.stringify(all, null, 0));
    await writeFile(poiFile, JSON.stringify(allPois, null, 0));
    return all;
  };

  for (const [index, city] of targets.entries()) {
    process.stdout.write(`\n[${index + 1}/${targets.length}] ${city.name}\n`);

    try {
      const reach = Math.min(city.radius, 0.2) * 111 * 1.7;
      // The Wikipedia card, the OSM extracts and Wikidata are independent, so
      // they are overlapped.
      const [card, osm, wds] = await Promise.all([
        cityCard(city),
        overpassAll(city, reach),
        wikidataElements(city, reach),
      ]);
      const { elements, problems } = osm;
      const allProblems = [...problems, ...wds.problems];
      if (allProblems.length) console.warn(`  ! atlanan sorgu ${allProblems.join(" | ")}`);

      const merged = new Map();
      let tooFar = 0;
      for (const p of normalize(elements)) {
        if (haversine(city, p) > reach) {
          tooFar++;
          continue;
        }
        if (!merged.has(p.id)) merged.set(p.id, p);
      }
      const osmQids = new Set(
        [...merged.values()].map((p) => p.wikidata).filter(Boolean),
      );
      let fromWikidata = 0;
      for (const p of normalize(wds.elements)) {
        if (osmQids.has(p.wikidata)) continue;
        if (haversine(city, p) > reach) {
          tooFar++;
          continue;
        }
        if (!merged.has(p.id)) {
          merged.set(p.id, p);
          fromWikidata++;
        }
      }
      if (process.env.DEBUG_FUNNEL) {
        console.warn(
          `  [reach] ${city.name}: osm=${normalize(elements).length} ` +
            `wikidata=${fromWikidata} cokUzak=${tooFar} kabul=${merged.size} ` +
            `reach=${reach.toFixed(1)}km`,
        );
      }

      const wd = await enrich(merged.values().map((p) => p.wikidata), city.slug);

      if (merged.size < 20) {
        console.warn(
          `  ! ${city.name}: az veri (${elements.length} element, ` +
            `${merged.size} kabul, ${tooFar} disarida, yaricap ${reach.toFixed(0)}km)`,
        );
      }

      const items = [...merged.values()].map((p) => {
        const w = p.wikidata ? wd[p.wikidata] : null;
        const theme = themeFor(p, w);
        const distanceKm = haversine(city, p);
        return {
          id: p.id,
          name: p.name,
          lat: +p.lat.toFixed(6),
          lon: +p.lon.toFixed(6),
          theme,
          indoor: indoorFor(p, theme),
          duration: durationFor(p, theme),
          priority: priorityFor(p, w, distanceKm),
          district: p.district || null,
          distanceKm: +distanceKm.toFixed(1),
          image: w?.image || null,
          heritage: w?.heritage || null,
          description: p.description || w?.desc || null,
        };
      });

      items.sort((a, b) => b.priority - a.priority);
      if (process.env.DEBUG_FUNNEL) {
        const hist = {};
        for (const i of items) hist[i.theme] = (hist[i.theme] || 0) + 1;
        console.warn(
          `  [funnel] ${city.name}: merged=${merged.size} items=${items.length} ` +
            `maxPrio=${items[0]?.priority ?? "-"} themes=${JSON.stringify(hist)}`,
        );
      }

      // The same place is often mapped twice: once as a node, once as a way,
      // and sometimes under a slightly different name ("Arasta- Kapalı Çarşı").
      // Wikidata and OSM disagree about names outright ("Nesturi Koçanis
      // Kilisesi" vs "The Patriarchal Church of Qudshanis"), so the two are
      // also merged by position: 50 m puts the mirrored duplicates together
      // while leaving the Kilim and Travma museums 68 m apart.
      const samePlace = (a, b, distanceKm) => {
        if (distanceKm < 0.05) return true;
        if (a === b) return true;
        const shorter = a.length < b.length ? a : b;
        const longer = a.length < b.length ? b : a;
        return shorter.length >= 6 && longer.includes(shorter);
      };
      const deduped = [];
      for (const item of items) {
        const twin = deduped.find((d) => {
          const km = haversine(d, item);
          return km < 0.4 && samePlace(d.name, item.name, km);
        });
        if (!twin) deduped.push(item);
      }

      // Parks are numerous and repetitive, so cap them to leave room for
      // the actual sights the visitor came for.
      const THEME_CAP = { doga: 35, genel: 20, lezzet: 25 };
      const used = {};
      const kept = [];
      for (const item of deduped) {
        if (item.priority < 15) break;
        const cap = THEME_CAP[item.theme];
        if (cap && (used[item.theme] || 0) >= cap) continue;
        used[item.theme] = (used[item.theme] || 0) + 1;
        kept.push(item);
        if (kept.length >= 150) break;
      }

      const thumbs = await commonsThumbs(kept.map((p) => p.image).filter(Boolean));
      for (const p of kept) if (p.image) p.image = thumbs[p.image] || null;
      for (const p of kept) if (!p.image) delete p.image;
      for (const p of kept) if (!p.description) delete p.description;
      for (const p of kept) if (!p.heritage) delete p.heritage;

      // Label the surroundings (Ürgüp, Göreme, Kaleiçi...) for the top stops only.
      // Nominatim is the flakiest endpoint here, so the whole pass is capped:
      // district labels are a nicety, never a reason to stall the run.
      const geoDeadline = Date.now() + 45000;
      let geocoded = 0;
      for (const p of kept.slice(0, 8)) {
        if (p.district) continue;
        if (Date.now() > geoDeadline) {
          console.log("  (ilce etiketi icin sure doldu, atlandi)");
          break;
        }
        p.district = await reverseGeocode(p.lat, p.lon);
        geocoded++;
        process.stdout.write(
          `\r  ilce ${geocoded}/8 (${p.name.slice(0, 22).padEnd(22)})        `,
        );
        await sleep(1100);
      }
      process.stdout.write("\r".padEnd(60) + "\r");
      const cityName = city.name.toLocaleLowerCase("tr");
      for (const p of kept) {
        if (p.district && p.district.toLocaleLowerCase("tr") === cityName) {
          delete p.district;
        }
      }

      pois[city.slug] = kept;
      const highlight =
        kept.find((p) => p.image && p.distanceKm <= 35)?.name || kept[0]?.name || null;

      cities.push({
        slug: city.slug,
        name: city.name,
        plate: city.plate,
        region: city.region,
        lat: city.lat,
        lon: city.lon,
        summary: card.summary,
        photo: card.photo,
        highlight,
        poiCount: kept.length,
        districts: [...new Set(kept.map((p) => p.district).filter(Boolean))].slice(0, 12),
        themes: [...new Set(kept.map((p) => p.theme))],
      });

      console.log(`  -> ${kept.length} poi, photo: ${card.photo ? "var" : "yok"}`);
    } catch (err) {
      failed.push(city.slug);
      console.warn(`  !! ${city.name} atlandi: ${err.message}`);
    }

    const done = await persist();
    console.log(
      `  kaydedildi (${done.length} il, ${Math.round(((index + 1) / targets.length) * 100)}%)`,
    );
    await sleep(200);
  }

  const all = await persist();
  console.log(`\nTamam. ${all.length} şehir -> ${path.relative(ROOT, cityFile)}`);
  if (failed.length) {
    console.log(`Atlananlar (tekrar dene): ${failed.join(", ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});