import { assertEquals } from "@std/assert";
import { base64ToBuf, bufToBase64 } from "../src/crypto.ts";

Deno.test("bufToBase64 - codifica corretamente", () => {
  const original = new Uint8Array([1, 2, 3, 255]);
  const encoded = bufToBase64(original.buffer);
  assertEquals(typeof encoded, "string");
  assertEquals(encoded.length > 0, true);
});

Deno.test("Conversão Base64 URL-safe ida e volta", () => {
  const original = new Uint8Array([1, 2, 3, 255, 128, 64, 32, 16]);
  const encoded = bufToBase64(original.buffer);
  const decoded = base64ToBuf(encoded);
  assertEquals(Array.from(decoded), Array.from(original));
});

Deno.test("Base64 não contém caracteres não URL-safe", () => {
  const original = new Uint8Array(256);
  for (let i = 0; i < 256; i++) original[i] = i;
  const encoded = bufToBase64(original.buffer);
  assertEquals(encoded.includes("+"), false);
  assertEquals(encoded.includes("/"), false);
  assertEquals(encoded.includes("="), false);
});
