/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

interface PushPayload {
  title?: string;
  text?: string;
  fromId?: string;
}

self.addEventListener("install", (event) => {
  console.log("[SW] 📦 Instalação iniciada");
  console.log("[SW]   scope:", self.registration?.scope ?? "não disponível");
  event.waitUntil(
    (async () => {
      console.log("[SW] ⏳ Aguardando conclusão da instalação...");
      self.skipWaiting();
      console.log("[SW] ✅ skipWaiting() chamado - ativando imediatamente");
    })(),
  );
});

self.addEventListener("activate", (event) => {
  console.log("[SW] ⚡ Ativação iniciada");
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: "window" });
      console.log("[SW] ✅ clients.claim() concluído");
      console.log("[SW]   Clientes sob controle:", clients.length);
    })(),
  );
});

self.addEventListener("push", (event) => {
  console.log("[SW] 📩 ===== PUSH EVENT RECEBIDO =====");
  console.log("[SW] 📩 timestamp:", new Date().toISOString());
  console.log("[SW] 📩 event.data:", event.data ? "presente" : "null");
  if (event.data) {
    console.log("[SW] 📩 event.data.source:", typeof event.data);
  }

  let payload: PushPayload = {};
  if (event.data) {
    try {
      const rawText = event.data.text();
      console.log("[SW] 📦 raw text received:", rawText.slice(0, 300));
      
      try {
        payload = JSON.parse(rawText);
        console.log("[SW] ✅ payload parseado:", JSON.stringify(payload));
      } catch (parseError) {
        console.warn("[SW] ⚠️ falha ao parsear JSON:", parseError instanceof Error ? parseError.message : String(parseError));
        payload = { text: rawText };
      }
    } catch (readError) {
      console.error("[SW] ❌ erro ao ler event.data:", readError instanceof Error ? readError.message : String(readError));
    }
  } else {
    console.warn("[SW] ⚠️ event.data é null — possível falha de descriptografia ou mensagem vazia");
  }

  const title = payload.title ?? "Nova mensagem";
  const body = payload.text ?? "";
  const data = payload;

  console.log("[SW] 📢 Preparing notification - Title:", title, "Body:", body?.slice(0, 50));

  event.waitUntil(
    (async () => {
      try {
        console.log("[SW] 📢 Exibindo notificação:", title);
        await self.registration.showNotification(title, {
          body,
          data,
        });
        console.log("[SW] ✅ Notificação exibida");
      } catch (e) {
        console.error("[SW] ❌ Erro ao exibir notificação:", e);
      }

      const clients = await self.clients.matchAll({ type: "window" });
      console.log("[SW] 🔍 Clientes encontrados:", clients.length);
      if (clients.length === 0) {
        console.warn("[SW] ⚠️ Nenhum cliente (abas/pegs) encontradas - mensagem não será entregue ao app");
      } else {
        for (const client of clients) {
          console.log("[SW] 📨 Enviando mensagem ao cliente:", client.url?.slice(0, 50));
          client.postMessage({
            type: "PUSH_MESSAGE",
            payload: data,
          });
        }
        console.log("[SW] ✅ Mensagem enviada a", clients.length, "cliente(s)");
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  console.log("[SW] 🖱️ Notification click received");
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((list) => {
      console.log("[SW] 🔍 Janelas abertas:", list.length);
      for (const client of list) {
        if ("focus" in client) {
          console.log("[SW] 🎯 Focando janela:", client.url?.slice(0, 50));
          return client.focus();
        }
      }
      console.log("[SW] ⚠️ Nenhuma janela aberta, abrindo nova...");
      const newWindow = self.clients.openWindow("/");
      console.log("[SW] ✅ Abrindo nova janela em /");
      return newWindow;
    }),
  );
});

export {};
