/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { get, set, createStore } from "idb-keyval";
import { gunzipSync } from "fflate";
import { DB_NAMES, STORE_NAMES, KEY_NAMES } from "../constants/db.ts";
import { verificarJWT, base64UrlToArrayBuffer } from "../utils/jwt-helpers.ts";
import { gerarIdMensagem } from "../utils/id-utils.ts";
import {
  salvarHandshake,
  buscarContatoPorChave,
  serializarPublicKeyVapid,
  listarHandshakesPorMensagemId,
} from "../utils/db-helpers.ts";

// ============================================================
// CONFIGURAÇÃO
// ============================================================
const DEBUG = false;

// ============================================================
// STORES - usando as constantes do db.ts
// ============================================================
function criarStore(nome: string) {
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
let storeHandshakes = criarStore(DB_NAMES.HANDSHAKES);

function garantirStores() {
  if (!storeConfig) storeConfig = criarStore(DB_NAMES.CONFIG);
  if (!storeMensagensRecebidasB) storeMensagensRecebidasB = criarStore(DB_NAMES.MENSAGENS_RECEBIDAS_B);
  if (!storeContatos) storeContatos = criarStore(DB_NAMES.CONTATOS);
  if (!storeHandshakes) storeHandshakes = criarStore(DB_NAMES.HANDSHAKES);
}

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================
function base64ToArrayBuffer(base64: string): ArrayBuffer {
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

async function salvarContato(contato: any) {
  try {
    garantirStores();
    const key = await serializarPublicKeyVapid(contato.publicKeyVapid);
    await set(key, contato, storeContatos);
    console.log(`[SW-PUSH] ✅ Contato ${contato.email} salvo com chave hash: ${key.substring(0, 8)}...`);
  } catch (err) {
    console.error(`[SW-PUSH] ❌ Erro ao salvar contato:`, err);
  }
}

async function buscarContatoPorPublicKey(publicKeyVapid: any) {
  try {
    garantirStores();
    const key = await serializarPublicKeyVapid(publicKeyVapid);
    return await get(key, storeContatos);
  } catch (err) {
    console.error("[SW-PUSH] ❌ Erro ao buscar contato:", err);
    return null;
  }
}

async function salvarMensagemRecebida(mensagem: any) {
  try {
    garantirStores();
    await set(mensagem.id, mensagem, storeMensagensRecebidasB);
    console.log(`[SW-PUSH] ✅ Mensagem ${mensagem.id} salva.`);
  } catch (err) {
    console.error(`[SW-PUSH] ❌ Erro ao salvar mensagem ${mensagem.id}:`, err);
  }
}

// ============================================================
// FUNÇÃO PARA CRIAR HANDSHAKE DE CONFIRMAÇÃO DE ENTREGA
// ============================================================
async function criarHandshakeConfirmacaoEntrega(mensagemId: string, contatoPublicKeyVapid: string) {
  console.log(`[SW-PUSH] 🔄 Criando handshake de confirmação para mensagem ${mensagemId}`);
  try {
    // Verificar se já existe um handshake para esta mensagem (evitar duplicatas)
    const handshakesExistentes = await listarHandshakesPorMensagemId(mensagemId);
    if (handshakesExistentes.some(h => h.tipo === 'confirmacao_entrega' && h.direcao === 'out')) {
      console.log(`[SW-PUSH] ℹ️ Handshake de confirmação já existe para ${mensagemId}.`);
      return;
    }

    // Buscar o contato emissor
    const contato = await buscarContatoPorChave(contatoPublicKeyVapid);
    if (!contato) {
      throw new Error(`Contato para a mensagem ${mensagemId} não encontrado.`);
    }

    // Gerar ID para o handshake
    const handshakeId = gerarIdMensagem();

    // Criar objeto Handshake
    const handshake = {
      id: handshakeId,
      mensagemId: mensagemId,
      tipo: 'confirmacao_entrega',
      direcao: 'out',
      status: 'pendente',
      tentativas: 0,
      payload: {
        recebidoEm: Date.now(),
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Salvar no IndexedDB
    await salvarHandshake(handshake);
    console.log(`[SW-PUSH] ✅ Handshake ${handshakeId} salvo com status 'pendente'.`);

    // Disparar processamento da fila de handshakes
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(client => {
      client.postMessage({
        type: 'PROCESSAR_FILA_HANDSHAKE',
      });
    });
  } catch (err) {
    console.error("[SW-PUSH] ❌ Erro ao criar handshake:", err);
  }
}

// ============================================================
// FUNÇÃO PARA PROCESSAR HANDSHAKE RECEBIDO (sub: "hand")
// ============================================================
async function processarHandshakeRecebido(payload: any, header: any, jwt: string) {
  console.log("[SW-PUSH] 🤝 Processando handshake recebido...");
  try {
    // Campos obrigatórios do JWT (agora sem htype/mid)
    if (!payload.jti) throw new Error("Handshake sem jti");
    if (!payload.aud) throw new Error("Handshake sem aud (mensagemId esperada)");
    if (!payload.ct) throw new Error("Handshake sem ct (envelope cifrado)");

    // Decifrar envelope
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
    const payloadObj = JSON.parse(textoDecifrado);

    // Validar conteúdo do envelope (deve conter htype)
    if (!payloadObj.htype) throw new Error("Handshake sem htype no envelope");

    // 🔥 O mid (mensagemId) vem do aud do JWT
    const mensagemId = payload.aud;

    // Salvar handshake recebido
    const handshake = {
      id: payload.jti, // ID do handshake (do JWT)
      mensagemId: mensagemId, // ID da mensagem (do aud do JWT)
      tipo: payloadObj.htype, // tipo (do envelope)
      direcao: 'in',
      status: 'entregue',
      tentativas: 0,
      payload: payloadObj, // armazena { htype } (e outros campos futuros)
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await salvarHandshake(handshake);

    console.log(`[SW-PUSH] ✅ Handshake ${handshake.id} (tipo: ${handshake.tipo}) recebido para mensagem ${handshake.mensagemId}.`);
  } catch (err) {
    console.error("[SW-PUSH] ❌ Erro ao processar handshake:", err);
  }
}

// ============================================================
// EVENTO PUSH (modificado para tratar sub: "hand" e criar handshake)
// ============================================================
self.addEventListener('push', function (event) {
  if (!event.data) return;
  const rawText = event.data.text();
  console.log("[SW-PUSH] 📩 Push recebido, tamanho:", rawText.length);

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

        // Se for handshake, processa e retorna
        if (payload.sub === "hand") {
          await processarHandshakeRecebido(payload, header, rawText);
          return;
        }

        // Fluxo de mensagem (sub: "msg")
        if (payload.sub !== "msg") {
          await self.registration.showNotification("⚠️ Tipo de mensagem inválido", {
            body: `Esperado 'msg', recebido '${payload.sub}'`,
            icon: '/icon.png',
          });
          console.warn(`[SW-PUSH] ⚠️ JWT com sub inválido: ${payload.sub}`);
          return;
        }

        const profile = await buscarProfile();
        if (!profile) {
          throw new Error("Perfil do receptor não encontrado.");
        }

        const aud = payload.aud || payload.sub;
        if (aud !== profile.email) {
          console.warn(`[SW-PUSH] ⚠️ 'aud' não corresponde ao email do perfil. Esperado: ${profile.email}, Recebido: ${aud}`);
        }

        const jti = payload.jti || gerarIdMensagem();
        console.log(`[SW-PUSH] 📋 jti: ${jti}`);

        const publicKeyVapid = header.kid;
        if (!publicKeyVapid) {
          throw new Error("Header JWT não contém 'kid' (chave pública VAPID).");
        }

        const emailRemetente = payload.iss || "remetente@desconhecido";
        const nomeRemetente = payload.nm || payload.name || emailRemetente.split('@')[0] || "Remetente";
        console.log(`[SW-PUSH] 🔐 Mensagem de ${nomeRemetente} <${emailRemetente}>`);

        let contato = null;
        if (publicKeyVapid) {
          contato = await buscarContatoPorPublicKey(publicKeyVapid);
          if (contato) {
            console.log(`[SW-PUSH] Contato existente encontrado: ${contato.email}`);
          }
        }

        let homologado = contato ? contato.homologado : false;

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

        let mensagemObj = JSON.parse(textoDecifrado);
        const conteudo = mensagemObj.c || textoDecifrado;

        const e = mensagemObj.e || {};
        const subscription = e.s
          ? {
              endpoint: e.s.e || e.s.endpoint,
              keys: e.s.k || e.s.keys,
            }
          : null;
        const publicKeyRSA = e.p || null;
        const vapidPrivateKey = e.s && e.s.v ? e.s.v : null;

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
            updatedAt: Date.now(),
          };
          await salvarContato(novoContato);
          contato = novoContato;
        } else {
          console.warn("[SW-PUSH] ⚠️ Dados insuficientes para salvar contato.");
        }

        const msgId = jti;
        const contatoKey = publicKeyVapid ? await serializarPublicKeyVapid(publicKeyVapid) : '';
        const mensagemRecebida = {
          id: msgId,
          contatoPublicKeyVapid: contatoKey,
          conteudo: conteudo,
          status: 'nao_lida',
          recebidoEm: Date.now(),
        };
        if (DEBUG) {
          mensagemRecebida.dadosJwt = payload;
        }
        await salvarMensagemRecebida(mensagemRecebida);

        // ============================================================
        // 🔥 CRIAÇÃO DO HANDSHAKE DE CONFIRMAÇÃO DE ENTREGA
        // ============================================================
        if (contatoKey) {
          await criarHandshakeConfirmacaoEntrega(msgId, contatoKey);
        } else {
          console.warn("[SW-PUSH] ⚠️ Não foi possível criar handshake: contatoKey vazio.");
        }

        // Exibe notificação
        const podeResponder = !!(contato && contato.subscription && contato.publicKeyRSA && contato.vapidPrivateKey);
        const statusEmoji = homologado ? '✅' : '🔄';
        const statusTexto = homologado ? 'Homologado' : 'Não homologado';

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
            acao: homologado ? 'ver_mensagem' : 'homologar_emissor',
          },
          tag: msgId,
          requireInteraction: !homologado,
          vibrate: [200, 100, 200],
        });

        // Notifica clientes abertos
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        clients.forEach((client) => {
          client.postMessage({
            type: "PUSH_RECEIVED",
            payload: {
              id: msgId,
              body: conteudo,
              remetente: nomeRemetente,
              homologado: homologado,
              podeResponder: podeResponder,
              status: 'nao_lida',
              audMismatch: aud !== profile.email,
            },
          });
        });
      } catch (err) {
        console.error("[SW-PUSH] ❌ Erro:", err);
        await self.registration.showNotification("⚠️ Erro ao processar mensagem", {
          body: err.message || "Falha na decriptografia.",
          icon: '/icon.png',
        });
      }
    })()
  );
});

console.log("[SW-PUSH] 📦 Módulo push carregado (com suporte a handshake)");