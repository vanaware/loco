// tests/handshakes/integration-shadow-sync.test.ts
/// <reference lib="deno.ns" />

// Injeta o Fake IndexedDB para simular o banco de dados do navegador no ambiente de testes do Deno
import "fake-indexeddb";

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
} from "../../src/utils/db-helpers.ts";
import type { ProfileConfig, Handshake } from "../../src/constants/db.ts";

Deno.test("INTEGRAÇÃO: Shadow Sync - Deve criar contato não-confiável ao receber mensagem de desconhecido", async () => {
  // 1. SETUP DO "BOB" (O usuário local que vai receber a mensagem de um desconhecido)
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
  await salvarProfile(bobProfile); // Salva o perfil do Bob no IndexedDB local

  // 2. PREPARAÇÃO DA IDENTIDADE DE "ALICE" (A remetente desconhecida)
  const aliceVapidPublic: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: "alice-x-coordinate-base64url",
    y: "alice-y-coordinate-base64url"
  };

  // 🔥 Calculamos o hash SHA-256 real da chave da Alice para bater com o comportamento interno do salvarContato
  const aliceHashId = await serializarPublicKeyVapid(aliceVapidPublic);
  await removerTodoHistoricoChat(aliceHashId); // Garante ambiente limpo

  // 3. SIMULAÇÃO DO PACOTE RECEBIDO NA REDE (Handshake IN)
  // A Alice percebeu que o Bob não a tem salva, então ela anexou o "sync" de contato junto com a "mensagem".
  const handshakeRecebidoId = "handshake-in-001";
  const handshakeSimulado: Handshake = {
    id: handshakeRecebidoId,
    aud: aliceHashId, // Quem mandou foi a Alice (ID derivado da chave VAPID)
    createdAt: Date.now(),
    updatedAt: Date.now(),
    in: {
      status: 'recebido',
      tentativas: 0,
      rotas: {
        // A Alice mandou os dados dela e pediu reciprocidade (req: true)
        contato: {
          sync: {
            req: true,
            tr: true, // A Alice confia no Bob
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
        // A Alice mandou a mensagem em si
        mensagem: {
          enviada: "msg-alice-001",
          conteudo: "Oi Bob! Sou eu, a Alice. Salva meu contato!"
        }
      }
    }
  };

  // Salva o Handshake de entrada na fila local do Bob
  await salvarHandshake(handshakeSimulado);

  // 4. EXECUÇÃO DOS PROCESSADORES (Simulando o orquestrador sw-handshakes.ts)
  
  // Passo 4.1: Processa o Contato
  await ProcessarContato({ in: handshakeRecebidoId });
  
  // Passo 4.2: Processa a Mensagem
  await ProcessarMensagem({ in: handshakeRecebidoId });

  // 5. VERIFICAÇÕES DE INTEGRIDADE DA ARQUITETURA
  
  // Verificação A: A Alice foi salva no banco de contatos do Bob pelo Hash SHA-256?
  const contatoAlice = await buscarContatoPorChave(aliceHashId);
  assertExists(contatoAlice, "O contato da Alice deve ter sido criado e encontrado pelo Hash VAPID");
  assertEquals(contatoAlice.name, "Alice Desconhecida", "O nome do contato deve ter sido preenchido");
  assertEquals(contatoAlice.trusted, false, "CRÍTICO: Um contato criado via Shadow Sync DEVE ser classificado como NÃO CONFIÁVEL por padrão de segurança");
  
  // Verificação B: A mensagem da Alice foi salva no Chat do Bob vinculada ao Hash correto?
  const mensagemAlice = await buscarChat("msg-alice-001");
  assertExists(mensagemAlice, "A mensagem deve ter sido salva no IndexedDB do Chat");
  assertEquals(mensagemAlice.conteudo, "Oi Bob! Sou eu, a Alice. Salva meu contato!");
  assertEquals(mensagemAlice.contatoHash, aliceHashId, "A mensagem deve estar vinculada ao hash do novo contato criado");

  // Verificação C: O Bob gerou as respostas automáticas de saída (Handshakes OUT)?
  const todosHandshakes = await listarHandshakes();
  const handshakesDeSaida = todosHandshakes.filter(h => h.out && h.aud === aliceHashId);
  
  // Esperamos 2 handshakes de saída para a Alice:
  // 1 para devolver o Contato do Bob (pois req era true)
  // 1 para dar o Auto-Ack (entregue) da Mensagem
  assert(handshakesDeSaida.length >= 2, "O sistema deve ter enfileirado respostas automáticas para a Alice");

  const temRespostaDeContato = handshakesDeSaida.some(h => h.out?.rotas?.contato?.sync !== undefined);
  const temRespostaDeMensagem = handshakesDeSaida.some(h => h.out?.rotas?.mensagem?.data !== undefined);

  assertEquals(temRespostaDeContato, true, "O Bob deve ter enfileirado o envio dos seus dados de perfil para a Alice (Reciprocidade)");
  assertEquals(temRespostaDeMensagem, true, "O Bob deve ter enfileirado o recibo de 'Entregue' para a Alice (Auto-Ack)");
});