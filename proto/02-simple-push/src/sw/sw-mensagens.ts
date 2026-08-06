/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { get, set, createStore, del, entries } from "idb-keyval";
import { gunzipSync } from "fflate";
import { DB_NAMES, STORE_NAMES, KEY_NAMES, MAX_TENTATIVAS } from "../constants/db.ts";
import { base64UrlToArrayBuffer, criarJWT } from "../utils/jwt-helpers.ts";
import { gerarIdMensagem } from "../utils/id-utils.ts";
import {
  buscarContatoPorChave,
  serializarPublicKeyVapid,
  listarHandshakesPorMensagemId,
  salvarHandshake,
  listarMensagensEnviadasPorStatus,
  atualizarStatusMensagemEnviada,
  salvarMensagemEnviada,
  buscarMensagemEnviada,
  salvarProfile,
  buscarProfile,
  buscarChaveDecript,
  salvarContato,
  buscarContatoPorPublicKey,
  salvarMensagemRecebida,
} from "../utils/db-helpers.ts";
import { cifrarPayloadObj, enviarParaProxy, cifrarChaveVapid } from "../utils/push-utils.ts";
import { processarFilaHandshake } from "./sw-handshakes.ts";

// ============================================================
// FUNÇÃO PRINCIPAL: PROCESSAR MENSAGEM RECEBIDA (sub: "msg")
// ============================================================
export async function processarMensagemRecebida(payload: any, header: any, jwt: string) {
  console.log("[SW-MSG] 📩 Processando mensagem recebida...");

  try {
    const profile = await buscarProfile();
    if (!profile) {
      throw new Error("Perfil do receptor não encontrado.");
    }

    const aud = payload.aud || payload.sub;
    if (aud !== profile.email) {
      console.warn(`[SW-MSG] ⚠️ 'aud' não corresponde ao email do perfil. Esperado: ${profile.email}, Recebido: ${aud}`);
    }

    const jti = payload.jti || gerarIdMensagem();
    console.log(`[SW-MSG] 📋 jti: ${jti}`);

    const publicKeyVapid = header.kid;
    if (!publicKeyVapid) {
      throw new Error("Header JWT não contém 'kid' (chave pública VAPID).");
    }

    const emailRemetente = payload.iss || "remetente@desconhecido";
    const nomeRemetente = payload.nm || payload.name || emailRemetente.split('@')[0] || "Remetente";
    console.log(`[SW-MSG] 🔐 Mensagem de ${nomeRemetente} <${emailRemetente}>`);

    let contato = null;
    if (publicKeyVapid) {
      contato = await buscarContatoPorPublicKey(publicKeyVapid);
      if (contato) {
        console.log(`[SW-MSG] Contato existente encontrado: ${contato.email}`);
      }
    }

    const privateDecryptKey = await buscarChaveDecript();
    if (!privateDecryptKey) {
      throw new Error("Chave privada RSA de decodificação não encontrada.");
    }

    const envelopeJson = payload.ct || payload.cipherText;
    if (!envelopeJson) throw new Error("Envelope não encontrado.");

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

    let mensagemObj = JSON.parse(textoDecifrado);
    const conteudo = mensagemObj.c || textoDecifrado;

    const e = mensagemObj.e || {};
    const subscription = e.s ? {
      endpoint: e.s.e || e.s.endpoint,
      keys: e.s.k || e.s.keys
    } : null;
    const publicKeyRSA = e.p || null;
    const vapidPrivateKey = (e.s && e.s.v) ? e.s.v : null;

    if (publicKeyVapid && publicKeyRSA && subscription) {
      let contatoExistente = await buscarContatoPorPublicKey(publicKeyVapid);
      const novoContato = {
        publicKeyVapid: publicKeyVapid,
        email: emailRemetente,
        nome: contatoExistente?.nome || nomeRemetente,
        publicKeyRSA: publicKeyRSA,
        subscription: subscription,
        vapidPrivateKey: vapidPrivateKey || '',
        homologado: contatoExistente ? contatoExistente.homologado : false,
        createdAt: contatoExistente ? contatoExistente.createdAt : Date.now(),
        updatedAt: Date.now()
      };
      await salvarContato(novoContato);
      contato = novoContato;
    } else {
      console.warn("[SW-MSG] ⚠️ Dados insuficientes para salvar contato.");
    }

    const msgId = jti;
    const contatoKey = publicKeyVapid ? await serializarPublicKeyVapid(publicKeyVapid) : '';
    const mensagemRecebida = {
      id: msgId,
      contatoPublicKeyVapid: contatoKey,
      conteudo: conteudo,
      status: 'nao_lida',
      recebidoEm: Date.now()
    };
    await salvarMensagemRecebida(mensagemRecebida);

    if (contatoKey) {
      await criarHandshakeConfirmacaoEntrega(msgId, contatoKey);
    } else {
      console.warn("[SW-MSG] ⚠️ Não foi possível criar handshake: contatoKey vazio.");
    }

    const homologadoFinal = contato ? contato.homologado : false;
    const podeResponder = !!(contato && contato.subscription && contato.publicKeyRSA && contato.vapidPrivateKey);
    const statusEmoji = homologadoFinal ? '✅' : '🔄';
    const statusTexto = homologadoFinal ? 'Homologado' : 'Não homologado';

    let bodyNotificacao = `${conteudo}\n\n${statusEmoji} De: ${nomeRemetente} - ${statusTexto}`;
    if (aud !== profile.email) {
      bodyNotificacao += `\n⚠️ Esta mensagem foi enviada para outro destinatário (${aud})`;
    }

    await self.registration.showNotification(`📥 Nova mensagem`, {
      body: bodyNotificacao,
      icon: '/icon.png',
      data: {
        mensagemId: msgId,
        publicKeyVapid: publicKeyVapid,
        homologado: homologadoFinal,
        podeResponder: podeResponder,
        acao: homologadoFinal ? 'ver_mensagem' : 'homologar_emissor'
      },
      tag: msgId,
      requireInteraction: !homologadoFinal,
      vibrate: [200, 100, 200]
    });

    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(client => {
      client.postMessage({
        type: "PUSH_RECEIVED",
        payload: {
          id: msgId,
          body: conteudo,
          remetente: nomeRemetente,
          homologado: homologadoFinal,
          podeResponder: podeResponder,
          status: 'nao_lida',
          audMismatch: aud !== profile.email
        }
      });
    });

  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao processar mensagem:", err);
    throw err;
  }
}

// ============================================================
// FUNÇÃO PARA CRIAR HANDSHAKE DE CONFIRMAÇÃO DE ENTREGA
// ============================================================
async function criarHandshakeConfirmacaoEntrega(mensagemId: string, contatoPublicKeyVapid: string) {
  console.log(`[SW-MSG] 🔄 Criando handshake de confirmação para mensagem ${mensagemId}`);
  try {
    const handshakesExistentes = await listarHandshakesPorMensagemId(mensagemId);
    if (handshakesExistentes.some(h => h.tipo === 'confirmacao_entrega' && h.direcao === 'out')) {
      console.log(`[SW-MSG] ℹ️ Handshake de confirmação já existe para ${mensagemId}.`);
      return;
    }

    const contato = await buscarContatoPorChave(contatoPublicKeyVapid);
    if (!contato) {
      throw new Error(`Contato para a mensagem ${mensagemId} não encontrado.`);
    }

    const handshakeId = gerarIdMensagem();
    const handshake = {
      id: handshakeId,
      mensagemId: mensagemId,
      tipo: 'confirmacao_entrega',
      direcao: 'out',
      status: 'pendente',
      tentativas: 0,
      payload: { recebidoEm: Date.now() },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await salvarHandshake(handshake);
    console.log(`[SW-MSG] ✅ Handshake ${handshakeId} salvo com status 'pendente'.`);

    // Disparar processamento imediato da fila de handshakes (agora com importação direta)
    await processarFilaHandshake();
    console.log(`[SW-MSG] ✅ Processamento da fila de handshakes iniciado.`);

    // Notifica janelas abertas (opcional)
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(client => {
      client.postMessage({ type: 'HANDSHAKE_CRIADO', payload: { handshakeId, mensagemId } });
    });

  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao criar handshake:", err);
  }
}

// ============================================================
// FUNÇÃO DE PROCESSAMENTO DA FILA DE ENVIO
// ============================================================
export async function processarFilaEnvio() {
  console.log("[SW-MSG] 🔄 Processando fila de envio...");

  try {
    const pendentes = await listarMensagensEnviadasPorStatus('pendente');
    const enviandoAntigos = (await listarMensagensEnviadasPorStatus('enviando'))
      .filter(m => (Date.now() - m.updatedAt) > 30000);

    const paraProcessar = [...pendentes, ...enviandoAntigos];

    if (paraProcessar.length === 0) {
      console.log("[SW-MSG] ℹ️ Nenhuma mensagem pendente para enviar.");
      return;
    }

    console.log(`[SW-MSG] 📦 ${paraProcessar.length} mensagens para processar`);

    for (const msg of paraProcessar) {
      await atualizarStatusMensagemEnviada(msg.id, 'enviando');

      try {
        const contato = await buscarContatoPorChave(msg.contatoHash);
        let profile = await buscarProfile();

        if (!contato) throw new Error("Contato não encontrado");
        if (!profile) throw new Error("Perfil não encontrado");

        if (!profile.e2ePublicKey || !profile.vapidPublicKey || !profile.vapidPrivateKeyJwk) {
          throw new Error("Usuário não logado (sem Chaves)");
        }
        if (!profile.subscription) {
          throw new Error("Mensagens Web Push não configurada (sem Subscription)");
        }
        if (!contato.publicKeyRSA || !contato.publicKeyVapid || !contato.vapidPrivateKey) {
          throw new Error("Contato sem Chaves");
        }
        if (!contato.subscription) {
          throw new Error("Contato sem Subscription");
        }

        let vapidPrivateKeyEnvelope = profile.vapidPrivateKeyEnvelope;
        if (!vapidPrivateKeyEnvelope) {
          console.warn("[SW-MSG] ⚠️ Envelope da chave VAPID não encontrado. Cifrando...");
          const res = await fetch("/api/server-public-key");
          if (!res.ok) throw new Error("Não foi possível obter a chave pública do servidor.");
          const serverPublicKeyJwk = await res.json();
          vapidPrivateKeyEnvelope = await cifrarChaveVapid(profile.vapidPrivateKeyJwk, serverPublicKeyJwk);
          profile.vapidPrivateKeyEnvelope = vapidPrivateKeyEnvelope;
          await salvarProfile(profile);
        }

        const payloadObj = {
          c: msg.conteudo,
          e: {
            s: {
              e: profile.subscription.endpoint,
              k: profile.subscription.keys,
              v: vapidPrivateKeyEnvelope
            },
            p: profile.e2ePublicKey
          }
        };

        const envelope = await cifrarPayloadObj(payloadObj, contato.publicKeyRSA);
        const envelopeJson = JSON.stringify(envelope);

        const payloadJwt = {
          iss: profile.email,
          sub: "msg",
          aud: contato.email,
          jti: msg.id,
          ct: envelopeJson,
          nm: profile.name
        };

        const jwt = await criarJWT(payloadJwt, profile.vapidPrivateKeyJwk, { kid: profile.vapidPublicKey });
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
            privateKey: contato.vapidPrivateKey
          }
        );

        await atualizarStatusMensagemEnviada(msg.id, 'enviada');
        console.log(`[SW-MSG] ✅ Mensagem ${msg.id} enviada com sucesso!`);

      } catch (err) {
        console.error(`[SW-MSG] ❌ Erro ao enviar mensagem ${msg.id}:`, err);
        const mensagemAtual = await buscarMensagemEnviada(msg.id);
        if (mensagemAtual) {
          mensagemAtual.tentativas++;
          mensagemAtual.erro = err.message;
          if (mensagemAtual.tentativas >= MAX_TENTATIVAS) {
            mensagemAtual.status = 'falha';
            console.log(`[SW-MSG] ⛔ Mensagem ${msg.id} excedeu tentativas máximas.`);
          } else {
            mensagemAtual.status = 'pendente';
          }
          mensagemAtual.updatedAt = Date.now();
          await salvarMensagemEnviada(mensagemAtual);
        }
      }
    }
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao processar fila de envio:", err);
  }
}

// ============================================================
// LISTENERS DE EVENTOS (permanecem usando self para os eventos)
// ============================================================
self.addEventListener('message', async (event) => {
  const data = event.data;
  if (data.type === 'PROCESSAR_FILA_ENVIO') {
    console.log("[SW-MSG] 📩 Recebido comando para processar fila de envio.");
    await processarFilaEnvio();
  }
});

self.addEventListener('sync', async function(event) {
  if (event.tag === 'sync-envio-mensagens') {
    event.waitUntil(processarFilaEnvio());
  }
});

self.addEventListener('online', async function() {
  console.log("[SW-MSG] 🌐 Conexão restaurada, processando filas...");
  await processarFilaEnvio();
});

console.log("[SW-MSG] 📦 Módulo de mensagens carregado.");