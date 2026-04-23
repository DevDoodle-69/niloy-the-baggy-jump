/**
 * BAGGY AMAR 3 DA — Service Worker v3
 *
 * Strategy:
 *  • Install  → precache the app shell (HTML, manifest, icons)
 *  • Activate → delete old caches so updates deploy cleanly
 *  • Fetch    →
 *      - HTML navigation  : network-first → cache fallback  (fresh HTML = fresh app)
 *      - Same-origin assets: cache-first  → network fallback (instant offline play)
 *      - Google Fonts     : stale-while-revalidate           (fast + always fresh)
 *      - External URLs    : network-only (don't pollute cache)
 *
 * This means after ONE online visit the game runs completely offline.
 */

const CACHE = "baggy-amar-v3";

const SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.svg",
  "/icon-512.svg",
  "/favicon.svg",
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  self.skipWaiting(); // activate immediately, don't wait for old SW to die
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(SHELL).catch((err) =>
        console.warn("[SW] Shell precache partial failure:", err)
      )
    )
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE)
            .map((k) => {
              console.log("[SW] Evicting old cache:", k);
              return caches.delete(k);
            })
        )
      )
      .then(() => self.clients.claim()) // take control of all open tabs immediately
  );
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function isFont(url) {
  return (
    url.hostname.includes("fonts.googleapis.com") ||
    url.hostname.includes("fonts.gstatic.com")
  );
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isNavigation(request) {
  return request.mode === "navigate";
}

// Put the response in cache (clone before consuming)
async function cacheResponse(request, response) {
  if (response && response.ok && response.status < 400) {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (!url.protocol.startsWith("http")) return;

  // ── Google Fonts: stale-while-revalidate ─────────────────────────────────
  if (isFont(url)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        const networkPromise = fetch(event.request)
          .then((res) => {
            if (res.ok) cache.put(event.request, res.clone());
            return res;
          })
          .catch(() => null);
        // Return cached immediately; network updates it in background
        return cached || networkPromise || new Response("", { status: 503 });
      })
    );
    return;
  }

  // ── Same-origin HTML (navigation): network-first ─────────────────────────
  if (isSameOrigin(url) && isNavigation(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then((res) => cacheResponse(event.request, res))
        .catch(async () => {
          const cache = await caches.open(CACHE);
          // Return cached index or a minimal offline page
          return (
            (await cache.match("/index.html")) ||
            (await cache.match("/")) ||
            new Response(
              `<!DOCTYPE html><html><head><meta charset="utf-8">
               <title>BAGGY AMAR 3 DA</title>
               <style>body{background:#1a0b3d;color:#ffd700;font-family:sans-serif;
               display:flex;flex-direction:column;align-items:center;justify-content:center;
               height:100vh;margin:0;text-align:center;}</style></head>
               <body><h1>BAGGY AMAR 3 DA</h1>
               <p style="color:#00ffff">Loading from cache — please wait...</p>
               <script>setTimeout(()=>location.reload(),2000)</script></body></html>`,
              { status: 200, headers: { "Content-Type": "text/html" } }
            )
          );
        })
    );
    return;
  }

  // ── Same-origin assets (JS, CSS, images, audio): cache-first ─────────────
  // This is what makes the game work 100% offline after first visit.
  if (isSameOrigin(url)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);

        if (cached) {
          // Serve instantly from cache; silently update in background
          fetch(event.request)
            .then((res) => { if (res.ok) cache.put(event.request, res.clone()); })
            .catch(() => {});
          return cached;
        }

        // Not cached yet — fetch, cache, and return
        try {
          const res = await fetch(event.request);
          if (res.ok) cache.put(event.request, res.clone());
          return res;
        } catch {
          return new Response("", { status: 503 });
        }
      })
    );
    return;
  }

  // ── External requests: pass through without caching ───────────────────────
  // (analytics, CDNs we don't control, etc.)
  event.respondWith(fetch(event.request).catch(() => new Response("", { status: 503 })));
});
