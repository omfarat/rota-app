// Bump CACHE_VERSION to evict everything on the next activation.
const CACHE_VERSION = "rota-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

// The whole export is ~10 MB, mostly RSC payloads, so precaching all of it
// would cost a user more than a megabyte of mobile data up front. Only the shell
// is eager; pages and assets are cached as they are visited.
const SHELL = ["/", "/offline.html", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(CACHE_VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Cloudflare and nginx treat /sehir/ankara and /sehir/ankara/ as one page. */
function candidates(request) {
  const url = request.url;
  return [request, url.endsWith("/") ? url : `${url}/`, url.replace(/\/$/, "")];
}

/** Searches every cache, since the precached shell lives in a different one. */
async function matchAnyCache(request) {
  for (const candidate of candidates(request)) {
    const hit = await caches.match(candidate);
    if (hit) return hit;
  }
  return undefined;
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await matchAnyCache(request);
    if (cached) return cached;
    const shell = await caches.match("/offline.html");
    if (shell) return shell;
    throw err;
  }
}

async function cacheFirstOrNetwork(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const shell = await caches.match("/offline.html");
    if (shell) return shell;
    throw err;
  }
}

/** Keeps cached pages fresh in the background without blocking the response. */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached ?? network.then((r) => r ?? fetch(request));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // weather stays live

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
    return;
  }

  // Content-hashed filenames, so a cached copy can never go stale.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirstOrNetwork(request, ASSET_CACHE));
    return;
  }

  // RSC payloads. Their exported names do not match what the router requests,
  // so a miss is normal and falls through to a full page load.
  if (url.pathname.endsWith(".txt")) {
    event.respondWith(cacheFirstOrNetwork(request, PAGE_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
});