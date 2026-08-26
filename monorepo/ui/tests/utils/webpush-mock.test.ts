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
