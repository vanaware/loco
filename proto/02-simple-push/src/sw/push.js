// src/sw/push.js
import { get, set, createStore } from "idb-keyval";
import { gunzipSync } from "fflate";
import { DB_NAMES, STORE_NAMES, KEY_NAMES } from "../constants/db.ts";
import { verificarJWT, base64UrlToArrayBuffer } from "../utils/jwt-helpers.ts";
import { gerarIdMensagem, gerarIdFallback } from "../utils/id-utils.ts";

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
// FUNÇÕES AUXILIARES
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

async function buscarProfile() {
  try {
    garantirStores();
    return await get(KEY_NAMES.PROFILE, storeConfig);
  } catch (err) {
    console.error("[SW-PUSH] ❌ Erro ao buscar perfil:", err);
    return null;
  }
}

async function buscarChaveDecript() {
  try {
    const profile = await buscarProfile();
    if (!profile) {
      console.warn("[SW-PUSH] ⚠️ Perfil não encontrado.");
      return null;
    }
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
// EVENTO PUSH
// ============================================================
self.addEventListener('push', function(event) {
  if (!event.data) return;
  const rawText = event.data.text();
  console.log("[SW-PUSH] 📩 Push recebido, tamanho:", rawText.length);

  // Se não parecer JWT, exibe como notificação simples
  if (rawText.split('.').length !== 3) {
    event.waitUntil(
      self.registration.showNotification("Notificação", { body: rawText })
    );
    return;
  }

  event.waitUntil(async function() {
    try {
      // Verificar assinatura usando a chave pública do header (kid)
      const { header, payload, valid } = await verificarJWT(rawText);
      if (!valid) {
        await self.registration.showNotification("⚠️ Assinatura inválida", {
          body: `Mensagem rejeitada.`,
          icon: '/icon.png'
        });
        return;
      }

      // 🔥 VALIDAÇÃO: sub deve ser "msg"
      if (payload.sub !== "msg") {
        await self.registration.showNotification("⚠️ Tipo de mensagem inválido", {
          body: `Esperado 'msg', recebido '${payload.sub}'`,
          icon: '/icon.png'
        });
        console.warn(`[SW-PUSH] ⚠️ JWT com sub inválido: ${payload.sub}`);
        return;
      }

      // Buscar o perfil do receptor (para validação do aud e para descriptografia)
      const profile = await buscarProfile();
      if (!profile) {
        throw new Error("Perfil do receptor não encontrado.");
      }

      // 🔥 VALIDAÇÃO: aud (destinatário) deve corresponder ao email do perfil
      const aud = payload.aud || payload.sub; // fallback para sub se aud não existir
      if (aud !== profile.email) {
        console.warn(`[SW-PUSH] ⚠️ 'aud' não corresponde ao email do perfil. Esperado: ${profile.email}, Recebido: ${aud}`);
        // Não bloqueia o processamento – apenas avisa
      }

      // 🔥 Extrair jti (JWT ID) – será usado como ID da mensagem recebida
      // Usa a função centralizada: se jti existir usa, senão gera novo ID
      const jti = payload.jti || gerarIdMensagem();
      console.log(`[SW-PUSH] 📋 jti: ${jti}`);

      // Extrair chave pública VAPID do header (kid)
      const publicKeyVapid = header.kid;
      if (!publicKeyVapid) {
        throw new Error("Header JWT não contém 'kid' (chave pública VAPID).");
      }

      // Extrair dados do payload
      const emailRemetente = payload.iss || "remetente@desconhecido";
      const nomeRemetente = payload.nm || payload.name || emailRemetente.split('@')[0] || "Remetente";
      console.log(`[SW-PUSH] 🔐 Mensagem de ${nomeRemetente} <${emailRemetente}>`);

      // Buscar contato existente pela chave pública (header.kid)
      let contato = null;
      if (publicKeyVapid) {
        contato = await buscarContatoPorPublicKey(publicKeyVapid);
        if (contato) {
          console.log(`[SW-PUSH] Contato existente encontrado: ${contato.email}`);
        }
      }

      // Verificar se o contato é homologado (apenas para interface)
      let homologado = contato ? contato.homologado : false;

      // Descriptografar envelope
      const privateDecryptKey = await buscarChaveDecript(); // usa o perfil internamente
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

      // Parse do objeto de mensagem (agora { c, e })
      let mensagemObj = JSON.parse(textoDecifrado);
      const conteudo = mensagemObj.c || textoDecifrado;

      const e = mensagemObj.e || {};
      const subscription = e.s ? {
        endpoint: e.s.e || e.s.endpoint,
        keys: e.s.k || e.s.keys
      } : null;
      const publicKeyRSA = e.p || null;
      const vapidPrivateKey = (e.s && e.s.v) ? e.s.v : null;

      // Salva/atualiza contato (o emissor é o remetente)
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

      // 🔥 SALVA MENSAGEM RECEBIDA usando jti como ID
      const msgId = jti;
      const contatoKey = publicKeyVapid ? await serializarPublicKeyVapid(publicKeyVapid) : '';
      const mensagemRecebida = {
        id: msgId,
        contatoPublicKeyVapid: contatoKey,
        conteudo: conteudo,
        status: 'nao_lida',
        recebidoEm: Date.now()
      };
      if (DEBUG) {
        mensagemRecebida.dadosJwt = payload;
      }
      await salvarMensagemRecebida(mensagemRecebida);

      // Exibe notificação
      const podeResponder = !!(contato && contato.subscription && contato.publicKeyRSA && contato.vapidPrivateKey);
      const statusEmoji = homologado ? '✅' : '🔄';
      const statusTexto = homologado ? 'Homologado' : 'Não homologado';

      // 🔥 Adiciona indicação se o aud não corresponde
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
            status: 'nao_lida',
            audMismatch: aud !== profile.email // informa à UI se houve divergência
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

console.log("[SW-PUSH] 📦 Módulo push carregado (com store unificada e JWT helpers, DEBUG=" + DEBUG + ")");