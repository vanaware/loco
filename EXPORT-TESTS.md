> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém múltiplos arquivos do projeto **Loco v0.2.177-mswm909i** (TESTES) estruturados em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco [v0.2.177-mswm909i] - Modo: TESTS

Gerado automaticamente em: 8/16/2026, 11:30:27 PM

---

## Arquivo: `tests/utils/jwt-helpers.test.ts`

```ts
// testes/utils/jwt-helpers.test.ts/// <reference lib="deno.ns" />
import { assert, assertEquals } from "@std/assert";
import { criarJWT, verificarJWT } from "../../src/utils/jwt-helpers.ts";
import { generateVAPIDKeys, exportKeyToJWK } from "../../src/utils/crypto-utils.ts";

Deno.test("JWT Helpers - Pipeline de Criação e Verificação E2E", async () => {
  const keys = await generateVAPIDKeys();
  const publicKeyJwk = await exportKeyToJWK(keys.publicKey);
  const privateKeyJwk = await exportKeyToJWK(keys.privateKey);

  const payload = { sub: "test", data: "offline-first-loco" };
  
  const jwt = await criarJWT(payload, privateKeyJwk, { kid: publicKeyJwk });
  assert(typeof jwt === "string" && jwt.split('.').length === 3, "JWT deve ser estruturalmente válido");
  
  const verified = await verificarJWT(jwt);
  assert(verified.valid, "A integridade do JWT precisa ser atestada matematicamente.");
  assertEquals(verified.payload.data, "offline-first-loco", "O payload não pode sofrer mutação no processo de encode/decode.");
});
```

---

## Arquivo: `tests/utils/webpush-mock.test.ts`

```ts
/// <reference lib="deno.ns" />
/// <reference lib="webworker" />

/**
 * Testes para envio e recebimento de WebPush com mocks
 * 
 * Este arquivo testa:
 * 1. enviarParaProxyMock - mock da função de envio para proxy
 * 2. Mock do self.addEventListener('push') - simula recebimento de push no Service Worker
 * 3. Fluxo completo de envio → recebimento → processamento
 */

import { assertEquals, assert, assertRejects } from "@std/assert";
import { cifrarPayloadObj } from "../../src/utils/push-utils.ts";
import { generateE2EEKeys } from "../../src/utils/crypto-utils.ts";

// ============================================================================
// MOCKS E UTILITÁRIOS DE TESTE
// ============================================================================

/**
 * Mock da função enviarParaProxy para testes
 * Armazena as chamadas feitas para verificação posterior
 */
interface MockPushCall {
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  payloadText: string;
  vapid: { subject: string; publicKey: JsonWebKey; privateKey: JsonWebKey };
  timestamp: number;
}

class EnviarParaProxyMock {
  private calls: MockPushCall[] = [];
  private shouldFail = false;
  private failWith?: Error;
  private customResponse?: { ok: boolean; status: number; text: string };

  /**
   * Configura o mock para falhar na próxima chamada
   */
  setFailMode(error?: Error) {
    this.shouldFail = true;
    this.failWith = error;
  }

  /**
   * Configura resposta personalizada
   */
  setCustomResponse(response: { ok: boolean; status: number; text: string }) {
    this.customResponse = response;
  }

  /**
   * Limpa o histórico de chamadas
   */
  clear() {
    this.calls = [];
    this.shouldFail = false;
    this.failWith = undefined;
    this.customResponse = undefined;
  }

  /**
   * Retorna todas as chamadas feitas
   */
  getCalls(): MockPushCall[] {
    return [...this.calls];
  }

  /**
   * Retorna a última chamada
   */
  getLastCall(): MockPushCall | null {
    return this.calls.length > 0 ? this.calls[this.calls.length - 1]! : null;
  }

  /**
   * Conta quantas vezes foi chamado
   */
  getCallCount(): number {
    return this.calls.length;
  }

  /**
   * Implementação mock da função enviarParaProxy
   */
  async enviar(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payloadText: string,
    vapid: { subject: string; publicKey: JsonWebKey; privateKey: JsonWebKey }
  ): Promise<void> {
    const call: MockPushCall = {
      subscription,
      payloadText,
      vapid,
      timestamp: Date.now(),
    };
    this.calls.push(call);

    if (this.shouldFail) {
      const error = this.failWith || new Error("Mock failure");
      this.shouldFail = false;
      this.failWith = undefined;
      throw error;
    }

    if (this.customResponse) {
      if (!this.customResponse.ok) {
        throw new Error(`HTTP ${this.customResponse.status}: ${this.customResponse.text}`);
      }
      return;
    }

    // Sucesso por padrão
    return;
  }
}

// Instância global do mock para uso nos testes
export const mockPushSender = new EnviarParaProxyMock();

/**
 * Mock do evento Push do Service Worker
 */
class MockPushEvent {
  dataValue: MockPushData;
  waitUntilPromise: Promise<any> | null = null;

  constructor(data: MockPushData) {
    this.dataValue = data;
  }

  get data() {
    return this.dataValue;
  }

  waitUntil(promise: Promise<any>) {
    this.waitUntilPromise = promise;
  }
}

interface MockPushData {
  text(): string;
}

/**
 * Cria dados mockados para evento push
 */
function createMockPushData(jwtToken: string): MockPushData {
  return {
    text: () => jwtToken,
  };
}

/**
 * Simula o recebimento de um evento push no Service Worker
 * Retorna uma promise que resolve quando o event.waitUntil completa
 */
async function simulatePushEvent(
  jwtToken: string,
  pushHandler: (event: any) => void
): Promise<{
  success: boolean;
  error?: string;
  notifications: Array<{ title: string; body: string }>;
}> {
  const notifications: Array<{ title: string; body: string }> = [];
  
  // Cria o evento mock
  const pushEvent = new MockPushEvent(createMockPushData(jwtToken));

  // Chama o handler
  try {
    pushHandler(pushEvent as any);
    
    // Aguarda o waitUntil completar
    if (pushEvent.waitUntilPromise) {
      await pushEvent.waitUntilPromise;
    }

    return {
      success: true,
      notifications,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      notifications,
    };
  }
}

// ============================================================================
// TESTES
// ============================================================================

Deno.test("EnviarParaProxyMock - captura chamada de envio", async () => {
  mockPushSender.clear();

  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/test123",
    keys: {
      p256dh: "BM8xKzVqP9N2vQJhLkR3mT6wY8zA1bC4dE5fG7hI9jK0lM2nO3pQ4rS5tU6vW7xY8zA",
      auth: "abc123def456",
    },
  };

  const payloadText = JSON.stringify({ title: "Teste", body: "Olá!" });
  
  const vapidKeys = await generateE2EEKeys();
  const vapid = {
    subject: "mailto:test@example.com",
    publicKey: vapidKeys.publicEncrypt,
    privateKey: vapidKeys.privateDecryptJwk,
  };

  await mockPushSender.enviar(subscription, payloadText, vapid);

  const lastCall = mockPushSender.getLastCall();
  assert(lastCall !== null, "Deve registrar a chamada");
  assertEquals(lastCall!.subscription.endpoint, subscription.endpoint);
  assertEquals(lastCall!.payloadText, payloadText);
  assertEquals(lastCall!.vapid.subject, vapid.subject);
});

Deno.test("EnviarParaProxyMock - modo de falha", async () => {
  mockPushSender.clear();
  mockPushSender.setFailMode(new Error("Falha simulada no envio"));

  const subscription = {
    endpoint: "https://example.com/push",
    keys: { p256dh: "test", auth: "test" },
  };

  await assertRejects(
    async () => {
      const keys = await generateE2EEKeys();
      await mockPushSender.enviar(subscription, "payload", {
        subject: "test",
        publicKey: keys.publicEncrypt,
        privateKey: keys.privateDecryptJwk,
      });
    },
    Error,
    "Falha simulada no envio"
  );

  // Verifica que mesmo falhando, a chamada foi registrada
  assertEquals(mockPushSender.getCallCount(), 1);
});

Deno.test("EnviarParaProxyMock - resposta personalizada HTTP 403", async () => {
  mockPushSender.clear();
  mockPushSender.setCustomResponse({
    ok: false,
    status: 403,
    text: "Forbidden - Invalid subscription",
  });

  const subscription = {
    endpoint: "https://example.com/push",
    keys: { p256dh: "test", auth: "test" },
  };

  await assertRejects(
    async () => {
      const keys = await generateE2EEKeys();
      await mockPushSender.enviar(subscription, "payload", {
        subject: "test",
        publicKey: keys.publicEncrypt,
        privateKey: keys.privateDecryptJwk,
      });
    },
    Error,
    "HTTP 403: Forbidden - Invalid subscription"
  );
});

Deno.test("EnviarParaProxyMock - múltiplas chamadas", async () => {
  mockPushSender.clear();

  for (let i = 0; i < 5; i++) {
    const keys = await generateE2EEKeys();
    await mockPushSender.enviar(
      {
        endpoint: `https://example.com/push/${i}`,
        keys: { p256dh: `key${i}`, auth: `auth${i}` },
      },
      `payload-${i}`,
      {
        subject: `test${i}@example.com`,
        publicKey: keys.publicEncrypt,
        privateKey: keys.privateDecryptJwk,
      }
    );
  }

  assertEquals(mockPushSender.getCallCount(), 5);
  
  const calls = mockPushSender.getCalls();
  for (let i = 0; i < 5; i++) {
    assertEquals(calls[i]!.subscription.endpoint, `https://example.com/push/${i}`);
    assertEquals(calls[i]!.payloadText, `payload-${i}`);
  }
});

Deno.test("cifrarPayloadObj - criptografia híbrida funcional", async () => {
  const payloadObj = {
    title: "Teste de Criptografia",
    body: "Este é um payload de teste",
    timestamp: Date.now(),
  };

  const keys = await generateE2EEKeys();
  
  const encrypted = await cifrarPayloadObj(payloadObj, keys.publicEncrypt);

  // Verifica estrutura do envelope criptografado
  assert(encrypted.i, "Deve ter IV (initialization vector)");
  assert(encrypted.d, "Deve ter dados criptografados");
  assert(encrypted.k, "Deve ter chave AES criptografada");

  // Verifica que são strings base64
  assertEquals(typeof encrypted.i, "string");
  assertEquals(typeof encrypted.d, "string");
  assertEquals(typeof encrypted.k, "string");

  // Verifica tamanhos razoáveis
  assert(encrypted.i.length > 0, "IV não pode ser vazio");
  assert(encrypted.d.length > 0, "Dados criptografados não podem ser vazios");
  assert(encrypted.k.length > 0, "Chave criptografada não pode ser vazia");
});

Deno.test("cifrarPayloadObj - payloads diferentes geram ciphertexts diferentes", async () => {
  const keys = await generateE2EEKeys();
  
  const payload1 = { message: "Hello" };
  const payload2 = { message: "Hello" }; // Mesmo conteúdo

  const encrypted1 = await cifrarPayloadObj(payload1, keys.publicEncrypt);
  const encrypted2 = await cifrarPayloadObj(payload2, keys.publicEncrypt);

  // Devido ao IV aleatório, os ciphertexts devem ser diferentes
  assertNotEquals(encrypted1.d, encrypted2.d, "Ciphertexts devem ser diferentes devido ao IV aleatório");
});

function assertNotEquals(actual: any, expected: any, msg?: string) {
  if (actual === expected) {
    throw new Error(msg || `Esperava valores diferentes, mas eram iguais: ${actual}`);
  }
}

Deno.test("Fluxo completo: envio mock → recebimento mock", async () => {
  mockPushSender.clear();

  // 1. Prepara dados
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/test",
    keys: {
      p256dh: "BM8xKzVqP9N2vQJhLkR3mT6wY8zA1bC4dE5fG7hI9jK0lM2nO3pQ4rS5tU6vW7xY8zA",
      auth: "abc123def456",
    },
  };

  const payloadObj = {
    sub: "hand",
    type: "handshake_request",
    fromId: "alice-test-123",
    timestamp: Date.now(),
  };

  const vapidKeys = await generateE2EEKeys();
  const vapid = {
    subject: "mailto:alice@example.com",
    publicKey: vapidKeys.publicEncrypt,
    privateKey: vapidKeys.privateDecryptJwk,
  };

  // 2. Envia via mock
  await mockPushSender.enviar(
    subscription,
    JSON.stringify(payloadObj),
    vapid
  );

  // 3. Verifica que foi enviado
  const lastCall = mockPushSender.getLastCall();
  assert(lastCall !== null, "Deve ter registrado o envio");
  
  const sentPayload = JSON.parse(lastCall!.payloadText);
  assertEquals(sentPayload.sub, "hand");
  assertEquals(sentPayload.fromId, "alice-test-123");

  console.log("✅ Fluxo completo de envio mock testado com sucesso");
});

Deno.test("MockPushEvent - simula evento push corretamente", async () => {
  const mockData = createMockPushData("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature");
  const pushEvent = new MockPushEvent(mockData);

  assertEquals(pushEvent.data.text(), "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature");
  
  let waitUntilCalled = false;
  const testPromise = Promise.resolve("test");
  
  pushEvent.waitUntil(testPromise);
  
  // Verifica que o waitUntil armazenou a promise
  assert(pushEvent.waitUntilPromise !== null, "waitUntil deve armazenar a promise");
});

Deno.test("simulatePushEvent - executa handler e captura notificações", async () => {
  // Mock handler simples que usa variável local para capturar notificações
  let notificationCaptured = false;
  
  const mockHandler = (event: any) => {
    event.waitUntil(
      (async () => {
        if (!event.data) return;
        const text = event.data.text();
        
        if (text.includes("invalid")) {
          notificationCaptured = true;
        }
      })()
    );
  };

  // Testa com token válido
  const result1 = await simulatePushEvent("valid.token.here", mockHandler);
  assertEquals(result1.success, true);
  assertEquals(notificationCaptured, false, "Não deve capturar notificação para token válido");

  // Testa com token inválido
  notificationCaptured = false; // Reset
  const result2 = await simulatePushEvent("invalid.token.here", mockHandler);
  assertEquals(result2.success, true);
  assertEquals(notificationCaptured, true, "Deve capturar notificação para token inválido");
});

Deno.test("Integração: envio mock + processamento mock", async () => {
  mockPushSender.clear();

  // Prepara cenário
  const payloadObj = {
    sub: "hand",
    type: "handshake_request",
    fromId: "bob-integration-test",
    data: { publicKey: "test-key-123" },
  };

  const vapidKeys = await generateE2EEKeys();
  
  // Simula envio
  await mockPushSender.enviar(
    {
      endpoint: "https://example.com/push/integration",
      keys: { p256dh: "test-p256dh", auth: "test-auth" },
    },
    JSON.stringify(payloadObj),
    {
      subject: "mailto:bob@example.com",
      publicKey: vapidKeys.publicEncrypt,
      privateKey: vapidKeys.privateDecryptJwk,
    }
  );

  // Verifica que o payload foi preservado
  const lastCall = mockPushSender.getLastCall();
  assert(lastCall !== null);
  
  const receivedPayload = JSON.parse(lastCall.payloadText);
  assertEquals(receivedPayload.type, "handshake_request");
  assertEquals(receivedPayload.fromId, "bob-integration-test");
  assertEquals(receivedPayload.data.publicKey, "test-key-123");

  console.log("✅ Integração entre envio e recebimento mock testada");
});

Deno.test("Mock com delay - simula latência de rede", async () => {
  mockPushSender.clear();
  
  // Adiciona delay artificial usando Promise ao invés de setTimeout solto
  const delayPromise = new Promise<void>(async (resolve) => {
    await new Promise(resolve => setTimeout(resolve, 50));
    const keys = await generateE2EEKeys();
    await mockPushSender.enviar(
      {
        endpoint: "https://example.com/push/delayed",
        keys: { p256dh: "test", auth: "test" },
      },
      "delayed-payload",
      {
        subject: "test@example.com",
        publicKey: keys.publicEncrypt,
        privateKey: keys.privateDecryptJwk,
      }
    );
    resolve();
  });
  
  // Aguarda o delayPromise completar
  await delayPromise;

  assertEquals(mockPushSender.getCallCount(), 1);
  console.log(`✅ Mock com delay testado`);
});

Deno.test("Reset do mock entre testes", async () => {
  // Garante que começa limpo
  mockPushSender.clear();
  
  // Primeiro teste
  const keys1 = await generateE2EEKeys();
  await mockPushSender.enviar(
    { endpoint: "https://test1.com", keys: { p256dh: "k1", auth: "a1" } },
    "payload1",
    {
      subject: "test1@example.com",
      publicKey: keys1.publicEncrypt,
      privateKey: keys1.privateDecryptJwk,
    }
  );

  assertEquals(mockPushSender.getCallCount(), 1);

  // Reset
  mockPushSender.clear();
  assertEquals(mockPushSender.getCallCount(), 0);

  // Segundo teste após reset
  const keys2 = await generateE2EEKeys();
  await mockPushSender.enviar(
    { endpoint: "https://test2.com", keys: { p256dh: "k2", auth: "a2" } },
    "payload2",
    {
      subject: "test2@example.com",
      publicKey: keys2.publicEncrypt,
      privateKey: keys2.privateDecryptJwk,
    }
  );

  assertEquals(mockPushSender.getCallCount(), 1);
  assertEquals(mockPushSender.getLastCall()!.payloadText, "payload2");
});

console.log("\n🧪 Todos os testes de WebPush mock carregados!");
console.log("📦 Recursos disponíveis:");
console.log("   - mockPushSender: Mock para enviarParaProxy");
console.log("   - MockPushEvent: Simula evento push do Service Worker");
console.log("   - simulatePushEvent: Função helper para testar handlers");
console.log("   - createMockPushData: Cria dados mockados para eventos push\n");

```

---

## Arquivo: `tests/utils/self-contact.test.ts`

```ts
// tests/utils/self-contact.test.ts
/// <reference lib="deno.ns" />
import { assertEquals, assertExists, assertFalse, assert } from "@std/assert";
import type { ProfileConfig, Contato } from "../../src/constants/db.ts";
import { gerarContatoProprio, ehContatoProprio, obterHashProprio } from "../../src/utils/self-contact-utils.ts";

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

```

---

## Arquivo: `tests/utils/share-utils.test.ts`

```ts
// tests/utils/share-utils.test.ts
/// <reference lib="deno.ns" />
import { assert, assertEquals, assertRejects } from "@std/assert";
import { gerarLinkConviteWeb, processarQualquerConvite, extrairDadosCompactos, expandirDadosCompactos } from "../../src/utils/share-utils.ts";
import { generateVAPIDKeys, generateE2EEKeys, exportKeyToJWK } from "../../src/utils/crypto-utils.ts";
import type { ProfileConfig, Contato } from "../../src/constants/db.ts";

// Mock simples para as funções de DB que não podemos usar em testes unitários puros
const mockContatos = new Map<string, Contato>();

async function salvarContatoMock(contato: Contato): Promise<void> {
  mockContatos.set(contato.id, contato);
}

async function buscarContatoPorChaveMock(hash: string): Promise<Contato | null> {
  return mockContatos.get(hash) || null;
}

async function serializarPublicKeyVapidMock(key: JsonWebKey): Promise<string> {
  const data = `${key.x}:${key.y}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.test("Share Utils - Geração e Importação de cJWT para Profile e Contato", async () => {
  // Setup: Criar dois perfis simulando dois usuários
  const userA: ProfileConfig = {
    name: "Usuário A",
    email: "usuario.a@teste.com",
    vapidPublicKey: {} as JsonWebKey,
    vapidPrivateKeyJwk: {} as JsonWebKey,
    vapidPrivateKeyEnvelope: "",
    e2ePublicKey: {} as JsonWebKey,
    e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: {
      endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint-a",
      keys: { p256dh: "p256dh-a", auth: "auth-a" },
      proxyserver: "https://mock.loco.proxy"
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const userB: ProfileConfig = {
    name: "Usuário B",
    email: "usuario.b@teste.com",
    vapidPublicKey: {} as JsonWebKey,
    vapidPrivateKeyJwk: {} as JsonWebKey,
    vapidPrivateKeyEnvelope: "",
    e2ePublicKey: {} as JsonWebKey,
    e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: {
      endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint-b",
      keys: { p256dh: "p256dh-b", auth: "auth-b" },
      proxyserver: "https://mock.loco.proxy"
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  // Gerar chaves criptográficas reais para ambos os usuários
  const [vapidKeysA, e2eKeysA, vapidKeysB, e2eKeysB] = await Promise.all([
    generateVAPIDKeys(),
    generateE2EEKeys(),
    generateVAPIDKeys(),
    generateE2EEKeys()
  ]);

  userA.vapidPublicKey = await exportKeyToJWK(vapidKeysA.publicKey);
  userA.vapidPrivateKeyJwk = await exportKeyToJWK(vapidKeysA.privateKey);
  userA.e2ePublicKey = e2eKeysA.publicEncrypt;
  userA.e2ePrivateKeyJwk = e2eKeysA.privateDecryptJwk;

  userB.vapidPublicKey = await exportKeyToJWK(vapidKeysB.publicKey);
  userB.vapidPrivateKeyJwk = await exportKeyToJWK(vapidKeysB.privateKey);
  userB.e2ePublicKey = e2eKeysB.publicEncrypt;
  userB.e2ePrivateKeyJwk = e2eKeysB.privateDecryptJwk;

  // Teste 1: Extrair dados compactos do Profile A
  console.log("📦 Teste 1: Extraindo dados compactos do Profile A (Static Schema Compression)");
  // 🔥 ARQUITETURA: Agora a extração é assíncrona, exigindo await.
  const compactDataA = await extrairDadosCompactos(userA);
  
  assertEquals(compactDataA.nm, "Usuário A", "Nome deve ser extraído corretamente");
  assertEquals(compactDataA.em, "usuario.a@teste.com", "Email deve ser extraído corretamente");
  
  // 🔥 ARQUITETURA: Testando as novas propriedades minificadas 'vp' e 'ep'
  assertEquals(compactDataA.vp.x, userA.vapidPublicKey.x, "Chave VAPID X deve ser extraída no bloco VP");
  assertEquals(compactDataA.vp.y, userA.vapidPublicKey.y, "Chave VAPID Y deve ser extraída no bloco VP");
  assert(compactDataA.ep.n !== undefined, "Módulo 'n' da Chave E2E deve ser extraído no bloco EP");

  // Teste 2: Expandir dados compactos de volta para formato Contato
  console.log("🔄 Teste 2: Expandindo dados compactos para formato Contato");
  const expandedData = expandirDadosCompactos(compactDataA);
  assertEquals(expandedData.name, "Usuário A", "Nome deve ser expandido corretamente");
  assertEquals(expandedData.email, "usuario.a@teste.com", "Email deve ser expandido corretamente");
  assert(expandedData.vapidPublicKey !== undefined, "Chave VAPID deve ser expandida");
  assert(expandedData.e2ePublicKey !== undefined, "Chave E2E deve ser expandida");

  // Teste 3: Gerar cJWT de convite (simulando exportação do profile)
  console.log("🔐 Teste 3: Gerando cJWT de convite com Profile A");
  const cjwtUrl = await gerarLinkConviteWeb(userA, userA.vapidPrivateKeyJwk, userA.vapidPublicKey, 'http://test.localhost');
  assert(cjwtUrl.includes("#share="), "URL deve conter parâmetro share");
  
  // Extrair apenas o token cJWT da URL (parte após #share=)
  const cjwtToken = cjwtUrl.split("#share=")[1];
  assert(cjwtToken && cjwtToken.length > 0, "cJWT deve ser gerado");
  console.log(`   cJWT gerado: ${cjwtToken.substring(0, 50)}...`);

  // Teste 4: Processar cJWT para importar como contato (simulando importação pelo Usuário B)
  console.log("📥 Teste 4: Processando cJWT para importar como contato");
  // Passar apenas o token, não a URL completa
  const importedContato = await processarQualquerConvite(cjwtToken);
  
  assertEquals(importedContato.name, "Usuário A", "Nome do contato importado deve bater");
  assertEquals(importedContato.email, "usuario.a@teste.com", "Email do contato importado deve bater");
  assert(importedContato.vapidPublicKey !== undefined, "Chave VAPID deve estar presente");
  assert(importedContato.e2ePublicKey !== undefined, "Chave E2E deve estar presente");
  assert(importedContato.subscription !== undefined, "Subscription deve estar presente");
  assertEquals(importedContato.subscription.endpoint, "https://fcm.googleapis.com/fcm/send/test-endpoint-a", "Endpoint deve bater");

  // Teste 5: Verificar integridade das chaves após importação
  console.log("✅ Teste 5: Verificando integridade das chaves após importação");
  assertEquals(
    (importedContato.vapidPublicKey as JsonWebKey).x,
    userA.vapidPublicKey.x,
    "Chave VAPID X deve ser idêntica após importação"
  );
  assertEquals(
    (importedContato.vapidPublicKey as JsonWebKey).y,
    userA.vapidPublicKey.y,
    "Chave VAPID Y deve ser idêntica após importação"
  );
  assertEquals(
    (importedContato.e2ePublicKey as JsonWebKey).n,
    userA.e2ePublicKey.n,
    "Chave E2E N deve ser idêntica após importação"
  );

  // Teste 6: Simular salvamento do contato importado no banco de dados
  console.log("💾 Teste 6: Salvando contato importado no banco de dados (mock)");
  const contatoHash = await serializarPublicKeyVapidMock(userA.vapidPublicKey);
  const novoContato: Contato = {
    id: contatoHash,
    name: importedContato.name!,
    email: importedContato.email!,
    vapidPublicKey: importedContato.vapidPublicKey!,
    e2ePublicKey: importedContato.e2ePublicKey!,
    subscription: importedContato.subscription!,
    vapidPrivateKeyEnvelope: importedContato.vapidPrivateKeyEnvelope!,
    trusted: false,
    me: 'saved',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  await salvarContatoMock(novoContato);
  const contatoSalvo = await buscarContatoPorChaveMock(contatoHash);
  assert(contatoSalvo !== null, "Contato deve ser salvo no banco (mock)");
  assertEquals(contatoSalvo!.name, "Usuário A", "Nome do contato salvo deve bater");

  // Teste 7: Testar cJWT direto (sem URL wrapper)
  console.log("🧪 Teste 7: Processando cJWT direto (string pura)");
  const contatoDireto = await processarQualquerConvite(cjwtToken);
  assertEquals(contatoDireto.name, "Usuário A", "cJWT direto deve funcionar");

  // Teste 8: Testar formato QR Code compacto (cqr)
  console.log("📱 Teste 8: Testando formato QR Code compacto");
  // 🔥 ARQUITETURA: Agora a extração é assíncrona, exigindo await.
  const cqrData = await extrairDadosCompactos(userA);
  const cqrJson = JSON.stringify(cqrData);
  const cqrBytes = new TextEncoder().encode(cqrJson);
  
  const { gzipSync } = await import('fflate');
  const compressed = gzipSync(cqrBytes);
  const { arrayBufferToBase64Url } = await import('../../src/utils/jwt-helpers.ts');
  const cqrToken = arrayBufferToBase64Url(compressed.buffer as ArrayBuffer);
  
  const contatoCqr = await processarQualquerConvite(cqrToken);
  assertEquals(contatoCqr.name, "Usuário A", "QR Code compacto deve funcionar");

  // Teste 9: Testar JWT não-compresso
  console.log("📝 Teste 9: Testando JWT não-compresso");
  const { criarJWT } = await import('../../src/utils/jwt-helpers.ts');
  // 🔥 ARQUITETURA: Agora a extração é assíncrona, exigindo await dentro do spread operator.
  const extraidos = await extrairDadosCompactos(userA);
  const jwtPayload = {
    sub: "contact",
    ...extraidos,
    iat: Math.floor(Date.now() / 1000)
  };
  const jwtToken = await criarJWT(jwtPayload, userA.vapidPrivateKeyJwk, { kid: userA.vapidPublicKey });
  
  const contatoJwt = await processarQualquerConvite(jwtToken);
  assertEquals(contatoJwt.name, "Usuário A", "JWT não-compresso deve funcionar");

  // Teste 10: Testar erro com token inválido
  console.log("❌ Teste 10: Testando erro com token inválido");
  await assertRejects(
    async () => await processarQualquerConvite("token-invalido-abc123"),
    Error,
    // 🔥 ARQUITETURA: Atualizado para a nova mensagem de erro
    "O link ou código colado não é um convite válido do Loco."
  );

  console.log("✅ Todos os testes de cJWT passaram!");
});

Deno.test("Share Utils - Reciprocidade na troca de contatos via cJWT", async () => {
  // Setup: Dois usuários completos
  const userX: ProfileConfig = {
    name: "Alice",
    email: "alice@example.com",
    vapidPublicKey: {} as JsonWebKey,
    vapidPrivateKeyJwk: {} as JsonWebKey,
    vapidPrivateKeyEnvelope: "",
    e2ePublicKey: {} as JsonWebKey,
    e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: {
      endpoint: "https://example.com/alice",
      keys: { p256dh: "alice-p256dh", auth: "alice-auth" },
      proxyserver: "https://mock.loco.proxy"
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const userY: ProfileConfig = {
    name: "Bob",
    email: "bob@example.com",
    vapidPublicKey: {} as JsonWebKey,
    vapidPrivateKeyJwk: {} as JsonWebKey,
    vapidPrivateKeyEnvelope: "",
    e2ePublicKey: {} as JsonWebKey,
    e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: {
      endpoint: "https://example.com/bob",
      keys: { p256dh: "bob-p256dh", auth: "bob-auth" },
      proxyserver: "https://mock.loco.proxy"
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  // Gerar chaves para ambos
  const [vapidX, e2eX, vapidY, e2eY] = await Promise.all([
    generateVAPIDKeys(),
    generateE2EEKeys(),
    generateVAPIDKeys(),
    generateE2EEKeys()
  ]);

  userX.vapidPublicKey = await exportKeyToJWK(vapidX.publicKey);
  userX.vapidPrivateKeyJwk = await exportKeyToJWK(vapidX.privateKey);
  userX.e2ePublicKey = e2eX.publicEncrypt;
  userX.e2ePrivateKeyJwk = e2eX.privateDecryptJwk;

  userY.vapidPublicKey = await exportKeyToJWK(vapidY.publicKey);
  userY.vapidPrivateKeyJwk = await exportKeyToJWK(vapidY.privateKey);
  userY.e2ePublicKey = e2eY.publicEncrypt;
  userY.e2ePrivateKeyJwk = e2eY.privateDecryptJwk;

  // Alice gera convite e Bob importa
  const aliceInviteUrl = await gerarLinkConviteWeb(userX, userX.vapidPrivateKeyJwk, userX.vapidPublicKey, 'http://test.localhost');
  const aliceCjwt = aliceInviteUrl.split("#share=")[1]!;
  const bobImportouAlice = await processarQualquerConvite(aliceCjwt);
  
  assertEquals(bobImportouAlice.name, "Alice", "Bob deve importar Alice corretamente");
  assertEquals(bobImportouAlice.email, "alice@example.com", "Email deve bater");

  // Bob gera convite e Alice importa
  const bobInviteUrl = await gerarLinkConviteWeb(userY, userY.vapidPrivateKeyJwk, userY.vapidPublicKey, 'http://test.localhost');
  const bobCjwt = bobInviteUrl.split("#share=")[1]!;
  const aliceImportouBob = await processarQualquerConvite(bobCjwt);
  
  assertEquals(aliceImportouBob.name, "Bob", "Alice deve importar Bob corretamente");
  assertEquals(aliceImportouBob.email, "bob@example.com", "Email deve bater");

  // Verificar reciprocidade: ambos devem ter dados válidos do outro
  assert(
    (bobImportouAlice.vapidPublicKey as JsonWebKey).x === userX.vapidPublicKey.x,
    "Bob deve ter a chave pública correta de Alice"
  );
  assert(
    (aliceImportouBob.vapidPublicKey as JsonWebKey).x === userY.vapidPublicKey.x,
    "Alice deve ter a chave pública correta de Bob"
  );

  console.log("✅ Teste de reciprocidade passou!");
});
```

---

## Arquivo: `tests/utils/id-utils.test.ts`

```ts
// tests/id-utils.test.ts
import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { gerarId, gerarIdFallback, validarId } from "../../src/utils/id-utils.ts";

Deno.test("gerarId - Deve gerar um ID no formato string e com tamanho adequado", () => {
  const id = gerarId();
  
  assert(typeof id === "string", "O ID gerado deve ser uma string");
  assert(id.length > 0 && id.length <= 24, "O tamanho do ID deve estar entre 1 e 24 caracteres");
});

Deno.test("gerarId - Não deve gerar IDs duplicados em chamadas sequenciais", () => {
  const id1 = gerarId();
  const id2 = gerarId();
  
  assertNotEquals(id1, id2, "IDs gerados sequencialmente não podem ser idênticos");
});

Deno.test("gerarIdFallback - Deve funcionar como alternativa segura", () => {
  const idFallback = gerarIdFallback();
  
  assert(typeof idFallback === "string", "O ID de fallback deve ser uma string");
  assert(idFallback.length > 0, "O ID de fallback não pode ser vazio");
});

Deno.test("validarId - Deve validar corretamente limites de tamanho", () => {
  const idValido = gerarId();
  const idInvalidoLongo = "a".repeat(25); // Mais de 24 caracteres
  const idInvalidoVazio = "";

  assertEquals(validarId(idValido), true, "Deve aceitar um ID gerado pela própria função");
  assertEquals(validarId(idInvalidoLongo), false, "Não deve aceitar IDs maiores que 24 caracteres");
  assertEquals(validarId(idInvalidoVazio), false, "Não deve aceitar IDs vazios");
});
```

---

## Arquivo: `tests/utils/crypto-utils.test.ts`

```ts
// tests/crypto-utils.test.ts
import { assertEquals, assert } from "@std/assert";
import { 
  minifyVapidPublic, expandVapidPublic,
  minifyRsaPublic, expandRsaPublic
} from "../../src/utils/crypto-utils.ts";

Deno.test("Crypto Utils - Minificação e Expansão de VAPID Public (ECDSA P-256)", () => {
  const mockJwkOriginal: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: "base64Url_String_X_Aqui_Ficticia",
    y: "base64Url_String_Y_Aqui_Ficticia",
    ext: true,
    key_ops: ["verify"]
  };

  // Minifica: Deve sobrar apenas X e Y
  const minified = minifyVapidPublic(mockJwkOriginal);
  assert(minified.x === mockJwkOriginal.x, "Deve conter a coordenada X");
  assert(minified.y === mockJwkOriginal.y, "Deve conter a coordenada Y");
  assert(minified.kty === undefined, "Não deve conter o kty");
  assert(minified.crv === undefined, "Não deve conter a curva");

  // Expande: Deve reconstruir a chave perfeitamente
  const expanded = expandVapidPublic(minified);
  assertEquals(expanded.kty, "EC");
  assertEquals(expanded.crv, "P-256");
  assertEquals(expanded.x, mockJwkOriginal.x);
  assertEquals(expanded.y, mockJwkOriginal.y);
  assertEquals(expanded.ext, true);
  assertEquals(expanded.key_ops, ["verify"]);
});

Deno.test("Crypto Utils - Minificação e Expansão de RSA Public", () => {
  const mockRsaOriginal: JsonWebKey = {
    kty: "RSA",
    alg: "RSA-OAEP-256",
    e: "AQAB",
    n: "modulo_matematico_gigante_aqui",
    ext: true,
    key_ops: ["encrypt"]
  };

  // Minifica: Só o módulo 'n' importa em chaves RSA-OAEP padronizadas
  const minified = minifyRsaPublic(mockRsaOriginal);
  assert(minified.n === mockRsaOriginal.n, "Deve reter o módulo N");
  assert(minified.kty === undefined, "Deve omitir a tipagem kty");

  // Expande: Reconstrói o esquema
  const expanded = expandRsaPublic(minified);
  assertEquals(expanded.kty, "RSA");
  assertEquals(expanded.alg, "RSA-OAEP-256");
  assertEquals(expanded.e, "AQAB");
  assertEquals(expanded.n, mockRsaOriginal.n);
});

Deno.test("Crypto Utils - Expansão de chave já expandida (Idempotência)", () => {
  const jwk: JsonWebKey = { kty: "RSA", n: "123", e: "AQAB" };
  const expanded = expandRsaPublic(jwk);
  
  // Se eu passar algo que já tem 'kty', ele não deve tentar reconstruir o que não precisa
  assertEquals(expanded, jwk, "A função de expansão deve ser idempotente se a chave não estiver minificada");
});
```

---

## Arquivo: `tests/utils/crypto-aes.test.ts`

```ts
// tests/utils/crypto-aes.test.ts
/// <reference lib="deno.ns" />
import { assertEquals, assert, assertRejects } from "@std/assert";
import { encryptTextAES, decryptTextAES } from "../../src/utils/crypto-utils.ts";

Deno.test("Crypto AES - Criptografar e Descriptografar texto puro (Roundtrip)", async () => {
  // Gera uma chave AES-GCM temporária para o teste
  const secretKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const plainText = "Mensagem altamente confidencial P2P do Loco!";
  
  // Criptografa
  const { cipherTextBase64, ivBase64 } = await encryptTextAES(secretKey, plainText);
  
  assert(cipherTextBase64.length > 0, "O texto cifrado gerado não pode ser vazio");
  assert(ivBase64.length > 0, "O Vetor de Inicialização (IV) não pode ser vazio");
  
  // Descriptografa
  const decryptedText = await decryptTextAES(secretKey, cipherTextBase64, ivBase64);
  
  assertEquals(decryptedText, plainText, "O texto decifrado deve ser exatamente igual à mensagem original");
});

Deno.test("Crypto AES - Deve falhar ao descriptografar com a chave AES incorreta", async () => {
  // Gera duas chaves distintas
  const key1 = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const key2 = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

  // Criptografa com a Chave 1
  const { cipherTextBase64, ivBase64 } = await encryptTextAES(key1, "Segredo do Handshake");

  // Tenta quebrar a criptografia usando a Chave 2
  await assertRejects(
    async () => {
      await decryptTextAES(key2, cipherTextBase64, ivBase64);
    },
    Error,
    "A decodificação falhou",
    "A função deve rejeitar (throw Error) quando uma chave AES errada tenta abrir o envelope"
  );
});

Deno.test("Crypto AES - Deve falhar caso o IV (Vetor de Inicialização) seja adulterado", async () => {
  const secretKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const { cipherTextBase64 } = await encryptTextAES(secretKey, "Dados sensíveis");

  // Geramos um IV falso aleatório, simulando uma adulteração (Man-in-the-Middle ou corrupção de rede)
  const fakeIv = crypto.getRandomValues(new Uint8Array(12));
  const fakeIvBase64 = btoa(String.fromCharCode(...fakeIv)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  await assertRejects(
    async () => {
      await decryptTextAES(secretKey, cipherTextBase64, fakeIvBase64);
    },
    Error,
    "A decodificação falhou",
    "O AES-GCM deve garantir a integridade e rejeitar a decifragem se o IV for modificado"
  );
});
```

---

## Arquivo: `tests/utils/config.test.ts`

```ts
// tests/utils/config.test.ts
/// <reference lib="deno.ns" />
import { assertEquals, assertStringIncludes } from "@std/assert";
import { getAbsoluteProxyUrl, buildProxyUrl } from "../../src/constants/config.ts";

// Helper para injetar um Mock do objeto `location` global (simulando o Browser no Deno)
function mockGlobalLocation(origin: string, pathname: string) {
  (globalThis as any).location = {
    origin,
    pathname,
  };
}

Deno.test("Config Utils - getAbsoluteProxyUrl respeita URLs absolutas informadas pelo contato", async () => {
  const urlDestinoExterna = "https://servidor-amigo.workers.dev";
  
  // Se o contato forneceu a URL absoluta do servidor dele, o sistema NÂO deve reescrever isso
  const result = await getAbsoluteProxyUrl(urlDestinoExterna);
  
  assertEquals(result, urlDestinoExterna, "Deve retornar a URL absoluta intacta");
});

Deno.test("Config Utils - getAbsoluteProxyUrl limpa barras duplicadas no final da URL absoluta", async () => {
  const urlSuja = "https://proxy-baguncado.com//";
  const result = await getAbsoluteProxyUrl(urlSuja);
  
  assertEquals(result, "https://proxy-baguncado.com", "Deve remover barras à direita (trailing slashes)");
});

Deno.test("Config Utils - getAbsoluteProxyUrl resolve rotas relativas baseado na origem atual do App", async () => {
  // Simulando que o App está rodando em "https://meu-loco-app.com/"
  mockGlobalLocation("https://meu-loco-app.com", "/");
  
  const rotaRelativaProxy = "/api";
  const result = await getAbsoluteProxyUrl(rotaRelativaProxy);
  
  assertEquals(result, "https://meu-loco-app.com/api", "Deve concatenar a origem local com o caminho do proxy");
});

Deno.test("Config Utils - getAbsoluteProxyUrl entende quando o PWA é servido a partir de um subdiretório", async () => {
  // Simulando que o App está hospedado no Github Pages (subdiretório: /meu-repo/)
  mockGlobalLocation("https://usuario.github.io", "/meu-repo/index.html");
  
  const rotaRelativaProxy = "/push-handler";
  const result = await getAbsoluteProxyUrl(rotaRelativaProxy);
  
  // Note que ele deve entender que "/meu-repo/" é a base, e ignorar o arquivo "index.html"
  assertEquals(result, "https://usuario.github.io/meu-repo/push-handler", "Deve respeitar o subdiretório de hospedagem");
});

Deno.test("Config Utils - buildProxyUrl monta a URI do endpoint corretamente", async () => {
  const proxyAbsoluto = "https://relay.loco.net";
  
  const urlPush = await buildProxyUrl("/push", proxyAbsoluto);
  const urlPing = await buildProxyUrl("ping", proxyAbsoluto); // Sem barra inicial para testar resiliência
  
  assertEquals(urlPush, "https://relay.loco.net/push");
  assertEquals(urlPing, "https://relay.loco.net/ping");
});
```

---

## Arquivo: `tests/utils/db-helpers.test.ts`

```ts
// tests/utils/db-helpers.test.ts
/// <reference lib="deno.ns" />

// 🔥 A MÁGICA ACONTECE AQUI (CORRIGIDO PARA DENO 2.X): 
// Usando o prefixo 'npm:' nativo do Deno em vez do 'esm.sh'.
// Ele cria um banco de dados real na RAM e injeta o 'indexedDB' no escopo global (globalThis),
// enganando a biblioteca 'idb-keyval' perfeitamente.
import "npm:fake-indexeddb@6.0.0/auto";

import { assertEquals, assertExists } from "@std/assert";
import {
  salvarProfile,
  buscarProfile,
  removerProfile,
  salvarChat,
  listarChatPaginado,
  removerTodoHistoricoChat
} from "../../src/utils/db-helpers.ts";
import type { ProfileConfig, Chat } from "../../src/constants/db.ts";

Deno.test("DB Helpers - Profile: Deve salvar, buscar e remover o perfil corretamente", async () => {
  const mockProfile: ProfileConfig = {
    name: "Arquiteto Loco",
    email: "arq@loco.pwa",
    vapidPublicKey: { kty: "EC", crv: "P-256", x: "123", y: "456" } as JsonWebKey,
    vapidPrivateKeyJwk: { kty: "EC", d: "789" } as JsonWebKey,
    vapidPrivateKeyEnvelope: "envelope_cifrado",
    e2ePublicKey: { kty: "RSA", n: "abc", e: "AQAB" } as JsonWebKey,
    e2ePrivateKeyJwk: { kty: "RSA", d: "def" } as JsonWebKey,
    subscription: {
      endpoint: "https://push.com/123",
      keys: { p256dh: "p256", auth: "auth" },
      proxyserver: "https://loco.proxy"
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  // 1. Testa o Salvamento
  await salvarProfile(mockProfile);
  
  // 2. Testa a Busca (Lembrando que o DB Helper faz compressão/descompressão matemática por baixo dos panos)
  const profileSalvo = await buscarProfile();
  assertExists(profileSalvo, "O perfil deve existir no IndexedDB da memória");
  assertEquals(profileSalvo.name, "Arquiteto Loco", "O nome deve ser preservado");
  assertEquals(profileSalvo.email, "arq@loco.pwa", "O email deve ser preservado");
  
  // Verifica se a reconstrução (expandVapidPublic, etc) funcionou
  assertEquals(profileSalvo.vapidPublicKey.kty, "EC", "A chave pública VAPID deve ser expandida corretamente");
  
  // 3. Testa a Remoção
  await removerProfile();
  const profileRemovido = await buscarProfile();
  assertEquals(profileRemovido, undefined, "O perfil deve retornar undefined após ser apagado");
});

Deno.test("DB Helpers - Chat: Deve salvar mensagens e retornar paginado corretamente", async () => {
  const contatoHash = "hash-contato-paginacao-123";
  
  // Limpa o estado antes do teste (útil se rodar múltiplos testes na mesma RAM)
  await removerTodoHistoricoChat(contatoHash);

  // 1. Vamos gerar 35 mensagens simuladas para testar a paginação (nosso PAGE_SIZE é 30 no store)
  const totalMensagens = 35;
  for (let i = 1; i <= totalMensagens; i++) {
    const msg: Chat = {
      id: `msg-${i.toString().padStart(2, '0')}`, // msg-01, msg-02...
      contatoHash: contatoHash,
      conteudo: `Mensagem de teste número ${i}`,
      tipo: 'out',
      createdAt: 10000 + i, // Tempos sequenciais para garantir ordem
      handshake: `hand-${i}`
    };
    await salvarChat(msg);
  }

  // 2. Testa a busca da primeira página (limit: 30, offset: 0)
  // Como são 35 mensagens no total, offset 0 (as mais recentes) deve trazer da msg-06 até msg-35
  const pagina1 = await listarChatPaginado(contatoHash, 30, 0);
  
  assertEquals(pagina1.length, 30, "A primeira página deve trazer exatamente 30 mensagens");
  
  // Utilizando '!' para informar ao TypeScript Strict que sabemos que o índice existe
  assertEquals(pagina1[pagina1.length - 1]!.id, "msg-35", "A última mensagem da página 1 deve ser a mais recente (msg-35)");
  assertEquals(pagina1[0]!.id, "msg-06", "A primeira mensagem da página 1 deve ser a msg-06");

  // 3. Testa a busca da segunda página (limit: 30, offset: 30)
  // Como já pulamos 30, devem sobrar as 5 mensagens mais antigas (msg-01 até msg-05)
  const pagina2 = await listarChatPaginado(contatoHash, 30, 30);
  
  assertEquals(pagina2.length, 5, "A segunda página deve trazer as 5 mensagens restantes");
  assertEquals(pagina2[pagina2.length - 1]!.id, "msg-05", "A última mensagem da página 2 deve ser a msg-05");
  assertEquals(pagina2[0]!.id, "msg-01", "A primeira mensagem da página 2 deve ser a msg-01");

  // 4. Testa a busca além do limite (offset >= total)
  const paginaVazia = await listarChatPaginado(contatoHash, 30, 35);
  assertEquals(paginaVazia.length, 0, "Deve retornar array vazio se o offset ultrapassar o total de mensagens");

  // 5. Limpeza Total
  await removerTodoHistoricoChat(contatoHash);
  const paginaPosExclusao = await listarChatPaginado(contatoHash, 30, 0);
  assertEquals(paginaPosExclusao.length, 0, "O histórico de chat deve estar zerado após o expurgo");
});
```

---

## Arquivo: `tests/utils/push-utils.test.ts`

```ts
// tests/utils/push-utils.test.ts
/// <reference lib="deno.ns" />
import { assert, assertEquals } from "@std/assert";
import { cifrarChaveVapid } from "../../src/utils/push-utils.ts";
import { generateVAPIDKeys, generateE2EEKeys, exportKeyToJWK } from "../../src/utils/crypto-utils.ts";

Deno.test("Push Utils - Blindagem do Servidor (cifrarChaveVapid)", async () => {
  // 1. Cenário: O Cliente PWA acabou de gerar sua chave VAPID privada
  const clientKeys = await generateVAPIDKeys();
  const clientVapidPrivateJwk = await exportKeyToJWK(clientKeys.privateKey);

  // 2. Cenário: O Servidor (Loco Proxy) disponibilizou sua chave Pública RSA
  const serverKeys = await generateE2EEKeys();
  const serverPublicJwk = serverKeys.publicEncrypt;

  // 3. AÇÃO: O Cliente blinda sua chave VAPID privada para enviar ao proxy
  const envelopeBase64 = await cifrarChaveVapid(clientVapidPrivateJwk, serverPublicJwk);
  
  // 4. VERIFICAÇÃO ESTRUTURAL
  assert(typeof envelopeBase64 === "string", "O envelope gerado deve ser uma string Base64");
  assert(envelopeBase64.length > 50, "O envelope não pode ser vazio");

  // Decodifica o base64 para verificar o JSON interno (sem quebrar a criptografia AES/RSA)
  const envelopeJsonStr = atob(envelopeBase64);
  const envelopeObj = JSON.parse(envelopeJsonStr);

  assert(envelopeObj.iv !== undefined, "O envelope deve conter um Vetor de Inicialização (iv)");
  assert(envelopeObj.dadosCifrados !== undefined, "O envelope deve conter os dados cifrados em AES (dadosCifrados)");
  assert(envelopeObj.chaveAesCifrada !== undefined, "O envelope deve conter a chave AES trancada pela chave RSA do servidor (chaveAesCifrada)");
  
  // O AES-GCM IV sempre terá 24 caracteres hexadecimais (12 bytes)
  assertEquals(envelopeObj.iv.length, 24, "O IV em hexadecimal deve ter exatamente 24 caracteres");
});
```

---

## Arquivo: `tests/handshakes/hand-mensagem-self.test.ts`

```ts
/// <reference lib="deno.ns" />
import { assertEquals, assertExists, assertFalse, assert } from "@std/assert";
import type { ProfileConfig, Chat, Handshake } from "../../src/constants/db.ts";
import { gerarContatoProprio, ehContatoProprio, obterHashProprio } from "../../src/utils/self-contact-utils.ts";

// Helper para substituir assertTrue
function assertTrue(condition: boolean, msg?: string) {
  assert(condition, msg);
}

/**
 * Testes para funcionalidade de auto-mensagem (mensagem para si mesmo)
 * 
 * Esta suite testa o comportamento do sistema quando:
 * 1. O usuário envia mensagem para seu próprio contato
 * 2. A mensagem é salva localmente sem criar handshake
 * 3. A mensagem recebe todos os timestamps de fluxo completo (sentAt, receivedAt, readAt, notifiedAt)
 */

// Mock storage para simular IndexedDB
const mockChats = new Map<string, Chat>();
const mockHandshakes = new Map<string, Handshake>();

async function salvarChatMock(chat: Chat): Promise<void> {
  mockChats.set(chat.id, chat);
}

async function salvarHandshakeMock(handshake: Handshake): Promise<void> {
  mockHandshakes.set(handshake.id, handshake);
}

// Mock profile consistente para todos os testes
const mockProfile: ProfileConfig = {
  name: "Usuário Teste",
  email: "teste@example.com",
  vapidPublicKey: {
    kty: "EC",
    crv: "P-256",
    x: "test-x-value",
    y: "test-y-value",
  } as JsonWebKey,
  vapidPrivateKeyJwk: {} as JsonWebKey,
  vapidPrivateKeyEnvelope: "encrypted",
  e2ePublicKey: {} as JsonWebKey,
  e2ePrivateKeyJwk: {} as JsonWebKey,
  subscription: {
    endpoint: "https://push.example.com/sub",
    keys: { p256dh: "p256dh", auth: "auth" },
  },
  createdAt: Date.now() - 10000,
  updatedAt: Date.now(),
};

// Helper para calcular hash
async function calcularHashVapid(jwk: JsonWebKey): Promise<string> {
  const raw = `${jwk.kty?.toLowerCase() || ''}|${jwk.crv?.toLowerCase() || ''}|${jwk.x?.toLowerCase() || ''}|${jwk.y?.toLowerCase() || ''}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(raw));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.test("HAND-MENSAGEM SELF: Deve identificar envio para si mesmo", async () => {
  const meuHash = await obterHashProprio(mockProfile);
  assertExists(meuHash);
  
  const outroHash = "hash-de-outro-contato";
  
  const ehParaMim = await ehContatoProprio(meuHash, mockProfile);
  const ehParaOutro = await ehContatoProprio(outroHash, mockProfile);
  
  assertTrue(ehParaMim, "Deve identificar como envio para si mesmo");
  assertFalse(ehParaOutro, "Não deve identificar como envio para si mesmo");
});

Deno.test("HAND-MENSAGEM SELF: Simulação de envio de mensagem para si mesmo", async () => {
  // Limpa mocks
  mockChats.clear();
  mockHandshakes.clear();
  
  const meuHash = await obterHashProprio(mockProfile);
  assertExists(meuHash);
  
  const conteudoMensagem = "Esta é uma mensagem de teste para mim mesmo";
  const msgId = `msg-self-${Date.now()}`;
  const agora = Date.now();
  
  // Simula a lógica do hand-mensagem para auto-envio
  const chatAuto: Chat = {
    id: msgId,
    contatoHash: meuHash,
    conteudo: conteudoMensagem,
    tipo: 'out',
    createdAt: agora,
    sentAt: agora,
    receivedAt: agora,
    readAt: agora,
    notifiedAt: agora,
    handshake: 'self'
  };
  
  await salvarChatMock(chatAuto);
  
  // 🔥 Busca direto do Mock, evitando o erro de "never" do TypeScript
  const savedChat = mockChats.get(msgId);
  
  // Verifica que a mensagem foi salva
  assertExists(savedChat, "Mensagem deve ser salva no banco em memória");
  assertEquals(savedChat.id, msgId);
  assertEquals(savedChat.conteudo, conteudoMensagem);
  assertEquals(savedChat.tipo, 'out');
  assertEquals(savedChat.contatoHash, meuHash);
  
  // Verifica timestamps completos (fluxo completo simulado)
  assertExists(savedChat.sentAt, "sentAt deve existir");
  assertExists(savedChat.receivedAt, "receivedAt deve existir");
  assertExists(savedChat.readAt, "readAt deve existir");
  assertExists(savedChat.notifiedAt, "notifiedAt deve existir");
  
  // Verifica que todos os timestamps são iguais (instantâneo)
  assertEquals(savedChat.sentAt, savedChat.receivedAt);
  assertEquals(savedChat.receivedAt, savedChat.readAt);
  assertEquals(savedChat.readAt, savedChat.notifiedAt);
  
  // Verifica handshake especial
  assertEquals(savedChat.handshake, 'self', "Handshake deve ser 'self'");
  
  // Verifica que NENHUM handshake real foi criado
  assertEquals(mockHandshakes.size, 0, "Map de handshakes deve estar vazio");
});

Deno.test("HAND-MENSAGEM SELF: Mensagem normal para outro contato cria handshake", async () => {
  // Limpa mocks
  mockChats.clear();
  mockHandshakes.clear();
  
  const outroHash = "hash-de-outra-pessoa";
  const conteudoMensagem = "Mensagem para outra pessoa";
  const msgId = `msg-normal-${Date.now()}`;
  const handId = `hand-${Date.now()}`;
  const agora = Date.now();
  
  // Simula a lógica do hand-mensagem para envio normal
  const chatOut: Chat = {
    id: msgId,
    contatoHash: outroHash,
    conteudo: conteudoMensagem,
    tipo: 'out',
    createdAt: agora,
    handshake: handId
  };
  
  const handshakeNormal: Handshake = {
    id: handId,
    aud: outroHash,
    createdAt: agora,
    updatedAt: agora,
    out: {
      status: 'pendente',
      tentativas: 0,
      rotas: {
        mensagem: {
          enviada: msgId,
          conteudo: conteudoMensagem
        }
      }
    }
  };
  
  await salvarChatMock(chatOut);
  await salvarHandshakeMock(handshakeNormal);
  
  const savedChat = mockChats.get(msgId);
  const savedHandshake = mockHandshakes.get(handId);
  
  // Verifica que a mensagem foi salva
  assertExists(savedChat);
  assertEquals(savedChat.id, msgId);
  
  // Verifica que NÃO tem timestamps de recebimento/leitura (ainda não foram entregues)
  assertFalse(!!savedChat.sentAt, "sentAt não deve existir ainda");
  assertFalse(!!savedChat.receivedAt, "receivedAt não deve existir ainda");
  assertFalse(!!savedChat.readAt, "readAt não deve existir ainda");
  
  // Verifica que o handshake FOI criado
  assertExists(savedHandshake, "Handshake deve ser criado para envio normal");
  assertEquals(savedHandshake.id, handId);
  assertEquals(savedHandshake.aud, outroHash);
  assertEquals(savedHandshake.out?.status, 'pendente');
});

Deno.test("HAND-MENSAGEM SELF: Comparação entre auto-mensagem e mensagem normal", async () => {
  mockChats.clear();
  mockHandshakes.clear();
  
  const meuHash = await obterHashProprio(mockProfile);
  const outroHash = "hash-terceiro";
  const agora = Date.now();
  
  // Auto-mensagem
  const autoMsg: Chat = {
    id: `auto-${agora}`,
    contatoHash: meuHash!,
    conteudo: "Para mim",
    tipo: 'out',
    createdAt: agora,
    sentAt: agora,
    receivedAt: agora,
    readAt: agora,
    notifiedAt: agora,
    handshake: 'self'
  };
  
  // Mensagem normal
  const normalMsg: Chat = {
    id: `normal-${agora}`,
    contatoHash: outroHash,
    conteudo: "Para outro",
    tipo: 'out',
    createdAt: agora,
    handshake: `hand-${agora}`
  };
  
  await salvarChatMock(autoMsg);
  await salvarChatMock(normalMsg);
  
  const savedAuto = mockChats.get(autoMsg.id);
  const savedNormal = mockChats.get(normalMsg.id);
  
  assertExists(savedAuto);
  assertExists(savedNormal);
  
  // Diferenças críticas
  assertEquals(savedAuto.handshake, 'self');
  assertExists(savedAuto.sentAt);
  assertExists(savedAuto.receivedAt);
  assertExists(savedAuto.readAt);
  assertExists(savedAuto.notifiedAt);
  
  assertEquals(savedNormal.handshake, `hand-${agora}`);
  assertFalse(!!savedNormal.sentAt);
  assertFalse(!!savedNormal.receivedAt);
  assertFalse(!!savedNormal.readAt);
  assertFalse(!!savedNormal.notifiedAt);
  
  // Similaridades
  assertEquals(savedAuto.tipo, savedNormal.tipo, "Ambas são 'out'");
  assertEquals(savedAuto.createdAt, savedNormal.createdAt);
});

Deno.test("HAND-MENSAGEM SELF: Múltiplas auto-mensagens não criam handshakes", async () => {
  mockChats.clear();
  mockHandshakes.clear();
  
  const meuHash = await obterHashProprio(mockProfile);
  assertExists(meuHash);
  
  const mensagens = [
    "Primeira mensagem para mim",
    "Segunda mensagem para mim",
    "Terceira mensagem para mim"
  ];
  
  // 🔥 Iterador corrigido para evitar o 'string | undefined'
  let index = 0;
  for (const conteudo of mensagens) {
    const msg: Chat = {
      id: `auto-msg-${index}-${Date.now()}`,
      contatoHash: meuHash,
      conteudo: conteudo,
      tipo: 'out',
      createdAt: Date.now(),
      sentAt: Date.now(),
      receivedAt: Date.now(),
      readAt: Date.now(),
      notifiedAt: Date.now(),
      handshake: 'self'
    };
    await salvarChatMock(msg);
    index++;
  }
  
  // Verifica que todas as mensagens foram salvas
  assertEquals(mockChats.size, mensagens.length);
  
  // Verifica que nenhum handshake foi criado
  assertEquals(mockHandshakes.size, 0, "Nenhum handshake deve ser criado para auto-mensagens");
  
  // Verifica que todas as mensagens têm fluxo completo
  for (const [_id, chat] of mockChats.entries()) {
    assertExists(chat.sentAt);
    assertExists(chat.receivedAt);
    assertExists(chat.readAt);
    assertExists(chat.notifiedAt);
    assertEquals(chat.handshake, 'self');
  }
});

Deno.test("HAND-MENSAGEM SELF: Contato próprio deve ser identificado corretamente", async () => {
  const contatoProprio = await gerarContatoProprio(mockProfile);
  assertExists(contatoProprio);
  
  // Verifica propriedades especiais
  assertEquals(contatoProprio.name, "Usuário Teste (Eu)");
  assertEquals(contatoProprio.me, 'trusted');
  assertTrue(contatoProprio.trusted);
  
  // Verifica se o ID corresponde ao hash
  const hashCalculado = await calcularHashVapid(mockProfile.vapidPublicKey);
  assertEquals(contatoProprio.id, hashCalculado);
  
  // Testa detecção
  const ehEu = await ehContatoProprio(contatoProprio.id, mockProfile);
  assertTrue(ehEu);
  
  const naoEhEu = await ehContatoProprio("outro-hash", mockProfile);
  assertFalse(naoEhEu);
});
```

---

## Arquivo: `tests/handshakes/integration-shadow-sync.test.ts`

```ts
// tests/handshakes/integration-shadow-sync.test.ts
/// <reference lib="deno.ns" />

// Injeta o Fake IndexedDB para simular o banco de dados do navegador no ambiente de testes do Deno
import "npm:fake-indexeddb@6.0.0/auto";

import { assertEquals, assert, assertExists } from "@std/assert";
import { Processar as ProcessarContato } from "../../src/handshakes/hand-contato.ts";
import { Processar as ProcessarMensagem } from "../../src/handshakes/hand-mensagem.ts";
import { 
  salvarProfile, 
  buscarContatoPorChave, 
  buscarChat, 
  listarHandshakes, 
  salvarHandshake,
  removerTodoHistoricoChat,
  serializarPublicKeyVapid
} from "../../src/utils/db-helpers.ts";
import type { ProfileConfig, Handshake } from "../../src/constants/db.ts";

Deno.test("INTEGRAÇÃO: Shadow Sync - Deve criar contato não-confiável ao receber mensagem de desconhecido", async () => {
  // 1. SETUP DO "BOB" (O usuário local que vai receber a mensagem de um desconhecido)
  const bobProfile: ProfileConfig = {
    name: "Bob",
    email: "bob@loco.pwa",
    vapidPublicKey: { kty: "EC", crv: "P-256", x: "bob-x-coord", y: "bob-y-coord" } as JsonWebKey,
    vapidPrivateKeyJwk: { kty: "EC", d: "bob-priv-key" } as JsonWebKey,
    vapidPrivateKeyEnvelope: "env-bob",
    e2ePublicKey: { kty: "RSA", n: "bob-rsa-n-modulo", e: "AQAB" } as JsonWebKey,
    e2ePrivateKeyJwk: { kty: "RSA", d: "bob-rsa-priv-d" } as JsonWebKey,
    subscription: {
      endpoint: "https://push.com/bob",
      keys: { p256dh: "p256-bob", auth: "auth-bob" },
      proxyserver: "https://loco.proxy"
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarProfile(bobProfile); // Salva o perfil do Bob no IndexedDB local

  // 2. PREPARAÇÃO DA IDENTIDADE DE "ALICE" (A remetente desconhecida)
  const aliceVapidPublic: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: "alice-x-coordinate-base64url",
    y: "alice-y-coordinate-base64url"
  };

  // 🔥 Calculamos o hash SHA-256 real da chave da Alice para bater com o comportamento interno do salvarContato
  const aliceHashId = await serializarPublicKeyVapid(aliceVapidPublic);
  await removerTodoHistoricoChat(aliceHashId); // Garante ambiente limpo

  // 3. SIMULAÇÃO DO PACOTE RECEBIDO NA REDE (Handshake IN)
  // A Alice percebeu que o Bob não a tem salva, então ela anexou o "sync" de contato junto com a "mensagem".
  const handshakeRecebidoId = "handshake-in-001";
  const handshakeSimulado: Handshake = {
    id: handshakeRecebidoId,
    aud: aliceHashId, // Quem mandou foi a Alice (ID derivado da chave VAPID)
    createdAt: Date.now(),
    updatedAt: Date.now(),
    in: {
      status: 'recebido',
      tentativas: 0,
      rotas: {
        // A Alice mandou os dados dela e pediu reciprocidade (req: true)
        contato: {
          sync: {
            req: true,
            tr: true, // A Alice confia no Bob
            em: "alice@loco.pwa",
            nm: "Alice Desconhecida",
            vp: { x: "alice-x-coordinate-base64url", y: "alice-y-coordinate-base64url" },
            ep: { n: "alice-rsa-n-modulo" },
            se: "https://push.com/alice",
            sp: "alice-p256-key",
            sa: "alice-auth-secret",
            ve: "env-alice",
            ps: "https://loco.proxy"
          }
        },
        // A Alice mandou a mensagem em si
        mensagem: {
          enviada: "msg-alice-001",
          conteudo: "Oi Bob! Sou eu, a Alice. Salva meu contato!"
        }
      }
    }
  };

  // Salva o Handshake de entrada na fila local do Bob
  await salvarHandshake(handshakeSimulado);

  // 4. EXECUÇÃO DOS PROCESSADORES (Simulando o orquestrador sw-handshakes.ts)
  
  // Passo 4.1: Processa o Contato
  await ProcessarContato({ in: handshakeRecebidoId });
  
  // Passo 4.2: Processa a Mensagem
  await ProcessarMensagem({ in: handshakeRecebidoId });

  // 5. VERIFICAÇÕES DE INTEGRIDADE DA ARQUITETURA
  
  // Verificação A: A Alice foi salva no banco de contatos do Bob pelo Hash SHA-256?
  const contatoAlice = await buscarContatoPorChave(aliceHashId);
  assertExists(contatoAlice, "O contato da Alice deve ter sido criado e encontrado pelo Hash VAPID");
  assertEquals(contatoAlice.name, "Alice Desconhecida", "O nome do contato deve ter sido preenchido");
  assertEquals(contatoAlice.trusted, false, "CRÍTICO: Um contato criado via Shadow Sync DEVE ser classificado como NÃO CONFIÁVEL por padrão de segurança");
  
  // Verificação B: A mensagem da Alice foi salva no Chat do Bob vinculada ao Hash correto?
  const mensagemAlice = await buscarChat("msg-alice-001");
  assertExists(mensagemAlice, "A mensagem deve ter sido salva no IndexedDB do Chat");
  assertEquals(mensagemAlice.conteudo, "Oi Bob! Sou eu, a Alice. Salva meu contato!");
  assertEquals(mensagemAlice.contatoHash, aliceHashId, "A mensagem deve estar vinculada ao hash do novo contato criado");

  // Verificação C: O Bob gerou as respostas automáticas de saída (Handshakes OUT)?
  const todosHandshakes = await listarHandshakes();
  const handshakesDeSaida = todosHandshakes.filter(h => h.out && h.aud === aliceHashId);
  
  // Esperamos 2 handshakes de saída para a Alice:
  // 1 para devolver o Contato do Bob (pois req era true)
  // 1 para dar o Auto-Ack (entregue) da Mensagem
  assert(handshakesDeSaida.length >= 2, "O sistema deve ter enfileirado respostas automáticas para a Alice");

  const temRespostaDeContato = handshakesDeSaida.some(h => h.out?.rotas?.contato?.sync !== undefined);
  const temRespostaDeMensagem = handshakesDeSaida.some(h => h.out?.rotas?.mensagem?.data !== undefined);

  assertEquals(temRespostaDeContato, true, "O Bob deve ter enfileirado o envio dos seus dados de perfil para a Alice (Reciprocidade)");
  assertEquals(temRespostaDeMensagem, true, "O Bob deve ter enfileirado o recibo de 'Entregue' para a Alice (Auto-Ack)");
});
```

---

## Arquivo: `tests/handshakes/retry-resilience.test.ts`

```ts
// tests/handshakes/retry-resilience.test.ts
/// <reference lib="deno.ns" />

// Injeta o Fake IndexedDB para simular o banco de dados do navegador no Deno
import "npm:fake-indexeddb@6.0.0/auto";

import { assertEquals, assertExists, assert } from "@std/assert";
import { 
  salvarProfile, 
  salvarContato, 
  salvarHandshake, 
  buscarHandshake,
  serializarPublicKeyVapid,
  listarHandshakes,
  removerHandshake
} from "../../src/utils/db-helpers.ts";
import { processarFilaHandshake } from "../../src/sw/sw-handshakes.ts";
import type { ProfileConfig, Contato, Handshake } from "../../src/constants/db.ts";

Deno.test("RETRY RESILIENCE: Re-tentativas de mensagem devem anexar dados de contato (Shadow Sync)", async () => {
  // 🔥 SEGURANÇA CROSS-TEST: Limpa qualquer handshake residual na memória do Fake IndexedDB
  const handshakesOrfaos = await listarHandshakes();
  for (const orfao of handshakesOrfaos) {
    await removerHandshake(orfao.id);
  }

  // 1. Setup do Profile local (Alice)
  const localProfile: ProfileConfig = {
    name: "Alice",
    email: "alice@test.pwa",
    vapidPublicKey: { kty: "EC", crv: "P-256", x: "alice-x-coord", y: "alice-y-coord" } as JsonWebKey,
    vapidPrivateKeyJwk: { kty: "EC", d: "alice-d-priv" } as JsonWebKey,
    vapidPrivateKeyEnvelope: "env-alice",
    e2ePublicKey: { kty: "RSA", n: "alice-rsa-n", e: "AQAB" } as JsonWebKey,
    e2ePrivateKeyJwk: { kty: "RSA", d: "alice-rsa-d" } as JsonWebKey,
    subscription: {
      endpoint: "https://push.com/alice",
      keys: { p256dh: "p256", auth: "auth" },
      proxyserver: "https://loco.proxy"
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarProfile(localProfile);

  // 2. Setup do Contato salvo (Bob)
  const bobVapidPublic: JsonWebKey = { kty: "EC", crv: "P-256", x: "bob-x-coord", y: "bob-y-coord" };
  const bobHash = await serializarPublicKeyVapid(bobVapidPublic);

  const bobContato: Contato = {
    id: bobHash,
    name: "Bob",
    email: "bob@test.pwa",
    vapidPublicKey: bobVapidPublic,
    e2ePublicKey: { kty: "RSA", n: "bob-rsa-n", e: "AQAB" } as JsonWebKey,
    subscription: {
      endpoint: "https://push.com/bob",
      keys: { p256dh: "p256-bob", auth: "auth-bob" },
      proxyserver: "https://loco.proxy"
    },
    vapidPrivateKeyEnvelope: "env-bob",
    trusted: true,
    me: 'saved', // Supomos que Bob já possui o contato salvo
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarContato(bobContato);

  // 3. Criamos um Handshake de mensagem com tentativas = 1
  const handshakeRetryId = "handshake-retry-001";
  const handshakeRetry: Handshake = {
    id: handshakeRetryId,
    aud: bobHash,
    createdAt: Date.now() - 120000,
    updatedAt: Date.now() - 120000,
    out: {
      status: 'pendente',
      tentativas: 1, // A próxima tentativa será a #2 (Re-tentativa)
      rotas: {
        mensagem: {
          enviada: "msg-retry-123",
          conteudo: "Tentando novamente entregar esta mensagem!"
        }
      }
    }
  };
  await salvarHandshake(handshakeRetry);

  // 4. Executa o processador da fila de handshakes
  // A Promise-Mutex garante que aguardaremos eventuais processamentos paralelos de outros testes
  await processarFilaHandshake();

  // 5. Verifica no IndexedDB se o Handshake teve o perfil injetado e o contador incrementado
  const handshakeAposProcessamento = await buscarHandshake(handshakeRetryId);
  assertExists(handshakeAposProcessamento, "O handshake deve existir no banco de dados");
  
  // A tentativa deve ter sido incrementada de 1 para 2
  assertEquals(
    handshakeAposProcessamento.out!.tentativas, 
    2, 
    "O número de tentativas deve ter sido incrementado de 1 para 2"
  );

  // Verificação de Shadow Sync: A rota de contato DEVE ter sido injetada automaticamente para recuperar o nó destino
  assertExists(
    handshakeAposProcessamento.out!.rotas.contato, 
    "A rota de contato DEVE ter sido injetada para auto-recuperação na re-tentativa"
  );
  
  assertExists(
    handshakeAposProcessamento.out!.rotas.contato.sync, 
    "Os dados compactos (sync) do perfil da Alice devem estar presentes na rota de contato injetada"
  );
});
```

---

## Arquivo: `tests/handshakes/bidirectional-deletion.test.ts`

```ts
// tests/handshakes/bidirectional-deletion.test.ts
/// <reference lib="deno.ns" />

// Injeta o Fake IndexedDB para simular o banco de dados do navegador no Deno
import "npm:fake-indexeddb@6.0.0/auto";

import { assertEquals, assertExists, assert } from "@std/assert";
import { Processar as ProcessarMensagem } from "../../src/handshakes/hand-mensagem.ts";
import { 
  salvarProfile, 
  salvarContato, 
  salvarHandshake, 
  buscarHandshake,
  salvarChat,
  buscarChat,
  serializarPublicKeyVapid,
  removerTodoHistoricoChat
} from "../../src/utils/db-helpers.ts";
import type { ProfileConfig, Contato, Handshake, Chat } from "../../src/constants/db.ts";

Deno.test("INTEGRAÇÃO: Exclusão Bidirecional - Deve apagar mensagem remotamente com validação de autoridade", async () => {
  // 1. SETUP DO "BOB" (O usuário local que receberá a ordem de exclusão)
  const bobProfile: ProfileConfig = {
    name: "Bob",
    email: "bob@loco.pwa",
    vapidPublicKey: { kty: "EC", crv: "P-256", x: "bob-x", y: "bob-y" } as JsonWebKey,
    vapidPrivateKeyJwk: { kty: "EC", d: "bob-priv" } as JsonWebKey,
    vapidPrivateKeyEnvelope: "env-bob",
    e2ePublicKey: { kty: "RSA", n: "bob-n", e: "AQAB" } as JsonWebKey,
    e2ePrivateKeyJwk: { kty: "RSA", d: "bob-rsa-priv" } as JsonWebKey,
    subscription: {
      endpoint: "https://push.com/bob",
      keys: { p256dh: "p256", auth: "auth" },
      proxyserver: "https://loco.proxy"
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarProfile(bobProfile);

  // 2. SETUP DA "ALICE" (A remetente legítima)
  const aliceVapidPublic: JsonWebKey = { kty: "EC", crv: "P-256", x: "alice-x", y: "alice-y" };
  const aliceHash = await serializarPublicKeyVapid(aliceVapidPublic);

  const aliceContato: Contato = {
    id: aliceHash,
    name: "Alice",
    email: "alice@loco.pwa",
    vapidPublicKey: aliceVapidPublic,
    e2ePublicKey: { kty: "RSA", n: "alice-n", e: "AQAB" } as JsonWebKey,
    subscription: { endpoint: "https://push.com/alice", keys: { p256dh: "p256", auth: "auth" } },
    vapidPrivateKeyEnvelope: "env-alice",
    trusted: true,
    me: 'trusted',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarContato(aliceContato);
  await removerTodoHistoricoChat(aliceHash); // Limpa resíduos

  // 3. SETUP DO "CHARLIE" (O atacante / contato malicioso)
  const charlieVapidPublic: JsonWebKey = { kty: "EC", crv: "P-256", x: "charlie-x", y: "charlie-y" };
  const charlieHash = await serializarPublicKeyVapid(charlieVapidPublic);

  const charlieContato: Contato = {
    id: charlieHash,
    name: "Charlie",
    email: "charlie@loco.pwa",
    vapidPublicKey: charlieVapidPublic,
    e2ePublicKey: { kty: "RSA", n: "charlie-n", e: "AQAB" } as JsonWebKey,
    subscription: { endpoint: "https://push.com/charlie", keys: { p256dh: "p256", auth: "auth" } },
    vapidPrivateKeyEnvelope: "env-charlie",
    trusted: true,
    me: 'trusted',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarContato(charlieContato);

  // 4. MENSAGEM NO BANCO: Alice e Bob possuem uma mensagem no histórico
  const msgTargetId = "msg-alvo-123";
  const chatAliceBob: Chat = {
    id: msgTargetId,
    contatoHash: aliceHash, // A mensagem pertence ao chat com a Alice
    conteudo: "Mensagem super secreta que precisa sumir!",
    tipo: 'in', // Alice enviou para Bob
    createdAt: Date.now(),
    handshake: "hand-original-001"
  };
  await salvarChat(chatAliceBob);

  // VERIFICAÇÃO INICIAL: A mensagem existe no banco do Bob?
  let msgNoBanco = await buscarChat(msgTargetId);
  assertExists(msgNoBanco, "A mensagem deve existir inicialmente no banco do Bob");

  // =========================================================================
  // CENÁRIO 1: SEGURANÇA (Charlie tenta apagar a mensagem da Alice)
  // =========================================================================
  
  const handshakeAtaqueId = "handshake-attack-001";
  const handshakeAtaque: Handshake = {
    id: handshakeAtaqueId,
    aud: charlieHash, // Charlie é o autor do handshake
    createdAt: Date.now(),
    updatedAt: Date.now(),
    in: {
      status: 'recebido',
      tentativas: 0,
      rotas: {
        mensagem: {
          excluida: msgTargetId // Charlie tenta apagar a mensagem da Alice
        }
      }
    }
  };
  await salvarHandshake(handshakeAtaque);

  // Processa o ataque
  await ProcessarMensagem({ in: handshakeAtaqueId });

  // A MENSAGEM DEVE CONTINUAR LÁ!
  msgNoBanco = await buscarChat(msgTargetId);
  assertExists(msgNoBanco, "FALHA DE SEGURANÇA: A mensagem foi apagada por um contato sem autoridade sobre o chat!");

  // =========================================================================
  // CENÁRIO 2: CAMINHO FELIZ (Alice manda apagar a própria mensagem do chat)
  // =========================================================================
  
  const handshakeLegitimoId = "handshake-legitimo-001";
  const handshakeLegitimo: Handshake = {
    id: handshakeLegitimoId,
    aud: aliceHash, // Alice é a autora do handshake
    createdAt: Date.now(),
    updatedAt: Date.now(),
    in: {
      status: 'recebido',
      tentativas: 0,
      rotas: {
        mensagem: {
          excluida: msgTargetId // Alice manda apagar a mensagem dela
        }
      }
    }
  };
  await salvarHandshake(handshakeLegitimo);

  // Processa o pedido legítimo
  await ProcessarMensagem({ in: handshakeLegitimoId });

  // A MENSAGEM DEVE TER SUMIDO!
  msgNoBanco = await buscarChat(msgTargetId);
  assertEquals(msgNoBanco, undefined, "SUCESSO: A mensagem deve ser completamente deletada do IndexedDB quando a ordem vem da contraparte correta.");
});
```

---

## Arquivo: `tests/stores/mensagensStore.test.ts`

```ts
// tests/stores/mensagensStore.test.ts
/// <reference lib="deno.ns" />

// 🔥 Injetamos o Fake IndexedDB para que o store consiga persistir os dados na RAM
import "npm:fake-indexeddb@6.0.0/auto";

import { assertEquals, assert } from "@std/assert";
import { 
  mensagensAtivas, 
  inicializarChat, 
  atualizarOuAdicionarChatAtivo 
} from "../../src/stores/mensagensStore.ts";
import { removerTodoHistoricoChat, buscarChat } from "../../src/utils/db-helpers.ts";
import { contatoSelecionado } from "../../src/signals/state.ts";
import type { Chat } from "../../src/constants/db.ts";

Deno.test("Store: Mensagens - Deve refletir atualizações no Signal de forma Otimista", async () => {
  const hashContato = "contato-reativo-123";
  await removerTodoHistoricoChat(hashContato);
  
  // 1. Simulamos a UI definindo o contato ativo
  contatoSelecionado.value = hashContato;
  
  // 2. Inicializa o chat (o Signal mensagensAtivas deve zerar)
  await inicializarChat(hashContato);
  assertEquals(mensagensAtivas.value.length, 0, "O Signal deve iniciar vazio");
  
  const novaMsg: Chat = {
    id: "msg-signal-01",
    contatoHash: hashContato,
    conteudo: "Teste de Reatividade com Signals!",
    tipo: 'out',
    createdAt: Date.now(),
    handshake: "hand-01"
  };

  // 3. Adicionamos a mensagem via Store
  await atualizarOuAdicionarChatAtivo(novaMsg);
  
  // 4. VERIFICAÇÃO 1 (Reatividade): O Signal atualizou na memória?
  assertEquals(mensagensAtivas.value.length, 1, "O Signal deve conter 1 mensagem");
  assertEquals(mensagensAtivas.value[0]!.conteudo, "Teste de Reatividade com Signals!", "O conteúdo no Signal deve bater");

  // 5. VERIFICAÇÃO 2 (Persistência): A mensagem realmente foi pro banco em background?
  const msgNoBanco = await buscarChat("msg-signal-01");
  assert(msgNoBanco !== undefined, "A mensagem DEVE ter sido salva no IndexedDB em background");
  assertEquals(msgNoBanco.conteudo, "Teste de Reatividade com Signals!");
});

Deno.test("Store: Mensagens - Não deve sujar o Signal se o chat ativo for diferente", async () => {
  const hashContatoAtivo = "contato-A";
  const hashOutroContato = "contato-B";
  
  contatoSelecionado.value = hashContatoAtivo;
  await inicializarChat(hashContatoAtivo);
  
  const msgParaOutro: Chat = {
    id: "msg-signal-02",
    contatoHash: hashOutroContato, // Mensagem de OUTRO contato chegando em background
    conteudo: "Isso não deve aparecer na tela A",
    tipo: 'in',
    createdAt: Date.now(),
    handshake: "hand-02"
  };

  await atualizarOuAdicionarChatAtivo(msgParaOutro);
  
  // O Signal NÃO deve ter sido alterado, pois a UI está focada no contato-A
  assertEquals(mensagensAtivas.value.length, 0, "O Signal não deve receber mensagens de um chat inativo");
});
```

---

## Arquivo: `tests/federation_routing_test.ts`

```ts
// testes/federation_routing_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handlePing } from "../server/functions/ping.ts";
import { handlePush } from "../server/functions/push.ts";

Deno.test("Server - Handler /ping deve retornar HTTP 200 com status OK", async () => {
  const req = new Request("https://proxy.vanaware.com/ping", {
    method: "POST"});
  const res = await handlePing(req);

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.success, true);
  assertEquals(data.service, "loco-proxy");
});

Deno.test("Server - Handler /push deve rejeitar payload vazio com HTTP 400", async () => {
  const req = new Request("https://proxy.vanaware.com/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "invalid-json",
  });

  const res = await handlePush(req);
  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.error, "Corpo não é JSON válido.");
});
```

---

