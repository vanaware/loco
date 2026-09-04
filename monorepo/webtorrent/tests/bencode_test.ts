// /loco/monorepo/webtorrent/tests/bencode_test.ts

import { assertEquals, assertThrows } from "jsr:@std/assert";
import { decode, encode, BencodeValue } from "../src/utils/bencode.ts";

const strToBytes = (str: string) => new TextEncoder().encode(str);
const bytesToStr = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

Deno.test("bencode: decode integer", () => {
  const data = strToBytes("i42e");
  assertEquals(decode(data), 42);
});

Deno.test("bencode: decode negative integer", () => {
  const data = strToBytes("i-42e");
  assertEquals(decode(data), -42);
});

Deno.test("bencode: decode string", () => {
  const data = strToBytes("5:hello");
  const result = decode(data);
  assertEquals(typeof result, "string");
  assertEquals(result, "hello");
});

Deno.test("bencode: decode list", () => {
  const data = strToBytes("l4:spami42ee");
  const result = decode(data) as BencodeValue[];
  assertEquals(result[0], "spam");
  assertEquals(result[1], 42);
});

Deno.test("bencode: decode dictionary", () => {
  const data = strToBytes("d3:cow3:moo4:spam4:eggse");
  const result = decode(data) as Record<string, BencodeValue>;
  assertEquals(result["cow"], "moo");
  assertEquals(result["spam"], "eggs");
});

Deno.test("bencode: encode integer", () => {
  const result = encode(42);
  assertEquals(bytesToStr(result), "i42e");
});

Deno.test("bencode: encode string", () => {
  const result = encode("hello");
  assertEquals(bytesToStr(result), "5:hello");
});

Deno.test("bencode: encode list", () => {
  const result = encode(["spam", 42]);
  assertEquals(bytesToStr(result), "l4:spami42ee");
});

Deno.test("bencode: encode dictionary with sorted keys", () => {
  const data: BencodeValue = {
    z: "Z",
    a: "A",
    m: "M",
  };
  const result = encode(data);
  assertEquals(bytesToStr(result), "d1:a1:A1:m1:M1:z1:Ze");
});

Deno.test("bencode: roundtrip complex torrent metadata", () => {
  const original: BencodeValue = {
    announce: "udp://tracker.example.com:80",
    info: {
      name: "ubuntu-22.04.iso",
      length: 1024,
      "piece length": 16384,
      pieces: new Uint8Array([0, 1, 2, 3, 4]),
    },
  };

  const encoded = encode(original);
  const decoded = decode(encoded) as Record<string, BencodeValue>;
  const decodedInfo = decoded["info"] as Record<string, BencodeValue>;

  assertEquals(decoded["announce"], "udp://tracker.example.com:80");
  assertEquals(decodedInfo["name"], "ubuntu-22.04.iso");
  assertEquals(decodedInfo["length"], 1024);
  assertEquals(decodedInfo["piece length"], 16384);
  
  const pieces = decodedInfo["pieces"] as Uint8Array;
  assertEquals(pieces.length, 5);
  assertEquals(pieces[0], 0);
  assertEquals(pieces[4], 4);
});

Deno.test("bencode: encode and decode bigint", () => {
  const bigNum = 9007199254740991234n;
  const encoded = encode(bigNum);
  const decoded = decode(encoded);
  assertEquals(decoded, bigNum);
});