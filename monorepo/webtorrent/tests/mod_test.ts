// /loco/monorepo/webtorrent/tests/mod_test.ts

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { WebTorrent } from "../src/mod.ts";

Deno.test("webtorrent: initializes with default options", () => {
  const client = new WebTorrent();
  
  assertEquals(client.peerId.length, 40);
  assertEquals(client.peerIdBuffer.length, 20);
  assertEquals(client.torrentCount, 0);
  assertEquals(client.isDestroyed, false);
  
  client.destroy();
});

Deno.test("webtorrent: initializes with custom peerId", () => {
  const customPeerId = "a".repeat(40);
  const client = new WebTorrent({ peerId: customPeerId });
  
  assertEquals(client.peerId, customPeerId);
  assertEquals(client.peerIdBuffer[0], 0xaa);
  
  client.destroy();
});

Deno.test("webtorrent: emits 'ready' event", async () => {
  const client = new WebTorrent();
  
  let readyEmitted = false;
  client.on("ready", () => {
    readyEmitted = true;
  });
  
  await new Promise((resolve) => setTimeout(resolve, 10));
  
  assertEquals(readyEmitted, true);
  assertEquals(client.isReady, true);
  
  client.destroy();
});

Deno.test("webtorrent: add() throws if client is destroyed", async () => {
  const client = new WebTorrent();
  client.destroy();
  
  await assertRejects(
    () => client.add("magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10"),
    Error,
    "WebTorrent client is destroyed"
  );
});

Deno.test("webtorrent: destroy() cleans up all torrents", async () => {
  const client = new WebTorrent();
  
  const torrent = await client.add("magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10");
  assertEquals(client.torrentCount, 1);
  
  await client.destroy();
  
  assertEquals(client.torrentCount, 0);
  assertEquals(client.isDestroyed, true);
});

Deno.test("webtorrent: remove() removes a specific torrent", async () => {
  const client = new WebTorrent();
  
  const torrent = await client.add("magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10");
  assertEquals(client.torrentCount, 1);
  
  await client.remove(torrent.infoHash);
  assertEquals(client.torrentCount, 0);
  
  client.destroy();
});

Deno.test("webtorrent: add() returns same torrent if already exists", async () => {
  const client = new WebTorrent();
  
  const magnet = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10";
  const torrent1 = await client.add(magnet);
  const torrent2 = await client.add(magnet);
  
  assertEquals(torrent1, torrent2);
  assertEquals(client.torrentCount, 1);
  
  client.destroy();
});