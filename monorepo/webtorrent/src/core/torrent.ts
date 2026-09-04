// /loco/monorepo/webtorrent/src/core/torrent.ts

import { TypedEventTarget } from "../utils/event-target.ts";
import { ParsedTorrent } from "../utils/parse-torrent.ts";
import { ChunkStore } from "../storage/opfs-chunk-store.ts";
import { Bitfield } from "./bitfield.ts";
import { sha1 } from "../crypto/hasher.ts";

// ============================================================================
// TIPOS DE EVENTOS
// ============================================================================

export interface TorrentEvents {
  ready: Event;
  download: CustomEvent<{ bytes: number }>;
  upload: CustomEvent<{ bytes: number }>;
  done: Event;
  error: CustomEvent<{ error: Error }>;
  verified: CustomEvent<{ index: number }>;
}

export interface TorrentOptions {
  store: ChunkStore;
  skipVerify?: boolean; // Pula a verificação de peças existentes no store (útil para downloads novos)
}

// ============================================================================
// CLASSE TORRENT
// ============================================================================

/**
 * O "cérebro" do download. Orquestra o estado das peças, validação criptográfica
 * e persistência via ChunkStore.
 */
export class Torrent extends TypedEventTarget<TorrentEvents> {
  public readonly infoHash: string;
  public readonly name: string;
  public readonly pieceLength: number;
  public readonly length: number;
  public readonly files: ParsedTorrent["files"];
  
  private parsedTorrent: ParsedTorrent;
  private store: ChunkStore;
  private bitfield: Bitfield;
  private expectedPieces: Uint8Array[]; // Hashes SHA-1 esperados para cada peça
  
  private _downloaded: number = 0;
  private _uploaded: number = 0;
  private _destroyed: boolean = false;
  private _ready: boolean = false;

  constructor(parsedTorrent: ParsedTorrent, opts: TorrentOptions) {
    super();
    this.parsedTorrent = parsedTorrent;
    this.store = opts.store;
    
    this.infoHash = parsedTorrent.infoHash;
    this.name = parsedTorrent.name || "Unknown";
    this.pieceLength = parsedTorrent.pieceLength;
    this.length = parsedTorrent.length;
    this.files = parsedTorrent.files;
    
    this.bitfield = new Bitfield(parsedTorrent.pieces.length);
    this.expectedPieces = parsedTorrent.pieces;
    
    // 🔥 CORREÇÃO: Deferimos a inicialização para a próxima microtask.
    // Isso garante que o código chamador tenha tempo de registrar listeners 
    // de evento (como 'ready' ou 'error') de forma síncrona após a construção,
    // evitando race conditions onde o evento é emitido antes do listener ser registrado.
    queueMicrotask(() => {
      this._init(opts.skipVerify || false).catch((err) => {
        this._onError(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  // ==========================================================================
  // GETTERS COMPUTADOS (Propriedades em tempo real)
  // ==========================================================================

  get ready(): boolean {
    return this._ready;
  }

  get destroyed(): boolean {
    return this._destroyed;
  }

  get downloaded(): number {
    return this._downloaded;
  }

  get uploaded(): number {
    return this._uploaded;
  }

  get progress(): number {
    if (this.length === 0) return 0;
    return this._downloaded / this.length;
  }

  get numPieces(): number {
    return this.expectedPieces.length;
  }

  get lastPieceLength(): number {
    return this.length % this.pieceLength || this.pieceLength;
  }

  // ==========================================================================
  // CICLO DE VIDA E INICIALIZAÇÃO
  // ==========================================================================

  private async _init(skipVerify: boolean): Promise<void> {
    try {
      if (!skipVerify) {
        await this._verifyExistingPieces();
      }
      this._ready = true;
      this.emit("ready");
    } catch (err) {
      this._onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Verifica peças que já podem existir no ChunkStore (ex: retomada de download via OPFS).
   */
  private async _verifyExistingPieces(): Promise<void> {
    for (let i = 0; i < this.numPieces; i++) {
      try {
        const opts = i === this.numPieces - 1 ? { length: this.lastPieceLength } : undefined;
        const buf = await this.store.get(i, opts);
        await this._verifyPiece(i, buf);
      } catch (err: any) {
        // Se a peça não existe no store (notFound), apenas ignoramos e seguimos.
        if (!err.notFound) {
          console.warn(`[Torrent] Erro ao verificar peça ${i}:`, err);
        }
      }
    }
  }

  // ==========================================================================
  // API PÚBLICA (Recebimento e Persistência de Dados)
  // ==========================================================================

  /**
   * Recebe um chunk de dados de um peer/webseed, valida e persiste no store.
   * Este é o método que o módulo de Rede (Wire/Peer) chamará ao receber dados.
   */
  public async receivePiece(index: number, buf: Uint8Array): Promise<boolean> {
    if (this._destroyed) return false;
    if (this.bitfield.get(index)) return true; // Já temos essa peça

    try {
      // 1. Validação Criptográfica (SHA-1)
      await this._verifyPiece(index, buf);

      // 2. Persistência no ChunkStore
      await this.store.put(index, buf);

      // 3. Atualização de Estado
      this.bitfield.set(index);
      const pieceLength = index === this.numPieces - 1 ? this.lastPieceLength : this.pieceLength;
      this._downloaded += pieceLength;

      // 4. Notificação
      this.emit("verified", new CustomEvent("verified", { detail: { index } }));
      this.emit("download", new CustomEvent("download", { detail: { bytes: pieceLength } }));

      if (this.progress >= 1) {
        this.emit("done");
      }

      return true;
    } catch (err) {
      // Peça inválida ou corrompida. O módulo de rede deve desconectar o peer que a enviou.
      console.warn(`[Torrent] Peça ${index} rejeitada (hash inválido).`);
      return false;
    }
  }

  /**
   * Lê uma peça do ChunkStore (útil para uploading para outros peers ou streaming).
   */
  public async getPiece(index: number): Promise<Uint8Array | null> {
    if (!this.bitfield.get(index)) return null;
    try {
      const opts = index === this.numPieces - 1 ? { length: this.lastPieceLength } : undefined;
      return await this.store.get(index, opts);
    } catch (err) {
      return null;
    }
  }

  /**
   * Destrói o torrent, fechando o store e liberando recursos.
   */
  public async destroy(destroyStore: boolean = false): Promise<void> {
    if (this._destroyed) return;
    this._destroyed = true;
    
    try {
      if (destroyStore) {
        await this.store.destroy();
      } else {
        await this.store.close();
      }
    } catch (err) {
      console.warn("[Torrent] Erro ao fechar store:", err);
    }
  }

  // ==========================================================================
  // MÉTODOS PRIVADOS (Validação e Erros)
  // ==========================================================================

  private async _verifyPiece(index: number, buf: Uint8Array): Promise<void> {
    const expectedHashBuffer = this.expectedPieces[index];
    if (!expectedHashBuffer) {
      throw new Error(`Índice de peça ${index} fora do limite.`);
    }

    // Calcula o SHA-1 do buffer recebido
    const actualHashHex = await sha1(buf);
    
    // Converte o hash esperado (Uint8Array de 20 bytes) para hex para comparação
    const expectedHashHex = Array.from(expectedHashBuffer)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (actualHashHex !== expectedHashHex) {
      throw new Error(`Hash mismatch na peça ${index}.`);
    }
  }

  private _onError(err: Error): void {
    this.emit("error", new CustomEvent("error", { detail: { error: err } }));
  }
}