// /loco/monorepo/webtorrent/src/core/file.ts

import { TypedEventTarget } from "../utils/event-target.ts";
import { Piece } from "./piece.ts";
import { buildStreamURL } from "../server/stream-manager.ts";

export interface FileOptions {
  store: any; // ChunkStore interface
  length: number;
  offset: number;
  pieceLength: number;
  /** Nome do arquivo (ex: "movie.mp4"). Usado em {@link streamURL}. */
  name?: string;
  /** Identificador do torrent ao qual este arquivo pertence. */
  infoHash?: string;
  /** Índice do arquivo dentro do torrent (0-based). */
  fileIndex?: number;
  /** Escopo do Service Worker (ex: "/"). Usado por {@link streamURL}. */
  scope?: string;
}

export class File extends TypedEventTarget<{
  stream: CustomEvent<ReadableStream>;
  iterator: CustomEvent<AsyncIterable<Uint8Array>>;
  done: CustomEvent<void>;
}> {
  private _store: any;
  private _length: number;
  private _offset: number;
  private _pieceLength: number;
  private _name: string;
  private _infoHash?: string;
  private _fileIndex?: number;
  private _scope: string;

  constructor(options: FileOptions) {
    super();
    this._store = options.store;
    this._length = options.length;
    this._offset = options.offset;
    this._pieceLength = options.pieceLength;
    this._name = options.name ?? "file";
    this._infoHash = options.infoHash;
    this._fileIndex = options.fileIndex;
    this._scope = options.scope ?? "/";
  }

  get length(): number {
    return this._length;
  }

  get name(): string {
    return this._name;
  }

  get path(): string {
    return this._name;
  }

  createReadStream(): ReadableStream<Uint8Array> {
    // Implementation will be added in Phase 4.1
    throw new Error("Not implemented");
  }

  stream(): ReadableStream<Uint8Array> {
    return this.createReadStream();
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of this[Symbol.asyncIterator]()) {
      chunks.push(chunk);
    }
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const buffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }
    return buffer.buffer;
  }

  async blob(): Promise<Blob> {
    const buffer = await this.arrayBuffer();
    return new Blob([buffer]);
  }

  async getBlobURL(): Promise<string> {
    const blob = await this.blob();
    return URL.createObjectURL(blob);
  }

  streamTo(element: HTMLMediaElement): void {
    const url = this.streamURL();
    element.src = url;
    element.load();

    element.addEventListener("ended", () => {
      URL.revokeObjectURL(url);
    });
  }

  /**
   * Retorna a URL virtual servida pelo Service Worker para fazer
   * streaming deste arquivo.
   *
   * O formato é: `<scope>webtorrent/<infoHash>/<fileIndex>/<encodedName>`.
   *
   * Requer que o {@link WebTorrent.server} tenha sido criado via
   * `client.createServer({ controller })` e que o arquivo tenha sido
   * registrado no {@link streamManager} (o que acontece automaticamente
   * quando se usa `client.createServer`).
   *
   * @throws Error se `infoHash` ou `fileIndex` não foram fornecidos ao
   *   construtor (o que acontece automaticamente quando se cria os
   *   arquivos via `WebTorrent`).
   */
  streamURL(): string {
    if (!this._infoHash || this._fileIndex === undefined) {
      throw new Error(
        "infoHash and fileIndex are required to generate streamURL. " +
        "Create files via WebTorrent client (client.createServer + add).",
      );
    }
    return buildStreamURL(this._scope, this._infoHash, this._fileIndex, this.name);
  }

  select(): void {
    // Implementation for piece selection
  }

  deselect(): void {
    // Implementation for deselecting pieces
  }

  includes(piece: Piece): boolean {
    const start = piece.index * this._pieceLength;
    const end = start + this._pieceLength;
    return (start >= this._offset && start < this._offset + this._length) ||
           (end > this._offset && end <= this._offset + this._length);
  }

  [Symbol.asyncIterator](): AsyncIterable<Uint8Array> {
    // Implementation will be added in Phase 4.1
    throw new Error("Not implemented");
  }
}