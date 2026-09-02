// src/service-worker.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

// === IMPORTAÇÃO DOS MÓDULOS AUXILIARES (HANDLERS) ===
import { handleCacheFetch } from "./sw/cache.ts";
import { handlePush } from "./sw/push.ts";
import { handleNotificationClick } from "./sw/click.ts";
import { handleSync, handleOnline, processarFilaHandshake } from "./sw/sw-handshakes.ts";
import { handleWebTorrentFetch, handleWebTorrentMessage } from "./sw/webtorrent.ts";

// === IMPORTAÇÃO DAS ROTAS DE HANDSHAKE ===
import { Processar as ProcessarProfile } from "./handshakes/hand-profile.ts";
import { Processar as ProcessarMensagem } from "./handshakes/hand-mensagem.ts";
import { Processar as ProcessarContato } from "./handshakes/hand-contato.ts";

import { APP_VERSION } from "@loco/utils/config";

console.log(`[SW] 🌌 Service Worker orquestrador carregado (v${APP_VERSION}).`);

// === LIFECYCLE EVENTS ===
self.addEventListener('activate', (event) => {
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

// === FETCH EVENT (ORQUESTRADOR CENTRAL) ===
self.addEventListener('fetch', (event: FetchEvent) => {
  // 1. Prioridade Máxima: WebTorrent (Streaming P2P via OPFS)
  // Se a URL for do webtorrent E o main thread estiver pronto, a função chama event.respondWith() e retorna true.
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
      // Se o módulo de cache retornou undefined (ex: é POST, ou é externo), 
      // deixamos o navegador lidar nativamente com a requisição.
      return fetch(event.request);
    })
  );
});

// === MESSAGE EVENT (ORQUESTRADOR CENTRAL) ===
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (!event.data) return;
  const { type, payload } = event.data;

  // 1. Roteamento para WebTorrent (Aviso de que o Main Thread está pronto)
  if (type === 'WEBTORRENT_READY') {
    handleWebTorrentMessage(event);
    return;
  }

  // 2. Checagem de Versão (Introspecção App vs SW)
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