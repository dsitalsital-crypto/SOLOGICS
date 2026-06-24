const VERSION = "sologics-v" + Date.now();

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = e.request.url;

  // Alleen http/https
  if (!url.startsWith("http://") && !url.startsWith("https://")) return;

  // HTML pagina's — altijd netwerk eerst, nooit cache
  if (url.includes("sologics.site") && !url.includes("supabase")) {
    e.respondWith(
      fetch(e.request, { cache: "no-store" }).catch(() =>
        caches.match(e.request)
      )
    );
    return;
  }

  // CDN bestanden (React, Babel etc.) — cache first voor snelheid
  if (url.includes("cdnjs.cloudflare.com") || url.includes("fonts.googleapis.com")) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open("sologics-cdn").then(c => c.put(e.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }
});
