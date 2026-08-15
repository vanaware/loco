> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém múltiplos arquivos do projeto **Loco v0.2.106-msugf07d** (TESTES) estruturados em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco [v0.2.106-msugf07d] - Modo: TESTS

Gerado automaticamente em: 8/15/2026, 11:11:42 AM

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
      keys: { p256dh: "p256dh-a", auth: "auth-a" }
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
      keys: { p256dh: "p256dh-b", auth: "auth-b" }
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
  const compactDataA = extrairDadosCompactos(userA);
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
  const cqrData = extrairDadosCompactos(userA);
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
  const jwtPayload = {
    sub: "contact",
    ...extrairDadosCompactos(userA),
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
    // 🔥 ARQUITETURA: Atualizado para a nova mensagem de erro da v0.2.91
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
      keys: { p256dh: "alice-p256dh", auth: "alice-auth" }
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
      keys: { p256dh: "bob-p256dh", auth: "bob-auth" }
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

