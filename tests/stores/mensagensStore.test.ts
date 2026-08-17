// tests/stores/mensagensStore.test.ts
/// <reference lib="deno.ns" />

// 🔥 Injetamos o Fake IndexedDB para que o store consiga persistir os dados na RAM
import "fake-indexeddb";

import { assertEquals, assert } from "@std/assert";
import { 
  mensagensAtivas, 
  inicializarChat, 
  atualizarOuAdicionarChatAtivo 
} from "../../src/stores/mensagensStore.ts";
import { removerTodoHistoricoChat, buscarChat } from "../../src/utils/db-helpers.ts";
import { contatoSelecionado } from "../../src/signals/state.ts";
import type { Chat } from "../../src/constants/db.ts";

Deno.test("Store: Mensagens - Deve refletir atualizações no Signal de forma Otimista", async () => {
  const hashContato = "contato-reativo-123";
  await removerTodoHistoricoChat(hashContato);
  
  // 1. Simulamos a UI definindo o contato ativo
  contatoSelecionado.value = hashContato;
  
  // 2. Inicializa o chat (o Signal mensagensAtivas deve zerar)
  await inicializarChat(hashContato);
  assertEquals(mensagensAtivas.value.length, 0, "O Signal deve iniciar vazio");
  
  const novaMsg: Chat = {
    id: "msg-signal-01",
    contatoHash: hashContato,
    conteudo: "Teste de Reatividade com Signals!",
    tipo: 'out',
    createdAt: Date.now(),
    handshake: "hand-01"
  };

  // 3. Adicionamos a mensagem via Store
  await atualizarOuAdicionarChatAtivo(novaMsg);
  
  // 4. VERIFICAÇÃO 1 (Reatividade): O Signal atualizou na memória?
  assertEquals(mensagensAtivas.value.length, 1, "O Signal deve conter 1 mensagem");
  assertEquals(mensagensAtivas.value[0]!.conteudo, "Teste de Reatividade com Signals!", "O conteúdo no Signal deve bater");

  // 5. VERIFICAÇÃO 2 (Persistência): A mensagem realmente foi pro banco em background?
  const msgNoBanco = await buscarChat("msg-signal-01");
  assert(msgNoBanco !== undefined, "A mensagem DEVE ter sido salva no IndexedDB em background");
  assertEquals(msgNoBanco.conteudo, "Teste de Reatividade com Signals!");
});

Deno.test("Store: Mensagens - Não deve sujar o Signal se o chat ativo for diferente", async () => {
  const hashContatoAtivo = "contato-A";
  const hashOutroContato = "contato-B";
  
  contatoSelecionado.value = hashContatoAtivo;
  await inicializarChat(hashContatoAtivo);
  
  const msgParaOutro: Chat = {
    id: "msg-signal-02",
    contatoHash: hashOutroContato, // Mensagem de OUTRO contato chegando em background
    conteudo: "Isso não deve aparecer na tela A",
    tipo: 'in',
    createdAt: Date.now(),
    handshake: "hand-02"
  };

  await atualizarOuAdicionarChatAtivo(msgParaOutro);
  
  // O Signal NÃO deve ter sido alterado, pois a UI está focada no contato-A
  assertEquals(mensagensAtivas.value.length, 0, "O Signal não deve receber mensagens de um chat inativo");
});