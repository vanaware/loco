/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { verificarJWT } from "../utils/jwt-helpers.ts";
import { processarMensagemRecebida } from "./sw-mensagens.ts";
import { processarHandshakeRecebido } from "./sw-handshakes.ts";
import type { PayloadMensagem, PayloadHandshake } from "../constants/db.ts";

console.log("[SW-PUSH-ROUTER] 🔀 Router de push carregado.");

self.addEventListener('push', function (event) {
  if (!event.data) return;
  const rawText = event.data.text();
  console.log("[SW-PUSH-ROUTER] 📩 Push recebido, tamanho:", rawText.length);

  if (rawText.split('.').length !== 3) {
    event.waitUntil(
      self.registration.showNotification("Notificação", { body: rawText })
    );
    return;
  }

  event.waitUntil(
    (async function () {
      try {
        const { header, payload, valid } = await verificarJWT(rawText);
        if (!valid) {
          await self.registration.showNotification("⚠️ Assinatura inválida", {
            body: `Mensagem rejeitada.`,
            icon: '/icon.png',
          });
          return;
        }

        if (payload.sub === "hand") {
          await processarHandshakeRecebido(payload as PayloadHandshake, header, rawText);
          return;
        }

        if (payload.sub === "msg") {
          await processarMensagemRecebida(payload as PayloadMensagem, header, rawText);
          return;
        }

        await self.registration.showNotification("⚠️ Tipo de mensagem inválido", {
          body: `Esperado 'msg' ou 'hand', recebido '${payload.sub}'`,
          icon: '/icon.png',
        });
        console.warn(`[SW-PUSH-ROUTER] ⚠️ JWT com sub inválido: ${payload.sub}`);
      } catch (err) {
        console.error("[SW-PUSH-ROUTER] ❌ Erro no router:", err);
        await self.registration.showNotification("⚠️ Erro ao processar push", {
          body: err.message || "Falha no processamento.",
          icon: '/icon.png',
        });
      }
    })()
  );
});

console.log("[SW-PUSH-ROUTER] ✅ Router configurado.");