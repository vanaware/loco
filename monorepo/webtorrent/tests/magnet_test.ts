// /loco/monorepo/webtorrent/tests/magnet_test.ts

import { assertEquals, assertThrows } from "jsr:@std/assert";
import { parseMagnet, encodeMagnet } from "../src/utils/magnet.ts";

Deno.test("magnet: parse simple hex infoHash", () => {
  const uri = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel";
  const parsed = parseMagnet(uri);
  assertEquals(parsed.infoHash, "08ada5a7a6183aae1e09d831df6748d566095a10");
  assertEquals(parsed.infoHashBuffer.length, 20);
  assertEquals(parsed.name, "Sintel");
  assertEquals(parsed.announce.length, 0); // 🔥 CORREÇÃO: Usar announce em vez de trackers
});

Deno.test("magnet: parse with multiple trackers", () => {
  const uri = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&tr=udp%3A%2F%2Ftracker.example.com%3A6969&tr=wss%3A%2F%2Ftracker.btorrent.xyz";
  const parsed = parseMagnet(uri);
  assertEquals(parsed.announce.length, 2); // 🔥 CORREÇÃO
  assertEquals(parsed.announce[0], "udp://tracker.example.com:6969"); // 🔥 CORREÇÃO
  assertEquals(parsed.announce[1], "wss://tracker.btorrent.xyz"); // 🔥 CORREÇÃO
});

Deno.test("magnet: parse base32 infoHash", () => {
  const uri = "magnet:?xt=urn:btih:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const parsed = parseMagnet(uri);
  assertEquals(parsed.infoHash, "0000000000000000000000000000000000000000");
});

Deno.test("magnet: parse web seeds and peers", () => {
  const uri = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F&x.pe=192.168.1.1%3A6881";
  const parsed = parseMagnet(uri);
  assertEquals(parsed.webSeeds.length, 1);
  assertEquals(parsed.webSeeds[0], "https://webtorrent.io/torrents/");
  assertEquals(parsed.peerAddresses.length, 1);
  assertEquals(parsed.peerAddresses[0], "192.168.1.1:6881");
});

Deno.test("magnet: parse torrent file URL (xs)", () => {
  const uri = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&xs=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2Fsintel.torrent";
  const parsed = parseMagnet(uri);
  assertEquals(parsed.torrentFileUrl, "https://webtorrent.io/torrents/sintel.torrent");
});

Deno.test("magnet: throws on invalid URI", () => {
  assertThrows(() => parseMagnet("http://example.com"), Error, "must start with 'magnet:?'");
});

Deno.test("magnet: throws on missing infoHash", () => {
  assertThrows(() => parseMagnet("magnet:?dn=Test"), Error, "missing or invalid 'xt' parameter");
});

Deno.test("magnet: throws on invalid infoHash length", () => {
  assertThrows(() => parseMagnet("magnet:?xt=urn:btih:123"), Error, "Invalid infoHash length");
});

Deno.test("magnet: encode and decode roundtrip", () => {
  const original = {
    infoHash: "08ada5a7a6183aae1e09d831df6748d566095a10",
    name: "Sintel",
    announce: ["udp://tracker.example.com:6969"], // 🔥 CORREÇÃO: Usar announce
    webSeeds: ["https://webtorrent.io/torrents/"],
    peerAddresses: [] as string[],
    torrentFileUrl: "https://webtorrent.io/torrents/sintel.torrent",
  };
  
  const encoded = encodeMagnet(original);
  const decoded = parseMagnet(encoded);
  
  assertEquals(decoded.infoHash, original.infoHash);
  assertEquals(decoded.name, original.name);
  assertEquals(decoded.announce, original.announce); // 🔥 CORREÇÃO
  assertEquals(decoded.webSeeds, original.webSeeds);
  assertEquals(decoded.torrentFileUrl, original.torrentFileUrl);
});