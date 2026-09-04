// /loco/monorepo/webtorrent/tests/ut-metadata_test.ts

import { assertEquals } from "jsr:@std/assert";
import { UtMetadata } from "../src/extensions/ut-metadata.ts";
import { encode } from "../src/utils/bencode.ts";

class MockWire {
  public extendedHandshake: any = { metadata_size: 100 };
  public extendedCalls: { name: string; payload: Uint8Array }[] = [];

  extended(name: string, payload: Uint8Array) {
    this.extendedCalls.push({ name, payload });
  }
}

Deno.test("ut-metadata: initializes correctly", () => {
  const mockWire = new MockWire();
  const ut = new UtMetadata(mockWire as any);
  assertEquals(ut.metadata, null);
});

Deno.test("ut-metadata: processes extended handshake", () => {
  const mockWire = new MockWire();
  const ut = new UtMetadata(mockWire as any);

  ut.onExtendedHandshake({
    m: { ut_metadata: 1 },
    metadata_size: 50000,
  });

  assertEquals(mockWire.extendedCalls.length > 0, true);
});

Deno.test("ut-metadata: rejects invalid metadata size", () => {
  const mockWire = new MockWire();
  const ut = new UtMetadata(mockWire as any);
  let warningEmitted = false;

  // 🔥 CORREÇÃO: Usar addEventListener nativo do EventTarget
  ut.addEventListener("warning", () => { warningEmitted = true; });
  
  ut.onExtendedHandshake({
    metadata_size: -1,
    m: { ut_metadata: 1 },
  });

  assertEquals(warningEmitted, true);
});

Deno.test("ut-metadata: setMetadata marks as complete", () => {
  const mockWire = new MockWire();
  const ut = new UtMetadata(mockWire as any);
  const fakeMetadata = new Uint8Array(100).fill(42);

  ut.setMetadata(fakeMetadata);
  assertEquals(ut.metadata, fakeMetadata);
});