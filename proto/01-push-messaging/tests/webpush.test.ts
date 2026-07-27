/// <reference lib="deno.ns" />

import { assertEquals, assert } from "@std/assert";
import {
  bufferToBase64Url,
  createJwtVapid,
  encryptPayloadWebPush,
  exportPublicKeyRaw,
  generateVapidKeys,
} from "../src/crypto.ts";

function b64urlToBuffer(base64Url: string): ArrayBuffer {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

Deno.test("bufferToBase64Url gera string URL-safe", () => {
  const buffer = new TextEncoder().encode("hello world!");
  const encoded = bufferToBase64Url(buffer);
  assert(!encoded.includes("+"));
  assert(!encoded.includes("/"));
  assert(!encoded.includes("="));
});

Deno.test("generateVapidKeys retorna par exportável", async () => {
  const keys = await generateVapidKeys();
  assert(keys.publicJwk.kty === "EC");
  assert(keys.publicJwk.x);
  assert(keys.publicJwk.y);
  assert(keys.privateJwk.d);
});

Deno.test("exportPublicKeyRaw retorna 65 bytes para P-256", async () => {
  const keys = await generateVapidKeys();
  const raw = await exportPublicKeyRaw(keys.publicJwk);
  assertEquals(raw.byteLength, 65);
});

Deno.test("createJwtVapid gema token JWT com 3 partes", async () => {
  const keys = await generateVapidKeys();
  const jwt = await createJwtVapid(keys.privateJwk, "https://fcm.googleapis.com/fcm/");
  const parts = jwt.split(".");
  assertEquals(parts.length, 3);
});

Deno.test("encryptPayloadWebPush gera payload RFC 8188 válido", async () => {
  const ecdhKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const publicKeyRaw = await crypto.subtle.exportKey("raw", ecdhKeyPair.publicKey);
  const authBuffer = crypto.getRandomValues(new Uint8Array(16));

  const keys = {
    p256dh: bufferToBase64Url(publicKeyRaw),
    auth: bufferToBase64Url(authBuffer.buffer),
  };

  const encrypted = await encryptPayloadWebPush("Olá, Web Push!", keys);

  // salt(16) + rs(4) + keyid_len(1) + keyid(65) + tag(16) -> mínimo 86 bytes
  assert(encrypted.length >= 86);
  const keyidLen = encrypted[16 + 4];
  assertEquals(keyidLen, 65);
});
