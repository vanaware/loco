// Arquivo: monorepo/utils/tests/webtorrent/webtorrent.test.ts
/// <reference lib="deno.ns" />
import { assertEquals, assertRejects } from "jsr:@std/assert";
import { webTorrent } from "../../src/webtorrent/mod.ts";

// Mock da classe WebTorrent
class MockWebTorrentClient {
  static WEBRTC_SUPPORT = true;
  destroy() {}
  createServer() {}
}

// Helper para configurar mocks globais de forma segura no Deno
function setupGlobalMocks() {
  (globalThis as any).window = globalThis;
  (globalThis as any).window.WebTorrent = MockWebTorrentClient;
  
  // 🔥 CORREÇÃO: Garante que navigator e serviceWorker existam antes de setar propriedades
  if (!(globalThis as any).navigator) {
    (globalThis as any).navigator = {};
  }
  if (!(globalThis as any).navigator.serviceWorker) {
    (globalThis as any).navigator.serviceWorker = {};
  }
}

function cleanupGlobalMocks() {
  delete (globalThis as any).window.WebTorrent;
}

Deno.test("WebTorrent Wrapper: Deve falhar se SW não der ACK (Timeout)", async () => {
  setupGlobalMocks();
  
  // Mock SW que nunca responde (causa timeout de 5s)
  (globalThis as any).navigator.serviceWorker.ready = Promise.resolve({
    active: {
      postMessage: (_msg: any, _ports: any) => {
        // Não faz nada, simulando um SW travado
      }
    }
  });

  await assertRejects(
    async () => {
      await webTorrent.startWebTorrent();
    },
    Error,
    "Timeout"
  );
  
  cleanupGlobalMocks();
});

Deno.test("WebTorrent Wrapper: Deve inicializar com sucesso e limpar no stop", async () => {
  setupGlobalMocks();
  
  // Mock SW que responde com ACK via MessageChannel
  (globalThis as any).navigator.serviceWorker.ready = Promise.resolve({
    active: {
      postMessage: (msg: any, ports: any) => {
        if (msg?.type === 'WEBTORRENT_READY' && ports && ports[0]) {
          // Simula o SW respondendo com ACK
          ports[0].postMessage({ type: 'WEBTORRENT_ACK' });
        }
      }
    }
  });

  await webTorrent.startWebTorrent();
  assertEquals(webTorrent.isReady, true);

  await webTorrent.stopWebTorrent();
  assertEquals(webTorrent.isReady, false);
  
  cleanupGlobalMocks();
});