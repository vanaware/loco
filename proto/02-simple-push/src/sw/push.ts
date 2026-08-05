/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { verificarJWT } from "../utils/jwt-helpers.ts";

// Importa as funções de processamento dos módulos
// Nota: as funções serão definidas no escopo global pelo próprio módulo
// mas vamos importar os módulos para garantir que sejam carregados.

// Apenas para garantir que os módulos sejam executados e registrem seus listeners
import "./sw-mensagens.ts";
import "./sw-handshakes.ts";

// Não importamos funções diretamente porque elas serão chamadas via self (global)
// ou via postMessage. O router apenas verifica o sub e dispara a lógica
// que já está nos módulos.

// Mas precisamos de uma maneira de chamar as funções de processamento.
// Vamos definir um dispatch centralizado.

// Como os módulos exportam funções que são atribuídas a self, podemos chamá-las diretamente.

// No entanto, para evitar conflitos, vamos manter a lógica de roteamento aqui.

console.log("[SW-PUSH-ROUTER] 🔀 Router de push carregado.");

// O evento push será manipulado por este módulo, que fará o roteamento.
self.addEventListener('push', function (event) {
  if (!event.data) return;
  const rawText = event.data.text();
  console.log("[SW-PUSH-ROUTER] 📩 Push recebido, tamanho:", rawText.length);

  // Se não parecer JWT, exibe como notificação simples
  if (rawText.split('.').length !== 3) {
    event.waitUntil(
      self.registration.showNotification("Notificação", { body: rawText })
    );
    return;
  }

  event.waitUntil(
    (async function () {
      try {
        // Verifica assinatura JWT
        const { header, payload, valid } = await verificarJWT(rawText);
        if (!valid) {
          await self.registration.showNotification("⚠️ Assinatura inválida", {
            body: `Mensagem rejeitada.`,
            icon: '/icon.png',
          });
          return;
        }

        // Roteamento baseado no sub
        if (payload.sub === "hand") {
          // Delegar para o processador de handshakes
          if (typeof self.processarHandshakeRecebido === 'function') {
            await self.processarHandshakeRecebido(payload, header, rawText);
          } else {
            console.error("[SW-PUSH-ROUTER] ❌ processarHandshakeRecebido não está definido.");
          }
          return;
        }

        if (payload.sub === "msg") {
          // Delegar para o processador de mensagens
          if (typeof self.processarMensagemRecebida === 'function') {
            await self.processarMensagemRecebida(payload, header, rawText);
          } else {
            console.error("[SW-PUSH-ROUTER] ❌ processarMensagemRecebida não está definido.");
          }
          return;
        }

        // Se não for msg nem hand, rejeita
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

// Adicionalmente, expomos um método para processar mensagens recebidas via postMessage,
// caso a página queira enviar algo para o SW processar (ex: recarregar filas, etc.)
// Mas isso já está nos módulos específicos.

console.log("[SW-PUSH-ROUTER] ✅ Router configurado.");