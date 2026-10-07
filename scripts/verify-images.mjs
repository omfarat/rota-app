// Fetches every image URL the dataset points at, so a dead thumbnail is caught
// before it shows up as a blank card.
//
//   node scripts/verify-images.mjs          # everything not yet proven
//   node scripts/verify-images.mjs --limit 25
//   node scripts/verify-images.mjs --recheck  # ignore the cache
//
// Two passes: a fast concurrent sweep, then rounds that retry whatever the
// sweep did not prove, each round waiting at least as long as the CDN's own
// Retry-After header. The Wikimedia CDN answers 429 to a single client that
// pushes too hard, and a checker that trips the rate limit cannot tell a broken
// image from a throttled one — so the verdict comes from the retries that wait
// it out. Proven answers land in .cache/vimg.json, so an interrupted or banned
// run resumes instead of starting over; a 429 is never cached, because it says
// nothing about the URL.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const argv = process.argv.slice(2);
const limit = Number(argv.find((a) => /^\d+$/.test(a)) ?? Infinity);
const recheck = argv.includes("--recheck");
const CONCURRENCY = 4;
const RETRY_GAP_MS = 1000;
const TIMEOUT_MS = 15000;
const CACHE = ".cache/vimg.json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pois = JSON.parse(readFileSync("src/data/pois.json", "utf8"));
const wanted = [...new Set(Object.values(pois).flat().map((p) => p.image).filter(Boolean))];
const urls = wanted.slice(0, limit);

mkdirSync(".cache", { recursive: true });
const cache = existsSync(CACHE) && !recheck ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
const save = () => writeFileSync(CACHE, JSON.stringify(cache));
let flushed = 0;
function remember(r) {
  if (r.status && r.status !== 429) cache[r.url] = { status: r.status, type: r.type, error: r.error };
  if (++flushed % 50 === 0) save();
}

console.log(
  `gorsel url : ${wanted.length}` +
    `${urls.length !== wanted.length ? ` (ilk ${urls.length})` : ""}` +
    `  onceden kanitlanan: ${urls.filter((u) => cache[u]).length}`,
);

async function once(url) {
  let last = { url, status: 0, type: null, error: "" };
  for (const method of ["HEAD", "GET"]) {
    try {
      const res = await fetch(url, {
        method,
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return { url, status: res.status, type: res.headers.get("content-type"), error: "" };
      last = { url, status: res.status, type: res.headers.get("content-type"), error: "" };
      if (res.status === 429) {
        const hint = Number(res.headers.get("retry-after"));
        if (Number.isFinite(hint) && hint > 0) last.retryAfter = hint;
      }
      // HEAD rejected outright: still worth one GET. Anything else is the
      // URL's own answer, and retrying would only hide it.
      if (res.status !== 405 && res.status !== 501 && res.status !== 429) break;
    } catch (e) {
      last = { url, status: 0, type: null, error: e.message };
    }
  }
  return last;
}

const pending = urls.filter((u) => !cache[u]);
console.log(`sorgulanacak : ${pending.length}`);

const results = {};
for (const u of urls) if (cache[u]) results[u] = cache[u];

let next = 0;
let done = 0;
async function sweep() {
  for (;;) {
    const i = next++;
    if (i >= pending.length) return;
    const r = await once(pending[i]);
    remember(r);
    results[r.url] = r;
    if (++done % 50 === 0) process.stdout.write(`\r  ${done}/${pending.length}`);
  }
}
const startedAt = Date.now();
await Promise.all(Array.from({ length: CONCURRENCY }, sweep));
process.stdout.write(`\r  ${pending.length}/${pending.length}\n`);
console.log(`hizli tarama: ${((Date.now() - startedAt) / 1000).toFixed(1)}sn`);
save();

// The CDN bans for minutes, so waiting it out beats hammering: every round
// retries the whole remainder once, then sits still for a longer pause. Only a
// 429 or a network error is worth another try — a 404 is already the answer.
let failing = Object.values(results).filter((r) => r.status === 429 || r.status === 0);
for (let round = 1; round <= 3 && failing.length; round++) {
  if (round > 1) {
    const hinted = Math.max(0, ...failing.map((r) => (r.retryAfter ?? 0) * 1000));
    const wait = Math.max(60000 * (round - 1), hinted + 5000);
    console.log(`  ${failing.length} url hala 429/toplamasi, ${Math.round(wait / 1000)} sn bekleniyor`);
    await sleep(wait);
  }
  console.log(`agir tur ${round} : ${failing.length}`);
  for (let i = 0; i < failing.length; i++) {
    if (i) await sleep(RETRY_GAP_MS);
    const r = await once(failing[i].url);
    remember(r);
    results[r.url] = r;
    if ((i + 1) % 25 === 0) process.stdout.write(`\r  tur ${round}: ${i + 1}/${failing.length}`);
  }
  process.stdout.write(`\r  tur ${round}: ${failing.length}/${failing.length}\n`);
  save();
  failing = Object.values(results).filter((r) => r.status === 429 || r.status === 0);
}
save();

const all = urls.map((u) => results[u]).filter(Boolean);
const bad = all.filter((r) => !r.status || r.status >= 400);
const notImage = all.filter((r) => r.status && r.type && !r.type.startsWith("image/"));
const statusCount = {};
for (const r of all) statusCount[r.status] = (statusCount[r.status] ?? 0) + 1;

console.log("durum      :", Object.entries(statusCount).map(([k, v]) => `${k}=${v}`).join(" "));
console.log(`calismayan : ${bad.length}/${all.length}`);
if (notImage.length) console.log(`gorsel olmayan content-type: ${notImage.length}`);
for (const r of bad.slice(0, 25)) console.log(`  ${r.status}  ${r.error ?? ""}  ${r.url}`);
console.log(`kanitlanan  : ${all.length - bad.length}/${urls.length}  (.cache/vimg.json)`);

process.exit(bad.length ? 1 : 0);
