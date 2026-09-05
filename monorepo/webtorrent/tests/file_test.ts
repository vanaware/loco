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

Deno.test("file: streamURL throws not implemented", () => {
  const file = new File({
    store: new MockChunkStore(),
    length: 100,
    offset: 50,
    pieceLength: 16
  });

  assertThrows(() => {
    file.streamURL();
  }, Error, "Not implemented");
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

  // Should throw because streamURL is not implemented
  assertThrows(() => {
    file.streamTo(video);
  }, Error, "Not implemented");
});