// Serves the static export the way a static host does, so the browser and
// offline tests see the same failures production would. Run it against out/:
//   node scripts/serve-out.mjs [port]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, resolve } from "node:path";

const ROOT = resolve(process.argv[3] ?? "out");
const PORT = Number(process.argv[2] ?? 3001);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

async function firstFile(paths) {
  for (const p of paths) {
    try {
      if ((await stat(p)).isFile()) return p;
    } catch {}
  }
  return null;
}

/**
 * Only the layouts a real static host serves. Notably there is no
 * "<path>.html" fallback: adding one here would hide the kind of export bug
 * where a route is written as a flat file instead of an index.html.
 */
async function resolveRequest(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  if (clean.includes("..")) return null;
  const target = join(ROOT, clean);
  return firstFile([target, `${target}.html`, join(target, "index.html")]);
}

createServer(async (req, res) => {
  const file = await resolveRequest(req.url ?? "/");
  if (!file) {
    try {
      res.writeHead(404, { "content-type": TYPES[".html"] });
      res.end(await readFile(join(ROOT, "404.html")));
    } catch {
      res.writeHead(404, { "content-type": "text/plain" }).end("404");
    }
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(500).end("500");
  }
}).listen(PORT, () => {
  console.log(`statik sunucu: http://localhost:${PORT}  (kok: ${ROOT})`);
});