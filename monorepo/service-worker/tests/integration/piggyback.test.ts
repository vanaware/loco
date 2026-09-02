/// <reference lib="deno.ns" />
import "fake-indexeddb/auto";
import { assertEquals, assertExists } from "@std/assert";
import { 
  salvarProfile, 
  salvarContato, 
  buscarContatoPorChave, 
  salvarHandshake, 
  listarHandshakes,
  removerHandshake,
  serializarPublicKeyVapid
} from "@loco/utils/db";
import { generateVAPIDKeys, generateE2EEKeys, exportKeyToJWK } from "@loco/utils/crypto";
import { processarFilaHandshake } from "../../src/sw/handshakes.ts";
import { Processar as ProcessarContato } from "../../src/handshakes/hand-contato.ts";
import type { ProfileConfig, Contato, Handshake } from "@loco/utils/interfaces";

const originalFetch = globalThis.fetch;

Deno.test("INTEGRAÇÃO (PIGGYBACK 1): Mensagem para contato 'me: none' DEVE forçar injeção do Piggyback", async () => {
  globalThis.fetch = async () => new Response("OK", { status: 200 });

  // 1. SETUP: Perfil da Alice
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

  // 2. SETUP: Bob não tem dados da Alice (me: 'none')
  const bobVapid = await generateVAPIDKeys();
  const bobE2e = await generateE2EEKeys();
  const bobPubVapid = await exportKeyToJWK(bobVapid.publicKey);
  const bobHash = await serializarPublicKeyVapid(bobPubVapid);

  const bobContato: Contato = {
    id: bobHash, name: "Bob", email: "bob@loco.pwa",
    vapidPublicKey: bobPubVapid, e2ePublicKey: bobE2e.publicEncrypt,
    subscription: { endpoint: "https://fcm-bob", keys: { p256dh: "p", auth: "a" }, proxyserver: "proxy" },
    vapidPrivateKeyEnvelope: "env", trusted: true, 
    me: "none",
    createdAt: Date.now(), updatedAt: Date.now()
  };
  await salvarContato(bobContato);

  // 3. AÇÃO: Alice envia mensagem
  const msgHandshake: Handshake = {
    id: "hand-msg-alice-bob", aud: bobHash, createdAt: Date.now(), updatedAt: Date.now(),
    out: { status: 'pendente', tentativas: 0, rotas: { mensagem: { enviada: "msg-123", conteudo: "Oi Bob!" } } }
  };
  await salvarHandshake(msgHandshake);

  // 4. PROCESSAMENTO
  await processarFilaHandshake();

  // 5. PROVA
  const handshakes = await listarHandshakes();
  const sentHandshake = handshakes.find(h => h.id === "hand-msg-alice-bob");
  assertExists(sentHandshake?.out?.rotas?.contato?.sync, "Piggyback NÃO foi injetado!");
  assertEquals((sentHandshake.out.rotas.contato.sync as any).nm, "Alice Original");

  for (const h of handshakes) await removerHandshake(h.id);
  globalThis.fetch = originalFetch;
});

Deno.test("INTEGRAÇÃO (PIGGYBACK 2): Receber Piggyback DEVE criar contato real no destino", async () => {
  // 1. SETUP
  const aliceVapid = await generateVAPIDKeys();
  const aliceE2e = await generateE2EEKeys();
  const alicePubVapid = await exportKeyToJWK(aliceVapid.publicKey);
  const alicePubE2e = aliceE2e.publicEncrypt; 
  const aliceHash = await serializarPublicKeyVapid(alicePubVapid);

  let aliceNoDb = await buscarContatoPorChave(aliceHash);
  assertEquals(aliceNoDb, undefined, "Alice não deveria existir ainda");

  // 2. AÇÃO: Bob recebe Piggyback
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

  // 3. PROCESSAMENTO
  await ProcessarContato({ in: incomingHandshake.id });

  // 4. PROVA
  aliceNoDb = await buscarContatoPorChave(aliceHash);
  assertExists(aliceNoDb, "Contato da Alice NÃO foi criado!");
  assertEquals(aliceNoDb.name, "Alice Nova");
  assertEquals(aliceNoDb.me, "saved");

  await removerHandshake(incomingHandshake.id);
});