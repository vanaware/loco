// monorepo/utils/src/webtorrent/mod.ts
/**
 * ============================================================================
 * @loco/utils/webtorrent
 * Wrapper completo e resiliente da API WebTorrent para o Loco PWA
 * ============================================================================
 * Este módulo encapsula toda a complexidade do WebTorrent, oferecendo:
 * - Inicialização resiliente com checklist de capacidade do browser
 * - Integração automática com Service Worker para streaming P2P
 * - Armazenamento isolado no OPFS por infoHash (`/webtorrent/<hash>/`)
 * - Handshake bidirecional com SW via MessageChannel (ACK garantido)
 * - API tipada e documentada para toda a funcionalidade do WebTorrent
 * 
 * @module @loco/utils/webtorrent
 * 
 * @example
 * import { webTorrent } from '@loco/utils/webtorrent';
 * 
 * // 1. Inicializar (executa checklist + handshake com SW)
 * await webTorrent.startWebTorrent();
 * 
 * // 2. Streamar um arquivo de um Magnet URI
 * const { file, streamUrl, torrent } = await webTorrent.getTorrentFileStream(
 *   'magnet:?xt=urn:btih:...',
 *   '.mp4'
 * );
 * document.querySelector('video').src = streamUrl;
 * 
 * // 3. Monitorar progresso
 * torrent.on('download', () => {
 *   console.log(`${Math.round(torrent.progress * 100)}% baixado`);
 * });
 * 
 * // 4. Desligar ao sair
 * await webTorrent.stopWebTorrent();
 */

// ============================================================================
// DECLARAÇÕES DE TIPO (Autocontidas)
// ============================================================================

declare global {
  interface Window {
    WebTorrent: typeof WebTorrentClient;
  }
}

/**
 * Opções de inicialização do cliente WebTorrent.
 * @see https://github.com/webtorrent/webtorrent#client--new-webtorrentopts
 */
export interface WebTorrentOptions {
  /** Máximo de conexões por torrent (default: 55) */
  maxConns?: number;
  /** Node ID do DHT (default: random) */
  nodeId?: string | Uint8Array;
  /** Peer ID do protocolo Wire (default: random) */
  peerId?: string | Uint8Array;
  /** Habilita trackers (default: true) */
  tracker?: boolean | object;
  /** Habilita DHT (default: true) */
  dht?: boolean | object;
  /** Habilita BEP14 Local Service Discovery (default: true) */
  lsd?: boolean;
  /** Habilita BEP11 Peer Exchange (default: true) */
  utPex?: boolean;
  /** Habilita BEP19 Web Seeds (default: true) */
  webSeeds?: boolean;
  /** Habilita BEP29 uTP (default: true) */
  utp?: boolean;
  /** Conexões de saída durante seeding (default: true) */
  seedOutgoingConnections?: boolean;
  /** Lista de IPs para bloquear */
  blocklist?: string[] | string;
  /** Limite de download em bytes/sec (-1 = ilimitado) */
  downloadLimit?: number;
  /** Limite de upload em bytes/sec (-1 = ilimitado) */
  uploadLimit?: number;
  /** Criptografia RC4: 0=off, 1=handshake, 2=full */
  secure?: 0 | 1 | 2;
}

/**
 * Opções do chunk store (usadas internamente pelo WebTorrent).
 * O campo `rootDir` é a integração Loco com OPFS.
 */
export interface TorrentStoreOptions {
  /** FileSystemDirectoryHandle do OPFS para isolamento por infoHash */
  rootDir?: FileSystemDirectoryHandle;
  [key: string]: any;
}

/**
 * Opções ao adicionar ou fazer seed de um torrent.
 * @see https://github.com/webtorrent/webtorrent#clientaddtorrentid-opts-function-ontorrent-torrent-
 */
export interface TorrentOptions {
  /** Trackers adicionais */
  announce?: string[];
  /** Callback para parâmetros customizados ao tracker */
  getAnnounceOpts?: () => object;
  /** Web seeds adicionais */
  urlList?: string[];
  /** Máx de conexões simultâneas por web seed (default: 4) */
  maxWebConns?: number;
  /** Pasta de destino (relativa ou absoluta) */
  path?: string;
  /** Se true, não compartilha hash no DHT/PEX */
  private?: boolean;
  /** Chunk store customizado (API abstract-chunk-store) */
  store?: (chunkLength: number, storeOpts: any) => any;
  /** Se true, deleta arquivos ao destruir torrent */
  destroyStoreOnDestroy?: boolean;
  /** Número de pieces em cache na RAM (default: 20) */
  storeCacheSlots?: number;
  /** Opções customizadas do store (aqui entra o rootDir do OPFS) */
  storeOpts?: TorrentStoreOptions;
  /** Pula verificação de pieces existentes */
  skipVerify?: boolean;
  /** Bitfield pré-carregado */
  bitfield?: Uint8Array;
  /** Store pré-carregado */
  preloadedStore?: any;
  /** Estratégia de seleção: 'rarest' ou 'sequential' (default) */
  strategy?: 'rarest' | 'sequential';
  /** Intervalo entre verificações de 'noPeers' (segundos, default: 30) */
  noPeersIntervalTime?: number;
  /** Cria o torrent já pausado */
  paused?: boolean;
  /** Cria sem pieces selecionadas */
  deselect?: boolean;
  /** Auto-choke seeders quando seeding (default: true) */
  alwaysChokeSeeders?: boolean;
  /** Nome do torrent (usado ao criar/seed) */
  name?: string;
}

/**
 * Opções para criar servidor HTTP virtual (browser).
 */
export interface CreateServerOptions {
  /** ServiceWorkerRegistration ativo (OBRIGATÓRIO no browser) */
  controller: ServiceWorkerRegistration;
  /** Origin permitida ('*' por padrão, false = same-origin) */
  origin?: string;
}

/**
 * Representa uma conexão ativa com um peer (Wire Protocol).
 */
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

/**
 * Representa uma piece do torrent.
 */
export interface Piece {
  length: number;
  missing: number;
}

/**
 * Opções de slice para operações de arquivo (start/end em bytes).
 */
export interface FileSliceOptions {
  start?: number;
  end?: number;
}

/**
 * Representa um arquivo individual dentro de um torrent.
 */
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
  createReadStream(opts?: FileSliceOptions): any;
  stream(opts?: FileSliceOptions): ReadableStream;
  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array>;
  arrayBuffer(opts?: FileSliceOptions): Promise<ArrayBuffer>;
  blob(opts?: FileSliceOptions): Promise<Blob>;
  /**
   * Define a fonte de um elemento HTML para a URL de streaming.
   * Requer que `createServer` tenha sido chamado antes.
   */
  streamTo(elem: HTMLVideoElement | HTMLAudioElement | HTMLImageElement): void;
  /** URL virtual reconhecida pelo Service Worker */
  streamURL: string;
  includes(pieceIndex: number): boolean;
  /**
   * Obtém o conteúdo do arquivo como um Buffer (Uint8Array).
   */
  getBuffer(callback: (err: Error | null, buffer?: Uint8Array) => void): void;
  /**
   * Obtém o conteúdo do arquivo como um Blob.
   */
  getBlob(callback: (err: Error | null, blob?: Blob) => void): void;
  on(event: 'done' | 'stream' | 'iterator' | string, callback: (...args: any[]) => void): this;
}

/**
 * Representa um torrent ativo no cliente.
 */
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
  on(
    event:
      | 'infoHash'
      | 'metadata'
      | 'ready'
      | 'warning'
      | 'error'
      | 'idle'
      | 'done'
      | 'download'
      | 'upload'
      | 'wire'
      | 'noPeers'
      | 'verified'
      | string,
    callback: (...args: any[]) => void
  ): this;
}

/**
 * Classe real do WebTorrent (carregada via tag <script> no HTML).
 * Não deve ser instanciada diretamente - use o singleton `webTorrent`.
 */
export declare class WebTorrentClient {
  static WEBRTC_SUPPORT: boolean;
  constructor(opts?: WebTorrentOptions);
  add(torrentId: string | Uint8Array | File, opts?: TorrentOptions, onTorrent?: (torrent: Torrent) => void): Torrent;
  seed(input: File | FileList | Blob | Uint8Array | any[], opts?: TorrentOptions, onSeed?: (torrent: Torrent) => void): Torrent;
  remove(torrentId: string | Torrent, opts?: { destroyStore?: boolean }, callback?: (err?: Error) => void): Promise<void>;
  destroy(callback?: (err?: Error) => void): void;
  get(torrentId: string): Promise<Torrent | null>;
  createServer(opts: CreateServerOptions, force?: 'browser' | 'node'): any;
  throttleDownload(rate: number): void;
  throttleUpload(rate: number): void;
  torrents: Torrent[];
  downloadSpeed: number;
  uploadSpeed: number;
  progress: number;
  ratio: number;
  on(event: 'add' | 'remove' | 'torrent' | 'error' | string, callback: (...args: any[]) => void): this;
}

// ============================================================================
// INTERFACES DE RETORNO (Loco-specific)
// ============================================================================

/**
 * Retorno de `getTorrentFileStream`.
 */
export interface TorrentStreamData {
  /** Objeto do arquivo encontrado */
  file: TorrentFile;
  /** URL virtual para usar em <video>, <audio> ou <img> */
  streamUrl: string;
  /** Instância completa do torrent para monitoramento */
  torrent: Torrent;
}

/**
 * Snapshot consolidado de estatísticas de todos os torrents ativos.
 * Retornado por `webTorrent.getStats()`.
 */
export interface WebTorrentStats {
  /** Número de torrents ativos */
  activeTorrents: number;
  /** Velocidade total de download (bytes/sec) */
  downloadSpeed: number;
  /** Velocidade total de upload (bytes/sec) */
  uploadSpeed: number;
  /** Progresso agregado (0 a 1) */
  progress: number;
  /** Ratio total (uploaded / downloaded) */
  ratio: number;
  /** Total baixado em bytes (todos os torrents) */
  totalDownloaded: number;
  /** Total enviado em bytes (todos os torrents) */
  totalUploaded: number;
  /** Total de peers conectados */
  totalPeers: number;
  /** WebTorrent está pronto? */
  isReady: boolean;
  /** Service Worker confirmou handshake? */
  isSwReady: boolean;
}

/**
 * Metadados de um torrent armazenado no OPFS.
 * Retornado por `listStoredTorrents()`.
 */
export interface StoredTorrentInfo {
  infoHash: string;
  /** FileSystemDirectoryHandle da pasta do torrent */
  dirHandle: FileSystemDirectoryHandle;
  /** Lista de nomes de arquivos dentro da pasta */
  files: string[];
  /** Tamanho aproximado em bytes (soma dos arquivos) */
  size: number;
}

// ============================================================================
// CLASSE WRAPPER (Singleton)
// ============================================================================

/**
 * Facade resiliente da API WebTorrent para o Loco.
 * 
 * Características principais:
 * - Checklist de inicialização em cascata (WebRTC, OPFS, SW)
 * - Handshake bidirecional com SW via MessageChannel
 * - Armazenamento isolado no OPFS por infoHash
 * - Cleanup automático em `beforeunload` / `pagehide`
 * - Rollback de segurança em caso de falha
 * 
 * @example
 * import { webTorrent } from '@loco/utils/webtorrent';
 * 
 * if (!webTorrent.isReady) {
 *   await webTorrent.startWebTorrent();
 * }
 */
class WebTorrentManager {
  private client: WebTorrentClient | null = null;
  private isInitialized: boolean = false;
  private isSwReady: boolean = false;
  private cleanupBound: () => void;

  constructor() {
    this.cleanupBound = this.stopWebTorrent.bind(this);
  }

  // ==========================================================================
  // LIFECYCLE MANAGEMENT
  // ==========================================================================

  /**
   * LIGA o WebTorrent.
   * Executa o checklist completo de resiliência:
   * 1. Verifica `window.WebTorrent` (biblioteca carregada via <script>)
   * 2. Verifica suporte a WebRTC (obrigatório para P2P no browser)
   * 3. Instancia o cliente com opções otimizadas para PWA
   * 4. Vincula ao Service Worker via `createServer()`
   * 5. Aguarda `WEBTORRENT_ACK` via MessageChannel (timeout: 5s)
   * 6. Registra listeners de cleanup (`beforeunload`/`pagehide`)
   * 
   * Em caso de falha em qualquer etapa, faz rollback destruindo o cliente
   * para evitar estados zumbis.
   * 
   * @throws {Error} Se `window.WebTorrent` não estiver disponível
   * @throws {Error} Se WebRTC não for suportado
   * @throws {Error} Se o Service Worker não estiver ativo
   * @throws {Error} Se o SW não responder com WEBTORRENT_ACK em 5s
   */
  public async startWebTorrent(): Promise<void> {
    if (this.isInitialized) {
      console.log('[WebTorrent] Já está em execução. Ignorando chamada.');
      return;
    }

    console.log('[WebTorrent] 🚀 Iniciando checklist de resiliência...');

    if (!window.WebTorrent) {
      throw new Error(
        '[WebTorrent] Falha Crítica: Biblioteca global `window.WebTorrent` não encontrada. ' +
        'Verifique se a tag <script src="https://esm.sh/webtorrent@latest/webtorrent.min.js"> está no index.html.'
      );
    }

    if (!window.WebTorrent.WEBRTC_SUPPORT) {
      throw new Error(
        '[WebTorrent] Falha Crítica: WebRTC não é suportado neste navegador. ' +
        'O streaming P2P não funcionará.'
      );
    }

    try {
      this.client = new window.WebTorrent({
        maxConns: 30,
        webSeeds: true,
        dht: true,
        tracker: true,
        secure: 1, // RC4 apenas no handshake (equilíbrio performance/segurança)
      });
      console.log('[WebTorrent] ✅ Cliente instanciado.');
    } catch (error) {
      throw new Error(`[WebTorrent] Falha ao instanciar cliente: ${error}`);
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      if (!registration || !registration.active) {
        throw new Error('Service Worker não está registrado ou ativo.');
      }

      this.client.createServer({ controller: registration });
      console.log('[WebTorrent] ✅ Servidor vinculado ao SW.');

      await this.waitForSwAck(registration.active);

      this.isInitialized = true;
      this.isSwReady = true;

      window.addEventListener('beforeunload', this.cleanupBound);
      window.addEventListener('pagehide', this.cleanupBound);

      console.log('[WebTorrent] 🎉 Inicializado e sincronizado com o SW.');
    } catch (error) {
      console.error('[WebTorrent] ❌ Falha ao vincular ao SW. Fazendo rollback...', error);
      if (this.client) {
        this.client.destroy();
        this.client = null;
      }
      throw new Error(`[WebTorrent] Falha na inicialização: ${error}`);
    }
  }

  /**
   * DESLIGA o WebTorrent.
   * - Remove listeners de ciclo de vida
   * - Destrói todas as conexões de peer
   * - Libera recursos de rede e memória
   * - NÃO deleta arquivos do OPFS (use `clearAllTorrents()` para isso)
   */
  public async stopWebTorrent(): Promise<void> {
    if (!this.client) return;

    console.log('[WebTorrent] 🧹 Desligando e limpando recursos...');

    window.removeEventListener('beforeunload', this.cleanupBound);
    window.removeEventListener('pagehide', this.cleanupBound);

    this.client.destroy((err?: Error) => {
      if (err) console.error('[WebTorrent] Erro ao destruir cliente:', err);
      else console.log('[WebTorrent] ✅ Cliente destruído.');
    });

    this.client = null;
    this.isInitialized = false;
    this.isSwReady = false;
  }

  /**
   * Indica se o WebTorrent está pronto para uso.
   * Retorna `true` apenas se ambas as condições forem verdadeiras:
   * 1. Cliente instanciado e vinculado ao SW
   * 2. SW respondeu com WEBTORRENT_ACK
   */
  public get isReady(): boolean {
    return this.isInitialized && this.isSwReady;
  }

  /**
   * Indica se o navegador suporta WebRTC.
   */
  public get isWebRtcSupported(): boolean {
    return !!window.WebTorrent?.WEBRTC_SUPPORT;
  }

  /**
   * Retorna a instância bruta do cliente WebTorrent.
   * ⚠️ Uso avançado. Prefira os métodos do wrapper.
   * @throws {Error} Se `startWebTorrent()` não foi chamado com sucesso
   */
  public get rawClient(): WebTorrentClient {
    this.ensureInitialized();
    return this.client!;
  }

  // ==========================================================================
  // CLIENT API WRAPPERS
  // ==========================================================================

  /**
   * Adiciona um novo torrent para download.
   * Integração Loco: automaticamente cria uma pasta isolada no OPFS
   * em `/webtorrent/<infoHash>/` antes de iniciar o download.
   */
  public async add(
    torrentId: string | Uint8Array | File,
    opts?: Omit<TorrentOptions, 'storeOpts'>,
    onTorrent?: (torrent: Torrent) => void
  ): Promise<Torrent> {
    this.ensureInitialized();

    // Para Magnet URIs, extraímos infoHash antecipadamente para criar a pasta
    if (typeof torrentId === 'string' && torrentId.startsWith('magnet:')) {
      const infoHash = this.extractInfoHash(torrentId);
      if (infoHash) {
        try {
          const opfsDir = await this.getTorrentOpfsDir(infoHash);
          return this.client!.add(
            torrentId,
            { ...opts, storeOpts: { rootDir: opfsDir }, destroyStoreOnDestroy: false },
            onTorrent
          );
        } catch (err) {
          console.warn('[WebTorrent] Falha ao criar pasta OPFS, usando fallback:', err);
        }
      }
    }

    // Fallback: usa opções padrão sem OPFS
    return this.client!.add(torrentId, opts, onTorrent);
  }

  /**
   * Cria um novo torrent a partir de arquivos locais e inicia o seeding.
   */
  public async seed(
    input: File | FileList | Blob | Uint8Array | any[],
    opts?: TorrentOptions,
    onSeed?: (torrent: Torrent) => void
  ): Promise<Torrent> {
    this.ensureInitialized();
    return this.client!.seed(input, opts, onSeed);
  }

  /**
   * Remove um torrent do cliente e fecha todas as conexões.
   */
  public async remove(
    torrentId: string | Torrent,
    opts?: { destroyStore?: boolean },
    callback?: (err?: Error) => void
  ): Promise<void> {
    this.ensureInitialized();
    await this.client!.remove(torrentId, opts, callback);
  }

  /**
   * Busca um torrent na lista ativa pelo infoHash ou magnet URI.
   */
  public async get(torrentId: string): Promise<Torrent | null> {
    this.ensureInitialized();
    return await this.client!.get(torrentId);
  }

  /**
   * Define limite de velocidade de download.
   */
  public throttleDownload(rate: number): void {
    this.ensureInitialized();
    this.client!.throttleDownload(rate);
  }

  /**
   * Define limite de velocidade de upload.
   */
  public throttleUpload(rate: number): void {
    this.ensureInitialized();
    this.client!.throttleUpload(rate);
  }

  // ==========================================================================
  // CLIENT PROPERTIES (GETTERS)
  // ==========================================================================

  /** Array de todos os torrents ativos no cliente. */
  public get torrents(): Torrent[] {
    this.ensureInitialized();
    return this.client!.torrents;
  }

  /** Velocidade agregada de download (bytes/sec) */
  public get downloadSpeed(): number {
    return this.client?.downloadSpeed ?? 0;
  }

  /** Velocidade agregada de upload (bytes/sec) */
  public get uploadSpeed(): number {
    return this.client?.uploadSpeed ?? 0;
  }

  /** Progresso agregado de todos os torrents ativos (0 a 1) */
  public get progress(): number {
    return this.client?.progress ?? 0;
  }

  /** Ratio agregado (uploaded / downloaded) */
  public get ratio(): number {
    return this.client?.ratio ?? 0;
  }

  // ==========================================================================
  // TORRENT MANAGEMENT (CONVENIÊNCIA LOCO)
  // ==========================================================================

  /**
   * Adiciona um torrent e retorna dados prontos para streaming.
   * Método principal de uso no Loco. Combina:
   * 1. Criação automática de pasta OPFS isolada
   * 2. Busca do arquivo por extensão
   * 3. Retorno da URL de streaming via Service Worker
   */
  public async getTorrentFileStream(
    magnetUri: string,
    fileExtension: string = '.mp4',
    customOpts?: Omit<TorrentOptions, 'storeOpts'>
  ): Promise<TorrentStreamData> {
    this.ensureInitialized();

    const infoHash = this.extractInfoHash(magnetUri);
    if (!infoHash) {
      throw new Error('[WebTorrent] InfoHash inválido no Magnet URI.');
    }

    return new Promise((resolve, reject) => {
      this.getTorrentOpfsDir(infoHash)
        .then((opfsDir) => {
          const torrent = this.client!.add(magnetUri, {
            ...customOpts,
            storeOpts: { rootDir: opfsDir },
            destroyStoreOnDestroy: false,
          });

          torrent.on('error', (err: Error) =>
            reject(new Error(`[WebTorrent] Erro no torrent: ${err.message}`))
          );

          torrent.on('ready', () => {
            const file = torrent.files.find((f) =>
              f.name.toLowerCase().endsWith(fileExtension.toLowerCase())
            );

            if (!file) {
              reject(
                new Error(`[WebTorrent] Nenhum arquivo '${fileExtension}' encontrado em ${torrent.name}`)
              );
              return;
            }

            resolve({ file, streamUrl: file.streamURL, torrent });
          });
        })
        .catch((err) => reject(new Error(`[WebTorrent] Falha no OPFS: ${err.message}`)));
    });
  }

  /**
   * Remove um torrent e deleta seus arquivos do OPFS.
   */
  public async removeTorrentAndFiles(infoHash: string): Promise<boolean> {
    this.ensureInitialized();

    const torrent = await this.client!.get(infoHash);
    if (torrent) {
      await this.client!.remove(torrent, { destroyStore: true });
    }

    try {
      const root = await navigator.storage.getDirectory();
      const wtDir = await root.getDirectoryHandle('webtorrent', { create: false });
      const torrentDir = await wtDir.getDirectoryHandle(infoHash, { create: false });

      // Remove todos os arquivos dentro
      for await (const entry of (torrentDir as any).values()) {
        await torrentDir.removeEntry(entry.name, { recursive: true });
      }
      await wtDir.removeEntry(infoHash, { recursive: true });

      console.log(`[WebTorrent] 🗑️ Pasta OPFS removida: /webtorrent/${infoHash}/`);
      return true;
    } catch (err) {
      console.warn(`[WebTorrent] Pasta OPFS não encontrada para ${infoHash}:`, err);
      return !!torrent;
    }
  }

  /** Pausa todos os torrents ativos (para de conectar a novos peers). */
  public pauseAll(): void {
    if (!this.client) return;
    for (const torrent of this.client.torrents) {
      torrent.pause();
    }
  }

  /** Retoma todos os torrents pausados. */
  public resumeAll(): void {
    if (!this.client) return;
    for (const torrent of this.client.torrents) {
      torrent.resume();
    }
  }

  // ==========================================================================
  // OPFS & STORAGE
  // ==========================================================================

  /**
   * Retorna o handle do diretório raiz do WebTorrent no OPFS (`/webtorrent/`).
   */
  public async getOpfsRoot(create: boolean = true): Promise<FileSystemDirectoryHandle | null> {
    try {
      const root = await navigator.storage.getDirectory();
      return await root.getDirectoryHandle('webtorrent', { create });
    } catch (err) {
      console.warn('[WebTorrent] OPFS indisponível:', err);
      return null;
    }
  }

  /**
   * Retorna o handle da pasta isolada de um torrent específico.
   */
  public async getTorrentOpfsDir(
    infoHash: string,
    create: boolean = true
  ): Promise<FileSystemDirectoryHandle> {
    const root = await navigator.storage.getDirectory();
    const wtDir = await root.getDirectoryHandle('webtorrent', { create });
    return await wtDir.getDirectoryHandle(infoHash.toLowerCase(), { create });
  }

  /** Lista todos os torrents armazenados no OPFS. */
  public async listStoredTorrents(): Promise<StoredTorrentInfo[]> {
    const result: StoredTorrentInfo[] = [];
    const wtRoot = await this.getOpfsRoot(false);
    if (!wtRoot) return result;

    try {
      for await (const entry of (wtRoot as any).values()) {
        if (entry.kind === 'directory') {
          const infoHash = entry.name;
          const dirHandle = entry as FileSystemDirectoryHandle;
          const files: string[] = [];
          let size = 0;

          try {
            for await (const fileEntry of (dirHandle as any).values()) {
              if (fileEntry.kind === 'file') {
                files.push(fileEntry.name);
                try {
                  const file = await (fileEntry as FileSystemFileHandle).getFile();
                  size += file.size;
                } catch {
                  // ignora arquivos ilegíveis
                }
              }
            }
          } catch {
            // pasta ilegível, pula
          }

          result.push({ infoHash, dirHandle, files, size });
        }
      }
    } catch (err) {
      console.warn('[WebTorrent] Erro ao listar OPFS:', err);
    }

    return result;
  }

  /** Limpa todo o armazenamento do WebTorrent no OPFS. */
  public async clearAllTorrents(): Promise<number> {
    const wtRoot = await this.getOpfsRoot(false);
    if (!wtRoot) return 0;

    let count = 0;
    try {
      for await (const entry of (wtRoot as any).values()) {
        if (entry.kind === 'directory') {
          await wtRoot.removeEntry(entry.name, { recursive: true });
          count++;
        }
      }
      console.log(`[WebTorrent] 🧹 ${count} pastas de torrent removidas do OPFS.`);
    } catch (err) {
      console.error('[WebTorrent] Erro ao limpar OPFS:', err);
    }

    return count;
  }

  // ==========================================================================
  // STATISTICS & MONITORING
  // ==========================================================================

  /** Retorna um snapshot consolidado de todas as estatísticas. */
  public getStats(): WebTorrentStats {
    if (!this.client) {
      return {
        activeTorrents: 0, downloadSpeed: 0, uploadSpeed: 0, progress: 0, ratio: 0,
        totalDownloaded: 0, totalUploaded: 0, totalPeers: 0, isReady: false, isSwReady: false,
      };
    }

    let totalDownloaded = 0;
    let totalUploaded = 0;
    let totalPeers = 0;

    for (const torrent of this.client.torrents) {
      totalDownloaded += torrent.downloaded;
      totalUploaded += torrent.uploaded;
      totalPeers += torrent.numPeers;
    }

    return {
      activeTorrents: this.client.torrents.length,
      downloadSpeed: this.client.downloadSpeed,
      uploadSpeed: this.client.uploadSpeed,
      progress: this.client.progress,
      ratio: this.client.ratio,
      totalDownloaded,
      totalUploaded,
      totalPeers,
      isReady: this.isInitialized,
      isSwReady: this.isSwReady,
    };
  }

  // ==========================================================================
  // EVENT WRAPPERS (CLIENT-LEVEL)
  // ==========================================================================

  /** Registra um listener de evento no nível do cliente. */
  public on(event: 'add' | 'remove' | 'torrent' | 'error' | string, callback: (...args: any[]) => void): this {
    this.ensureInitialized();
    this.client!.on(event, callback);
    return this;
  }

  // ==========================================================================
  // MÉTODOS PRIVADOS
  // ==========================================================================

  /** Aguarda ACK do SW via MessageChannel (padrão Loco). */
  private async waitForSwAck(activeWorker: ServiceWorker): Promise<void> {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      
      const timeout = setTimeout(() => {
        channel.port1.close();
        reject(new Error('Timeout: SW não respondeu com WEBTORRENT_ACK em 5s.'));
      }, 5000);

      channel.port1.onmessage = (event) => {
        if (event.data && event.data.type === 'WEBTORRENT_ACK') {
          clearTimeout(timeout);
          channel.port1.close();
          resolve();
        }
      };

      activeWorker.postMessage({ type: 'WEBTORRENT_READY' }, [channel.port2]);
    });
  }

  /** Extrai o infoHash (case-insensitive) de um Magnet URI. */
  private extractInfoHash(magnetUri: string): string | null {
    const match = magnetUri.match(/btih:([a-zA-Z0-9]+)/i);
    return match && match[1] ? match[1].toLowerCase() : null;
  }

  /** Garante que o cliente está inicializado. */
  private ensureInitialized(): void {
    if (!this.isInitialized || !this.client) {
      throw new Error(
        '[WebTorrent] Cliente não inicializado. Chame `await webTorrent.startWebTorrent()` primeiro.'
      );
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * Instância singleton do wrapper WebTorrent.
 * Importe este objeto em qualquer parte do Loco para interagir com
 * o WebTorrent de forma tipada, resiliente e integrada ao Service Worker.
 */
export const webTorrent = new WebTorrentManager();