const CACHE_NAME = "baggy-amar-v2";

const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.svg",
  "/icon-512.svg",
  "/favicon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn("[SW] Pre-cache partial failure:", err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log("[SW] Removing old cache:", key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Skip non-http protocols
  if (!url.protocol.startsWith("http")) return;

  // Google Fonts — stale-while-revalidate
  if (
    url.hostname.includes("fonts.googleapis.com") ||
    url.hostname.includes("fonts.gstatic.com")
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const networkFetch = fetch(event.request)
            .then((response) => {
              if (response.ok) cache.put(event.request, response.clone());
              return response;
            })
            .catch(() => null);
          return cached || networkFetch || new Response("", { status: 503 });
        })
      )
    );
    return;
  }

  // All same-origin requests (JS, CSS, images, etc.) — network first, cache fallback
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        fetch(event.request)
          .then((response) => {
            // Cache successful responses (including hashed assets)
            if (response.ok && response.status < 400) {
              cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() =>
            // Offline: serve from cache, fallback to root for navigation
            cache.match(event.request).then((cached) => {
              if (cached) return cached;
              // For navigation requests, serve the app shell
              if (event.request.mode === "navigate") {
                return cache.match("/index.html") ||
                  cache.match("/") ||
                  new Response("<h1>Offline — please reconnect</h1>", {
                    status: 503,
                    headers: { "Content-Type": "text/html" },
                  });
              }
              return new Response("", { status: 503 });
            })
          )
      )
    );
    return;
  }
});
