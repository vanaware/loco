/**
 * @file test_trackers.ts
 * @description Utilitário para testar a saúde e resposta de trackers WebTorrent (WebSocket).
 * @stack Deno 2.x, TypeScript, Web Crypto API, jsr:@std/encoding
 */

import { encodeBase64 } from "jsr:@std/encoding/base64";

/**
 * Gera uma string Base64 de 20 bytes aleatórios, simulando info_hash ou peer_id.
 */
function generateRandom20BytesBase64(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return encodeBase64(bytes);
}

/**
 * Testa um único tracker WebTorrent.
 * @param url A URL do tracker (ws:// ou wss://)
 * @param timeoutMs Tempo máximo de espera em milissegundos (padrão: 3000ms)
 * @returns Promise<boolean> true se o tracker respondeu ao announce, false caso contrário.
 */
async function testTracker(url: string, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;
    let ws: WebSocket | null = null;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.close(1000, "Teste concluído");
        }
        resolve(false);
      }
    };

    try {
      ws = new WebSocket(url);
    } catch (error) {
      console.error(`❌ Falha ao instanciar WebSocket para ${url}:`, error);
      resolve(false);
      return;
    }

    ws.onopen = () => {
      try {
        // Payload mínimo válido conforme especificação do bittorrent-tracker
        const payload = {
          action: "announce",
          info_hash: generateRandom20BytesBase64(),
          peer_id: generateRandom20BytesBase64(),
          numwant: 1,
          port: 6881,
          left: 0,
          event: "started",
        };
        ws!.send(JSON.stringify(payload));
      } catch (error) {
        console.error(`❌ Erro ao enviar payload para ${url}:`, error);
        cleanup();
      }
    };

    ws.onmessage = () => {
      if (!resolved) {
        resolved = true;
        ws!.close(1000, "Resposta recebida com sucesso");
        resolve(true); // O tracker está vivo e processando mensagens
      }
    };

    ws.onerror = () => {
      cleanup();
    };

    ws.onclose = () => {
      cleanup();
    };

    // Mecanismo de timeout para evitar conexões "penduradas"
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (ws) {
          ws.close(1000, "Timeout atingido");
        }
        resolve(false);
      }
    }, timeoutMs);
  });
}

/**
 * Executa o teste em massa e exibe um relatório formatado no console.
 */
async function runTrackerDiagnostics() {
  const trackersToTest = [
    "wss://tracker.webtorrent.dev:443",
    "wss://tracker.openwebtorrent.com:443",
    "wss://open.ftorrent.com:443",
    "wss://tracker.files.fm:7073/announce",
    "ws://tracker.files.fm:7072/announce",
    "wss://tracker.btorrent.xyz:443",
    "wss://tracker.novage.com.ua:443",
  ];

  console.log("🚀 Iniciando diagnóstico de Trackers WebTorrent...\n");
  console.log(`| ${"Tracker".padEnd(45)} | ${"Status".padEnd(10)} | ${"Tempo"} |`);
  console.log(`|${"-".repeat(47)}|${"-".repeat(12)}|${"-".repeat(9)}|`);

  const results: { url: string; isAlive: boolean; timeMs: number }[] = [];

  for (const url of trackersToTest) {
    const startTime = performance.now();
    const isAlive = await testTracker(url, 3000);
    const timeMs = Math.round(performance.now() - startTime);
    
    results.push({ url, isAlive, timeMs });

    const statusIcon = isAlive ? "✅ ATIVO" : "❌ FALHOU";
    const statusPadded = statusIcon.padEnd(10);
    const urlPadded = url.padEnd(45);
    const timePadded = `${timeMs}ms`.padEnd(7);

    console.log(`| ${urlPadded} | ${statusPadded} | ${timePadded} |`);
  }

  console.log(`\n📊 Resumo: ${results.filter((r) => r.isAlive).length} de ${results.length} trackers estão operacionais.`);
  
  // Sugestão de ação: Filtrar apenas os vivos para uso em produção
  const healthyTrackers = results.filter((r) => r.isAlive).map((r) => r.url);
  if (healthyTrackers.length > 0) {
    console.log("\n💡 Lista saudável recomendada para o array PUBLIC_TRACKERS:");
    console.log(JSON.stringify(healthyTrackers, null, 2));
  } else {
    console.warn("\n⚠️ Nenhum tracker respondeu. Verifique sua conexão de rede ou firewall.");
  }
}

// Executa se for o módulo principal
if (import.meta.main) {
  runTrackerDiagnostics();
}