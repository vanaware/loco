// Arquivo: monorepo/ui/tests/utils/share-utils.test.ts
/// <reference lib="deno.ns" />
import { assert, assertEquals, assertRejects } from "@std/assert";
import { gerarLinkConviteWeb, processarQualquerConvite, extrairDadosCompactos, expandirDadosCompactos } from "@loco/utils/db";
import { generateVAPIDKeys, generateE2EEKeys, exportKeyToJWK } from "@loco/utils/crypto";
import type { ProfileConfig, Contato } from "@loco/utils/interfaces";

const mockContatos = new Map<string, Contato>();
async function salvarContatoMock(contato: Contato): Promise<void> { mockContatos.set(contato.id, contato); }
async function buscarContatoPorChaveMock(hash: string): Promise<Contato | null> { return mockContatos.get(hash) || null; }

async function serializarPublicKeyVapidMock(key: JsonWebKey): Promise<string> {
  const data = `${key.x}:${key.y}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.test("Share Utils - Geração e Importação de cJWT para Profile e Contato", async () => {
  const userA: ProfileConfig = {
    name: "Usuário A", email: "usuario.a@teste.com",
    vapidPublicKey: {} as JsonWebKey, vapidPrivateKeyJwk: {} as JsonWebKey, vapidPrivateKeyEnvelope: "",
    e2ePublicKey: {} as JsonWebKey, e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint-a", keys: { p256dh: "p256dh-a", auth: "auth-a" }, proxyserver: "https://mock.loco.proxy" },
    createdAt: Date.now(), updatedAt: Date.now()
  };
  
  const [vapidKeysA, e2eKeysA] = await Promise.all([generateVAPIDKeys(), generateE2EEKeys()]);
  userA.vapidPublicKey = await exportKeyToJWK(vapidKeysA.publicKey);
  userA.vapidPrivateKeyJwk = await exportKeyToJWK(vapidKeysA.privateKey);
  userA.e2ePublicKey = e2eKeysA.publicEncrypt;
  userA.e2ePrivateKeyJwk = e2eKeysA.privateDecryptJwk;
  
  const compactDataA = await extrairDadosCompactos(userA);
  assertEquals(compactDataA.nm, "Usuário A");
  
  const cjwtUrl = await gerarLinkConviteWeb(userA, userA.vapidPrivateKeyJwk, userA.vapidPublicKey, 'http://test.localhost');
  assert(cjwtUrl.includes("#share="));
  
  const cjwtToken = cjwtUrl.split("#share=")[1];
  const importedContato = await processarQualquerConvite(cjwtToken);
  assertEquals(importedContato.name, "Usuário A");
  
  await assertRejects(
    async () => await processarQualquerConvite("token-invalido-abc123"),
    Error,
    "O link ou código colado não é um convite válido do Loco."
  );
});