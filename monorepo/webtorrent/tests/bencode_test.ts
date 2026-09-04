// monorepo/webtorrent/testes/bencode_test.ts
import { assertEquals, assertThrows } from "jsr:@std/assert";
import { encode, decode, BencodeValue } from "../src/utils/bencode.ts";

Deno.test("Bencode - Codifica e Decodifica Strings", () => {
  const encoded = encode("spam");
  assertEquals(new TextDecoder().decode(encoded), "4:spam");
  assertEquals(decode(encoded), "spam");
});

Deno.test("Bencode - Codifica e Decodifica Inteiros e BigInt", () => {
  assertEquals(new TextDecoder().decode(encode(42)), "i42e");
  assertEquals(decode(encode(42)), 42);
  
  // Teste com BigInt (tamanhos de torrent gigantes)
  const bigNum = 9007199254740991234n;
  const decodedBig = decode(encode(bigNum));
  assertEquals(decodedBig, bigNum);
});

Deno.test("Bencode - Dicionários omitem undefined e ordenam chaves", () => {
  const data: BencodeValue = { 
    cow: "moo", 
    spam: "eggs", 
    ignoreMe: undefined as any // Forçando para testar a resiliência do TS/Spec
  };
  
  const encoded = encode(data);
  // A saída deve ser ordenada alfabeticamente e sem o 'ignoreMe'
  assertEquals(new TextDecoder().decode(encoded), "d3:cow3:moo4:spam4:eggse");
});

Deno.test("Bencode - Rejeita null e undefined na raiz", () => {
  assertThrows(() => encode(null as any), Error, "não suporta valores null");
  assertThrows(() => encode(undefined as any), Error, "não suporta valores null");
});