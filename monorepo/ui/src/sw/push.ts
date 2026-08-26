// src/sw/push.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { verificarJWT } from "../utils/jwt-helpers.ts";
import { processarHandshakeRecebido } from "./sw-handshakes.ts";
import { addDebugLog } from "../utils/debug-utils.ts";

addDebugLog("[SW-PUSH-ROUTER] 🔀 Event Listener de Push engatilhado.");

self.addEventListener('push', function (event) {
  if (!event.data) return;
  const rawText = event.data.text();
  addDebugLog(`[SW-PUSH-ROUTER] 📩 WebPush físico recebido! (Tamanho: ${rawText.length} bytes)`);

  if (rawText.split('.').length !== 3) {
    event.waitUntil(
      self.registration.showNotification("Notificação", { body: "Dados crus capturados." })
    );
    return;
  }

  // Envolve todo o fluxo de processamento assíncrono para garantir que o SW permaneça vivo
  event.waitUntil(
    (async function () {
      try {
        const { header, payload, valid } = await verificarJWT(rawText);
        
        if (!valid) {
          addDebugLog("[SW-PUSH-ROUTER] ⚠️ Assinatura de pacote rejeitada.");
          await self.registration.showNotification("⚠️ Assinatura inválida", {
            body: `Mensagem rejeitada por falha de integridade.`,
            icon: '/icon-192.png',
          });
          return;
        }

        // Redireciona o payload fechado de Handshake para nossa Máquina de Estados
        if (payload.sub === "hand") {
          await processarHandshakeRecebido(payload, header, rawText);
          return;
        }

        addDebugLog(`[SW-PUSH-ROUTER] ⚠️ JWT legado recebido e ignorado: ${payload.sub}`);
      } catch (err: any) {
        addDebugLog(`[SW-PUSH-ROUTER] ❌ Falha crítica no desempacotamento de Push: ${err.message}`);
        await self.registration.showNotification("⚠️ Erro de Rede", {
          body: "Falha criptográfica no processamento de uma mensagem recebida.",
          icon: '/icon-192.png',
        });
      }
    })()
  );
});