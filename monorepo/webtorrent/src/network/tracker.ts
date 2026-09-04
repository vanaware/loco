// /loco/monorepo/webtorrent/src/network/tracker.ts

/**
 * Tracker Client para descoberta de peers no Browser/Deno.
 * Substitui o 'bittorrent-tracker' do npm, focando apenas em HTTP e WebSocket.
 * 
 * @module @loco/network/tracker
 */

import { encode, decode, BencodeDict } from "../utils/bencode.ts";

export interface TrackerOptions {
  infoHash: Uint8Array; // 20 bytes
  peerId: Uint8Array;   // 20 bytes
  port?: number;
  uploaded?: number;
  downloaded?: number;
  left?: number;
  compact?: boolean;
  numwant?: number;
}

export interface TrackerAnnounceEvent {
  event?: "started" | "stopped" | "completed";
}

export interface TrackerPeer {
  ip?: string;
  port?: number;
  // Para WebSockets, podemos receber ofertas SDP diretamente
  offerId?: string;
  offer?: RTCSessionDescriptionInit;
  peerId?: string;
}

export interface TrackerResponse {
  complete?: number; // Seeders
  incomplete?: number; // Leechers
  interval?: number;
  peers: TrackerPeer[];
}

/**
 * Classe abstrata base para Trackers.
 */
export abstract class Tracker {
  protected announceUrl: string;
  protected opts: TrackerOptions;

  constructor(announceUrl: string, opts: TrackerOptions) {
    this.announceUrl = announceUrl;
    this.opts = opts;
  }

  abstract announce(event?: TrackerAnnounceEvent): Promise<TrackerResponse>;
  abstract scrape(): Promise<void>;
  abstract destroy(): void;
}

/**
 * Tracker HTTP/HTTPS (Usa fetch nativo).
 * O protocolo exige que os parâmetros binários (info_hash, peer_id) sejam 
 * codificados em URL-encoding bruto (não o padrão do encodeURIComponent).
 */
export class HttpTracker extends Tracker {
  private timeoutId: number | null = null;

  async announce(event?: TrackerAnnounceEvent): Promise<TrackerResponse> {
    const params = new URLSearchParams();
    
    // Função helper para codificar bytes brutos na URL (BitTorrent spec)
    const encodeBinary = (bytes: Uint8Array) => {
      return Array.from(bytes).map(b => String.fromCharCode(b)).join("");
    };

    params.set("info_hash", encodeBinary(this.opts.infoHash));
    params.set("peer_id", encodeBinary(this.opts.peerId));
    params.set("port", String(this.opts.port || 6881));
    params.set("uploaded", String(this.opts.uploaded || 0));
    params.set("downloaded", String(this.opts.downloaded || 0));
    params.set("left", String(this.opts.left || 0));
    params.set("compact", "1");
    params.set("numwant", String(this.opts.numwant || 80));
    
    if (event?.event) {
      params.set("event", event.event);
    }

    const url = `${this.announceUrl}?${params.toString()}`;

    try {
      const controller = new AbortController();
      this.timeoutId = setTimeout(() => controller.abort(), 15000) as unknown as number;

      const res = await fetch(url, { 
        signal: controller.signal,
        headers: { "User-Agent": "LocoWebTorrent/1.0" } 
      });

      clearTimeout(this.timeoutId!);

      if (!res.ok) {
        throw new Error(`Tracker HTTP error: ${res.status}`);
      }

      const buffer = new Uint8Array(await res.arrayBuffer());
      const decoded = decode(buffer) as BencodeDict;

      if (decoded["failure reason"]) {
        const reason = decoded["failure reason"];
        const msg = typeof reason === "string" ? reason : new TextDecoder().decode(reason as Uint8Array);
        throw new Error(`Tracker failure: ${msg}`);
      }

      return this.parsePeers(decoded);
    } catch (err) {
      if (this.timeoutId) clearTimeout(this.timeoutId);
      throw err;
    }
  }

  private parsePeers(decoded: BencodeDict): TrackerResponse {
    const peers: TrackerPeer[] = [];
    const peersData = decoded["peers"];

    if (peersData instanceof Uint8Array) {
      // Formato Compact (6 bytes por peer: 4 IP + 2 Porta)
      // Usamos '!' para afirmar ao TypeScript que o índice existe, 
      // já que sabemos que o length é múltiplo de 6.
      for (let i = 0; i < peersData.length; i += 6) {
        const ip = `${peersData[i]!}.${peersData[i + 1]!}.${peersData[i + 2]!}.${peersData[i + 3]!}`;
        const port = (peersData[i + 4]! << 8) | peersData[i + 5]!;
        peers.push({ ip, port });
      }
    } else if (Array.isArray(peersData)) {
      // Formato Dictionary (menos comum, mas suportado)
      for (const p of peersData) {
        const dict = p as BencodeDict;
        const ipRaw = dict["ip"];
        const ip = typeof ipRaw === "string" ? ipRaw : new TextDecoder().decode(ipRaw as Uint8Array);
        peers.push({ ip, port: dict["port"] as number });
      }
    }

    return {
      complete: decoded["complete"] as number | undefined,
      incomplete: decoded["incomplete"] as number | undefined,
      interval: decoded["interval"] as number | undefined,
      peers,
    };
  }

  async scrape(): Promise<void> {
    // Implementação básica de scrape (opcional para o Loco)
    throw new Error("Scrape not implemented for HTTP tracker");
  }

  destroy(): void {
    if (this.timeoutId) clearTimeout(this.timeoutId);
  }
}

/**
 * Tracker WebSocket (wss://).
 * Usa a API nativa WebSocket e JSON para comunicação.
 * Essencial para o WebTorrent no browser, pois permite a troca de ofertas SDP (WebRTC).
 */
export class WsTracker extends Tracker {
  private socket: WebSocket | null = null;
  private pendingRequests: Map<string, { resolve: Function; reject: Function }> = new Map();

  async announce(event?: TrackerAnnounceEvent): Promise<TrackerResponse> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        this.socket = new WebSocket(this.announceUrl);
        
        this.socket.onopen = () => {
          this.sendAnnounce(event, resolve, reject);
        };

        this.socket.onmessage = (msgEvent) => {
          this.handleMessage(msgEvent.data);
        };

        this.socket.onerror = (err) => {
          reject(new Error("WebSocket tracker error"));
        };

        this.socket.onclose = () => {
          reject(new Error("WebSocket tracker closed"));
        };
      } else {
        this.sendAnnounce(event, resolve, reject);
      }
    });
  }

  private sendAnnounce(event: TrackerAnnounceEvent | undefined, resolve: Function, reject: Function) {
    const requestId = crypto.randomUUID();
    this.pendingRequests.set(requestId, { resolve, reject });

    const payload = {
      action: "announce",
      info_hash: Array.from(this.opts.infoHash).map(b => String.fromCharCode(b)).join(""),
      peer_id: Array.from(this.opts.peerId).map(b => String.fromCharCode(b)).join(""),
      offers: [], // No browser, we generate WebRTC offers locally and send them here
      numwant: this.opts.numwant || 5,
      uploaded: this.opts.uploaded || 0,
      downloaded: this.opts.downloaded || 0,
      left: this.opts.left || 0,
      event: event?.event,
    };

    this.socket!.send(JSON.stringify(payload));
  }

  private handleMessage(data: string) {
    try {
      const msg = JSON.parse(data);
      
      if (msg["failure reason"]) {
        const req = this.pendingRequests.get(msg.id);
        if (req) req.reject(new Error(msg["failure reason"]));
        return;
      }

      // O tracker WS retorna peers com ofertas WebRTC pré-geradas por outros peers
      const peers: TrackerPeer[] = (msg.offers || []).map((o: any) => ({
        offerId: o.offer_id,
        offer: o.offer,
        peerId: o.peer_id,
      }));

      const response: TrackerResponse = {
        complete: msg.complete,
        incomplete: msg.incomplete,
        interval: msg.interval,
        peers,
      };

      // Notifica a promise pendente
      const req = this.pendingRequests.get(msg.id);
      if (req) {
        req.resolve(response);
        this.pendingRequests.delete(msg.id);
      }
    } catch (err) {
      console.warn("[WsTracker] Failed to parse message:", err);
    }
  }

  async scrape(): Promise<void> {
    throw new Error("Scrape not implemented for WS tracker");
  }

  destroy(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.pendingRequests.clear();
  }
}

/**
 * Factory para criar o Tracker correto baseado na URL.
 */
export function createTracker(announceUrl: string, opts: TrackerOptions): Tracker {
  if (announceUrl.startsWith("http://") || announceUrl.startsWith("https://")) {
    return new HttpTracker(announceUrl, opts);
  }
  if (announceUrl.startsWith("ws://") || announceUrl.startsWith("wss://")) {
    return new WsTracker(announceUrl, opts);
  }
  throw new Error(`Unsupported tracker protocol: ${announceUrl}`);
}