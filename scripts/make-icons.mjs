// Renders the app icon to the PNG sizes a PWA needs. Chromium is the only
// rasteriser in the project, and Playwright already ships with it, so the
// icons stay reproducible from the single SVG source.
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const svg = readFileSync("public/icon.svg", "utf8").trim();

/**
 * The artwork is scaled down and centred so that nothing important sits in the
 * corners. Maskable icons are cropped by the launcher to whatever shape it
 * likes, so their content has to survive an aggressive circle crop.
 */
const TARGETS = [
  { file: "public/icon-192.png", size: 192, scale: 0.8, purpose: "any" },
  { file: "public/icon-512.png", size: 512, scale: 0.8, purpose: "any" },
  { file: "public/icon-maskable-512.png", size: 512, scale: 0.56, purpose: "maskable" },
  { file: "public/apple-touch-icon.png", size: 180, scale: 0.72, purpose: "any" },
];

const browser = await chromium.launch();
const page = await browser.newPage();

for (const { file, size, scale } of TARGETS) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * scale);
  await page.setContent(
    `<!doctype html><html><body style="margin:0">
<div style="width:${size}px;height:${size}px;background:#1a1614;display:grid;place-items:center">
<div style="width:${inner}px;height:${inner}px">${svg.replace(
      /width="64" height="64"/,
      `width="${inner}" height="${inner}"`,
    )}</div>
</div></body></html>`,
  );
  const png = await page.screenshot({ omitBackground: false });
  writeFileSync(file, png);
  console.log(`${file.padEnd(32)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}

await browser.close();