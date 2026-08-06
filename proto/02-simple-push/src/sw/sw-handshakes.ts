/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { get, createStore } from "idb-keyval";
import { gunzipSync } from "fflate";
import { DB_NAMES, STORE_NAMES, KEY_NAMES, MAX_TENTATIVAS } from "../constants/db.ts";
import { base64UrlToArrayBuffer } from "../utils/jwt-helpers.ts";
import {
  salvarHandshake,
  listarHandshakesPendentesPorTipo,
  atualizarStatusHandshake,
  buscarMensagemEnviada,
  atualizarStatusMensagemEnviada,
  salvarProfile,
  buscarContatoPorChave,
  buscarHandshake,
  buscarProfile,
  buscarChaveDecript,
  listarHandshakes,
} from "../utils/db-helpers.ts";
import { criarJWT } from "../utils/jwt-helpers.ts";
import { cifrarPayloadObj, enviarParaProxy, cifrarChaveVapid } from "../utils/push-utils.ts";

// ============================================================
// FUNÇÃO PARA PROCESSAR HANDSHAKE RECEBIDO (sub: "hand")
// ============================================================
export async function processarHandshakeRecebido(payload: any, header: any, jwt: string) {
  console.log("[SW-HANDSHAKE] 🤝 Processando handshake recebido...");

  try {
    if (!payload.jti) throw new Error("Handshake sem jti");
    if (!payload.aud) throw new Error("Handshake sem aud (mensagemId esperada)");
    if (!payload.ct) throw new Error("Handshake sem ct (envelope cifrado)");

    const privateDecryptKey = await buscarChaveDecript();
    if (!privateDecryptKey) {
      throw new Error("Chave privada RSA não disponível para decifrar handshake.");
    }

    const envelopeJson = payload.ct;
    const envelope = JSON.parse(envelopeJson);
    const iv = envelope.i || envelope.iv;
    const dados = envelope.d || envelope.dadosCifrados;
    const chaveAesCifrada = envelope.k || envelope.chaveAesCifrada;
    if (!iv || !dados || !chaveAesCifrada) throw new Error("Envelope incompleto.");

    const ivBytes = new Uint8Array(base64UrlToArrayBuffer(iv));
    const dadosBytes = new Uint8Array(base64UrlToArrayBuffer(dados));
    const chaveAesCifradaBytes = new Uint8Array(base64UrlToArrayBuffer(chaveAesCifrada));

    const aesChaveCruaBuffer = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateDecryptKey,
      chaveAesCifradaBytes
    );
    const chaveSimetricaAes = await crypto.subtle.importKey(
      "raw",
      aesChaveCruaBuffer,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
    const textoDecifradoBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes },
      chaveSimetricaAes,
      dadosBytes
    );
    const decompressed = gunzipSync(new Uint8Array(textoDecifradoBuffer));
    const textoDecifrado = new TextDecoder().decode(decompressed);
    const payloadObj = JSON.parse(textoDecifrado);

    if (!payloadObj.htype) throw new Error("Handshake sem htype no envelope");

    const mensagemId = payload.aud;

    const handshake = {
      id: payload.jti,
      mensagemId: mensagemId,
      tipo: payloadObj.htype,
      direcao: 'in',
      status: 'entregue',
      tentativas: 0,
      payload: payloadObj,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await salvarHandshake(handshake);
    console.log(`[SW-HANDSHAKE] ✅ Handshake ${handshake.id} (tipo: ${handshake.tipo}) recebido para mensagem ${mensagemId}.`);

    if (payloadObj.htype === 'confirmacao_entrega') {
      try {
        const mensagemEnviada = await buscarMensagemEnviada(mensagemId);
        if (mensagemEnviada) {
          await atualizarStatusMensagemEnviada(mensagemId, 'entregue');
          console.log(`[SW-HANDSHAKE] ✅ Mensagem enviada ${mensagemId} marcada como entregue.`);

          const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          clients.forEach(client => {
            client.postMessage({
              type: 'MENSAGEM_ENTREGUE',
              payload: {
                mensagemId: mensagemId,
                entregueEm: Date.now(),
              }
            });
          });
        } else {
          console.warn(`[SW-HANDSHAKE] ⚠️ Mensagem enviada ${mensagemId} não encontrada.`);
        }
      } catch (err) {
        console.error(`[SW-HANDSHAKE] ❌ Erro ao marcar mensagem enviada ${mensagemId} como entregue:`, err);
      }
    }

  } catch (err) {
    console.error("[SW-HANDSHAKE] ❌ Erro ao processar handshake:", err);
    throw err;
  }
}

// ============================================================
// FUNÇÃO PARA PROCESSAR FILA DE HANDSHAKES (envio)
// ============================================================
export async function processarFilaHandshake() {
  console.log("[SW-HANDSHAKE] 🔄 Processando fila de handshakes...");

  try {
    const pendentes = await listarHandshakesPendentesPorTipo('confirmacao_entrega');
    const todos = await listarHandshakes();
    const enviandoAntigos = todos.filter(
      h => h.tipo === 'confirmacao_entrega' &&
           h.direcao === 'out' &&
           h.status === 'enviando' &&
           (Date.now() - h.updatedAt) > 30000
    );

    const paraProcessar = [...pendentes, ...enviandoAntigos];

    if (paraProcessar.length === 0) {
      console.log("[SW-HANDSHAKE] ℹ️ Nenhum handshake pendente.");
      return;
    }

    console.log(`[SW-HANDSHAKE] 📦 ${paraProcessar.length} handshakes para processar (${pendentes.length} pendentes, ${enviandoAntigos.length} reenfileirados)`);

    for (const handshake of paraProcessar) {
      await atualizarStatusHandshake(handshake.id, 'enviando');

      try {
        const storeMensagensRecebidas = createStore(DB_NAMES.MENSAGENS_RECEBIDAS_B, STORE_NAMES.KEYVAL);
        const mensagemRecebida = await get(handshake.mensagemId, storeMensagensRecebidas);
        if (!mensagemRecebida) {
          throw new Error(`Mensagem ${handshake.mensagemId} não encontrada no banco.`);
        }

        const contato = await buscarContatoPorChave(mensagemRecebida.contatoPublicKeyVapid);
        if (!contato) {
          throw new Error(`Contato para a mensagem ${handshake.mensagemId} não encontrado.`);
        }

        let profile = await buscarProfile();
        if (!profile) throw new Error("Perfil não encontrado");

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

        const payloadObj = {
          htype: handshake.tipo,
        };

        const envelope = await cifrarPayloadObj(payloadObj, contato.publicKeyRSA);
        const envelopeJson = JSON.stringify(envelope);

        const payloadJwt = {
          iss: profile.email,
          sub: "hand",
          aud: handshake.mensagemId,
          jti: handshake.id,
          ct: envelopeJson,
        };

        const jwt = await criarJWT(payloadJwt, profile.vapidPrivateKeyJwk, { kid: profile.vapidPublicKey });

        console.log(`[SW-HANDSHAKE] 📤 Enviando handshake ${handshake.id} para ${contato.email}`);
const MAX_PAYLOAD_SIZE = 4096;
if (jwt.length > MAX_PAYLOAD_SIZE) {
  throw new Error(`Payload excede limite de ${MAX_PAYLOAD_SIZE} bytes (tamanho atual: ${jwt.length})`);
}
        await enviarParaProxy(
          contato.subscription,
          jwt,
          {
            subject: `mailto:${contato.email}`,
            publicKey: contato.publicKeyVapid,
            privateKey: contato.vapidPrivateKey,
          }
        );

        await atualizarStatusHandshake(handshake.id, 'enviado');
        console.log(`[SW-HANDSHAKE] ✅ Handshake ${handshake.id} enviado com sucesso!`);
      } catch (err) {
        console.error(`[SW-HANDSHAKE] ❌ Erro ao enviar handshake ${handshake.id}:`, err);
        const handshakeAtual = await buscarHandshake(handshake.id);
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
// LISTENERS DE EVENTOS
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