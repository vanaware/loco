// /loco/monorepo/webtorrent/tests/torrent_test.ts

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { Torrent } from "../src/core/torrent.ts";
import { MemoryChunkStore } from "../src/storage/memory-chunk-store.ts";
import { sha1 } from "../src/crypto/hasher.ts";
import { ParsedTorrent } from "../src/utils/parse-torrent.ts";

// Helper para criar um ParsedTorrent fake com peças reais
async function createFakeParsedTorrent(): Promise<ParsedTorrent> {
  const pieceLength = 1024;
  const piece1 = new Uint8Array(pieceLength).fill(1);
  const piece2 = new Uint8Array(pieceLength).fill(2);
  
  const hash1Hex = await sha1(piece1);
  const hash2Hex = await sha1(piece2);
  
  const hashToBytes = (hex: string) => {
    const bytes = new Uint8Array(20);
    for (let i = 0; i < 20; i++) {
      bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  };

  return {
    infoHash: "0".repeat(40),
    infoHashBuffer: new Uint8Array(20),
    name: "Fake Torrent",
    announce: [],
    urlList: [],
    peerAddresses: [],
    files: [{ path: "fake.bin", name: "fake.bin", length: 2048, offset: 0 }],
    length: 2048,
    pieceLength,
    pieces: [hashToBytes(hash1Hex), hashToBytes(hash2Hex)],
    info: {},
    magnetURI: "",
  };
}

Deno.test("torrent: initializes and emits 'ready'", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => {
    torrent.on("ready", () => resolve());
  });

  assertEquals(torrent.ready, true);
  assertEquals(torrent.progress, 0);
  assertEquals(torrent.numPieces, 2);
});

Deno.test("torrent: receives valid piece, updates bitfield and emits events", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  const validPiece = new Uint8Array(parsed.pieceLength).fill(1);
  
  let downloadedBytes = 0;
  let verifiedIndex = -1;
  
  torrent.on("download", (e) => { downloadedBytes += e.detail.bytes; });
  torrent.on("verified", (e) => { verifiedIndex = e.detail.index; });

  const success = await torrent.receivePiece(0, validPiece);

  assertEquals(success, true);
  assertEquals(downloadedBytes, parsed.pieceLength);
  assertEquals(verifiedIndex, 0);
  assertEquals(torrent.progress, 0.5); // 1 de 2 peças
});

Deno.test("torrent: rejects piece with invalid hash", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  const invalidPiece = new Uint8Array(parsed.pieceLength).fill(99); // Dados errados
  
  const success = await torrent.receivePiece(0, invalidPiece);

  assertEquals(success, false);
  assertEquals(torrent.progress, 0); // Não deve ter mudado
});

Deno.test("torrent: emits 'done' when all pieces are received", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  const piece1 = new Uint8Array(parsed.pieceLength).fill(1);
  const piece2 = new Uint8Array(parsed.pieceLength).fill(2);

  let doneEmitted = false;
  torrent.on("done", () => { doneEmitted = true; });

  await torrent.receivePiece(0, piece1);
  assertEquals(doneEmitted, false);
  
  await torrent.receivePiece(1, piece2);
  assertEquals(doneEmitted, true);
  assertEquals(torrent.progress, 1);
});

Deno.test("torrent: skips verification of existing pieces if skipVerify is true", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  
  // Coloca dados inválidos no store diretamente
  const invalidPiece = new Uint8Array(parsed.pieceLength).fill(99);
  await store.put(0, invalidPiece);

  const torrent = new Torrent(parsed, { store, skipVerify: true });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  // O bitfield não deve ter a peça 0 marcada, pois pulamos a verificação
  assertEquals(torrent.progress, 0);
});