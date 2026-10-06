const CACHE = "lory-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/lory-boutique-logo.png", "/app-icon.svg"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(async cache => {
    await cache.addAll(SHELL);
    const page = await cache.match("/");
    const html = await page.text();
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"<>]+)"/g)].map(match => match[1]);
    await cache.addAll([...new Set(assets)]);
  }));
});
// New versions activate when the old app closes, preserving any sale in progress.
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("lory-shell-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  // Business data and authenticated requests always go directly to the server.
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/") || request.headers.has("Authorization")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put("/", copy)));
      }
      return response;
    }).catch(() => caches.match("/")));
    return;
  }
  if (url.pathname.startsWith("/assets/") || SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
      }
      return response;
    })));
  }
});
