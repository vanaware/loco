// /loco/monorepo/webtorrent/tests/file_test.ts

import { assertEquals, assertThrows } from "jsr:@std/assert";
import { File } from "../src/core/file.ts";

// Mock ChunkStore implementation for testing
class MockChunkStore {
  get(_index: number, _offset: number, _length: number, cb: Function) {
    cb(null, new Uint8Array([1, 2, 3]));
  }
}

Deno.test("file: constructor initializes correctly", () => {
  const store = new MockChunkStore();
  const file = new File({
    store,
    length: 100,
    offset: 50,
    pieceLength: 16
  });

  assertEquals(file.length, 100);
});

Deno.test("file: includes() correctly identifies piece coverage", () => {
  const store = new MockChunkStore();
  const file = new File({
    store,
    length: 100,
    offset: 50,
    pieceLength: 16
  });

  // Piece fully inside file
  assertEquals(file.includes({ index: 4 }), true);

  // Piece overlapping start
  assertEquals(file.includes({ index: 3 }), true);

  // Piece outside file
  assertEquals(file.includes({ index: 10 }), false);
});

Deno.test("file: createReadStream throws not implemented", () => {
  const file = new File({
    store: new MockChunkStore(),
    length: 100,
    offset: 50,
    pieceLength: 16
  });

  assertThrows(() => {
    file.createReadStream();
  }, Error, "Not implemented");
});

Deno.test("file: streamURL throws when infoHash is missing", () => {
  const file = new File({
    store: new MockChunkStore(),
    length: 100,
    offset: 50,
    pieceLength: 16
  });

  assertThrows(() => {
    file.streamURL();
  }, Error, "infoHash and fileIndex are required");
});

Deno.test("file: streamURL returns valid SW URL when registered", () => {
  const file = new File({
    store: new MockChunkStore(),
    length: 100,
    offset: 50,
    pieceLength: 16,
    name: "movie.mp4",
    infoHash: "a".repeat(40),
    fileIndex: 2,
    scope: "/loco/",
  });

  const url = file.streamURL();
  if (!url.includes("a".repeat(40))) throw new Error("URL missing infoHash");
  if (!url.includes("/2/")) throw new Error("URL missing fileIndex");
  if (!url.includes("movie.mp4")) throw new Error("URL missing name");
  if (!url.startsWith("/loco/webtorrent/")) throw new Error("URL missing scope prefix");
});

Deno.test("file: streamTo handles media element", () => {
  const file = new File({
    store: new MockChunkStore(),
    length: 100,
    offset: 50,
    pieceLength: 16
  });

  // Mock media element
  const video = {
    src: "",
    load: () => {},
    addEventListener: (_: string, cb: Function) => cb()
  } as unknown as HTMLVideoElement;

  // Should throw because infoHash/fileIndex are not set on this file
  assertThrows(() => {
    file.streamTo(video);
  }, Error, "infoHash and fileIndex are required");
});