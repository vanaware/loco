// tests/integration/auto-discovery.test.ts
/// <reference lib="deno.ns" />

import "fake-indexeddb";
import { assertEquals } from "@std/assert";
import { loadAllConfigs, resetConfig, getConfigValue, saveConfig } from "../../src/stores/config-store.ts";
import { DefaultProxyPath, FallbackAbsoluteProxy } from "../../src/constants/config.ts";

const originalFetch = globalThis.fetch;

Deno.test("INTEGRAÇÃO (Auto-Discovery): Deve selecionar Rota Relativa quando o servidor nativo responde ao /ping", async () => {
  await resetConfig(); // Garante banco limpo e reseta a chave

  // Simula que o servidor local/nativo (DefaultProxyPath) está ONLINE e é um loco-proxy válido
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const urlStr = input.toString();
    if (urlStr.includes("/ping")) {
      return new Response(JSON.stringify({ success: true, service: "loco-proxy", timestamp: Date.now() }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Not Found", { status: 404 });
  };

  try {
    const config = await loadAllConfigs();
    
    // Deve ter preferido o servidor relativo nativo ("/")
    assertEquals(config.proxy_path, DefaultProxyPath);
    
    // Verifica se salvou e retornou a decisão no IndexedDB
    const savedInDb = await getConfigValue("PROXY_PATH");
    assertEquals(savedInDb, DefaultProxyPath);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("INTEGRAÇÃO (Auto-Discovery): Deve fazer Fallback quando o servidor nativo falha mas o Fallback responde", async () => {
  await resetConfig();

  // Simula que o servidor local falha/dá 500, mas o Fallback responde com sucesso
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const urlStr = input.toString();
    
    // Se a chamada for para o Fallback remoto
    if (urlStr.includes(FallbackAbsoluteProxy) && urlStr.includes("/ping")) {
      return new Response(JSON.stringify({ success: true, service: "loco-proxy", timestamp: Date.now() }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Se for o local/relativo, falha
    return new Response("Internal Server Error", { status: 500 });
  };

  try {
    const config = await loadAllConfigs();
    
    // Deve ter ativado o Fallback remoto
    assertEquals(config.proxy_path, FallbackAbsoluteProxy);
    
    // E ter salvo no IndexedDB
    const savedInDb = await getConfigValue("PROXY_PATH");
    assertEquals(savedInDb, FallbackAbsoluteProxy);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("INTEGRAÇÃO (Auto-Discovery): Deve reutilizar o ProxyPath salvo no IndexedDB sem re-testar se já configurado", async () => {
  await resetConfig();

  // 1. Força a gravação prévia de um proxy customizado no banco
  const customProxy = "https://meu-proxy-customizado.com";
  await saveConfig("PROXY_PATH", customProxy);

  let fetchChamado = false;
  globalThis.fetch = async (): Promise<Response> => {
    fetchChamado = true;
    return new Response("OK", { status: 200 });
  };

  try {
    const config = await loadAllConfigs();
    
    // Retorna a configuração já existente
    assertEquals(config.proxy_path, customProxy);
    
    // NÃO deve ter feito chamadas de ping de rede para auto-discovery
    assertEquals(fetchChamado, false, "Auto-Discovery não deveria disparar requisições de rede se a rota já está salva no banco.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});