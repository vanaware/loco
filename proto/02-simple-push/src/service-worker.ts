// src/service-worker.ts
import "./sw/cache.ts";
import "./sw/push.ts";
import "./sw/click.ts";
import "./sw/sw-mensagens.ts";
import "./sw/sw-handshakes.ts";

console.log("[SW] 🌌 Service Worker orquestrador carregado.");

// Ativação: processar filas pendentes
self.addEventListener('activate', (event) => {
  console.log("[SW] 🔄 Ativando e agendando processamento de filas pendentes...");
  event.waitUntil(
    (async () => {
      await new Promise(r => setTimeout(r, 1000));
      setTimeout(async () => {
        try {
          if (self.processarFilaEnvio) {
            await self.processarFilaEnvio();
          }
        } catch (e) {
          console.error("[SW] Erro ao processar fila de envio:", e);
        }
        try {
          if (self.processarFilaHandshake) {
            await self.processarFilaHandshake();
          }
        } catch (e) {
          console.error("[SW] Erro ao processar fila de handshakes:", e);
        }
      }, 100);
    })()
  );
});