// tests/utils/db-helpers.test.ts
/// <reference lib="deno.ns" />

// 🔥 A MÁGICA ACONTECE AQUI (CORRIGIDO PARA DENO 2.X): 
// Usando o prefixo 'npm:' nativo do Deno em vez do 'esm.sh'.
// Ele cria um banco de dados real na RAM e injeta o 'indexedDB' no escopo global (globalThis),
// enganando a biblioteca 'idb-keyval' perfeitamente.
import "npm:fake-indexeddb@6.0.0/auto";

import { assertEquals, assertExists } from "@std/assert";
import {
  salvarProfile,
  buscarProfile,
  removerProfile,
  salvarChat,
  listarChatPaginado,
  removerTodoHistoricoChat
} from "../../src/utils/db-helpers.ts";
import type { ProfileConfig, Chat } from "../../src/constants/db.ts";

Deno.test("DB Helpers - Profile: Deve salvar, buscar e remover o perfil corretamente", async () => {
  const mockProfile: ProfileConfig = {
    name: "Arquiteto Loco",
    email: "arq@loco.pwa",
    vapidPublicKey: { kty: "EC", crv: "P-256", x: "123", y: "456" } as JsonWebKey,
    vapidPrivateKeyJwk: { kty: "EC", d: "789" } as JsonWebKey,
    vapidPrivateKeyEnvelope: "envelope_cifrado",
    e2ePublicKey: { kty: "RSA", n: "abc", e: "AQAB" } as JsonWebKey,
    e2ePrivateKeyJwk: { kty: "RSA", d: "def" } as JsonWebKey,
    subscription: {
      endpoint: "https://push.com/123",
      keys: { p256dh: "p256", auth: "auth" },
      proxyserver: "https://loco.proxy"
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  // 1. Testa o Salvamento
  await salvarProfile(mockProfile);
  
  // 2. Testa a Busca (Lembrando que o DB Helper faz compressão/descompressão matemática por baixo dos panos)
  const profileSalvo = await buscarProfile();
  assertExists(profileSalvo, "O perfil deve existir no IndexedDB da memória");
  assertEquals(profileSalvo.name, "Arquiteto Loco", "O nome deve ser preservado");
  assertEquals(profileSalvo.email, "arq@loco.pwa", "O email deve ser preservado");
  
  // Verifica se a reconstrução (expandVapidPublic, etc) funcionou
  assertEquals(profileSalvo.vapidPublicKey.kty, "EC", "A chave pública VAPID deve ser expandida corretamente");
  
  // 3. Testa a Remoção
  await removerProfile();
  const profileRemovido = await buscarProfile();
  assertEquals(profileRemovido, undefined, "O perfil deve retornar undefined após ser apagado");
});

Deno.test("DB Helpers - Chat: Deve salvar mensagens e retornar paginado corretamente", async () => {
  const contatoHash = "hash-contato-paginacao-123";
  
  // Limpa o estado antes do teste (útil se rodar múltiplos testes na mesma RAM)
  await removerTodoHistoricoChat(contatoHash);

  // 1. Vamos gerar 35 mensagens simuladas para testar a paginação (nosso PAGE_SIZE é 30 no store)
  const totalMensagens = 35;
  for (let i = 1; i <= totalMensagens; i++) {
    const msg: Chat = {
      id: `msg-${i.toString().padStart(2, '0')}`, // msg-01, msg-02...
      contatoHash: contatoHash,
      conteudo: `Mensagem de teste número ${i}`,
      tipo: 'out',
      createdAt: 10000 + i, // Tempos sequenciais para garantir ordem
      handshake: `hand-${i}`
    };
    await salvarChat(msg);
  }

  // 2. Testa a busca da primeira página (limit: 30, offset: 0)
  // Como são 35 mensagens no total, offset 0 (as mais recentes) deve trazer da msg-06 até msg-35
  const pagina1 = await listarChatPaginado(contatoHash, 30, 0);
  
  assertEquals(pagina1.length, 30, "A primeira página deve trazer exatamente 30 mensagens");
  
  // Utilizando '!' para informar ao TypeScript Strict que sabemos que o índice existe
  assertEquals(pagina1[pagina1.length - 1]!.id, "msg-35", "A última mensagem da página 1 deve ser a mais recente (msg-35)");
  assertEquals(pagina1[0]!.id, "msg-06", "A primeira mensagem da página 1 deve ser a msg-06");

  // 3. Testa a busca da segunda página (limit: 30, offset: 30)
  // Como já pulamos 30, devem sobrar as 5 mensagens mais antigas (msg-01 até msg-05)
  const pagina2 = await listarChatPaginado(contatoHash, 30, 30);
  
  assertEquals(pagina2.length, 5, "A segunda página deve trazer as 5 mensagens restantes");
  assertEquals(pagina2[pagina2.length - 1]!.id, "msg-05", "A última mensagem da página 2 deve ser a msg-05");
  assertEquals(pagina2[0]!.id, "msg-01", "A primeira mensagem da página 2 deve ser a msg-01");

  // 4. Testa a busca além do limite (offset >= total)
  const paginaVazia = await listarChatPaginado(contatoHash, 30, 35);
  assertEquals(paginaVazia.length, 0, "Deve retornar array vazio se o offset ultrapassar o total de mensagens");

  // 5. Limpeza Total
  await removerTodoHistoricoChat(contatoHash);
  const paginaPosExclusao = await listarChatPaginado(contatoHash, 30, 0);
  assertEquals(paginaPosExclusao.length, 0, "O histórico de chat deve estar zerado após o expurgo");
});