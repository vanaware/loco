// monorepo/utils/src/eventbus/mod.ts
// exportado como @loco/utils/eventbus

/**
 * Barramento de Eventos Interno do Loco (Foco: Service Worker & Cross-Boundary).
 * 
 * Este módulo define o contrato de eventos para comunicação entre a UI e o Service Worker,
 * além de eventos internos do próprio SW.
 * 
 * IMPORTANTE: O EventBus é um singleton em memória. O SW e a UI terão instâncias isoladas.
 * O EventAdapter (camada de infraestrutura) será responsável por traduzir postMessage <-> EventBus.
 */

type EventMap = {
  // ==========================================
  // 1. COMUNICAÇÃO UI <-> SW (CROSS-BOUNDARY)
  // ==========================================
  
  // --- Requests (UI -> SW) ---
  // Comandos enviados pela UI para o SW processar.
  'sw:req:handshake-out': { 
    rotasModulo: 'profile' | 'mensagem' | 'contato'; 
    params: unknown; // O tipo exato depende do rotasModulo (ex: MensagemOutParams)
  };
  'sw:req:process-queue': void;
  'sw:req:webtorrent-ready': void;
  'sw:req:ping-version': void;

  // --- Notifications (SW -> UI) ---
  // Avisos enviados pelo SW para a UI atualizar o estado reativo (Signals).
  'sw:notify:chat-updated': { chatId: string };
  'sw:notify:contact-updated': { contatoHash: string };
  'sw:notify:webtorrent-ack': void;
  'sw:notify:pong-version': { version: string };

  // ==========================================
  // 2. EVENTOS INTERNOS DO SERVICE WORKER
  // ==========================================
  // Eventos de ciclo de vida e processamento interno do SW.
  'sw:internal:queue-processed': { success: boolean; error?: string };
  'sw:internal:push-received': { payload: unknown };
  'sw:internal:sync-completed': { syncedCount: number };

  // ==========================================
  // 3. EVENTOS DE REDE (CROSS-CONTEXT)
  // ==========================================
  // Eventos de conectividade que afetam tanto a UI quanto o SW.
  'network:status-changed': { isOnline: boolean };
};

type EventCallback<T> = (payload: T) => void;

class EventBusImpl {
  private listeners = new Map<keyof EventMap, Set<EventCallback<any>>>();

  /**
   * Assina um evento interno.
   * Retorna uma função de cleanup para remover o listener (evita vazamentos de memória).
   */
  on<K extends keyof EventMap>(
    event: K, 
    callback: EventCallback<EventMap[K]>
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    
    const callbacks = this.listeners.get(event)!;
    callbacks.add(callback);

    // Retorna função de unsubscribe
    return () => {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  /**
   * Emite um evento interno.
   */
  emit<K extends keyof EventMap>(
    event: K, 
    ...args: EventMap[K] extends void ? [] : [EventMap[K]]
  ): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const payload = args[0];
      for (const callback of callbacks) {
        try {
          callback(payload);
        } catch (error) {
          console.error(`[EventBus] Erro no listener do evento '${String(event)}':`, error);
        }
      }
    }
  }
}

// Instância Singleton
// (Lembre-se: O SW e a UI terão instâncias separadas desta classe)
export const EventBus = new EventBusImpl();

/**
 * Hook utilitário para Preact (usar dentro de componentes da UI).
 * Garante que o listener seja removido automaticamente quando o componente desmontar.
 * 
 * NOTA: Este hook NÃO deve ser usado dentro do Service Worker.
 */
export function useEvent<K extends keyof EventMap>(
  event: K,
  callback: EventCallback<EventMap[K]>
) {
  // A implementação real do useEffect será feita na camada de UI.
  // Aqui apenas retornamos a função de cleanup do EventBus.
  return EventBus.on(event, callback);
}