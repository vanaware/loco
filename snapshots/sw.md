> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém experimentos e código da área de @loco/service-worker
> O projeto é o **Loco [vdev] ** estruturado em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco [vdev] - Modo: SW

Gerado automaticamente em: 8/30/2026, 1:28:04 AM

---

## Arquivo: `monorepo/service-worker/src/sw/click.ts`

```ts
// src/sw/click.ts

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

self.addEventListener('notificationclick', function(event: any) {
  console.log("[SW-CLICK] 🔗 ===== CLIQUE NA NOTIFICAÇÃO DETECTADO =====");
  event.notification.close();
  
  // 🔥 ARQUITETURA: Usa o escopo do Service Worker registrado em vez de '/' hardcoded.
  // Isso garante que o clique na notificação abra o app no diretório correto (ex: Github Pages).
  const urlParaAbrir = new URL(self.registration.scope).href;
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(windowClients) {
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (client && client.url === urlParaAbrir && 'focus' in client) {
            try {
              return client.focus();
            } catch (err: any) {
              console.warn("[SW-CLICK] ⚠️ Não foi possível focar a janela:", err.message);
              break;
            }
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlParaAbrir)
            .catch(function(err: any) {
              console.warn("[SW-CLICK] ⚠️ Não foi possível abrir janela:", err.message);
              return Promise.resolve();
            });
        }
      })
  );
});
```

---

## Arquivo: `monorepo/service-worker/src/sw/mod.ts`

```ts
// reservado para futuras exportações
```

---

## Arquivo: `monorepo/service-worker/src/sw/sw-utils.ts`

```ts
// src/sw/sw-utils.ts
import { addDebugLog } from '@loco/utils/debug';
import { APP_VERSION } from '@loco/utils/config';

export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration> {
  addDebugLog("📡 Verificando suporte ao Service Worker...");
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Worker não é suportado neste navegador.");
  }

  // 🔥 ARQUITETURA: Resolução Dinâmica de Rota Base (Environment Agnostic)
  // Lemos a URL atual para descobrir se estamos rodando na raiz (/) ou em um subdiretório (/loco/)
  let basePath = globalThis.location.pathname;
  
  // Se a URL aponta para um arquivo (ex: /loco/index.html), extraímos apenas o diretório
  if (basePath.split('/').pop()?.includes('.')) {
    basePath = basePath.substring(0, basePath.lastIndexOf('/') + 1);
  } else if (!basePath.endsWith('/')) {
    // Se a URL é /loco (sem barra no final), forçamos a barra. 
    // Isso evita que o navegador interprete "loco" como arquivo e tente registrar o SW na raiz "/".
    basePath += '/';
  }

  addDebugLog(`⏳ Registrando Service Worker no escopo: ${basePath}`);

  try {
    const registration = await navigator.serviceWorker.register(
      `${basePath}service-worker.js?v=${APP_VERSION}`,
      { scope: basePath }
    );
    
    if (!registration) {
      throw new Error("Service Worker registration retornou null/undefined");
    }
    
    addDebugLog("✅ Service Worker registrado, aguardando ready...");
    const readyReg = await navigator.serviceWorker.ready;
    
    // 🔥 ARQUITETURA: Checagem Introspectiva de Versão (App vs SW)
    if (readyReg.active) {
      // Criamos um túnel de comunicação seguro (MessageChannel)
      const channel = new MessageChannel();
      
      // A UI fica escutando a porta 1
      channel.port1.onmessage = (event) => {
        if (event.data && event.data.type === 'PONG_SW_VERSION') {
          const swVersion = event.data.version;
          
          if (swVersion !== APP_VERSION) {
            addDebugLog("warn", "SYSTEM", `⚠️ Inconsistência de Versão! App está rodando v${APP_VERSION}, mas o Service Worker ativo em background é v${swVersion}. Um recarregamento forçado pode ser necessário.`);
          } else {
            addDebugLog("info", "SYSTEM", `🔒 Match de versão verificado: App e SW estão sincronizados na v${APP_VERSION}.`);
          }
        }
      };
      
      // A UI manda o sinal de PING pela porta 2 direto para o Worker ativo
      readyReg.active.postMessage({ type: 'PING_SW_VERSION' }, [channel.port2]);
    }
    
    return readyReg;
  } catch (err: any) {
    addDebugLog("❌ Erro ao registrar Service Worker: " + (err?.message || String(err)));
    throw new Error(`Falha ao registrar Service Worker: ${err?.message || String(err)}`);
  }
}
```

---

## Arquivo: `monorepo/service-worker/src/sw/cache.ts`

```ts
// src/sw/cache.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;
declare const __GENERATED_ASSETS__: string[];

import { APP_VERSION } from "@loco/utils/config";

const CACHE_NAME = `loco-proto-cache-v${APP_VERSION}`;
const ASSETS_TO_CACHE: string[] = __GENERATED_ASSETS__;

self.addEventListener("install", (event) => {
  console.log("[SW-CACHE] 🛠️ Instalando novo Service Worker...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW-CACHE] 📦 Armazenando assets essenciais no cache local...");
      return Promise.all(
        ASSETS_TO_CACHE.map((url) => {
          return cache.add(url).catch((err) => {
            console.error(`[SW-CACHE] ❌ Falha ao cachear recurso: ${url}`, err);
          });
        })
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  console.log("[SW-CACHE] ✨ Ativando Service Worker e limpando caches antigos...");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log(`[SW-CACHE] 🗑️ Removendo cache obsoleto: ${cache}`);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event: any) => {
  if (event.request.method !== "GET") {
    return;
  }
  if (!event.request.url.startsWith(self.location.origin) || event.request.url.includes("/api/")) {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      })
      .catch(() => {
        console.log(`[SW-CACHE] 🔌 Usuário Offline. Servindo do cache: ${event.request.url}`);
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          return new Response("Você está offline e este recurso não foi mapeado no cache.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
        });
      })
  );
});
```

---

## Arquivo: `monorepo/service-worker/src/sw/push.ts`

```ts
// src/sw/push.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { verificarJWT } from "@loco/utils/crypto";
import { processarHandshakeRecebido } from "./sw-handshakes.ts";
import { addDebugLog } from "@loco/utils/debug";

addDebugLog("[SW-PUSH-ROUTER] 🔀 Event Listener de Push engatilhado.");

self.addEventListener('push', function (event) {
  if (!event.data) return;
  const rawText = event.data.text();
  addDebugLog(`[SW-PUSH-ROUTER] 📩 WebPush físico recebido! (Tamanho: ${rawText.length} bytes)`);
  
  if (rawText.split('.').length !== 3) {
    event.waitUntil(
      self.registration.showNotification("Notificação", { body: "Dados crus capturados." })
    );
    return;
  }

  event.waitUntil(
    (async function () {
      try {
        const { header, payload, valid } = await verificarJWT(rawText);
        if (!valid) {
          addDebugLog("[SW-PUSH-ROUTER] ⚠️ Assinatura de pacote rejeitada.");
          await self.registration.showNotification("⚠️ Assinatura inválida", {
            body: `Mensagem rejeitada por falha de integridade.`,
            icon: '/icon-192.png',
          });
          return;
        }
        
        if (payload.sub === "hand") {
          await processarHandshakeRecebido(payload, header, rawText);
          return;
        }
        
        addDebugLog(`[SW-PUSH-ROUTER] ⚠️ JWT legado recebido e ignorado: ${payload.sub}`);
      } catch (err: any) {
        addDebugLog(`[SW-PUSH-ROUTER] ❌ Falha crítica no desempacotamento de Push: ${err.message}`);
        await self.registration.showNotification("⚠️ Erro de Rede", {
          body: "Falha criptográfica no processamento de uma mensagem recebida.",
          icon: '/icon-192.png',
        });
      }
    })()
  );
});
```

---

## Arquivo: `monorepo/service-worker/src/sw/sw-handshakes.ts`

```ts
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
```

---

## Arquivo: `monorepo/service-worker/src/handshakes/hand-sdp.ts`

```ts
// src/handshakes/hand-sdp.ts

/**
 * Handshake para Sinalização WebRTC (SDP - Session Description Protocol).
 * 
 * Este módulo gerencia a troca assíncrona de Offers e Answers para estabelecer
 * conexões Peer-to-Peer diretas, utilizando a nossa malha de Push/Handshakes 
 * sem precisar de um servidor WebSocket.
 */

// Tipagem das mensagens de sinalização que trafegarão criptografadas (E2EE)
export interface SdpPayload {
  type: "offer" | "answer";
  sdp: string; // O Session Description Protocol (dados da conexão)
  // No modo "Vanilla ICE", os candidates já vêm embutidos no SDP, 
  // mas deixamos espaço para enviar candidates atrasados se necessário.
  iceCandidates?: RTCIceCandidateInit[];
}

export interface HandshakeSdpContext {
  senderId: string;
  recipientId: string;
  payload: SdpPayload;
  timestamp: number;
}

/**
 * Inicia a criação de uma Oferta WebRTC (Alice -> Bob).
 * Chamamos isso quando precisamos abrir um canal P2P e não há um ativo.
 */
export async function createSdpOffer(recipientId: string): Promise<HandshakeSdpContext | null> {
  try {
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" } // STUN público para furar NAT
      ]
    });

    // 1. Criamos um DataChannel (onde os arquivos/mensagens vão trafegar)
    // O id do dataChannel suprimido para o TypeScript não reclamar. Deixamos o WebRTC negociar
    const dataChannel = peerConnection.createDataChannel("loco-p2p-channel", {
      negotiated: true,
      id: 0
    });

    // TODO: Salvar `peerConnection` e `dataChannel` no state manager (Signals)
    // mapeado pelo `recipientId` para usarmos depois.

    // 2. Criamos a Oferta
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // 3. Aguardamos a coleta de ICE Candidates (Vanilla ICE)
    // Para não gerar multiplos Push, esperamos a coleta terminar (ou dar timeout)
    await new Promise<void>((resolve) => {
      if (peerConnection.iceGatheringState === "complete") {
        resolve();
      } else {
        const checkState = () => {
          if (peerConnection.iceGatheringState === "complete") {
            peerConnection.removeEventListener("icegatheringstatechange", checkState);
            resolve();
          }
        };
        peerConnection.addEventListener("icegatheringstatechange", checkState);
        // Timeout de segurança (ex: 3 segundos) para não travar o envio se o STUN falhar
        setTimeout(resolve, 3000);
      }
    });

    // O SDP final (com ICE inclusos) fica salvo em localDescription
    const finalSdp = peerConnection.localDescription;
    if (!finalSdp) return null;

    return {
      senderId: "me", // Será preenchido pelo orquestrador
      recipientId,
      timestamp: Date.now(),
      payload: {
        type: "offer",
        sdp: finalSdp.sdp
      }
    };
  } catch (error) {
    console.error("Erro ao criar SDP Offer:", error);
    return null;
  }
}

/**
 * Processador principal da Máquina de Estados para Handshakes SDP.
 * Acionado (geralmente pelo Service Worker) quando um Push de SDP chega.
 */
export async function processSdpHandshake(context: HandshakeSdpContext): Promise<void> {
  console.log(`[Handshake SDP] Processando ${context.payload.type} de ${context.senderId}`);

  if (context.payload.type === "offer") {
    await handleIncomingOffer(context);
  } else if (context.payload.type === "answer") {
    await handleIncomingAnswer(context);
  }
}

/**
 * Bob recebe a Oferta de Alice, aplica, gera uma Resposta e envia de volta.
 */
async function handleIncomingOffer(context: HandshakeSdpContext): Promise<void> {
  const peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  // Configura a escuta para o DataChannel que Alice criou
  peerConnection.addEventListener("datachannel", (event) => {
    const channel = event.channel;
    console.log(`[WebRTC] DataChannel estabelecido com ${context.senderId}!`);
    
    // TODO: Conectar os eventos onmessage, onopen, onclose no State/IndexedDB
    channel.onmessage = (e) => console.log(`[P2P] Mensagem de ${context.senderId}:`, e.data);
  });

  // 1. Aplica o SDP da Alice
  await peerConnection.setRemoteDescription({
    type: "offer",
    sdp: context.payload.sdp
  });

  // 2. Cria a Resposta (Answer)
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  // 3. Aguarda os ICE Candidates do Bob
  await new Promise<void>((resolve) => {
    if (peerConnection.iceGatheringState === "complete") {
      resolve();
    } else {
      const checkState = () => {
        if (peerConnection.iceGatheringState === "complete") {
          peerConnection.removeEventListener("icegatheringstatechange", checkState);
          resolve();
        }
      };
      peerConnection.addEventListener("icegatheringstatechange", checkState);
      setTimeout(resolve, 3000); // Timeout
    }
  });

  const finalSdp = peerConnection.localDescription;
  
  if (finalSdp) {
    const answerPayload: SdpPayload = {
      type: "answer",
      sdp: finalSdp.sdp
    };

    // TODO: Chamar o orquestrador de Handshakes para encriptar e enviar
    // `answerPayload` de volta para `context.senderId` via Push/Proxy.
    console.log("[Handshake SDP] Answer gerada e pronta para envio.", answerPayload);
  }
}

/**
 * Alice recebe a Resposta de Bob e finaliza o túnel WebRTC.
 */
async function handleIncomingAnswer(context: HandshakeSdpContext): Promise<void> {
  // TODO: Recuperar o `peerConnection` criado pela Alice em `createSdpOffer` 
  // buscando no gerenciador de estado pelo `context.senderId`.
  
  // Utilizando 'as unknown' para forçar o TS a entender que isso será populado no futuro 
  // e evitar o erro "never" de código morto
  const peerConnection = null as unknown as RTCPeerConnection; 

  if (!peerConnection) {
    console.warn(`[Handshake SDP] PeerConnection não encontrado para ${context.senderId}. Foi descartado?`);
    return;
  }

  // 1. Aplica o SDP do Bob
  await peerConnection.setRemoteDescription({
    type: "answer",
    sdp: context.payload.sdp
  });

  // Se houverem candidates atrasados enviados manualmente, os adicionamos aqui
  if (context.payload.iceCandidates) {
    for (const candidate of context.payload.iceCandidates) {
      await peerConnection.addIceCandidate(candidate);
    }
  }

  console.log(`[Handshake SDP] WebRTC Signaling finalizado com ${context.senderId}! Conexão P2P iminente.`);
}
```

---

## Arquivo: `monorepo/service-worker/src/handshakes/hand-mensagem.ts`

```ts
// src/handshakes/hand-mensagem.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { Handshake, Chat } from "@loco/utils/interfaces";
import { gerarId, buscarHandshake, salvarHandshake, buscarChat, salvarChat, buscarContatoPorChave, buscarProfile, removerTodoHistoricoChat, removerChat, listarHandshakes, removerHandshake, ehContatoProprio } from "@loco/utils/db";
import { processarFilaHandshake } from "../sw/sw-handshakes.ts";
import { addDebugLog } from "@loco/utils/debug"; 

interface MensagemOutParams {
  function: string;
  contato: string;
  conteudo?: string;
  mensagem?: string;
  campos?: string[];
  msgId?: string;        
  handshakeId?: string;  
  createdAt?: number;
}

async function notificarUI(chatId: string) {
  if (typeof self !== 'undefined' && self.clients && typeof self.clients.matchAll === 'function') {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(client => client.postMessage({ type: 'CHAT_ATUALIZADO', payload: { chatId } }));
  }
}

export async function ExpurgarMensagens(contatoHash: string, notificarRemoto = false) {
  addDebugLog("warn", "HAND-MENSAGEM", `🗑️ Expurgando histórico de mensagens do contato ${contatoHash} (Notificar Remoto: ${notificarRemoto})`);
  await removerTodoHistoricoChat(contatoHash);
  const todos = await listarHandshakes();
  for (const h of todos) {
    if (h.aud === contatoHash && (h.in?.rotas.mensagem || h.out?.rotas.mensagem)) {
      await removerHandshake(h.id);
    }
  }
  if (notificarRemoto) {
    const novoHandshake: Handshake = {
      id: gerarId(),
      aud: contatoHash,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      out: {
        status: 'pendente',
        tentativas: 0,
        rotas: { mensagem: { limparHistorico: true } }
      }
    };
    await salvarHandshake(novoHandshake);
    addDebugLog("info", "HAND-MENSAGEM", `🚀 Handshake de limpeza total de histórico enviado para a fila (aud: ${contatoHash}).`);
    setTimeout(() => processarFilaHandshake(), 100);
  }
}

export async function Processar({ in: handshakeId, out: outParams }: { in?: string, out?: MensagemOutParams }) {
  if (handshakeId) {
    addDebugLog(`[HAND-MENSAGEM] 📥 Processando entrada do handshake ${handshakeId}`);
    const handshake = await buscarHandshake(handshakeId);
    if (!handshake || !handshake.in || !handshake.in.rotas.mensagem) return;
    
    const msgReq = handshake.in.rotas.mensagem;
    
    if (msgReq.limparHistorico === true) {
      addDebugLog("warn", "HAND-MENSAGEM", `📩 Solicitação de expurgo TOTAL de histórico recebida do contato ${handshake.aud}`);
      await removerTodoHistoricoChat(handshake.aud);
      await notificarUI("ALL_PURGED");
      addDebugLog("success", "HAND-MENSAGEM", `🗑️ Todo o histórico do contato ${handshake.aud} foi apagado com sucesso.`);
      return;
    }
    
    if (msgReq.recebida && Array.isArray(msgReq.campos)) {
      addDebugLog(`[HAND-MENSAGEM] 📩 Solicitação PULL de status da mensagem ${msgReq.recebida}.`);
      const msgLocal = await buscarChat(msgReq.recebida);
      const rotasMsgData: Record<string, unknown> = { recebida: msgReq.recebida };
      if (msgLocal) {
        const camposSet = new Set(msgReq.campos);
        if (camposSet.has('readAt')) rotasMsgData.readAt = msgLocal.readAt;
        if (camposSet.has('receivedAt')) rotasMsgData.receivedAt = msgLocal.receivedAt;
      }
      handshake.out = { status: 'pendente', tentativas: 0, rotas: { mensagem: { data: rotasMsgData } } };
      handshake.updatedAt = Date.now();
      await salvarHandshake(handshake);
      setTimeout(() => processarFilaHandshake(), 100);
    }
    else if (msgReq.data && typeof msgReq.data.recebida === 'string' && typeof msgReq.data.status === 'string') {
      addDebugLog(`[HAND-MENSAGEM] 📩 Auto-Ack recebido. Status: ${msgReq.data.status}`);
      const msgLocal = await buscarChat(msgReq.data.recebida);
      if (msgLocal && msgLocal.tipo === 'out') {
        if (msgReq.data.status === 'entregue') msgLocal.receivedAt = Date.now();
        if (msgReq.data.status === 'lida') msgLocal.readAt = Date.now();
        await salvarChat(msgLocal);
        await notificarUI(msgLocal.id);
      }
    }
    else if (msgReq.excluida && typeof msgReq.excluida === 'string') {
      addDebugLog(`[HAND-MENSAGEM] 📩 Solicitação de exclusão remota da mensagem ${msgReq.excluida}`);
      const msgLocal = await buscarChat(msgReq.excluida);
      if (msgLocal && msgLocal.contatoHash === handshake.aud) {
        await removerChat(msgReq.excluida, handshake.aud);
        await notificarUI(msgReq.excluida);
        addDebugLog(`[HAND-MENSAGEM] 🗑️ Mensagem ${msgReq.excluida} apagada remotamente com sucesso.`);
      }
    }
    else if (msgReq.enviada && msgReq.conteudo) {
      addDebugLog(`[HAND-MENSAGEM] 📩 Nova mensagem recebida do remetente ${handshake.aud}`);
      const novaMsgRecebida: Chat = {
        id: msgReq.enviada,
        contatoHash: handshake.aud,
        conteudo: msgReq.conteudo,
        tipo: 'in',
        createdAt: Date.now(),
        receivedAt: Date.now(),
        handshake: handshakeId
      };
      await salvarChat(novaMsgRecebida);
      
      const ackHandshake: Handshake = {
        id: gerarId(),
        aud: handshake.aud,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        out: {
          status: 'pendente', tentativas: 0,
          rotas: { mensagem: { data: { recebida: novaMsgRecebida.id, status: 'entregue' } } }
        }
      };
      await salvarHandshake(ackHandshake);
      
      let appEstaAberto = false;
      if (typeof self !== 'undefined' && self.clients && typeof self.clients.matchAll === 'function') {
        const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        appEstaAberto = windowClients.length > 0;
      }
      
      if (!appEstaAberto && typeof self !== 'undefined' && self.registration && typeof self.registration.showNotification === 'function') {
        const contato = await buscarContatoPorChave(handshake.aud);
        const nomeExibicao = contato?.name?.trim() || "Anônimo";
        await self.registration.showNotification(`📥 Nova mensagem`, {
          body: `${novaMsgRecebida.conteudo}\n\nDe: ${nomeExibicao}`,
          icon: '/icon-192.png',
          tag: novaMsgRecebida.id
        });
      }
      await notificarUI(novaMsgRecebida.id);
      setTimeout(() => processarFilaHandshake(), 100);
    }
  }

  if (outParams) {
    if (outParams.function === 'confirmarEntrega') {
      const { contato: contatoId, mensagem: mensagemId, campos } = outParams;
      const novoHandshake: Handshake = {
        id: gerarId(), aud: contatoId, createdAt: Date.now(), updatedAt: Date.now(),
        out: { status: 'pendente', tentativas: 0, rotas: { mensagem: { recebida: mensagemId, campos } } }
      };
      await salvarHandshake(novoHandshake);
      setTimeout(() => processarFilaHandshake(), 100);
    }
    else if (outParams.function === 'excluirMensagem') {
      const { contato: contatoId, msgId } = outParams;
      if (!msgId) throw new Error("ID da mensagem não fornecido para exclusão.");
      const novoHandshake: Handshake = {
        id: gerarId(), aud: contatoId, createdAt: Date.now(), updatedAt: Date.now(),
        out: { status: 'pendente', tentativas: 0, rotas: { mensagem: { excluida: msgId } } }
      };
      await salvarHandshake(novoHandshake);
      addDebugLog(`[HAND-MENSAGEM] 🗑️ Handshake de exclusão da mensagem ${msgId} criado e posto na fila.`);
      setTimeout(() => processarFilaHandshake(), 100);
    }
    else if (outParams.function === 'enviarMensagem') {
      const { contato: contatoId, conteudo, msgId, handshakeId, createdAt } = outParams;
      if (!conteudo) throw new Error("Conteúdo da mensagem não fornecido.");
      
      const profile = await buscarProfile();
      const ehParaSiMesmo = profile ? await ehContatoProprio(contatoId, profile) : false;
      
      if (ehParaSiMesmo) {
        const idReal = msgId || gerarId();
        const agora = Date.now();
        const chatAuto: Chat = {
          id: idReal, contatoHash: contatoId, conteudo, tipo: 'out',
          createdAt: createdAt || agora, sentAt: agora, receivedAt: agora,
          readAt: agora, notifiedAt: agora, handshake: 'self'
        };
        await salvarChat(chatAuto);
        await notificarUI(idReal);
        return;
      }
      
      const idReal = msgId || gerarId();
      const handIdReal = handshakeId || gerarId();
      const chatExistente = await buscarChat(idReal);
      
      if (!chatExistente) {
        const chatOut: Chat = {
          id: idReal, contatoHash: contatoId, conteudo, tipo: 'out',
          createdAt: createdAt || Date.now(), handshake: handIdReal
        };
        await salvarChat(chatOut);
      }
      
      const novoHandshake: Handshake = {
        id: handIdReal, aud: contatoId, createdAt: Date.now(), updatedAt: Date.now(),
        out: { status: 'pendente', tentativas: 0, rotas: { mensagem: { enviada: idReal, conteudo } } }
      };
      await salvarHandshake(novoHandshake);
      addDebugLog(`[HAND-MENSAGEM] ✅ Mensagem ${idReal} posta na fila de saída do SW.`);
      setTimeout(() => processarFilaHandshake(), 100);
    }
  }
}
```

---

## Arquivo: `monorepo/service-worker/src/handshakes/hand-contato.ts`

```ts
// src/handshakes/hand-contato.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { Handshake, Contato } from "@loco/utils/interfaces";
import { gerarId, buscarHandshake, salvarHandshake, buscarProfile, buscarContatoPorChave, salvarContato, serializarPublicKeyVapid, listarHandshakes, removerHandshake, removerContatoPorHash, removerTodoHistoricoChat, extrairDadosCompactos, expandirDadosCompactos, CompactContact } from "@loco/utils/db";
import { processarFilaHandshake } from "../sw/sw-handshakes.ts";
import { addDebugLog } from "@loco/utils/debug";

interface ContatoOutParams {
  function: string;
  contato: string;
  campos?: string[];
  responder?: boolean;
}

export async function ExpurgarHandshakesContato(contatoHash: string) {
  addDebugLog("warn", "HAND-CONTATO", `🗑️ Expurgando handshakes de conexão do contato ${contatoHash}`);
  const todos = await listarHandshakes();
  for (const h of todos) {
    if (h.aud === contatoHash && (h.in?.rotas.contato || h.out?.rotas.contato)) {
      await removerHandshake(h.id);
    }
  }
}

export async function Processar({ in: handshakeId, out: outParams }: { in?: string, out?: ContatoOutParams }) {
  if (handshakeId) {
    const handshake = await buscarHandshake(handshakeId);
    if (!handshake || !handshake.in || !handshake.in.rotas.contato) return;
    
    const contatoReq = handshake.in.rotas.contato;
    
    if (contatoReq.removerContato === true) {
      addDebugLog("warn", "HAND-CONTATO", `📩 Comando de EXCLUSÃO DE CONTATO recebido do remoto (aud: ${handshake.aud})`);
      await removerTodoHistoricoChat(handshake.aud);
      await removerContatoPorHash(handshake.aud);
      if (typeof self !== 'undefined' && self.clients && typeof self.clients.matchAll === 'function') {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        clients.forEach(client => client.postMessage({ type: 'CONTATO_ATUALIZADO', payload: { contatoHash: handshake.aud } }));
      }
      addDebugLog("success", "HAND-CONTATO", `🗑️ Contato ${handshake.aud} e seu histórico foram expurgados remotamente por solicitação do remetente.`);
      return;
    }
    
    if (Array.isArray(contatoReq.campos) && contatoReq.id) {
      addDebugLog(`[HAND-CONTATO] 📩 Solicitação PULL de status recebida.`);
      const contato = await buscarContatoPorChave(handshake.aud);
      const rotasContatoData: Record<string, unknown> = { id: handshake.aud };
      
      if (contato) {
        const camposSet = new Set(contatoReq.campos);
        const cp = await extrairDadosCompactos(contato);
        if (camposSet.has('vapidPublicKey')) rotasContatoData.vp = cp.vp;
        if (camposSet.has('e2ePublicKey')) rotasContatoData.ep = cp.ep;
        if (camposSet.has('subscription')) { rotasContatoData.se = cp.se; rotasContatoData.sp = cp.sp; rotasContatoData.sa = cp.sa; rotasContatoData.ps = cp.ps; }
        if (camposSet.has('vapidPrivateKeyEnvelope')) rotasContatoData.ve = cp.ve;
        if (camposSet.has('email')) rotasContatoData.em = cp.em;
        if (camposSet.has('name')) rotasContatoData.nm = cp.nm;
        if (camposSet.has('trusted')) rotasContatoData.tr = contato.trusted;
      }
      
      handshake.out = { status: 'pendente', tentativas: 0, rotas: { contato: { data: rotasContatoData } } };
      handshake.updatedAt = Date.now();
      await salvarHandshake(handshake);
      setTimeout(() => processarFilaHandshake(), 100);
    }
    else if (contatoReq.data) {
      const contato = await buscarContatoPorChave(handshake.aud);
      const profile = await buscarProfile();
      if (!contato || !profile) return;
      
      const d = contatoReq.data as Record<string, unknown>;
      const mp = await extrairDadosCompactos(profile);
      let novoMeStatus = contato.me;
      
      if (!d.se) {
        novoMeStatus = 'none'; 
      } else {
        if (d.tr === true) novoMeStatus = 'trusted';
        else novoMeStatus = 'saved';
        
        const d_vp = d.vp as any || { x: d.vx, y: d.vy };
        const d_ep = d.ep as any || { n: d.en };
        
        if (d.se !== mp.se || d.sp !== mp.sp || d.sa !== mp.sa || 
            d_vp.x !== mp.vp.x || d_vp.y !== mp.vp.y || d_ep.n !== mp.ep.n || d.ve !== mp.ve) {
          novoMeStatus = 'wrong';
        }
      }
      
      if (contato.me !== novoMeStatus) {
        contato.me = novoMeStatus;
        contato.updatedAt = Date.now();
        await salvarContato(contato);
        if (typeof self !== 'undefined' && self.clients && typeof self.clients.matchAll === 'function') {
          const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          clients.forEach(client => client.postMessage({ type: 'CONTATO_ATUALIZADO', payload: { contatoHash: handshake.aud } }));
        }
      }
    }
    else if (contatoReq.sync) {
      const syncData = contatoReq.sync as unknown as CompactContact;
      if ((syncData as any).vx && !syncData.vp) {
        syncData.vp = { x: (syncData as any).vx, y: (syncData as any).vy };
        syncData.ep = { n: (syncData as any).en };
      }
      const expanded = expandirDadosCompactos(syncData);
      const contatoAntigo = await buscarContatoPorChave(handshake.aud);
      const eleConfiaEmMim = syncData.tr === true; 
      const novoMeStatus = eleConfiaEmMim ? 'trusted' : 'saved';
      
      const novoContato: Contato = {
        id: handshake.aud,
        vapidPublicKey: expanded.vapidPublicKey!,
        e2ePublicKey: expanded.e2ePublicKey!,
        email: expanded.email || '',
        name: expanded.name || '',
        subscription: expanded.subscription!,
        vapidPrivateKeyEnvelope: expanded.vapidPrivateKeyEnvelope!,
        trusted: contatoAntigo ? contatoAntigo.trusted : false, 
        me: novoMeStatus, 
        createdAt: contatoAntigo ? contatoAntigo.createdAt : Date.now(),
        updatedAt: Date.now()
      };
      
      await salvarContato(novoContato);
      if (typeof self !== 'undefined' && self.clients && typeof self.clients.matchAll === 'function') {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        clients.forEach(client => client.postMessage({ type: 'CONTATO_ATUALIZADO', payload: { contatoHash: handshake.aud } }));
      }
      
      if (syncData.req) {
        await Processar({ out: { function: 'enviarSubscription', contato: handshake.aud, responder: true } });
      }
    }
  }

  if (outParams) {
    if (outParams.function === 'confirmarSubscription') {
      const profile = await buscarProfile();
      if (!profile) return;
      const meuHash = await serializarPublicKeyVapid(profile.vapidPublicKey);
      const novoHandshake: Handshake = {
        id: gerarId(), aud: outParams.contato, createdAt: Date.now(), updatedAt: Date.now(),
        out: { status: 'pendente', tentativas: 0, rotas: { contato: { id: meuHash, campos: outParams.campos } } }
      };
      await salvarHandshake(novoHandshake);
      setTimeout(() => processarFilaHandshake(), 100);
    }
    if (outParams.function === 'enviarSubscription') {
      const profile = await buscarProfile();
      if (!profile) throw new Error("Perfil não encontrado.");
      const contatoAlvo = await buscarContatoPorChave(outParams.contato);
      const euConfio = contatoAlvo ? (contatoAlvo.trusted === true) : false;
      const compactSyncData = await extrairDadosCompactos(profile, !outParams.responder, euConfio);
      
      const novoHandshake: Handshake = {
        id: gerarId(), aud: outParams.contato, createdAt: Date.now(), updatedAt: Date.now(),
        out: { status: 'pendente', tentativas: 0, rotas: { contato: { sync: compactSyncData as unknown as Record<string, unknown> } } }
      };
      await salvarHandshake(novoHandshake);
      setTimeout(() => processarFilaHandshake(), 100);
    }
  }
}
```

---

## Arquivo: `monorepo/service-worker/src/handshakes/hand-profile.ts`

```ts
// src/handshakes/hand-profile.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { Handshake } from "@loco/utils/interfaces";
import { gerarId, buscarHandshake, salvarHandshake, buscarProfile, buscarContatoPorChave, salvarContato, serializarPublicKeyVapid, listarHandshakes, removerHandshake } from "@loco/utils/db";
import { minifyVapidPublic, expandVapidPublic, minifyRsaPublic, expandRsaPublic } from "@loco/utils/crypto";
import { processarFilaHandshake } from "../sw/sw-handshakes.ts";
import { addDebugLog } from "@loco/utils/debug";

interface ProfileOutParams {
  function: string;
  contato: string;
  campos?: string[];
}

export async function ExpurgarHandshakesProfile(contatoHash: string) {
  addDebugLog("warn", "HAND-PROFILE", `🗑️ Expurgando handshakes de perfil do contato ${contatoHash}`);
  const todos = await listarHandshakes();
  for (const h of todos) {
    if (h.aud === contatoHash && (h.in?.rotas.profile || h.out?.rotas.profile)) {
      await removerHandshake(h.id);
    }
  }
}

export async function Processar({ in: handshakeId, out: outParams }: { in?: string, out?: ProfileOutParams }) {
  if (handshakeId) {
    addDebugLog(`[HAND-PROFILE] 📥 Processando entrada do handshake ${handshakeId}`);
    const handshake = await buscarHandshake(handshakeId);
    if (!handshake || !handshake.in || !handshake.in.rotas.profile) {
      addDebugLog(`[HAND-PROFILE] ⚠️ Handshake ${handshakeId} não contém rotas de profile.`);
      return;
    }

    const profileReq = handshake.in.rotas.profile;
    if (Array.isArray(profileReq.campos)) {
      addDebugLog(`[HAND-PROFILE] 📩 Solicitação de dados recebida. Campos:`, profileReq.campos);
      const profile = await buscarProfile();
      if (!profile) throw new Error("Perfil local não encontrado para responder à requisição.");
      
      const meuHash = await serializarPublicKeyVapid(profile.vapidPublicKey);
      const rotasProfileData: Record<string, unknown> = { id: meuHash };
      const camposSet = new Set(profileReq.campos);
      
      if (camposSet.has('name')) rotasProfileData.name = profile.name;
      if (camposSet.has('email')) rotasProfileData.email = profile.email;
      if (camposSet.has('vapidPublicKey')) rotasProfileData.vapidPublicKey = minifyVapidPublic(profile.vapidPublicKey);
      if (camposSet.has('vapidPrivateKeyEnvelope')) rotasProfileData.vapidPrivateKeyEnvelope = profile.vapidPrivateKeyEnvelope;
      if (camposSet.has('e2ePublicKey')) rotasProfileData.e2ePublicKey = minifyRsaPublic(profile.e2ePublicKey);
      if (camposSet.has('subscription')) rotasProfileData.subscription = profile.subscription;

      handshake.out = {
        status: 'pendente',
        tentativas: 0,
        rotas: { profile: { data: rotasProfileData } }
      };
      handshake.updatedAt = Date.now();
      await salvarHandshake(handshake);
      setTimeout(() => processarFilaHandshake(), 100);
    }
    else if (profileReq.data && typeof profileReq.data.id === 'string') {
      addDebugLog(`[HAND-PROFILE] 📩 Resposta de dados recebida do contato ${profileReq.data.id}`);
      const contatoId = profileReq.data.id;
      const contato = await buscarContatoPorChave(contatoId);
      
      if (contato) {
        const d = profileReq.data;
        if (typeof d.name === 'string') contato.name = d.name;
        if (typeof d.email === 'string') contato.email = d.email;
        if (typeof d.vapidPrivateKeyEnvelope === 'string') contato.vapidPrivateKeyEnvelope = d.vapidPrivateKeyEnvelope;
        if (d.subscription !== undefined) contato.subscription = d.subscription as any;
        if (d.vapidPublicKey !== undefined) contato.vapidPublicKey = expandVapidPublic(d.vapidPublicKey);
        if (d.e2ePublicKey !== undefined) contato.e2ePublicKey = expandRsaPublic(d.e2ePublicKey);
        
        contato.updatedAt = Date.now();
        await salvarContato(contato);
        addDebugLog(`[HAND-PROFILE] ✅ Contato ${contatoId} atualizado com sucesso no DB.`);
        
        if (typeof self !== 'undefined' && self.clients && typeof self.clients.matchAll === 'function') {
          const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          clients.forEach(client => {
            client.postMessage({ type: 'CONTATO_ATUALIZADO', payload: { contatoHash: contatoId } });
          });
        }
      } else {
        addDebugLog(`[HAND-PROFILE] ⚠️ Resposta recebida, mas contato ${contatoId} não existe no banco.`);
      }
    }
  }

  if (outParams) {
    addDebugLog(`[HAND-PROFILE] 📤 Preparando saída manual de profile:`, outParams);
    if (outParams.function === 'solicitarPerfil') {
      const contatoId = outParams.contato;
      const campos = outParams.campos;
      if (!contatoId || !campos) {
        throw new Error("Parâmetros inválidos para solicitarPerfil. Exigido 'contato' e 'campos'.");
      }
      const novoHandshake: Handshake = {
        id: gerarId(),
        aud: contatoId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        out: {
          status: 'pendente',
          tentativas: 0,
          rotas: { profile: { campos: campos } }
        }
      };
      await salvarHandshake(novoHandshake);
      addDebugLog(`[HAND-PROFILE] ✅ Handshake de solicitação de perfil criado.`);
      setTimeout(() => processarFilaHandshake(), 100);
    }
  }
}
```

---

## Arquivo: `monorepo/service-worker/src/service-worker.ts`

```ts
// src/service-worker.ts
import "./sw/cache.ts";
import "./sw/push.ts";
import "./sw/click.ts";
import "./sw/sw-handshakes.ts";
import { processarFilaHandshake } from "./sw/sw-handshakes.ts";
import { Processar as ProcessarProfile } from "./handshakes/hand-profile.ts";
import { Processar as ProcessarMensagem } from "./handshakes/hand-mensagem.ts";
import { Processar as ProcessarContato } from "./handshakes/hand-contato.ts";
import { APP_VERSION } from "@loco/utils/config";

console.log(`[SW] 🌌 Service Worker orquestrador carregado (v${APP_VERSION}).`);

self.addEventListener('activate', (event: any) => {
  console.log("[SW] 🔄 Ativando e agendando processamento de filas pendentes...");
  event.waitUntil(
    (async () => {
      await new Promise(r => setTimeout(r, 1000));
      try {
        await processarFilaHandshake();
      } catch (e) {
        console.error("[SW] Erro ao processar fila de handshakes:", e);
      }
    })()
  );
});

self.addEventListener('message', (event: any) => {
  if (!event.data) return;
  const { type, payload } = event.data;
  
  if (type === 'PING_SW_VERSION') {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ type: 'PONG_SW_VERSION', version: APP_VERSION });
    }
    return;
  }
  if (type === 'PROCESSAR_FILA_HANDSHAKE') {
    processarFilaHandshake().catch(err => console.error(err));
    return;
  }
  if (type === 'CRIAR_HANDSHAKE_OUT') {
    const { rotasModulo, params } = payload;
    console.log(`[SW] 📨 Recebido comando da UI para CRIAR_HANDSHAKE_OUT [Módulo: ${rotasModulo}]`);
    if (rotasModulo === 'profile') {
      ProcessarProfile({ out: params }).catch(err => console.error("[SW] Erro no hand-profile:", err));
    } else if (rotasModulo === 'mensagem') {
      ProcessarMensagem({ out: params }).catch(err => console.error("[SW] Erro no hand-mensagem:", err));
    } else if (rotasModulo === 'contato') {
      ProcessarContato({ out: params }).catch(err => console.error("[SW] Erro no hand-contato:", err));
    } else {
      console.warn(`[SW] ⚠️ Módulo de rotas desconhecido ou não implementado: ${rotasModulo}`);
    }
  }
});
```

---

## Arquivo: `monorepo/service-worker/deno.jsonc`

```json
{
   "name": "@loco/service-worker",
   "exports": "./src/mod.ts",
   "compilerOptions": {
     "lib": ["dom", "dom.iterable", "dom.asynciterable", "esnext", "deno.ns", "webworker"],
     "strict": true,
     "noImplicitAny": true,
     "noUncheckedIndexedAccess": true
   },
   "imports": {
     "@std/assert": "jsr:@std/assert@^1",
     "@std/fs": "jsr:@std/fs@^1",
     "@std/http": "jsr:@std/http@^1",
     "@std/path": "jsr:@std/path@^1",
     "idb-keyval": "https://esm.sh/idb-keyval@6.2.1",
     "fflate": "https://esm.sh/fflate@0.8.2?target=es2022"
   },
   "tasks": {
     "test": "deno test --allow-env --allow-net tests/",
     "check": "deno check src/**/*.ts src/**/*.tsx tests/**/*.ts",
     "build": "deno run --allow-import --allow-read --allow-write --allow-env --allow-net --env-file --unstable-bundle ../esbuild.ts sw",
     "tests": "deno task check && deno task test"
   }
}
```

---

