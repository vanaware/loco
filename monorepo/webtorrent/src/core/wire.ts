// /loco/monorepo/webtorrent/src/core/wire.ts

import { TypedEventTarget } from "../utils/event-target.ts";
import { readUInt32BE, writeUInt32BE, concat } from "../utils/buffer.ts";
import { decode } from "../utils/bencode.ts";

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface Transport {
  send(data: Uint8Array): void;
  onMessage(handler: (data: Uint8Array) => void): void;
  close(): void;
}

export interface WireEvents {
  handshake: CustomEvent<{ peerId: Uint8Array; extensions: Uint8Array }>;
  choke: Event;
  unchoke: Event;
  interested: Event;
  "not-interested": Event;
  have: CustomEvent<{ index: number }>;
  bitfield: CustomEvent<{ bitfield: Uint8Array }>;
  request: CustomEvent<{ index: number; offset: number; length: number }>;
  piece: CustomEvent<{ index: number; offset: number; block: Uint8Array }>;
  cancel: CustomEvent<{ index: number; offset: number; length: number }>;
  extended: CustomEvent<{ id: number; payload: any }>;
  error: CustomEvent<{ error: Error }>;
}

// IDs das mensagens do protocolo BitTorrent (BEP 3)
const MSG_CHOKE = 0;
const MSG_UNCHOKE = 1;
const MSG_INTERESTED = 2;
const MSG_NOT_INTERESTED = 3;
const MSG_HAVE = 4;
const MSG_BITFIELD = 5;
const MSG_REQUEST = 6;
const MSG_PIECE = 7;
const MSG_CANCEL = 8;
const MSG_EXTENDED = 20; // BEP 10 (Extension Protocol)

const PSTR = new TextEncoder().encode("BitTorrent protocol");
const HANDSHAKE_LENGTH = 68;

// ============================================================================
// CLASSE WIRE
// ============================================================================

export class Wire extends TypedEventTarget<WireEvents> {
  private transport: Transport;
  private buffer: Uint8Array = new Uint8Array(0);
  
  // Estado do protocolo
  public amChoking: boolean = true;
  public amInterested: boolean = false;
  public peerChoking: boolean = true;
  public peerInterested: boolean = false;
  
  // Propriedades expostas para uso pelo Peer
  public peerId: string | null = null;
  public peerIdBuffer: Uint8Array | null = null;

  private handshakeSent: boolean = false;
  private handshakeReceived: boolean = false;

  constructor(transport: Transport) {
    super();
    this.transport = transport;
    this.transport.onMessage((data) => this._onData(data));
  }

  // ==========================================================================
  // HANDSHAKE
  // ==========================================================================

  public sendHandshake(infoHash: Uint8Array, peerId: Uint8Array, extensions: Uint8Array = new Uint8Array(8)): void {
    if (infoHash.length !== 20 || peerId.length !== 20 || extensions.length !== 8) {
      throw new Error("Handshake parameters must be exactly 20 bytes (infoHash/peerId) and 8 bytes (extensions).");
    }

    const handshake = new Uint8Array(HANDSHAKE_LENGTH);
    handshake[0] = 19; // pstrlen
    handshake.set(PSTR, 1); // pstr
    handshake.set(extensions, 20); // reserved
    handshake.set(infoHash, 28); // info_hash
    handshake.set(peerId, 48); // peer_id

    this.transport.send(handshake);
    this.handshakeSent = true;
  }

  // ==========================================================================
  // ENVIAR MENSAGENS (TX)
  // ==========================================================================

  public sendChoke(): void {
    this.amChoking = true;
    this._sendMessage(MSG_CHOKE);
  }

  public sendUnchoke(): void {
    this.amChoking = false;
    this._sendMessage(MSG_UNCHOKE);
  }

  public sendInterested(): void {
    this.amInterested = true;
    this._sendMessage(MSG_INTERESTED);
  }

  public sendNotInterested(): void {
    this.amInterested = false;
    this._sendMessage(MSG_NOT_INTERESTED);
  }

  public sendHave(index: number): void {
    const payload = new Uint8Array(4);
    writeUInt32BE(payload, index, 0);
    this._sendMessage(MSG_HAVE, payload);
  }

  public sendBitfield(bitfield: Uint8Array): void {
    this._sendMessage(MSG_BITFIELD, bitfield);
  }

  public sendRequest(index: number, offset: number, length: number): void {
    const payload = new Uint8Array(12);
    writeUInt32BE(payload, index, 0);
    writeUInt32BE(payload, offset, 4);
    writeUInt32BE(payload, length, 8);
    this._sendMessage(MSG_REQUEST, payload);
  }

  public sendPiece(index: number, offset: number, block: Uint8Array): void {
    const header = new Uint8Array(8);
    writeUInt32BE(header, index, 0);
    writeUInt32BE(header, offset, 4);
    this._sendMessage(MSG_PIECE, concat([header, block]));
  }

  public sendCancel(index: number, offset: number, length: number): void {
    const payload = new Uint8Array(12);
    writeUInt32BE(payload, index, 0);
    writeUInt32BE(payload, offset, 4);
    writeUInt32BE(payload, length, 8);
    this._sendMessage(MSG_CANCEL, payload);
  }

  public sendExtended(extId: number, payload: Uint8Array): void {
    const header = new Uint8Array([extId]);
    this._sendMessage(MSG_EXTENDED, concat([header, payload]));
  }

  // ==========================================================================
  // RECEBER MENSAGENS (RX)
  // ==========================================================================

  private _onData(chunk: Uint8Array): void {
    // Acumula os dados recebidos no buffer interno
    this.buffer = concat([this.buffer, chunk]);

    try {
      this._processBuffer();
    } catch (err) {
      this.emit("error", new CustomEvent("error", { detail: { error: err instanceof Error ? err : new Error(String(err)) } }));
      this.transport.close();
    }
  }

  private _processBuffer(): void {
    // 1. Processa o Handshake (se ainda não recebido)
    if (!this.handshakeReceived) {
      if (this.buffer.length >= HANDSHAKE_LENGTH) {
        const pstrlen = this.buffer[0]!;
        if (pstrlen !== 19) throw new Error(`Invalid handshake pstrlen: ${pstrlen}`);
        
        const pstr = new TextDecoder().decode(this.buffer.subarray(1, 20));
        if (pstr !== "BitTorrent protocol") throw new Error("Invalid handshake protocol string");

        const extensions = this.buffer.subarray(20, 28);
        const infoHash = this.buffer.subarray(28, 48); 
        const peerIdBuffer = this.buffer.subarray(48, 68);

        this.buffer = this.buffer.subarray(HANDSHAKE_LENGTH);
        this.handshakeReceived = true;
        
        // Salvar o peerId
        this.peerIdBuffer = peerIdBuffer;
        this.peerId = Array.from(peerIdBuffer).map((b: number) => b.toString(16).padStart(2, "0")).join("");

        this.emit("handshake", new CustomEvent("handshake", { detail: { peerId: peerIdBuffer, extensions } }));
      } else {
        return; // Espera mais dados para completar o handshake
      }
    }

    // 2. Processa mensagens do protocolo (Loop enquanto houver mensagens completas)
    while (this.buffer.length >= 4) {
      const length = readUInt32BE(this.buffer, 0);
      
      // Keep-alive (length === 0)
      if (length === 0) {
        this.buffer = this.buffer.subarray(4);
        continue;
      }

      // Verifica se o payload completo já chegou no buffer
      if (this.buffer.length < 4 + length) {
        return; // Espera mais dados
      }

      const msgId = this.buffer[4]!;
      const payload = this.buffer.subarray(5, 4 + length);

      this._handleMessage(msgId, payload);
      
      // Remove a mensagem processada do buffer
      this.buffer = this.buffer.subarray(4 + length);
    }
  }

  private _handleMessage(id: number, payload: Uint8Array): void {
    switch (id) {
      case MSG_CHOKE:
        this.peerChoking = true;
        this.emit("choke");
        break;
      case MSG_UNCHOKE:
        this.peerChoking = false;
        this.emit("unchoke");
        break;
      case MSG_INTERESTED:
        this.peerInterested = true;
        this.emit("interested");
        break;
      case MSG_NOT_INTERESTED:
        this.peerInterested = false;
        this.emit("not-interested");
        break;
      case MSG_HAVE:
        if (payload.length !== 4) throw new Error("Invalid HAVE payload length");
        this.emit("have", new CustomEvent("have", { detail: { index: readUInt32BE(payload, 0) } }));
        break;
      case MSG_BITFIELD:
        this.emit("bitfield", new CustomEvent("bitfield", { detail: { bitfield: payload } }));
        break;
      case MSG_REQUEST:
        if (payload.length !== 12) throw new Error("Invalid REQUEST payload length");
        this.emit("request", new CustomEvent("request", { 
          detail: { 
            index: readUInt32BE(payload, 0), 
            offset: readUInt32BE(payload, 4), 
            length: readUInt32BE(payload, 8) 
          } 
        }));
        break;
      case MSG_PIECE:
        if (payload.length < 8) throw new Error("Invalid PIECE payload length");
        this.emit("piece", new CustomEvent("piece", { 
          detail: { 
            index: readUInt32BE(payload, 0), 
            offset: readUInt32BE(payload, 4), 
            block: payload.subarray(8) 
          } 
        }));
        break;
      case MSG_CANCEL:
        if (payload.length !== 12) throw new Error("Invalid CANCEL payload length");
        this.emit("cancel", new CustomEvent("cancel", { 
          detail: { 
            index: readUInt32BE(payload, 0), 
            offset: readUInt32BE(payload, 4), 
            length: readUInt32BE(payload, 8) 
          } 
        }));
        break;
      case MSG_EXTENDED:
        if (payload.length < 1) throw new Error("Invalid EXTENDED payload length");
        const extId = payload[0]!;
        const extPayload = payload.subarray(1);
        
        if (extId === 0) {
          // Extended handshake
          try {
            const handshake = decode(extPayload) as any;
            this.emit("extended", new CustomEvent("extended", { detail: { id: 0, payload: handshake } }));
          } catch {
            this._debug("Failed to parse extended handshake");
          }
        } else {
          this.emit("extended", new CustomEvent("extended", { detail: { id: extId, payload: extPayload } }));
        }
        break;
      default:
        this._debug(`Mensagem desconhecida recebida: ID ${id}`);
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private _sendMessage(id: number, payload: Uint8Array = new Uint8Array(0)): void {
    const length = payload.length + 1; // +1 para o byte do ID
    const buf = new Uint8Array(4 + length);
    
    writeUInt32BE(buf, length, 0);
    buf[4] = id;
    buf.set(payload, 5);
    
    this.transport.send(buf);
  }

  public destroy(): void {
    this.transport.close();
  }

  private _debug(msg: string): void {
    console.debug(`[Wire] ${msg}`);
  }
}