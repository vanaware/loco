// src/sw/sw-handshakes.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { gunzipSync } from "fflate";
import { Handshake, MAX_TENTATIVAS } from "../constants/db.ts";
import { buildProxyUrl } from "../constants/config.ts";
import { base64UrlToArrayBuffer, criarJWT } from "../utils/jwt-helpers.ts";
import {
  salvarHandshake,
  buscarHandshake,
  listarHandshakes,
  removerHandshake,
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
import { getServerPublicKey } from '../utils/profile-utils.ts';

import { Processar as ProcessarProfile } from "../handshakes/hand-profile.ts";
import { Processar as ProcessarContato } from "../handshakes/hand-contato.ts";
import { Processar as ProcessarMensagem } from "../handshakes/hand-mensagem.ts";

async function realizarGarbageCollection(emergencia = false) {
  try {
    const todos = await listarHandshakes();
    const agora = Date.now();
    
    const LIMITE_MS = emergencia ? (60 * 60 * 1000) : (7 * 24 * 60 * 60 * 1000); 

    let removidos = 0;
    for (const h of todos) {
      const idade = agora - (h.updatedAt || h.createdAt);
      
      if (idade > LIMITE_MS) {
        const inConcluido = !h.in || ['processado', 'falha'].includes(h.in.status);
        const outConcluido = !h.out || ['enviado', 'entregue', 'falha'].includes(h.out.status);

        const apagarForcado = emergencia && (idade > 3 * 24 * 60 * 60 * 1000);

        if ((inConcluido && outConcluido) || apagarForcado) {
          await removerHandshake(h.id);
          removidos++;
        }
      }
    }
    
    if (removidos > 0) {
      addDebugLog(`[SW-ROUTER] 🧹 Garbage Collection: ${removidos} handshakes antigos removidos (Emergência: ${emergencia}).`);
    }
  } catch (err: any) {
    addDebugLog(`[SW-ROUTER] ❌ Erro durante o Garbage Collection: ${err.message}`);
  }
}

async function salvarHandshakeTransacional(handshake: Handshake, mensagemSucesso?: string) {
  try {
    await salvarHandshake(handshake);
    if (mensagemSucesso) addDebugLog(mensagemSucesso);
  } catch (e: any) {
    if (e.name === 'QuotaExceededError') {
      addDebugLog("[SW-ROUTER] 🚨 CRÍTICO: Cota de armazenamento excedida. Disparando GC de emergência...");
      await realizarGarbageCollection(true);
      
      try {
        await salvarHandshake(handshake);
        addDebugLog("[SW-ROUTER] ✅ Espaço liberado. Handshake salvo com sucesso após emergência.");
      } catch (e2: any) {
        addDebugLog(`[SW-ROUTER] ❌ Falha catastrófica: Disco permanentemente cheio. Erro: ${e2.message}`);
        throw e2;
      }
    } else {
      addDebugLog(`[SW-ROUTER] ❌ Erro ao gravar handshake no IndexedDB: ${e.message}`);
      throw e;
    }
  }
}

export async function processarHandshakeRecebido(payload: any, header: any, _jwt: string) {
  addDebugLog("[SW-ROUTER] 🤝 Handshake recebido. Decifrando envelope...");

  try {
    if (!payload?.jti) {
      addDebugLog("[SW-ROUTER] ⚠️ Handshake rejeitado precocemente: Ausência de 'jti'");
      return;
    }
    if (!payload?.ct) {
      addDebugLog("[SW-ROUTER] ⚠️ Handshake rejeitado precocemente: Ausência de 'ct' (envelope cifrado)");
      return;
    }

    const privateDecryptKey = await buscarChaveDecript();
    if (!privateDecryptKey) {
      throw new Error("Chave privada RSA não encontrada para decifrar handshake.");
    }

    let envelope;
    try {
      envelope = JSON.parse(payload.ct);
    } catch (_e) {
      addDebugLog("[SW-ROUTER] ⚠️ Falha ao fazer parse do envelope cifrado 'ct'. JSON malformado.");
      return;
    }

    const iv = envelope.i || envelope.iv;
    const dados = envelope.d || envelope.dadosCifrados;
    const chaveAesCifrada = envelope.k || envelope.chaveAesCifrada;

    if (!iv || !dados || !chaveAesCifrada) {
      addDebugLog("[SW-ROUTER] ⚠️ Envelope incompleto. Descarte antecipado.");
      return;
    }

    const ivBytes = new Uint8Array(base64UrlToArrayBuffer(iv));
    const dadosBytes = new Uint8Array(base64UrlToArrayBuffer(dados));
    const chaveAesCifradaBytes = new Uint8Array(base64UrlToArrayBuffer(chaveAesCifrada));

    const aesChaveCruaBuffer = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateDecryptKey, chaveAesCifradaBytes);
    const chaveSimetricaAes = await crypto.subtle.importKey("raw", aesChaveCruaBuffer, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const textoDecifradoBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, chaveSimetricaAes, dadosBytes);

    let decompressed;
    let rotasObj;
    try {
      decompressed = gunzipSync(new Uint8Array(textoDecifradoBuffer));
      rotasObj = JSON.parse(new TextDecoder().decode(decompressed));
    } catch (_e) {
      addDebugLog("[SW-ROUTER] ⚠️ Falha ao descomprimir (fflate) ou fazer parse JSON do payload decifrado.");
      throw new Error("Falha na descompressão ou parse do payload interno.");
    }

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

    await salvarHandshakeTransacional(handshake, `[SW-ROUTER] ✅ Handshake ${handshake.id} decifrado e enfileirado para processamento In.`);
    
    processarFilaHandshake().catch(err => console.error(err));

  } catch (err: any) {
    addDebugLog(`[SW-ROUTER] ❌ Erro ao decifrar handshake recebido: ${err.message}`);
    throw err;
  }
}

let isProcessingFila = false;

export async function processarFilaHandshake() {
  if (isProcessingFila) {
    return;
  }
  
  isProcessingFila = true;
  addDebugLog("[SW-ROUTER] 🔄 Processando fila geral de handshakes...");

  try {
    const todos = await listarHandshakes();

    const pendentesIn = todos.filter(h => h.in && (h.in.status === 'recebido' || (h.in.status === 'processando' && (Date.now() - h.updatedAt) > 60000)) && h.in.tentativas < MAX_TENTATIVAS);

    for (const h of pendentesIn) {
      h.in!.status = 'processando';
      h.in!.tentativas++;
      h.updatedAt = Date.now();
      await salvarHandshakeTransacional(h);

      try {
        if (h.in!.rotas.profile) await ProcessarProfile({ in: h.id });
        if (h.in!.rotas.contato) await ProcessarContato({ in: h.id });
        if (h.in!.rotas.mensagem) await ProcessarMensagem({ in: h.id });

        const hFresh = await buscarHandshake(h.id);
        if (hFresh && hFresh.in) {
          hFresh.in.status = 'processado';
          hFresh.updatedAt = Date.now();
          await salvarHandshakeTransacional(hFresh);
        }
      } catch (err: any) {
        addDebugLog(`[SW-ROUTER] ❌ Falha na rota IN do handshake ${h.id}: ${err.message}`);
        const hFresh = await buscarHandshake(h.id);
        if (hFresh && hFresh.in) {
          hFresh.in.status = 'falha';
          hFresh.in.erro = err.message;
          hFresh.updatedAt = Date.now();
          await salvarHandshakeTransacional(hFresh);
        }
      }
    }

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
      await salvarHandshakeTransacional(h);

      try {
        const contatoIdHash = await normalizarChaveContato(h.aud);
        const contato = await buscarContatoPorChave(contatoIdHash);
        
        if (!contato) throw new Error(`Contato alvo (hash: ${contatoIdHash}) não encontrado.`);
        const profile = await buscarProfile();
        if (!profile) throw new Error("Perfil local não encontrado.");

        let vapidPrivateKeyEnvelope = profile.vapidPrivateKeyEnvelope;
        if (!vapidPrivateKeyEnvelope) {
          const serverPublicKeyJwk = await getServerPublicKey();
          vapidPrivateKeyEnvelope = await cifrarChaveVapid(profile.vapidPrivateKeyJwk, serverPublicKeyJwk);
          profile.vapidPrivateKeyEnvelope = vapidPrivateKeyEnvelope;
          await salvarProfile(profile);
        }

        const isSyncHandshake = !!(h.out!.rotas?.contato?.sync);
        const isPullHandshake = Array.isArray(h.out!.rotas?.contato?.campos);
        
        if (!isSyncHandshake && !isPullHandshake && (contato.me === 'none' || contato.me === 'wrong')) {
          addDebugLog(`[SW-ROUTER] 💉 Contato desatualizado. Injetando dados de perfil no handshake ${h.id}.`);
          h.out!.rotas.contato = h.out!.rotas.contato || {};
          h.out!.rotas.contato.sync = extrairDadosCompactos(profile, true, contato.trusted === true) as unknown as Record<string, unknown>;
        }

        // 🔥 ARQUITETURA: Correção do Roteamento
        // Se a URL de proxy do contato for absoluta, usa ela pura para evitar corrupção por concatenação
        let proxyserverDestino = "";
        if (contato.subscription.proxyserver) {
           proxyserverDestino = contato.subscription.proxyserver;
        } else {
           proxyserverDestino = await buildProxyUrl('/');
        }

        const envelope = await cifrarPayloadObj(h.out!.rotas, contato.e2ePublicKey);
        const payloadJwt = { 
          sub: "hand", 
          aud: contato.id, 
          jti: h.id, 
          ct: JSON.stringify(envelope),
          proxyserver: proxyserverDestino
        };
        const jwt = await criarJWT(payloadJwt, profile.vapidPrivateKeyJwk, { kid: profile.vapidPublicKey });
        
        if (jwt.length > 4096) throw new Error(`Payload excede limite da WebPush de 4KB (atual: ${jwt.length})`);

        await enviarParaProxy(
          contato.subscription, jwt,
          { subject: `mailto:${contato.email || profile.email}`, publicKey: contato.vapidPublicKey, privateKey: contato.vapidPrivateKeyEnvelope }
        );

        h.out!.status = 'enviado';
        h.updatedAt = Date.now();
        await salvarHandshakeTransacional(h);
        addDebugLog(`[SW-ROUTER] 📤 Sucesso! Pacote blindado de Handshake ${h.id} disparado para a rede.`);

      } catch (err: any) {
        addDebugLog(`[SW-ROUTER] ❌ Erro ao enviar handshake OUT ${h.id}: ${err.message}`);
        const hFresh = await buscarHandshake(h.id);
        if (hFresh && hFresh.out) {
          hFresh.out.status = hFresh.out.tentativas >= MAX_TENTATIVAS ? 'falha' : 'pendente';
          hFresh.out.erro = err.message;
          hFresh.updatedAt = Date.now();
          await salvarHandshakeTransacional(hFresh);
        }
      }
    }
    
    await realizarGarbageCollection(false);

  } catch (err: any) {
    addDebugLog(`[SW-ROUTER] ❌ Erro geral ao processar fila: ${err.message}`);
  } finally {
    isProcessingFila = false;
  }
}

self.addEventListener('sync', function (event: any) {
  if (event.tag === 'sync-envio-handshakes') {
    event.waitUntil(processarFilaHandshake());
  }
});

self.addEventListener('online', function (event: Event) {
  if ('waitUntil' in event) {
    (event as ExtendableEvent).waitUntil(processarFilaHandshake());
  } else {
    processarFilaHandshake();
  }
});