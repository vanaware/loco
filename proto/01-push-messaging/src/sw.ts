/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

interface PushPayload {
  title?: string;
  text?: string;
  fromId?: string;
}

self.addEventListener("install", () => {
  console.log("[SW] Push prototype instalado");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload: PushPayload = {};
  try {
    if (event.data) {
      payload = event.data.json();
    }
  } catch {
    // payload inválido
  }

  const title = payload.title ?? "Nova mensagem";
  const body = payload.text ?? "";
  const data = payload;

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, {
        body,
        data,
      });

      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        client.postMessage({
          type: "PUSH_MESSAGE",
          payload: data,
        });
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow("/");
    }),
  );
});

export {};
