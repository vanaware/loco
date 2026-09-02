/// <reference lib="deno.ns" />
import "fake-indexeddb/auto";
import { assertEquals, assertExists, assert } from "@std/assert";
import { 
  salvarProfile, 
  salvarContato, 
  salvarHandshake, 
  buscarHandshake,
  serializarPublicKeyVapid,
  listarHandshakes,
  removerHandshake
} from "@loco/utils/db";
import { processarFilaHandshake } from "../../src/sw/handshakes.ts";
import type { ProfileConfig, Contato, Handshake } from "@loco/utils/interfaces";

Deno.test("RETRY RESILIENCE: Re-tentativas devem anexar dados de contato (Shadow Sync)", async () => {
  // Limpa handshakes órfãos
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
    me: 'saved',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarContato(bobContato);

  // 3. Handshake de mensagem com tentativas = 1
  const handshakeRetryId = "handshake-retry-001";
  const handshakeRetry: Handshake = {
    id: handshakeRetryId,
    aud: bobHash,
    createdAt: Date.now() - 120000,
    updatedAt: Date.now() - 120000,
    out: {
      status: 'pendente',
      tentativas: 1,
      rotas: {
        mensagem: {
          enviada: "msg-retry-123",
          conteudo: "Tentando novamente entregar esta mensagem!"
        }
      }
    }
  };
  await salvarHandshake(handshakeRetry);

  // 4. Executa o processador
  await processarFilaHandshake();

  // 5. Verificações
  const handshakeAposProcessamento = await buscarHandshake(handshakeRetryId);
  assertExists(handshakeAposProcessamento);

  assertEquals(
    handshakeAposProcessamento.out!.tentativas, 
    2, 
    "Tentativas deve ter sido incrementada de 1 para 2"
  );

  assertExists(
    handshakeAposProcessamento.out!.rotas.contato, 
    "Rota de contato DEVE ter sido injetada"
  );
  assertExists(
    handshakeAposProcessamento.out!.rotas.contato.sync, 
    "Dados compactos do perfil devem estar presentes"
  );
});