/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { get, createStore } from "idb-keyval";
import { DB_NAMES, STORE_NAMES, MAX_TENTATIVAS } from "../constants/db.ts";
import {
  buscarProfile,
  buscarContatoPorChave,
  salvarProfile,
  listarHandshakesPendentesPorTipo,
  atualizarStatusHandshake,
  salvarHandshake,
} from "../utils/db-helpers.ts";
import { criarJWT } from "../utils/jwt-helpers.ts";
import { cifrarPayloadObj, enviarParaProxy, cifrarChaveVapid } from "../utils/push-utils.ts";

// ============================================================
// STORE CONFIG (para acesso direto, se necessário)
// ============================================================
const storeConfig = createStore(DB_NAMES.CONFIG, STORE_NAMES.KEYVAL);

// ============================================================
// FUNÇÃO PRINCIPAL: PROCESSAR FILA DE HANDSHAKES
// ============================================================
export async function processarFilaHandshake() {
  console.log("[SW-HANDSHAKE] 🔄 Processando fila de handshakes...");

  try {
    // Busca handshakes pendentes do tipo 'confirmacao_entrega'
    const pendentes = await listarHandshakesPendentesPorTipo('confirmacao_entrega');
    // Também busca handshakes 'enviando' travados (mais de 30 segundos)
    const todos = await listarHandshakesPendentesPorTipo('confirmacao_entrega');
    const travados = todos.filter(h => h.status === 'enviando' && (Date.now() - h.updatedAt) > 30000);
    const paraProcessar = [...pendentes, ...travados];

    if (paraProcessar.length === 0) {
      console.log("[SW-HANDSHAKE] ℹ️ Nenhum handshake pendente.");
      return;
    }

    console.log(`[SW-HANDSHAKE] 📦 ${paraProcessar.length} handshakes para processar`);

    for (const handshake of paraProcessar) {
      await atualizarStatusHandshake(handshake.id, 'enviando');

      try {
        // 1. Buscar contato a partir do mensagemId (precisamos recuperar a mensagem recebida para saber o emissor)
        const storeMensagensRecebidas = createStore(DB_NAMES.MENSAGENS_RECEBIDAS_B, STORE_NAMES.KEYVAL);
        const mensagemRecebida = await get(handshake.mensagemId, storeMensagensRecebidas);
        if (!mensagemRecebida) {
          throw new Error(`Mensagem ${handshake.mensagemId} não encontrada no banco.`);
        }

        // Obter contato pelo hash armazenado na mensagem
        const contato = await buscarContatoPorChave(mensagemRecebida.contatoPublicKeyVapid);
        if (!contato) {
          throw new Error(`Contato para a mensagem ${handshake.mensagemId} não encontrado.`);
        }

        // 2. Buscar perfil do emissor do handshake (nós)
        let profile = await buscarProfile();
        if (!profile) throw new Error("Perfil não encontrado");

        // 3. Validações
        if (!profile.e2ePublicKey || !profile.vapidPublicKey || !profile.vapidPrivateKeyJwk) {
          throw new Error("Usuário não logado (sem Chaves)");
        }
        if (!profile.subscription) {
          throw new Error("Web Push não configurado (sem Subscription)");
        }
        if (!contato.publicKeyRSA || !contato.publicKeyVapid || !contato.vapidPrivateKey) {
          throw new Error("Contato sem Chaves");
        }
        if (!contato.subscription) {
          throw new Error("Contato sem Subscription");
        }

        // 4. Obter envelope da chave VAPID do emissor (nós)
        let vapidPrivateKeyEnvelope = profile.vapidPrivateKeyEnvelope;
        if (!vapidPrivateKeyEnvelope) {
          console.warn("[SW-HANDSHAKE] ⚠️ Envelope VAPID não encontrado. Cifrando...");
          const res = await fetch("/api/server-public-key");
          if (!res.ok) throw new Error("Não foi possível obter chave pública do servidor.");
          const serverPublicKeyJwk = await res.json();
          vapidPrivateKeyEnvelope = await cifrarChaveVapid(profile.vapidPrivateKeyJwk, serverPublicKeyJwk);
          profile.vapidPrivateKeyEnvelope = vapidPrivateKeyEnvelope;
          await salvarProfile(profile);
        }

        // 5. Montar payloadObj do handshake (apenas htype)
        const payloadObj = {
          htype: handshake.tipo, // ex: "confirmacao_entrega"
          // mid NÃO está aqui – será o aud do JWT
        };

        // 6. Cifrar payloadObj
        const envelope = await cifrarPayloadObj(payloadObj, contato.publicKeyRSA);
        const envelopeJson = JSON.stringify(envelope);

        // 7. Construir JWT com sub: "hand", aud = mensagemId
        const payloadJwt = {
          iss: profile.email,
          sub: "hand",
          aud: handshake.mensagemId, // 🔥 ID da mensagem original (para confirmação de entrega)
          jti: handshake.id,         // ID do handshake
          ct: envelopeJson,          // envelope cifrado com { htype }
        };

        const jwt = await criarJWT(payloadJwt, profile.vapidPrivateKeyJwk, { kid: profile.vapidPublicKey });

        console.log(`[SW-HANDSHAKE] 📤 Enviando handshake ${handshake.id} para ${contato.email}`);

        // 8. Enviar para proxy
        await enviarParaProxy(
          contato.subscription,
          jwt,
          {
            subject: `mailto:${contato.email}`,
            publicKey: contato.publicKeyVapid,
            privateKey: contato.vapidPrivateKey,
          }
        );

        // 9. Atualizar status para 'enviado'
        await atualizarStatusHandshake(handshake.id, 'enviado');
        console.log(`[SW-HANDSHAKE] ✅ Handshake ${handshake.id} enviado com sucesso!`);
      } catch (err) {
        console.error(`[SW-HANDSHAKE] ❌ Erro ao enviar handshake ${handshake.id}:`, err);
        const handshakeAtual = await get(handshake.id, createStore(DB_NAMES.HANDSHAKES, STORE_NAMES.KEYVAL));
        if (handshakeAtual) {
          handshakeAtual.tentativas++;
          handshakeAtual.erro = err.message;
          if (handshakeAtual.tentativas >= MAX_TENTATIVAS) {
            handshakeAtual.status = 'falha';
            console.log(`[SW-HANDSHAKE] ⛔ Handshake ${handshake.id} excedeu tentativas máximas.`);
          } else {
            handshakeAtual.status = 'pendente';
          }
          handshakeAtual.updatedAt = Date.now();
          await salvarHandshake(handshakeAtual);
        }
      }
    }
  } catch (err) {
    console.error("[SW-HANDSHAKE] ❌ Erro ao processar fila:", err);
  }
}

// ============================================================
// EXPORTA FUNÇÃO PARA USO EXTERNO (APP)
// ============================================================
self.processarFilaHandshake = processarFilaHandshake;

// ============================================================
// LISTENERS DE EVENTOS PARA DISPARAR PROCESSAMENTO
// ============================================================
self.addEventListener('message', async (event) => {
  const data = event.data;
  if (data.type === 'PROCESSAR_FILA_HANDSHAKE') {
    console.log("[SW-HANDSHAKE] 📩 Recebido comando para processar fila de handshakes.");
    await processarFilaHandshake();
  }
});

self.addEventListener('sync', async function (event) {
  if (event.tag === 'sync-envio-handshakes') {
    event.waitUntil(processarFilaHandshake());
  }
});

self.addEventListener('online', async function () {
  console.log("[SW-HANDSHAKE] 🌐 Conexão restaurada, processando handshakes...");
  await processarFilaHandshake();
});

console.log("[SW-HANDSHAKE] 📦 Módulo de handshakes carregado.");