/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { get, set, createStore } from "idb-keyval";
import { gunzipSync } from "fflate";
import { DB_NAMES, STORE_NAMES, KEY_NAMES } from "../constants/db.ts";
import { base64UrlToArrayBuffer } from "../utils/jwt-helpers.ts";
import { gerarIdMensagem } from "../utils/id-utils.ts";
import {
  buscarContatoPorChave,
  serializarPublicKeyVapid,
  listarHandshakesPorMensagemId,
  salvarHandshake,
} from "../utils/db-helpers.ts";

// Importamos também funções comuns que serão usadas
import { buscarProfile, buscarChaveDecript, salvarContato, buscarContatoPorPublicKey, salvarMensagemRecebida } from "./push-common.ts";

// ============================================================
// FUNÇÃO PRINCIPAL: PROCESSAR MENSAGEM RECEBIDA (sub: "msg")
// ============================================================
async function processarMensagemRecebida(payload: any, header: any, jwt: string) {
  console.log("[SW-MSG] 📩 Processando mensagem recebida...");

  try {
    // Buscar o perfil do receptor (para validação do aud e para descriptografia)
    const profile = await buscarProfile();
    if (!profile) {
      throw new Error("Perfil do receptor não encontrado.");
    }

    // 🔥 VALIDAÇÃO: aud (destinatário) deve corresponder ao email do perfil
    const aud = payload.aud || payload.sub; // fallback para sub se aud não existir
    if (aud !== profile.email) {
      console.warn(`[SW-MSG] ⚠️ 'aud' não corresponde ao email do perfil. Esperado: ${profile.email}, Recebido: ${aud}`);
      // Não bloqueia o processamento – apenas avisa
    }

    // 🔥 Extrair jti (JWT ID) – será usado como ID da mensagem recebida
    const jti = payload.jti || gerarIdMensagem();
    console.log(`[SW-MSG] 📋 jti: ${jti}`);

    // Extrair chave pública VAPID do header (kid)
    const publicKeyVapid = header.kid;
    if (!publicKeyVapid) {
      throw new Error("Header JWT não contém 'kid' (chave pública VAPID).");
    }

    // Extrair dados do payload
    const emailRemetente = payload.iss || "remetente@desconhecido";
    const nomeRemetente = payload.nm || payload.name || emailRemetente.split('@')[0] || "Remetente";
    console.log(`[SW-MSG] 🔐 Mensagem de ${nomeRemetente} <${emailRemetente}>`);

    // Buscar contato existente pela chave pública (header.kid)
    let contato = null;
    if (publicKeyVapid) {
      contato = await buscarContatoPorPublicKey(publicKeyVapid);
      if (contato) {
        console.log(`[SW-MSG] Contato existente encontrado: ${contato.email}`);
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
      console.warn("[SW-MSG] ⚠️ Dados insuficientes para salvar contato. publicKeyVapid:", !!publicKeyVapid, "publicKeyRSA:", !!publicKeyRSA, "subscription:", !!subscription);
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
    await salvarMensagemRecebida(mensagemRecebida);

    // ============================================================
    // 🔥 DISPARAR HANDSHAKE DE CONFIRMAÇÃO DE ENTREGA
    // ============================================================
    if (contatoKey) {
      await criarHandshakeConfirmacaoEntrega(msgId, contatoKey);
    } else {
      console.warn("[SW-MSG] ⚠️ Não foi possível criar handshake: contatoKey vazio.");
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
          audMismatch: aud !== profile.email
        }
      });
    });

  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao processar mensagem:", err);
    throw err; // para o router tratar
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

    // 🔥 DISPARA PROCESSAMENTO IMEDIATO DA FILA DE HANDSHAKES
    // Chama diretamente a função exportada pelo módulo sw-handshakes
    if (typeof self.processarFilaHandshake === 'function') {
      await self.processarFilaHandshake();
      console.log(`[SW-MSG] ✅ Processamento da fila de handshakes iniciado.`);
    } else {
      console.warn(`[SW-MSG] ⚠️ self.processarFilaHandshake não está disponível. Enviando postMessage para janelas...`);
      // Fallback: notifica janelas abertas (caso a função não esteja disponível)
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach(client => {
        client.postMessage({ type: 'PROCESSAR_FILA_HANDSHAKE' });
      });
    }

    // Também notifica janelas abertas para atualizar a UI, se necessário
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(client => {
      client.postMessage({ type: 'HANDSHAKE_CRIADO', payload: { handshakeId, mensagemId } });
    });

  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao criar handshake:", err);
  }
}

// ============================================================
// EXPORTA FUNÇÃO PARA O ROUTER
// ============================================================
self.processarMensagemRecebida = processarMensagemRecebida;

console.log("[SW-MSG] 📦 Módulo de mensagens carregado.");