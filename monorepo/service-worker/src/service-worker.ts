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