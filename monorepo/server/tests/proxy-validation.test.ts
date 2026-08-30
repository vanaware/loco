// tests/integration/proxy-validation.test.ts
/// <reference lib="deno.ns" />
import { assertEquals } from "@std/assert";
import { handlePush } from "../src/functions/push.ts";

interface ErrorResponse {
  error: string;
}

// Objeto base 100% válido para usar de modelo nos testes
const createValidPayload = () => ({
  subscription: {
    endpoint: "https://fcm.googleapis.com/fcm/send/token-teste",
    keys: {
      p256dh: "p256dh-valido-base64",
      auth: "auth-valida-base64",
    },
    proxyserver: "https://proxy.loco.com",
  },
  vapid: {
    publicKey: { x: "coordenada-x", y: "coordenada-y" },
    privateKey: "envelope-cifrado-valido",
  },
  payloadText: "header.payload.signature",
});

// Auxiliar para simular a requisição HTTP POST recebida pelo Worker
function createMockRequest(bodyObj: any): Request {
  return new Request("https://proxy.loco.com/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj),
  });
}

Deno.test("VALIDAÇÃO NEGATIVA: Servidor deve ACEITAR a estrutura completa preliminarmente", async () => {
  const payload = createValidPayload();
  const res = await handlePush(createMockRequest(payload), {});
  const data = await res.json() as ErrorResponse;
  assertEquals(data.error !== "Estrutura P2P Inválida. Parâmetros em falta em subscription, vapid ou payloadText.", true);
});

Deno.test("REJEIÇÃO: Deve falhar se 'subscription' estiver ausente", async () => {
  const payload = createValidPayload();
  delete (payload as any).subscription;
  const res = await handlePush(createMockRequest(payload), {});
  assertEquals(res.status, 400);
  const data = await res.json() as ErrorResponse;
  assertEquals(data.error.includes("Estrutura P2P Inválida"), true);
});

Deno.test("REJEIÇÃO: Deve falhar se 'subscription.endpoint' estiver ausente/vazio", async () => {
  const payload = createValidPayload();
  payload.subscription.endpoint = "";
  const res = await handlePush(createMockRequest(payload), {});
  assertEquals(res.status, 400);
  const data = await res.json() as ErrorResponse;
  assertEquals(data.error.includes("Estrutura P2P Inválida"), true);
});

Deno.test("REJEIÇÃO: Deve falhar se 'subscription.proxyserver' estiver ausente/vazio", async () => {
  const payload = createValidPayload();
  payload.subscription.proxyserver = "";
  const res = await handlePush(createMockRequest(payload), {});
  assertEquals(res.status, 400);
  const data = await res.json() as ErrorResponse;
  assertEquals(data.error.includes("Estrutura P2P Inválida"), true);
});

Deno.test("REJEIÇÃO: Deve falhar se 'subscription.keys.p256dh' estiver ausente", async () => {
  const payload = createValidPayload();
  delete (payload.subscription.keys as any).p256dh;
  const res = await handlePush(createMockRequest(payload), {});
  assertEquals(res.status, 400);
  const data = await res.json() as ErrorResponse;
  assertEquals(data.error.includes("Estrutura P2P Inválida"), true);
});

Deno.test("REJEIÇÃO: Deve falhar se 'vapid.publicKey' estiver ausente", async () => {
  const payload = createValidPayload();
  delete (payload.vapid as any).publicKey;
  const res = await handlePush(createMockRequest(payload), {});
  assertEquals(res.status, 400);
  const data = await res.json() as ErrorResponse;
  assertEquals(data.error.includes("Estrutura P2P Inválida"), true);
});

Deno.test("REJEIÇÃO: Deve falhar se 'vapid.privateKey' (envelope) estiver ausente", async () => {
  const payload = createValidPayload();
  delete (payload.vapid as any).privateKey;
  const res = await handlePush(createMockRequest(payload), {});
  assertEquals(res.status, 400);
  const data = await res.json() as ErrorResponse;
  assertEquals(data.error.includes("Estrutura P2P Inválida"), true);
});

Deno.test("REJEIÇÃO: Deve falhar se 'payloadText' estiver vazio", async () => {
  const payload = createValidPayload();
  payload.payloadText = "";
  const res = await handlePush(createMockRequest(payload), {});
  assertEquals(res.status, 400);
  const data = await res.json() as ErrorResponse;
  assertEquals(data.error.includes("Estrutura P2P Inválida"), true);
});