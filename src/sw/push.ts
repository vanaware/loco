/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { verificarJWT } from "../utils/jwt-helpers.ts";
import { processarHandshakeRecebido } from "./sw-handshakes.ts";
import type { PayloadHandshake } from "../constants/db.ts";

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

        // Tudo agora é Handshake!
        if (payload.sub === "hand") {
          await processarHandshakeRecebido(payload as PayloadHandshake, header, rawText);
          return;
        }

        // Se uma mensagem do modelo MUITO ANTIGO ("msg") chegar, ignoramos ou logamos
        console.warn(`[SW-PUSH-ROUTER] ⚠️ JWT legado recebido e ignorado: ${payload.sub}`);
      } catch (err: any) {
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