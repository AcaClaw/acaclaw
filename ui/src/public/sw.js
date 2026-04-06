// AcaClaw Service Worker — enables PWA "Install" prompt on Chrome/Edge/Firefox.
//
// Strategy:
//   - index.html: network-first (the gateway injects auth tokens server-side;
//     always fetch a fresh copy and fall back to cache only when offline)
//   - Static assets (JS, CSS, fonts, images): cache-first after first load
//   - /api/*, /health, /ready, WebSocket: never cached (pass through to gateway)
//   - Offline fallback: minimal HTML page explaining the gateway is unreachable

const CACHE = "acaclaw-v1";

// Shell assets to pre-cache on SW install (populated by Vite build output).
// Kept intentionally empty here — assets are added to cache on first fetch.
const PRECACHE = ["/logo/icon-192.png", "/logo/icon-512.png"];

const SKIP_CACHE = ["/api/", "/health", "/ready", "/admin"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
  // Activate immediately — don't wait for tabs to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept same-origin GET requests.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Never cache gateway API / probe / admin paths.
  if (SKIP_CACHE.some((p) => url.pathname.startsWith(p))) return;

  // index.html: network-first (gateway injects token into this file).
  if (url.pathname === "/" || url.pathname === "/index.html") {
    event.respondWith(networkFirstWithFallback(request, offlinePage()));
    return;
  }

  // Static assets: cache-first, populate cache on miss.
  event.respondWith(cacheFirstWithNetworkFallback(request));
});

async function networkFirstWithFallback(request, fallback) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached ?? new Response(fallback, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

async function cacheFirstWithNetworkFallback(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

function offlinePage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AcaClaw — Gateway offline</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center;
           justify-content: center; height: 100vh; margin: 0; background: #f4f4f5; color: #18181b; }
    .card { text-align: center; padding: 2rem 3rem; background: #fff;
            border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,.08); max-width: 360px; }
    h1 { font-size: 1.25rem; margin: 0 0 .5rem; color: #0d9488; }
    p  { font-size: .9rem; color: #71717a; margin: 0 0 1.5rem; }
    button { background: #0d9488; color: #fff; border: none; border-radius: 6px;
             padding: .6rem 1.4rem; font-size: .95rem; cursor: pointer; }
    button:hover { background: #0f766e; }
  </style>
</head>
<body>
  <div class="card">
    <h1>AcaClaw gateway is offline</h1>
    <p>Start the gateway with <code>acaclaw start</code> and then reload.</p>
    <button onclick="location.reload()">Reload</button>
  </div>
</body>
</html>`;
}
