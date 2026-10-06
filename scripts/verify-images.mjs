// Fetches every image URL the dataset points at, so a dead thumbnail is caught
// before it shows up as a blank card.
//
//   node scripts/verify-images.mjs          # all image URLs
//   node scripts/verify-images.mjs --limit 25
//
// Sequential with a gap: eight parallel probes are enough for the Wikimedia CDN
// to answer 429, and a checker that trips the rate limit cannot tell a broken
// image from a throttled one.
import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const limit = Number(argv.find((a) => /^\d+$/.test(a)) ?? Infinity);
const GAP_MS = 120;
const TIMEOUT_MS = 20000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pois = JSON.parse(readFileSync("src/data/pois.json", "utf8"));
const wanted = [...new Set(Object.values(pois).flat().map((p) => p.image).filter(Boolean))];
const urls = wanted.slice(0, limit);

console.log(`gorsel url : ${wanted.length}${urls.length !== wanted.length ? ` (ilk ${urls.length})` : ""}`);

async function probe(url) {
  let lastStatus = 0;
  let lastError = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(2000 * attempt);
    for (const method of ["HEAD", "GET"]) {
      try {
        const res = await fetch(url, {
          method,
          redirect: "follow",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.ok) return { url, status: res.status, type: res.headers.get("content-type") };
        lastStatus = res.status;
        lastError = "";
        // HEAD rejected outright: still worth one GET.
        if (res.status !== 405 && res.status !== 501) break;
      } catch (e) {
        lastStatus = 0;
        lastError = e.message;
      }
    }
    if (lastStatus !== 429) break; // a 4xx is the URL's fault; retrying hides it
    await sleep(3000);
  }
  return { url, status: lastStatus, type: null, error: lastError };
}

const results = [];
for (let i = 0; i < urls.length; i++) {
  if (i) await sleep(GAP_MS);
  results.push(await probe(urls[i]));
  if ((i + 1) % 50 === 0) process.stdout.write(`\r  ${i + 1}/${urls.length}`);
}
process.stdout.write(`\r  ${urls.length}/${urls.length}\n`);

const bad = results.filter((r) => !r.status || r.status >= 400);
const notImage = results.filter((r) => r.status && r.type && !r.type.startsWith("image/"));
const statusCount = {};
for (const r of results) statusCount[r.status] = (statusCount[r.status] ?? 0) + 1;

console.log("durum      :", Object.entries(statusCount).map(([k, v]) => `${k}=${v}`).join(" "));
console.log(`calismayan : ${bad.length}/${results.length}`);
if (notImage.length) console.log(`gorsel olmayan content-type: ${notImage.length}`);
for (const r of bad.slice(0, 25)) console.log(`  ${r.status}  ${r.error ?? ""}  ${r.url}`);

process.exit(bad.length ? 1 : 0);
