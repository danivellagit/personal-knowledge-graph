// Service worker of the health PWA: network-first with cache:"no-store", so a new build is picked up
// on the next launch (GitHub Pages sends a 10-minute HTTP cache); the last good copy is served only
// when offline. Only the public files go in the cache: index.html holds nothing but ciphertext.
const C = "__APP_SLUG__-v1";
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: "no-store" }).then((r) => {
    if (r.ok && (e.request.mode === "navigate" || /\.(webmanifest|png)$/.test(u.pathname))) {
      const copy = r.clone(); const key = e.request.mode === "navigate" ? new Request(new URL("./", location).href) : e.request;
      caches.open(C).then((c) => c.put(key, copy));
    }
    return r;
  }).catch(() => caches.match(e.request.mode === "navigate" ? new URL("./", location).href : e.request)));
});
