> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém experimentos e código da área de @loco/service-worker
> O projeto é o **Loco [vdev] ** estruturado em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco [vdev] - Modo: SW

Gerado automaticamente em: 9/2/2026, 8:24:43 PM

---

## Arquivo: `monorepo/service-worker/src/sw/mod.ts`

```ts
// reservado para futuras exportações
```

---

## Arquivo: `monorepo/service-worker/src/sw/click.ts`

```ts
// src/sw/click.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

export function handleNotificationClick(event: any) {
  console.log("[SW-CLICK] 🔗 ===== CLIQUE NA NOTIFICAÇÃO DETECTADO =====");
  event.notification.close();

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
}
```

---

## Arquivo: `monorepo/service-worker/src/sw/push.ts`

```ts
// src/sw/push.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { verificarJWT } from "@loco/utils/crypto";
import { processarHandshakeRecebido } from "./handshakes.ts";
import { addDebugLog } from "@loco/utils/debug";

export function handlePush(event: any) {
  addDebugLog("[SW-PUSH-ROUTER] 🔀 Event Listener de Push engatilhado.");

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
}
```

---

## Arquivo: `monorepo/service-worker/src/sw/webtorrent.ts`

```ts
// src/sw/webtorrent.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

const PORT_TIMEOUT_DURATION = 5000;

// 🔥 ESTADO DE RESILIÊNCIA: Só tentamos stream se o main thread confirmou que o WebTorrent está ativo
let isWebTorrentReady = false;

interface WebTorrentRequestMessage {
  url: string;
  method: string;
  headers: Record<string, string>;
  scope: string;
  destination: RequestDestination;
  type: "webtorrent";
}

interface WebTorrentResponseData {
  body: "STREAM" | ArrayBuffer | string | null;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
}

/**
 * Lida com mensagens vindas do Main Thread.
 * Usado para o Main Thread avisar que o WebTorrent foi inicializado e está escutando.
 */
export function handleWebTorrentMessage(event: ExtendableMessageEvent) {
  if (event.data && event.data.type === "WEBTORRENT_READY") {
    console.log(
      "[SW-WEBTORRENT] ✅ Main thread solicitou ativação. Verificando estado...",
    );
    isWebTorrentReady = true;

    // 🔥 Responde usando a MessageChannel transferida (Padrão Loco)
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ type: "WEBTORRENT_ACK" });
      console.log(
        "[SW-WEBTORRENT] 📤 WEBTORRENT_ACK enviado via MessageChannel dedicada.",
      );
    } else {
      // Fallback de segurança caso a chamada venha de um código legado sem MessageChannel
      if (event.source) {
        (event.source as Client).postMessage({ type: "WEBTORRENT_ACK" });
      }
    }
  }
}

/**
 * Tenta interceptar e responder a requisições do WebTorrent.
 * @returns true se a requisição foi tratada (respondWith foi chamado), false caso contrário.
 */
export function handleWebTorrentFetch(event: FetchEvent): boolean {
  const { url } = event.request;
  const scope = self.registration.scope;

  // 1. Ignora requisições que não são do webtorrent
  if (!url.includes(`${scope}webtorrent/`)) {
    return false;
  }

  // 2. Keepalive para manter o SW ativo sem consumir recursos
  if (url.includes(`${scope}webtorrent/keepalive/`)) {
    event.respondWith(new Response());
    return true;
  }

  // 3. Cancelamento de stream (ex: usuário pulou o vídeo)
  if (url.includes(`${scope}webtorrent/cancel/`)) {
    event.respondWith(
      new Response(
        new ReadableStream({
          cancel() {
            // Lógica de cancelamento
          },
        }),
      ),
    );
    return true;
  }

  // 🔥 RESILIÊNCIA: Se o Main Thread não inicializou o WebTorrent, não tentamos stream.
  // Retornamos false para que o orquestrador principal faça o fetch normal (ou cache).
  if (!isWebTorrentReady) {
    console.warn(
      "[SW-WEBTORRENT] ⚠️ Requisição webtorrent recebida, mas o Main Thread não está pronto. Fallback para fetch normal.",
    );
    return false;
  }

  // 4. Serve o arquivo via MessageChannel com o Main Thread
  event.respondWith(serve(event));
  return true;
}

/**
 * Lógica principal de streaming: comunica-se com o main thread para buscar chunks sob demanda.
 */
async function serve(event: FetchEvent): Promise<Response> {
  const { request } = event;
  const { url, method, headers, destination } = request;

  const clientList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  const [data, port]: [WebTorrentResponseData, MessagePort] = await new Promise(
    (resolve) => {
      for (const client of clientList) {
        const messageChannel = new MessageChannel();
        const { port1, port2 } = messageChannel;

        port1.onmessage = ({ data }: MessageEvent<WebTorrentResponseData>) => {
          resolve([data, port1]);
        };

        const message: WebTorrentRequestMessage = {
          url,
          method,
          headers: Object.fromEntries(headers.entries()),
          scope: self.registration.scope,
          destination,
          type: "webtorrent",
        };

        client.postMessage(message, [port2]);
      }

      // Fallback de segurança caso nenhum cliente responda
      setTimeout(() => {
        resolve([{ body: null, status: 503 }, null as unknown as MessagePort]);
      }, 5000);
    },
  );

  let timeOut: number | null = null;
  let isCancelled = false;

  const cleanup = () => {
    if (port) {
      port.postMessage(false);
      port.onmessage = null;
    }
    if (timeOut !== null) {
      clearTimeout(timeOut);
    }
    isCancelled = true;
  };

  if (data.body !== "STREAM") {
    cleanup();
    return new Response(data.body as BodyInit, {
      status: data.status,
      statusText: data.statusText,
      headers: data.headers,
    });
  }

  return new Response(
    new ReadableStream({
      pull(controller) {
        return new Promise((resolve) => {
          if (isCancelled || !port) {
            controller.close();
            resolve();
            return;
          }

          port.onmessage = ({ data }: MessageEvent<Uint8Array | null>) => {
            if (data) {
              controller.enqueue(data);
            } else {
              cleanup();
              controller.close();
            }
            resolve();
          };

          if (destination !== "document") {
            clearTimeout(timeOut!);
            timeOut = self.setTimeout(() => {
              cleanup();
              resolve();
            }, PORT_TIMEOUT_DURATION);
          }

          port.postMessage(true);
        });
      },
      cancel() {
        cleanup();
      },
    }),
    {
      status: data.status,
      statusText: data.statusText,
      headers: data.headers,
    },
  );
}

```

---

## Arquivo: `monorepo/service-worker/src/sw/cache.ts`

```ts
// src/sw/cache.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;
declare const GENERATED_ASSETS: string[];

import { APP_VERSION } from "@loco/utils/config";

const CACHE_NAME = `loco-proto-cache-v${APP_VERSION}`;
const ASSETS_TO_CACHE: string[] = GENERATED_ASSETS;

/**
 * Handler de instalação do Service Worker.
 * Exportado para ser orquestrado pelo service-worker.ts principal.
 */
export function handleInstall(event: ExtendableEvent): void {
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
}

/**
 * Handler de ativação do Service Worker.
 * Exportado para ser orquestrado pelo service-worker.ts principal.
 */
export function handleActivate(event: ExtendableEvent): void {
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
}

/**
 * Lógica de fetch para cache (Network-First com fallback para Cache).
 * Exportada para ser orquestrada pelo service-worker.ts principal.
 */
export async function handleCacheFetch(event: FetchEvent): Promise<Response | undefined> {
  // Ignora métodos que não sejam GET
  if (event.request.method !== "GET") {
    return undefined;
  }

  // Ignora requisições externas à origem ou rotas de API
  if (!event.request.url.startsWith(self.location.origin) || event.request.url.includes("/api/")) {
    return undefined;
  }

  try {
    // Tenta buscar da rede primeiro
    const networkResponse = await fetch(event.request);
    
    // Se for bem-sucedido, clona e salva no cache
    if (networkResponse.ok) {
      const responseClone = networkResponse.clone();
      const cache = await caches.open(CACHE_NAME);
      await cache.put(event.request, responseClone);
    }
    
    return networkResponse;
  } catch (err) {
    // Fallback Offline
    console.log(`[SW-CACHE] 🔌 Usuário Offline. Servindo do cache: ${event.request.url}`);
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(event.request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    return new Response("Você está offline e este recurso não foi mapeado no cache.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
}
```

---

## Arquivo: `monorepo/service-worker/src/sw/handshakes.ts`

```ts
// src/sw/sw-handshakes.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { gunzipSync } from "fflate";
import type { Handshake } from "@loco/utils/interfaces";
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
import { getServerPublicKey } from "@loco/ui/utils"

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
    // deno-lint-ignore no-explicit-any
  } catch (err: any) {
    addDebugLog(`[SW-ROUTER] ❌ Erro durante o Garbage Collection: ${err.message}`);
  }
}

async function salvarHandshakeTransacional(handshake: Handshake, mensagemSucesso?: string) {
  try {
    await salvarHandshake(handshake);
    if (mensagemSucesso) addDebugLog(mensagemSucesso);
  // deno-lint-ignore no-explicit-any  
  } catch (e: any) {
    if (e.name === 'QuotaExceededError') {
      addDebugLog("[SW-ROUTER] 🚨 CRÍTICO: Cota excedida. Disparando GC de emergência...");
      await realizarGarbageCollection(true);
      try {
        await salvarHandshake(handshake);
      // deno-lint-ignore no-explicit-any
      } catch (e2: any) {
        throw e2;
      }
    } else {
      throw e;
    }
  }
}

// deno-lint-ignore no-explicit-any
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
  // deno-lint-ignore no-explicit-any
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
        // deno-lint-ignore no-explicit-any
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
          // deno-lint-ignore no-explicit-any
          const payloadJwt: any = { sub: "hand", aud: contato.id, jti: h.id, ct: JSON.stringify(envelope) };
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
        // deno-lint-ignore no-explicit-any
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
    // deno-lint-ignore no-explicit-any
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

// 🔥 NOVAS FUNÇÕES EXPORTÁVEIS PARA O ORQUESTRADOR

// deno-lint-ignore no-explicit-any
export function handleSync(event: any) {
  if (event.tag === 'sync-envio-handshakes') {
    event.waitUntil(processarFilaHandshake());
  }
}

// deno-lint-ignore no-explicit-any
export function handleOnline(event: any) {
  if ('waitUntil' in event) {
    (event as ExtendableEvent).waitUntil(processarFilaHandshake());
  } else {
    processarFilaHandshake();
  }
}
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
import { processarFilaHandshake } from "../sw/handshakes.ts";
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
import { processarFilaHandshake } from "../sw/handshakes.ts";
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
import { processarFilaHandshake } from "../sw/handshakes.ts";
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

## Arquivo: `monorepo/service-worker/src/mod.ts`

```ts
export * from "./utils/mod.ts";
```

---

## Arquivo: `monorepo/service-worker/src/utils/mod.ts`

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
  // deno-lint-ignore no-explicit-any
  } catch (err: any) {
    addDebugLog("❌ Erro ao registrar Service Worker: " + (err?.message || String(err)));
    throw new Error(`Falha ao registrar Service Worker: ${err?.message || String(err)}`);
  }
}
```

---

## Arquivo: `monorepo/service-worker/src/service-worker.ts`

```ts
// src/service-worker.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

// === IMPORTAÇÃO DOS MÓDULOS AUXILIARES (HANDLERS) ===
import { handleInstall, handleActivate, handleCacheFetch } from "./sw/cache.ts";
import { handlePush } from "./sw/push.ts";
import { handleNotificationClick } from "./sw/click.ts";
import { handleSync, handleOnline, processarFilaHandshake } from "./sw/handshakes.ts";
import { handleWebTorrentFetch, handleWebTorrentMessage } from "./sw/webtorrent.ts";

// === IMPORTAÇÃO DAS ROTAS DE HANDSHAKE ===
import { Processar as ProcessarProfile } from "./handshakes/hand-profile.ts";
import { Processar as ProcessarMensagem } from "./handshakes/hand-mensagem.ts";
import { Processar as ProcessarContato } from "./handshakes/hand-contato.ts";

import { APP_VERSION } from "@loco/utils/config";

console.log(`[SW] 🌌 Service Worker orquestrador carregado (v${APP_VERSION}).`);

// === LIFECYCLE EVENTS ===

// 🔥 NOVO: Handler de instalação (delegado ao cache.ts)
self.addEventListener('install', (event) => {
  handleInstall(event);
});

// 🔥 CORRIGIDO: Handler de ativação (delegado ao cache.ts)
self.addEventListener('activate', (event) => {
  handleActivate(event);
  
  // Agendamento de processamento de filas pendentes
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

// === FETCH EVENT (ORQUESTRADOR CENTRAL) ===
self.addEventListener('fetch', (event: FetchEvent) => {
  // 1. Prioridade Máxima: WebTorrent (Streaming P2P via OPFS)
  if (handleWebTorrentFetch(event)) {
    return; 
  }

  // 2. Prioridade Secundária: Cache de Assets e Fallback Offline
  const cachePromise = handleCacheFetch(event);

  event.respondWith(
    cachePromise.then(response => {
      if (response) {
        return response; 
      }
      return fetch(event.request);
    })
  );
});

// === MESSAGE EVENT (ORQUESTRADOR CENTRAL) ===
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (!event.data) return;
  const { type, payload } = event.data;

  // 1. Roteamento para WebTorrent
  if (type === 'WEBTORRENT_READY') {
    handleWebTorrentMessage(event);
    return;
  }

  // 2. Checagem de Versão
  if (type === 'PING_SW_VERSION') {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ type: 'PONG_SW_VERSION', version: APP_VERSION });
    }
    return;
  }

  // 3. Comandos da UI para Handshakes
  if (type === 'PROCESSAR_FILA_HANDSHAKE') {
    processarFilaHandshake().catch(err => console.error(err));
    return;
  }

  if (type === 'CRIAR_HANDSHAKE_OUT') {
    const { rotasModulo, params } = payload;
    console.log(`[SW] 📨 Recebido comando da UI para CRIAR_HANDSHAKE_OUT [Módulo: ${rotasModulo}]`);
    
    if (rotasModulo === 'profile') {
      ProcessarProfile({ out: params }).catch(err => console.error("[SW] Erro no hand-profile: ", err));
    } else if (rotasModulo === 'mensagem') {
      ProcessarMensagem({ out: params }).catch(err => console.error("[SW] Erro no hand-mensagem: ", err));
    } else if (rotasModulo === 'contato') {
      ProcessarContato({ out: params }).catch(err => console.error("[SW] Erro no hand-contato: ", err));
    } else {
      console.warn(`[SW] ⚠️ Módulo de rotas desconhecido ou não implementado: ${rotasModulo}`);
    }
  }
});

// === PUSH & NOTIFICATION EVENTS ===
self.addEventListener('push', (event: any) => handlePush(event));
self.addEventListener('notificationclick', (event: any) => handleNotificationClick(event));

// === SYNC & ONLINE EVENTS ===
self.addEventListener('sync', (event: any) => handleSync(event));
self.addEventListener('online', (event: any) => handleOnline(event));
```

---

## Arquivo: `monorepo/service-worker/tests/handshakes/integration-shadow-sync.test.ts`

```ts
/// <reference lib="deno.ns" />
import "fake-indexeddb/auto";
import { assertEquals, assert, assertExists } from "@std/assert";
import { Processar as ProcessarContato } from "../../src/handshakes/hand-contato.ts";
import { Processar as ProcessarMensagem } from "../../src/handshakes/hand-mensagem.ts";
import { 
  salvarProfile, 
  buscarContatoPorChave, 
  buscarChat, 
  listarHandshakes, 
  salvarHandshake,
  removerTodoHistoricoChat,
  serializarPublicKeyVapid
} from "@loco/utils/db";
import type { ProfileConfig, Handshake } from "@loco/utils/interfaces";

Deno.test("INTEGRAÇÃO: Shadow Sync - Deve criar contato não-confiável ao receber mensagem de desconhecido", async () => {
  // 1. SETUP DO "BOB"
  const bobProfile: ProfileConfig = {
    name: "Bob",
    email: "bob@loco.pwa",
    vapidPublicKey: { kty: "EC", crv: "P-256", x: "bob-x-coord", y: "bob-y-coord" } as JsonWebKey,
    vapidPrivateKeyJwk: { kty: "EC", d: "bob-priv-key" } as JsonWebKey,
    vapidPrivateKeyEnvelope: "env-bob",
    e2ePublicKey: { kty: "RSA", n: "bob-rsa-n-modulo", e: "AQAB" } as JsonWebKey,
    e2ePrivateKeyJwk: { kty: "RSA", d: "bob-rsa-priv-d" } as JsonWebKey,
    subscription: {
      endpoint: "https://push.com/bob",
      keys: { p256dh: "p256-bob", auth: "auth-bob" },
      proxyserver: "https://loco.proxy"
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarProfile(bobProfile);

  // 2. PREPARAÇÃO DA IDENTIDADE DE "ALICE"
  const aliceVapidPublic: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: "alice-x-coordinate-base64url",
    y: "alice-y-coordinate-base64url"
  };
  const aliceHashId = await serializarPublicKeyVapid(aliceVapidPublic);
  await removerTodoHistoricoChat(aliceHashId);

  // 3. SIMULAÇÃO DO PACOTE RECEBIDO
  const handshakeRecebidoId = "handshake-in-001";
  const handshakeSimulado: Handshake = {
    id: handshakeRecebidoId,
    aud: aliceHashId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    in: {
      status: 'recebido',
      tentativas: 0,
      rotas: {
        contato: {
          sync: {
            req: true,
            tr: true,
            em: "alice@loco.pwa",
            nm: "Alice Desconhecida",
            vp: { x: "alice-x-coordinate-base64url", y: "alice-y-coordinate-base64url" },
            ep: { n: "alice-rsa-n-modulo" },
            se: "https://push.com/alice",
            sp: "alice-p256-key",
            sa: "alice-auth-secret",
            ve: "env-alice",
            ps: "https://loco.proxy"
          }
        },
        mensagem: {
          enviada: "msg-alice-001",
          conteudo: "Oi Bob! Sou eu, a Alice. Salva meu contato!"
        }
      }
    }
  };
  await salvarHandshake(handshakeSimulado);

  // 4. EXECUÇÃO DOS PROCESSADORES
  await ProcessarContato({ in: handshakeRecebidoId });
  await ProcessarMensagem({ in: handshakeRecebidoId });

  // 5. VERIFICAÇÕES
  const contatoAlice = await buscarContatoPorChave(aliceHashId);
  assertExists(contatoAlice, "O contato da Alice deve ter sido criado");
  assertEquals(contatoAlice.name, "Alice Desconhecida");
  assertEquals(contatoAlice.trusted, false, "Contato via Shadow Sync DEVE ser NÃO CONFIÁVEL");

  const mensagemAlice = await buscarChat("msg-alice-001");
  assertExists(mensagemAlice);
  assertEquals(mensagemAlice.conteudo, "Oi Bob! Sou eu, a Alice. Salva meu contato!");
  assertEquals(mensagemAlice.contatoHash, aliceHashId);

  const todosHandshakes = await listarHandshakes();
  const handshakesDeSaida = todosHandshakes.filter(h => h.out && h.aud === aliceHashId);
  assert(handshakesDeSaida.length >= 2, "Deve ter enfileirado respostas automáticas");

  const temRespostaDeContato = handshakesDeSaida.some(h => h.out?.rotas?.contato?.sync !== undefined);
  const temRespostaDeMensagem = handshakesDeSaida.some(h => h.out?.rotas?.mensagem?.data !== undefined);
  assertEquals(temRespostaDeContato, true, "Deve ter enfileirado reciprocidade");
  assertEquals(temRespostaDeMensagem, true, "Deve ter enfileirado Auto-Ack");
});
```

---

## Arquivo: `monorepo/service-worker/tests/handshakes/retry-resilience.test.ts`

```ts
/// <reference lib="deno.ns" />
import "fake-indexeddb/auto";
import { assertEquals, assertExists, assert } from "@std/assert";
import { 
  salvarProfile, 
  salvarContato, 
  salvarHandshake, 
  buscarHandshake,
  serializarPublicKeyVapid,
  listarHandshakes,
  removerHandshake
} from "@loco/utils/db";
import { processarFilaHandshake } from "../../src/sw/handshakes.ts";
import type { ProfileConfig, Contato, Handshake } from "@loco/utils/interfaces";

Deno.test("RETRY RESILIENCE: Re-tentativas devem anexar dados de contato (Shadow Sync)", async () => {
  // Limpa handshakes órfãos
  const handshakesOrfaos = await listarHandshakes();
  for (const orfao of handshakesOrfaos) {
    await removerHandshake(orfao.id);
  }

  // 1. Setup do Profile local (Alice)
  const localProfile: ProfileConfig = {
    name: "Alice",
    email: "alice@test.pwa",
    vapidPublicKey: { kty: "EC", crv: "P-256", x: "alice-x-coord", y: "alice-y-coord" } as JsonWebKey,
    vapidPrivateKeyJwk: { kty: "EC", d: "alice-d-priv" } as JsonWebKey,
    vapidPrivateKeyEnvelope: "env-alice",
    e2ePublicKey: { kty: "RSA", n: "alice-rsa-n", e: "AQAB" } as JsonWebKey,
    e2ePrivateKeyJwk: { kty: "RSA", d: "alice-rsa-d" } as JsonWebKey,
    subscription: {
      endpoint: "https://push.com/alice",
      keys: { p256dh: "p256", auth: "auth" },
      proxyserver: "https://loco.proxy"
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarProfile(localProfile);

  // 2. Setup do Contato salvo (Bob)
  const bobVapidPublic: JsonWebKey = { kty: "EC", crv: "P-256", x: "bob-x-coord", y: "bob-y-coord" };
  const bobHash = await serializarPublicKeyVapid(bobVapidPublic);
  const bobContato: Contato = {
    id: bobHash,
    name: "Bob",
    email: "bob@test.pwa",
    vapidPublicKey: bobVapidPublic,
    e2ePublicKey: { kty: "RSA", n: "bob-rsa-n", e: "AQAB" } as JsonWebKey,
    subscription: {
      endpoint: "https://push.com/bob",
      keys: { p256dh: "p256-bob", auth: "auth-bob" },
      proxyserver: "https://loco.proxy"
    },
    vapidPrivateKeyEnvelope: "env-bob",
    trusted: true,
    me: 'saved',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarContato(bobContato);

  // 3. Handshake de mensagem com tentativas = 1
  const handshakeRetryId = "handshake-retry-001";
  const handshakeRetry: Handshake = {
    id: handshakeRetryId,
    aud: bobHash,
    createdAt: Date.now() - 120000,
    updatedAt: Date.now() - 120000,
    out: {
      status: 'pendente',
      tentativas: 1,
      rotas: {
        mensagem: {
          enviada: "msg-retry-123",
          conteudo: "Tentando novamente entregar esta mensagem!"
        }
      }
    }
  };
  await salvarHandshake(handshakeRetry);

  // 4. Executa o processador
  await processarFilaHandshake();

  // 5. Verificações
  const handshakeAposProcessamento = await buscarHandshake(handshakeRetryId);
  assertExists(handshakeAposProcessamento);

  assertEquals(
    handshakeAposProcessamento.out!.tentativas, 
    2, 
    "Tentativas deve ter sido incrementada de 1 para 2"
  );

  assertExists(
    handshakeAposProcessamento.out!.rotas.contato, 
    "Rota de contato DEVE ter sido injetada"
  );
  assertExists(
    handshakeAposProcessamento.out!.rotas.contato.sync, 
    "Dados compactos do perfil devem estar presentes"
  );
});
```

---

## Arquivo: `monorepo/service-worker/tests/handshakes/bidirectional-deletion.test.ts`

```ts
/// <reference lib="deno.ns" />
import "fake-indexeddb/auto";
import { assertEquals, assertExists } from "@std/assert";
import { Processar as ProcessarMensagem } from "../../src/handshakes/hand-mensagem.ts";
import { 
  salvarProfile, 
  salvarContato, 
  salvarHandshake, 
  salvarChat,
  buscarChat,
  serializarPublicKeyVapid,
  removerTodoHistoricoChat
} from "@loco/utils/db";
import type { ProfileConfig, Contato, Handshake, Chat } from "@loco/utils/interfaces";

Deno.test("INTEGRAÇÃO: Exclusão Bidirecional - Deve apagar mensagem remotamente com validação de autoridade", async () => {
  // 1. SETUP DO "BOB"
  const bobProfile: ProfileConfig = {
    name: "Bob",
    email: "bob@loco.pwa",
    vapidPublicKey: { kty: "EC", crv: "P-256", x: "bob-x", y: "bob-y" } as JsonWebKey,
    vapidPrivateKeyJwk: { kty: "EC", d: "bob-priv" } as JsonWebKey,
    vapidPrivateKeyEnvelope: "env-bob",
    e2ePublicKey: { kty: "RSA", n: "bob-n", e: "AQAB" } as JsonWebKey,
    e2ePrivateKeyJwk: { kty: "RSA", d: "bob-rsa-priv" } as JsonWebKey,
    subscription: {
      endpoint: "https://push.com/bob",
      keys: { p256dh: "p256", auth: "auth" },
      proxyserver: "https://loco.proxy"
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarProfile(bobProfile);

  // 2. SETUP DA "ALICE"
  const aliceVapidPublic: JsonWebKey = { kty: "EC", crv: "P-256", x: "alice-x", y: "alice-y" };
  const aliceHash = await serializarPublicKeyVapid(aliceVapidPublic);
  const aliceContato: Contato = {
    id: aliceHash,
    name: "Alice",
    email: "alice@loco.pwa",
    vapidPublicKey: aliceVapidPublic,
    e2ePublicKey: { kty: "RSA", n: "alice-n", e: "AQAB" } as JsonWebKey,
    subscription: { endpoint: "https://push.com/alice", keys: { p256dh: "p256", auth: "auth" } },
    vapidPrivateKeyEnvelope: "env-alice",
    trusted: true,
    me: 'trusted',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarContato(aliceContato);
  await removerTodoHistoricoChat(aliceHash);

  // 3. SETUP DO "CHARLIE"
  const charlieVapidPublic: JsonWebKey = { kty: "EC", crv: "P-256", x: "charlie-x", y: "charlie-y" };
  const charlieHash = await serializarPublicKeyVapid(charlieVapidPublic);
  const charlieContato: Contato = {
    id: charlieHash,
    name: "Charlie",
    email: "charlie@loco.pwa",
    vapidPublicKey: charlieVapidPublic,
    e2ePublicKey: { kty: "RSA", n: "charlie-n", e: "AQAB" } as JsonWebKey,
    subscription: { endpoint: "https://push.com/charlie", keys: { p256dh: "p256", auth: "auth" } },
    vapidPrivateKeyEnvelope: "env-charlie",
    trusted: true,
    me: 'trusted',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarContato(charlieContato);

  // 4. MENSAGEM NO BANCO
  const msgTargetId = "msg-alvo-123";
  const chatAliceBob: Chat = {
    id: msgTargetId,
    contatoHash: aliceHash,
    conteudo: "Mensagem super secreta que precisa sumir!",
    tipo: 'in',
    createdAt: Date.now(),
    handshake: "hand-original-001"
  };
  await salvarChat(chatAliceBob);

  let msgNoBanco = await buscarChat(msgTargetId);
  assertExists(msgNoBanco, "A mensagem deve existir inicialmente");

  // CENÁRIO 1: Charlie tenta apagar (SEM AUTORIDADE)
  const handshakeAtaqueId = "handshake-attack-001";
  const handshakeAtaque: Handshake = {
    id: handshakeAtaqueId,
    aud: charlieHash,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    in: {
      status: 'recebido',
      tentativas: 0,
      rotas: {
        mensagem: {
          excluida: msgTargetId
        }
      }
    }
  };
  await salvarHandshake(handshakeAtaque);
  await ProcessarMensagem({ in: handshakeAtaqueId });

  msgNoBanco = await buscarChat(msgTargetId);
  assertExists(msgNoBanco, "FALHA DE SEGURANÇA: Mensagem foi apagada por contato sem autoridade!");

  // CENÁRIO 2: Alice manda apagar (COM AUTORIDADE)
  const handshakeLegitimoId = "handshake-legitimo-001";
  const handshakeLegitimo: Handshake = {
    id: handshakeLegitimoId,
    aud: aliceHash,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    in: {
      status: 'recebido',
      tentativas: 0,
      rotas: {
        mensagem: {
          excluida: msgTargetId
        }
      }
    }
  };
  await salvarHandshake(handshakeLegitimo);
  await ProcessarMensagem({ in: handshakeLegitimoId });

  msgNoBanco = await buscarChat(msgTargetId);
  assertEquals(msgNoBanco, undefined, "Mensagem deve ser deletada quando ordem vem da contraparte correta");
});
```

---

## Arquivo: `monorepo/service-worker/tests/handshakes/mtu-splitter.test.ts`

```ts
/// <reference lib="deno.ns" />
import "fake-indexeddb/auto";
import { assert, assertEquals } from "@std/assert";
import { processarFilaHandshake } from "../../src/sw/handshakes.ts";
import { 
  salvarProfile, 
  salvarContato, 
  salvarHandshake, 
  listarHandshakes, 
  removerHandshake, 
  buscarHandshake,
  serializarPublicKeyVapid 
} from "@loco/utils/db";
import { generateVAPIDKeys, generateE2EEKeys, exportKeyToJWK } from "@loco/utils/crypto";
import type { ProfileConfig, Contato, Handshake } from "@loco/utils/interfaces";

const originalFetch = globalThis.fetch;

async function setupMockDb(hasProxy: boolean) {
  const vapidKeys = await generateVAPIDKeys();
  const e2eKeys = await generateE2EEKeys();
  const pubVapid = await exportKeyToJWK(vapidKeys.publicKey);
  const contatoHash = await serializarPublicKeyVapid(pubVapid);

  const profile: ProfileConfig = {
    name: "Arquiteto",
    email: "arq@loco.pwa",
    vapidPublicKey: pubVapid,
    vapidPrivateKeyJwk: await exportKeyToJWK(vapidKeys.privateKey),
    vapidPrivateKeyEnvelope: "envelope-ficticio",
    e2ePublicKey: e2eKeys.publicEncrypt,
    e2ePrivateKeyJwk: e2eKeys.privateDecryptJwk,
    subscription: {
      endpoint: "https://push.test/meu-endpoint",
      keys: { p256dh: "k", auth: "a" },
      proxyserver: hasProxy ? "https://meu-proxy.com" : ""
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarProfile(profile);

  const contato: Contato = {
    id: contatoHash, 
    name: "Destinatario",
    email: "dest@loco.pwa",
    vapidPublicKey: pubVapid,
    e2ePublicKey: e2eKeys.publicEncrypt,
    subscription: { endpoint: "https://push.test/dest", keys: { p256dh: "k", auth: "a" }, proxyserver: "https://proxy-dele.com" },
    vapidPrivateKeyEnvelope: "env",
    trusted: true,
    me: 'none', 
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarContato(contato);

  return { profile, contato, contatoHash };
}

Deno.test("ROTEADOR: Sanity Check DEVE bloquear injeção de PIG se perfil não tiver Proxy", async () => {
  const { contatoHash } = await setupMockDb(false);
  globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));

  const handshakeId = "handshake-sanity-1";
  const handshake: Handshake = {
    id: handshakeId,
    aud: contatoHash, 
    createdAt: Date.now(),
    updatedAt: Date.now(),
    out: {
      status: 'pendente',
      tentativas: 0,
      rotas: { mensagem: { conteudo: "Olá!" } }
    }
  };
  await salvarHandshake(handshake);

  try {
    await processarFilaHandshake();
    const processado = await buscarHandshake(handshakeId);
    assertEquals(processado?.out?.status, 'enviado');
    assertEquals(processado?.out?.rotas?.contato?.sync, undefined, "Sanity Check FALHOU: Injetou PIG sem Proxy!");
    const todos = await listarHandshakes();
    assertEquals(todos.length, 1, "Não deveria ter gerado handshake extra");
  } finally {
    await removerHandshake(handshakeId);
  }
});

Deno.test("ROTEADOR: Splitter de MTU DEVE fragmentar pacote se PIG ultrapassar 4KB", async () => {
  const { contatoHash } = await setupMockDb(true);
  let chamadasDeRede = 0;
  globalThis.fetch = () => {
    chamadasDeRede++;
    return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
  };

  const bytesAleatorios = crypto.getRandomValues(new Uint8Array(1400));
  let binaryString = "";
  for (const byte of bytesAleatorios) {
    binaryString += String.fromCharCode(byte);
  }
  const mensagemGigante = btoa(binaryString);

  const handshakeId = "handshake-gigante-1";
  const handshake: Handshake = {
    id: handshakeId,
    aud: contatoHash,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    out: {
      status: 'pendente',
      tentativas: 0,
      rotas: { mensagem: { conteudo: mensagemGigante } }
    }
  };
  await salvarHandshake(handshake);

  try {
    await processarFilaHandshake();
    const hOriginal = await buscarHandshake(handshakeId);
    assertEquals(hOriginal?.out?.status, 'enviado');
    assertEquals(hOriginal?.out?.rotas?.contato?.sync, undefined);

    const filaCompleta = await listarHandshakes();
    const handshakesNovos = filaCompleta.filter(h => h.id !== handshakeId);
    assertEquals(handshakesNovos.length, 1, "Deveria ter criado 1 novo handshake para o PIG");

    const handshakeFragmentado = handshakesNovos[0];
    assert(handshakeFragmentado !== undefined);
    assertEquals(handshakeFragmentado.out?.status, 'pendente');
    assert(handshakeFragmentado.out?.rotas?.contato?.sync !== undefined);
    assertEquals(chamadasDeRede, 1, "Apenas o primeiro pacote deveria ter sido enviado");

    await removerHandshake(handshakeFragmentado.id);
  } finally {
    await removerHandshake(handshakeId);
    globalThis.fetch = originalFetch; 
  }
});
```

---

## Arquivo: `monorepo/service-worker/tests/handshakes/hand-mensagem-self.test.ts`

```ts
/// <reference lib="deno.ns" />
import "fake-indexeddb/auto";
import { assertEquals, assertExists, assertFalse, assert } from "@std/assert";
import type { ProfileConfig, Chat, Handshake } from "@loco/utils/interfaces";
import { gerarContatoProprio, ehContatoProprio, obterHashProprio } from "@loco/utils/db";

// Helper para substituir assertTrue
function assertTrue(condition: boolean, msg?: string) {
  assert(condition, msg);
}

// Mock storage para simular IndexedDB
const mockChats = new Map<string, Chat>();
const mockHandshakes = new Map<string, Handshake>();

async function salvarChatMock(chat: Chat): Promise<void> {
  mockChats.set(chat.id, chat);
}

// Mock profile consistente para todos os testes
const mockProfile: ProfileConfig = {
  name: "Usuário Teste",
  email: "teste@example.com",
  vapidPublicKey: {
    kty: "EC",
    crv: "P-256",
    x: "test-x-value",
    y: "test-y-value",
  } as JsonWebKey,
  vapidPrivateKeyJwk: {} as JsonWebKey,
  vapidPrivateKeyEnvelope: "encrypted",
  e2ePublicKey: {} as JsonWebKey,
  e2ePrivateKeyJwk: {} as JsonWebKey,
  subscription: {
    endpoint: "https://push.example.com/sub",
    keys: { p256dh: "p256dh", auth: "auth" },
  },
  createdAt: Date.now() - 10000,
  updatedAt: Date.now(),
};

// Helper para calcular hash
async function calcularHashVapid(jwk: JsonWebKey): Promise<string> {
  const raw = `${jwk.kty?.toLowerCase() || ''}|${jwk.crv?.toLowerCase() || ''}|${jwk.x?.toLowerCase() || ''}|${jwk.y?.toLowerCase() || ''}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(raw));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.test("HAND-MENSAGEM SELF: Deve identificar envio para si mesmo", async () => {
  const meuHash = await obterHashProprio(mockProfile);
  assertExists(meuHash);
  const outroHash = "hash-de-outro-contato";
  const ehParaMim = await ehContatoProprio(meuHash, mockProfile);
  const ehParaOutro = await ehContatoProprio(outroHash, mockProfile);
  assertTrue(ehParaMim, "Deve identificar como envio para si mesmo");
  assertFalse(ehParaOutro, "Não deve identificar como envio para si mesmo");
});

Deno.test("HAND-MENSAGEM SELF: Simulação de envio de mensagem para si mesmo", async () => {
  mockChats.clear();
  mockHandshakes.clear();
  const meuHash = await obterHashProprio(mockProfile);
  assertExists(meuHash);
  const conteudoMensagem = "Esta é uma mensagem de teste para mim mesmo";
  const msgId = `msg-self-${Date.now()}`;
  const agora = Date.now();

  const chatAuto: Chat = {
    id: msgId,
    contatoHash: meuHash,
    conteudo: conteudoMensagem,
    tipo: 'out',
    createdAt: agora,
    sentAt: agora,
    receivedAt: agora,
    readAt: agora,
    notifiedAt: agora,
    handshake: 'self'
  };
  await salvarChatMock(chatAuto);

  const savedChat = mockChats.get(msgId);
  assertExists(savedChat, "Mensagem deve ser salva no banco em memória");
  assertEquals(savedChat.id, msgId);
  assertEquals(savedChat.conteudo, conteudoMensagem);
  assertEquals(savedChat.tipo, 'out');
  assertEquals(savedChat.contatoHash, meuHash);

  assertExists(savedChat.sentAt, "sentAt deve existir");
  assertExists(savedChat.receivedAt, "receivedAt deve existir");
  assertExists(savedChat.readAt, "readAt deve existir");
  assertExists(savedChat.notifiedAt, "notifiedAt deve existir");

  assertEquals(savedChat.sentAt, savedChat.receivedAt);
  assertEquals(savedChat.receivedAt, savedChat.readAt);
  assertEquals(savedChat.readAt, savedChat.notifiedAt);
  assertEquals(savedChat.handshake, 'self', "Handshake deve ser 'self'");
  assertEquals(mockHandshakes.size, 0, "Map de handshakes deve estar vazio");
});

Deno.test("HAND-MENSAGEM SELF: Mensagem normal para outro contato cria handshake", async () => {
  mockChats.clear();
  mockHandshakes.clear();
  const outroHash = "hash-de-outra-pessoa";
  const conteudoMensagem = "Mensagem para outra pessoa";
  const msgId = `msg-normal-${Date.now()}`;
  const handId = `hand-${Date.now()}`;
  const agora = Date.now();

  const chatOut: Chat = {
    id: msgId,
    contatoHash: outroHash,
    conteudo: conteudoMensagem,
    tipo: 'out',
    createdAt: agora,
    handshake: handId
  };

  const handshakeNormal: Handshake = {
    id: handId,
    aud: outroHash,
    createdAt: agora,
    updatedAt: agora,
    out: {
      status: 'pendente',
      tentativas: 0,
      rotas: {
        mensagem: {
          enviada: msgId,
          conteudo: conteudoMensagem
        }
      }
    }
  };

  await salvarChatMock(chatOut);
  mockHandshakes.set(handId, handshakeNormal);

  const savedChat = mockChats.get(msgId);
  const savedHandshake = mockHandshakes.get(handId);

  assertExists(savedChat);
  assertEquals(savedChat.id, msgId);

  assertFalse(!!savedChat.sentAt, "sentAt não deve existir ainda");
  assertFalse(!!savedChat.receivedAt, "receivedAt não deve existir ainda");
  assertFalse(!!savedChat.readAt, "readAt não deve existir ainda");

  assertExists(savedHandshake, "Handshake deve ser criado para envio normal");
  assertEquals(savedHandshake.id, handId);
  assertEquals(savedHandshake.aud, outroHash);
  assertEquals(savedHandshake.out?.status, 'pendente');
});

Deno.test("HAND-MENSAGEM SELF: Comparação entre auto-mensagem e mensagem normal", async () => {
  mockChats.clear();
  mockHandshakes.clear();
  const meuHash = await obterHashProprio(mockProfile);
  const outroHash = "hash-terceiro";
  const agora = Date.now();

  const autoMsg: Chat = {
    id: `auto-${agora}`,
    contatoHash: meuHash!,
    conteudo: "Para mim",
    tipo: 'out',
    createdAt: agora,
    sentAt: agora,
    receivedAt: agora,
    readAt: agora,
    notifiedAt: agora,
    handshake: 'self'
  };

  const normalMsg: Chat = {
    id: `normal-${agora}`,
    contatoHash: outroHash,
    conteudo: "Para outro",
    tipo: 'out',
    createdAt: agora,
    handshake: `hand-${agora}`
  };

  await salvarChatMock(autoMsg);
  await salvarChatMock(normalMsg);

  const savedAuto = mockChats.get(autoMsg.id);
  const savedNormal = mockChats.get(normalMsg.id);

  assertExists(savedAuto);
  assertExists(savedNormal);

  assertEquals(savedAuto.handshake, 'self');
  assertExists(savedAuto.sentAt);
  assertExists(savedAuto.receivedAt);
  assertExists(savedAuto.readAt);
  assertExists(savedAuto.notifiedAt);

  assertEquals(savedNormal.handshake, `hand-${agora}`);
  assertFalse(!!savedNormal.sentAt);
  assertFalse(!!savedNormal.receivedAt);
  assertFalse(!!savedNormal.readAt);
  assertFalse(!!savedNormal.notifiedAt);

  assertEquals(savedAuto.tipo, savedNormal.tipo, "Ambas são 'out'");
  assertEquals(savedAuto.createdAt, savedNormal.createdAt);
});

Deno.test("HAND-MENSAGEM SELF: Múltiplas auto-mensagens não criam handshakes", async () => {
  mockChats.clear();
  mockHandshakes.clear();
  const meuHash = await obterHashProprio(mockProfile);
  assertExists(meuHash);
  const mensagens = [
    "Primeira mensagem para mim",
    "Segunda mensagem para mim",
    "Terceira mensagem para mim"
  ];

  let index = 0;
  for (const conteudo of mensagens) {
    const msg: Chat = {
      id: `auto-msg-${index}-${Date.now()}`,
      contatoHash: meuHash,
      conteudo: conteudo,
      tipo: 'out',
      createdAt: Date.now(),
      sentAt: Date.now(),
      receivedAt: Date.now(),
      readAt: Date.now(),
      notifiedAt: Date.now(),
      handshake: 'self'
    };
    await salvarChatMock(msg);
    index++;
  }

  assertEquals(mockChats.size, mensagens.length);
  assertEquals(mockHandshakes.size, 0, "Nenhum handshake deve ser criado para auto-mensagens");

  for (const [_id, chat] of mockChats.entries()) {
    assertExists(chat.sentAt);
    assertExists(chat.receivedAt);
    assertExists(chat.readAt);
    assertExists(chat.notifiedAt);
    assertEquals(chat.handshake, 'self');
  }
});

Deno.test("HAND-MENSAGEM SELF: Contato próprio deve ser identificado corretamente", async () => {
  const contatoProprio = await gerarContatoProprio(mockProfile);
  assertExists(contatoProprio);

  assertEquals(contatoProprio.name, "Usuário Teste (Eu)");
  assertEquals(contatoProprio.me, 'trusted');
  assertTrue(contatoProprio.trusted);

  const hashCalculado = await calcularHashVapid(mockProfile.vapidPublicKey);
  assertEquals(contatoProprio.id, hashCalculado);

  const ehEu = await ehContatoProprio(contatoProprio.id, mockProfile);
  assertTrue(ehEu);
  const naoEhEu = await ehContatoProprio("outro-hash", mockProfile);
  assertFalse(naoEhEu);
});
```

---

## Arquivo: `monorepo/service-worker/tests/integration/e2e-payload-pipeline.test.ts`

```ts
/// <reference lib="deno.ns" />
import { assert, assertEquals } from "@std/assert";
import { generateVAPIDKeys, generateE2EEKeys, exportKeyToJWK, base64UrlToBuffer } from "@loco/utils/crypto";
import { cifrarPayloadObj } from "@loco/utils/proxy";
import { criarJWT, verificarJWT } from "@loco/utils/crypto";
import { gunzipSync } from "fflate";

Deno.test("INTEGRAÇÃO E2E: Nó A (Compacta, Cifra, Assina) -> Servidor -> Nó B (Verifica, Decifra, Descompacta)", async () => {
  // 1. SETUP DOS NÓS
  const aliceVapid = await generateVAPIDKeys();
  const aliceVapidPubJwk = await exportKeyToJWK(aliceVapid.publicKey);
  const aliceVapidPrivJwk = await exportKeyToJWK(aliceVapid.privateKey);
  const bobE2E = await generateE2EEKeys();

  const payloadOriginal = {
    mensagem: { conteudo: "Mensagem Ultra Secreta! ".repeat(50) },
    contato: { sync: { nome: "Alice_PWA" } }
  };

  // 2. NÓ A PREPARA O PACOTE
  const envelopeCifrado = await cifrarPayloadObj(payloadOriginal, bobE2E.publicEncrypt);
  assert(envelopeCifrado.i && envelopeCifrado.d && envelopeCifrado.k);

  const jwtPayload = { 
    sub: "hand", 
    aud: "hash-do-bob", 
    jti: "handshake-123", 
    ct: JSON.stringify(envelopeCifrado) 
  };
  const jwtString = await criarJWT(jwtPayload, aliceVapidPrivJwk, { kid: aliceVapidPubJwk });

  // 3. SERVIDOR PROXY (cego)
  const tamanhoTransferencia = new Blob([jwtString]).size;
  console.log(`\n📦 Tamanho do pacote: ${tamanhoTransferencia} bytes`);
  assert(tamanhoTransferencia < 4096, "Pacote deve ser menor que 4KB");

  // 4. NÓ B RECEBE E ABRE
  const jwtDecodificado = await verificarJWT(jwtString);
  assertEquals(jwtDecodificado.header.alg, "ES256");
  assertEquals(jwtDecodificado.payload.aud, "hash-do-bob");

  const ctRecebido = JSON.parse(jwtDecodificado.payload.ct);

  const bobPrivateDecryptKey = await crypto.subtle.importKey(
    "jwk", 
    bobE2E.privateDecryptJwk, 
    { name: "RSA-OAEP", hash: "SHA-256" }, 
    true, 
    ["decrypt"]
  );

  const ivBytes = new Uint8Array(base64UrlToBuffer(ctRecebido.i));
  const dadosBytes = new Uint8Array(base64UrlToBuffer(ctRecebido.d));
  const chaveAesCifradaBytes = new Uint8Array(base64UrlToBuffer(ctRecebido.k));

  const aesChaveCruaBuffer = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" }, 
    bobPrivateDecryptKey, 
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
  const rotasObj = JSON.parse(new TextDecoder().decode(decompressed));

  // 5. PROVA MATEMÁTICA
  assertEquals(
    rotasObj.mensagem.conteudo, 
    payloadOriginal.mensagem.conteudo, 
    "Mensagem foi corrompida!"
  );
  assertEquals(
    rotasObj.contato.sync.nome, 
    "Alice_PWA", 
    "Piggyback falhou!"
  );
  console.log("✅ Pipeline E2E operando perfeitamente!");
});
```

---

## Arquivo: `monorepo/service-worker/tests/integration/proxy-payload.test.ts`

```ts
/// <reference lib="deno.ns" />
import "fake-indexeddb/auto";
import { assert, assertEquals, assertExists } from "@std/assert";
import { processarFilaHandshake } from "../../src/sw/handshakes.ts";
import { 
  salvarProfile, 
  salvarContato, 
  salvarHandshake, 
  serializarPublicKeyVapid, 
  removerHandshake,
  listarHandshakes
} from "@loco/utils/db";
import { generateVAPIDKeys, generateE2EEKeys, exportKeyToJWK } from "@loco/utils/crypto";
import type { ProfileConfig, Contato, Handshake } from "@loco/utils/interfaces";

const originalFetch = globalThis.fetch;

Deno.test("INTEGRAÇÃO REAL: Roteador envia proxyserver padronizado dentro de subscription", async () => {
  const aliceVapid = await generateVAPIDKeys();
  const aliceE2E = await generateE2EEKeys();
  const alicePubVapid = await exportKeyToJWK(aliceVapid.publicKey);
  const bobVapid = await generateVAPIDKeys();
  const bobE2E = await generateE2EEKeys();
  const bobPubVapid = await exportKeyToJWK(bobVapid.publicKey);
  const bobHash = await serializarPublicKeyVapid(bobPubVapid);

  const myProfile: ProfileConfig = {
    name: "Alice",
    email: "alice@loco.pwa",
    vapidPublicKey: alicePubVapid,
    vapidPrivateKeyJwk: await exportKeyToJWK(aliceVapid.privateKey),
    vapidPrivateKeyEnvelope: "envelope-cifrado-da-alice",
    e2ePublicKey: aliceE2E.publicEncrypt,
    e2ePrivateKeyJwk: aliceE2E.privateDecryptJwk,
    subscription: {
      endpoint: "https://push.alice.com",
      keys: { p256dh: "alice-p256dh", auth: "alice-auth" },
      proxyserver: "https://proxy.loco.com"
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarProfile(myProfile);

  const contatoBob: Contato = {
    id: bobHash,
    name: "Bob",
    email: "bob@loco.pwa",
    vapidPublicKey: bobPubVapid,
    e2ePublicKey: bobE2E.publicEncrypt,
    subscription: {
      endpoint: "https://fcm.googleapis.com/fcm/send/bob-token-secreto",
      keys: { p256dh: "bob-p256dh", auth: "bob-auth" },
      proxyserver: "https://proxy.loco.com"
    },
    vapidPrivateKeyEnvelope: "envelope-cifrado-do-bob",
    trusted: true,
    me: 'none', 
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarContato(contatoBob);

  const handshakeId = "handshake-teste-payload";
  const handshakeOut: Handshake = {
    id: handshakeId,
    aud: bobHash,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    out: {
      status: 'pendente',
      tentativas: 0,
      rotas: {
        mensagem: {
          enviada: "msg-123",
          conteudo: "Olá Bob! Testando o proxyserver padronizado!"
        }
      }
    }
  };
  await salvarHandshake(handshakeOut);

  let requestInterceptada: any = null;
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (init && init.body) {
      requestInterceptada = JSON.parse(init.body as string);
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };

  try {
    await processarFilaHandshake();
    assertExists(requestInterceptada, "Roteador não realizou fetch!");

    assertExists(requestInterceptada.subscription);
    assertEquals(requestInterceptada.subscription.endpoint, contatoBob.subscription.endpoint);
    assertEquals(requestInterceptada.subscription.proxyserver, contatoBob.subscription.proxyserver);

    assertExists(requestInterceptada.vapid);
    assertEquals(requestInterceptada.vapid.publicKey.x, bobPubVapid.x);
    assertEquals(requestInterceptada.vapid.privateKey, contatoBob.vapidPrivateKeyEnvelope);

    assertExists(requestInterceptada.payloadText);
  } finally {
    globalThis.fetch = originalFetch;
    const fila = await listarHandshakes();
    for (const h of fila) {
      await removerHandshake(h.id);
    }
  }
});
```

---

## Arquivo: `monorepo/service-worker/tests/integration/piggyback.test.ts`

```ts
/// <reference lib="deno.ns" />
import "fake-indexeddb/auto";
import { assertEquals, assertExists } from "@std/assert";
import { 
  salvarProfile, 
  salvarContato, 
  buscarContatoPorChave, 
  salvarHandshake, 
  listarHandshakes,
  removerHandshake,
  serializarPublicKeyVapid
} from "@loco/utils/db";
import { generateVAPIDKeys, generateE2EEKeys, exportKeyToJWK } from "@loco/utils/crypto";
import { processarFilaHandshake } from "../../src/sw/handshakes.ts";
import { Processar as ProcessarContato } from "../../src/handshakes/hand-contato.ts";
import type { ProfileConfig, Contato, Handshake } from "@loco/utils/interfaces";

const originalFetch = globalThis.fetch;

Deno.test("INTEGRAÇÃO (PIGGYBACK 1): Mensagem para contato 'me: none' DEVE forçar injeção do Piggyback", async () => {
  globalThis.fetch = async () => new Response("OK", { status: 200 });

  // 1. SETUP: Perfil da Alice
  const aliceVapid = await generateVAPIDKeys();
  const aliceE2e = await generateE2EEKeys();
  const alicePubVapid = await exportKeyToJWK(aliceVapid.publicKey);
  const alicePrivVapid = await exportKeyToJWK(aliceVapid.privateKey);

  const aliceProfile: ProfileConfig = {
    name: "Alice Original",
    email: "alice@loco.pwa",
    vapidPublicKey: alicePubVapid,
    vapidPrivateKeyJwk: alicePrivVapid,
    vapidPrivateKeyEnvelope: "envelope-falso",
    e2ePublicKey: aliceE2e.publicEncrypt,
    e2ePrivateKeyJwk: {} as any,
    subscription: { endpoint: "https://fcm", keys: { p256dh: "p", auth: "a" }, proxyserver: "proxy" },
    createdAt: Date.now(), updatedAt: Date.now()
  };
  await salvarProfile(aliceProfile);

  // 2. SETUP: Bob não tem dados da Alice (me: 'none')
  const bobVapid = await generateVAPIDKeys();
  const bobE2e = await generateE2EEKeys();
  const bobPubVapid = await exportKeyToJWK(bobVapid.publicKey);
  const bobHash = await serializarPublicKeyVapid(bobPubVapid);

  const bobContato: Contato = {
    id: bobHash, name: "Bob", email: "bob@loco.pwa",
    vapidPublicKey: bobPubVapid, e2ePublicKey: bobE2e.publicEncrypt,
    subscription: { endpoint: "https://fcm-bob", keys: { p256dh: "p", auth: "a" }, proxyserver: "proxy" },
    vapidPrivateKeyEnvelope: "env", trusted: true, 
    me: "none",
    createdAt: Date.now(), updatedAt: Date.now()
  };
  await salvarContato(bobContato);

  // 3. AÇÃO: Alice envia mensagem
  const msgHandshake: Handshake = {
    id: "hand-msg-alice-bob", aud: bobHash, createdAt: Date.now(), updatedAt: Date.now(),
    out: { status: 'pendente', tentativas: 0, rotas: { mensagem: { enviada: "msg-123", conteudo: "Oi Bob!" } } }
  };
  await salvarHandshake(msgHandshake);

  // 4. PROCESSAMENTO
  await processarFilaHandshake();

  // 5. PROVA
  const handshakes = await listarHandshakes();
  const sentHandshake = handshakes.find(h => h.id === "hand-msg-alice-bob");
  assertExists(sentHandshake?.out?.rotas?.contato?.sync, "Piggyback NÃO foi injetado!");
  assertEquals((sentHandshake.out.rotas.contato.sync as any).nm, "Alice Original");

  for (const h of handshakes) await removerHandshake(h.id);
  globalThis.fetch = originalFetch;
});

Deno.test("INTEGRAÇÃO (PIGGYBACK 2): Receber Piggyback DEVE criar contato real no destino", async () => {
  // 1. SETUP
  const aliceVapid = await generateVAPIDKeys();
  const aliceE2e = await generateE2EEKeys();
  const alicePubVapid = await exportKeyToJWK(aliceVapid.publicKey);
  const alicePubE2e = aliceE2e.publicEncrypt; 
  const aliceHash = await serializarPublicKeyVapid(alicePubVapid);

  let aliceNoDb = await buscarContatoPorChave(aliceHash);
  assertEquals(aliceNoDb, undefined, "Alice não deveria existir ainda");

  // 2. AÇÃO: Bob recebe Piggyback
  const incomingHandshake: Handshake = {
    id: "hand-in-piggyback", aud: aliceHash, createdAt: Date.now(), updatedAt: Date.now(),
    in: {
      status: 'recebido', tentativas: 0,
      rotas: {
        contato: {
          sync: {
            nm: "Alice Nova", em: "alice@loco.pwa",
            vp: { x: alicePubVapid.x!, y: alicePubVapid.y! }, 
            ep: { n: alicePubE2e.n!, e: alicePubE2e.e! },
            se: "https://fcm-alice", sp: "p256", sa: "auth", ps: "proxy", ve: "env", tr: false
          }
        }
      }
    }
  };
  await salvarHandshake(incomingHandshake);

  // 3. PROCESSAMENTO
  await ProcessarContato({ in: incomingHandshake.id });

  // 4. PROVA
  aliceNoDb = await buscarContatoPorChave(aliceHash);
  assertExists(aliceNoDb, "Contato da Alice NÃO foi criado!");
  assertEquals(aliceNoDb.name, "Alice Nova");
  assertEquals(aliceNoDb.me, "saved");

  await removerHandshake(incomingHandshake.id);
});
```

---

## Arquivo: `monorepo/service-worker/deno.jsonc`

```json
{
   "name": "@loco/service-worker",
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
     "fflate": "https://esm.sh/fflate@0.8.2?target=es2022",
     "fake-indexeddb": "https://esm.sh/fake-indexeddb@6.2.5?bundle",
     "fake-indexeddb/auto": "https://esm.sh/fake-indexeddb@6.2.5/auto?bundle"
   },
   "tasks": {
     "test": "deno test --allow-env --allow-net --allow-read --allow-write tests/",
     "check": "deno check src/**/*.ts tests/**/*.ts",
     "build": "deno run --allow-import --allow-read --allow-write --allow-env --allow-net --env-file --unstable-bundle ../esbuild.ts sw",
     "tests": "deno task check && deno task test"
   },
   "exports": 
   {
    "." : "./src/mod.ts",
    "./utils" : "./src/utils/mod.ts",
    "./handshakes/contato" : "./src/handshakes/hand-contato.ts",
    "./handshakes/sdp" : "./src/handshakes/hand-sdp.ts",
    "./handshakes/profile" : "./src/handshakes/hand-profile.ts",
    "./handshakes/mensagem" : "./src/handshakes/hand-mensagem.ts"
   }
}
```

---

