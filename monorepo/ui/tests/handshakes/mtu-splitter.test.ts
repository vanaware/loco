// tests/handshakes/mtu-splitter.test.ts
/// <reference lib="deno.ns" />

import "fake-indexeddb";
import { assert, assertEquals } from "@std/assert";

import { processarFilaHandshake } from "../../src/sw/sw-handshakes.ts";
import { 
  salvarProfile, 
  salvarContato, 
  salvarHandshake, 
  listarHandshakes, 
  removerHandshake, 
  buscarHandshake,
  serializarPublicKeyVapid 
} from "../../src/utils/db-helpers.ts";
import { generateVAPIDKeys, generateE2EEKeys, exportKeyToJWK } from "../../src/utils/crypto-utils.ts";
import type { ProfileConfig, Contato, Handshake } from "../../src/constants/db.ts";

// Variável para armazenar o fetch original e restaurar depois
const originalFetch = globalThis.fetch;

async function setupMockDb(hasProxy: boolean) {
  const vapidKeys = await generateVAPIDKeys();
  const e2eKeys = await generateE2EEKeys();
  const pubVapid = await exportKeyToJWK(vapidKeys.publicKey);
  
  const contatoHash = await serializarPublicKeyVapid(pubVapid);

  // Perfil Local
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
      proxyserver: hasProxy ? "https://meu-proxy.com" : "" // Controla o Sanity Check
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarProfile(profile);

  // Contacto de Destino
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

Deno.test("ROTEADOR: Sanity Check DEVE bloquear injeção de PIG se o perfil não tiver Proxy configurado", async () => {
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
    assertEquals(processado?.out?.status, 'enviado', "O handshake deveria ter sido enviado normalmente");
    assertEquals(processado?.out?.rotas?.contato?.sync, undefined, "O Sanity Check FALHOU: Injetou PIG mesmo sem Proxy configurado!");

    const todos = await listarHandshakes();
    assertEquals(todos.length, 1, "Não deveria ter gerado nenhum handshake extra de fragmentação");
  } finally {
    await removerHandshake(handshakeId);
  }
});

Deno.test("ROTEADOR: Splitter de MTU DEVE fragmentar o pacote em dois se a injeção do PIG ultrapassar 4KB", async () => {
  const { contatoHash } = await setupMockDb(true);

  let chamadasDeRede = 0;
  globalThis.fetch = () => {
    chamadasDeRede++;
    return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
  };

  // 🔥 SOLUÇÃO DA MATEMÁTICA DO PAYLOAD:
  // 1400 bytes entrópicos é o "ponto de equilíbrio". 
  // Com o PIG, o pacote passa de 4000 bytes e sofre o split.
  // Sem o PIG, o pacote fica com ~3500 bytes (seguro e dentro dos 4096 permitidos pelo FCM).
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
    assertEquals(hOriginal?.out?.status, 'enviado', "A mensagem gigante não foi enviada");
    assertEquals(hOriginal?.out?.rotas?.contato?.sync, undefined, "O Splitter não removeu o PIG da mensagem gigante original");

    const filaCompleta = await listarHandshakes();
    const handshakesNovos = filaCompleta.filter(h => h.id !== handshakeId);
    
    assertEquals(handshakesNovos.length, 1, "O Splitter FALHOU: Deveria ter criado exatamente 1 novo handshake para carregar o PIG fragmentado");
    
    const handshakeFragmentado = handshakesNovos[0];
    assert(handshakeFragmentado !== undefined, "O handshake fragmentado não foi encontrado na fila.");

    assertEquals(handshakeFragmentado.out?.status, 'pendente', "O novo handshake do PIG deve estar na fila como pendente");
    assert(handshakeFragmentado.out?.rotas?.contato?.sync !== undefined, "O novo handshake DEVE conter a propriedade contato.sync (O PIG)");

    assertEquals(chamadasDeRede, 1, "Apenas o primeiro pacote deveria ter sido enviado nesta rodada");

    await removerHandshake(handshakeFragmentado.id);
  } finally {
    await removerHandshake(handshakeId);
    globalThis.fetch = originalFetch; 
  }
});