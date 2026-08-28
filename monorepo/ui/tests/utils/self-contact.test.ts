// tests/utils/self-contact.test.ts
/// <reference lib="deno.ns" />
import { assertEquals, assertExists, assertFalse, assert } from "@std/assert";
import type { ProfileConfig, Contato } from "../../../utils/src/interfaces/db.ts";
import { gerarContatoProprio, ehContatoProprio, obterHashProprio } from "../../../utils/src/db/self-contact-utils.ts";

// Mock simples para a função serializarPublicKeyVapid que depende de IndexedDB
async function serializarPublicKeyVapidMock(jwk: JsonWebKey): Promise<string> {
  if (!jwk) throw new Error("Chave VAPID ausente ao tentar serializar.");
  const raw = `${jwk.kty?.toLowerCase() || ''}|${jwk.crv?.toLowerCase() || ''}|${jwk.x?.toLowerCase() || ''}|${jwk.y?.toLowerCase() || ''}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(raw));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Helper para substituir assertTrue
function assertTrue(condition: boolean, msg?: string) {
  assert(condition, msg);
}

/**
 * Testes para funcionalidade de contato próprio (self-contact)
 * 
 * Esta suite testa a capacidade do sistema de:
 * 1. Gerar um contato baseado no profile do usuário
 * 2. Identificar quando um contato é o próprio usuário
 * 3. Obter o hash do próprio usuário para comparações
 */

Deno.test("SELF-CONTACT: Deve gerar contato próprio válido a partir do profile", async () => {
  // Mock de ProfileConfig
  const mockProfile: ProfileConfig = {
    name: "João Silva",
    email: "joao@example.com",
    vapidPublicKey: {
      kty: "EC",
      crv: "P-256",
      x: "abc123",
      y: "def456",
    } as JsonWebKey,
    vapidPrivateKeyJwk: {} as JsonWebKey,
    vapidPrivateKeyEnvelope: "encrypted-key-data",
    e2ePublicKey: {} as JsonWebKey,
    e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: {
      endpoint: "https://push.example.com/subscription",
      keys: {
        p256dh: "p256dh-key",
        auth: "auth-key",
      },
    },
    createdAt: Date.now() - 10000,
    updatedAt: Date.now(),
  };

  const contatoProprio = await gerarContatoProprio(mockProfile);

  assertExists(contatoProprio, "Contato próprio deve ser gerado");
  assertEquals(contatoProprio.name, "João Silva (Eu)", "Nome deve ter sufixo '(Eu)'");
  assertEquals(contatoProprio.email, mockProfile.email, "Email deve corresponder ao profile");
  assertEquals(contatoProprio.trusted, true, "Contato próprio deve ser sempre confiável");
  assertEquals(contatoProprio.me, "trusted", "Status 'me' deve ser 'trusted'");
  assertEquals(contatoProprio.vapidPublicKey, mockProfile.vapidPublicKey, "Chave VAPID deve ser a mesma do profile");
  assertEquals(contatoProprio.e2ePublicKey, mockProfile.e2ePublicKey, "Chave E2E deve ser a mesma do profile");
  
  // Verifica se o ID é o hash da chave pública VAPID
  const hashEsperado = await serializarPublicKeyVapidMock(mockProfile.vapidPublicKey);
  assertEquals(contatoProprio.id, hashEsperado, "ID deve ser o hash da chave pública VAPID");
});

Deno.test("SELF-CONTACT: Deve retornar null se profile for inválido", async () => {
  const contatoNull = await gerarContatoProprio(null as any);
  assertEquals(contatoNull, null, "Deve retornar null para profile nulo");

  const contatoSemChave = await gerarContatoProprio({ name: "Test", email: "test@test.com" } as any);
  assertEquals(contatoSemChave, null, "Deve retornar null se não houver chave VAPID");
});

Deno.test("SELF-CONTACT: Deve identificar corretamente se contato é o próprio usuário", async () => {
  const mockProfile: ProfileConfig = {
    name: "Maria Santos",
    email: "maria@example.com",
    vapidPublicKey: {
      kty: "EC",
      crv: "P-256",
      x: "xyz789",
      y: "uvw012",
    } as JsonWebKey,
    vapidPrivateKeyJwk: {} as JsonWebKey,
    vapidPrivateKeyEnvelope: "encrypted",
    e2ePublicKey: {} as JsonWebKey,
    e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: {
      endpoint: "https://push.example.com/sub",
      keys: { p256dh: "key1", auth: "key2" },
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const meuHash = await serializarPublicKeyVapidMock(mockProfile.vapidPublicKey);
  const outroHash = "hash-de-outro-contato-diferente";

  // Testa com o hash correto (deve ser true)
  const ehEu = await ehContatoProprio(meuHash, mockProfile);
  assertTrue(ehEu, "Deve identificar como próprio usuário");

  // Testa com hash diferente (deve ser false)
  const ehOutro = await ehContatoProprio(outroHash, mockProfile);
  assertFalse(ehOutro, "Não deve identificar como próprio usuário");

  // Testa com profile null (deve ser false)
  const semProfile = await ehContatoProprio(meuHash, null);
  assertFalse(semProfile, "Deve retornar false se profile for null");
});

Deno.test("SELF-CONTACT: Deve obter hash próprio corretamente", async () => {
  const mockProfile: ProfileConfig = {
    name: "Pedro Oliveira",
    email: "pedro@example.com",
    vapidPublicKey: {
      kty: "EC",
      crv: "P-256",
      x: "hash-test-x",
      y: "hash-test-y",
    } as JsonWebKey,
    vapidPrivateKeyJwk: {} as JsonWebKey,
    vapidPrivateKeyEnvelope: "env",
    e2ePublicKey: {} as JsonWebKey,
    e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: {
      endpoint: "https://example.com",
      keys: { p256dh: "p", auth: "a" },
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const hashObtido = await obterHashProprio(mockProfile);
  const hashEsperado = await serializarPublicKeyVapidMock(mockProfile.vapidPublicKey);

  assertExists(hashObtido, "Hash deve ser obtido");
  assertEquals(hashObtido, hashEsperado, "Hash obtido deve corresponder ao hash da chave VAPID");

  // Testa com profile null
  const hashNull = await obterHashProprio(null);
  assertEquals(hashNull, null, "Deve retornar null se profile for null");
});

Deno.test("SELF-CONTACT: Contato próprio deve ter todas as propriedades necessárias para envio de mensagens", async () => {
  const mockProfile: ProfileConfig = {
    name: "Ana Costa",
    email: "ana@example.com",
    vapidPublicKey: {
      kty: "EC",
      crv: "P-256",
      x: "x-value",
      y: "y-value",
    } as JsonWebKey,
    vapidPrivateKeyJwk: { kty: "EC", crv: "P-256", d: "private" } as JsonWebKey,
    vapidPrivateKeyEnvelope: "encrypted-envelope",
    e2ePublicKey: { kty: "RSA", e: "AQAB", n: "public" } as JsonWebKey,
    e2ePrivateKeyJwk: { kty: "RSA", d: "private" } as JsonWebKey,
    subscription: {
      endpoint: "https://push.server.com/endpoint/12345",
      keys: {
        p256dh: "base64url-p256dh-key",
        auth: "base64url-auth-secret",
      },
    },
    createdAt: 1234567890,
    updatedAt: 1234567890,
  };

  const contato = await gerarContatoProprio(mockProfile);
  assertExists(contato);

  // Verifica todas as propriedades necessárias para o sistema de mensagens
  assertExists(contato.id, "ID deve existir");
  assertExists(contato.email, "Email deve existir");
  assertExists(contato.name, "Nome deve existir");
  assertExists(contato.vapidPublicKey, "vapidPublicKey deve existir");
  assertExists(contato.e2ePublicKey, "e2ePublicKey deve existir");
  assertExists(contato.subscription, "subscription deve existir");
  assertExists(contato.subscription.endpoint, "subscription.endpoint deve existir");
  assertExists(contato.subscription.keys.p256dh, "subscription.keys.p256dh deve existir");
  assertExists(contato.subscription.keys.auth, "subscription.keys.auth deve existir");
  assertExists(contato.vapidPrivateKeyEnvelope, "vapidPrivateKeyEnvelope deve existir");
  assertEquals(typeof contato.trusted, "boolean", "trusted deve ser boolean");
  assertExists(contato.me, "me status deve existir");
  assertExists(contato.createdAt, "createdAt deve existir");
  assertExists(contato.updatedAt, "updatedAt deve existir");
});

Deno.test("SELF-CONTACT: Múltiplas chamadas devem gerar contatos consistentes", async () => {
  const mockProfile: ProfileConfig = {
    name: "Carlos Mendes",
    email: "carlos@example.com",
    vapidPublicKey: {
      kty: "EC",
      crv: "P-256",
      x: "consistent-x",
      y: "consistent-y",
    } as JsonWebKey,
    vapidPrivateKeyJwk: {} as JsonWebKey,
    vapidPrivateKeyEnvelope: "env",
    e2ePublicKey: {} as JsonWebKey,
    e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: {
      endpoint: "https://example.com",
      keys: { p256dh: "p", auth: "a" },
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Gera o contato múltiplas vezes
  const contato1 = await gerarContatoProprio(mockProfile);
  const contato2 = await gerarContatoProprio(mockProfile);
  const contato3 = await gerarContatoProprio(mockProfile);

  assertExists(contato1);
  assertExists(contato2);
  assertExists(contato3);

  // Todos devem ter o mesmo ID (hash é determinístico)
  assertEquals(contato1.id, contato2.id, "IDs devem ser iguais");
  assertEquals(contato2.id, contato3.id, "IDs devem ser iguais");

  // Todas as propriedades críticas devem ser iguais
  assertEquals(contato1.email, contato2.email, "Emails devem ser iguais");
  assertEquals(contato1.name, contato3.name, "Nomes devem ser iguais");
});

Deno.test("SELF-CONTACT: Atualização de profile deve refletir no contato próprio", async () => {
  const mockProfile: ProfileConfig = {
    name: "Beatriz Lima",
    email: "beatriz@example.com",
    vapidPublicKey: {
      kty: "EC",
      crv: "P-256",
      x: "update-x",
      y: "update-y",
    } as JsonWebKey,
    vapidPrivateKeyJwk: {} as JsonWebKey,
    vapidPrivateKeyEnvelope: "env",
    e2ePublicKey: {} as JsonWebKey,
    e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: {
      endpoint: "https://example.com",
      keys: { p256dh: "p", auth: "a" },
    },
    createdAt: 1000,
    updatedAt: 1000,
  };

  const contatoAntigo = await gerarContatoProprio(mockProfile);
  assertExists(contatoAntigo);
  assertEquals(contatoAntigo.name, "Beatriz Lima (Eu)");
  assertEquals(contatoAntigo.email, "beatriz@example.com");

  // Simula atualização do profile
  mockProfile.name = "Bia Lima";
  mockProfile.email = "bia@example.com";
  mockProfile.updatedAt = Date.now();

  const contatoNovo = await gerarContatoProprio(mockProfile);
  assertExists(contatoNovo);
  
  // O novo contato deve refletir as atualizações
  assertEquals(contatoNovo.name, "Bia Lima (Eu)", "Nome deve ser atualizado");
  assertEquals(contatoNovo.email, "bia@example.com", "Email deve ser atualizado");
  
  // Mas o ID deve permanecer o mesmo (mesma chave VAPID)
  assertEquals(contatoAntigo.id, contatoNovo.id, "ID deve permanecer o mesmo");
});
