> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém os TESTES unitários e de integração do projeto.
> O projeto é o **Loco [vdev] ** estruturado em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco [vdev] - Modo: TESTS

Gerado automaticamente em: 8/30/2026, 9:24:46 AM

---

## Arquivo: `monorepo/ui/tests/stores/mensagensStore.test.ts`

```ts
// Arquivo: monorepo/ui/tests/stores/mensagensStore.test.ts
/// <reference lib="deno.ns" />
import "fake-indexeddb/auto";
import { assertEquals, assert } from "@std/assert";
import { mensagensAtivas, inicializarChat, atualizarOuAdicionarChatAtivo } from "../../src/stores/mensagensStore.ts";
import { removerTodoHistoricoChat, buscarChat } from "@loco/utils/db";
import { contatoSelecionado } from "../../src/stores/state.ts";
import type { Chat } from "@loco/utils/interfaces";

Deno.test("Store: Mensagens - Deve refletir atualizações no Signal de forma Otimista", async () => {
  const hashContato = "contato-reativo-123";
  await removerTodoHistoricoChat(hashContato);
  
  contatoSelecionado.value = hashContato;
  await inicializarChat(hashContato);
  assertEquals(mensagensAtivas.value.length, 0);
  
  const novaMsg: Chat = { id: "msg-signal-01", contatoHash: hashContato, conteudo: "Teste de Reatividade com Signals!", tipo: 'out', createdAt: Date.now(), handshake: "hand-01" };
  await atualizarOuAdicionarChatAtivo(novaMsg);
  
  assertEquals(mensagensAtivas.value.length, 1);
  assertEquals(mensagensAtivas.value[0]!.conteudo, "Teste de Reatividade com Signals!");
  
  const msgNoBanco = await buscarChat("msg-signal-01");
  assert(msgNoBanco !== undefined);
  assertEquals(msgNoBanco.conteudo, "Teste de Reatividade com Signals!");
});

Deno.test("Store: Mensagens - Não deve sujar o Signal se o chat ativo for diferente", async () => {
  const hashContatoAtivo = "contato-A";
  const hashOutroContato = "contato-B";
  
  contatoSelecionado.value = hashContatoAtivo;
  await inicializarChat(hashContatoAtivo);
  
  const msgParaOutro: Chat = { id: "msg-signal-02", contatoHash: hashOutroContato, conteudo: "Isso não deve aparecer na tela A", tipo: 'in', createdAt: Date.now(), handshake: "hand-02" };
  await atualizarOuAdicionarChatAtivo(msgParaOutro);
  
  assertEquals(mensagensAtivas.value.length, 0);
});
```

---

## Arquivo: `monorepo/ui/tests/integration/auto-discovery.test.ts`

```ts
// Arquivo: monorepo/ui/tests/integration/auto-discovery.test.ts
/// <reference lib="deno.ns" />
import "fake-indexeddb/auto";
import { assertEquals } from "@std/assert";
import { loadAllConfigs, resetConfig, getConfigValue, saveConfig } from "../../src/stores/config-store.ts";
import { DefaultProxyPath, FallbackAbsoluteProxy } from "@loco/utils/config";

const originalFetch = globalThis.fetch;

Deno.test("INTEGRAÇÃO (Auto-Discovery): Deve selecionar Rota Relativa quando o servidor nativo responde ao /ping", async () => {
  await resetConfig();
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
    assertEquals(config.proxy_path, DefaultProxyPath);
    const savedInDb = await getConfigValue("PROXY_PATH");
    assertEquals(savedInDb, DefaultProxyPath);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("INTEGRAÇÃO (Auto-Discovery): Deve fazer Fallback quando o servidor nativo falha mas o Fallback responde", async () => {
  await resetConfig();
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const urlStr = input.toString();
    if (urlStr.includes(FallbackAbsoluteProxy) && urlStr.includes("/ping")) {
      return new Response(JSON.stringify({ success: true, service: "loco-proxy", timestamp: Date.now() }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Internal Server Error", { status: 500 });
  };

  try {
    const config = await loadAllConfigs();
    assertEquals(config.proxy_path, FallbackAbsoluteProxy);
    const savedInDb = await getConfigValue("PROXY_PATH");
    assertEquals(savedInDb, FallbackAbsoluteProxy);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("INTEGRAÇÃO (Auto-Discovery): Deve reutilizar o ProxyPath salvo no IndexedDB sem re-testar se já configurado", async () => {
  await resetConfig();
  const customProxy = "https://meu-proxy-customizado.com";
  await saveConfig("PROXY_PATH", customProxy);
  
  let fetchChamado = false;
  globalThis.fetch = async (): Promise<Response> => {
    fetchChamado = true;
    return new Response("OK", { status: 200 });
  };

  try {
    const config = await loadAllConfigs();
    assertEquals(config.proxy_path, customProxy);
    assertEquals(fetchChamado, false, "Auto-Discovery não deveria disparar requisições de rede se a rota já está salva no banco.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

---

## Arquivo: `monorepo/ui/tests/integration/contact-purge.test.ts`

```ts
// Arquivo: monorepo/ui/tests/integration/contact-purge.test.ts
/// <reference lib="deno.ns" />
import "fake-indexeddb/auto";
import { assertEquals, assertExists } from "@std/assert";
import { removerContatoCompletamente, contatosRaw } from "../../src/stores/contatosStore.ts";
import { 
  salvarContato, salvarChat, salvarHandshake, buscarContatoPorChave, buscarChat, 
  buscarHandshake, serializarPublicKeyVapid, listarChatPaginado, listarHandshakes 
} from "@loco/utils/db";
import { generateVAPIDKeys, generateE2EEKeys, exportKeyToJWK } from "@loco/utils/crypto";
import type { Contato, Chat, Handshake } from "@loco/utils/interfaces";

Deno.test("INTEGRAÇÃO E EXPURGO: Excluir contato deve aplicar Tombstone e apagar histórico antigo em cascata", async () => {
  const vapidKeys = await generateVAPIDKeys();
  const e2eKeys = await generateE2EEKeys();
  const pubVapidJwk = await exportKeyToJWK(vapidKeys.publicKey);
  const contatoHash = await serializarPublicKeyVapid(pubVapidJwk);
  
  const novoContato: Contato = {
    id: contatoHash, name: "Contato Para Exclusão", email: "expurgo@loco.pwa",
    vapidPublicKey: pubVapidJwk, e2ePublicKey: e2eKeys.publicEncrypt,
    subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/token-expurgo", keys: { p256dh: "p256dh", auth: "auth" }, proxyserver: "https://proxy.loco.com" },
    vapidPrivateKeyEnvelope: "envelope-cifrado", trusted: true, me: "saved",
    createdAt: Date.now(), updatedAt: Date.now()
  };
  await salvarContato(novoContato);
  contatosRaw.value = [novoContato];

  const msg1: Chat = { id: "msg-expurgo-1", contatoHash, conteudo: "Mensagem enviada 1", tipo: "out", createdAt: Date.now(), handshake: "handshake-msg-1" };
  const msg2: Chat = { id: "msg-expurgo-2", contatoHash, conteudo: "Mensagem recebida 2", tipo: "in", createdAt: Date.now() + 100, handshake: "handshake-msg-2" };
  await salvarChat(msg1); await salvarChat(msg2);

  const handContato: Handshake = { id: "handshake-contato-id", aud: contatoHash, createdAt: Date.now(), updatedAt: Date.now(), out: { status: "enviado", tentativas: 1, rotas: { contato: { id: contatoHash } } } };
  const handProfile: Handshake = { id: "handshake-profile-id", aud: contatoHash, createdAt: Date.now(), updatedAt: Date.now(), out: { status: "enviado", tentativas: 1, rotas: { profile: { campos: ["name"] } } } };
  const handMensagem: Handshake = { id: "handshake-msg-1", aud: contatoHash, createdAt: Date.now(), updatedAt: Date.now(), out: { status: "enviado", tentativas: 1, rotas: { mensagem: { enviada: "msg-expurgo-1" } } } };
  await salvarHandshake(handContato); await salvarHandshake(handProfile); await salvarHandshake(handMensagem);

  assertExists(await buscarContatoPorChave(contatoHash));
  assertExists(await buscarChat("msg-expurgo-1"));

  await removerContatoCompletamente(contatoHash);

  const contatoNoDb = await buscarContatoPorChave(contatoHash);
  assertExists(contatoNoDb);
  assertEquals(contatoNoDb.me, "deleted");
  assertEquals(contatosRaw.value.some(c => c.id === contatoHash), false);

  assertEquals(await buscarChat("msg-expurgo-1"), undefined);
  assertEquals(await buscarChat("msg-expurgo-2"), undefined);
  assertEquals((await listarChatPaginado(contatoHash, 30, 0)).length, 0);

  assertEquals(await buscarHandshake("handshake-contato-id"), undefined);
  assertEquals(await buscarHandshake("handshake-profile-id"), undefined);
  assertEquals(await buscarHandshake("handshake-msg-1"), undefined);

  const allHandshakes = await listarHandshakes();
  const handshakeDelecao = allHandshakes.find(h => h.aud === contatoHash && h.out?.rotas?.contato?.removerContato === true);
  assertExists(handshakeDelecao);
});
```

---

## Arquivo: `monorepo/ui/tests/integration/message-delete-handshake.test.ts`

```ts
// Arquivo: monorepo/ui/tests/integration/message-delete-handshake.test.ts
/// <reference lib="deno.ns" />
import "fake-indexeddb/auto";
import { assertEquals, assertExists } from "@std/assert";
import { excluirMensagem } from "../../src/stores/mensagensStore.ts";
import { Processar as ProcessarMensagem } from "@loco/service-worker/handshakes/mensagem";
import { salvarChat, buscarChat, salvarHandshake, buscarHandshake, listarHandshakes, salvarContato, removerHandshake } from "@loco/utils/db";
import type { Chat, Handshake, Contato } from "@loco/utils/interfaces";

Deno.test("INTEGRAÇÃO (Exclusão - Parte 1): Apagar mensagem local deve gerar Handshake de exclusão remota OUT", async () => {
  const contatoHash = "hash-contato-bob-123";
  const msgId = "msg-para-deletar-456";
  
  const msg: Chat = { id: msgId, contatoHash, conteudo: "Mensagem que será apagada bidirecionalmente", tipo: "out", createdAt: Date.now(), handshake: "handshake-original-envio" };
  await salvarChat(msg);
  assertExists(await buscarChat(msgId));

  let mensagemSWCapturada: any = null;
  if (typeof navigator !== "undefined") {
    (navigator as any).serviceWorker = { ready: Promise.resolve({ active: { postMessage: (data: any) => { mensagemSWCapturada = data; } } }) };
  }

  await excluirMensagem(msgId, contatoHash);
  const msgNoDb = await buscarChat(msgId);
  assertEquals(msgNoDb, undefined);

  assertExists(mensagemSWCapturada);
  assertEquals(mensagemSWCapturada.type, "CRIAR_HANDSHAKE_OUT");
  assertEquals(mensagemSWCapturada.payload.rotasModulo, "mensagem");
  assertEquals(mensagemSWCapturada.payload.params.function, "excluirMensagem");
  assertEquals(mensagemSWCapturada.payload.params.msgId, msgId);

  await ProcessarMensagem({ out: mensagemSWCapturada.payload.params });
  const handshakes = await listarHandshakes();
  const handshakeExclusao = handshakes.find(h => h.aud === contatoHash && h.out?.rotas.mensagem?.excluida === msgId);
  assertExists(handshakeExclusao);
  assertEquals(handshakeExclusao.out?.status, "pendente");

  for (const h of handshakes) await removerHandshake(h.id);
});

Deno.test("INTEGRAÇÃO (Exclusão - Parte 2): Receber Handshake de exclusão remota IN deve apagar a mensagem do IndexedDB", async () => {
  const contatoHash = "hash-contato-alice-789";
  const msgIdRecebida = "msg-recebida-alice-101";
  const handshakeInId = "handshake-in-exclusao-999";

  const contato: Contato = {
    id: contatoHash, name: "Alice", email: "alice@loco.pwa",
    vapidPublicKey: {} as any, e2ePublicKey: {} as any,
    subscription: { endpoint: "ep", keys: { p256dh: "p", auth: "a" }, proxyserver: "ps" },
    vapidPrivateKeyEnvelope: "env", trusted: true, me: "saved", createdAt: Date.now(), updatedAt: Date.now()
  };
  await salvarContato(contato);

  const msgRecebida: Chat = { id: msgIdRecebida, contatoHash, conteudo: "Mensagem que a Alice decidiu apagar remotamente", tipo: "in", createdAt: Date.now(), handshake: "handshake-original-recebimento" };
  await salvarChat(msgRecebida);
  assertExists(await buscarChat(msgIdRecebida));

  const handshakeIn: Handshake = {
    id: handshakeInId, aud: contatoHash, createdAt: Date.now(), updatedAt: Date.now(),
    in: { status: "recebido", tentativas: 0, rotas: { mensagem: { excluida: msgIdRecebida } } }
  };
  await salvarHandshake(handshakeIn);

  await ProcessarMensagem({ in: handshakeInId });
  const msgAposProcessar = await buscarChat(msgIdRecebida);
  assertEquals(msgAposProcessar, undefined);

  await removerHandshake(handshakeInId);
});
```

---

## Arquivo: `monorepo/ui/tests/integration/remote-purge.test.ts`

```ts
// Arquivo: monorepo/ui/tests/integration/remote-purge.test.ts
/// <reference lib="deno.ns" />
import "fake-indexeddb/auto";
import { assertEquals, assertExists } from "@std/assert";
import { limparTodoHistorico } from "../../src/stores/mensagensStore.ts";
import { removerContatoCompletamente } from "../../src/stores/contatosStore.ts";
import { Processar as ProcessarMensagem } from "@loco/service-worker/handshakes/mensagem";
import { Processar as ProcessarContato } from "@loco/service-worker/handshakes/contato";
import { salvarChat, buscarChat, salvarContato, buscarContatoPorChave, salvarHandshake, listarHandshakes, removerHandshake, serializarPublicKeyVapid } from "@loco/utils/db";
import { generateVAPIDKeys, generateE2EEKeys, exportKeyToJWK } from "@loco/utils/crypto";
import type { Contato, Handshake } from "@loco/utils/interfaces";

Deno.test("INTEGRAÇÃO (Expurgo Remoto 1): Limpar histórico cria Handshake Único e Apaga no Remoto", async () => {
  const contatoHash = "hash-bob-purge";
  await salvarChat({ id: "m1", contatoHash, conteudo: "1", tipo: "out", createdAt: Date.now(), handshake: "h1" });
  await salvarChat({ id: "m2", contatoHash, conteudo: "2", tipo: "in", createdAt: Date.now(), handshake: "h2" });
  
  await limparTodoHistorico(contatoHash);
  
  const handshakes = await listarHandshakes();
  const handPurge = handshakes.find(h => h.aud === contatoHash && h.out?.rotas.mensagem?.limparHistorico === true);
  assertExists(handPurge);
  
  const handIn: Handshake = { id: "hand-in-purge", aud: contatoHash, createdAt: Date.now(), updatedAt: Date.now(), in: { status: "recebido", tentativas: 0, rotas: { mensagem: { limparHistorico: true } } } };
  await salvarHandshake(handIn);
  await ProcessarMensagem({ in: "hand-in-purge" });
  
  assertEquals(await buscarChat("m1"), undefined);
  assertEquals(await buscarChat("m2"), undefined);
  
  for (const h of await listarHandshakes()) await removerHandshake(h.id);
});

Deno.test("INTEGRAÇÃO (Expurgo Remoto 2): Excluir Contato cria Handshake Único de Remoção de Perfil no Remoto", async () => {
  const vapidKeys = await generateVAPIDKeys();
  const pubVapid = await exportKeyToJWK(vapidKeys.publicKey);
  const contatoHash = await serializarPublicKeyVapid(pubVapid);
  
  const contato: Contato = {
    id: contatoHash, name: "Alice", email: "a@a.com",
    vapidPublicKey: pubVapid, e2ePublicKey: {} as any,
    subscription: { endpoint: "e", keys: { p256dh: "p", auth: "a" }, proxyserver: "ps" },
    vapidPrivateKeyEnvelope: "e", trusted: true, me: "saved", createdAt: Date.now(), updatedAt: Date.now()
  };
  await salvarContato(contato);
  
  await removerContatoCompletamente(contatoHash, true);
  
  const handshakes = await listarHandshakes();
  const handDelete = handshakes.find(h => h.aud === contatoHash && h.out?.rotas.contato?.removerContato === true);
  assertExists(handDelete);
  
  const handIn: Handshake = { id: "hand-in-del-contact", aud: contatoHash, createdAt: Date.now(), updatedAt: Date.now(), in: { status: "recebido", tentativas: 0, rotas: { contato: { removerContato: true } } } };
  await salvarHandshake(handIn);
  await ProcessarContato({ in: "hand-in-del-contact" });
  
  assertEquals(await buscarContatoPorChave(contatoHash), undefined);
  
  for (const h of await listarHandshakes()) await removerHandshake(h.id);
});
```

---

## Arquivo: `monorepo/ui/tests/utils/db-helpers.test.ts.ts`

```ts
// Arquivo: monorepo/ui/tests/utils/db-helpers.test.ts
/// <reference lib="deno.ns" />
import "fake-indexeddb/auto";
import { assertEquals, assertExists } from "@std/assert";
import { salvarProfile, buscarProfile, removerProfile, salvarChat, listarChatPaginado, removerTodoHistoricoChat } from "@loco/utils/db";
import type { ProfileConfig, Chat } from "@loco/utils/interfaces";

Deno.test("DB Helpers - Profile: Deve salvar, buscar e remover o perfil corretamente", async () => {
  const mockProfile: ProfileConfig = {
    name: "Arquiteto Loco", email: "arq@loco.pwa",
    vapidPublicKey: { kty: "EC", crv: "P-256", x: "123", y: "456" } as JsonWebKey,
    vapidPrivateKeyJwk: { kty: "EC", d: "789" } as JsonWebKey,
    vapidPrivateKeyEnvelope: "envelope_cifrado",
    e2ePublicKey: { kty: "RSA", n: "abc", e: "AQAB" } as JsonWebKey,
    e2ePrivateKeyJwk: { kty: "RSA", d: "def" } as JsonWebKey,
    subscription: { endpoint: "https://push.com/123", keys: { p256dh: "p256", auth: "auth" }, proxyserver: "https://loco.proxy" },
    createdAt: Date.now(), updatedAt: Date.now()
  };
  
  await salvarProfile(mockProfile);
  const profileSalvo = await buscarProfile();
  assertExists(profileSalvo);
  assertEquals(profileSalvo.name, "Arquiteto Loco");
  assertEquals(profileSalvo.vapidPublicKey.kty, "EC");
  
  await removerProfile();
  const profileRemovido = await buscarProfile();
  assertEquals(profileRemovido, undefined);
});

Deno.test("DB Helpers - Chat: Deve salvar mensagens e retornar paginado corretamente", async () => {
  const contatoHash = "hash-contato-paginacao-123";
  await removerTodoHistoricoChat(contatoHash);
  
  const totalMensagens = 35;
  for (let i = 1; i <= totalMensagens; i++) {
    const msg: Chat = { id: `msg-${i.toString().padStart(2, '0')}`, contatoHash, conteudo: `Mensagem de teste número ${i}`, tipo: 'out', createdAt: 10000 + i, handshake: `hand-${i}` };
    await salvarChat(msg);
  }
  
  const pagina1 = await listarChatPaginado(contatoHash, 30, 0);
  assertEquals(pagina1.length, 30);
  assertEquals(pagina1[pagina1.length - 1]!.id, "msg-35");
  assertEquals(pagina1[0]!.id, "msg-06");
  
  const pagina2 = await listarChatPaginado(contatoHash, 30, 30);
  assertEquals(pagina2.length, 5);
  
  const paginaVazia = await listarChatPaginado(contatoHash, 30, 35);
  assertEquals(paginaVazia.length, 0);
  
  await removerTodoHistoricoChat(contatoHash);
  const paginaPosExclusao = await listarChatPaginado(contatoHash, 30, 0);
  assertEquals(paginaPosExclusao.length, 0);
});
```

---

## Arquivo: `monorepo/ui/tests/utils/self-contact.test.ts`

```ts
// Arquivo: monorepo/ui/tests/utils/self-contact.test.ts
/// <reference lib="deno.ns" />
import { assertEquals, assertExists, assertFalse, assert } from "@std/assert";
import type { ProfileConfig, Contato } from "@loco/utils/interfaces";
import { gerarContatoProprio, ehContatoProprio, obterHashProprio } from "@loco/utils/db";

async function serializarPublicKeyVapidMock(jwk: JsonWebKey): Promise<string> {
  if (!jwk) throw new Error("Chave VAPID ausente ao tentar serializar.");
  const raw = `${jwk.kty?.toLowerCase() || ''}|${jwk.crv?.toLowerCase() || ''}|${jwk.x?.toLowerCase() || ''}|${jwk.y?.toLowerCase() || ''}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(raw));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function assertTrue(condition: boolean, msg?: string) { assert(condition, msg); }

Deno.test("SELF-CONTACT: Deve gerar contato próprio válido a partir do profile", async () => {
  const mockProfile: ProfileConfig = {
    name: "João Silva", email: "joao@example.com",
    vapidPublicKey: { kty: "EC", crv: "P-256", x: "abc123", y: "def456" } as JsonWebKey,
    vapidPrivateKeyJwk: {} as JsonWebKey, vapidPrivateKeyEnvelope: "encrypted-key-data",
    e2ePublicKey: {} as JsonWebKey, e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: { endpoint: "https://push.example.com/subscription", keys: { p256dh: "p256dh-key", auth: "auth-key" } },
    createdAt: Date.now() - 10000, updatedAt: Date.now(),
  };
  
  const contatoProprio = await gerarContatoProprio(mockProfile);
  assertExists(contatoProprio);
  assertEquals(contatoProprio.name, "João Silva (Eu)");
  assertEquals(contatoProprio.trusted, true);
  assertEquals(contatoProprio.me, "trusted");
  
  const hashEsperado = await serializarPublicKeyVapidMock(mockProfile.vapidPublicKey);
  assertEquals(contatoProprio.id, hashEsperado);
});

Deno.test("SELF-CONTACT: Deve retornar null se profile for inválido", async () => {
  const contatoNull = await gerarContatoProprio(null as any);
  assertEquals(contatoNull, null);
});

Deno.test("SELF-CONTACT: Deve identificar corretamente se contato é o próprio usuário", async () => {
  const mockProfile: ProfileConfig = {
    name: "Maria Santos", email: "maria@example.com",
    vapidPublicKey: { kty: "EC", crv: "P-256", x: "xyz789", y: "uvw012" } as JsonWebKey,
    vapidPrivateKeyJwk: {} as JsonWebKey, vapidPrivateKeyEnvelope: "encrypted",
    e2ePublicKey: {} as JsonWebKey, e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: { endpoint: "https://push.example.com/sub", keys: { p256dh: "key1", auth: "key2" } },
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  
  const meuHash = await serializarPublicKeyVapidMock(mockProfile.vapidPublicKey);
  const ehEu = await ehContatoProprio(meuHash, mockProfile);
  assertTrue(ehEu);
  
  const ehOutro = await ehContatoProprio("outro-hash", mockProfile);
  assertFalse(ehOutro);
});

Deno.test("SELF-CONTACT: Deve obter hash próprio corretamente", async () => {
  const mockProfile: ProfileConfig = {
    name: "Pedro Oliveira", email: "pedro@example.com",
    vapidPublicKey: { kty: "EC", crv: "P-256", x: "hash-test-x", y: "hash-test-y" } as JsonWebKey,
    vapidPrivateKeyJwk: {} as JsonWebKey, vapidPrivateKeyEnvelope: "env",
    e2ePublicKey: {} as JsonWebKey, e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: { endpoint: "https://example.com", keys: { p256dh: "p", auth: "a" } },
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  
  const hashObtido = await obterHashProprio(mockProfile);
  const hashEsperado = await serializarPublicKeyVapidMock(mockProfile.vapidPublicKey);
  assertEquals(hashObtido, hashEsperado);
});
```

---

## Arquivo: `monorepo/ui/tests/utils/share-utils.test.ts`

```ts
// Arquivo: monorepo/ui/tests/utils/share-utils.test.ts
/// <reference lib="deno.ns" />
import { assert, assertEquals, assertRejects } from "@std/assert";
import { gerarLinkConviteWeb, processarQualquerConvite, extrairDadosCompactos, expandirDadosCompactos } from "@loco/utils/db";
import { generateVAPIDKeys, generateE2EEKeys, exportKeyToJWK } from "@loco/utils/crypto";
import type { ProfileConfig, Contato } from "@loco/utils/interfaces";

const mockContatos = new Map<string, Contato>();
async function salvarContatoMock(contato: Contato): Promise<void> { mockContatos.set(contato.id, contato); }
async function buscarContatoPorChaveMock(hash: string): Promise<Contato | null> { return mockContatos.get(hash) || null; }

async function serializarPublicKeyVapidMock(key: JsonWebKey): Promise<string> {
  const data = `${key.x}:${key.y}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.test("Share Utils - Geração e Importação de cJWT para Profile e Contato", async () => {
  const userA: ProfileConfig = {
    name: "Usuário A", email: "usuario.a@teste.com",
    vapidPublicKey: {} as JsonWebKey, vapidPrivateKeyJwk: {} as JsonWebKey, vapidPrivateKeyEnvelope: "",
    e2ePublicKey: {} as JsonWebKey, e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint-a", keys: { p256dh: "p256dh-a", auth: "auth-a" }, proxyserver: "https://mock.loco.proxy" },
    createdAt: Date.now(), updatedAt: Date.now()
  };
  
  const [vapidKeysA, e2eKeysA] = await Promise.all([generateVAPIDKeys(), generateE2EEKeys()]);
  userA.vapidPublicKey = await exportKeyToJWK(vapidKeysA.publicKey);
  userA.vapidPrivateKeyJwk = await exportKeyToJWK(vapidKeysA.privateKey);
  userA.e2ePublicKey = e2eKeysA.publicEncrypt;
  userA.e2ePrivateKeyJwk = e2eKeysA.privateDecryptJwk;
  
  const compactDataA = await extrairDadosCompactos(userA);
  assertEquals(compactDataA.nm, "Usuário A");
  
  const cjwtUrl = await gerarLinkConviteWeb(userA, userA.vapidPrivateKeyJwk, userA.vapidPublicKey, 'http://test.localhost');
  assert(cjwtUrl.includes("#share="));
  
  const cjwtToken = cjwtUrl.split("#share=")[1];
  const importedContato = await processarQualquerConvite(cjwtToken);
  assertEquals(importedContato.name, "Usuário A");
  
  await assertRejects(
    async () => await processarQualquerConvite("token-invalido-abc123"),
    Error,
    "O link ou código colado não é um convite válido do Loco."
  );
});
```

---

