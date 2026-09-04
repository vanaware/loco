// /loco/monorepo/webtorrent/src/utils/errors.ts

/**
 * Classes de erro customizadas para o Loco WebTorrent.
 * Facilita debugging e tratamento de erros específicos.
 */

export class BitfieldError extends Error {
  constructor(message: string, public code: string = "BITFIELD_ERROR") {
    super(message);
    this.name = "BitfieldError";
  }
}

export class WireError extends Error {
  constructor(message: string, public code: string = "WIRE_ERROR") {
    super(message);
    this.name = "WireError";
  }
}

export class TrackerError extends Error {
  constructor(message: string, public code: string = "TRACKER_ERROR") {
    super(message);
    this.name = "TrackerError";
  }
}

export class PeerError extends Error {
  constructor(message: string, public code: string = "PEER_ERROR") {
    super(message);
    this.name = "PeerError";
  }
}

export class TorrentError extends Error {
  constructor(message: string, public code: string = "TORRENT_ERROR") {
    super(message);
    this.name = "TorrentError";
  }
}