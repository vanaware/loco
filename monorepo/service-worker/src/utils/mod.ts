// monorepo/service-worker/src/utils/mod.ts
import { addDebugLog } from '@loco/utils/debug';
import { APP_VERSION } from '@loco/utils/config';
import { EventBus } from '@loco/utils/eventbus';

/**
 * Inicializa a Fronteira de Eventos da UI (Main Thread).
 * Este é o ÚNICO ponto na UI autorizado a escutar eventos nativos do SW e do Window.
 */
function initializeUiEventAdapter() {
  // 1. Traduz postMessage do SW -> EventBus
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (!event.data) return;
    const { type, payload } = event.data;
    
    if (type === 'CHAT_ATUALIZADO') {
      EventBus.emit('sw:notify:chat-updated', { chatId: payload.chatId });
    } else if (type === 'CONTATO_ATUALIZADO') {
      EventBus.emit('sw:notify:contact-updated', { contatoHash: payload.contatoHash });
    } else if (type === 'PONG_SW_VERSION') {
      EventBus.emit('sw:notify:pong-version', { version: payload.version });
    } else if (type === 'WEBTORRENT_ACK') {
      EventBus.emit('sw:notify:webtorrent-ack');
    }
  });

  // 2. Traduz eventos de rede nativos -> EventBus
  window.addEventListener('online', () => EventBus.emit('loco:network:online'));
  window.addEventListener('offline', () => EventBus.emit('loco:network:offline'));

  // 3. Traduz ciclo de vida da janela -> EventBus
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      EventBus.emit('loco:app:backgrounded');
    } else if (document.visibilityState === 'visible') {
      EventBus.emit('loco:app:foregrounded');
    }
  });

  addDebugLog("✅ EventAdapter da UI inicializado e ouvindo fronteiras nativas.");
}

/**
 * Registra o Service Worker e inicializa o EventAdapter da UI.
 */
export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration> {
  addDebugLog("📡 Verificando suporte ao Service Worker...");
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Worker não é suportado neste navegador.");
  }

  let basePath = globalThis.location.pathname;
  if (basePath.split('/').pop()?.includes('.')) {
    basePath = basePath.substring(0, basePath.lastIndexOf('/') + 1);
  } else if (!basePath.endsWith('/')) {
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

    // 🔥 Inicializa o EventAdapter da UI assim que o SW estiver pronto
    initializeUiEventAdapter();

    // Checagem Introspectiva de Versão (App vs SW)
    if (readyReg.active) {
      const channel = new MessageChannel();
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
      readyReg.active.postMessage({ type: 'PING_SW_VERSION' }, [channel.port2]);
    }

    return readyReg;
  } catch (err: any) {
    addDebugLog("❌ Erro ao registrar Service Worker: " + (err?.message || String(err)));
    throw new Error(`Falha ao registrar Service Worker: ${err?.message || String(err)}`);
  }
}