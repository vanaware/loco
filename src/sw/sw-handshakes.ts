/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { get, createStore } from "idb-keyval";
import { gunzipSync } from "fflate";
import { DB_NAMES, STORE_NAMES, MAX_TENTATIVAS, Handshake } from "../constants/db.ts";
import { base64UrlToArrayBuffer, criarJWT } from "../utils/jwt-helpers.ts";
import { gerarIdMensagem } from "../utils/id-utils.ts";
import {
  salvarHandshake,
  atualizarStatusHandshake,
  buscarMensagemEnviada,
  atualizarStatusMensagemEnviada,
  salvarProfile,
  buscarContatoPorChave,
  buscarHandshake,
  buscarProfile,
  buscarChaveDecript,
  listarHandshakes,
  salvarContato,
  serializarPublicKeyVapid,
} from "../utils/db-helpers.ts";
import { cifrarPayloadObj, enviarParaProxy, cifrarChaveVapid } from "../utils/push-utils.ts";

export async function processarHandshakeRecebido(payload: any, header: any, jwt: string) {
  console.log("[SW-HANDSHAKE] 🤝 Processando handshake recebido...");

  try {
    if (!payload.jti) throw new Error("Handshake sem jti");
    if (!payload.ct) throw new Error("Handshake sem ct (envelope cifrado)");

    const privateDecryptKey = await buscarChaveDecript();
    if (!privateDecryptKey) {
      throw new Error("Chave privada RSA não disponível para decifrar handshake.");
    }

    const envelope = JSON.parse(payload.ct);
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
    const payloadObj = JSON.parse(new TextDecoder().decode(decompressed));

    // Validação unificada pela propriedade `tipo`
    const tipoHandshake = payloadObj.tipo;
    if (!tipoHandshake) throw new Error("Handshake sem tipo no envelope");

    const senderPublicKeyVapid = header.kid;
    const senderHash = senderPublicKeyVapid ? await serializarPublicKeyVapid(senderPublicKeyVapid) : '';

    const handshake: Handshake = {
      id: payload.jti,
      mensagemId: payload.aud || '',
      tipo: tipoHandshake,
      direcao: 'in',
      status: 'entregue',
      tentativas: 0,
      payload: payloadObj,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await salvarHandshake(handshake);

    // 1. Tratamento de Confirmação de Entrega
    if (tipoHandshake === 'confirmacao_entrega') {
      const mensagemEnviada = await buscarMensagemEnviada(payload.aud);
      if (mensagemEnviada) {
        await atualizarStatusMensagemEnviada(payload.aud, 'entregue');
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        clients.forEach(client => {
          client.postMessage({ type: 'MENSAGEM_ENTREGUE', payload: { mensagemId: payload.aud, entregueEm: Date.now() } });
        });
      }
    }

    // 2. Tratamento de Solicitação de Dados
    if (tipoHandshake === 'solicitar_dados' && senderHash) {
      console.log(`[SW-HANDSHAKE] 📩 Solicitação de dados recebida de ${senderHash}. Respondendo com perfil...`);
      const profile = await buscarProfile();
      if (profile) {
        const respostaHandshakeId = gerarIdMensagem();
        const respostaHandshake: Handshake = {
          id: respostaHandshakeId,
          mensagemId: senderHash,
          tipo: 'resposta_dados',
          direcao: 'out',
          status: 'pendente',
          tentativas: 0,
          payload: {
            iss: profile.email || '',
            nm: profile.name || ''
          },
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        await salvarHandshake(respostaHandshake);
        await processarFilaHandshake();
      }
    }

    // 3. Tratamento de Resposta de Dados
    if (tipoHandshake === 'resposta_dados' && senderHash) {
      console.log(`[SW-HANDSHAKE] 📩 Resposta de dados recebida de ${senderHash}:`, payloadObj);
      const contato = await buscarContatoPorChave(senderHash);
      if (contato) {
        contato.email = payloadObj.iss !== undefined ? payloadObj.iss : contato.email;
        contato.nome = payloadObj.nm !== undefined ? payloadObj.nm : contato.nome;
        contato.updatedAt = Date.now();
        await salvarContato(contato);

        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        clients.forEach(client => {
          client.postMessage({ type: 'CONTATO_ATUALIZADO', payload: { contatoHash: senderHash } });
        });
      }
    }

  } catch (err) {
    console.error("[SW-HANDSHAKE] ❌ Erro ao processar handshake:", err);
    throw err;
  }
}

export async function criarHandshakeSolicitarDados(contatoPublicKeyVapid: string) {
  console.log(`[SW-HANDSHAKE] 🔄 Criando solicitação de dados para contato ${contatoPublicKeyVapid}`);
  try {
    const handshakeId = gerarIdMensagem();
    const handshake: Handshake = {
      id: handshakeId,
      mensagemId: contatoPublicKeyVapid,
      tipo: 'solicitar_dados',
      direcao: 'out',
      status: 'pendente',
      tentativas: 0,
      payload: { campos: ['iss', 'nm'] },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await salvarHandshake(handshake);
    await processarFilaHandshake();
  } catch (err) {
    console.error("[SW-HANDSHAKE] ❌ Erro ao criar solicitação de dados:", err);
  }
}

export async function processarFilaHandshake() {
  console.log("[SW-HANDSHAKE] 🔄 Processando fila de handshakes...");

  try {
    const todos = await listarHandshakes();
    const pendentes = todos.filter(h => h.direcao === 'out' && h.status === 'pendente');
    const enviandoAntigos = todos.filter(
      h => h.direcao === 'out' && h.status === 'enviando' && (Date.now() - h.updatedAt) > 30000
    );

    const paraProcessar = [...pendentes, ...enviandoAntigos];
    if (paraProcessar.length === 0) return;

    for (const handshake of paraProcessar) {
      await atualizarStatusHandshake(handshake.id, 'enviando');

      try {
        let contato = await buscarContatoPorChave(handshake.mensagemId);
        if (!contato) {
          const storeMensagensRecebidas = createStore(DB_NAMES.MENSAGENS_RECEBIDAS_B, STORE_NAMES.KEYVAL);
          const mensagemRecebida = await get(handshake.mensagemId, storeMensagensRecebidas);
          if (mensagemRecebida) {
            contato = await buscarContatoPorChave(mensagemRecebida.contatoPublicKeyVapid);
          }
        }

        if (!contato) {
          throw new Error(`Contato para handshake ${handshake.id} não encontrado.`);
        }

        let profile = await buscarProfile();
        if (!profile) throw new Error("Perfil não encontrado");

        let vapidPrivateKeyEnvelope = profile.vapidPrivateKeyEnvelope;
        if (!vapidPrivateKeyEnvelope) {
          const res = await fetch("/api/server-public-key");
          if (!res.ok) throw new Error("Não foi possível obter chave pública do servidor.");
          const serverPublicKeyJwk = await res.json();
          vapidPrivateKeyEnvelope = await cifrarChaveVapid(profile.vapidPrivateKeyJwk, serverPublicKeyJwk);
          profile.vapidPrivateKeyEnvelope = vapidPrivateKeyEnvelope;
          await salvarProfile(profile);
        }

        // Payload sem o de/para htype: repassa `tipo` diretamente
        const payloadObj = {
          tipo: handshake.tipo,
          ...handshake.payload,
        };

        const envelope = await cifrarPayloadObj(payloadObj, contato.publicKeyRSA);
        const envelopeJson = JSON.stringify(envelope);

        const payloadJwt = {
          sub: "hand",
          aud: handshake.mensagemId,
          jti: handshake.id,
          ct: envelopeJson,
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
            privateKey: contato.vapidPrivateKey,
          }
        );

        await atualizarStatusHandshake(handshake.id, 'enviado');
      } catch (err: any) {
        console.error(`[SW-HANDSHAKE] ❌ Erro ao enviar handshake ${handshake.id}:`, err);
        const handshakeAtual = await buscarHandshake(handshake.id);
        if (handshakeAtual) {
          handshakeAtual.tentativas++;
          handshakeAtual.erro = err.message;
          handshakeAtual.status = handshakeAtual.tentativas >= MAX_TENTATIVAS ? 'falha' : 'pendente';
          handshakeAtual.updatedAt = Date.now();
          await salvarHandshake(handshakeAtual);
        }
      }
    }
  } catch (err) {
    console.error("[SW-HANDSHAKE] ❌ Erro ao processar fila:", err);
  }
}

self.addEventListener('message', async (event) => {
  const data = event.data;
  if (data.type === 'PROCESSAR_FILA_HANDSHAKE') {
    await processarFilaHandshake();
  }
  if (data.type === 'SOLICITAR_DADOS_CONTATO' && data.payload?.contatoPublicKeyVapid) {
    await criarHandshakeSolicitarDados(data.payload.contatoPublicKeyVapid);
  }
});

self.addEventListener('sync', async function (event: any) {
  if (event.tag === 'sync-envio-handshakes') {
    event.waitUntil(processarFilaHandshake());
  }
});

self.addEventListener('online', async function () {
  await processarFilaHandshake();
});