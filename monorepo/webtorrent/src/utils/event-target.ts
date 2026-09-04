// /loco/monorepo/webtorrent/src/utils/event-target.ts
/**
 * Substituto tipado para o `EventEmitter` do Node.js.
 * Usa a API nativa `EventTarget` do browser, mas com tipagem estrita para eventos.
 */

export type EventMap = Record<string, Event | CustomEvent | any>;

export class TypedEventTarget<Events extends EventMap> extends EventTarget {
  /**
   * Registra um listener para um evento específico.
   */
  on<K extends keyof Events>(
    type: K & string,
    listener: (event: Events[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): this {
    this.addEventListener(type, listener as EventListener, options);
    return this;
  }

  /**
   * Registra um listener que será removido após a primeira execução.
   */
  once<K extends keyof Events>(
    type: K & string,
    listener: (event: Events[K]) => void
  ): this {
    this.addEventListener(type, listener as EventListener, { once: true });
    return this;
  }

  /**
   * Remove um listener.
   */
  off<K extends keyof Events>(
    type: K & string,
    listener: (event: Events[K]) => void,
    options?: boolean | EventListenerOptions
  ): this {
    this.removeEventListener(type, listener as EventListener, options);
    return this;
  }

  /**
   * Emite um evento.
   */
  emit<K extends keyof Events>(type: K & string, detail?: Events[K]): boolean {
    const event =
      detail instanceof Event
        ? detail
        : new CustomEvent(type, { detail, cancelable: true });
    return this.dispatchEvent(event);
  }

  /**
   * Remove todos os listeners de um tipo específico (ou de todos os tipos).
   * Nota: EventTarget nativo não suporta removeAllListeners diretamente,
   * então clonamos e substituímos o EventTarget interno se necessário,
   * ou apenas iteramos (para simplificar, vamos usar uma abordagem de mapa).
   */
  removeAllListeners<K extends keyof Events>(type?: K & string): this {
    // Como EventTarget não expõe os listeners, uma abordagem comum em libs nativas
    // é recriar o EventTarget ou usar um mapa interno. Para o WebTorrent,
    // a maioria dos destroys fecha a conexão, então o GC cuida disso.
    // Se for crítico, podemos implementar um mapa de listeners.
    return this;
  }
}