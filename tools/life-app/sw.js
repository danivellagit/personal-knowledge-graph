// Life PWA service worker: network-first with cache:"no-store" so a new build is picked up on the next launch;
// the last good copy is served only when offline. Only ciphertext ever goes in the cache.
const C = "life-v2";
self.addEventListener("install", (e) => self.skipWaiting());
// drop the caches of older versions, then take over the open pages
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
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
