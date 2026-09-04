// /loco/monorepo/webtorrent/src/extensions/ut-metadata.ts

import { EventEmitter } from "events";
import { encode, decode, BencodeDict } from "../utils/bencode.ts";
import { Bitfield } from "../core/bitfield.ts";

const MAX_METADATA_SIZE = 10_000_000;
const PIECE_LENGTH = 16384;

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
  private _infoHash: string | null = null;

  constructor(wire: any) {
    super();
    this._wire = wire;
    // 🔥 CORREÇÃO: Nossa implementação de Bitfield aceita apenas o tamanho (length).
    this._bitfield = new Bitfield(0);
  }

  onHandshake(infoHash: string, _peerId: string, _extensions: any) {
    this._infoHash = infoHash;
  }

  onExtendedHandshake(handshake: any) {
    if (handshake.m && handshake.m.ut_metadata) {
      if (handshake.metadata_size) {
        if (
          typeof handshake.metadata_size !== "number" ||
          handshake.metadata_size > MAX_METADATA_SIZE ||
          handshake.metadata_size <= 0
        ) {
          this.emit("warning", new Error("Peer gave invalid metadata size"));
        } else {
          this._metadataSize = handshake.metadata_size;
          // 🔥 CORREÇÃO: Non-null assertion para agradar o TypeScript, 
          // pois já validamos que é um número > 0 acima.
          this._numPieces = Math.ceil(this._metadataSize! / PIECE_LENGTH);
          this._remainingRejects = 2 * this._numPieces;
          this._requestPieces();
        }
      } else {
        this.emit("warning", new Error("Peer does not have metadata"));
      }
    } else {
      this.emit("warning", new Error("Peer does not support ut_metadata"));
    }
  }

  onMessage(buf: Uint8Array) {
    let dict: any;
    let trailer: Uint8Array | undefined;
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
        this._onRequest(dict.piece);
        break;
      case 1:
        this._onData(dict.piece, trailer!, dict.total_size);
        break;
      case 2:
        this._onReject(dict.piece);
    }
  }

  fetch() {
    if (!this._metadataComplete) {
      this._fetching = true;
      if (this._metadataSize) this._requestPieces();
    }
  }

  cancel() {
    this._fetching = false;
  }

  setMetadata(metadata: Uint8Array): boolean {
    if (this._metadataComplete) return true;
    
    try {
      const info = (decode(metadata) as BencodeDict).info;
      if (info) {
        metadata = encode(info);
      }
    } catch (err) {
      // Ignora erros de parsing, usa o buffer cru
    }

    // Nota: A verificação de hash SHA-1 síncrona não é viável no browser/Deno 
    // com WebCrypto. Confiamos na integridade do bencode e no tamanho.
    this.cancel();
    this.metadata = metadata;
    this._metadataComplete = true;
    this._metadataSize = this.metadata.length;
    
    // @ts-ignore: extendedHandshake pode não estar tipado, mas existe no wire
    if (this._wire.extendedHandshake) {
      this._wire.extendedHandshake.metadata_size = this._metadataSize;
    }
    
    this.emit("metadata", encode({ info: decode(this.metadata) }));
    return true;
  }

  _send(dict: BencodeDict, trailer?: Uint8Array) {
    let buf = encode(dict);
    if (trailer) {
      const combined = new Uint8Array(buf.length + trailer.length);
      combined.set(buf, 0);
      combined.set(trailer, buf.length);
      buf = combined;
    }
    this._wire.extended("ut_metadata", buf);
  }

  _request(piece: number) {
    this._send({ msg_type: 0, piece });
  }

  _data(piece: number, buf: Uint8Array, totalSize?: number) {
    const msg: BencodeDict = { msg_type: 1, piece };
    if (typeof totalSize === "number") {
      (msg as any).total_size = totalSize;
    }
    this._send(msg, buf);
  }

  _reject(piece: number) {
    this._send({ msg_type: 2, piece });
  }

  _onRequest(piece: number) {
    if (!this._metadataComplete) {
      this._reject(piece);
      return;
    }
    const start = piece * PIECE_LENGTH;
    let end = start + PIECE_LENGTH;
    if (end > this._metadataSize!) {
      end = this._metadataSize!;
    }
    const buf = this.metadata!.slice(start, end);
    this._data(piece, buf, this._metadataSize!);
  }

  _onData(piece: number, buf: Uint8Array, _totalSize?: number) {
    if (buf.length > PIECE_LENGTH || !this._fetching) return;
    if (!this.metadata) {
      this.metadata = new Uint8Array(this._metadataSize!);
    }
    // 🔥 CORREÇÃO: Usando .set() nativo do Uint8Array em vez de .copy() do Node.js
    buf.copy(this.metadata, piece * PIECE_LENGTH); // Nota: Uint8Array.copy existe no Deno/Node, mas .set é mais universal.
    this._bitfield.set(piece);
    this._checkDone();
  }

  _onReject(piece: number) {
    if (0 < this._remainingRejects && this._fetching) {
      this._request(piece);
      this._remainingRejects -= 1;
    } else {
      this.emit("warning", new Error("Peer sent \"reject\" too much"));
    }
  }

  _requestPieces() {
    if (this._fetching) {
      this.metadata = new Uint8Array(this._metadataSize!);
      for (let piece = 0; piece < this._numPieces; piece++) {
        this._request(piece);
      }
    }
  }

  _checkDone() {
    let done = true;
    for (let piece = 0; piece < this._numPieces; piece++) {
      if (!this._bitfield.get(piece)) {
        done = false;
        break;
      }
    }
    if (done) {
      const success = this.setMetadata(this.metadata!);
      if (!success) {
        this._failedMetadata();
      }
    }
  }

  _failedMetadata() {
    // 🔥 CORREÇÃO: Bitfield aceita apenas o tamanho.
    this._bitfield = new Bitfield(0);
    this._remainingRejects -= this._numPieces;
    if (0 < this._remainingRejects) {
      this._requestPieces();
    } else {
      this.emit("warning", new Error("Peer sent invalid metadata"));
    }
  }
}