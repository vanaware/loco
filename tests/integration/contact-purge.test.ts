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
  listarChatPaginado 
} from "../../src/utils/db-helpers.ts";

import { generateVAPIDKeys, generateE2EEKeys, exportKeyToJWK } from "../../src/utils/crypto-utils.ts";
import type { Contato, Chat, Handshake } from "../../src/constants/db.ts";

Deno.test("INTEGRAÇÃO E EXPURGO: Excluir contato deve apagar mensagens e handshakes vinculados em cascata", async () => {

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

  // Salva o contato no IndexedDB e atualiza a memória reativa
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
  // 3. SETUP DE HANDSHAKES VINCULADOS
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

  // =========================================================================
  // 4. SANITY CHECK: GARANTIR QUE OS DADOS REALMENTE EXISTEM ANTES DE EXCLUIR
  // =========================================================================
  assertExists(await buscarContatoPorChave(contatoHash), "O contato deveria existir antes do expurgo.");
  assertExists(await buscarChat("msg-expurgo-1"), "A mensagem 1 deveria existir antes do expurgo.");
  assertExists(await buscarChat("msg-expurgo-2"), "A mensagem 2 deveria existir antes do expurgo.");
  assertExists(await buscarHandshake("handshake-contato-id"), "O handshake de contato deveria existir.");
  assertExists(await buscarHandshake("handshake-profile-id"), "O handshake de perfil deveria existir.");
  assertExists(await buscarHandshake("handshake-msg-1"), "O handshake de mensagem deveria existir.");

  // =========================================================================
  // 5. EXECUÇÃO DO EXPURGO COMPLETO
  // =========================================================================
  await removerContatoCompletamente(contatoHash);

  // =========================================================================
  // 6. VALIDAÇÃO DAS DELETACÕES EM CASCATA
  // =========================================================================

  // A) O Contato foi removido do banco e do Signal?
  const contatoNoDb = await buscarContatoPorChave(contatoHash);
  assertEquals(contatoNoDb, undefined, "O contato não foi removido do IndexedDB.");
  assertEquals(contatosRaw.value.some(c => c.id === contatoHash), false, "O contato continuou em memória no Signal contatosRaw.");

  // B) As Mensagens foram totalmente removidas (inclusive do Índice paginado)?
  const msg1NoDb = await buscarChat("msg-expurgo-1");
  const msg2NoDb = await buscarChat("msg-expurgo-2");
  const mensagensPaginadas = await listarChatPaginado(contatoHash, 30, 0);

  assertEquals(msg1NoDb, undefined, "A mensagem 1 não foi apagada.");
  assertEquals(msg2NoDb, undefined, "A mensagem 2 não foi apagada.");
  assertEquals(mensagensPaginadas.length, 0, "O índice do histórico de mensagens não foi limpo.");

  // C) Todos os Handshakes da fila pertencentes a esse contato foram expurgados?
  const handContatoNoDb = await buscarHandshake("handshake-contato-id");
  const handProfileNoDb = await buscarHandshake("handshake-profile-id");
  const handMensagemNoDb = await buscarHandshake("handshake-msg-1");

  assertEquals(handContatoNoDb, undefined, "Handshake de contato não foi removido.");
  assertEquals(handProfileNoDb, undefined, "Handshake de perfil não foi removido.");
  assertEquals(handMensagemNoDb, undefined, "Handshake de mensagem não foi removido.");

  console.log("✅ Expurgo em cascata validado: Contato, Mensagens, Índices e Handshakes limpos do banco!");
});