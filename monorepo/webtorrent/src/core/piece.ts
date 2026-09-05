// /loco/monorepo/webtorrent/src/core/piece.ts

/**
 * Piece interface for torrent pieces.
 * Used by File.includes() to determine if a piece belongs to a file.
 */
export interface Piece {
  index: number;
}

/**
 * Extended piece information with hash validation state.
 */
export interface PieceInfo extends Piece {
  hash?: Uint8Array;
  length: number;
  offset: number;
}
