/// <reference lib="deno.ns" />
import "fake-indexeddb/auto";
import { assert, assertEquals } from "@std/assert";
import { processarFilaHandshake } from "../../src/sw/handshakes.ts";
import { 
  salvarProfile, 
  salvarContato, 
  salvarHandshake, 
  listarHandshakes, 
  removerHandshake, 
  buscarHandshake,
  serializarPublicKeyVapid 
} from "@loco/utils/db";
import { generateVAPIDKeys, generateE2EEKeys, exportKeyToJWK } from "@loco/utils/crypto";
import type { ProfileConfig, Contato, Handshake } from "@loco/utils/interfaces";

const originalFetch = globalThis.fetch;

async function setupMockDb(hasProxy: boolean) {
  const vapidKeys = await generateVAPIDKeys();
  const e2eKeys = await generateE2EEKeys();
  const pubVapid = await exportKeyToJWK(vapidKeys.publicKey);
  const contatoHash = await serializarPublicKeyVapid(pubVapid);

  const profile: ProfileConfig = {
    name: "Arquiteto",
    email: "arq@loco.pwa",
    vapidPublicKey: pubVapid,
    vapidPrivateKeyJwk: await exportKeyToJWK(vapidKeys.privateKey),
    vapidPrivateKeyEnvelope: "envelope-ficticio",
    e2ePublicKey: e2eKeys.publicEncrypt,
    e2ePrivateKeyJwk: e2eKeys.privateDecryptJwk,
    subscription: {
      endpoint: "https://push.test/meu-endpoint",
      keys: { p256dh: "k", auth: "a" },
      proxyserver: hasProxy ? "https://meu-proxy.com" : ""
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarProfile(profile);

  const contato: Contato = {
    id: contatoHash, 
    name: "Destinatario",
    email: "dest@loco.pwa",
    vapidPublicKey: pubVapid,
    e2ePublicKey: e2eKeys.publicEncrypt,
    subscription: { endpoint: "https://push.test/dest", keys: { p256dh: "k", auth: "a" }, proxyserver: "https://proxy-dele.com" },
    vapidPrivateKeyEnvelope: "env",
    trusted: true,
    me: 'none', 
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarContato(contato);

  return { profile, contato, contatoHash };
}

Deno.test("ROTEADOR: Sanity Check DEVE bloquear injeção de PIG se perfil não tiver Proxy", async () => {
  const { contatoHash } = await setupMockDb(false);
  globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));

  const handshakeId = "handshake-sanity-1";
  const handshake: Handshake = {
    id: handshakeId,
    aud: contatoHash, 
    createdAt: Date.now(),
    updatedAt: Date.now(),
    out: {
      status: 'pendente',
      tentativas: 0,
      rotas: { mensagem: { conteudo: "Olá!" } }
    }
  };
  await salvarHandshake(handshake);

  try {
    await processarFilaHandshake();
    const processado = await buscarHandshake(handshakeId);
    assertEquals(processado?.out?.status, 'enviado');
    assertEquals(processado?.out?.rotas?.contato?.sync, undefined, "Sanity Check FALHOU: Injetou PIG sem Proxy!");
    const todos = await listarHandshakes();
    assertEquals(todos.length, 1, "Não deveria ter gerado handshake extra");
  } finally {
    await removerHandshake(handshakeId);
  }
});

Deno.test("ROTEADOR: Splitter de MTU DEVE fragmentar pacote se PIG ultrapassar 4KB", async () => {
  const { contatoHash } = await setupMockDb(true);
  let chamadasDeRede = 0;
  globalThis.fetch = () => {
    chamadasDeRede++;
    return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
  };

  const bytesAleatorios = crypto.getRandomValues(new Uint8Array(1400));
  let binaryString = "";
  for (const byte of bytesAleatorios) {
    binaryString += String.fromCharCode(byte);
  }
  const mensagemGigante = btoa(binaryString);

  const handshakeId = "handshake-gigante-1";
  const handshake: Handshake = {
    id: handshakeId,
    aud: contatoHash,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    out: {
      status: 'pendente',
      tentativas: 0,
      rotas: { mensagem: { conteudo: mensagemGigante } }
    }
  };
  await salvarHandshake(handshake);

  try {
    await processarFilaHandshake();
    const hOriginal = await buscarHandshake(handshakeId);
    assertEquals(hOriginal?.out?.status, 'enviado');
    assertEquals(hOriginal?.out?.rotas?.contato?.sync, undefined);

    const filaCompleta = await listarHandshakes();
    const handshakesNovos = filaCompleta.filter(h => h.id !== handshakeId);
    assertEquals(handshakesNovos.length, 1, "Deveria ter criado 1 novo handshake para o PIG");

    const handshakeFragmentado = handshakesNovos[0];
    assert(handshakeFragmentado !== undefined);
    assertEquals(handshakeFragmentado.out?.status, 'pendente');
    assert(handshakeFragmentado.out?.rotas?.contato?.sync !== undefined);
    assertEquals(chamadasDeRede, 1, "Apenas o primeiro pacote deveria ter sido enviado");

    await removerHandshake(handshakeFragmentado.id);
  } finally {
    await removerHandshake(handshakeId);
    globalThis.fetch = originalFetch; 
  }
});