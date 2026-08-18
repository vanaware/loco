// tests/integration/remote-purge.test.ts
/// <reference lib="deno.ns" />

import "fake-indexeddb";
import { assertEquals, assertExists } from "@std/assert";

import { limparTodoHistorico } from "../../src/stores/mensagensStore.ts";
import { removerContatoCompletamente } from "../../src/stores/contatosStore.ts";
import { Processar as ProcessarMensagem } from "../../src/handshakes/hand-mensagem.ts";
import { Processar as ProcessarContato } from "../../src/handshakes/hand-contato.ts";
import { 
  salvarChat, 
  buscarChat, 
  salvarContato, 
  buscarContatoPorChave, 
  salvarHandshake, 
  buscarHandshake, 
  listarHandshakes,
  removerHandshake 
} from "../../src/utils/db-helpers.ts";

import type { Chat, Contato, Handshake } from "../../src/constants/db.ts";

Deno.test("INTEGRAÇÃO (Expurgo Remoto 1): Limpar histórico cria Handshake Único e Apaga no Remoto", async () => {
  const contatoHash = "hash-bob-purge";

  // 1. Salva mensagens no remetente
  await salvarChat({ id: "m1", contatoHash, conteudo: "1", tipo: "out", createdAt: Date.now(), handshake: "h1" });
  await salvarChat({ id: "m2", contatoHash, conteudo: "2", tipo: "in", createdAt: Date.now(), handshake: "h2" });

  // 2. Dispara a limpeza total de histórico
  await limparTodoHistorico(contatoHash);

  // 3. Verifica se gerou o Handshake com a rota { mensagem: { limparHistorico: true } }
  const handshakes = await listarHandshakes();
  const handPurge = handshakes.find(h => h.aud === contatoHash && h.out?.rotas.mensagem?.limparHistorico === true);
  
  assertExists(handPurge, "O Handshake único de expurgo de histórico não foi gerado!");

  // 4. Simula o recebimento desse Handshake no lado do Bob
  const handIn: Handshake = {
    id: "hand-in-purge",
    aud: contatoHash,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    in: { status: "recebido", tentativas: 0, rotas: { mensagem: { limparHistorico: true } } }
  };
  await salvarHandshake(handIn);

  // Bob processa a entrada
  await ProcessarMensagem({ in: "hand-in-purge" });

  // 5. Verifica se as mensagens de Bob foram apagadas
  assertEquals(await buscarChat("m1"), undefined);
  assertEquals(await buscarChat("m2"), undefined);

  for (const h of await listarHandshakes()) await removerHandshake(h.id);
});

Deno.test("INTEGRAÇÃO (Expurgo Remoto 2): Excluir Contato cria Handshake Único de Remoção de Perfil no Remoto", async () => {
  const contatoHash = "hash-alice-delete";

  // 1. Salva o contato
  const contato: Contato = {
    id: contatoHash, name: "Alice", email: "a@a.com",
    vapidPublicKey: {} as any, e2ePublicKey: {} as any,
    subscription: { endpoint: "e", keys: { p256dh: "p", auth: "a" }, proxyserver: "ps" },
    vapidPrivateKeyEnvelope: "e", trusted: true, me: "saved", createdAt: Date.now(), updatedAt: Date.now()
  };
  await salvarContato(contato);

  // 2. Exclui o contato no lado local
  await removerContatoCompletamente(contatoHash, true);

  // 3. Verifica se gerou o Handshake com rota { contato: { removerContato: true } }
  const handshakes = await listarHandshakes();
  const handDelete = handshakes.find(h => h.aud === contatoHash && h.out?.rotas.contato?.removerContato === true);

  assertExists(handDelete, "O Handshake único de exclusão de contato não foi gerado!");

  // 4. Simula a chegada da exclusão remota no celular da Alice
  const handIn: Handshake = {
    id: "hand-in-del-contact",
    aud: contatoHash,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    in: { status: "recebido", tentativas: 0, rotas: { contato: { removerContato: true } } }
  };
  await salvarHandshake(handIn);

  await ProcessarContato({ in: "hand-in-del-contact" });

  // 5. Verifica se o perfil e dados do contato no celular da Alice foram apagados
  assertEquals(await buscarContatoPorChave(contatoHash), undefined);

  for (const h of await listarHandshakes()) await removerHandshake(h.id);
});