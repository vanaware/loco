/// <reference lib="deno.ns" />
import "fake-indexeddb/auto";
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
} from "@loco/utils/db";
import type { ProfileConfig, Handshake } from "@loco/utils/interfaces";

Deno.test("INTEGRAÇÃO: Shadow Sync - Deve criar contato não-confiável ao receber mensagem de desconhecido", async () => {
  // 1. SETUP DO "BOB"
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
  await salvarProfile(bobProfile);

  // 2. PREPARAÇÃO DA IDENTIDADE DE "ALICE"
  const aliceVapidPublic: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: "alice-x-coordinate-base64url",
    y: "alice-y-coordinate-base64url"
  };
  const aliceHashId = await serializarPublicKeyVapid(aliceVapidPublic);
  await removerTodoHistoricoChat(aliceHashId);

  // 3. SIMULAÇÃO DO PACOTE RECEBIDO
  const handshakeRecebidoId = "handshake-in-001";
  const handshakeSimulado: Handshake = {
    id: handshakeRecebidoId,
    aud: aliceHashId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    in: {
      status: 'recebido',
      tentativas: 0,
      rotas: {
        contato: {
          sync: {
            req: true,
            tr: true,
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
        mensagem: {
          enviada: "msg-alice-001",
          conteudo: "Oi Bob! Sou eu, a Alice. Salva meu contato!"
        }
      }
    }
  };
  await salvarHandshake(handshakeSimulado);

  // 4. EXECUÇÃO DOS PROCESSADORES
  await ProcessarContato({ in: handshakeRecebidoId });
  await ProcessarMensagem({ in: handshakeRecebidoId });

  // 5. VERIFICAÇÕES
  const contatoAlice = await buscarContatoPorChave(aliceHashId);
  assertExists(contatoAlice, "O contato da Alice deve ter sido criado");
  assertEquals(contatoAlice.name, "Alice Desconhecida");
  assertEquals(contatoAlice.trusted, false, "Contato via Shadow Sync DEVE ser NÃO CONFIÁVEL");

  const mensagemAlice = await buscarChat("msg-alice-001");
  assertExists(mensagemAlice);
  assertEquals(mensagemAlice.conteudo, "Oi Bob! Sou eu, a Alice. Salva meu contato!");
  assertEquals(mensagemAlice.contatoHash, aliceHashId);

  const todosHandshakes = await listarHandshakes();
  const handshakesDeSaida = todosHandshakes.filter(h => h.out && h.aud === aliceHashId);
  assert(handshakesDeSaida.length >= 2, "Deve ter enfileirado respostas automáticas");

  const temRespostaDeContato = handshakesDeSaida.some(h => h.out?.rotas?.contato?.sync !== undefined);
  const temRespostaDeMensagem = handshakesDeSaida.some(h => h.out?.rotas?.mensagem?.data !== undefined);
  assertEquals(temRespostaDeContato, true, "Deve ter enfileirado reciprocidade");
  assertEquals(temRespostaDeMensagem, true, "Deve ter enfileirado Auto-Ack");
});