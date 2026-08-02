// src/service-worker.js

// Importa os módulos fatiados (sem sync.js)
import "./sw/cache.js";
import "./sw/push.js";
import "./sw/click.js";
import "./sw/sw-mensagens.js";

console.log("[SW] 🌌 Orquestrador Modular do Service Worker carregado com sucesso!");

// 🔥 PROCESSADOR DE FILAS EM BACKGROUND
// Tenta processar filas quando o SW é ativado
self.addEventListener('activate', (event) => {
  console.log("[SW] 🔄 Ativando e agendando processamento de filas pendentes...");
  event.waitUntil(
    (async () => {
      // Aguarda um pouco para garantir que tudo está pronto
      await new Promise(r => setTimeout(r, 1000));
      
      // Dispara o processamento em segundo plano, sem bloquear a ativação
      setTimeout(async () => {
        try {
          if (self.processarFilaEnvio) {
            await self.processarFilaEnvio();
          }
        } catch (e) {
          console.error("[SW] Erro ao processar fila de envio:", e);
        }
        try {
          if (self.processarFilaNotificacao) {
            await self.processarFilaNotificacao();
          }
        } catch (e) {
          console.error("[SW] Erro ao processar fila de notificações:", e);
        }
      }, 100);
    })()
  );
});