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
 * Chave onde as configurações da UI são salvas no AppConfig_DB
 * (separado do ProfileConfig que usa a chave "profile")
 */
export const APP_SETTINGS_KEY = "app_settings";

/**
 * Chaves de configuração disponíveis
 */
export const CONFIG_KEYS = {
  PROXY_PATH: "proxy_path",
} as const;

export interface AppConfig {
  proxy_path?: string;
  [key: string]: unknown;
}

/**
 * Carrega todas as configurações do IndexedDB
 */
export async function loadConfig(): Promise<AppConfig> {
  try {
    const config = await get<AppConfig>(APP_SETTINGS_KEY, configStore) || {};
    
    // Se tiver proxy_path salvo, aplica dinamicamente
    if (config.proxy_path !== undefined) {
      setProxyPath(config.proxy_path);
    } else {
      // Usa o default se não houver configuração salva
      setProxyPath(DefaultProxyPath);
    }
    
    return config;
  } catch (error) {
    console.error("[CONFIG-STORE] Erro ao carregar configurações:", error);
    return { proxy_path: DefaultProxyPath };
  }
}

/**
 * Salva uma configuração específica no IndexedDB
 */
export async function saveConfig<K extends keyof AppConfig>(key: K, value: AppConfig[K]): Promise<void> {
  try {
    const currentConfig = await loadConfig();
    const newConfig = { ...currentConfig, [key]: value };
    
    // Salva na chave app_settings (separado do profile)
    await set(APP_SETTINGS_KEY, newConfig, configStore);
    
    // Atualiza dinamicamente se for proxy_path
    if (key === CONFIG_KEYS.PROXY_PATH && typeof value === 'string') {
      setProxyPath(value);
    }
  } catch (error) {
    console.error("[CONFIG-STORE] Erro ao salvar configuração:", error);
    throw error;
  }
}

/**
 * Atalho para atualizar apenas o ProxyPath
 */
export async function updateProxyPath(newPath: string): Promise<void> {
  return saveConfig(CONFIG_KEYS.PROXY_PATH, newPath);
}

/**
 * Reseta todas as configurações para os valores padrão
 */
export async function resetConfig(): Promise<void> {
  try {
    await set(APP_SETTINGS_KEY, { proxy_path: DefaultProxyPath }, configStore);
    setProxyPath(DefaultProxyPath);
  } catch (error) {
    console.error("[CONFIG-STORE] Erro ao resetar configurações:", error);
    throw error;
  }
}

/**
 * Obtém o valor de uma configuração específica
 */
export async function getConfigValue<K extends keyof AppConfig>(key: K): Promise<AppConfig[K] | undefined> {
  const config = await loadConfig();
  return config[key];
}
