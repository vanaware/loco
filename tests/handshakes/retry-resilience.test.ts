// tests/handshakes/retry-resilience.test.ts
/// <reference lib="deno.ns" />

// Injeta o Fake IndexedDB para simular o banco de dados do navegador no Deno
import "fake-indexeddb";

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