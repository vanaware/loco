// src/sw/sw-handshakes.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { gunzipSync } from "fflate";
import { Handshake } from "@loco/utils/interfaces";
import { MAX_TENTATIVAS } from "@loco/utils/config";
import { base64UrlToBuffer, criarJWT } from "@loco/utils/crypto";
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
  normalizarChaveContato,
  removerContatoPorHash,
  gerarId
} from "@loco/utils/db";
import { cifrarPayloadObj, enviarParaProxy, cifrarChaveVapid } from "@loco/utils/proxy";
import { extrairDadosCompactos } from "@loco/utils/db";
import { addDebugLog } from "@loco/utils/debug";
import { Processar as ProcessarProfile } from "../handshakes/hand-profile.ts";
import { Processar as ProcessarContato } from "../handshakes/hand-contato.ts";
import { Processar as ProcessarMensagem } from "../handshakes/hand-mensagem.ts";

// 🔥 Stub temporário: Mova para @loco/utils/proxy se for genérico, ou mantenha local se for específico do SW
async function getServerPublicKey(): Promise<JsonWebKey> {
  // Implementação real deve buscar a chave pública do servidor para cifrar o envelope VAPID
  throw new Error("getServerPublicKey não implementado. Adicione a lógica de fetch da chave do servidor.");
}

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
      addDebugLog(`[SW-ROUTER] 🧹 Garbage Collection: ${removidos} handshakes antigos removidos.`);
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
      addDebugLog("[SW-ROUTER] 🚨 CRÍTICO: Cota excedida. Disparando GC de emergência...");
      await realizarGarbageCollection(true);
      try {
        await salvarHandshake(handshake);
      } catch (e2: any) {
        throw e2;
      }
    } else {
      throw e;
    }
  }
}

export async function processarHandshakeRecebido(payload: any, header: any, _jwt: string) {
  addDebugLog("[SW-ROUTER] 🤝 Handshake recebido. Decifrando envelope...");
  try {
    if (!payload?.jti || !payload?.ct) return;
    const privateDecryptKey = await buscarChaveDecript();
    if (!privateDecryptKey) throw new Error("Chave privada RSA não encontrada para decifrar handshake.");
    
    let envelope;
    try {
      envelope = JSON.parse(payload.ct);
    } catch (_e) {
      return;
    }
    
    const iv = envelope.i || envelope.iv;
    const dados = envelope.d || envelope.dadosCifrados;
    const chaveAesCifrada = envelope.k || envelope.chaveAesCifrada;
    if (!iv || !dados || !chaveAesCifrada) return;

    const ivBytes = new Uint8Array(base64UrlToBuffer(iv));
    const dadosBytes = new Uint8Array(base64UrlToBuffer(dados));
    const chaveAesCifradaBytes = new Uint8Array(base64UrlToBuffer(chaveAesCifrada));

    const aesChaveCruaBuffer = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateDecryptKey, chaveAesCifradaBytes);
    const chaveSimetricaAes = await crypto.subtle.importKey("raw", aesChaveCruaBuffer, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const textoDecifradoBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, chaveSimetricaAes, dadosBytes);
    
    let decompressed;
    let rotasObj;
    try {
      decompressed = gunzipSync(new Uint8Array(textoDecifradoBuffer));
      rotasObj = JSON.parse(new TextDecoder().decode(decompressed));
    } catch (_e) {
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

let processingPromise: Promise<void> | null = null;

export async function processarFilaHandshake(): Promise<void> {
  if (processingPromise) return processingPromise;
  
  processingPromise = (async () => {
    addDebugLog("[SW-ROUTER] 🔄 Processando fila geral de handshakes...");
    try {
      const todos = await listarHandshakes();
      
      // === 1. PROCESSAMENTO DE ENTRADA (IN) ===
      const pendentesIn = todos.filter((h: Handshake) => h.in && (h.in.status === 'recebido' || (h.in.status === 'processando' && (Date.now() - h.updatedAt) > 60000)) && h.in.tentativas < MAX_TENTATIVAS);
      
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

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return;
      }

      // === 2. PROCESSAMENTO DE SAÍDA (OUT) ===
      const todosAposIn = await listarHandshakes();
      const pendentesOut = todosAposIn.filter((h: Handshake) => h.out && (h.out.status === 'pendente' || (h.out.status === 'enviando' && (Date.now() - h.updatedAt) > 60000)) && h.out.tentativas < MAX_TENTATIVAS);
      
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
          const ehReTentativa = h.out!.tentativas > 1;
          const isProfilePiggybackReady = !!(
            profile.vapidPublicKey && profile.e2ePublicKey && profile.subscription?.endpoint && profile.subscription?.proxyserver 
          );
          const precisaDePerfilInjetado = isProfilePiggybackReady && ((contato.me === 'none' || contato.me === 'wrong') || (ehReTentativa && !h.out!.rotas.contato?.sync));
          let injetouPIGNestaRodada = false;

          if (!isSyncHandshake && !isPullHandshake && precisaDePerfilInjetado) {
            addDebugLog(`[SW-ROUTER] 💉 Injetando dados de perfil no handshake ${h.id} (Motivo: Contato Desatualizado / Re-tentativa).`);
            h.out!.rotas.contato = h.out!.rotas.contato || {};
            h.out!.rotas.contato.sync = await extrairDadosCompactos(profile, true, contato.trusted === true) as unknown as Record<string, unknown>;
            injetouPIGNestaRodada = true;
          }

          let envelope = await cifrarPayloadObj(h.out!.rotas, contato.e2ePublicKey);
          let payloadJwt: any = { sub: "hand", aud: contato.id, jti: h.id, ct: JSON.stringify(envelope) };
          let jwt = await criarJWT(payloadJwt, profile.vapidPrivateKeyJwk, { kid: profile.vapidPublicKey });

          if (jwt.length > 4000 && injetouPIGNestaRodada) {
            addDebugLog(`[SW-ROUTER] ✂️ MTU Excedido (${jwt.length} bytes). Fragmentando o PIG para um Handshake independente...`);
            const pigSyncData = h.out!.rotas.contato!.sync;
            delete h.out!.rotas.contato!.sync;
            if (Object.keys(h.out!.rotas.contato!).length === 0) delete h.out!.rotas.contato;
            
            envelope = await cifrarPayloadObj(h.out!.rotas, contato.e2ePublicKey);
            payloadJwt.ct = JSON.stringify(envelope);
            jwt = await criarJWT(payloadJwt, profile.vapidPrivateKeyJwk, { kid: profile.vapidPublicKey });
            
            const handshakePIG: Handshake = {
              id: gerarId(), aud: contato.id, createdAt: Date.now(), updatedAt: Date.now(),
              out: { status: 'pendente', tentativas: 0, rotas: { contato: { sync: pigSyncData } } }
            };
            await salvarHandshakeTransacional(handshakePIG, `[SW-ROUTER] ✅ Handshake de PIG fragmentado salvo na fila.`);
            setTimeout(() => processarFilaHandshake(), 100);
          }

          if (jwt.length > 4096) throw new Error(`Payload excede limite da WebPush de 4KB (atual: ${jwt.length})`);
          
          await enviarParaProxy(
            contato.subscription, jwt,
            { subject: `mailto:${contato.email || profile.email}`, publicKey: contato.vapidPublicKey, privateKey: contato.vapidPrivateKeyEnvelope }
          );
          
          h.out!.status = 'enviado';
          h.updatedAt = Date.now();
          await salvarHandshakeTransacional(h);
          
          if (h.out!.rotas?.contato?.removerContato) {
            await removerContatoPorHash(h.aud);
          }
        } catch (err: any) {
          if (h && h.out) {
            h.out.status = h.out.tentativas >= MAX_TENTATIVAS ? 'falha' : 'pendente';
            h.out.erro = err.message;
            h.updatedAt = Date.now();
            await salvarHandshakeTransacional(h);
            if (h.out.status === 'falha' && h.out.rotas?.contato?.removerContato) {
              await removerContatoPorHash(h.aud);
            }
          }
        }
      }
      
      await realizarGarbageCollection(false);
    } catch (err: any) {
      addDebugLog(`[SW-ROUTER] ❌ Erro geral ao processar fila: ${err.message}`);
    }
  })();
  
  try {
    await processingPromise;
  } finally {
    processingPromise = null;
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