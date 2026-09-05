// /loco/monorepo/webtorrent/src/mod.ts
import { TypedEventTarget } from "./utils/event-target.ts";
import { parseTorrent, type ParsedTorrent } from "./utils/parse-torrent.ts";
import { Torrent } from "./core/torrent.ts";
import { Swarm } from "./network/swarm.ts";
import { generateLocoPeerId } from "./utils/peerid.ts"; // 🔥 Substitui generateId
import { OPFSChunkStore } from "./storage/opfs-chunk-store.ts";
import { MemoryChunkStore } from "./storage/memory-chunk-store.ts";
import { encode } from "./utils/bencode.ts";
import {
  createServer,
  registerTorrentFiles,
  unregisterTorrentFiles,
  type WebTorrentServer,
} from "./server/server.ts";
import type { File } from "./core/file.ts";

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
  /**
   * URL do Service Worker que intermediará as requisições de streaming.
   * Quando fornecido, o cliente registra o SW automaticamente no
   * construtor e cria o {@link WebTorrentServer} que entrega bytes sob
   * demanda para `<video>`/`<audio>`/`<img>` via URLs
   * `…/webtorrent/<infoHash>/<fileIndex>/<name>`.
   */
  serviceWorkerUrl?: string;
  serviceWorkerScope?: string;
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
  /**
   * Servidor de streaming que entrega bytes ao `<video>` etc. via
   * Service Worker.  Criado por {@link WebTorrent.createServer}.
   */
  public server: WebTorrentServer | null = null;
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

  /**
   * Cria e retorna o {@link WebTorrentServer} associado a este cliente.
   *
   * Aceita um `ServiceWorker` (caso de produção, vindo de
   * `navigator.serviceWorker.ready.then(reg => reg.active)`) ou um
   * transporte customizado (caso de teste).  Se `serviceWorkerUrl`
   * estiver presente em {@link WebTorrentOptions}, o cliente também
   * registra o SW automaticamente — o caller só precisa passar
   * `controller` aqui.
   *
   * Registra automaticamente cada torrent adicionado no
   * {@link streamManager} para que `file.streamURL()` retorne URLs
   * servíveis.
   */
  createServer(opts: { controller?: ServiceWorker; scope?: string } = {}): WebTorrentServer {
    if (this.server) return this.server;

    const scope = opts.scope || this.opts.serviceWorkerScope || "/";
    this.server = createServer({ controller: opts.controller, scope });

    // Re-registra os torrents que já existem (caso createServer seja
    // chamado depois de add()).
    for (const torrent of this.torrents.values()) {
      const files = this._makeFileObjects(torrent, scope);
      registerTorrentFiles(torrent, files);
    }

    // Liga os eventos de add/remove do cliente para manter o
    // streamManager em sincronia sem que o caller precise se preocupar.
    this.on("torrent", (e: any) => {
      const torrent: Torrent = e.detail.torrent;
      const files = this._makeFileObjects(torrent, scope);
      registerTorrentFiles(torrent, files);
    });

    return this.server;
  }

  private _makeFileObjects(torrent: Torrent, scope: string): File[] {
    return torrent.files.map((pf, idx) =>
      new File({
        store: (torrent as any).store,
        length: pf.length,
        offset: pf.offset,
        pieceLength: torrent.pieceLength,
        name: pf.name,
        infoHash: torrent.infoHash,
        fileIndex: idx,
        scope,
      })
    );
  }

  /**
   * Inicializa o Service Worker automaticamente.  Resolve para o
   * `ServiceWorker` ativo.  Quando o ambiente não expõe
   * `navigator.serviceWorker` (testes, SSR), resolve para `null`.
   */
  async initServiceWorker(): Promise<ServiceWorker | null> {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) {
      return null;
    }
    if (!this.opts.serviceWorkerUrl) {
      return null;
    }
    const reg = await navigator.serviceWorker.register(
      this.opts.serviceWorkerUrl,
      { scope: this.opts.serviceWorkerScope || "/" },
    );
    await navigator.serviceWorker.ready;
    this.createServer({ controller: reg.active ?? undefined });
    return reg.active;
  }

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

    // Registra os arquivos no streamManager se o servidor já existe.
    if (this.server) {
      const files = this._makeFileObjects(torrent, this.server.scope);
      registerTorrentFiles(torrent, files);
    }

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

    // Remove os arquivos do streamManager.
    if (this.server) {
      unregisterTorrentFiles(infoHash);
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

    if (this.server) {
      this.server.destroy();
      this.server = null;
    }

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
export { File } from "./core/file.ts";
export { parseTorrent } from "./utils/parse-torrent.ts";
export { decodePeerId, generateLocoPeerId, LOCO_PEER_ID_PREFIX } from "./utils/peerid.ts";
export { UtMetadata } from "./extensions/ut-metadata.ts";
export { UtPexExtension, encodePexUpdate, decodePexUpdate, PexPeerFlag } from "./extensions/ut-pex.ts";
export type { ParsedTorrent } from "./utils/parse-torrent.ts";
export type { ClientInfo } from "./utils/peerid.ts";
export type { PexPeer, PexUpdate, UtPexOptions } from "./extensions/ut-pex.ts";
export { createServer, type WebTorrentServer } from "./server/server.ts";
export { streamManager, buildStreamURL, parseStreamURL } from "./server/stream-manager.ts";
