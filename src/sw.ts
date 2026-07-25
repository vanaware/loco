declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = "push-p2p-assets-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(keys => 
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      )
    ])
  );
});

// ===== PUSH NOTIFICATIONS =====
self.addEventListener("push", (event) => {
  let data: any = {};
  try { if (event.data) data = event.data.json(); } catch {}

  const title = data.type === "TEXT_MESSAGE"
    ? `💬 ${data.displayName || "Alguém"}`
    : data.type === "LOCATION_MESSAGE"
    ? `📍 ${data.displayName || "Alguém"} compartilhou localização`
    : data.type === "PROFILE_UPDATE"
    ? `🔄 Perfil atualizado`
    : data.type === "CALL_REQUEST"
    ? `📞 ${data.displayName || "Alguém"} está ligando`
    : "🔔 Notificação";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.text || "",
      vibrate: [100, 50, 100],
      data,
      tag: data.from || "default",
      renotify: true,
      actions: data.type === "CALL_REQUEST" ? [
        { action: "accept", title: "Atender" },
        { action: "decline", title: "Recusar" }
      ] : undefined,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.postMessage({ 
            type: "NOTIFICATION_CLICK", 
            data: event.notification.data,
            action: event.action || "open"
          });
          return c.focus();
        }
      }
      return self.clients.openWindow("/");
    })
  );
});

// ===== FETCH - Network First, Fallback Cache =====
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  
  // Share Target handler
  if (url.pathname === "/share-target" && event.request.method === "POST") {
    event.respondWith(Response.redirect("/?share_received=true", 303));
    return;
  }

  // Assets estáticos - Cache First
  if (event.request.destination === "script" || 
      event.request.destination === "style" ||
      event.request.destination === "image") {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // HTML - Network First
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request) as any)
  );
});

// ===== BACKGROUND SYNC =====
self.addEventListener("sync", (event: any) => {
  if (event.tag === "sync-updates") {
    event.waitUntil(checkForUpdates());
  }
});

self.addEventListener("periodicsync", (event: any) => {
  if (event.tag === "check-static-updates") {
    event.waitUntil(checkForUpdates());
  }
});

async function checkForUpdates() {
  try {
    const res = await fetch("/version.json", { cache: "no-store" });
    const version = await res.json();
    const clients = await self.clients.matchAll({ type: "window" });
    for (const client of clients) {
      client.postMessage({ type: "UPDATE_AVAILABLE", version });
    }
  } catch {}
}

export {};
