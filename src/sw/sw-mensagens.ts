/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { get, createStore } from "idb-keyval";
import { gunzipSync } from "fflate";
import { DB_NAMES, STORE_NAMES, MAX_TENTATIVAS } from "../constants/db.ts";
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
import { processarFilaHandshake, criarHandshakeSolicitarDados } from "./sw-handshakes.ts";

export async function processarMensagemRecebida(payload: any, header: any, jwt: string) {
  console.log("[SW-MSG] 📩 Processando mensagem recebida...");

  try {
    const profile = await buscarProfile();
    if (!profile) {
      throw new Error("Perfil do receptor não encontrado.");
    }

    const aud = payload.aud || payload.sub;
    if (aud && aud !== profile.email) {
      console.warn(`[SW-MSG] ⚠️ 'aud' não corresponde ao email do perfil. Esperado: ${profile.email}, Recebido: ${aud}`);
    }

    const jti = payload.jti || gerarIdMensagem();
    const publicKeyVapid = header.kid;
    if (!publicKeyVapid) {
      throw new Error("Header JWT não contém 'kid' (chave pública VAPID).");
    }

    let contato = await buscarContatoPorPublicKey(publicKeyVapid);
    const eNovoContato = !contato;

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
      const novoContato = {
        publicKeyVapid: publicKeyVapid,
        email: contato?.email || '',
        nome: contato?.nome || '',
        publicKeyRSA: publicKeyRSA,
        subscription: subscription,
        vapidPrivateKey: vapidPrivateKey || '',
        homologado: contato ? contato.homologado : false,
        createdAt: contato ? contato.createdAt : Date.now(),
        updatedAt: Date.now()
      };
      await salvarContato(novoContato);
      contato = novoContato;
    }

    const msgId = jti;
    const contatoKey = publicKeyVapid ? await serializarPublicKeyVapid(publicKeyVapid) : '';
    const mensagemRecebida = {
      id: msgId,
      contatoPublicKeyVapid: contatoKey,
      conteudo: conteudo,
      status: 'nao_lida' as const,
      recebidoEm: Date.now()
    };
    await salvarMensagemRecebida(mensagemRecebida);

    if (contatoKey) {
      await criarHandshakeConfirmacaoEntrega(msgId, contatoKey);
      
      // Se for um contato novo ou sem dados salvos, solicita nome e e-mail via handshake
      if (eNovoContato || (!contato?.nome && !contato?.email)) {
        console.log(`[SW-MSG] 🔄 Novo contato detectado (${contatoKey}). Disparando solicitação automática de dados...`);
        await criarHandshakeSolicitarDados(contatoKey);
      }
    }

    const nomeExibicao = contato?.nome?.trim() || contato?.email?.trim() || "Anônimo";
    const homologadoFinal = contato ? contato.homologado : false;
    const podeResponder = !!(contato && contato.subscription && contato.publicKeyRSA && contato.vapidPrivateKey);
    const statusEmoji = homologadoFinal ? '✅' : '🔄';
    const statusTexto = homologadoFinal ? 'Homologado' : 'Não homologado';

    let bodyNotificacao = `${conteudo}\n\n${statusEmoji} De: ${nomeExibicao} - ${statusTexto}`;

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
          remetente: nomeExibicao,
          homologado: homologadoFinal,
          podeResponder: podeResponder,
          status: 'nao_lida'
        }
      });
    });

  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao processar mensagem:", err);
    throw err;
  }
}

async function criarHandshakeConfirmacaoEntrega(mensagemId: string, contatoPublicKeyVapid: string) {
  try {
    const handshakesExistentes = await listarHandshakesPorMensagemId(mensagemId);
    if (handshakesExistentes.some(h => h.tipo === 'confirmacao_entrega' && h.direcao === 'out')) {
      return;
    }

    const contato = await buscarContatoPorChave(contatoPublicKeyVapid);
    if (!contato) throw new Error(`Contato não encontrado.`);

    const handshakeId = gerarIdMensagem();
    const handshake = {
      id: handshakeId,
      mensagemId: mensagemId,
      tipo: 'confirmacao_entrega' as const,
      direcao: 'out' as const,
      status: 'pendente' as const,
      tentativas: 0,
      payload: { recebidoEm: Date.now() },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await salvarHandshake(handshake);
    await processarFilaHandshake();
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao criar handshake de confirmação:", err);
  }
}

export async function processarFilaEnvio() {
  console.log("[SW-MSG] 🔄 Processando fila de envio...");

  try {
    const pendentes = await listarMensagensEnviadasPorStatus('pendente');
    const enviandoAntigos = (await listarMensagensEnviadasPorStatus('enviando'))
      .filter(m => (Date.now() - m.updatedAt) > 30000);

    const paraProcessar = [...pendentes, ...enviandoAntigos];
    if (paraProcessar.length === 0) return;

    for (const msg of paraProcessar) {
      await atualizarStatusMensagemEnviada(msg.id, 'enviando');

      try {
        const contato = await buscarContatoPorChave(msg.contatoHash);
        let profile = await buscarProfile();

        if (!contato || !profile) throw new Error("Contato ou perfil ausente.");

        let vapidPrivateKeyEnvelope = profile.vapidPrivateKeyEnvelope;
        if (!vapidPrivateKeyEnvelope) {
          const res = await fetch("/api/server-public-key");
          if (!res.ok) throw new Error("Chave do servidor indisponível.");
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

        // JWT Otimizado sem iss e nm
        const payloadJwt = {
          sub: "msg",
          aud: contato.email,
          jti: msg.id,
          ct: envelopeJson
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
            subject: `mailto:${contato.email || profile.email}`,
            publicKey: contato.publicKeyVapid,
            privateKey: contato.vapidPrivateKey
          }
        );

        await atualizarStatusMensagemEnviada(msg.id, 'enviada');

      } catch (err: any) {
        console.error(`[SW-MSG] ❌ Erro ao enviar mensagem ${msg.id}:`, err);
        const mensagemAtual = await buscarMensagemEnviada(msg.id);
        if (mensagemAtual) {
          mensagemAtual.tentativas++;
          mensagemAtual.erro = err.message;
          mensagemAtual.status = mensagemAtual.tentativas >= MAX_TENTATIVAS ? 'falha' : 'pendente';
          mensagemAtual.updatedAt = Date.now();
          await salvarMensagemEnviada(mensagemAtual);
        }
      }
    }
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao processar fila de envio:", err);
  }
}

self.addEventListener('message', async (event) => {
  const data = event.data;
  if (data.type === 'PROCESSAR_FILA_ENVIO') {
    await processarFilaEnvio();
  }
});

self.addEventListener('sync', async function(event: any) {
  if (event.tag === 'sync-envio-mensagens') {
    event.waitUntil(processarFilaEnvio());
  }
});

self.addEventListener('online', async function() {
  await processarFilaEnvio();
});