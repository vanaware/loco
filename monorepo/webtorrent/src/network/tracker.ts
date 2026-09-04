// /loco/monorepo/webtorrent/src/network/tracker.ts

import { encode, decode, BencodeDict } from "../utils/bencode.ts";

export interface TrackerOptions {
  infoHash: Uint8Array;
  peerId: Uint8Array;
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

export interface TrackerResponse {
  interval: number;
  minInterval?: number;
  complete: number;
  incomplete: number;
  peers: { ip: string; port: number }[];
}

export interface Tracker {
  announce(event?: TrackerAnnounceEvent): Promise<TrackerResponse>;
  destroy(): void;
}

/**
 * Converte um Uint8Array em uma string de byte único.
 * Essencial para enviar info_hash e peer_id em URLs de trackers HTTP.
 */
function uint8ArrayToBinaryString(buffer: Uint8Array): string {
  let result = "";
  for (let i = 0; i < buffer.length; i++) {
    result += String.fromCharCode(buffer[i]!);
  }
  return result;
}

export class HttpTracker implements Tracker {
  private baseUrl: string;
  private opts: TrackerOptions;
  private abortController: AbortController | null = null;

  constructor(baseUrl: string, opts: TrackerOptions) {
    this.baseUrl = baseUrl;
    this.opts = opts;
  }

  async announce(event?: TrackerAnnounceEvent): Promise<TrackerResponse> {
    this.abortController = new AbortController();
    
    const queryParams = new URLSearchParams({
      info_hash: uint8ArrayToBinaryString(this.opts.infoHash),
      peer_id: uint8ArrayToBinaryString(this.opts.peerId),
      port: String(this.opts.port || 6881),
      uploaded: String(this.opts.uploaded || 0),
      downloaded: String(this.opts.downloaded || 0),
      left: String(this.opts.left || 0),
      compact: "1",
      numwant: String(this.opts.numwant || 50),
    });

    if (event?.event) {
      queryParams.set("event", event.event);
    }

    const url = `${this.baseUrl}?${queryParams.toString()}`;

    try {
      const response = await fetch(url, {
        signal: this.abortController.signal,
        headers: { "User-Agent": "Loco-WebTorrent/0.1.0" },
      });

      if (!response.ok) {
        throw new Error(`Tracker HTTP error: ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      const data = decode(new Uint8Array(buffer)) as BencodeDict;

      const peers: { ip: string; port: number }[] = [];
      const peersData = data["peers"];

      if (peersData instanceof Uint8Array) {
        // Formato compacto (6 bytes por peer: 4 IP + 2 Porta)
        for (let i = 0; i < peersData.length; i += 6) {
          const ip = `${peersData[i]}.${peersData[i + 1]}.${peersData[i + 2]}.${peersData[i + 3]}`;
          const port = (peersData[i + 4]! << 8) | peersData[i + 5]!;
          peers.push({ ip, port });
        }
      } else if (Array.isArray(peersData)) {
        // Formato de dicionário
        for (const p of peersData) {
          const peerDict = p as BencodeDict;
          const ipBytes = peerDict["ip"] as Uint8Array | string;
          const ip = typeof ipBytes === "string" ? ipBytes : new TextDecoder().decode(ipBytes);
          peers.push({ ip, port: peerDict["port"] as number });
        }
      }

      return {
        interval: (data["interval"] as number) || 1800,
        minInterval: data["min interval"] as number | undefined,
        complete: (data["complete"] as number) || 0,
        incomplete: (data["incomplete"] as number) || 0,
        peers,
      };
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new Error("Tracker announce aborted");
      }
      throw err;
    }
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

export class WsTracker implements Tracker {
  private url: string;
  private opts: TrackerOptions;
  private ws: WebSocket | null = null;
  private resolveQueue: Map<string, (value: TrackerResponse) => void> = new Map();

  constructor(url: string, opts: TrackerOptions) {
    this.url = url;
    this.opts = opts;
  }

  async announce(event?: TrackerAnnounceEvent): Promise<TrackerResponse> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        
        this.ws.onopen = () => {
          const msg = {
            action: "announce",
            info_hash: uint8ArrayToBinaryString(this.opts.infoHash),
            peer_id: uint8ArrayToBinaryString(this.opts.peerId),
            port: this.opts.port || 6881,
            uploaded: this.opts.uploaded || 0,
            downloaded: this.opts.downloaded || 0,
            left: this.opts.left || 0,
            compact: 1,
            numwant: this.opts.numwant || 50,
            ...(event?.event ? { event: event.event } : {}),
          };
          this.ws?.send(JSON.stringify(msg));
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.action === "announce") {
              const peers: { ip: string; port: number }[] = [];
              if (Array.isArray(data.peers)) {
                for (const p of data.peers) {
                  peers.push({ ip: p.ip || p.ipv4 || p.ipv6, port: p.port });
                }
              }
              
              const response: TrackerResponse = {
                interval: data.interval || 1800,
                complete: data.complete || 0,
                incomplete: data.incomplete || 0,
                peers,
              };
              
              resolve(response);
              this.ws?.close();
            } else if (data["failure reason"]) {
              reject(new Error(data["failure reason"]));
              this.ws?.close();
            }
          } catch (err) {
            reject(err);
            this.ws?.close();
          }
        };

        this.ws.onerror = () => {
          reject(new Error("WebSocket connection failed"));
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  destroy(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export function createTracker(announceUrl: string, opts: TrackerOptions): Tracker {
  if (announceUrl.startsWith("http://") || announceUrl.startsWith("https://")) {
    return new HttpTracker(announceUrl, opts);
  }
  if (announceUrl.startsWith("ws://") || announceUrl.startsWith("wss://")) {
    return new WsTracker(announceUrl, opts);
  }
  throw new Error(`Unsupported tracker protocol: ${announceUrl}`);
}