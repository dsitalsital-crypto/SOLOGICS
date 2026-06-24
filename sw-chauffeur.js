const CACHE = "sologics-chauffeur-v2";

// Install
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(["/chauffeur.html"])).catch(() => {})
  );
  self.skipWaiting();
});

// Activate
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — alleen cachen als het een geldig http/https verzoek is
self.addEventListener("fetch", (e) => {
  const url = e.request.url;

  // Sla chrome-extension, data en andere niet-http URLs over
  if (!url.startsWith("http://") && !url.startsWith("https://")) return;

  // Alleen GET requests cachen
  if (e.request.method !== "GET") return;

  // Supabase API calls niet cachen
  if (url.includes("supabase.co")) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        if (res && res.ok && res.status < 400) {
          try {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(e.request, clone));
          } catch(err) {}
        }
        return res;
      }).catch(() => cached || new Response("Offline", { status: 503 }));
    })
  );
});
