// src/sw/click.ts

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

self.addEventListener('notificationclick', function(event: any) {
  console.log("[SW-CLICK] 🔗 ===== CLIQUE NA NOTIFICAÇÃO DETECTADO =====");
  event.notification.close();
  
  // 🔥 ARQUITETURA: Usa o escopo do Service Worker registrado em vez de '/' hardcoded.
  // Isso garante que o clique na notificação abra o app no diretório correto (ex: Github Pages).
  const urlParaAbrir = new URL(self.registration.scope).href;
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(windowClients) {
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (client && client.url === urlParaAbrir && 'focus' in client) {
            try {
              return client.focus();
            } catch (err: any) {
              console.warn("[SW-CLICK] ⚠️ Não foi possível focar a janela:", err.message);
              break;
            }
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlParaAbrir)
            .catch(function(err: any) {
              console.warn("[SW-CLICK] ⚠️ Não foi possível abrir janela:", err.message);
              return Promise.resolve();
            });
        }
      })
  );
});