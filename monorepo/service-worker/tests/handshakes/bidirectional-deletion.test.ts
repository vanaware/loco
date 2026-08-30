/// <reference lib="deno.ns" />
import "fake-indexeddb/auto";
import { assertEquals, assertExists } from "@std/assert";
import { Processar as ProcessarMensagem } from "../../src/handshakes/hand-mensagem.ts";
import { 
  salvarProfile, 
  salvarContato, 
  salvarHandshake, 
  salvarChat,
  buscarChat,
  serializarPublicKeyVapid,
  removerTodoHistoricoChat
} from "@loco/utils/db";
import type { ProfileConfig, Contato, Handshake, Chat } from "@loco/utils/interfaces";

Deno.test("INTEGRAÇÃO: Exclusão Bidirecional - Deve apagar mensagem remotamente com validação de autoridade", async () => {
  // 1. SETUP DO "BOB"
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

  // 2. SETUP DA "ALICE"
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
  await removerTodoHistoricoChat(aliceHash);

  // 3. SETUP DO "CHARLIE"
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

  // 4. MENSAGEM NO BANCO
  const msgTargetId = "msg-alvo-123";
  const chatAliceBob: Chat = {
    id: msgTargetId,
    contatoHash: aliceHash,
    conteudo: "Mensagem super secreta que precisa sumir!",
    tipo: 'in',
    createdAt: Date.now(),
    handshake: "hand-original-001"
  };
  await salvarChat(chatAliceBob);

  let msgNoBanco = await buscarChat(msgTargetId);
  assertExists(msgNoBanco, "A mensagem deve existir inicialmente");

  // CENÁRIO 1: Charlie tenta apagar (SEM AUTORIDADE)
  const handshakeAtaqueId = "handshake-attack-001";
  const handshakeAtaque: Handshake = {
    id: handshakeAtaqueId,
    aud: charlieHash,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    in: {
      status: 'recebido',
      tentativas: 0,
      rotas: {
        mensagem: {
          excluida: msgTargetId
        }
      }
    }
  };
  await salvarHandshake(handshakeAtaque);
  await ProcessarMensagem({ in: handshakeAtaqueId });

  msgNoBanco = await buscarChat(msgTargetId);
  assertExists(msgNoBanco, "FALHA DE SEGURANÇA: Mensagem foi apagada por contato sem autoridade!");

  // CENÁRIO 2: Alice manda apagar (COM AUTORIDADE)
  const handshakeLegitimoId = "handshake-legitimo-001";
  const handshakeLegitimo: Handshake = {
    id: handshakeLegitimoId,
    aud: aliceHash,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    in: {
      status: 'recebido',
      tentativas: 0,
      rotas: {
        mensagem: {
          excluida: msgTargetId
        }
      }
    }
  };
  await salvarHandshake(handshakeLegitimo);
  await ProcessarMensagem({ in: handshakeLegitimoId });

  msgNoBanco = await buscarChat(msgTargetId);
  assertEquals(msgNoBanco, undefined, "Mensagem deve ser deletada quando ordem vem da contraparte correta");
});