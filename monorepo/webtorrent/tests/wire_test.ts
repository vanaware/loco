// /loco/monorepo/webtorrent/tests/wire_test.ts

import { assertEquals } from "jsr:@std/assert";
import { Wire, Transport } from "../src/core/wire.ts";

// Helper: Cria um par de Wires conectados em memória (Loopback)
function createWirePair(): { wireA: Wire; wireB: Wire } {
  let handlerA: ((data: Uint8Array) => void) | null = null;
  let handlerB: ((data: Uint8Array) => void) | null = null;

  const transportA: Transport = {
    send: (data: Uint8Array) => { 
      // Envia para B na próxima microtask (simula rede assíncrona)
      queueMicrotask(() => handlerB?.(data)); 
    },
    onMessage: (handler: (data: Uint8Array) => void) => { handlerA = handler; },
    close: () => {},
  };

  const transportB: Transport = {
    send: (data: Uint8Array) => { 
      queueMicrotask(() => handlerA?.(data)); 
    },
    onMessage: (handler: (data: Uint8Array) => void) => { handlerB = handler; },
    close: () => {},
  };

  return {
    wireA: new Wire(transportA),
    wireB: new Wire(transportB),
  };
}

Deno.test("wire: completes handshake successfully", async () => {
  const { wireA, wireB } = createWirePair();
  
  const infoHash = new Uint8Array(20).fill(1);
  const peerIdA = new Uint8Array(20).fill(65); // 'A'
  const peerIdB = new Uint8Array(20).fill(66); // 'B'

  let handshakeReceivedOnB = false;
  let handshakeReceivedOnA = false;

  wireB.on("handshake", (e: CustomEvent<{ peerId: Uint8Array; extensions: Uint8Array }>) => {
    assertEquals(e.detail.peerId, peerIdA);
    handshakeReceivedOnB = true;
  });

  wireA.on("handshake", (e: CustomEvent<{ peerId: Uint8Array; extensions: Uint8Array }>) => {
    assertEquals(e.detail.peerId, peerIdB);
    handshakeReceivedOnA = true;
  });

  // A inicia o handshake, B responde
  wireA.sendHandshake(infoHash, peerIdA);
  wireB.sendHandshake(infoHash, peerIdB);

  // Aguarda as microtasks processarem os eventos
  await new Promise((resolve) => setTimeout(resolve, 50));

  assertEquals(handshakeReceivedOnB, true);
  assertEquals(handshakeReceivedOnA, true);
});

Deno.test("wire: sends and receives CHOKE and UNCHOKE", async () => {
  const { wireA, wireB } = createWirePair();
  
  // Ignora handshake para este teste focar nas mensagens
  wireA.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  wireB.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  await new Promise((resolve) => setTimeout(resolve, 50));

  let choked = false;
  let unchoked = false;

  wireB.on("choke", () => { choked = true; });
  wireB.on("unchoke", () => { unchoked = true; });

  wireA.sendChoke();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assertEquals(choked, true);
  assertEquals(wireB.peerChoking, true);

  wireA.sendUnchoke();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assertEquals(unchoked, true);
  assertEquals(wireB.peerChoking, false);
});

Deno.test("wire: sends and receives REQUEST and PIECE", async () => {
  const { wireA, wireB } = createWirePair();

  wireA.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  wireB.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  await new Promise((resolve) => setTimeout(resolve, 50));

  // B envia unchoke para A, liberando requests
  wireB.sendUnchoke();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assertEquals(wireA.peerChoking, false);

  let requestReceived = false;
  let pieceReceived = false;

  wireB.on("request", (e: CustomEvent<{ index: number; offset: number; length: number }>) => {
    assertEquals(e.detail.index, 5);
    assertEquals(e.detail.offset, 0);
    assertEquals(e.detail.length, 16384);
    requestReceived = true;
  });

  wireA.on("piece", (e: CustomEvent<{ index: number; offset: number; block: Uint8Array }>) => {
    assertEquals(e.detail.index, 5);
    assertEquals(e.detail.offset, 0);
    assertEquals(e.detail.block.length, 16384);
    assertEquals(e.detail.block[0], 42);
    pieceReceived = true;
  });

  // A pede a peça para B (agora sem choking)
  wireA.sendRequest(5, 0, 16384);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assertEquals(requestReceived, true);

  // B envia a peça para A
  const block = new Uint8Array(16384).fill(42);
  wireB.sendPiece(5, 0, block);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assertEquals(pieceReceived, true);
});

Deno.test("wire: handles fragmented messages (Stream parsing)", async () => {
  let handlerB: ((data: Uint8Array) => void) | null = null;
  
  const transportB: Transport = {
    send: () => {},
    onMessage: (handler: (data: Uint8Array) => void) => { handlerB = handler; },
    close: () => {},
  };

  const wireB = new Wire(transportB);
  let unchoked = false;
  wireB.on("unchoke", () => { unchoked = true; });

  // Handshake completo (68 bytes)
  const handshake = new Uint8Array(68);
  handshake[0] = 19;
  new TextEncoder().encodeInto("BitTorrent protocol", handshake.subarray(1, 20));
  
  // Mensagem UNCHOKE (length=1, id=1)
  const unchokeMsg = new Uint8Array([0, 0, 0, 1, 1]);

  // Simula a rede chegando em fragmentos minúsculos
  handlerB!(handshake.subarray(0, 30));
  await new Promise((resolve) => setTimeout(resolve, 5));
  handlerB!(handshake.subarray(30));
  await new Promise((resolve) => setTimeout(resolve, 5));
  
  // Envia a mensagem UNCHOKE byte por byte
  for (const byte of unchokeMsg) {
    handlerB!(new Uint8Array([byte]));
    await new Promise((resolve) => setTimeout(resolve, 2));
  }

  assertEquals(unchoked, true);
});

Deno.test("wire: validates infoHash on handshake (rejects mismatch)", async () => {
  let handlerB: ((data: Uint8Array) => void) | null = null;
  let closed = false;

  const transportB: Transport = {
    send: (data: Uint8Array) => {
      queueMicrotask(() => handlerA?.(data));
    },
    onMessage: (handler: (data: Uint8Array) => void) => { handlerB = handler; },
    close: () => { closed = true; },
  };

  let handlerA: ((data: Uint8Array) => void) | null = null;
  const transportA: Transport = {
    send: (data: Uint8Array) => {
      queueMicrotask(() => handlerB?.(data));
    },
    onMessage: (handler: (data: Uint8Array) => void) => { handlerA = handler; },
    close: () => {},
  };

  // B espera infoHash com bytes 0x01; A vai enviar infoHash com bytes 0x02
  const expectedInfoHash = new Uint8Array(20).fill(0x01);
  const wrongInfoHash = new Uint8Array(20).fill(0x02);

  const wireB = new Wire(transportB, expectedInfoHash);
  const wireA = new Wire(transportA);

  let errorReceived = false;
  wireB.on("error", () => { errorReceived = true; });

  // A envia handshake com infoHash errado
  wireA.sendHandshake(wrongInfoHash, new Uint8Array(20).fill(66));

  await new Promise((resolve) => setTimeout(resolve, 50));

  // B deve detectar o mismatch, emitir erro e fechar a conexão
  assertEquals(errorReceived, true);
  assertEquals(closed, true);
});

Deno.test("wire: accepts handshake with matching infoHash", async () => {
  let handlerA: ((data: Uint8Array) => void) | null = null;
  let handlerB: ((data: Uint8Array) => void) | null = null;

  const transportA: Transport = {
    send: (data: Uint8Array) => { queueMicrotask(() => handlerB?.(data)); },
    onMessage: (handler: (data: Uint8Array) => void) => { handlerA = handler; },
    close: () => {},
  };
  const transportB: Transport = {
    send: (data: Uint8Array) => { queueMicrotask(() => handlerA?.(data)); },
    onMessage: (handler: (data: Uint8Array) => void) => { handlerB = handler; },
    close: () => {},
  };

  const expectedInfoHash = new Uint8Array(20).fill(0xAB);
  const wireA = new Wire(transportA, expectedInfoHash);
  const wireB = new Wire(transportB, expectedInfoHash);

  let handshakeReceived = false;
  wireA.on("handshake", () => { handshakeReceived = true; });

  wireA.sendHandshake(expectedInfoHash, new Uint8Array(20).fill(65));
  wireB.sendHandshake(expectedInfoHash, new Uint8Array(20).fill(66));

  await new Promise((resolve) => setTimeout(resolve, 50));

  assertEquals(handshakeReceived, true);
});

Deno.test("wire: sendRequest blocked when peer is choking (backpressure)", async () => {
  const { wireA, wireB } = createWirePair();

  wireA.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  wireB.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  await new Promise((resolve) => setTimeout(resolve, 50));

  // peerChoking começa como true por padrão
  assertEquals(wireA.peerChoking, true);

  let requestReceived = false;
  wireB.on("request", () => { requestReceived = true; });

  // A tenta pedir peça enquanto choked — deve ser bloqueado
  wireA.sendRequest(5, 0, 16384);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assertEquals(requestReceived, false);

  // B envia unchoke, liberando A
  wireB.sendUnchoke();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assertEquals(wireA.peerChoking, false);

  // Agora o request deve passar
  wireA.sendRequest(5, 0, 16384);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assertEquals(requestReceived, true);
});

Deno.test("wire: handshake event includes infoHash", async () => {
  let handlerA: ((data: Uint8Array) => void) | null = null;
  let handlerB: ((data: Uint8Array) => void) | null = null;

  const transportA: Transport = {
    send: (data: Uint8Array) => { queueMicrotask(() => handlerB?.(data)); },
    onMessage: (handler: (data: Uint8Array) => void) => { handlerA = handler; },
    close: () => {},
  };
  const transportB: Transport = {
    send: (data: Uint8Array) => { queueMicrotask(() => handlerA?.(data)); },
    onMessage: (handler: (data: Uint8Array) => void) => { handlerB = handler; },
    close: () => {},
  };

  const infoHash = new Uint8Array(20).fill(0xCD);
  const wireA = new Wire(transportA);
  const wireB = new Wire(transportB);

  let receivedInfoHash: Uint8Array | null = null;
  wireA.on("handshake", (e: CustomEvent<{ peerId: Uint8Array; extensions: Uint8Array; infoHash: Uint8Array }>) => {
    receivedInfoHash = e.detail.infoHash;
  });

  wireA.sendHandshake(infoHash, new Uint8Array(20).fill(65));
  wireB.sendHandshake(infoHash, new Uint8Array(20).fill(66));

  await new Promise((resolve) => setTimeout(resolve, 50));

  assertEquals(receivedInfoHash !== null, true);
  assertEquals(equals(receivedInfoHash!, infoHash), true);
});

function equals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}