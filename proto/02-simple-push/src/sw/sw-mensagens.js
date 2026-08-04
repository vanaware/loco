// src/sw/sw-mensagens.js
import { get, set, createStore, del, entries } from "idb-keyval";
import { gunzipSync, gzipSync } from "fflate";
import { MAX_TENTATIVAS } from "../constants/db.ts";
import { arrayBufferToBase64Url, criarJWT } from "../utils/jwt-helpers.ts";

// 🔥 Constantes
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

// 🔥 Cria as stores
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
// UTILITÁRIOS DE CRIPTOGRAFIA
// ============================================================
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Função para cifrar a chave VAPID (usada apenas se o envelope não existir)
async function cifrarChaveVapid(privateKeyJwk, serverPublicKeyJwk) {
  const serverKey = await crypto.subtle.importKey(
    "jwk",
    serverPublicKeyJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const vapidBytes = encoder.encode(JSON.stringify(privateKeyJwk));
  const vapidCifrado = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    vapidBytes
  );
  const aesKeyRaw = await crypto.subtle.exportKey("raw", aesKey);
  const aesKeyCifrado = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    serverKey,
    aesKeyRaw
  );
  const toHex = (buf) =>
    Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  const envelope = {
    iv: toHex(iv.buffer),
    dadosCifrados: toHex(vapidCifrado),
    chaveAesCifrada: toHex(aesKeyCifrado)
  };
  return btoa(JSON.stringify(envelope));
}

async function cifrarPayloadObj(payloadObj, publicKeyRSA) {
  const encoder = new TextEncoder();
  const jsonString = JSON.stringify(payloadObj);
  const bytes = encoder.encode(jsonString);
  const compressed = gzipSync(bytes);
  console.log(`[SW-MSG] 📦 Comprimido: ${compressed.length} bytes (original: ${bytes.length})`);

  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    compressed
  );

  const cryptoKeyDestino = await crypto.subtle.importKey(
    "jwk",
    publicKeyRSA,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );
  const aesKeyRaw = await crypto.subtle.exportKey("raw", aesKey);
  const aesKeyEncrypted = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    cryptoKeyDestino,
    aesKeyRaw
  );

  return {
    i: arrayBufferToBase64(iv.buffer),
    d: arrayBufferToBase64(encryptedBuffer),
    k: arrayBufferToBase64(aesKeyEncrypted)
  };
}

// ============================================================
// FUNÇÃO PRINCIPAL: PROCESSAR FILA DE ENVIO
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
        // 1. Buscar contato e perfil
        const contato = await buscarContatoPorChave(msg.contatoHash);
        let profile = await buscarProfile();

        if (!contato) throw new Error("Contato não encontrado");
        if (!profile) throw new Error("Perfil não encontrado");

        // 2. Validações
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

        // 3. Obter o envelope da chave VAPID do emissor
        let vapidPrivateKeyEnvelope = profile.vapidPrivateKeyEnvelope;

        // Se o envelope não existir (perfil antigo), cifrar a chave e salvar no perfil
        if (!vapidPrivateKeyEnvelope) {
          console.warn("[SW-MSG] ⚠️ Envelope da chave VAPID não encontrado no perfil. Cifrando e salvando...");
          const res = await fetch("/api/server-public-key");
          if (!res.ok) throw new Error("Não foi possível obter a chave pública do servidor.");
          const serverPublicKeyJwk = await res.json();
          vapidPrivateKeyEnvelope = await cifrarChaveVapid(profile.vapidPrivateKeyJwk, serverPublicKeyJwk);
          
          profile.vapidPrivateKeyEnvelope = vapidPrivateKeyEnvelope;
          await salvarProfile(profile);
          console.log("[SW-MSG] ✅ Envelope da chave VAPID salvo no perfil.");
        }

        // 4. Montar payloadObj
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

        // 5. Cifrar payloadObj
        const envelope = await cifrarPayloadObj(payloadObj, contato.publicKeyRSA);
        const envelopeJson = JSON.stringify(envelope);

        // 6. Construir JWT usando função genérica
        // 🔥 ALTERAÇÃO: sub="msg", aud=email do contato, jti=msg.id
        const payloadJwt = {
          iss: profile.email,
          sub: "msg",
          aud: contato.email,
          jti: msg.id,               // 🔥 JWT ID = ID da mensagem
          ct: envelopeJson,
          nm: profile.name
        };

        // Header com kid = chave pública VAPID
        const jwt = await criarJWT(payloadJwt, profile.vapidPrivateKeyJwk, { kid: profile.vapidPublicKey });

        console.log(`[SW-MSG] 📊 JWT tamanho: ${jwt.length} bytes`);

        // 7. Enviar para o servidor proxy
        const response = await fetch("/api/proxy-push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: contato.subscription,
            payloadText: jwt,
            vapid: {
              subject: `mailto:${contato.email}`,
              publicKey: contato.publicKeyVapid,
              privateKey: contato.vapidPrivateKey
            }
          })
        });

        if (response.ok) {
          await atualizarStatusMensagemEnviada(msg.id, 'enviada');
          console.log(`[SW-MSG] ✅ Mensagem ${msg.id} enviada com sucesso!`);
        } else {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

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