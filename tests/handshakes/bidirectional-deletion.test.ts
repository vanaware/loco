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