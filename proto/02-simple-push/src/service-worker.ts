// src/service-worker.ts
import "./sw/cache.ts";
import "./sw/push.ts";
import "./sw/click.ts";
import "./sw/sw-mensagens.ts";
import "./sw/sw-handshakes.ts";
import { processarFilaEnvio } from "./sw/sw-mensagens.ts";
import { processarFilaHandshake } from "./sw/sw-handshakes.ts";

console.log("[SW] 🌌 Service Worker orquestrador carregado.");

// Ativação: processar filas pendentes (com await adequado)
self.addEventListener('activate', (event) => {
  console.log("[SW] 🔄 Ativando e agendando processamento de filas pendentes...");
  event.waitUntil(
    (async () => {
      // Aguarda 1 segundo antes de iniciar
      await new Promise(r => setTimeout(r, 1000));
      try {
        await processarFilaEnvio();
      } catch (e) {
        console.error("[SW] Erro ao processar fila de envio:", e);
      }
      try {
        await processarFilaHandshake();
      } catch (e) {
        console.error("[SW] Erro ao processar fila de handshakes:", e);
      }
    })()
  );
});