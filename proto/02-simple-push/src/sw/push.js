// src/sw/push.js
import { get, set, createStore } from "idb-keyval";
import { gunzipSync } from "fflate";
import { DB_NAMES, STORE_NAMES, KEY_NAMES } from "../constants/db.ts";
// Removido: import type { ProfileConfig } from "../constants/db.ts";

// ============================================================
// CONFIGURAÇÃO
// ============================================================
const DEBUG = false;

// ============================================================
// STORES - usando as constantes do db.ts
// ============================================================
function criarStore(nome) {
  try {
    return createStore(nome, STORE_NAMES.KEYVAL);
  } catch (err) {
    console.error(`[SW-PUSH] ❌ Erro ao criar store ${nome}:`, err);
    return null;
  }
}

let storeConfig = criarStore(DB_NAMES.CONFIG);
let storeMensagensRecebidasB = criarStore(DB_NAMES.MENSAGENS_RECEBIDAS_B);
let storeContatos = criarStore(DB_NAMES.CONTATOS);

function garantirStores() {
  if (!storeConfig) storeConfig = criarStore(DB_NAMES.CONFIG);
  if (!storeMensagensRecebidasB) storeMensagensRecebidasB = criarStore(DB_NAMES.MENSAGENS_RECEBIDAS_B);
  if (!storeContatos) storeContatos = criarStore(DB_NAMES.CONTATOS);
}

// ============================================================
// FUNÇÕES AUXILIARES - usando as mesmas de db-helpers (copiadas para o SW)
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

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ============================================================
// FUNÇÕES DE BANCO UNIFICADAS
// ============================================================

/**
 * Busca o perfil completo da store CONFIG.
 */
async function buscarProfile() {
  try {
    garantirStores();
    return await get(KEY_NAMES.PROFILE, storeConfig);
  } catch (err) {
    console.error("[SW-PUSH] ❌ Erro ao buscar perfil:", err);
    return null;
  }
}

/**
 * Busca a chave privada RSA (E2E) a partir do perfil.
 * Retorna a CryptoKey privateDecrypt ou null se não encontrada.
 */
async function buscarChaveDecript() {
  try {
    const profile = await buscarProfile();
    if (!profile) {
      console.warn("[SW-PUSH] ⚠️ Perfil não encontrado.");
      return null;
    }

    // A chave privada RSA deve estar em e2ePrivateKeyJwk
    if (!profile.e2ePrivateKeyJwk) {
      console.warn("[SW-PUSH] ⚠️ Chave privada RSA não encontrada no perfil.");
      return null;
    }

    const privateDecrypt = await crypto.subtle.importKey(
      "jwk",
      profile.e2ePrivateKeyJwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["decrypt"]
    );
    console.log("[SW-PUSH] 🔑 Chave de decodificação RSA encontrada e importada.");
    return privateDecrypt;
  } catch (err) {
    console.error("[SW-PUSH] ❌ Erro ao buscar chave de decodificação:", err);
    return null;
  }
}

/**
 * Salva um contato (usando a store CONTATOS)
 */
async function salvarContato(contato) {
  try {
    garantirStores();
    const key = await serializarPublicKeyVapid(contato.publicKeyVapid);
    await set(key, contato, storeContatos);
    console.log(`[SW-PUSH] ✅ Contato ${contato.email} salvo com chave hash: ${key.substring(0, 8)}...`);
  } catch (err) {
    console.error(`[SW-PUSH] ❌ Erro ao salvar contato:`, err);
  }
}

/**
 * Busca um contato pela chave pública VAPID
 */
async function buscarContatoPorPublicKey(publicKeyVapid) {
  try {
    garantirStores();
    const key = await serializarPublicKeyVapid(publicKeyVapid);
    return await get(key, storeContatos);
  } catch (err) {
    console.error("[SW-PUSH] ❌ Erro ao buscar contato:", err);
    return null;
  }
}

/**
 * Salva uma mensagem recebida
 */
async function salvarMensagemRecebida(mensagem) {
  try {
    garantirStores();
    await set(mensagem.id, mensagem, storeMensagensRecebidasB);
    console.log(`[SW-PUSH] ✅ Mensagem ${mensagem.id} salva.`);
  } catch (err) {
    console.error(`[SW-PUSH] ❌ Erro ao salvar mensagem ${mensagem.id}:`, err);
  }
}

// ============================================================
// EVENTO PUSH (mesma lógica, agora usando buscarProfile e buscarChaveDecript)
// ============================================================
self.addEventListener('push', function(event) {
  if (!event.data) return;
  const rawText = event.data.text();
  console.log("[SW-PUSH] 📩 Push recebido, tamanho:", rawText.length);

  if (rawText.split('.').length !== 3) {
    event.waitUntil(
      self.registration.showNotification("Notificação", { body: rawText })
    );
    return;
  }

  event.waitUntil(async function() {
    try {
      const parts = rawText.split('.');
      const headerB64Url = parts[0];
      const payloadB64Url = parts[1];
      const signatureB64Url = parts[2];
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      const base64UrlDecode = (str) => {
        let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) base64 += '=';
        return decoder.decode(new Uint8Array([...atob(base64)].map(c => c.charCodeAt(0))));
      };

      const jwtPayload = JSON.parse(base64UrlDecode(payloadB64Url));
      const emailRemetente = jwtPayload.iss || "remetente@desconhecido";
      const nomeRemetente = jwtPayload.nm || jwtPayload.name || emailRemetente.split('@')[0] || "Remetente";

      console.log(`[SW-PUSH] 🔐 Mensagem de ${nomeRemetente} <${emailRemetente}>`);

      let publicKeyVapid = jwtPayload.p || jwtPayload.publicKey || null;
      console.log(`[SW-PUSH] Chave pública VAPID: ${publicKeyVapid ? 'encontrada' : 'não encontrada'}`);

      let contato = null;
      if (publicKeyVapid) {
        contato = await buscarContatoPorPublicKey(publicKeyVapid);
        if (contato) {
          console.log(`[SW-PUSH] Contato existente encontrado: ${contato.email}`);
        }
      }

      // Verifica assinatura
      let assinaturaValida = false;
      let homologado = contato ? contato.homologado : false;

      try {
        if (publicKeyVapid) {
          const keyVerify = await crypto.subtle.importKey(
            "jwk", publicKeyVapid,
            { name: "ECDSA", namedCurve: "P-256" },
            true, ["verify"]
          );

          let b64Sig = signatureB64Url.replace(/-/g, '+').replace(/_/g, '/');
          while (b64Sig.length % 4) b64Sig += '=';
          const signatureBytes = new Uint8Array([...atob(b64Sig)].map(c => c.charCodeAt(0)));
          const tokenStringWithoutSignature = `${headerB64Url}.${payloadB64Url}`;

          assinaturaValida = await crypto.subtle.verify(
            { name: "ECDSA", hash: "SHA-256" },
            keyVerify,
            signatureBytes,
            encoder.encode(tokenStringWithoutSignature)
          );
        } else {
          console.warn("[SW-PUSH] ⚠️ Chave pública VAPID não encontrada.");
        }
      } catch (err) {
        console.error("[SW-PUSH] ❌ Erro na verificação:", err);
      }

      if (!assinaturaValida) {
        await self.registration.showNotification("⚠️ Assinatura inválida", {
          body: `Mensagem de ${nomeRemetente} rejeitada.`,
          icon: '/icon.png'
        });
        return;
      }

      console.log("[SW-PUSH] 🛡️ Assinatura validada com sucesso!");

      // Descriptografa envelope
      const privateDecryptKey = await buscarChaveDecript();
      if (!privateDecryptKey) {
        throw new Error("Chave privada RSA de decodificação não encontrada.");
      }

      const envelopeJson = jwtPayload.ct || jwtPayload.cipherText;
      if (!envelopeJson) throw new Error("Envelope não encontrado.");

      const envelope = JSON.parse(envelopeJson);
      const iv = envelope.i || envelope.iv;
      const dados = envelope.d || envelope.dadosCifrados;
      const chaveAesCifrada = envelope.k || envelope.chaveAesCifrada;
      if (!iv || !dados || !chaveAesCifrada) throw new Error("Envelope incompleto.");

      const ivBytes = new Uint8Array(base64ToArrayBuffer(iv));
      const dadosBytes = new Uint8Array(base64ToArrayBuffer(dados));
      const chaveAesCifradaBytes = new Uint8Array(base64ToArrayBuffer(chaveAesCifrada));

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

      // Parse do objeto de mensagem
      let mensagemObj = JSON.parse(textoDecifrado);
      const conteudo = mensagemObj.m?.c || textoDecifrado;

      const e = mensagemObj.e || {};
      const subscription = e.s ? {
        endpoint: e.s.e || e.s.endpoint,
        keys: e.s.k || e.s.keys
      } : null;
      const publicKeyRSA = e.p || null;
      const vapidPrivateKey = (e.v && e.v.k) ? e.v.k : null;

      // Salva/atualiza contato
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
        console.warn("[SW-PUSH] ⚠️ Dados insuficientes para salvar contato. publicKeyVapid:", !!publicKeyVapid, "publicKeyRSA:", !!publicKeyRSA, "subscription:", !!subscription);
      }

      // Salva mensagem recebida
      const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const contatoKey = publicKeyVapid ? await serializarPublicKeyVapid(publicKeyVapid) : '';
      const mensagemRecebida = {
        id: msgId,
        contatoPublicKeyVapid: contatoKey,
        conteudo: conteudo,
        status: 'nao_lida',
        recebidoEm: Date.now()
      };
      if (DEBUG) {
        mensagemRecebida.dadosJwt = jwtPayload;
      }
      await salvarMensagemRecebida(mensagemRecebida);

      // Exibe notificação
      const podeResponder = !!(contato && contato.subscription && contato.publicKeyRSA && contato.vapidPrivateKey);
      const statusEmoji = homologado ? '✅' : '🔄';
      const statusTexto = homologado ? 'Homologado' : 'Não homologado';

      await self.registration.showNotification(`📥 Nova mensagem`, {
        body: `${conteudo}\n\n${statusEmoji} De: ${nomeRemetente} - ${statusTexto}`,
        icon: '/icon.png',
        data: {
          mensagemId: msgId,
          publicKeyVapid: publicKeyVapid,
          homologado: homologado,
          podeResponder: podeResponder,
          acao: homologado ? 'ver_mensagem' : 'homologar_emissor'
        },
        tag: msgId,
        requireInteraction: !homologado,
        vibrate: [200, 100, 200]
      });

      // Notifica clientes abertos
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach(client => {
        client.postMessage({
          type: "PUSH_RECEIVED",
          payload: {
            id: msgId,
            body: conteudo,
            remetente: nomeRemetente,
            homologado: homologado,
            podeResponder: podeResponder,
            status: 'nao_lida'
          }
        });
      });

    } catch (err) {
      console.error("[SW-PUSH] ❌ Erro:", err);
      await self.registration.showNotification("⚠️ Erro ao processar mensagem", {
        body: err.message || "Falha na decriptografia.",
        icon: '/icon.png'
      });
    }
  }());
});

console.log("[SW-PUSH] 📦 Módulo push carregado (com store unificada, DEBUG=" + DEBUG + ")");