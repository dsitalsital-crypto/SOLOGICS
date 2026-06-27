const CACHE = "sologics-chauffeur-v3";
const QUEUE_KEY = "sl_chauffeur_offline_queue";

const ASSETS = [
  "/chauffeur.html",
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(ASSETS.map(url => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE && k !== "sologics-cdn").map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = e.request.url;
  if (!url.startsWith("http://") && !url.startsWith("https://")) return;

  // Supabase GET — netwerk first, cache fallback
  if (url.includes("supabase.co/rest") && e.request.method === "GET") {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Supabase mutaties — netwerk, sla op in queue als offline
  if (url.includes("supabase.co") && e.request.method !== "GET") {
    e.respondWith(
      fetch(e.request.clone()).catch(async () => {
        const body = await e.request.clone().text().catch(() => "");
        const headers = {};
        e.request.headers.forEach((v, k) => headers[k] = v);
        const item = { id: Date.now(), url, method: e.request.method, headers, body, ts: new Date().toISOString() };
        const clients = await self.clients.matchAll();
        clients.forEach(c => c.postMessage({ type: "QUEUE_ADD", item }));
        return new Response(JSON.stringify({ offline: true, queued: true }), {
          status: 200, headers: { "Content-Type": "application/json" }
        });
      })
    );
    return;
  }

  // Chauffeur pagina — netwerk first
  if (url.includes("sologics.site/chauffeur")) {
    e.respondWith(
      fetch(e.request, { cache: "no-store" }).catch(() => caches.match(e.request))
    );
    return;
  }

  // CDN — cache first
  if (url.includes("cdnjs.cloudflare.com") || url.includes("fonts.g")) {
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
  }
});

// Background Sync
self.addEventListener("sync", (e) => {
  if (e.tag === "sync-chauffeur-queue") {
    e.waitUntil(notifyClients());
  }
});

async function notifyClients() {
  const clients = await self.clients.matchAll();
  clients.forEach(c => c.postMessage({ type: "SYNC_START" }));
}
