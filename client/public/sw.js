const CACHE = "lory-shell-v2";
const ILLUSTRATIONS = ["/illustrations/jeans.svg","/illustrations/wideleg.svg","/illustrations/cargo.svg","/illustrations/shorts.svg","/illustrations/skirt.svg","/illustrations/shirt.svg","/illustrations/polo.svg","/illustrations/tank.svg","/illustrations/hoodie.svg","/illustrations/jacket.svg","/illustrations/dress.svg","/illustrations/set.svg","/illustrations/bodysuit.svg","/illustrations/bikini.svg","/illustrations/sneaker.svg","/illustrations/sandal.svg","/illustrations/leggings.svg","/illustrations/misc.svg"];
const SHELL = ["/", "/manifest.webmanifest", "/lory-boutique-logo.png", "/app-icon.svg", ...ILLUSTRATIONS];
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
  // Sensitive API data is never stored in the service worker cache;\n  // authenticated offline snapshots are held in IndexedDB by the PDV.
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
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/illustrations/") || SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
      }
      return response;
    })));
  }
});
