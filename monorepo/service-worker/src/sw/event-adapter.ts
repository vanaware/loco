// monorepo/service-worker/src/sw/event-adapter.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { EventBus } from "@loco/utils/eventbus";
import { APP_VERSION } from "@loco/utils/config";
import { addDebugLog } from "@loco/utils/debug";

// === HANDLERS NATIVOS EXISTENTES (INFRAESTRUTURA) ===
import { handleInstall, handleActivate, handleCacheFetch } from "./cache.ts";
import { handlePush } from "./push.ts";
import { handleNotificationClick } from "./click.ts";
import { handleSync, handleOnline, processarFilaHandshake } from "./handshakes.ts";
import { handleWebTorrentFetch, handleWebTorrentMessage } from "./webtorrent.ts";

// === ROTAS DE HANDSHAKE (LÓGICA DE NEGÓCIO) ===
import { Processar as ProcessarProfile } from "../handshakes/hand-profile.ts";
import { Processar as ProcessarMensagem } from "../handshakes/hand-mensagem.ts";
import { Processar as ProcessarContato } from "../handshakes/hand-contato.ts";

/**
 * Inicializa a Fronteira de Eventos do Service Worker.
 * Este é o ÚNICO ponto onde addEventListener nativos devem ser registrados no SW.
 */
export function initializeSwEventAdapter() {
  addDebugLog(`[SW-ADAPTER] 🌌 Inicializando Adaptador de Eventos do SW (v${APP_VERSION}).`);

  // ==========================================
  // 1. LIFECYCLE EVENTS
  // ==========================================
  self.addEventListener('install', (event) => {
    handleInstall(event);
  });

  self.addEventListener('activate', (event) => {
    handleActivate(event);
    event.waitUntil(
      (async () => {
        await new Promise(r => setTimeout(r, 1000));
        try {
          await processarFilaHandshake();
          // ✅ Chave exata do EventMap
          EventBus.emit('loco:network:sync-completed', { syncedCount: 1 });
        } catch (e: any) {
          addDebugLog(`[SW-ADAPTER] ❌ Erro ao processar fila na ativação: ${e.message}`);
        }
      })()
    );
  });

  // ==========================================
  // 2. FETCH EVENT
  // ==========================================
  self.addEventListener('fetch', (event: FetchEvent) => {
    if (handleWebTorrentFetch(event)) {
      return; 
    }
    const cachePromise = handleCacheFetch(event);
    event.respondWith(
      cachePromise.then(response => {
        if (response) return response; 
        return fetch(event.request);
      })
    );
  });

  // ==========================================
  // 3. MESSAGE EVENT (A MÁGICA DO EVENTBUS)
  // ==========================================
  self.addEventListener('message', (event: ExtendableMessageEvent) => {
    if (!event.data) return;
    const { type, payload } = event.data;

    if (type === 'WEBTORRENT_READY') {
      // ✅ Chave exata do EventMap
      EventBus.emit('loco:sw:message-received', { type: 'WEBTORRENT_READY', payload });
      handleWebTorrentMessage(event);
      return;
    }

    if (type === 'PING_SW_VERSION') {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ type: 'PONG_SW_VERSION', version: APP_VERSION });
      }
      return;
    }

    if (type === 'PROCESSAR_FILA_HANDSHAKE') {
      processarFilaHandshake().catch(err => addDebugLog(`[SW-ADAPTER] Erro na fila manual: ${err.message}`));
      return;
    }

    if (type === 'CRIAR_HANDSHAKE_OUT') {
      const { rotasModulo, params } = payload;
      // ✅ Chave exata do EventMap (Apenas para log/rastro interno no SW)
      EventBus.emit('loco:sw:message-received', { type: 'CRIAR_HANDSHAKE_OUT', payload: { rotasModulo, params } });

      if (rotasModulo === 'profile') {
        ProcessarProfile({ out: params }).catch(err => addDebugLog(`[SW-ADAPTER] Erro hand-profile: ${err.message}`));
      } else if (rotasModulo === 'mensagem') {
        ProcessarMensagem({ out: params }).catch(err => addDebugLog(`[SW-ADAPTER] Erro hand-mensagem: ${err.message}`));
      } else if (rotasModulo === 'contato') {
        ProcessarContato({ out: params }).catch(err => addDebugLog(`[SW-ADAPTER] Erro hand-contato: ${err.message}`));
      } else {
        addDebugLog(`[SW-ADAPTER] ⚠️ Módulo de rotas desconhecido: ${rotasModulo}`);
      }
      return;
    }
  });

  // ==========================================
  // 4. PUSH & NOTIFICATION EVENTS
  // ==========================================
  self.addEventListener('push', (event: any) => {
    handlePush(event);
  });

  self.addEventListener('notificationclick', (event: any) => {
    handleNotificationClick(event);
  });

  // ==========================================
  // 5. SYNC & NETWORK EVENTS
  // ==========================================
  self.addEventListener('sync', (event: any) => {
    handleSync(event);
  });

  self.addEventListener('online', (event: any) => {
    // ✅ Chave exata do EventMap
    EventBus.emit('loco:network:online');
    handleOnline(event);
  });

  self.addEventListener('offline', (event: any) => {
    // ✅ Chave exata do EventMap
    EventBus.emit('loco:network:offline');
  });

  // ==========================================
  // 6. BRIDGE: EventBus -> UI (postMessage)
  // ==========================================
  // 🔥 CORREÇÃO: O bridge agora escuta os eventos de negócio corretos emitidos pelos handlers 
  // de handshake e os traduz para postMessage para a UI.
  EventBus.on('sw:notify:chat-updated', ({ chatId }) => {
    addDebugLog(`[SW-ADAPTER] 📡 Bridge: chat-updated -> UI (chatId: ${chatId})`);
    broadcastToClients({ type: 'CHAT_ATUALIZADO', payload: { chatId } });
  });

  EventBus.on('sw:notify:contact-updated', ({ contatoHash }) => {
    addDebugLog(`[SW-ADAPTER] 📡 Bridge: contact-updated -> UI (contatoHash: ${contatoHash})`);
    broadcastToClients({ type: 'CONTATO_ATUALIZADO', payload: { contatoHash } });
  });

  addDebugLog(`[SW-ADAPTER] ✅ Adaptador de Eventos inicializado e listeners nativos acoplados.`);
}

/**
 * Helper para broadcast de mensagens para todas as janelas/abas do app.
 */
async function broadcastToClients(message: any) {
  if (typeof self !== 'undefined' && self.clients && typeof self.clients.matchAll === 'function') {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(client => client.postMessage(message));
  }
}