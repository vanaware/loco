// src/sw/sw-mensagens.js

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { get, set, createStore, del, entries } from "idb-keyval";
import { gunzipSync, gzipSync } from "fflate";
import { MAX_TENTATIVAS } from "../constants/db.ts";
import { arrayBufferToBase64Url, criarJWT } from "../utils/jwt-helpers.ts";
import { cifrarPayloadObj, enviarParaProxy, cifrarChaveVapid } from "../utils/push-utils.ts";

// ============================================================
// CONSTANTES E STORES
// ============================================================
const DB_NAMES = {
  MENSAGENS_ENVIADAS: "BrowserA_MensagensEnviadas_DB",
  MENSAGENS_RECEBIDAS_B: "BrowserB_MensagensRecebidas_DB",
  CONTATOS: "BrowserB_Contatos_DB",
  CONFIG: "AppConfig_DB",
};

const STORE_NAMES = {
  KEYVAL: "keyval",
};

const KEY_NAMES = {
  PROFILE: "profile",
};

const storeMensagensEnviadas = createStore(DB_NAMES.MENSAGENS_ENVIADAS, STORE_NAMES.KEYVAL);
const storeMensagensRecebidasB = createStore(DB_NAMES.MENSAGENS_RECEBIDAS_B, STORE_NAMES.KEYVAL);
const storeContatos = createStore(DB_NAMES.CONTATOS, STORE_NAMES.KEYVAL);
const storeConfig = createStore(DB_NAMES.CONFIG, STORE_NAMES.KEYVAL);

console.log("[SW-MSG] ✅ Stores criadas com sucesso!");

// ============================================================
// FUNÇÕES AUXILIARES PARA CONTATOS E PERFIL
// ============================================================
async function sha256(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function serializarPublicKeyVapid(jwk) {
  const raw = `${jwk.kty?.toLowerCase() || ''}|${jwk.crv?.toLowerCase() || ''}|${jwk.x?.toLowerCase() || ''}|${jwk.y?.toLowerCase() || ''}`;
  return await sha256(raw);
}

async function buscarContatoPorChave(chaveOuJwk) {
  try {
    let key;
    if (typeof chaveOuJwk === 'string') {
      key = chaveOuJwk;
    } else if (chaveOuJwk && chaveOuJwk.kty) {
      key = await serializarPublicKeyVapid(chaveOuJwk);
    } else {
      return null;
    }
    return await get(key, storeContatos) || null;
  } catch {
    return null;
  }
}

async function buscarProfile() {
  try {
    return await get(KEY_NAMES.PROFILE, storeConfig);
  } catch {
    return null;
  }
}

async function salvarProfile(profile) {
  try {
    await set(KEY_NAMES.PROFILE, profile, storeConfig);
    console.log("[SW-MSG] ✅ Perfil atualizado com sucesso.");
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao salvar perfil:", err);
  }
}

// ============================================================
// FUNÇÕES DE BANCO PARA MENSAGENS ENVIADAS
// ============================================================
async function salvarMensagemEnviada(mensagem) {
  try {
    await set(mensagem.id, mensagem, storeMensagensEnviadas);
    console.log(`[SW-MSG] 💾 Mensagem ${mensagem.id} salva.`);
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao salvar mensagem ${mensagem.id}:`, err);
  }
}

async function buscarMensagemEnviada(id) {
  try {
    return await get(id, storeMensagensEnviadas);
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao buscar mensagem ${id}:`, err);
    return null;
  }
}

async function listarMensagensEnviadasPorStatus(status) {
  try {
    const todas = await listarMensagensEnviadas();
    return todas.filter(m => m.status === status);
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao listar mensagens por status:", err);
    return [];
  }
}

async function listarMensagensEnviadas() {
  try {
    const entriesList = await entries(storeMensagensEnviadas);
    return entriesList.map(([_, msg]) => msg);
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao listar mensagens:", err);
    return [];
  }
}

async function atualizarStatusMensagemEnviada(id, status, erro) {
  try {
    const mensagem = await buscarMensagemEnviada(id);
    if (mensagem) {
      mensagem.status = status;
      mensagem.updatedAt = Date.now();
      if (erro) mensagem.erro = erro;
      await salvarMensagemEnviada(mensagem);
      console.log(`[SW-MSG] ✅ Mensagem ${id} atualizada para status: ${status}`);
    }
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao atualizar mensagem ${id}:`, err);
  }
}

async function removerMensagemEnviada(id) {
  try {
    await del(id, storeMensagensEnviadas);
    console.log(`[SW-MSG] ✅ Mensagem ${id} removida`);
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao remover mensagem ${id}:`, err);
  }
}

// ============================================================
// FUNÇÃO PRINCIPAL: PROCESSAR FILA DE ENVIO (refatorada)
// ============================================================
async function processarFilaEnvio() {
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
// LISTENERS DE EVENTOS
// ============================================================
self.addEventListener('message', async (event) => {
  const data = event.data;
  if (data.type === 'PROCESSAR_FILA_ENVIO') {
    console.log("[SW-MSG] 📩 Recebido comando para processar fila de envio.");
    await processarFilaEnvio();
  }
});

self.addEventListener('sync', async function(event) {
  console.log(`[SW-MSG] 🔄 Sync disparado: ${event.tag}`);
  if (event.tag === 'sync-envio-mensagens') {
    event.waitUntil(processarFilaEnvio());
  }
});

self.addEventListener('online', async function() {
  console.log("[SW-MSG] 🌐 Conexão restaurada, processando filas...");
  await processarFilaEnvio();
});

self.processarFilaEnvio = processarFilaEnvio;

console.log("[SW-MSG] 📦 Módulo de mensagens carregado com sucesso!");