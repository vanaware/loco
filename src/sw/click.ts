// src/sw/click.js

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

self.addEventListener('notificationclick', function(event) {
  console.log("[SW-CLICK] 🔗 ===== CLIQUE NA NOTIFICAÇÃO DETECTADO =====");
  event.notification.close();
  const urlParaAbrir = new URL('/', self.location.origin).href;
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(windowClients) {
        // Tenta focar uma janela existente
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (client.url === urlParaAbrir && 'focus' in client) {
            try {
              return client.focus();
            } catch (err) {
              console.warn("[SW-CLICK] ⚠️ Não foi possível focar a janela:", err.message);
              // Se falhar, continua para abrir uma nova
              break;
            }
          }
        }
        // Se não encontrou ou não conseguiu focar, abre uma nova
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlParaAbrir)
            .catch(function(err) {
              console.warn("[SW-CLICK] ⚠️ Não foi possível abrir janela:", err.message);
              // Se falhar, tenta abrir com target _blank? Não há suporte direto, mas podemos ignorar.
              // Retornamos uma promessa resolvida para não travar o SW.
              return Promise.resolve();
            });
        }
      })
  );
});