// monorepo/service-worker/src/sw/event-adapter.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { EventBus } from "@loco/utils/eventbus";
import { APP_VERSION } from "@loco/utils/config";
import { addDebugLog } from "@loco/utils/debug";

// === HANDLERS NATIVOS EXISTENTES ===
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
          EventBus.emit('sw:internal:queue-processed', { success: true });
        } catch (e: any) {
          addDebugLog(`[SW-ADAPTER] ❌ Erro ao processar fila na ativação: ${e.message}`);
          EventBus.emit('sw:internal:queue-processed', { success: false, error: e.message });
        }
      })()
    );
  });

  // ==========================================
  // 2. FETCH EVENT (ORQUESTRADOR CENTRAL)
  // ==========================================
  // NOTA: O fetch não passa pelo EventBus para manter a performance e o controle estrito do respondWith.
  self.addEventListener('fetch', (event: FetchEvent) => {
    // 1. Prioridade Máxima: WebTorrent (Streaming P2P via OPFS)
    if (handleWebTorrentFetch(event)) {
      return; 
    }

    // 2. Prioridade Secundária: Cache de Assets e Fallback Offline
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

    // Roteamento Nativo -> EventBus -> Handlers
    if (type === 'WEBTORRENT_READY') {
      EventBus.emit('sw:req:webtorrent-ready');
      handleWebTorrentMessage(event); // Requer o objeto event para os ports
      return;
    }

    if (type === 'PING_SW_VERSION') {
      EventBus.emit('sw:req:ping-version');
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ type: 'PONG_SW_VERSION', version: APP_VERSION });
      }
      return;
    }

    if (type === 'PROCESSAR_FILA_HANDSHAKE') {
      EventBus.emit('sw:req:process-queue');
      processarFilaHandshake().catch(err => addDebugLog(`[SW-ADAPTER] Erro na fila manual: ${err.message}`));
      return;
    }

    if (type === 'CRIAR_HANDSHAKE_OUT') {
      const { rotasModulo, params } = payload;
      // Emite o evento para quem mais estiver escutando (ex: logs, telemetria)
      EventBus.emit('sw:req:handshake-out', { rotasModulo, params });
      
      // Despacha para a rota de negócio correta
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
    EventBus.emit('network:status-changed', { isOnline: true });
    handleOnline(event);
  });

  self.addEventListener('offline', (event: any) => {
    EventBus.emit('network:status-changed', { isOnline: false });
  });

  // ==========================================
  // 6. BRIDGE: EventBus -> UI (postMessage)
  // ==========================================
  // O Adapter escuta os eventos de notificação do EventBus e os traduz para postMessage para a UI.
  // Isso remove a necessidade dos handlers de negócio (hand-mensagem, etc) conhecerem o self.clients.
  
  EventBus.on('sw:notify:chat-updated', ({ chatId }) => {
    broadcastToClients({ type: 'CHAT_ATUALIZADO', payload: { chatId } });
  });

  EventBus.on('sw:notify:contact-updated', ({ contatoHash }) => {
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