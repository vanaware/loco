// src/utils/webtorrent.ts

/**
 * ============================================================================
 * DECLARAÇÕES DE TIPO (Autocontidas para o pacote @loco/utils/webtorrent)
 * ============================================================================
 */

declare global {
  interface Window {
    WebTorrent: typeof WebTorrentClient;
  }
}

export interface WebTorrentOptions {
  maxConns?: number;
  nodeId?: string | Uint8Array;
  peerId?: string | Uint8Array;
  tracker?: boolean | object;
  dht?: boolean | object;
  lsd?: boolean;
  utPex?: boolean;
  webSeeds?: boolean;
  utp?: boolean;
  seedOutgoingConnections?: boolean;
  blocklist?: string[] | string;
  downloadLimit?: number;
  uploadLimit?: number;
  secure?: 0 | 1 | 2;
}

export interface TorrentStoreOptions {
  rootDir?: FileSystemDirectoryHandle;
  [key: string]: any;
}

export interface TorrentOptions {
  announce?: string[];
  getAnnounceOpts?: () => object;
  urlList?: string[];
  maxWebConns?: number;
  path?: string;
  private?: boolean;
  store?: (chunkLength: number, storeOpts: any) => any;
  destroyStoreOnDestroy?: boolean;
  storeCacheSlots?: number;
  storeOpts?: TorrentStoreOptions;
  skipVerify?: boolean;
  bitfield?: Uint8Array;
  preloadedStore?: any;
  strategy?: 'rarest' | 'sequential';
  noPeersIntervalTime?: number;
  paused?: boolean;
  deselect?: boolean;
  alwaysChokeSeeders?: boolean;
}

export interface Wire {
  peerId: string;
  type: 'webrtc' | 'tcpIncoming' | 'tcpOutgoing' | 'utpIncoming' | 'utpOutgoing' | 'webSeed';
  uploaded: number;
  downloaded: number;
  uploadSpeed: number;
  downloadSpeed: number;
  remoteAddress?: string;
  remotePort?: number;
  destroy(): void;
  on(event: 'close' | 'timeout' | string, callback: (...args: any[]) => void): this;
}

export interface Piece {
  length: number;
  missing: number;
}

export interface TorrentFile {
  name: string;
  path: string;
  length: number;
  size: number;
  type: string;
  downloaded: number;
  progress: number;
  select(priority?: number): void;
  deselect(): void;
  createReadStream(opts?: { start?: number; end?: number }): any;
  stream(opts?: { start?: number; end?: number }): ReadableStream;
  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array>;
  arrayBuffer(opts?: { start?: number; end?: number }): Promise<ArrayBuffer>;
  blob(opts?: { start?: number; end?: number }): Promise<Blob>;
  streamTo(elem: HTMLVideoElement | HTMLAudioElement | HTMLImageElement): void;
  streamURL: string;
  includes(pieceIndex: number): boolean;
  on(event: 'done' | 'stream' | 'iterator' | string, callback: (...args: any[]) => void): this;
}

export interface Torrent {
  name: string;
  infoHash: string;
  magnetURI: string;
  torrentFile: Uint8Array;
  torrentFileBlob: Blob;
  announce: string[];
  files: TorrentFile[];
  pieces: (Piece | null)[];
  pieceLength: number;
  lastPieceLength: number;
  timeRemaining: number;
  received: number;
  downloaded: number;
  uploaded: number;
  downloadSpeed: number;
  uploadSpeed: number;
  progress: number;
  ratio: number;
  numPeers: number;
  maxWebConns: number;
  path: string;
  ready: boolean;
  paused: boolean;
  done: boolean;
  length: number;
  created?: Date;
  createdBy?: string;
  comment?: string;
  destroy(opts?: { destroyStore?: boolean }, callback?: () => void): void;
  addPeer(peer: string | any): boolean;
  addWebSeed(urlOrConn: string | any): void;
  removePeer(peer: string | any): void;
  select(start: number, end: number, priority?: number, notify?: () => void): void;
  deselect(start: number, end: number): void;
  critical(start: number, end: number): void;
  pause(): void;
  resume(): void;
  rescanFiles(callback?: (err?: Error) => void): void;
  on(event: 'infoHash' | 'metadata' | 'ready' | 'warning' | 'error' | 'idle' | 'done' | 'download' | 'upload' | 'wire' | 'noPeers' | 'verified' | string, callback: (...args: any[]) => void): this;
}

export declare class WebTorrentClient {
  static WEBRTC_SUPPORT: boolean;
  constructor(opts?: WebTorrentOptions);
  add(torrentId: string | Uint8Array | File, opts?: TorrentOptions, onTorrent?: (torrent: Torrent) => void): Torrent;
  seed(input: File | FileList | Blob | Uint8Array | any[], opts?: TorrentOptions, onSeed?: (torrent: Torrent) => void): Torrent;
  remove(torrentId: string | Torrent, opts?: { destroyStore?: boolean }, callback?: (err?: Error) => void): Promise<void>;
  destroy(callback?: (err?: Error) => void): void;
  get(torrentId: string): Promise<Torrent | null>;
  createServer(opts: { controller: ServiceWorkerRegistration; origin?: string }, force?: 'browser' | 'node'): any;
  throttleDownload(rate: number): void;
  throttleUpload(rate: number): void;
  torrents: Torrent[];
  downloadSpeed: number;
  uploadSpeed: number;
  progress: number;
  ratio: number;
  on(event: 'add' | 'remove' | 'torrent' | 'error' | string, callback: (...args: any[]) => void): this;
}

/**
 * ============================================================================
 * LÓGICA DO SERVIÇO (Singleton)
 * ============================================================================
 */

export interface TorrentStreamData {
  file: TorrentFile;
  streamUrl: string;
  torrent: Torrent;
}

class WebTorrentManager {
  private client: WebTorrentClient | null = null;
  private isInitialized: boolean = false;
  private isSwReady: boolean = false;
  private cleanupBound: () => void;

  constructor() {
    this.cleanupBound = this.stopWebTorrent.bind(this);
  }

  /**
   * LIGA o WebTorrent. Executa o checklist de resiliência e aguarda o ACK do Service Worker via MessageChannel.
   */
  public async startWebTorrent(): Promise<void> {
    if (this.isInitialized) {
      console.log('[WebTorrent] Já está em execução. Ignorando chamada.');
      return;
    }

    console.log('[WebTorrent] 🚀 Iniciando checklist de resiliência...');

    if (!window.WebTorrent) {
      throw new Error('[WebTorrent] Falha Crítica: Biblioteca global `window.WebTorrent` não encontrada.');
    }

    if (!window.WebTorrent.WEBRTC_SUPPORT) {
      throw new Error('[WebTorrent] Falha Crítica: WebRTC não é suportado neste navegador.');
    }

    try {
      this.client = new window.WebTorrent({
        maxConns: 30,
        webSeeds: true,
        dht: true,
        tracker: true,
        secure: 1
      });
    } catch (error) {
      throw new Error(`[WebTorrent] Falha ao instanciar o cliente: ${error}`);
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      if (!registration || !registration.active) {
        throw new Error('Service Worker não está registrado ou ativo.');
      }

      this.client.createServer({ controller: registration });

      // 🔥 HANDSHAKE BIDIRECIONAL SEGURO: Usa MessageChannel (mesmo padrão do sw-utils.ts)
      await this.waitForSwAck(registration.active);

      this.isInitialized = true;
      this.isSwReady = true;
      
      window.addEventListener('beforeunload', this.cleanupBound);
      window.addEventListener('pagehide', this.cleanupBound);
      
      console.log('[WebTorrent] 🎉 Inicializado e sincronizado com o Service Worker.');
    } catch (error) {
      console.error('[WebTorrent] ❌ Falha ao vincular ao Service Worker. Desfazendo inicialização.', error);
      if (this.client) {
        this.client.destroy();
        this.client = null;
      }
      throw new Error(`[WebTorrent] Falha na inicialização: ${error}`);
    }
  }

  /**
   * DESLIGA o WebTorrent, limpando recursos e listeners.
   */
  public async stopWebTorrent(): Promise<void> {
    if (!this.client) return;

    console.log('[WebTorrent] 🧹 Desligando e limpando recursos...');
    
    window.removeEventListener('beforeunload', this.cleanupBound);
    window.removeEventListener('pagehide', this.cleanupBound);

    this.client.destroy((err?: Error) => {
      if (err) console.error('[WebTorrent] Erro ao destruir cliente:', err);
      else console.log('[WebTorrent] ✅ Cliente destruído com sucesso.');
    });

    this.client = null;
    this.isInitialized = false;
    this.isSwReady = false;
  }

  /**
   * Obtém o stream de um arquivo, isolando o armazenamento no OPFS por infoHash.
   */
  public async getTorrentFileStream(
    magnetUri: string, 
    fileExtension: string = '.mp4', 
    customOpts?: Omit<TorrentOptions, 'storeOpts'>
  ): Promise<TorrentStreamData> {
    if (!this.isInitialized || !this.client) {
      throw new Error('[WebTorrent] Cliente não está em execução. Chame startWebTorrent() primeiro.');
    }

    const infoHash = this.extractInfoHash(magnetUri);
    if (!infoHash) {
      throw new Error('[WebTorrent] InfoHash inválido no Magnet URI.');
    }

    return new Promise((resolve, reject) => {
      this.getTorrentOpfsDir(infoHash).then((opfsDir) => {
        const torrent = this.client!.add(magnetUri, {
          ...customOpts,
          storeOpts: { rootDir: opfsDir },
          destroyStoreOnDestroy: false
        });

        torrent.on('error', (err: Error) => reject(new Error(`[WebTorrent] Erro no torrent: ${err.message}`)));

        torrent.on('ready', () => {
          const file = torrent.files.find((f) => f.name.toLowerCase().endsWith(fileExtension));
          if (!file) {
            reject(new Error(`[WebTorrent] Nenhum arquivo '${fileExtension}' encontrado.`));
            return;
          }
          resolve({ file, streamUrl: file.streamURL, torrent });
        });
      }).catch((err) => reject(new Error(`[WebTorrent] Falha no OPFS: ${err.message}`)));
    });
  }

  public get isReady(): boolean {
    return this.isInitialized && this.isSwReady;
  }

  // --- Métodos Privados ---

  /**
   * Aguarda o ACK do Service Worker usando um túnel MessageChannel dedicado.
   * Isso evita colisões com outros listeners de 'message' globais do aplicativo.
   */
  private async waitForSwAck(activeWorker: ServiceWorker): Promise<void> {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      
      const timeout = setTimeout(() => {
        channel.port1.close(); // Limpeza segura do listener
        reject(new Error('Timeout: Service Worker não respondeu com WEBTORRENT_ACK em 5s.'));
      }, 5000);

      channel.port1.onmessage = (event) => {
        if (event.data && event.data.type === 'WEBTORRENT_ACK') {
          clearTimeout(timeout);
          channel.port1.close(); // Limpeza imediata ao receber a resposta
          resolve();
        }
      };

      // Envia a mensagem e transfere a port2 para o Service Worker responder
      activeWorker.postMessage({ type: 'WEBTORRENT_READY' }, [channel.port2]);
    });
  }

  private async getTorrentOpfsDir(infoHash: string): Promise<FileSystemDirectoryHandle> {
    const rootDir = await navigator.storage.getDirectory();
    const wtDir = await rootDir.getDirectoryHandle('webtorrent', { create: true });
    return await wtDir.getDirectoryHandle(infoHash, { create: true });
  }

  private extractInfoHash(magnetUri: string): string | null {
    const match = magnetUri.match(/btih:([a-zA-Z0-9]+)/i);
    return match ? match[1].toLowerCase() : null;
  }
}

// Exporta a instância Singleton
export const webTorrent = new WebTorrentManager();