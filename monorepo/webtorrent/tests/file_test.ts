// /loco/monorepo/webtorrent/tests/file_test.ts

import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert";
import { File } from "../src/core/file.ts";
import { Piece } from "../src/core/piece.ts";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Fake store that returns predictable bytes for every piece. */
class FakeChunkStore {
  chunkLength: number;
  private data: Uint8Array;

  constructor(chunkLength = 1024, totalSize = 2048) {
    this.chunkLength = chunkLength;
    this.data = new Uint8Array(totalSize);
    for (let i = 0; i < this.data.length; i++) {
      this.data[i] = i % 256;
    }
  }

  async get(index: number): Promise<Uint8Array> {
    const start = index * this.chunkLength;
    const end = Math.min(start + this.chunkLength, this.data.length);
    if (start >= this.data.length) return new Uint8Array(0);
    return this.data.subarray(start, end);
  }
}

// ── Constructor & properties ────────────────────────────────────────────────

Deno.test("file: constructor initializes correctly", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 50, pieceLength: 16 });

  assertEquals(file.length, 100);
  assertEquals(file.name, "file");
  assertEquals(file.path, "file");
  assertEquals(file.scope, "/");
  assertEquals(file.destroyed, false);
});

Deno.test("file: constructor accepts all optional fields", () => {
  const store = new FakeChunkStore();
  const file = new File({
    store,
    length: 100,
    offset: 50,
    pieceLength: 16,
    name: "video.mp4",
    path: "folder/video.mp4",
    infoHash: "a".repeat(40),
    fileIndex: 3,
    scope: "/app/",
    blockSize: 8192,
  });

  assertEquals(file.name, "video.mp4");
  assertEquals(file.path, "folder/video.mp4");
  assertEquals(file.infoHash, "a".repeat(40));
  assertEquals(file.fileIndex, 3);
  assertEquals(file.scope, "/app/");
});

Deno.test("file: defaults for optional fields", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 0, offset: 0, pieceLength: 16 });

  assertEquals(file.name, "file");
  assertEquals(file.path, "file");
  assertEquals(file.scope, "/");
  assertEquals(file.infoHash, undefined);
  assertEquals(file.fileIndex, undefined);
});

// ── Piece range ─────────────────────────────────────────────────────────────

Deno.test("file: pieceRange returns correct first/last indices", () => {
  const store = new FakeChunkStore(1024, 2048);
  // offset=0, length=1500, pieceLength=1024
  // first = floor(0/1024) = 0
  // last  = floor((0+1499)/1024) = floor(1499/1024) = 1
  const file = new File({ store, length: 1500, offset: 0, pieceLength: 1024 });
  const range = file.pieceRange;
  assertEquals(range.first, 0);
  assertEquals(range.last, 1);
});

Deno.test("file: pieceRange for middle file", () => {
  // offset=1024, length=1024, pieceLength=1024
  // first = floor(1024/1024) = 1
  // last  = floor((1024+1023)/1024) = floor(2047/1024) = 1
  const store = new FakeChunkStore(1024, 4096);
  const file = new File({ store, length: 1024, offset: 1024, pieceLength: 1024 });
  assertEquals(file.pieceRange.first, 1);
  assertEquals(file.pieceRange.last, 1);
});

// ── includes ─────────────────────────────────────────────────────────────────

Deno.test("file: includes() returns true for pieces inside file", () => {
  const store = new FakeChunkStore(1024, 2048);
  // offset=0, length=1500, pieces 0 and 1 are inside
  const file = new File({ store, length: 1500, offset: 0, pieceLength: 1024 });

  assertEquals(file.includes({ index: 0 }), true);
  assertEquals(file.includes({ index: 1 }), true);
  assertEquals(file.includes({ index: 2 }), false);
  assertEquals(file.includes({ index: 3 }), false);
});

Deno.test("file: includes() with Piece class instance", () => {
  const store = new FakeChunkStore(512, 4096);
  const file = new File({ store, length: 800, offset: 0, pieceLength: 512 });
  // pieces 0 and 1 are inside (0-512 and 512-1024, but file is 0-800)

  assertEquals(file.includes(new Piece(0, 512, 0)), true);
  assertEquals(file.includes(new Piece(1, 512, 512)), true);
  assertEquals(file.includes(new Piece(2, 512, 1024)), false);
});

// ── createReadStream (core implementation) ────────────────────────────────────

Deno.test("file: createReadStream returns a ReadableStream", () => {
  const store = new FakeChunkStore(1024, 2048);
  const file = new File({ store, length: 1500, offset: 0, pieceLength: 1024 });

  const stream = file.createReadStream();
  assertEquals(typeof stream.getReader, "function");
  assertEquals(typeof stream[Symbol.asyncIterator], "function");
});

Deno.test("file: createReadStream emits 'stream' event", async () => {
  const store = new FakeChunkStore(512, 2048);
  const file = new File({ store, length: 200, offset: 0, pieceLength: 512 });

  let eventFired = false;
  file.addEventListener("stream", () => { eventFired = true; });

  file.createReadStream();
  assertEquals(eventFired, true);
});

Deno.test("file: createReadStream reads full file", async () => {
  const store = new FakeChunkStore(1024, 2048);
  const file = new File({ store, length: 1500, offset: 0, pieceLength: 1024 });

  const stream = file.createReadStream();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  assertEquals(chunks.length > 0, true);
  const total = chunks.reduce((s, c) => s + c.length, 0);
  assertEquals(total, 1500);
});

Deno.test("file: createReadStream respects start offset", async () => {
  const store = new FakeChunkStore(1024, 2048);
  const file = new File({ store, length: 1024, offset: 0, pieceLength: 1024 });

  const stream = file.createReadStream({ start: 500 });
  const reader = stream.getReader();
  const { value, done } = await reader.read();

  assertEquals(done, false);
  assertEquals(value!.length > 0, true);
  // First byte should be the byte at global offset 500
  assertEquals(value![0], 244); // 500 % 256
});

Deno.test("file: createReadStream respects end offset", async () => {
  const store = new FakeChunkStore(512, 4096);
  const file = new File({ store, length: 2000, offset: 0, pieceLength: 512 });

  const stream = file.createReadStream({ start: 0, end: 300 });
  const reader = stream.getReader();
  let total = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value!.length;
  }

  assertEquals(total, 300);
});

Deno.test("file: createReadStream rejects invalid range", () => {
  const store = new FakeChunkStore(1024, 2048);
  const file = new File({ store, length: 500, offset: 0, pieceLength: 1024 });

  assertThrows(() => file.createReadStream({ start: -1 }), RangeError);
  assertThrows(() => file.createReadStream({ start: 0, end: 1000 }), RangeError);
  assertThrows(() => file.createReadStream({ start: 300, end: 100 }), RangeError);
});

Deno.test("file: createReadStream rejects after destroy", () => {
  const store = new FakeChunkStore(1024, 2048);
  const file = new File({ store, length: 500, offset: 0, pieceLength: 1024 });
  file.destroy();

  assertThrows(() => file.createReadStream(), Error, "destroyed");
});

Deno.test("file: createReadStream emits 'done' event on completion", async () => {
  const store = new FakeChunkStore(512, 2048);
  const file = new File({ store, length: 200, offset: 0, pieceLength: 512 });

  let doneEmitted = false;
  file.addEventListener("done", () => { doneEmitted = true; });

  const stream = file.createReadStream();
  const reader = stream.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }

  assertEquals(doneEmitted, true);
});

// ── stream() ─────────────────────────────────────────────────────────────────

Deno.test("file: stream() is an alias for createReadStream", async () => {
  const store = new FakeChunkStore(512, 2048);
  const file = new File({ store, length: 200, offset: 0, pieceLength: 512 });

  const s1 = file.createReadStream();
  const s2 = file.stream();

  const r1 = s1.getReader();
  const r2 = s2.getReader();

  const { value: v1 } = await r1.read();
  const { value: v2 } = await r2.read();

  assertEquals(v1!.length, v2!.length);
});

// ── Symbol.asyncIterator ─────────────────────────────────────────────────────

Deno.test("file: Symbol.asyncIterator yields chunks", async () => {
  const store = new FakeChunkStore(512, 4096);
  const file = new File({ store, length: 800, offset: 0, pieceLength: 512 });

  const chunks: Uint8Array[] = [];
  for await (const chunk of file) {
    chunks.push(chunk);
  }

  assertEquals(chunks.length > 0, true);
  const total = chunks.reduce((s, c) => s + c.length, 0);
  assertEquals(total, 800);
});

Deno.test("file: Symbol.asyncIterator emits 'iterator' event", async () => {
  const store = new FakeChunkStore(512, 2048);
  const file = new File({ store, length: 200, offset: 0, pieceLength: 512 });

  let eventFired = false;
  file.addEventListener("iterator", () => { eventFired = true; });

  for await (const _ of file) { /* consume */ }

  assertEquals(eventFired, true);
});

// ── arrayBuffer ───────────────────────────────────────────────────────────────

Deno.test("file: arrayBuffer returns full file as ArrayBuffer", async () => {
  const store = new FakeChunkStore(512, 4096);
  const file = new File({ store, length: 1200, offset: 0, pieceLength: 512 });

  const buf = await file.arrayBuffer();
  assertEquals(buf.byteLength, 1200);

  const view = new Uint8Array(buf);
  assertEquals(view[0], 0);
  assertEquals(view[1], 1);
});

Deno.test("file: arrayBuffer for middle file reads correct bytes", async () => {
  const store = new FakeChunkStore(512, 4096);
  // File at offset 512, length 500 (inside piece 1)
  const file = new File({ store, length: 500, offset: 512, pieceLength: 512 });

  const buf = await file.arrayBuffer();
  assertEquals(buf.byteLength, 500);

  const view = new Uint8Array(buf);
  // Global offset 512 → value = 512 % 256 = 0
  assertEquals(view[0], 0);
  // Global offset 513 → value = 513 % 256 = 1
  assertEquals(view[1], 1);
});

// ── blob ─────────────────────────────────────────────────────────────────────

Deno.test("file: blob returns a Blob", async () => {
  const store = new FakeChunkStore(512, 2048);
  const file = new File({ store, length: 300, offset: 0, pieceLength: 512 });

  const blob = await file.blob();
  assertEquals(blob.size, 300);
  assertEquals(blob.type, "");
});

// ── getBlobURL ───────────────────────────────────────────────────────────────

Deno.test("file: getBlobURL returns an object URL", async () => {
  const store = new FakeChunkStore(512, 2048);
  const file = new File({ store, length: 200, offset: 0, pieceLength: 512 });

  const url = await file.getBlobURL();
  assertEquals(url.startsWith("blob:"), true);
  URL.revokeObjectURL(url);
});

// ── streamURL ────────────────────────────────────────────────────────────────

Deno.test("file: streamURL throws when infoHash is missing", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 50, pieceLength: 16 });

  assertThrows(
    () => file.streamURL(),
    Error,
    "infoHash and fileIndex are required",
  );
});

Deno.test("file: streamURL throws when fileIndex is missing", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 50, pieceLength: 16, infoHash: "a".repeat(40) });

  assertThrows(
    () => file.streamURL(),
    Error,
    "infoHash and fileIndex are required",
  );
});

Deno.test("file: streamURL returns valid SW URL with all fields", () => {
  const store = new FakeChunkStore();
  const file = new File({
    store,
    length: 100,
    offset: 50,
    pieceLength: 16,
    name: "movie.mp4",
    infoHash: "a".repeat(40),
    fileIndex: 2,
    scope: "/loco/",
  });

  const url = file.streamURL();
  assertEquals(url.includes("a".repeat(40)), true);
  assertEquals(url.includes("/2/"), true);
  assertEquals(url.includes("movie.mp4"), true);
  assertEquals(url.startsWith("/loco/webtorrent/"), true);
});

Deno.test("file: streamURL uses default scope", () => {
  const store = new FakeChunkStore();
  const file = new File({
    store,
    length: 100,
    offset: 0,
    pieceLength: 16,
    infoHash: "b".repeat(40),
    fileIndex: 0,
  });

  const url = file.streamURL();
  // Default scope is "/" so URL begins with "/webtorrent/"
  assertEquals(url.startsWith("/webtorrent/"), true);
});

// ── streamTo ─────────────────────────────────────────────────────────────────

Deno.test("file: streamTo sets element src to streamURL", () => {
  const store = new FakeChunkStore();
  const file = new File({
    store,
    length: 100,
    offset: 0,
    pieceLength: 16,
    name: "video.mp4",
    infoHash: "c".repeat(40),
    fileIndex: 5,
  });

  let capturedSrc = "";
  let loadCalled = false;
  const element = {
    get src() { return capturedSrc; },
    set src(v: string) { capturedSrc = v; },
    load: () => { loadCalled = true; },
  } as unknown as HTMLMediaElement;

  file.streamTo(element);
  assertEquals(capturedSrc.includes("c".repeat(40)), true);
  assertEquals(loadCalled, true);
});

// ── destroy ─────────────────────────────────────────────────────────────────

Deno.test("file: destroy marks file as destroyed", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 0, pieceLength: 16 });

  assertEquals(file.destroyed, false);
  file.destroy();
  assertEquals(file.destroyed, true);
});

Deno.test("file: createReadStream throws after destroy", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 0, pieceLength: 16 });
  file.destroy();

  assertThrows(() => file.createReadStream(), Error, "destroyed");
});

// ── select / deselect ───────────────────────────────────────────────────────

Deno.test("file: select() and deselect() are no-ops (API parity)", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 0, pieceLength: 16 });

  // These must not throw — piece selection lives on Torrent, not File
  file.select();
  file.select(0, 5);
  file.deselect();
  file.deselect(0, 5);
});
