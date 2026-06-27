const CACHE_NAME = "sologics-admin-v3";
const OFFLINE_QUEUE_KEY = "sl_offline_queue";

const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/invoice.html",
  "/tracking.html",
  "/klanten.html",
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js",
  "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Bebas+Neue&display=swap",
];

// Install — cache alle assets
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(ASSETS_TO_CACHE.map(url => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

// Activate — verwijder oude caches
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== "sologics-cdn").map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategie
self.addEventListener("fetch", (e) => {
  const url = e.request.url;

  // Sla niet-http URLs over
  if (!url.startsWith("http://") && !url.startsWith("https://")) return;

  // Supabase API calls — network first, dan offline queue
  if (url.includes("supabase.co/rest") || url.includes("supabase.co/storage")) {
    if (e.request.method !== "GET") {
      // Mutaties (POST/PATCH/DELETE) — probeer netwerk, sla op als offline
      e.respondWith(
        fetch(e.request.clone()).catch(async () => {
          // Sla op in offline queue
          const body = await e.request.clone().text().catch(() => "");
          const queueItem = {
            id: Date.now() + Math.random(),
            url,
            method: e.request.method,
            headers: Object.fromEntries(e.request.headers.entries()),
            body,
            timestamp: new Date().toISOString(),
          };
          // Stuur bericht naar alle clients om queue op te slaan
          const clients = await self.clients.matchAll();
          clients.forEach(client => client.postMessage({ type: "QUEUE_ADD", item: queueItem }));
          // Return fake success response
          return new Response(JSON.stringify({ offline: true, queued: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        })
      );
      return;
    }

    // GET requests — netwerk first, dan cache
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // HTML pagina's van sologics.site — netwerk first
  if (url.includes("sologics.site") || url.includes("localhost")) {
    e.respondWith(
      fetch(e.request, { cache: "no-store" }).catch(() => caches.match(e.request))
    );
    return;
  }

  // CDN bestanden — cache first
  if (url.includes("cdnjs.cloudflare.com") || url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com")) {
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

// Luister naar sync events (Background Sync API)
self.addEventListener("sync", (e) => {
  if (e.tag === "sync-offline-queue") {
    e.waitUntil(syncQueue());
  }
});

async function syncQueue() {
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage({ type: "SYNC_START" }));
}
