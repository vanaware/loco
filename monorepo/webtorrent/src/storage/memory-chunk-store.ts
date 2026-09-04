// /loco/monorepo/webtorrent/src/storage/memory-chunk-store.ts

import type { ChunkStore } from "./opfs-chunk-store.ts";

export interface MemoryChunkStoreOptions {
  chunkLength: number;
  length?: number;
}

export class MemoryChunkStore implements ChunkStore {
  public chunkLength: number;
  private length: number;
  private lastChunkLength: number;
  private lastChunkIndex: number;
  private chunks: Map<number, Uint8Array> = new Map();
  private closed = false;

  constructor(opts: MemoryChunkStoreOptions) {
    this.chunkLength = opts.chunkLength;
    this.length = opts.length || Infinity;
    
    if (this.length !== Infinity) {
      this.lastChunkLength = this.length % this.chunkLength || this.chunkLength;
      this.lastChunkIndex = Math.floor(this.length / this.chunkLength);
    } else {
      this.lastChunkLength = this.chunkLength;
      this.lastChunkIndex = Infinity;
    }
  }

  async get(index: number, opts?: { offset?: number; length?: number }): Promise<Uint8Array>;
  async get(index: number, cb: (err: Error | null, buf?: Uint8Array) => void): void;
  async get(index: number, opts: { offset?: number; length?: number }, cb: (err: Error | null, buf?: Uint8Array) => void): void;
  async get(
    index: number,
    optsOrCb?: { offset?: number; length?: number } | ((err: Error | null, buf?: Uint8Array) => void),
    cb?: (err: Error | null, buf?: Uint8Array) => void
  ): Promise<Uint8Array> | void {
    const opts = typeof optsOrCb === "function" ? undefined : optsOrCb;
    const callback = typeof optsOrCb === "function" ? optsOrCb : cb;

    if (callback) {
      this._getAsync(index, opts)
        .then((buf) => callback(null, buf))
        .catch((err) => callback(err));
      return;
    }

    return this._getAsync(index, opts);
  }

  private async _getAsync(index: number, opts?: { offset?: number; length?: number }): Promise<Uint8Array> {
    if (this.closed) throw new Error("Storage is closed");
    
    const buf = this.chunks.get(index);
    if (!buf) {
      const err = new Error(`Chunk ${index} not found`);
      (err as any).notFound = true;
      throw err;
    }
    
    if (opts) {
      const offset = opts.offset || 0;
      const length = opts.length || buf.length - offset;
      return buf.subarray(offset, offset + length);
    }
    
    return buf;
  }

  async put(index: number, buf: Uint8Array, cb?: (err: Error | null) => void): void | Promise<void> {
    if (cb) {
      this._putAsync(index, buf).then(() => cb(null)).catch((err) => cb(err));
      return;
    }
    return this._putAsync(index, buf);
  }

  private async _putAsync(index: number, buf: Uint8Array): Promise<void> {
    if (this.closed) throw new Error("Storage is closed");
    
    const isLastChunk = index === this.lastChunkIndex;
    const expectedLength = isLastChunk ? this.lastChunkLength : this.chunkLength;
    
    if (buf.length !== expectedLength) {
      throw new Error(`Invalid chunk length: expected ${expectedLength}, got ${buf.length}`);
    }
    
    this.chunks.set(index, buf);
  }

  async close(cb?: (err: Error | null) => void): void | Promise<void> {
    if (cb) {
      this._closeAsync().then(() => cb(null)).catch((err) => cb(err));
      return;
    }
    return this._closeAsync();
  }

  private async _closeAsync(): Promise<void> {
    if (this.closed) throw new Error("Storage is already closed");
    this.closed = true;
    this.chunks.clear();
  }

  async destroy(cb?: (err: Error | null) => void): void | Promise<void> {
    if (cb) {
      this._destroyAsync().then(() => cb(null)).catch((err) => cb(err));
      return;
    }
    return this._destroyAsync();
  }

  private async _destroyAsync(): Promise<void> {
    this.closed = true;
    this.chunks.clear();
  }
}