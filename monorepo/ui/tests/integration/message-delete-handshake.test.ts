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