// tests/integration/contact-purge.test.ts
/// <reference lib="deno.ns" />

import "fake-indexeddb";
import { assertEquals, assertExists } from "@std/assert";

import { 
  removerContatoCompletamente, 
  contatosRaw 
} from "../../src/stores/contatosStore.ts";

import { 
  salvarContato, 
  salvarChat, 
  salvarHandshake, 
  buscarContatoPorChave, 
  buscarChat, 
  buscarHandshake, 
  serializarPublicKeyVapid, 
  listarChatPaginado,
  listarHandshakes
} from "../../../utils/src/db/mod.ts";

import { generateVAPIDKeys, generateE2EEKeys, exportKeyToJWK } from "../../../utils/src/crypto/mod.ts";
import type { Contato, Chat, Handshake } from "../../../utils/src/interfaces/db.ts";

Deno.test("INTEGRAÇÃO E EXPURGO: Excluir contato deve aplicar Tombstone e apagar histórico antigo em cascata", async () => {

  // =========================================================================
  // 1. SETUP DE DADOS PARA O CONTATO (ALVO DO EXPURGO)
  // =========================================================================
  const vapidKeys = await generateVAPIDKeys();
  const e2eKeys = await generateE2EEKeys();
  const pubVapidJwk = await exportKeyToJWK(vapidKeys.publicKey);
  const contatoHash = await serializarPublicKeyVapid(pubVapidJwk);

  const novoContato: Contato = {
    id: contatoHash,
    name: "Contato Para Exclusão",
    email: "expurgo@loco.pwa",
    vapidPublicKey: pubVapidJwk,
    e2ePublicKey: e2eKeys.publicEncrypt,
    subscription: {
      endpoint: "https://fcm.googleapis.com/fcm/send/token-expurgo",
      keys: { p256dh: "p256dh", auth: "auth" },
      proxyserver: "https://proxy.loco.com"
    },
    vapidPrivateKeyEnvelope: "envelope-cifrado",
    trusted: true,
    me: "saved",
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  await salvarContato(novoContato);
  contatosRaw.value = [novoContato];

  // =========================================================================
  // 2. SETUP DE MENSAGENS VINCULADAS
  // =========================================================================
  const msg1: Chat = {
    id: "msg-expurgo-1",
    contatoHash: contatoHash,
    conteudo: "Mensagem enviada 1",
    tipo: "out",
    createdAt: Date.now(),
    handshake: "handshake-msg-1"
  };

  const msg2: Chat = {
    id: "msg-expurgo-2",
    contatoHash: contatoHash,
    conteudo: "Mensagem recebida 2",
    tipo: "in",
    createdAt: Date.now() + 100,
    handshake: "handshake-msg-2"
  };

  await salvarChat(msg1);
  await salvarChat(msg2);

  // =========================================================================
  // 3. SETUP DE HANDSHAKES ANTIGOS VINCULADOS
  // =========================================================================
  const handContato: Handshake = {
    id: "handshake-contato-id",
    aud: contatoHash,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    out: { status: "enviado", tentativas: 1, rotas: { contato: { id: contatoHash } } }
  };

  const handProfile: Handshake = {
    id: "handshake-profile-id",
    aud: contatoHash,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    out: { status: "enviado", tentativas: 1, rotas: { profile: { campos: ["name"] } } }
  };

  const handMensagem: Handshake = {
    id: "handshake-msg-1",
    aud: contatoHash,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    out: { status: "enviado", tentativas: 1, rotas: { mensagem: { enviada: "msg-expurgo-1" } } }
  };

  await salvarHandshake(handContato);
  await salvarHandshake(handProfile);
  await salvarHandshake(handMensagem);

  // SANITY CHECK
  assertExists(await buscarContatoPorChave(contatoHash), "O contato deveria existir antes do expurgo.");
  assertExists(await buscarChat("msg-expurgo-1"), "A mensagem 1 deveria existir.");

  // =========================================================================
  // 4. EXECUÇÃO DO EXPURGO
  // =========================================================================
  await removerContatoCompletamente(contatoHash); // Default: notificarRemoto = true

  // =========================================================================
  // 5. VALIDAÇÃO DA ARQUITETURA
  // =========================================================================

  // A) O Contato foi removido do Signal da UI, mas virou uma Lápide (Tombstone) no DB?
  const contatoNoDb = await buscarContatoPorChave(contatoHash);
  assertExists(contatoNoDb, "O registro do contato deve permanecer fisicamente para envio da notificação.");
  assertEquals(contatoNoDb.me, "deleted", "O status do contato não foi alterado para Lápide (Tombstone)!");
  assertEquals(contatosRaw.value.some(c => c.id === contatoHash), false, "O contato continuou visível na UI!");

  // B) As Mensagens antigas foram totalmente removidas?
  assertEquals(await buscarChat("msg-expurgo-1"), undefined, "A mensagem 1 não foi apagada.");
  assertEquals(await buscarChat("msg-expurgo-2"), undefined, "A mensagem 2 não foi apagada.");
  assertEquals((await listarChatPaginado(contatoHash, 30, 0)).length, 0, "O índice não foi limpo.");

  // C) Os Handshakes antigos foram expurgados?
  assertEquals(await buscarHandshake("handshake-contato-id"), undefined, "Handshake antigo de contato não foi removido.");
  assertEquals(await buscarHandshake("handshake-profile-id"), undefined, "Handshake antigo de perfil não foi removido.");
  assertEquals(await buscarHandshake("handshake-msg-1"), undefined, "Handshake antigo de mensagem não foi removido.");

  // D) O *NOVO* Handshake de exclusão remota foi criado?
  const allHandshakes = await listarHandshakes();
  const handshakeDelecao = allHandshakes.find(h => h.aud === contatoHash && h.out?.rotas?.contato?.removerContato === true);
  assertExists(handshakeDelecao, "O novo handshake de deleção remota não foi gerado na fila!");

  console.log("✅ Expurgo validado: Lápide criada, histórico varrido e Handshake de notificação de exclusão remota enfileirado!");
});