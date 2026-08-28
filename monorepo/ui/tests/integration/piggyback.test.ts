// tests/integration/piggyback.test.ts
/// <reference lib="deno.ns" />

import "fake-indexeddb";
import { assertEquals, assertExists } from "@std/assert";
import { 
  salvarProfile, 
  salvarContato, 
  buscarContatoPorChave, 
  salvarHandshake, 
  listarHandshakes,
  removerHandshake,
  serializarPublicKeyVapid
} from "../../../utils/src/db/mod.ts";
import { generateVAPIDKeys, generateE2EEKeys, exportKeyToJWK } from "../../../utils/src/crypto/mod.ts";
import { processarFilaHandshake } from "../../src/sw/sw-handshakes.ts";
import { Processar as ProcessarContato } from "../../src/handshakes/hand-contato.ts";
import type { ProfileConfig, Contato, Handshake } from "../../../utils/src/interfaces/db.ts";

// Mock da função de fetch para evitar erros de rede e simular sucesso no Proxy
const originalFetch = globalThis.fetch;

Deno.test("INTEGRAÇÃO (PIGGYBACK 1): Mensagem para contato 'me: none' DEVE forçar a injeção do Piggyback", async () => {
  globalThis.fetch = async () => new Response("OK", { status: 200 });

  // 1. SETUP: Perfil da Alice (Remetente)
  const aliceVapid = await generateVAPIDKeys();
  const aliceE2e = await generateE2EEKeys();
  const alicePubVapid = await exportKeyToJWK(aliceVapid.publicKey);
  const alicePrivVapid = await exportKeyToJWK(aliceVapid.privateKey);
  
  const aliceProfile: ProfileConfig = {
    name: "Alice Original",
    email: "alice@loco.pwa",
    vapidPublicKey: alicePubVapid,
    vapidPrivateKeyJwk: alicePrivVapid,
    vapidPrivateKeyEnvelope: "envelope-falso",
    e2ePublicKey: aliceE2e.publicEncrypt,
    e2ePrivateKeyJwk: {} as any,
    subscription: { endpoint: "https://fcm", keys: { p256dh: "p", auth: "a" }, proxyserver: "proxy" },
    createdAt: Date.now(), updatedAt: Date.now()
  };
  await salvarProfile(aliceProfile);

  // 2. SETUP: Alice adiciona Bob, mas ele não tem os dados dela (me: 'none')
  const bobVapid = await generateVAPIDKeys();
  const bobE2e = await generateE2EEKeys();
  const bobPubVapid = await exportKeyToJWK(bobVapid.publicKey);
  const bobHash = await serializarPublicKeyVapid(bobPubVapid);

  const bobContato: Contato = {
    id: bobHash, name: "Bob", email: "bob@loco.pwa",
    vapidPublicKey: bobPubVapid, e2ePublicKey: bobE2e.publicEncrypt,
    subscription: { endpoint: "https://fcm-bob", keys: { p256dh: "p", auth: "a" }, proxyserver: "proxy" },
    vapidPrivateKeyEnvelope: "env", trusted: true, 
    me: "none", // 🔥 REGRA CHAVE: Bob não sabe quem é a Alice!
    createdAt: Date.now(), updatedAt: Date.now()
  };
  await salvarContato(bobContato);

  // 3. AÇÃO: Alice envia uma mensagem para Bob
  const msgHandshake: Handshake = {
    id: "hand-msg-alice-bob", aud: bobHash, createdAt: Date.now(), updatedAt: Date.now(),
    out: { status: 'pendente', tentativas: 0, rotas: { mensagem: { enviada: "msg-123", conteudo: "Oi Bob!" } } }
  };
  await salvarHandshake(msgHandshake);

  // 4. PROCESSAMENTO: O SW Roteador entra em ação
  await processarFilaHandshake();

  // 5. PROVA: O SW da Alice injetou os dados do perfil (Piggyback) na rota de contato antes de enviar?
  const handshakes = await listarHandshakes();
  const sentHandshake = handshakes.find(h => h.id === "hand-msg-alice-bob");
  
  assertExists(sentHandshake?.out?.rotas?.contato?.sync, "FALHA: O Piggyback (rota sync) NÃO foi injetado na mensagem de saída!");
  assertEquals((sentHandshake.out.rotas.contato.sync as any).nm, "Alice Original", "O nome da Alice não foi embutido no Piggyback.");

  for (const h of handshakes) await removerHandshake(h.id);
  globalThis.fetch = originalFetch;
});

Deno.test("INTEGRAÇÃO (PIGGYBACK 2): Receber um Piggyback DEVE criar o contato real no destino", async () => {
  // 1. SETUP: Cria chaves criptográficas REAIS para que o Hash ID funcione no IndexedDB
  const aliceVapid = await generateVAPIDKeys();
  const aliceE2e = await generateE2EEKeys();
  const alicePubVapid = await exportKeyToJWK(aliceVapid.publicKey);
  
  // 🔥 CORREÇÃO: aliceE2e.publicEncrypt já é um JWK nativamente!
  const alicePubE2e = aliceE2e.publicEncrypt; 
  const aliceHash = await serializarPublicKeyVapid(alicePubVapid);

  // Verifica que a Alice não existe no banco do Bob
  let aliceNoDb = await buscarContatoPorChave(aliceHash);
  assertEquals(aliceNoDb, undefined, "Alice não deveria existir no celular do Bob ainda.");

  // 2. AÇÃO: Bob recebe um Handshake contendo a rota 'sync' (O Piggyback)
  const incomingHandshake: Handshake = {
    id: "hand-in-piggyback", aud: aliceHash, createdAt: Date.now(), updatedAt: Date.now(),
    in: {
      status: 'recebido', tentativas: 0,
      rotas: {
        contato: {
          sync: {
            nm: "Alice Nova", em: "alice@loco.pwa",
            vp: { x: alicePubVapid.x!, y: alicePubVapid.y! }, 
            ep: { n: alicePubE2e.n!, e: alicePubE2e.e! },
            se: "https://fcm-alice", sp: "p256", sa: "auth", ps: "proxy", ve: "env", tr: false
          }
        }
      }
    }
  };
  await salvarHandshake(incomingHandshake);

  // 3. PROCESSAMENTO: O módulo de Contatos processa a entrada
  await ProcessarContato({ in: incomingHandshake.id });

  // 4. PROVA: O contato da Alice foi criado fisicamente a partir do Piggyback com o Hash correto?
  aliceNoDb = await buscarContatoPorChave(aliceHash);
  
  assertExists(aliceNoDb, "FALHA: O Contato da Alice NÃO foi criado a partir do Piggyback recebido!");
  assertEquals(aliceNoDb.name, "Alice Nova", "O nome não foi extraído corretamente.");
  assertEquals(aliceNoDb.me, "saved", "O status de relacionamento 'me' deveria iniciar como 'saved' após a ingestão de um Piggyback comum.");

  await removerHandshake(incomingHandshake.id);
});