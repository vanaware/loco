/// <reference lib="deno.ns" />
/// <reference lib="webworker" />
import { assertEquals, assert, assertRejects } from "@std/assert";
import { cifrarPayloadObj } from "@loco/utils/proxy";
import { generateE2EEKeys } from "@loco/utils/crypto";

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

  setFailMode(error?: Error) {
    this.shouldFail = true;
    this.failWith = error;
  }
  setCustomResponse(response: { ok: boolean; status: number; text: string }) {
    this.customResponse = response;
  }
  clear() {
    this.calls = [];
    this.shouldFail = false;
    this.failWith = undefined;
    this.customResponse = undefined;
  }
  getCalls(): MockPushCall[] {
    return [...this.calls];
  }
  getLastCall(): MockPushCall | null {
    return this.calls.length > 0 ? this.calls[this.calls.length - 1]! : null;
  }
  getCallCount(): number {
    return this.calls.length;
  }
  async enviar(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payloadText: string,
    vapid: { subject: string; publicKey: JsonWebKey; privateKey: JsonWebKey }
  ): Promise<void> {
    const call: MockPushCall = { subscription, payloadText, vapid, timestamp: Date.now() };
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
    return;
  }
}

export const mockPushSender = new EnviarParaProxyMock();

Deno.test("EnviarParaProxyMock - captura chamada de envio", async () => {
  mockPushSender.clear();
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/test123",
    keys: { p256dh: "BM8xKzVqP9N2vQJhLkR3mT6wY8zA1bC4dE5fG7hI9jK0lM2nO3pQ4rS5tU6vW7xY8zA", auth: "abc123def456" },
  };
  const payloadText = JSON.stringify({ title: "Teste", body: "Olá!" });
  const vapidKeys = await generateE2EEKeys();
  const vapid = { subject: "mailto:test@example.com", publicKey: vapidKeys.publicEncrypt, privateKey: vapidKeys.privateDecryptJwk };
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
  const subscription = { endpoint: "https://example.com/push", keys: { p256dh: "test", auth: "test" } };
  await assertRejects(
    async () => {
      const keys = await generateE2EEKeys();
      await mockPushSender.enviar(subscription, "payload", {
        subject: "test", publicKey: keys.publicEncrypt, privateKey: keys.privateDecryptJwk,
      });
    },
    Error,
    "Falha simulada no envio"
  );
  assertEquals(mockPushSender.getCallCount(), 1);
});

Deno.test("EnviarParaProxyMock - resposta personalizada HTTP 403", async () => {
  mockPushSender.clear();
  mockPushSender.setCustomResponse({ ok: false, status: 403, text: "Forbidden - Invalid subscription" });
  const subscription = { endpoint: "https://example.com/push", keys: { p256dh: "test", auth: "test" } };
  await assertRejects(
    async () => {
      const keys = await generateE2EEKeys();
      await mockPushSender.enviar(subscription, "payload", {
        subject: "test", publicKey: keys.publicEncrypt, privateKey: keys.privateDecryptJwk,
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
      { endpoint: `https://example.com/push/${i}`, keys: { p256dh: `key${i}`, auth: `auth${i}` } },
      `payload-${i}`,
      { subject: `test${i}@example.com`, publicKey: keys.publicEncrypt, privateKey: keys.privateDecryptJwk }
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
  const payloadObj = { title: "Teste de Criptografia", body: "Este é um payload de teste", timestamp: Date.now() };
  const keys = await generateE2EEKeys();
  const encrypted = await cifrarPayloadObj(payloadObj, keys.publicEncrypt);
  assert(encrypted.i, "Deve ter IV (initialization vector)");
  assert(encrypted.d, "Deve ter dados criptografados");
  assert(encrypted.k, "Deve ter chave AES criptografada");
  assertEquals(typeof encrypted.i, "string");
  assertEquals(typeof encrypted.d, "string");
  assertEquals(typeof encrypted.k, "string");
  assert(encrypted.i.length > 0, "IV não pode ser vazio");
  assert(encrypted.d.length > 0, "Dados criptografados não podem ser vazios");
  assert(encrypted.k.length > 0, "Chave criptografada não pode ser vazia");
});

function assertNotEquals(actual: any, expected: any, msg?: string) {
  if (actual === expected) {
    throw new Error(msg || `Esperava valores diferentes, mas eram iguais: ${actual}`);
  }
}

Deno.test("cifrarPayloadObj - payloads diferentes geram ciphertexts diferentes", async () => {
  const keys = await generateE2EEKeys();
  const payload1 = { message: "Hello" };
  const payload2 = { message: "Hello" };
  const encrypted1 = await cifrarPayloadObj(payload1, keys.publicEncrypt);
  const encrypted2 = await cifrarPayloadObj(payload2, keys.publicEncrypt);
  assertNotEquals(encrypted1.d, encrypted2.d, "Ciphertexts devem ser diferentes devido ao IV aleatório");
});

Deno.test("Reset do mock entre testes", async () => {
  mockPushSender.clear();
  const keys1 = await generateE2EEKeys();
  await mockPushSender.enviar(
    { endpoint: "https://test1.com", keys: { p256dh: "k1", auth: "a1" } },
    "payload1",
    { subject: "test1@example.com", publicKey: keys1.publicEncrypt, privateKey: keys1.privateDecryptJwk }
  );
  assertEquals(mockPushSender.getCallCount(), 1);
  mockPushSender.clear();
  assertEquals(mockPushSender.getCallCount(), 0);
  const keys2 = await generateE2EEKeys();
  await mockPushSender.enviar(
    { endpoint: "https://test2.com", keys: { p256dh: "k2", auth: "a2" } },
    "payload2",
    { subject: "test2@example.com", publicKey: keys2.publicEncrypt, privateKey: keys2.privateDecryptJwk }
  );
  assertEquals(mockPushSender.getCallCount(), 1);
  assertEquals(mockPushSender.getLastCall()!.payloadText, "payload2");
});