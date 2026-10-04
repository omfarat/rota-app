// Resolves every internal link the way a static host does, so a link that only
// works because of a dev-server fallback is caught before deploy.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const ROOT = resolve("out");

function walk(dir, outFiles = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, outFiles);
    else outFiles.push(full);
  }
  return outFiles;
}

/** Mirrors Cloudflare Pages / nginx: try the exact file, then <path>/index.html. */
function resolveUrl(urlPath) {
  const clean = decodeURIComponent(urlPath.split("#")[0].split("?")[0]);
  const base = join(ROOT, clean);
  const candidates =
    clean === "/" || clean === ""
      ? [join(ROOT, "index.html")]
      : [base, `${base}.html`, join(base, "index.html")];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
}

const htmlFiles = walk(ROOT).filter((f) => f.endsWith(".html"));
const missing = new Map();
let checked = 0;
let external = 0;

for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  const from = file.slice(ROOT.length + 1);
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url = m[1];
    if (/^(https?:|mailto:|tel:|data:|javascript:)/.test(url)) {
      external++;
      continue;
    }
    if (url.startsWith("#")) continue; // same page anchor
    if (!url.startsWith("/")) {
      missing.set(url, [...(missing.get(url) ?? []), from]);
      continue;
    }
    checked++;
    if (!resolveUrl(url)) missing.set(url, [...(missing.get(url) ?? []), from]);
  }
}

console.log("html dosyasi        :", htmlFiles.length);
console.log("kontrol edilen link :", checked);
console.log("harici link         :", external);
console.log("COZULEMEYEN link    :", missing.size);
let shown = 0;
for (const [url, sources] of missing) {
  if (shown++ >= 25) {
    console.log(`  ... +${missing.size - 25} daha`);
    break;
  }
  console.log(`  ${url}   <- ${sources[0]}${sources.length > 1 ? ` (+${sources.length - 1})` : ""}`);
}
process.exit(missing.size ? 1 : 0);