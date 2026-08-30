> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém os TESTES unitários e de integração do projeto.
> O projeto é o **Loco [vdev] ** estruturado em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco [vdev] - Modo: TESTS

Gerado automaticamente em: 8/30/2026, 2:29:40 AM

---

## Arquivo: `monorepo/ui/tests/stores/mensagensStore.test.ts`

```ts
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
import { removerTodoHistoricoChat, buscarChat } from "../../../utils/src/db/mod.ts";
import { contatoSelecionado } from "../../src/stores/state.ts";
import type { Chat } from "../../../utils/src/interfaces/db.ts";

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
```

---

## Arquivo: `monorepo/ui/tests/integration/auto-discovery.test.ts`

```ts
// tests/integration/auto-discovery.test.ts
/// <reference lib="deno.ns" />

import "fake-indexeddb";
import { assertEquals } from "@std/assert";
import { loadAllConfigs, resetConfig, getConfigValue, saveConfig } from "../../src/stores/config-store.ts";
import { DefaultProxyPath, FallbackAbsoluteProxy } from "../../../utils/src/config/proxy.ts";

const originalFetch = globalThis.fetch;

Deno.test("INTEGRAÇÃO (Auto-Discovery): Deve selecionar Rota Relativa quando o servidor nativo responde ao /ping", async () => {
  await resetConfig(); // Garante banco limpo e reseta a chave

  // Simula que o servidor local/nativo (DefaultProxyPath) está ONLINE e é um loco-proxy válido
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const urlStr = input.toString();
    if (urlStr.includes("/ping")) {
      return new Response(JSON.stringify({ success: true, service: "loco-proxy", timestamp: Date.now() }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Not Found", { status: 404 });
  };

  try {
    const config = await loadAllConfigs();
    
    // Deve ter preferido o servidor relativo nativo ("/")
    assertEquals(config.proxy_path, DefaultProxyPath);
    
    // Verifica se salvou e retornou a decisão no IndexedDB
    const savedInDb = await getConfigValue("PROXY_PATH");
    assertEquals(savedInDb, DefaultProxyPath);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("INTEGRAÇÃO (Auto-Discovery): Deve fazer Fallback quando o servidor nativo falha mas o Fallback responde", async () => {
  await resetConfig();

  // Simula que o servidor local falha/dá 500, mas o Fallback responde com sucesso
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const urlStr = input.toString();
    
    // Se a chamada for para o Fallback remoto
    if (urlStr.includes(FallbackAbsoluteProxy) && urlStr.includes("/ping")) {
      return new Response(JSON.stringify({ success: true, service: "loco-proxy", timestamp: Date.now() }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Se for o local/relativo, falha
    return new Response("Internal Server Error", { status: 500 });
  };

  try {
    const config = await loadAllConfigs();
    
    // Deve ter ativado o Fallback remoto
    assertEquals(config.proxy_path, FallbackAbsoluteProxy);
    
    // E ter salvo no IndexedDB
    const savedInDb = await getConfigValue("PROXY_PATH");
    assertEquals(savedInDb, FallbackAbsoluteProxy);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("INTEGRAÇÃO (Auto-Discovery): Deve reutilizar o ProxyPath salvo no IndexedDB sem re-testar se já configurado", async () => {
  await resetConfig();

  // 1. Força a gravação prévia de um proxy customizado no banco
  const customProxy = "https://meu-proxy-customizado.com";
  await saveConfig("PROXY_PATH", customProxy);

  let fetchChamado = false;
  globalThis.fetch = async (): Promise<Response> => {
    fetchChamado = true;
    return new Response("OK", { status: 200 });
  };

  try {
    const config = await loadAllConfigs();
    
    // Retorna a configuração já existente
    assertEquals(config.proxy_path, customProxy);
    
    // NÃO deve ter feito chamadas de ping de rede para auto-discovery
    assertEquals(fetchChamado, false, "Auto-Discovery não deveria disparar requisições de rede se a rota já está salva no banco.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

---

## Arquivo: `monorepo/ui/tests/integration/message-delete-handshake.test.ts`

```ts
// tests/integration/message-delete-handshake.test.ts
/// <reference lib="deno.ns" />

import "fake-indexeddb";
import { assertEquals, assertExists } from "@std/assert";

import { excluirMensagem } from "../../src/stores/mensagensStore.ts";
import { Processar as ProcessarMensagem } from "../../src/handshakes/hand-mensagem.ts";
import { 
  salvarChat, 
  buscarChat, 
  salvarHandshake, 
  buscarHandshake, 
  listarHandshakes,
  salvarContato,
  removerHandshake
} from "../../../utils/src/db/mod.ts";

import type { Chat, Handshake, Contato } from "../../../utils/src/interfaces/db.ts";

Deno.test("INTEGRAÇÃO (Exclusão - Parte 1): Apagar mensagem local deve gerar Handshake de exclusão remota OUT", async () => {
  const contatoHash = "hash-contato-bob-123";
  const msgId = "msg-para-deletar-456";

  // 1. Salva uma mensagem no banco local
  const msg: Chat = {
    id: msgId,
    contatoHash: contatoHash,
    conteudo: "Mensagem que será apagada bidirecionalmente",
    tipo: "out",
    createdAt: Date.now(),
    handshake: "handshake-original-envio"
  };
  await salvarChat(msg);

  // Garante que existia antes
  assertExists(await buscarChat(msgId), "A mensagem deveria existir no banco antes de ser excluída.");

  // Mock básico do Service Worker para capturar a mensagem postada da UI
  let mensagemSWCapturada: any = null;
  if (typeof navigator !== "undefined") {
    (navigator as any).serviceWorker = {
      ready: Promise.resolve({
        active: {
          postMessage: (data: any) => {
            mensagemSWCapturada = data;
          }
        }
      })
    };
  }

  // 2. Executa a exclusão da mensagem
  await excluirMensagem(msgId, contatoHash);

  // 3. Valida se a mensagem foi apagada do banco local
  const msgNoDb = await buscarChat(msgId);
  assertEquals(msgNoDb, undefined, "A mensagem deveria ter sido removida do IndexedDB local.");

  // 4. PROVA: Valida se a UI notificou o Service Worker para criar a rota de exclusão remota
  assertExists(mensagemSWCapturada, "O comando de exclusão não foi enviado ao Service Worker!");
  assertEquals(mensagemSWCapturada.type, "CRIAR_HANDSHAKE_OUT");
  assertEquals(mensagemSWCapturada.payload.rotasModulo, "mensagem");
  assertEquals(mensagemSWCapturada.payload.params.function, "excluirMensagem");
  assertEquals(mensagemSWCapturada.payload.params.msgId, msgId);

  // 5. Simula a ação que o SW faz ao receber esse evento 'CRIAR_HANDSHAKE_OUT'
  await ProcessarMensagem({ out: mensagemSWCapturada.payload.params });

  // 6. PROVA FINAL: Verifica se o Handshake OUT com rota { mensagem: { excluida: msgId } } foi gravado no banco
  const handshakes = await listarHandshakes();
  const handshakeExclusao = handshakes.find(h => h.aud === contatoHash && h.out?.rotas.mensagem?.excluida === msgId);

  assertExists(handshakeExclusao, "O Handshake de saída com a instrução 'excluida' não foi encontrado na fila!");
  assertEquals(handshakeExclusao.out?.status, "pendente");

  // Limpeza
  for (const h of handshakes) await removerHandshake(h.id);
});

Deno.test("INTEGRAÇÃO (Exclusão - Parte 2): Receber Handshake de exclusão remota IN deve apagar a mensagem do IndexedDB", async () => {
  const contatoHash = "hash-contato-alice-789";
  const msgIdRecebida = "msg-recebida-alice-101";
  const handshakeInId = "handshake-in-exclusao-999";

  // 1. Salva o contato para autoridade de exclusão
  const contato: Contato = {
    id: contatoHash,
    name: "Alice",
    email: "alice@loco.pwa",
    vapidPublicKey: {} as any,
    e2ePublicKey: {} as any,
    subscription: { endpoint: "ep", keys: { p256dh: "p", auth: "a" }, proxyserver: "ps" },
    vapidPrivateKeyEnvelope: "env",
    trusted: true,
    me: "saved",
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarContato(contato);

  // 2. Salva uma mensagem recebida anteriormente de Alice
  const msgRecebida: Chat = {
    id: msgIdRecebida,
    contatoHash: contatoHash,
    conteudo: "Mensagem que a Alice decidiu apagar remotamente",
    tipo: "in",
    createdAt: Date.now(),
    handshake: "handshake-original-recebimento"
  };
  await salvarChat(msgRecebida);

  assertExists(await buscarChat(msgIdRecebida), "A mensagem recebida deveria existir no banco.");

  // 3. Simula a chegada de um Handshake IN de exclusão processado pelo Roteador SW
  const handshakeIn: Handshake = {
    id: handshakeInId,
    aud: contatoHash, // Veio da Alice
    createdAt: Date.now(),
    updatedAt: Date.now(),
    in: {
      status: "recebido",
      tentativas: 0,
      rotas: {
        mensagem: {
          excluida: msgIdRecebida // Instrução remota de exclusão
        }
      }
    }
  };
  await salvarHandshake(handshakeIn);

  // 4. Executa o processador oficial do módulo 'hand-mensagem.ts'
  await ProcessarMensagem({ in: handshakeInId });

  // 5. PROVA MATEMÁTICA: A mensagem recebida da Alice foi permanentemente apagada do IndexedDB?
  const msgAposProcessar = await buscarChat(msgIdRecebida);
  assertEquals(msgAposProcessar, undefined, "FALHA: O processador de Handshake IN não apagou a mensagem do IndexedDB!");

  // Limpeza
  await removerHandshake(handshakeInId);
});
```

---

## Arquivo: `monorepo/ui/tests/integration/contact-purge.test.ts`

```ts
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
```

---

## Arquivo: `monorepo/ui/tests/integration/remote-purge.test.ts`

```ts
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
  listarHandshakes,
  removerHandshake,
  serializarPublicKeyVapid
} from "../../../utils/src/db/mod.ts";
import { generateVAPIDKeys, generateE2EEKeys, exportKeyToJWK } from "../../../utils/src/crypto/mod.ts";

import type { Contato, Handshake } from "../../../utils/src/interfaces/db.ts";

Deno.test("INTEGRAÇÃO (Expurgo Remoto 1): Limpar histórico cria Handshake Único e Apaga no Remoto", async () => {
  const contatoHash = "hash-bob-purge";

  await salvarChat({ id: "m1", contatoHash, conteudo: "1", tipo: "out", createdAt: Date.now(), handshake: "h1" });
  await salvarChat({ id: "m2", contatoHash, conteudo: "2", tipo: "in", createdAt: Date.now(), handshake: "h2" });

  await limparTodoHistorico(contatoHash);

  const handshakes = await listarHandshakes();
  const handPurge = handshakes.find(h => h.aud === contatoHash && h.out?.rotas.mensagem?.limparHistorico === true);
  
  assertExists(handPurge, "O Handshake único de expurgo de histórico não foi gerado!");

  const handIn: Handshake = {
    id: "hand-in-purge",
    aud: contatoHash,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    in: { status: "recebido", tentativas: 0, rotas: { mensagem: { limparHistorico: true } } }
  };
  await salvarHandshake(handIn);

  await ProcessarMensagem({ in: "hand-in-purge" });

  assertEquals(await buscarChat("m1"), undefined);
  assertEquals(await buscarChat("m2"), undefined);

  for (const h of await listarHandshakes()) await removerHandshake(h.id);
});

Deno.test("INTEGRAÇÃO (Expurgo Remoto 2): Excluir Contato cria Handshake Único de Remoção de Perfil no Remoto", async () => {
  
  // 🔥 CORREÇÃO: Usar chaves reais para o hash criptográfico funcionar!
  const vapidKeys = await generateVAPIDKeys();
  const pubVapid = await exportKeyToJWK(vapidKeys.publicKey);
  const contatoHash = await serializarPublicKeyVapid(pubVapid);

  // 1. Salva o contato com as chaves válidas
  const contato: Contato = {
    id: contatoHash, 
    name: "Alice", 
    email: "a@a.com",
    vapidPublicKey: pubVapid, 
    e2ePublicKey: {} as any, // E2E não interfere no Hash ID
    subscription: { endpoint: "e", keys: { p256dh: "p", auth: "a" }, proxyserver: "ps" },
    vapidPrivateKeyEnvelope: "e", 
    trusted: true, 
    me: "saved", 
    createdAt: Date.now(), 
    updatedAt: Date.now()
  };
  await salvarContato(contato);

  // 2. Exclui o contato
  await removerContatoCompletamente(contatoHash, true);

  // 3. Verifica se gerou o Handshake de remoção remota
  const handshakes = await listarHandshakes();
  const handDelete = handshakes.find(h => h.aud === contatoHash && h.out?.rotas.contato?.removerContato === true);

  assertExists(handDelete, "O Handshake único de exclusão de contato não foi gerado!");

  // 4. Simula a chegada da exclusão remota no celular do outro usuário
  const handIn: Handshake = {
    id: "hand-in-del-contact",
    aud: contatoHash,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    in: { status: "recebido", tentativas: 0, rotas: { contato: { removerContato: true } } }
  };
  await salvarHandshake(handIn);

  await ProcessarContato({ in: "hand-in-del-contact" });

  // 5. Verifica se o perfil no outro celular foi apagado fisicamente
  assertEquals(await buscarContatoPorChave(contatoHash), undefined);

  for (const h of await listarHandshakes()) await removerHandshake(h.id);
});
```

---

