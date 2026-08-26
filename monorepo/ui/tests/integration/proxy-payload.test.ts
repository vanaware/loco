// tests/integration/proxy-payload.test.ts
/// <reference lib="deno.ns" />

import "fake-indexeddb";
import { assert, assertEquals, assertExists } from "@std/assert";

import { processarFilaHandshake } from "../../src/sw/sw-handshakes.ts";
import { 
  salvarProfile, 
  salvarContato, 
  salvarHandshake, 
  serializarPublicKeyVapid, 
  removerHandshake,
  listarHandshakes
} from "../../src/utils/db-helpers.ts";
import { generateVAPIDKeys, generateE2EEKeys, exportKeyToJWK } from "../../src/utils/crypto-utils.ts";
import type { ProfileConfig, Contato, Handshake } from "../../src/constants/db.ts";

const originalFetch = globalThis.fetch;

Deno.test("INTEGRAÇÃO REAL (Router -> Proxy): O Roteador envia o proxyserver padronizado dentro de subscription", async () => {
  
  const aliceVapid = await generateVAPIDKeys();
  const aliceE2E = await generateE2EEKeys();
  const alicePubVapid = await exportKeyToJWK(aliceVapid.publicKey);

  const bobVapid = await generateVAPIDKeys();
  const bobE2E = await generateE2EEKeys();
  const bobPubVapid = await exportKeyToJWK(bobVapid.publicKey);
  const bobHash = await serializarPublicKeyVapid(bobPubVapid);

  const myProfile: ProfileConfig = {
    name: "Alice",
    email: "alice@loco.pwa",
    vapidPublicKey: alicePubVapid,
    vapidPrivateKeyJwk: await exportKeyToJWK(aliceVapid.privateKey),
    vapidPrivateKeyEnvelope: "envelope-cifrado-da-alice",
    e2ePublicKey: aliceE2E.publicEncrypt,
    e2ePrivateKeyJwk: aliceE2E.privateDecryptJwk,
    subscription: {
      endpoint: "https://push.alice.com",
      keys: { p256dh: "alice-p256dh", auth: "alice-auth" },
      proxyserver: "https://proxy.loco.com"
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarProfile(myProfile);

  const contatoBob: Contato = {
    id: bobHash,
    name: "Bob",
    email: "bob@loco.pwa",
    vapidPublicKey: bobPubVapid,
    e2ePublicKey: bobE2E.publicEncrypt,
    subscription: {
      endpoint: "https://fcm.googleapis.com/fcm/send/bob-token-secreto",
      keys: { p256dh: "bob-p256dh", auth: "bob-auth" },
      proxyserver: "https://proxy.loco.com"
    },
    vapidPrivateKeyEnvelope: "envelope-cifrado-do-bob",
    trusted: true,
    me: 'none', 
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarContato(contatoBob);

  const handshakeId = "handshake-teste-payload";
  const handshakeOut: Handshake = {
    id: handshakeId,
    aud: bobHash,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    out: {
      status: 'pendente',
      tentativas: 0,
      rotas: {
        mensagem: {
          enviada: "msg-123",
          conteudo: "Olá Bob! Testando o proxyserver padronizado no subscription!"
        }
      }
    }
  };
  await salvarHandshake(handshakeOut);

  let requestInterceptada: any = null;
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (init && init.body) {
      requestInterceptada = JSON.parse(init.body as string);
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };

  try {
    await processarFilaHandshake();

    assertExists(requestInterceptada, "O Roteador não realizou a chamada de rede (fetch)!");

    // A) O Subscription padronizado com endpoint, keys e proxyserver
    assertExists(requestInterceptada.subscription);
    assertEquals(requestInterceptada.subscription.endpoint, contatoBob.subscription.endpoint);
    
    // 🔥 PROVA MATEMÁTICA: O proxyserver está perfeitamente padronizado dentro de subscription!
    assertEquals(requestInterceptada.subscription.proxyserver, contatoBob.subscription.proxyserver, "O proxyserver DEVE estar dentro de subscription");

    // B) Credenciais VAPID do destinatário
    assertExists(requestInterceptada.vapid);
    assertEquals(requestInterceptada.vapid.publicKey.x, bobPubVapid.x);
    assertEquals(requestInterceptada.vapid.privateKey, contatoBob.vapidPrivateKeyEnvelope);

    // C) JWT Payload
    assertExists(requestInterceptada.payloadText);

  } finally {
    globalThis.fetch = originalFetch;
    
    const fila = await listarHandshakes();
    for (const h of fila) {
      await removerHandshake(h.id);
    }
  }
});