// Matching rules for finding a photo of a POI, shared by fill-images.mjs and
// its tests.
//
// The pipeline that produced pois.json takes images only from OSM's `wikidata`
// tag, and just 3% of Turkish POIs have one - which is why 92% of the app's
// 6078 places are photo-free. This module finds images a second way: search
// Wikidata for the POI's own name, then trust the match only when the item's
// coordinates sit on the POI *and* its label describes the same thing.
//
// Both checks are needed. Filename matching against Commons was tried first and
// produced wrong photos in roughly a third of cases - "Fatma Hatun Türbesi"
// drew a photo of a different türbe, "Bay Kalesi" drew a castle in Ireland.
// Proximity alone is not enough either: the item for the town of Burdur sits
// 197m from "Burdur Kent Belleği Evi".

export const UA = "RotaApp/1.0 (https://github.com/omfarat/rota-app)";
export const RADIUS_M = 200;
export const LABEL_SCORE_MIN = 0.5;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Every Wikimedia request passes through one gate that spaces calls apart.
 *
 * Several workers firing in parallel draw HTTP 429, and a run that has to retry
 * a third of its lookups is slower than a steady one that does not. One queued
 * request every 120ms is ~8/s, well inside what the API will serve.
 */
const MIN_GAP_MS = 120;
let gate = Promise.resolve();
let nextAt = 0;

export async function apiJson(url, headers = {}) {
  const run = gate.then(async () => {
    const wait = nextAt - Date.now();
    if (wait > 0) await sleep(wait);
    nextAt = Date.now() + MIN_GAP_MS;

    let lastError;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt) await sleep(1500 * attempt);
      try {
        const res = await fetch(url, { headers: { ...headers, "User-Agent": UA } });
        if (res.status === 429 || res.status >= 500) {
          lastError = new Error(`HTTP ${res.status}`);
          nextAt = Date.now() + 5000 * (attempt + 1);
          continue;
        }
        // A 4xx other than 429 is the URL's fault, not the server's mood;
        // retrying it would only spread the delay.
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (e) {
        lastError = e;
        if (String(e.message).startsWith("HTTP 4")) throw e;
      }
    }
    throw lastError ?? new Error("istek basarisiz");
  });
  gate = run.catch(() => {});
  return run;
}

const DIACRITICS = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };

export const strip = (s) =>
  s
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (c) => DIACRITICS[c])
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Whether a Wikidata label describes the POI: the share of the POI's words the
 * label matches, needing at least two (or an exact single-word match).
 *
 * Suffix tolerance is required because Turkish compounds make equal referents
 * unequal by a letter - the label "Dicle Köprüsü" has to match the name's
 * "Köprü" - but one shared word is not enough on its own, or "Burdur" would
 * describe "Burdur Kent Belleği Evi".
 */
export function labelRelevance(label, name) {
  const words = (s) => strip(s).split(" ").filter((w) => w.length >= 2);
  const lt = words(label);
  const nt = words(name);
  if (!lt.length || !nt.length) return 0;

  const matches = (a, b) =>
    a === b || (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a)));

  const hits = nt.filter((n) => lt.some((l) => matches(l, n)));
  if (hits.length >= 2) return hits.length / nt.length;
  if (hits.length === 1 && lt.length === 1 && nt.length === 1) return 1;
  return 0;
}

const TYPE_WORDS = [
  "türbesi", "turbesi", "camii", "cami", "külliyesi", "kulesi", "anıtı", "aniti",
  "müzesi", "muzesi", "kilisesi", "köprüsü", "koprusu", "kalesi", "medresesi",
  "hanı", "hani", "hamamı", "hamami", "çarşısı", "carsisi", "kapısı", "kapisi",
  "parkı", "parki", "heykeli", "tepe", "höyüğü", "hoyugu", "bedesteni",
];

/**
 * Search strings from most to least specific.
 *
 * wbsearchentities requires every word to match, so an OSM name usually finds
 * nothing: "Büyük Saat Kulesi" returns zero rows while "Büyük Saat" is the
 * clock tower in Seyhan. The type word has to go first, then the words drop
 * away until something matches.
 */
export function wikidataTerms(name) {
  const words = name.split(" ").filter(Boolean);
  const typed = words.filter((w) => !TYPE_WORDS.includes(w.toLocaleLowerCase("tr")));
  const out = [];
  const push = (ws) => {
    const s = ws.join(" ").trim();
    if (s.length >= 4 && !out.includes(s)) out.push(s);
  };
  push(typed);
  push(words);
  push(typed.slice(0, 2));
  push(words.slice(0, 2));
  push(typed.slice(0, 1));
  return out.slice(0, 5);
}

export function distanceM(lat1, lon1, lat2, lon2) {
  return Math.hypot(
    (lat1 - lat2) * 111000,
    (lon1 - lon2) * 111000 * Math.cos((lat1 * Math.PI) / 180),
  );
}

/** How far a candidate is from the POI and how well its label fits.
 *  `fit`, not `label` - the candidate already carries its label as text. */
export function scoreCandidate(candidate, poi) {
  const dist = distanceM(candidate.lat, candidate.lon, poi.lat, poi.lon);
  const fit = labelRelevance(candidate.label, poi.name);
  return { ...candidate, dist, fit, ok: dist <= RADIUS_M && fit >= LABEL_SCORE_MIN };
}

/**
 * The Commons file name of a photo for `poi`, or null.
 *
 * Searches Wikidata for the POI's own name - tr first, en only when tr never
 * produced a usable candidate - and returns the first item that is both within
 * RADIUS_M of the POI and labelled like it.
 *
 * A candidate costs two requests, so the label is checked on the search
 * response before `wbgetentities` runs. Nine in ten search results are
 * unrelated items, and paying the second request for each of those would
 * roughly double the cost of a miss, which is the common case at 90% of POIs.
 */
export async function findImage(poi) {
  const seen = new Set();
  let best = null;
  let triedEntity = false;

  for (const language of ["tr", "en"]) {
    for (const term of wikidataTerms(poi.name)) {
      const hits = await wikidataSearch(term, language);
      const promising = hits.filter((h) => labelRelevance(h.label, poi.name) >= LABEL_SCORE_MIN);
      if (!promising.length) continue;
      triedEntity = true;

      for (const entity of await wikidataEntities(promising.map((h) => h.id), seen)) {
        const cand = scoreCandidate(entity, poi);
        if (cand.ok && (!best || cand.dist < best.dist)) best = cand;
      }
      if (best) return best;
    }
    // en repeats whatever tr already returned items for, so a Turkish pass that
    // reached `wbgetentities` has had its chance.
    if (triedEntity) break;
  }
  return null;
}

async function wikidataSearch(term, language) {
  const url =
    "https://www.wikidata.org/w/api.php?" +
    new URLSearchParams({
      action: "wbsearchentities",
      format: "json",
      language,
      uselang: language,
      limit: 8,
      search: term,
    });
  const json = await apiJson(url, { Accept: "application/json" });
  return (json.search || []).map((x) => ({ id: x.id, label: x.label || "" }));
}

/** Items with coordinates and a photo; `seen` keeps one id bought only once. */
async function wikidataEntities(ids, seen) {
  const fresh = ids.filter((id) => !seen.has(id));
  if (!fresh.length) return [];
  for (const id of fresh) seen.add(id);

  const url =
    "https://www.wikidata.org/w/api.php?" +
    new URLSearchParams({
      action: "wbgetentities",
      format: "json",
      ids: fresh.join("|"),
      props: "labels|claims",
    });
  const json = await apiJson(url, { Accept: "application/json" });

  const out = [];
  for (const id of fresh) {
    const entity = json.entities?.[id];
    const label = entity?.labels?.tr?.value || entity?.labels?.en?.value || "";
    const coord = entity?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
    const file = entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!label || !coord || !file) continue;
    out.push({ id, label, file, lat: coord.latitude, lon: coord.longitude });
  }
  return out;
}

/**
 * Resolves Commons file names to image URLs, 40 titles per request.
 *
 * The API answers a width request with a rendition it already has, and with the
 * untouched original when it does not - so a width request can hand back a
 * 900x1600, 1.5MB file. Anything wider than asked for is requested again at a
 * smaller width until it comes back as a real thumbnail.
 *
 * Returns only the names Wikimedia actually served, so a caller can tell a
 * missing photo from a failed request.
 */
export async function commonsThumbs(filenames) {
  const names = [...new Set(filenames)].filter(Boolean);
  const out = {};
  let pending = names;

  // Commons canonicalises titles to spaces while URLs use underscores, so the
  // result is keyed by the caller's own string rather than the title the API
  // echoes back - otherwise half the lookups miss on a spelling difference.
  const norm = (s) => s.replace(/_/g, " ");

  // Wikimedia serves only a fixed set of common widths (120, 250, 500, 960,
  // 1280, 1920) and returns HTTP 400 for anything else, so ask for those.
  for (const width of [960, 500, 250]) {
    if (!pending.length) break;
    const next = [];
    const last = width === 320;

    for (let i = 0; i < pending.length; i += 40) {
      const chunk = pending.slice(i, i + 40);
      const requested = new Map(chunk.map((n) => [norm(n), n]));
      const url =
        "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo" +
        `&iiprop=url|mime|size&iiurlwidth=${width}&titles=` +
        encodeURIComponent(chunk.map((n) => `File:${n}`).join("|"));
      let json;
      try {
        json = await apiJson(url);
      } catch {
        continue; // every title in this chunk is dropped, none silently invented
      }
      for (const page of Object.values(json.query?.pages || {})) {
        const info = page.imageinfo?.[0];
        if (!info || !/^image\/(jpeg|png|webp)$/.test(info.mime)) continue;
        const title = requested.get(norm(page.title.replace(/^File:/, "")));
        if (title === undefined) continue;
        const served = (info.thumburl || info.url).split("?")[0];
        const isThumb = served.includes("/thumb/");
        if (isThumb || last || info.width <= width) out[title] = served;
        else next.push(title); // original came back; try a narrower rendition
      }
    }
    pending = next;
  }
  return out;
}