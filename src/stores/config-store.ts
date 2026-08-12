// src/stores/config-store.ts
import { get, set, createStore } from "idb-keyval";
import { DB_NAMES } from "../constants/db.ts";
import { setProxyPath, DefaultProxyPath } from "../constants/config.ts";

const CONFIG_STORE_NAME = DB_NAMES.CONFIG;

/**
 * Cria a store de configurações usando idb-keyval
 */
const configStore = createStore(CONFIG_STORE_NAME, 'keyval');

/**
 * Chaves de configuração disponíveis
 * Cada configuração tem sua própria chave no IndexedDB
 */
export const CONFIG_KEYS = {
  PROXY_PATH: "ProxyPath",
} as const;

/**
 * Salva uma configuração específica no IndexedDB
 * Cada configuração usa sua própria chave (não agrupa em app_settings)
 */
export async function saveConfig<K extends keyof typeof CONFIG_KEYS>(key: K, value: string): Promise<void> {
  try {
    const configKey = CONFIG_KEYS[key];
    
    // Salva diretamente na chave específica
    await set(configKey, value, configStore);
    
    // Atualiza dinamicamente se for proxy_path
    if (key === 'PROXY_PATH' && typeof value === 'string') {
      await setProxyPath(value);
    }
  } catch (error) {
    console.error("[CONFIG-STORE] Erro ao salvar configuração:", error);
    throw error;
  }
}

/**
 * Carrega uma configuração específica do IndexedDB
 */
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

/**
 * Atalho para atualizar apenas o ProxyPath
 */
export async function updateProxyPath(newPath: string): Promise<void> {
  return saveConfig('PROXY_PATH', newPath);
}

/**
 * Reseta todas as configurações para os valores padrão
 */
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
 * Carrega todas as configurações (útil para inicialização)
 */
export async function loadAllConfigs(): Promise<{ proxy_path?: string }> {
  const proxy_path = await getConfigValue('PROXY_PATH');
  
  // Aplica o proxy path se existir
  if (proxy_path !== undefined) {
    await setProxyPath(proxy_path);
  } else {
    await setProxyPath(DefaultProxyPath);
  }
  
  return { proxy_path };
}
