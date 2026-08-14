// src/stores/config-store.ts
import { get, set, del, createStore } from "idb-keyval";
import { DB_NAMES } from "../constants/db.ts";
import { setProxyPath, DefaultProxyPath, FallbackAbsoluteProxy, pingProxy } from "../constants/config.ts";

const CONFIG_STORE_NAME = DB_NAMES.CONFIG;
const configStore = createStore(CONFIG_STORE_NAME, 'keyval');

export const CONFIG_KEYS = {
  PROXY_PATH: "ProxyPath",
  SERVER_PUBLIC_KEY: "ServerPublicKey", // 🔥 ARQUITETURA: Nova chave para cache
} as const;

export async function saveConfig<K extends keyof typeof CONFIG_KEYS>(key: K, value: string): Promise<void> {
  try {
    const configKey = CONFIG_KEYS[key];
    await set(configKey, value, configStore);
    
    // 🔥 ARQUITETURA: Invalidação de Cache Atrelada
    // Se o Proxy mudar, a chave pública do servidor antigo torna-se letal para a criptografia.
    // Nós a apagamos imediatamente para forçar um novo download seguro na próxima operação.
    if (key === 'PROXY_PATH' && typeof value === 'string') {
      await setProxyPath(value);
      await del(CONFIG_KEYS.SERVER_PUBLIC_KEY, configStore);
      console.log("[CONFIG-STORE] 🧹 Chave pública do servidor invalidada devido à troca de proxy.");
    }
  } catch (error) {
    console.error("[CONFIG-STORE] Erro ao salvar configuração:", error);
    throw error;
  }
}

export async function getConfigValue<K extends keyof typeof CONFIG_KEYS>(key: K): Promise<string | undefined> {
  try {
    const configKey = CONFIG_KEYS[key];
    const value = await get<string>(configKey, configStore);
    return value !== undefined && value !== null ? value : undefined;
  } catch (error) {
    console.error("[CONFIG-STORE] Erro ao carregar configuração:", error);
    return undefined;
  }
}

export async function resetConfig(): Promise<void> {
  try {
    await del(CONFIG_KEYS.PROXY_PATH, configStore);
    await del(CONFIG_KEYS.SERVER_PUBLIC_KEY, configStore); // Expurgamos a chave no reset também
    await setProxyPath(DefaultProxyPath); 
  } catch (error) {
    console.error("[CONFIG-STORE] Erro ao resetar configurações:", error);
    throw error;
  }
}

/**
 * Carrega as configurações. 
 * Executa o Auto-Discovery de Rede apenas se for a primeira inicialização.
 */
export async function loadAllConfigs(): Promise<{ proxy_path?: string }> {
  const proxy_path = await getConfigValue('PROXY_PATH');
  
  if (proxy_path !== undefined) {
    await setProxyPath(proxy_path);
    return { proxy_path };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.warn(`[AUTO-DISCOVERY] 🔌 Offline no primeiro acesso. Assumindo Cloudflare Worker nativo.`);
    await saveConfig('PROXY_PATH', FallbackAbsoluteProxy);
    return { proxy_path: FallbackAbsoluteProxy };
  }

  console.log(`[AUTO-DISCOVERY] Primeira inicialização detectada. Avaliando ambiente...`);
  
  const isLocalAlive = await pingProxy(DefaultProxyPath);

  if (isLocalAlive) {
    console.log(`[AUTO-DISCOVERY] ✅ Servidor nativo da hospedagem respondeu! Mantendo rota relativa.`);
    await saveConfig('PROXY_PATH', DefaultProxyPath);
    return { proxy_path: DefaultProxyPath };
  }

  console.log(`[AUTO-DISCOVERY] ⚠️ Servidor nativo indisponível ou estático (Ex: GitHub Pages). Iniciando Fallback...`);

  const isFallbackAlive = await pingProxy(FallbackAbsoluteProxy);
  
  if (isFallbackAlive) {
    console.log(`[AUTO-DISCOVERY] 🛡️ Fallback ativado com sucesso. Conectado ao nó Edge!`);
    await saveConfig('PROXY_PATH', FallbackAbsoluteProxy);
    return { proxy_path: FallbackAbsoluteProxy };
  }

  console.warn(`[AUTO-DISCOVERY] ❌ Nenhum servidor Proxy respondeu. Definindo Rota Padrão Segura.`);
  await saveConfig('PROXY_PATH', FallbackAbsoluteProxy);
  return { proxy_path: FallbackAbsoluteProxy };
}