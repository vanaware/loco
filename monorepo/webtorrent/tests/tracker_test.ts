// /loco/monorepo/webtorrent/tests/tracker_test.ts

import { assertEquals, assertThrows } from "jsr:@std/assert";
import { createTracker, HttpTracker, WsTracker } from "../src/network/tracker.ts";

Deno.test("tracker: factory creates HttpTracker for http/https", () => {
  const opts = {
    infoHash: new Uint8Array(20),
    peerId: new Uint8Array(20),
  };
  
  const httpTracker = createTracker("http://tracker.example.com/announce", opts);
  assertEquals(httpTracker instanceof HttpTracker, true);
  
  const httpsTracker = createTracker("https://tracker.example.com/announce", opts);
  assertEquals(httpsTracker instanceof HttpTracker, true);
});

Deno.test("tracker: factory creates WsTracker for ws/wss", () => {
  const opts = {
    infoHash: new Uint8Array(20),
    peerId: new Uint8Array(20),
  };
  
  const wsTracker = createTracker("wss://tracker.btorrent.xyz", opts);
  assertEquals(wsTracker instanceof WsTracker, true);
});

Deno.test("tracker: factory throws on unsupported protocol", () => {
  const opts = {
    infoHash: new Uint8Array(20),
    peerId: new Uint8Array(20),
  };
  
  assertThrows(
    () => createTracker("udp://tracker.example.com:6969", opts),
    Error,
    "Unsupported tracker protocol"
  );
});

// Nota: Testes de integração real (announce) exigem um servidor de tracker rodando.
// Em um ambiente CI, você poderia usar um mock de fetch para o HttpTracker.