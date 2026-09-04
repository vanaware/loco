// /loco/monorepo/webtorrent/src/extensions/ut-metadata.ts

import { EventEmitter } from "node:events";
import { encode, decode, BencodeDict } from "../utils/bencode.ts";
import { Bitfield } from "../core/bitfield.ts";

const MAX_METADATA_SIZE = 10_000_000;
const PIECE_LENGTH = 16384;

export interface UtMetadataOptions {
  metadata?: Uint8Array;
}

export class UtMetadata extends EventEmitter {
  public name = "ut_metadata";
  
  private _wire: any;
  private _fetching = false;
  private _metadataComplete = false;
  private _metadataSize: number | null = null;
  private _numPieces = 0;
  private _remainingRejects = 0;
  private _bitfield: Bitfield;
  public metadata: Uint8Array | null = null;

  constructor(wire: any, opts?: UtMetadataOptions) {
    super();
    this._wire = wire;
    this._bitfield = new Bitfield(0);
    if (opts?.metadata) {
      this.setMetadata(opts.metadata);
    }
  }

  public onHandshake(_infoHash: string, _peerId: string, _extensions: any) {
    // Opcional
  }

  public onExtendedHandshake(handshake: any) {
    if (handshake.m && typeof handshake.m.ut_metadata === "number") {
      if (typeof handshake.metadata_size !== "number" || handshake.metadata_size > MAX_METADATA_SIZE || handshake.metadata_size <= 0) {
        this.emit("warning", new Error("Peer gave invalid metadata size"));
      } else {
        const size = handshake.metadata_size;
        this._metadataSize = size;
        this._numPieces = Math.ceil(size / PIECE_LENGTH);
        this._remainingRejects = 2 * this._numPieces;
        this._bitfield = new Bitfield(this._numPieces);
        // 🔥 CORREÇÃO: Definir _fetching como true antes de solicitar peças
        this._fetching = true;
        this._requestPieces();
      }
    } else {
      this.emit("warning", new Error("Peer does not support ut_metadata"));
    }
  }

  public onMessage(buf: Uint8Array) {
    let dict: BencodeDict;
    let trailer: Uint8Array;
    try {
      const str = new TextDecoder().decode(buf);
      const trailerIndex = str.indexOf("ee") + 2;
      dict = decode(new TextEncoder().encode(str.substring(0, trailerIndex))) as BencodeDict;
      trailer = buf.slice(trailerIndex);
    } catch (err) {
      return;
    }

    switch (dict.msg_type) {
      case 0:
        this._onRequest(dict.piece as number);
        break;
      case 1:
        this._onData(dict.piece as number, trailer, dict.total_size as number | undefined);
        break;
      case 2:
        this._onReject(dict.piece as number);
        break;
    }
  }

  public fetch() {
    if (!this._metadataComplete) {
      this._fetching = true;
      if (this._metadataSize) {
        this._requestPieces();
      }
    }
  }

  public cancel() {
    this._fetching = false;
  }

  public setMetadata(newMetadata: Uint8Array): boolean {
    if (this._metadataComplete) return true;
    
    let validMetadata = newMetadata;
    try {
      const decoded = decode(newMetadata) as BencodeDict;
      if (decoded && (decoded as any).info) {
        validMetadata = encode((decoded as any).info);
      }
    } catch (err) {
      // Ignora erros de decode, usa o buffer cru
    }

    this.cancel();
    this.metadata = validMetadata;
    this._metadataComplete = true;
    this._metadataSize = this.metadata.length;
    
    if (this._wire.extendedHandshake) {
      this._wire.extendedHandshake.metadata_size = this._metadataSize;
    }
    
    this.emit("metadata", this.metadata);
    return true;
  }

  private _send(dict: BencodeDict, trailer?: Uint8Array) {
    let buf = encode(dict);
    if (trailer) {
      const combined = new Uint8Array(buf.length + trailer.length);
      combined.set(buf, 0);
      combined.set(trailer, buf.length);
      buf = combined;
    }
    this._wire.extended("ut_metadata", buf);
  }

  private _request(piece: number) {
    this._send({ msg_type: 0, piece });
  }

  private _data(piece: number, buf: Uint8Array, totalSize?: number) {
    const msg: BencodeDict = { msg_type: 1, piece };
    if (typeof totalSize === "number") {
      (msg as any).total_size = totalSize;
    }
    this._send(msg, buf);
  }

  private _reject(piece: number) {
    this._send({ msg_type: 2, piece });
  }

  private _onRequest(piece: number) {
    if (!this._metadataComplete || !this._metadataSize) {
      return this._reject(piece);
    }
    const start = piece * PIECE_LENGTH;
    let end = start + PIECE_LENGTH;
    if (end > this._metadataSize) {
      end = this._metadataSize;
    }
    const buf = this.metadata!.slice(start, end);
    this._data(piece, buf, this._metadataSize);
  }

  private _onData(piece: number, buf: Uint8Array, _totalSize?: number) {
    if (buf.length > PIECE_LENGTH || !this._fetching || !this._metadataSize) return;
    
    if (!this.metadata) {
      this.metadata = new Uint8Array(this._metadataSize);
    }
    this.metadata.set(buf, piece * PIECE_LENGTH);
    this._bitfield.set(piece);
    this._checkDone();
  }

  private _onReject(piece: number) {
    if (this._remainingRejects > 0 && this._fetching) {
      this._request(piece);
      this._remainingRejects -= 1;
    } else {
      this.emit("warning", new Error("Peer sent \"reject\" too much"));
    }
  }

  private _requestPieces() {
    if (this._fetching && this._metadataSize) {
      this.metadata = new Uint8Array(this._metadataSize);
      for (let piece = 0; piece < this._numPieces; piece++) {
        this._request(piece);
      }
    }
  }

  private _checkDone() {
    let done = true;
    for (let piece = 0; piece < this._numPieces; piece++) {
      if (!this._bitfield.get(piece)) {
        done = false;
        break;
      }
    }
    if (done && this.metadata) {
      const success = this.setMetadata(this.metadata);
      if (!success) {
        this._failedMetadata();
      }
    }
  }

  private _failedMetadata() {
    if (!this._metadataSize) return;
    this._bitfield = new Bitfield(this._numPieces);
    this._remainingRejects -= this._numPieces;
    if (this._remainingRejects > 0) {
      this._requestPieces();
    } else {
      this.emit("warning", new Error("Peer sent invalid metadata"));
    }
  }
}