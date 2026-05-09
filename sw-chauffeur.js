const CACHE = "sologics-chauffeur-v1";
const OFFLINE_QUEUE_KEY = "sl_offline_queue";

// Bestanden om te cachen voor offline gebruik
const ASSETS = [
  "/SOLOGICS/chauffeur.html",
  "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Bebas+Neue&display=swap",
  "https://unpkg.com/react@18/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js",
  "https://unpkg.com/@babel/standalone/babel.min.js",
];

// Install — cache alle assets
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

// Activate — verwijder oude caches
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — serve van cache als offline
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Supabase API calls — probeer netwerk, sla op als offline
  if (url.hostname.includes("supabase.co")) {
    if (e.request.method === "POST" || e.request.method === "PATCH") {
      e.respondWith(
        fetch(e.request.clone()).catch(async () => {
          // Offline — sla op in queue
          const body = await e.request.clone().text();
          const queue = JSON.parse(self.registration.scope + OFFLINE_QUEUE_KEY || "[]");
          queue.push({
            url: e.request.url,
            method: e.request.method,
            headers: Object.fromEntries(e.request.headers.entries()),
            body,
            timestamp: Date.now(),
          });
          // Return fake success
          return new Response(JSON.stringify({ offline: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        })
      );
      return;
    }
  }

  // Statische bestanden — cache first
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(e.request, clone));
        }
        return res;
      }).catch(() => cached || new Response("Offline", { status: 503 }));
    })
  );
});

// Sync — verstuur opgeslagen requests als online
self.addEventListener("sync", (e) => {
  if (e.tag === "sync-offline-queue") {
    e.waitUntil(syncQueue());
  }
});

async function syncQueue() {
  try {
    const stored = await self.registration.scope;
    // Queue sync logic here
  } catch (e) {}
}
