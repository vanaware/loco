// src/sw/sw-handshakes.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { gunzipSync } from "fflate";
import { DB_NAMES, STORE_NAMES, MAX_TENTATIVAS, Handshake } from "../constants/db.ts";
import { base64UrlToArrayBuffer, criarJWT } from "../utils/jwt-helpers.ts";
import {
  salvarHandshake,
  buscarHandshake,
  listarHandshakes,
  buscarContatoPorChave,
  buscarProfile,
  buscarChaveDecript,
  salvarProfile,
  serializarPublicKeyVapid,
  normalizarChaveContato
} from "../utils/db-helpers.ts";
import { cifrarPayloadObj, enviarParaProxy, cifrarChaveVapid } from "../utils/push-utils.ts";
import { extrairDadosCompactos } from "../utils/share-utils.ts";
import { addDebugLog } from "../utils/debug-utils.ts";

// Importa os roteadores especializados
import { Processar as ProcessarProfile } from "../handshakes/hand-profile.ts";
import { Processar as ProcessarContato } from "../handshakes/hand-contato.ts";
import { Processar as ProcessarMensagem } from "../handshakes/hand-mensagem.ts";

export async function processarHandshakeRecebido(payload: any, header: any, jwt: string) {
  addDebugLog("[SW-ROUTER] 🤝 Handshake recebido. Decifrando envelope...");

  try {
    if (!payload.jti) throw new Error("Handshake sem jti");
    if (!payload.ct) throw new Error("Handshake sem ct (envelope cifrado)");

    const privateDecryptKey = await buscarChaveDecript(); 
    if (!privateDecryptKey) throw new Error("Chave privada RSA não disponível para decifrar handshake.");

    const envelope = JSON.parse(payload.ct);
    const iv = envelope.i || envelope.iv;
    const dados = envelope.d || envelope.dadosCifrados;
    const chaveAesCifrada = envelope.k || envelope.chaveAesCifrada;
    if (!iv || !dados || !chaveAesCifrada) throw new Error("Envelope incompleto.");

    const ivBytes = new Uint8Array(base64UrlToArrayBuffer(iv));
    const dadosBytes = new Uint8Array(base64UrlToArrayBuffer(dados));
    const chaveAesCifradaBytes = new Uint8Array(base64UrlToArrayBuffer(chaveAesCifrada));

    const aesChaveCruaBuffer = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateDecryptKey, chaveAesCifradaBytes);
    const chaveSimetricaAes = await crypto.subtle.importKey("raw", aesChaveCruaBuffer, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const textoDecifradoBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, chaveSimetricaAes, dadosBytes);
    
    const decompressed = gunzipSync(new Uint8Array(textoDecifradoBuffer));
    const rotasObj = JSON.parse(new TextDecoder().decode(decompressed));

    const senderPublicKeyVapid = header.kid;
    const senderHash = senderPublicKeyVapid ? await serializarPublicKeyVapid(senderPublicKeyVapid) : '';

    let handshake = await buscarHandshake(payload.jti);
    let erroIn = undefined;

    if (!handshake) {
      handshake = { id: payload.jti, aud: senderHash, createdAt: Date.now(), updatedAt: Date.now() };
    } else if (handshake.in) {
      erroIn = "FluxoIn do Handshake Sobrescrito";
    }

    handshake.in = { status: 'recebido', tentativas: 0, rotas: rotasObj, erro: erroIn };
    handshake.updatedAt = Date.now();
    
    await salvarHandshake(handshake);
    addDebugLog(`[SW-ROUTER] ✅ Handshake ${handshake.id} decifrado e enfileirado para processamento In.`);
    await processarFilaHandshake();

  } catch (err: any) {
    addDebugLog(`[SW-ROUTER] ❌ Erro ao decifrar handshake recebido: ${err.message}`);
    throw err;
  }
}

// 🔥 Variável de Trava (Mutex) para evitar que a fila seja processada duas vezes simultaneamente
let isProcessingFila = false;

export async function processarFilaHandshake() {
  if (isProcessingFila) {
    // Fila já está sendo processada. Ignora chamadas concorrentes para não enviar mensagens duplicadas.
    return;
  }
  
  isProcessingFila = true;
  addDebugLog("[SW-ROUTER] 🔄 Processando fila geral de handshakes...");

  try {
    const todos = await listarHandshakes();

    // 1. PROCESSAR ENTRADA (O que recebemos)
    const pendentesIn = todos.filter(h => h.in && (h.in.status === 'recebido' || (h.in.status === 'processando' && (Date.now() - h.updatedAt) > 60000)) && h.in.tentativas < MAX_TENTATIVAS);

    for (const h of pendentesIn) {
      h.in!.status = 'processando';
      h.in!.tentativas++;
      h.updatedAt = Date.now();
      await salvarHandshake(h);

      try {
        if (h.in!.rotas.profile) await ProcessarProfile({ in: h.id });
        if (h.in!.rotas.contato) await ProcessarContato({ in: h.id });
        if (h.in!.rotas.mensagem) await ProcessarMensagem({ in: h.id });

        const hFresh = await buscarHandshake(h.id);
        if (hFresh && hFresh.in) {
          hFresh.in.status = 'processado';
          hFresh.updatedAt = Date.now();
          await salvarHandshake(hFresh);
        }
      } catch (err: any) {
        addDebugLog(`[SW-ROUTER] ❌ Falha na rota IN do handshake ${h.id}: ${err.message}`);
        const hFresh = await buscarHandshake(h.id);
        if (hFresh && hFresh.in) {
          hFresh.in.status = 'falha';
          hFresh.in.erro = err.message;
          hFresh.updatedAt = Date.now();
          await salvarHandshake(hFresh);
        }
      }
    }

    // 2. PROCESSAR SAIDA (O que vamos enviar)
    if (!navigator.onLine) {
      addDebugLog("[SW-ROUTER] 🌐 Dispositivo offline. Retendo fila de saída (Out).");
      return;
    }

    const todosAposIn = await listarHandshakes();
    const pendentesOut = todosAposIn.filter(h => h.out && (h.out.status === 'pendente' || (h.out.status === 'enviando' && (Date.now() - h.updatedAt) > 60000)) && h.out.tentativas < MAX_TENTATIVAS);

    for (const h of pendentesOut) {
      h.out!.status = 'enviando';
      h.out!.tentativas++;
      h.updatedAt = Date.now();
      await salvarHandshake(h);

      try {
        const contatoIdHash = await normalizarChaveContato(h.aud);
        let contato = await buscarContatoPorChave(contatoIdHash);
        
        if (!contato) throw new Error(`Contato alvo (hash: ${contatoIdHash}) não encontrado.`);
        let profile = await buscarProfile();
        if (!profile) throw new Error("Perfil local não encontrado.");

        let vapidPrivateKeyEnvelope = profile.vapidPrivateKeyEnvelope;
        if (!vapidPrivateKeyEnvelope) {
          const res = await fetch("/api/server-public-key");
          if (!res.ok) throw new Error("Não foi possível obter chave pública do servidor para cifrar envelope VAPID.");
          const serverPublicKeyJwk = await res.json();
          vapidPrivateKeyEnvelope = await cifrarChaveVapid(profile.vapidPrivateKeyJwk, serverPublicKeyJwk);
          profile.vapidPrivateKeyEnvelope = vapidPrivateKeyEnvelope;
          await salvarProfile(profile);
        }

        // INJEÇÃO/CARONA (Piggybacking): Adiciona dados de confiança no pacote caso desatualizado
        const isSyncHandshake = !!(h.out!.rotas?.contato?.sync);
        const isPullHandshake = Array.isArray(h.out!.rotas?.contato?.campos);
        
        if (!isSyncHandshake && !isPullHandshake && (contato.me === 'none' || contato.me === 'wrong')) {
          addDebugLog(`[SW-ROUTER] 💉 Contato desatualizado. Injetando dados de perfil no handshake ${h.id}.`);
          h.out!.rotas.contato = h.out!.rotas.contato || {};
          h.out!.rotas.contato.sync = extrairDadosCompactos(profile, true, contato.trusted === true);
        }

        // Criptografia e Disparo para a Rede Proxy
        const envelope = await cifrarPayloadObj(h.out!.rotas, contato.e2ePublicKey);
        const payloadJwt = { sub: "hand", aud: contato.id, jti: h.id, ct: JSON.stringify(envelope) };
        const jwt = await criarJWT(payloadJwt, profile.vapidPrivateKeyJwk, { kid: profile.vapidPublicKey });
        
        if (jwt.length > 4096) throw new Error(`Payload excede limite da WebPush de 4KB (atual: ${jwt.length})`);

        await enviarParaProxy(
          contato.subscription, jwt,
          { subject: `mailto:${contato.email || profile.email}`, publicKey: contato.vapidPublicKey, privateKey: contato.vapidPrivateKeyEnvelope }
        );

        h.out!.status = 'enviado';
        h.updatedAt = Date.now();
        await salvarHandshake(h);
        addDebugLog(`[SW-ROUTER] 📤 Sucesso! Pacote blindado de Handshake ${h.id} disparado para a rede.`);

      } catch (err: any) {
        addDebugLog(`[SW-ROUTER] ❌ Erro ao enviar handshake OUT ${h.id}: ${err.message}`);
        const hFresh = await buscarHandshake(h.id);
        if (hFresh && hFresh.out) {
          hFresh.out.status = hFresh.out.tentativas >= MAX_TENTATIVAS ? 'falha' : 'pendente';
          hFresh.out.erro = err.message;
          hFresh.updatedAt = Date.now();
          await salvarHandshake(hFresh);
        }
      }
    }

  } catch (err: any) {
    addDebugLog(`[SW-ROUTER] ❌ Erro geral ao processar fila: ${err.message}`);
  } finally {
    // 🔥 Libera a trava independente de erro ou sucesso
    isProcessingFila = false;
  }
}

// Escuta a volta de conectividade ou tarefas agendadas em Background
self.addEventListener('sync', async function (event: any) {
  if (event.tag === 'sync-envio-handshakes') event.waitUntil(processarFilaHandshake());
});
self.addEventListener('online', async function () {
  await processarFilaHandshake();
});

// REMOVIDO: o listener de `message` que estava duplicado e causava os disparos duplos!