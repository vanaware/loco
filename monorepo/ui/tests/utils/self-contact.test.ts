// Arquivo: monorepo/ui/tests/utils/self-contact.test.ts
/// <reference lib="deno.ns" />
import { assertEquals, assertExists, assertFalse, assert } from "@std/assert";
import type { ProfileConfig, Contato } from "@loco/utils/interfaces";
import { gerarContatoProprio, ehContatoProprio, obterHashProprio } from "@loco/utils/db";

async function serializarPublicKeyVapidMock(jwk: JsonWebKey): Promise<string> {
  if (!jwk) throw new Error("Chave VAPID ausente ao tentar serializar.");
  const raw = `${jwk.kty?.toLowerCase() || ''}|${jwk.crv?.toLowerCase() || ''}|${jwk.x?.toLowerCase() || ''}|${jwk.y?.toLowerCase() || ''}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(raw));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function assertTrue(condition: boolean, msg?: string) { assert(condition, msg); }

Deno.test("SELF-CONTACT: Deve gerar contato próprio válido a partir do profile", async () => {
  const mockProfile: ProfileConfig = {
    name: "João Silva", email: "joao@example.com",
    vapidPublicKey: { kty: "EC", crv: "P-256", x: "abc123", y: "def456" } as JsonWebKey,
    vapidPrivateKeyJwk: {} as JsonWebKey, vapidPrivateKeyEnvelope: "encrypted-key-data",
    e2ePublicKey: {} as JsonWebKey, e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: { endpoint: "https://push.example.com/subscription", keys: { p256dh: "p256dh-key", auth: "auth-key" } },
    createdAt: Date.now() - 10000, updatedAt: Date.now(),
  };
  
  const contatoProprio = await gerarContatoProprio(mockProfile);
  assertExists(contatoProprio);
  assertEquals(contatoProprio.name, "João Silva (Eu)");
  assertEquals(contatoProprio.trusted, true);
  assertEquals(contatoProprio.me, "trusted");
  
  const hashEsperado = await serializarPublicKeyVapidMock(mockProfile.vapidPublicKey);
  assertEquals(contatoProprio.id, hashEsperado);
});

Deno.test("SELF-CONTACT: Deve retornar null se profile for inválido", async () => {
  const contatoNull = await gerarContatoProprio(null as any);
  assertEquals(contatoNull, null);
});

Deno.test("SELF-CONTACT: Deve identificar corretamente se contato é o próprio usuário", async () => {
  const mockProfile: ProfileConfig = {
    name: "Maria Santos", email: "maria@example.com",
    vapidPublicKey: { kty: "EC", crv: "P-256", x: "xyz789", y: "uvw012" } as JsonWebKey,
    vapidPrivateKeyJwk: {} as JsonWebKey, vapidPrivateKeyEnvelope: "encrypted",
    e2ePublicKey: {} as JsonWebKey, e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: { endpoint: "https://push.example.com/sub", keys: { p256dh: "key1", auth: "key2" } },
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  
  const meuHash = await serializarPublicKeyVapidMock(mockProfile.vapidPublicKey);
  const ehEu = await ehContatoProprio(meuHash, mockProfile);
  assertTrue(ehEu);
  
  const ehOutro = await ehContatoProprio("outro-hash", mockProfile);
  assertFalse(ehOutro);
});

Deno.test("SELF-CONTACT: Deve obter hash próprio corretamente", async () => {
  const mockProfile: ProfileConfig = {
    name: "Pedro Oliveira", email: "pedro@example.com",
    vapidPublicKey: { kty: "EC", crv: "P-256", x: "hash-test-x", y: "hash-test-y" } as JsonWebKey,
    vapidPrivateKeyJwk: {} as JsonWebKey, vapidPrivateKeyEnvelope: "env",
    e2ePublicKey: {} as JsonWebKey, e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: { endpoint: "https://example.com", keys: { p256dh: "p", auth: "a" } },
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  
  const hashObtido = await obterHashProprio(mockProfile);
  const hashEsperado = await serializarPublicKeyVapidMock(mockProfile.vapidPublicKey);
  assertEquals(hashObtido, hashEsperado);
});