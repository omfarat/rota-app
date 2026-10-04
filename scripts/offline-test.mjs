// Verifies offline behaviour against the real export: visit pages, cut the
// network, then confirm they still render. Requires a static server on BASE.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3001";
const problems = [];
const rows = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "tr-TR",
});
const page = await ctx.newPage();

// Service workers need a secure context; localhost counts as one.
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForFunction(() => "serviceWorker" in navigator);
await page.waitForFunction(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  return Boolean(reg?.active);
}, { timeout: 20000 });
rows.push(["servis worker", "durum", "aktif"]);

// Warm the cache with a city page and a route the user would open anyway.
await page.goto(`${BASE}/sehir/ankara/`, { waitUntil: "networkidle" });
await page.goto(`${BASE}/sehir/ankara/rota/?tema=tarih&sure=half`, {
  waitUntil: "networkidle",
});
const cachedUrls = await page.evaluate(async () => {
  const names = await caches.keys();
  const all = await Promise.all(
    names.map((n) => caches.open(n).then((c) => c.keys())),
  );
  return {
    caches: names,
    entries: all.flat().length,
  };
});
rows.push(["cache", "adet", `${cachedUrls.entries} kayit / ${cachedUrls.caches.length} cache`]);

// Cut the network at the browser level, not the server.
await ctx.setOffline(true);
rows.push(["baglanti", "durum", "kapali"]);

const offlineChecks = [
  ["/", "kok sayfa", "81"],
  ["/sehir/ankara/", "sehir sayfasi", "Ankara"],
  ["/sehir/ankara/rota/?tema=tarih&sure=half", "rota", "Durak"],
];

/** Route pages render on the client, so poll instead of reading right away. */
async function readWhenReady(page, expect, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let text = "";
  while (Date.now() < deadline) {
    text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    if (text.includes(expect)) return { text, ready: true };
    await page.waitForTimeout(400);
  }
  return { text, ready: false };
}

for (const [path, label, expect] of offlineChecks) {
  try {
    const response = await page.goto(BASE + path, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    const status = response?.status() ?? 0;
    const { text, ready } = await readWhenReady(page, expect);
    rows.push([`offline ${label}`, "sonuc", `${status} ${ready ? "ok" : "BOS"}`]);
    if (status >= 400 || !ready)
      problems.push(
        `offline ${path}: HTTP ${status}, "${expect}" yok -> ${text.slice(0, 160)}`,
      );
  } catch (err) {
    rows.push([`offline ${label}`, "sonuc", `HATA ${String(err).slice(0, 60)}`]);
    problems.push(`offline ${path}: ${String(err).slice(0, 100)}`);
  }
}

// A page never visited must land on the offline fallback, not a browser error.
try {
  await page.goto(`${BASE}/sehir/bitlis/`, {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });
  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const usedFallback = text.includes("Bağlantı yok");
  rows.push([
    "ziyaret edilmemiş sehir",
    "sonuc",
    usedFallback ? "offline sayfasi" : "icerik",
  ]);
  if (!usedFallback) problems.push("ziyaret edilmemiş sayfa fallback kullanmadi");
} catch (err) {
  rows.push(["ziyaret edilmemiş sehir", "sonuc", "HATA"]);
  problems.push(`ziyaret edilmemiş sayfa: ${String(err).slice(0, 100)}`);
}

await page.screenshot({
  path: "C:/Users/omer/AppData/Local/Temp/opencode/offline.png",
});

console.log("=== SAYFA ===");
for (const r of rows) console.log(r.join("  |  "));
console.log("\n=== SORUN ===");
console.log(problems.length);
for (const p of problems) console.log("   ", p);

await browser.close();
process.exit(problems.length ? 1 : 0);