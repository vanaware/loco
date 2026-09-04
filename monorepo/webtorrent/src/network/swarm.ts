// /loco/monorepo/webtorrent/src/network/swarm.ts

import { TypedEventTarget } from "../utils/event-target.ts";
import { Peer } from "./peer.ts";
import { createTracker, Tracker, TrackerOptions, TrackerResponse } from "./tracker.ts";

export interface SwarmEvents {
  peer: CustomEvent<{ peer: Peer; source: string }>;
  wire: CustomEvent<{ wire: any; addr: string }>;
  error: CustomEvent<{ error: Error }>;
  warning: CustomEvent<{ error: Error }>;
  trackerAnnounce: Event;
  noPeers: CustomEvent<{ source: string }>;
}

export interface SwarmOptions {
  infoHash: Uint8Array;
  peerId: Uint8Array;
  announce: string[];
  maxConns?: number;
  port?: number;
  wrtc?: typeof RTCPeerConnection; // 🔥 CORREÇÃO: Permitir injeção de mock para testes
}

interface QueuedPeer {
  addr: string;
  retries: number;
  timeoutId?: number;
}

const RECONNECT_WAIT = [1000, 5000, 15000];
const MAX_QUEUED_PEERS = 200;

export class Swarm extends TypedEventTarget<SwarmEvents> {
  public readonly infoHash: Uint8Array;
  public readonly peerId: Uint8Array;
  
  public readonly peers: Map<string, Peer> = new Map();
  private queue: QueuedPeer[] = [];
  private trackers: Tracker[] = [];
  private maxConns: number;
  private wrtc?: typeof RTCPeerConnection; // 🔥 CORREÇÃO
  
  public destroyed = false;
  private paused = false;

  constructor(opts: SwarmOptions) {
    super();
    this.infoHash = opts.infoHash;
    this.peerId = opts.peerId;
    this.maxConns = opts.maxConns || 55;
    this.wrtc = opts.wrtc; // 🔥 CORREÇÃO

    for (const announceUrl of opts.announce) {
      try {
        const trackerOpts: TrackerOptions = {
          infoHash: opts.infoHash,
          peerId: opts.peerId,
          port: opts.port || 6881,
        };
        const tracker = createTracker(announceUrl, trackerOpts);
        this.trackers.push(tracker);
      } catch (err) {
        this.emit("warning", new CustomEvent("warning", {
          detail: { error: err instanceof Error ? err : new Error(String(err)) }
        }));
      }
    }
  }

  public start(): void {
    if (this.destroyed) return;

    for (const tracker of this.trackers) {
      tracker.announce({ event: "started" }).then((response: TrackerResponse) => {
        this._onTrackerResponse(response, tracker);
      }).catch((err: Error) => {
        this.emit("warning", new CustomEvent("warning", {
          detail: { error: err }
        }));
      });
    }
  }

  public addPeer(addr: string): boolean {
    if (this.destroyed || this.paused) return false;
    if (this.peers.has(addr)) return false;
    if (this.peers.size >= this.maxConns) {
      if (this.queue.length < MAX_QUEUED_PEERS) {
        this.queue.push({ addr, retries: 0 });
      }
      return false;
    }

    this._connectPeer(addr);
    return true;
  }

  public removePeer(addr: string): void {
    const peer = this.peers.get(addr);
    if (peer) {
      peer.destroy();
      this.peers.delete(addr);
      this._drain();
    }
  }

  public pause(): void {
    this.paused = true;
  }

  public resume(): void {
    this.paused = false;
    this._drain();
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    for (const queued of this.queue) {
      if (queued.timeoutId) clearTimeout(queued.timeoutId);
    }
    this.queue = [];

    for (const [, peer] of this.peers) {
      peer.destroy();
    }
    this.peers.clear();

    for (const tracker of this.trackers) {
      tracker.destroy();
    }
    this.trackers = [];
  }

  private _onTrackerResponse(response: TrackerResponse, _tracker: Tracker): void {
    this.emit("trackerAnnounce");

    if (response.peers.length === 0) {
      this.emit("noPeers", new CustomEvent("noPeers", { detail: { source: "tracker" } }));
      return;
    }

    for (const peerInfo of response.peers) {
      if (peerInfo.ip && peerInfo.port) {
        const addr = `${peerInfo.ip}:${peerInfo.port}`;
        this.addPeer(addr);
      }
    }
  }

  private _connectPeer(addr: string): void {
    if (this.destroyed || this.paused) return;
    if (this.peers.has(addr)) return;

    const peer = new Peer({
      initiator: true,
      infoHash: this.infoHash,
      peerId: this.peerId,
      wrtc: this.wrtc, // 🔥 CORREÇÃO: Passar o mock para o Peer
    });

    this.peers.set(addr, peer);

    peer.on("connect", () => {
      this.emit("peer", new CustomEvent("peer", { detail: { peer, source: "tracker" } }));
    });

    peer.on("handshake", (e) => {
      if (peer.wire) {
        this.emit("wire", new CustomEvent("wire", {
          detail: { wire: peer.wire, addr }
        }));
      }
    });

    peer.on("error", (e) => {
      this._onPeerError(addr, e.detail.error);
    });

    peer.on("close", () => {
      this._onPeerClose(addr);
    });
  }

  private _onPeerError(addr: string, error: Error): void {
    this.emit("warning", new CustomEvent("warning", { detail: { error } }));
    this.peers.delete(addr);
    this._drain();
  }

  private _onPeerClose(addr: string): void {
    this.peers.delete(addr);

    const queued = this.queue.find(q => q.addr === addr);
    const retries = queued ? queued.retries : 0;

    if (retries < RECONNECT_WAIT.length && !this.destroyed && !this.paused) {
      const waitMs = RECONNECT_WAIT[retries]!;
      const timeoutId = setTimeout(() => {
        if (!this.destroyed && !this.paused) {
          this._connectPeer(addr);
        }
      }, waitMs) as unknown as number;

      if (!queued) {
        this.queue.push({ addr, retries: retries + 1, timeoutId });
      } else {
        queued.retries = retries + 1;
        queued.timeoutId = timeoutId;
      }
    }

    this._drain();
  }

  private _drain(): void {
    if (this.destroyed || this.paused) return;

    while (this.peers.size < this.maxConns && this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        if (next.timeoutId) clearTimeout(next.timeoutId);
        this._connectPeer(next.addr);
      }
    }
  }
}