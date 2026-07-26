/// <reference lib="webworker" />

interface SyncEvent extends ExtendableEvent {
  tag: string;
}

interface PeriodicSyncEvent extends ExtendableEvent {
  tag: string;
}

interface NotificationAction {
  action: string;
  title: string;
}

declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = "loco-assets-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        )
      ),
    ]),
  );
});

interface PushData {
  type?: string;
  text?: string;
  displayName?: string;
  from?: string;
}

self.addEventListener("push", (event) => {
  let data: PushData = {};
  try {
    if (event.data) data = event.data.json();
  } catch { /* ignore */ }

  const title = data.type === "TEXT_MESSAGE"
    ? `💬 ${data.displayName || "Alguém"}`
    : data.type === "LOCATION_MESSAGE"
    ? `📍 ${data.displayName || "Alguém"} compartilhou localização`
    : data.type === "PROFILE_UPDATE"
    ? `🔄 Perfil atualizado`
    : data.type === "CALL_REQUEST"
    ? `📞 ${data.displayName || "Alguém"} está ligando`
    : "🔔 Notificação";

  const notificationOptions: NotificationOptions & {
    vibrate?: number[];
    renotify?: boolean;
    actions?: NotificationAction[];
  } = {
    body: data.text || "",
    vibrate: [100, 50, 100],
    data,
    tag: data.from || "default",
    renotify: true,
    actions: data.type === "CALL_REQUEST"
      ? [
        { action: "accept", title: "Atender" },
        { action: "decline", title: "Recusar" },
      ]
      : undefined,
  };

  event.waitUntil(
    self.registration.showNotification(title, notificationOptions),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.postMessage({
            type: "NOTIFICATION_CLICK",
            data: event.notification.data,
            action: event.action || "open",
          });
          return client.focus();
        }
      }
      return self.clients.openWindow("/");
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.pathname === "/share-target" && event.request.method === "POST") {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const params = new URLSearchParams();
          const title = formData.get("title")?.toString();
          const text = formData.get("text")?.toString();
          const urlStr = formData.get("url")?.toString();
          if (title) params.set("shared_title", title);
          if (text) params.set("shared_text", text);
          if (urlStr) params.set("shared_url", urlStr);
          return Response.redirect(`/?${params.toString()}`, 303);
        } catch {
          return Response.redirect("/?share_received=true", 303);
        }
      })(),
    );
    return;
  }

  if (
    event.request.destination === "script" ||
    event.request.destination === "style" ||
    event.request.destination === "image"
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) =>
              cache.put(event.request, clone)
            );
          }
          return response;
        });
      }),
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) =>
          cache.put(event.request, clone)
        );
        return response;
      })
      .catch(() => caches.match(event.request) as Promise<Response>),
  );
});

self.addEventListener(
  "sync",
  ((event: SyncEvent) => {
    if (event.tag === "sync-updates") {
      event.waitUntil(checkForUpdates());
    }
  }) as EventListener,
);

self.addEventListener(
  "periodicsync",
  ((event: PeriodicSyncEvent) => {
    if (event.tag === "check-static-updates") {
      event.waitUntil(checkForUpdates());
    }
  }) as EventListener,
);

async function checkForUpdates() {
  try {
    const res = await fetch("/version.json", { cache: "no-store" });
    const version = await res.json();
    const clients = await self.clients.matchAll({ type: "window" });
    for (const client of clients) {
      client.postMessage({ type: "UPDATE_AVAILABLE", version });
    }
  } catch { /* ignore */ }
}

export {};
