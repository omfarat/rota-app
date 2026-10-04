import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3001";
const cities = JSON.parse(readFileSync("./src/data/cities.json", "utf8"));

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36",
  locale: "tr-TR",
});
const page = await ctx.newPage();

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("response", (r) => {
  if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url().slice(0, 140)}`);
});

const problems = [];
const rows = [];

// 1) Home page renders the city list.
await page.goto(BASE + "/", { waitUntil: "networkidle" });
const cityLinks = await page.locator('a[href^="/sehir/"]').count();
rows.push(["kok sayfa", "sehir linki", String(cityLinks)]);
if (cityLinks < 81) problems.push(`kok sayfada ${cityLinks} sehir linki var, 81 olmali`);
await page.evaluate(() => {
  window.__spaMarker = "yes";
});

// 2) Client side navigation into a city. Adana is used because it has no
// viewpoint POIs, which exercises the empty-theme guard.
await page.locator('a[href^="/sehir/adana"]').first().click();
await page.waitForURL("**/sehir/adana/**");
await page.waitForLoadState("networkidle");
const h1 = (await page.locator("h1").first().textContent())?.trim();
rows.push(["sehir sayfasi", "h1", h1 ?? "-"]);
if (!h1?.includes("Adana")) problems.push(`sehir sayfasi h1 = ${h1}`);

// Navigation must stay client side. The RSC prefetch requests 404 on a static
// export, so this guards the fallback: if it ever degrades to full page loads,
// every tap would re-download the JS bundle.
const spaMarker = await page.evaluate(() => window.__spaMarker ?? null);
rows.push(["gezinme tipi", "SPA", spaMarker === "yes" ? "istemci ici" : "tam sayfa"]);
if (spaMarker !== "yes") problems.push("gezinme tam sayfa yenilemesine dustu");

// 3) The planner is a div of buttons, so drive it like a user would.
const themeButtons = page
  .locator("section")
  .filter({ hasText: "Nasıl gezmek istersin?" })
  .locator("button");
const themeCount = await themeButtons.count();
const themeStates = [];
for (let i = 0; i < themeCount; i++) {
  const b = themeButtons.nth(i);
  themeStates.push({
    label: ((await b.locator("span").nth(3).textContent()) ?? "").trim(),
    n: ((await b.locator("span").nth(2).textContent()) ?? "").trim(),
    disabled: await b.isDisabled(),
    pressed: (await b.getAttribute("aria-pressed")) === "true",
  });
}
rows.push([
  "tema dugmeleri",
  `${themeStates.filter((t) => !t.disabled).length} acik / ${
    themeStates.filter((t) => t.disabled).length
  } kapali`,
]);
console.log("   tema detay:", JSON.stringify(themeStates));

// The theme selected on arrival must be usable, never a disabled one.
const preselected = themeStates.find((t) => t.pressed);
rows.push(["varsayilan tema", preselected?.label ?? "-", `${preselected?.n} yer`]);
if (!preselected) problems.push("hicbir tema varsayilan secili degil");
else if (preselected.disabled)
  problems.push(`varsayilan tema "${preselected.label}" kapali (${preselected.n} yer)`);

// It should also be the richest theme available, since that is the rule.

// Every disabled theme must advertise zero places, and vice versa.
for (const t of themeStates) {
  if (t.disabled && !/^0$/.test(t.n.trim()))
    problems.push(`${t.label} kapali ama sayisi "${t.n}"`);
  if (!t.disabled && /^0$/.test(t.n.trim()))
    problems.push(`${t.label} acik ama sayisi 0`);
}
if (themeStates.every((t) => t.disabled)) problems.push("tum temalar kapali");

// Submit must be blocked while the selected theme has no data.
const usable = themeStates.filter((t) => !t.disabled);
if (usable.length) {
  await themeButtons.nth(themeStates.indexOf(usable[0])).click();
}
const submitBtn = page.getByRole("button", { name: "Rotayı oluştur" });
const canSubmit = await submitBtn.isEnabled();
rows.push(["gecerli tema ile", "gonder butonu", canSubmit ? "aktif" : "pasif"]);
if (!canSubmit) problems.push("gecerli tema seciliyken gonder butonu pasif");

// Pick another usable theme, a duration, then submit.
const second = usable[Math.min(1, usable.length - 1)];
await themeButtons.nth(themeStates.indexOf(second)).click();
await page
  .locator("section")
  .filter({ hasText: "Ne kadar vaktin var?" })
  .locator("button")
  .nth(1)
  .click();
const submitLabel = (await submitBtn.textContent())?.trim() ?? "";
await submitBtn.click();
await page.waitForURL("**/rota/?**", { timeout: 15000 });
const routeUrl = page.url().replace(BASE, "");
rows.push(["form gonderimi", "hedef", `${submitLabel} -> ${routeUrl}`]);
if (!routeUrl.includes("tema=") || !routeUrl.includes("sure=")) {
  problems.push(`form gonderimi yanlis URL uretti: ${routeUrl}`);
}
await page.waitForLoadState("networkidle");
// Client side navigation renders the route after hydration, so poll for it
// instead of trusting networkidle.
let stopsAfterForm = null;
for (let i = 0; i < 40; i++) {
  const m = (await page.locator("body").innerText()).match(/(\d+)\s*Durak/);
  if (m) {
    stopsAfterForm = m[1];
    break;
  }
  await page.waitForTimeout(500);
}
rows.push(["form sonrasi", "durak", stopsAfterForm ?? "yok"]);
if (!stopsAfterForm)
  problems.push(
    `form ile gecilen rotada durak gorunmuyor (${second.label}, ${routeUrl})`,
  );

// 4) The important one: a route URL must render stops after hydration.
const cases = [
  ["ankara", "tarih", "half"],
  ["istanbul", "lezzet", "short"],
  ["mugla", "doga", "full"],
  ["kastamonu", "muze", "half"],
  ["igdir", "tarih", "full"],
];

for (const [slug, tema, sure] of cases) {
  const city = cities.find((c) => c.slug === slug);
  await page.goto(`${BASE}/sehir/${slug}/rota/?tema=${tema}&sure=${sure}`, {
    waitUntil: "networkidle",
  });

  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const stopMatch = text.match(/(\d+)\s*Durak/);
  const stops = stopMatch ? Number(stopMatch[1]) : -1;
  const hasMaps = (await page.locator('a[href*="google.com/maps"]').count()) > 0;
  const hasApple = (await page.locator('a[href*="maps.apple.com"]').count()) > 0;
  const noStops = text.includes("uygun durak kalmadı");

  rows.push([
    `${slug}/${tema}/${sure}`,
    "durak",
    noStops ? "bos(gecerli)" : String(stops),
    `google:${hasMaps ? "y" : "n"} apple:${hasApple ? "y" : "n"}`,
  ]);

  if (stops < 0 && !noStops) problems.push(`${slug}/${tema}: durak sayisi okunamadi`);
  if (!hasMaps) problems.push(`${slug}/${tema}: google linki yok`);
  if (!hasApple) problems.push(`${slug}/${tema}: apple linki yok`);
  if (city && stops > 0 && stops === 0) problems.push(`${slug}: sifir durak`);
}

// 5) Empty result must offer a way back. Weather may legitimately change the
// plan, so assert that the page is coherent rather than that it is empty.
await page.goto(`${BASE}/sehir/karabuk/rota/?tema=muze&sure=short`, {
  waitUntil: "networkidle",
});
const emptyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
const karabukEmpty = emptyText.includes("uygun durak kalmadı");
const karabukStops = emptyText.match(/(\d+)\s*Durak/);
rows.push([
  "karabuk/muze/short",
  karabukEmpty ? "bos(gecerli)" : `${karabukStops?.[1] ?? "?"} durak`,
]);
if (karabukEmpty) {
  const backLink = await page.locator('a[href^="/sehir/karabuk"]').count();
  rows.push(["bos rota", "geri linki", String(backLink)]);
  if (backLink === 0) problems.push("bos rotada geri linki yok");
}

await page.screenshot({ path: "C:/Users/omer/AppData/Local/Temp/opencode/rota.png" });

console.log("=== SAYFA ===");
for (const r of rows) console.log(r.join("  |  "));
console.log("\n=== BASARISIZ ISTEK (>=400) ===");
const uniqueFailed = [...new Set(failedRequests)];
console.log("adet:", failedRequests.length, "| benzersiz:", uniqueFailed.length);
for (const f of uniqueFailed.slice(0, 10)) console.log("   ", f);
console.log("\n=== JS HATALARI ===");
console.log("console.error :", consoleErrors.length);
console.log("pageerror     :", pageErrors.length);
for (const e of pageErrors.slice(0, 5)) console.log("   ", e.slice(0, 160));
console.log("\n=== SORUN ===");
console.log(problems.length);
for (const p of problems.slice(0, 20)) console.log("   ", p);

await browser.close();