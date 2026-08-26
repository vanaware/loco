/// <reference lib="deno.ns" />
import { assertEquals, assertExists, assertFalse, assert } from "@std/assert";
import type { ProfileConfig, Chat, Handshake } from "../../src/constants/db.ts";
import { gerarContatoProprio, ehContatoProprio, obterHashProprio } from "../../src/utils/self-contact-utils.ts";

// Helper para substituir assertTrue
function assertTrue(condition: boolean, msg?: string) {
  assert(condition, msg);
}

/**
 * Testes para funcionalidade de auto-mensagem (mensagem para si mesmo)
 * 
 * Esta suite testa o comportamento do sistema quando:
 * 1. O usuário envia mensagem para seu próprio contato
 * 2. A mensagem é salva localmente sem criar handshake
 * 3. A mensagem recebe todos os timestamps de fluxo completo (sentAt, receivedAt, readAt, notifiedAt)
 */

// Mock storage para simular IndexedDB
const mockChats = new Map<string, Chat>();
const mockHandshakes = new Map<string, Handshake>();

async function salvarChatMock(chat: Chat): Promise<void> {
  mockChats.set(chat.id, chat);
}

async function salvarHandshakeMock(handshake: Handshake): Promise<void> {
  mockHandshakes.set(handshake.id, handshake);
}

// Mock profile consistente para todos os testes
const mockProfile: ProfileConfig = {
  name: "Usuário Teste",
  email: "teste@example.com",
  vapidPublicKey: {
    kty: "EC",
    crv: "P-256",
    x: "test-x-value",
    y: "test-y-value",
  } as JsonWebKey,
  vapidPrivateKeyJwk: {} as JsonWebKey,
  vapidPrivateKeyEnvelope: "encrypted",
  e2ePublicKey: {} as JsonWebKey,
  e2ePrivateKeyJwk: {} as JsonWebKey,
  subscription: {
    endpoint: "https://push.example.com/sub",
    keys: { p256dh: "p256dh", auth: "auth" },
  },
  createdAt: Date.now() - 10000,
  updatedAt: Date.now(),
};

// Helper para calcular hash
async function calcularHashVapid(jwk: JsonWebKey): Promise<string> {
  const raw = `${jwk.kty?.toLowerCase() || ''}|${jwk.crv?.toLowerCase() || ''}|${jwk.x?.toLowerCase() || ''}|${jwk.y?.toLowerCase() || ''}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(raw));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.test("HAND-MENSAGEM SELF: Deve identificar envio para si mesmo", async () => {
  const meuHash = await obterHashProprio(mockProfile);
  assertExists(meuHash);
  
  const outroHash = "hash-de-outro-contato";
  
  const ehParaMim = await ehContatoProprio(meuHash, mockProfile);
  const ehParaOutro = await ehContatoProprio(outroHash, mockProfile);
  
  assertTrue(ehParaMim, "Deve identificar como envio para si mesmo");
  assertFalse(ehParaOutro, "Não deve identificar como envio para si mesmo");
});

Deno.test("HAND-MENSAGEM SELF: Simulação de envio de mensagem para si mesmo", async () => {
  // Limpa mocks
  mockChats.clear();
  mockHandshakes.clear();
  
  const meuHash = await obterHashProprio(mockProfile);
  assertExists(meuHash);
  
  const conteudoMensagem = "Esta é uma mensagem de teste para mim mesmo";
  const msgId = `msg-self-${Date.now()}`;
  const agora = Date.now();
  
  // Simula a lógica do hand-mensagem para auto-envio
  const chatAuto: Chat = {
    id: msgId,
    contatoHash: meuHash,
    conteudo: conteudoMensagem,
    tipo: 'out',
    createdAt: agora,
    sentAt: agora,
    receivedAt: agora,
    readAt: agora,
    notifiedAt: agora,
    handshake: 'self'
  };
  
  await salvarChatMock(chatAuto);
  
  // 🔥 Busca direto do Mock, evitando o erro de "never" do TypeScript
  const savedChat = mockChats.get(msgId);
  
  // Verifica que a mensagem foi salva
  assertExists(savedChat, "Mensagem deve ser salva no banco em memória");
  assertEquals(savedChat.id, msgId);
  assertEquals(savedChat.conteudo, conteudoMensagem);
  assertEquals(savedChat.tipo, 'out');
  assertEquals(savedChat.contatoHash, meuHash);
  
  // Verifica timestamps completos (fluxo completo simulado)
  assertExists(savedChat.sentAt, "sentAt deve existir");
  assertExists(savedChat.receivedAt, "receivedAt deve existir");
  assertExists(savedChat.readAt, "readAt deve existir");
  assertExists(savedChat.notifiedAt, "notifiedAt deve existir");
  
  // Verifica que todos os timestamps são iguais (instantâneo)
  assertEquals(savedChat.sentAt, savedChat.receivedAt);
  assertEquals(savedChat.receivedAt, savedChat.readAt);
  assertEquals(savedChat.readAt, savedChat.notifiedAt);
  
  // Verifica handshake especial
  assertEquals(savedChat.handshake, 'self', "Handshake deve ser 'self'");
  
  // Verifica que NENHUM handshake real foi criado
  assertEquals(mockHandshakes.size, 0, "Map de handshakes deve estar vazio");
});

Deno.test("HAND-MENSAGEM SELF: Mensagem normal para outro contato cria handshake", async () => {
  // Limpa mocks
  mockChats.clear();
  mockHandshakes.clear();
  
  const outroHash = "hash-de-outra-pessoa";
  const conteudoMensagem = "Mensagem para outra pessoa";
  const msgId = `msg-normal-${Date.now()}`;
  const handId = `hand-${Date.now()}`;
  const agora = Date.now();
  
  // Simula a lógica do hand-mensagem para envio normal
  const chatOut: Chat = {
    id: msgId,
    contatoHash: outroHash,
    conteudo: conteudoMensagem,
    tipo: 'out',
    createdAt: agora,
    handshake: handId
  };
  
  const handshakeNormal: Handshake = {
    id: handId,
    aud: outroHash,
    createdAt: agora,
    updatedAt: agora,
    out: {
      status: 'pendente',
      tentativas: 0,
      rotas: {
        mensagem: {
          enviada: msgId,
          conteudo: conteudoMensagem
        }
      }
    }
  };
  
  await salvarChatMock(chatOut);
  await salvarHandshakeMock(handshakeNormal);
  
  const savedChat = mockChats.get(msgId);
  const savedHandshake = mockHandshakes.get(handId);
  
  // Verifica que a mensagem foi salva
  assertExists(savedChat);
  assertEquals(savedChat.id, msgId);
  
  // Verifica que NÃO tem timestamps de recebimento/leitura (ainda não foram entregues)
  assertFalse(!!savedChat.sentAt, "sentAt não deve existir ainda");
  assertFalse(!!savedChat.receivedAt, "receivedAt não deve existir ainda");
  assertFalse(!!savedChat.readAt, "readAt não deve existir ainda");
  
  // Verifica que o handshake FOI criado
  assertExists(savedHandshake, "Handshake deve ser criado para envio normal");
  assertEquals(savedHandshake.id, handId);
  assertEquals(savedHandshake.aud, outroHash);
  assertEquals(savedHandshake.out?.status, 'pendente');
});

Deno.test("HAND-MENSAGEM SELF: Comparação entre auto-mensagem e mensagem normal", async () => {
  mockChats.clear();
  mockHandshakes.clear();
  
  const meuHash = await obterHashProprio(mockProfile);
  const outroHash = "hash-terceiro";
  const agora = Date.now();
  
  // Auto-mensagem
  const autoMsg: Chat = {
    id: `auto-${agora}`,
    contatoHash: meuHash!,
    conteudo: "Para mim",
    tipo: 'out',
    createdAt: agora,
    sentAt: agora,
    receivedAt: agora,
    readAt: agora,
    notifiedAt: agora,
    handshake: 'self'
  };
  
  // Mensagem normal
  const normalMsg: Chat = {
    id: `normal-${agora}`,
    contatoHash: outroHash,
    conteudo: "Para outro",
    tipo: 'out',
    createdAt: agora,
    handshake: `hand-${agora}`
  };
  
  await salvarChatMock(autoMsg);
  await salvarChatMock(normalMsg);
  
  const savedAuto = mockChats.get(autoMsg.id);
  const savedNormal = mockChats.get(normalMsg.id);
  
  assertExists(savedAuto);
  assertExists(savedNormal);
  
  // Diferenças críticas
  assertEquals(savedAuto.handshake, 'self');
  assertExists(savedAuto.sentAt);
  assertExists(savedAuto.receivedAt);
  assertExists(savedAuto.readAt);
  assertExists(savedAuto.notifiedAt);
  
  assertEquals(savedNormal.handshake, `hand-${agora}`);
  assertFalse(!!savedNormal.sentAt);
  assertFalse(!!savedNormal.receivedAt);
  assertFalse(!!savedNormal.readAt);
  assertFalse(!!savedNormal.notifiedAt);
  
  // Similaridades
  assertEquals(savedAuto.tipo, savedNormal.tipo, "Ambas são 'out'");
  assertEquals(savedAuto.createdAt, savedNormal.createdAt);
});

Deno.test("HAND-MENSAGEM SELF: Múltiplas auto-mensagens não criam handshakes", async () => {
  mockChats.clear();
  mockHandshakes.clear();
  
  const meuHash = await obterHashProprio(mockProfile);
  assertExists(meuHash);
  
  const mensagens = [
    "Primeira mensagem para mim",
    "Segunda mensagem para mim",
    "Terceira mensagem para mim"
  ];
  
  // 🔥 Iterador corrigido para evitar o 'string | undefined'
  let index = 0;
  for (const conteudo of mensagens) {
    const msg: Chat = {
      id: `auto-msg-${index}-${Date.now()}`,
      contatoHash: meuHash,
      conteudo: conteudo,
      tipo: 'out',
      createdAt: Date.now(),
      sentAt: Date.now(),
      receivedAt: Date.now(),
      readAt: Date.now(),
      notifiedAt: Date.now(),
      handshake: 'self'
    };
    await salvarChatMock(msg);
    index++;
  }
  
  // Verifica que todas as mensagens foram salvas
  assertEquals(mockChats.size, mensagens.length);
  
  // Verifica que nenhum handshake foi criado
  assertEquals(mockHandshakes.size, 0, "Nenhum handshake deve ser criado para auto-mensagens");
  
  // Verifica que todas as mensagens têm fluxo completo
  for (const [_id, chat] of mockChats.entries()) {
    assertExists(chat.sentAt);
    assertExists(chat.receivedAt);
    assertExists(chat.readAt);
    assertExists(chat.notifiedAt);
    assertEquals(chat.handshake, 'self');
  }
});

Deno.test("HAND-MENSAGEM SELF: Contato próprio deve ser identificado corretamente", async () => {
  const contatoProprio = await gerarContatoProprio(mockProfile);
  assertExists(contatoProprio);
  
  // Verifica propriedades especiais
  assertEquals(contatoProprio.name, "Usuário Teste (Eu)");
  assertEquals(contatoProprio.me, 'trusted');
  assertTrue(contatoProprio.trusted);
  
  // Verifica se o ID corresponde ao hash
  const hashCalculado = await calcularHashVapid(mockProfile.vapidPublicKey);
  assertEquals(contatoProprio.id, hashCalculado);
  
  // Testa detecção
  const ehEu = await ehContatoProprio(contatoProprio.id, mockProfile);
  assertTrue(ehEu);
  
  const naoEhEu = await ehContatoProprio("outro-hash", mockProfile);
  assertFalse(naoEhEu);
});