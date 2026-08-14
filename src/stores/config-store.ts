// src/stores/config-store.ts
import { get, set, createStore } from "idb-keyval";
import { DB_NAMES } from "../constants/db.ts";
import { setProxyPath, DefaultProxyPath, FallbackAbsoluteProxy, pingProxy } from "../constants/config.ts";

const CONFIG_STORE_NAME = DB_NAMES.CONFIG;
const configStore = createStore(CONFIG_STORE_NAME, 'keyval');

export const CONFIG_KEYS = {
  PROXY_PATH: "ProxyPath",
} as const;

export async function saveConfig<K extends keyof typeof CONFIG_KEYS>(key: K, value: string): Promise<void> {
  try {
    const configKey = CONFIG_KEYS[key];
    await set(configKey, value, configStore);
    if (key === 'PROXY_PATH' && typeof value === 'string') {
      await setProxyPath(value);
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
    await set(CONFIG_KEYS.PROXY_PATH, DefaultProxyPath, configStore);
    await setProxyPath(DefaultProxyPath);
  } catch (error) {
    console.error("[CONFIG-STORE] Erro ao resetar configurações:", error);
    throw error;
  }
}

/**
 * Carrega e Executa Auto-Discovery de Servidor (Fallback Cascade)
 */
export async function loadAllConfigs(): Promise<{ proxy_path?: string }> {
  let proxy_path = await getConfigValue('PROXY_PATH');
  
  // 1. O app acabou de ser instalado? Começa tentando a raiz
  if (proxy_path === undefined) {
    proxy_path = DefaultProxyPath;
  }

  // 2. Pinga a rota atual para ver se está viva
  console.log(`[AUTO-DISCOVERY] Testando Heartbeat no Proxy Atual: "${proxy_path}"`);
  const isAlive = await pingProxy(proxy_path);

  if (isAlive) {
    console.log(`[AUTO-DISCOVERY] ✅ Proxy local/atual respondeu! Mantendo: "${proxy_path}"`);
    await setProxyPath(proxy_path);
    return { proxy_path };
  }

  console.log(`[AUTO-DISCOVERY] ⚠️ Proxy atual indisponível. Iniciando Fallback...`);

  // 3. Fallback: Tentativa na URL Cloudflare Absoluta (Se não for a que já falhou)
  if (proxy_path !== FallbackAbsoluteProxy) {
    console.log(`[AUTO-DISCOVERY] Testando Fallback Cloudflare: "${FallbackAbsoluteProxy}"`);
    const isFallbackAlive = await pingProxy(FallbackAbsoluteProxy);
    
    if (isFallbackAlive) {
      console.log(`[AUTO-DISCOVERY] 🛡️ Fallback ativado com sucesso. Salvando: "${FallbackAbsoluteProxy}"`);
      await saveConfig('PROXY_PATH', FallbackAbsoluteProxy);
      return { proxy_path: FallbackAbsoluteProxy };
    }
  }

  // 4. Último Recurso: Mantém o que estava configurado, mas avisa que está offline.
  console.warn(`[AUTO-DISCOVERY] ❌ Nenhum servidor Proxy respondeu.`);
  await setProxyPath(proxy_path);
  return { proxy_path };
}