// /loco/monorepo/webtorrent/src/core/torrent.ts

import { TypedEventTarget } from "../utils/event-target.ts";
import { ParsedTorrent, ParsedTorrentFile } from "../utils/parse-torrent.ts";
import { ChunkStore } from "../storage/opfs-chunk-store.ts";
import { Bitfield } from "./bitfield.ts";
import { sha1 } from "../crypto/hasher.ts";
import { decode, encode, BencodeDict } from "../utils/bencode.ts";

// ============================================================================
// TIPOS DE EVENTOS
// ============================================================================

export interface TorrentEvents {
  ready: Event;
  /** Emitido quando os metadados são recebidos dinamicamente (ex: via ut_metadata de um Magnet URI) */
  metadata: CustomEvent<{ files: ParsedTorrentFile[]; length: number; name: string }>;
  download: CustomEvent<{ bytes: number }>;
  upload: CustomEvent<{ bytes: number }>;
  done: Event;
  error: CustomEvent<{ error: Error }>;
  verified: CustomEvent<{ index: number }>;
}

export interface TorrentOptions {
  store: ChunkStore;
  skipVerify?: boolean;
}

// ============================================================================
// CLASSE TORRENT
// ============================================================================

export class Torrent extends TypedEventTarget<TorrentEvents> {
  public readonly infoHash: string;
  public name: string;
  public pieceLength: number;
  public length: number;
  public files: ParsedTorrentFile[];
  
  private parsedTorrent: ParsedTorrent;
  private store: ChunkStore;
  private bitfield: Bitfield;
  private expectedPieces: Uint8Array[];
  
  private _downloaded: number = 0;
  private _uploaded: number = 0;
  private _destroyed: boolean = false;
  private _ready: boolean = false;
  private _metadataReceived: boolean = false;

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
    
    queueMicrotask(() => {
      this._init(opts.skipVerify || false).catch((err) => {
        this._onError(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  // ==========================================================================
  // GETTERS COMPUTADOS
  // ==========================================================================

  get ready(): boolean { return this._ready; }
  get destroyed(): boolean { return this._destroyed; }
  get downloaded(): number { return this._downloaded; }
  get uploaded(): number { return this._uploaded; }
  
  get progress(): number {
    if (this.length === 0) return 0;
    return this._downloaded / this.length;
  }

  get numPieces(): number { return this.expectedPieces.length; }

  get lastPieceLength(): number {
    return this.length % this.pieceLength || this.pieceLength;
  }

  // ==========================================================================
  // API PÚBLICA: INJEÇÃO TARDIA DE METADADOS (Para Magnet URIs)
  // ==========================================================================

  /**
   * Recebe o dicionário 'info' codificado em Bencode (recebido via ut_metadata)
   * e atualiza dinamicamente o estado do Torrent (arquivos, tamanho, peças).
   */
  public async setMetadata(infoBuffer: Uint8Array): Promise<boolean> {
    if (this._metadataReceived) return false; // Já temos os metadados

    try {
      const info = decode(infoBuffer) as BencodeDict;
      
      // 1. Extrair Piece Length e Pieces (Hashes)
      const pieceLength = info["piece length"] as number;
      const piecesRaw = info["pieces"];
      
      if (typeof pieceLength !== "number" || !(piecesRaw instanceof Uint8Array)) {
        throw new Error("Invalid metadata: missing piece length or pieces");
      }

      const newExpectedPieces: Uint8Array[] = [];
      for (let i = 0; i < piecesRaw.length; i += 20) {
        newExpectedPieces.push(piecesRaw.subarray(i, i + 20));
      }

      // 2. Extrair Arquivos e Tamanho Total
      const newFiles: ParsedTorrentFile[] = [];
      let totalLength = 0;
      const textDecoder = new TextDecoder();

      if (info["files"]) {
        const filesList = info["files"] as BencodeDict[];
        for (const fileDict of filesList) {
          const length = fileDict["length"] as number;
          const pathList = fileDict["path"] as (Uint8Array | string)[];
          const pathParts = pathList.map((p) => typeof p === "string" ? p : textDecoder.decode(p));
          const path = pathParts.join("/");
          const name = pathParts[pathParts.length - 1]!;
          
          newFiles.push({ path, name, length, offset: totalLength });
          totalLength += length;
        }
      } else {
        const length = info["length"] as number;
        const nameRaw = info["name"];
        const name = typeof nameRaw === "string" ? nameRaw : textDecoder.decode(nameRaw as Uint8Array);
        
        newFiles.push({ path: name, name, length, offset: 0 });
        totalLength = length;
      }

      // 3. Atualizar Estado Interno
      this.pieceLength = pieceLength;
      this.length = totalLength;
      this.files = newFiles;
      this.expectedPieces = newExpectedPieces;
      
      const nameRaw = info["name"];
      this.name = typeof nameRaw === "string" ? nameRaw : textDecoder.decode(nameRaw as Uint8Array);

      // 4. Recriar o Bitfield com o novo número de peças
      this.bitfield = new Bitfield(this.numPieces);
      this._metadataReceived = true;

      // 5. Notificar a UI
      this.emit("metadata", new CustomEvent("metadata", {
        detail: { files: this.files, length: this.length, name: this.name }
      }));

      // 6. Se o store já tiver dados (ex: retomada), verificar peças existentes
      await this._verifyExistingPieces();

      return true;
    } catch (err) {
      this._onError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }

  // ==========================================================================
  // CICLO DE VIDA E INICIALIZAÇÃO
  // ==========================================================================

  private async _init(skipVerify: boolean): Promise<void> {
    try {
      // Se já temos os metadados (ex: veio de um .torrent completo), verificamos as peças.
      // Se for Magnet URI, this.numPieces será 0, então _verifyExistingPieces não fará nada.
      if (!skipVerify && this.numPieces > 0) {
        await this._verifyExistingPieces();
      }
      this._ready = true;
      this.emit("ready");
    } catch (err) {
      this._onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async _verifyExistingPieces(): Promise<void> {
    for (let i = 0; i < this.numPieces; i++) {
      try {
        const opts = i === this.numPieces - 1 ? { length: this.lastPieceLength } : undefined;
        const buf = await this.store.get(i, opts);
        await this._verifyPiece(i, buf);
      } catch (err: any) {
        if (!err.notFound) {
          console.warn(`[Torrent] Erro ao verificar peça ${i}:`, err);
        }
      }
    }
  }

  // ==========================================================================
  // RECEBIMENTO E PERSISTÊNCIA DE DADOS
  // ==========================================================================

  public async receivePiece(index: number, buf: Uint8Array): Promise<boolean> {
    if (this._destroyed) return false;
    if (this.bitfield.get(index)) return true;
    // Se ainda não recebemos os metadados, não podemos validar nem salvar peças.
    if (!this._metadataReceived && this.numPieces === 0) return false;

    try {
      await this._verifyPiece(index, buf);
      await this.store.put(index, buf);

      this.bitfield.set(index);
      const pieceLength = index === this.numPieces - 1 ? this.lastPieceLength : this.pieceLength;
      this._downloaded += pieceLength;

      this.emit("verified", new CustomEvent("verified", { detail: { index } }));
      this.emit("download", new CustomEvent("download", { detail: { bytes: pieceLength } }));

      if (this.progress >= 1) {
        this.emit("done");
      }

      return true;
    } catch (err) {
      console.warn(`[Torrent] Peça ${index} rejeitada (hash inválido).`);
      return false;
    }
  }

  public async getPiece(index: number): Promise<Uint8Array | null> {
    if (!this.bitfield.get(index)) return null;
    try {
      const opts = index === this.numPieces - 1 ? { length: this.lastPieceLength } : undefined;
      return await this.store.get(index, opts);
    } catch (err) {
      return null;
    }
  }

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
  // MÉTODOS PRIVADOS
  // ==========================================================================

  private async _verifyPiece(index: number, buf: Uint8Array): Promise<void> {
    const expectedHashBuffer = this.expectedPieces[index];
    if (!expectedHashBuffer) {
      throw new Error(`Índice de peça ${index} fora do limite.`);
    }

    const actualHashHex = await sha1(buf);
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