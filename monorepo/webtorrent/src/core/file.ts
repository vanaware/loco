// /loco/monorepo/webtorrent/src/core/file.ts

import { TypedEventTarget } from "../utils/event-target.ts";
import { Piece } from "./piece.ts";

export interface FileOptions {
  store: any; // ChunkStore interface
  length: number;
  offset: number;
  pieceLength: number;
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

  constructor(options: FileOptions) {
    super();
    this._store = options.store;
    this._length = options.length;
    this._offset = options.offset;
    this._pieceLength = options.pieceLength;
  }

  get length(): number {
    return this._length;
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

  streamURL(): string {
    // Will be implemented with Service Worker integration in Phase 4.2
    throw new Error("Not implemented");
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