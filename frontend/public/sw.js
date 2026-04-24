// Scoop service worker — lightweight offline shell + runtime caching.
// Bump CACHE_VERSION whenever this file's caching strategy meaningfully changes
// so stale installs auto-upgrade on next activation.

const CACHE_VERSION = "scoop-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Minimum set of files to pre-cache so the app boots offline. Hashed Vite
// bundles are added lazily on first request via the runtime handler.
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/news-icon.svg",
  "/og-image.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

// Caching strategy per route family:
//   /api/news, /api/videos, etc  -> stale-while-revalidate (fresh when possible, instant when offline)
//   /api/events  (SSE)           -> never cache
//   /api/track                   -> never cache
//   /article/:id (SSR HTML)      -> stale-while-revalidate
//   static assets (hashed)       -> cache-first
//   navigation requests          -> network, falling back to cached index.html
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never handle cross-origin (AdSense, GA4, fonts) — let the network handle it.
  if (url.origin !== self.location.origin) return;

  // SSE + tracking endpoints — pass through.
  if (url.pathname.startsWith("/api/events") || url.pathname.startsWith("/api/track")) {
    return;
  }

  // News + videos APIs — stale-while-revalidate.
  if (url.pathname.startsWith("/api/news") || url.pathname.startsWith("/api/videos")) {
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
    return;
  }

  // Article SSR pages — stale-while-revalidate.
  if (url.pathname.startsWith("/article/")) {
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
    return;
  }

  // Hashed static assets — cache-first.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(req, RUNTIME_CACHE));
    return;
  }

  // HTML navigations — network-first, offline fallback to index.html shell.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/index.html", { cacheName: SHELL_CACHE })),
    );
    return;
  }
});

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

// Push notification handler (Phase 2 will actually subscribe; keeping the
// handler skeleton here so registering the SW now doesn't require a version
// bump when push ships).
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: "Scoop", body: event.data.text() }; }
  const { title = "Scoop", body = "", url = "/", icon = "/news-icon.svg" } = data;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: icon,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(self.clients.openWindow(url));
});
