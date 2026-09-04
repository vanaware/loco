// /loco/monorepo/webtorrent/src/mod.ts
import { TypedEventTarget } from "./utils/event-target.ts";
import { parseTorrent, ParsedTorrent } from "./utils/parse-torrent.ts";
import { Torrent } from "./core/torrent.ts";
import { Swarm } from "./network/swarm.ts";
import { generateLocoPeerId } from "./utils/peerid.ts"; // 🔥 Substitui generateId
import { OPFSChunkStore } from "./storage/opfs-chunk-store.ts";
import { MemoryChunkStore } from "./storage/memory-chunk-store.ts";
import { encode } from "./utils/bencode.ts";


export interface WebTorrentEvents {
  torrent: CustomEvent<{ torrent: Torrent }>;
  error: CustomEvent<{ error: Error }>;
  ready: Event;
}

export interface WebTorrentOptions {
  peerId?: Uint8Array | string; // 🔥 Aceita Uint8Array ou hex string
  maxConns?: number;
  port?: number;
  useOPFS?: boolean;
  rtcConfig?: RTCConfiguration;
}

export interface AddTorrentOptions {
  skipVerify?: boolean;
  destroyStoreOnDestroy?: boolean;
  onReady?: (torrent: Torrent) => void;
}

export class WebTorrent extends TypedEventTarget<WebTorrentEvents> {
  public readonly peerId: string;
  public readonly peerIdBuffer: Uint8Array;
  public readonly torrents: Map<string, Torrent> = new Map();
  public readonly torrentList: Torrent[] = [];
  private swarms: Map<string, Swarm> = new Map();
  private opts: WebTorrentOptions;
  private destroyed = false;
  private ready = false;

  constructor(opts: WebTorrentOptions = {}) {
    super();
    this.opts = opts;

    // 🔥 NOVO: Usa a identidade oficial do Loco ("-LO0100-") por padrão
    let peerIdBuffer: Uint8Array;
    
    if (opts.peerId) {
      if (typeof opts.peerId === "string") {
        // Converte hex string para Uint8Array
        peerIdBuffer = new Uint8Array(20);
        for (let i = 0; i < 20; i++) {
          peerIdBuffer[i] = parseInt(opts.peerId.substring(i * 2, i * 2 + 2), 16);
        }
      } else {
        peerIdBuffer = opts.peerId;
      }
    } else {
      // Gera o PeerId oficial do Loco
      peerIdBuffer = generateLocoPeerId();
    }

    this.peerIdBuffer = peerIdBuffer;
    this.peerId = Array.from(peerIdBuffer)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    queueMicrotask(() => {
      this.ready = true;
      this.emit("ready");
    });
  }

  get isReady(): boolean { return this.ready && !this.destroyed; }
  get isDestroyed(): boolean { return this.destroyed; }
  get torrentCount(): number { return this.torrents.size; }

  async add(
    torrentId: string | Uint8Array | ParsedTorrent,
    opts: AddTorrentOptions = {}
  ): Promise<Torrent> {
    if (this.destroyed) throw new Error("WebTorrent client is destroyed");

    const parsed = await parseTorrent(torrentId);

    if (this.torrents.has(parsed.infoHash)) {
      return this.torrents.get(parsed.infoHash)!;
    }

    const store = await this._createChunkStore(parsed);

    const torrent = new Torrent(parsed, {
      store,
      skipVerify: opts.skipVerify,
    });

    const swarm = new Swarm({
      infoHash: parsed.infoHashBuffer,
      peerId: this.peerIdBuffer,
      announce: parsed.announce,
      maxConns: this.opts.maxConns,
      port: this.opts.port,
      metadata: parsed.pieces.length > 0 ? encode(parsed.info) : undefined,
    });

    swarm.on("metadata", async (e: any) => {
      const metadataBuffer = e.detail.metadata;
      await torrent.setMetadata(metadataBuffer);
    });

    swarm.on("error", (e: any) => {
      this.emit("error", new CustomEvent("error", { detail: { error: e.detail.error } }));
    });

    swarm.start();

    this.torrents.set(parsed.infoHash, torrent);
    this.swarms.set(parsed.infoHash, swarm);
    this.torrentList.push(torrent);

    this.emit("torrent", new CustomEvent("torrent", { detail: { torrent } }));

    if (opts.onReady) {
      torrent.on("ready", () => opts.onReady!(torrent));
    }

    return torrent;
  }

  async remove(infoHash: string, destroyStore = false): Promise<void> {
    const torrent = this.torrents.get(infoHash);
    const swarm = this.swarms.get(infoHash);

    if (!torrent) return;

    if (swarm) {
      swarm.destroy();
      this.swarms.delete(infoHash);
    }

    await torrent.destroy(destroyStore);
    this.torrents.delete(infoHash);

    const index = this.torrentList.indexOf(torrent);
    if (index !== -1) {
      this.torrentList.splice(index, 1);
    }
  }

  async destroy(callback?: () => void): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;

    for (const [, swarm] of this.swarms) {
      swarm.destroy();
    }
    this.swarms.clear();

    for (const [, torrent] of this.torrents) {
      await torrent.destroy(false);
    }
    this.torrents.clear();
    this.torrentList.length = 0;

    if (callback) callback();
  }

  private async _createChunkStore(parsed: ParsedTorrent): Promise<any> {
    const useOPFS = this.opts.useOPFS !== false;

    if (useOPFS && globalThis.navigator?.storage?.getDirectory) {
      try {
        const rootDir = await globalThis.navigator.storage.getDirectory();
        const torrentDir = await rootDir.getDirectoryHandle(`webtorrent-${parsed.infoHash}`, { create: true });
        
        return new OPFSChunkStore({
          chunkLength: parsed.pieceLength || 16384,
          length: parsed.length || 0,
          rootDir: torrentDir,
        });
      } catch (err) {
        console.warn("[WebTorrent] OPFS not available, falling back to memory store:", err);
      }
    }

    return new MemoryChunkStore({
      chunkLength: parsed.pieceLength || 16384,
      length: parsed.length || 0,
    });
  }
}

export { Torrent } from "./core/torrent.ts";
export { Swarm } from "./network/swarm.ts";
export { Peer } from "./network/peer.ts";
export { Wire } from "./core/wire.ts";
export { parseTorrent } from "./utils/parse-torrent.ts";
export { decodePeerId, generateLocoPeerId, LOCO_PEER_ID_PREFIX } from "./utils/peerid.ts";
export { UtMetadata } from "./extensions/ut-metadata.ts";
export { UtPexExtension, encodePexUpdate, decodePexUpdate, PexPeerFlag } from "./extensions/ut-pex.ts";
export type { ParsedTorrent } from "./utils/parse-torrent.ts";
export type { ClientInfo } from "./utils/peerid.ts";
export type { PexPeer, PexUpdate, UtPexOptions } from "./extensions/ut-pex.ts";


