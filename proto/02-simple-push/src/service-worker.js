// src/service-worker.js

// Importa os módulos fatiados
import "./sw/cache.js";
import "./sw/push.js";
import "./sw/sync.js";
import "./sw/click.js";
import "./sw/sw-mensagens.js"; // 🔥 NOVO - Processador de mensagens

console.log("[SW] 🌌 Orquestrador Modular do Service Worker carregado com sucesso!");

// 🔥 PROCESSADOR DE FILAS EM BACKGROUND
// Tenta processar filas quando o SW é ativado
self.addEventListener('activate', (event) => {
  console.log("[SW] 🔄 Ativando e processando filas pendentes...");
  event.waitUntil(async () => {
    // Aguarda um pouco para garantir que tudo está pronto
    await new Promise(r => setTimeout(r, 1000));
    
    // Processa filas
    if (self.processarFilaEnvio) {
      await self.processarFilaEnvio();
    }
    if (self.processarFilaNotificacao) {
      await self.processarFilaNotificacao();
    }
  }());
});