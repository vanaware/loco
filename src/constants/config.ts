// src/constants/config.ts

import { get as idbGet, set as idbSet, createStore } from "idb-keyval";
import { DB_NAMES } from "./db.ts";

/**
 * Prefixo base padrão para comunicação com o servidor proxy / Worker.
 * Este valor é usado apenas como fallback se não houver configuração salva no IndexedDB.
 * Pode ser ajustado para:
 * - "" (raiz relativa)
 * - "./api" (caminho relativo)
 * - "/proxy" (sub-caminho absoluto)
 * - "https://push.vanaware.com" (URL completa em outro domínio)
 */
export const DefaultProxyPath: string = "";

/**
 * Chave usada no IndexedDB para armazenar o ProxyPath
 */
const PROXY_PATH_KEY = 'ProxyPath';

/**
 * Cria a store de configurações para uso no Service Worker e Main Thread
 * Lazy initialization para permitir mock em testes
 */
let _configStore: ReturnType<typeof createStore> | null = null;

function getConfigStore() {
  if (_configStore === null && typeof indexedDB !== 'undefined') {
    _configStore = createStore(DB_NAMES.CONFIG, 'keyval');
  }
  return _configStore;
}

/**
 * Carrega o ProxyPath do IndexedDB (funciona no SW e na Main Thread)
 * Lê diretamente da chave 'ProxyPath', sem agrupar em app_settings
 */
async function loadProxyPathFromDB(): Promise<string> {
  const configStore = getConfigStore();
  if (!configStore) {
    return DefaultProxyPath;
  }
  
  try {
    // Carrega da chave específica 'ProxyPath'
    const stored = await idbGet<any>(PROXY_PATH_KEY, configStore);
    if (stored !== undefined && stored !== null) {
      return String(stored);
    }
    return DefaultProxyPath;
  } catch (error) {
    console.warn('[CONFIG] Erro ao carregar ProxyPath do IndexedDB:', error);
    return DefaultProxyPath;
  }
}

/**
 * Obtém o ProxyPath atual lendo diretamente do IndexedDB.
 * Não usa cache em memória para garantir que sempre tenha o valor mais recente.
 * Funciona tanto na Main Thread quanto no Service Worker.
 * 
 * @returns Promise com o ProxyPath configurado
 */
export async function getProxyPath(): Promise<string> {
  return await loadProxyPathFromDB();
}

/**
 * Define o ProxyPath no IndexedDB.
 * Cada configuração tem sua própria chave, não agrupa em app_settings.
 * 
 * @param path - O novo ProxyPath
 * @returns Promise<void>
 */
export async function setProxyPath(path: string): Promise<void> {
  const configStore = getConfigStore();
  if (!configStore) {
    console.error('[CONFIG] IndexedDB não disponível para salvar ProxyPath');
    return;
  }
  
  try {
    await idbSet(PROXY_PATH_KEY, path, configStore);
    console.log('[CONFIG] ProxyPath atualizado no IndexedDB:', path);
  } catch (error) {
    console.error('[CONFIG] Erro ao salvar ProxyPath no IndexedDB:', error);
    throw error;
  }
}

/**
 * Constrói uma URL completa para o proxy, garantindo compatibilidade
 * com caminhos relativos, absolutos e URLs completas.
 * Seguro para ser executado tanto na Main Thread (Window) quanto no Service Worker (Self).
 * 
 * @param endpoint - O endpoint específico (ex: "/", "/publickey", "/logout")
 * @returns Promise com a URL completa pronta para uso no fetch
 */
export async function buildProxyUrl(endpoint: string): Promise<string> {
  // Usa o ProxyPath dinâmico ou o padrão (lê do IndexedDB sempre)
  const proxyPath = await getProxyPath();
  
  // Remove barras extras do endpoint
  const cleanEndpoint = endpoint.replace(/^\/+/, '');
  
  // Se ProxyPath já for uma URL completa (começa com http:// ou https://)
  if (proxyPath.startsWith('http://') || proxyPath.startsWith('https://')) {
    // Garante que ProxyPath termine sem barra e endpoint comece com barra
    const base = proxyPath.replace(/\/$/, '');
    return `${base}/${cleanEndpoint}`;
  }
  
  // Se ProxyPath for vazio ou relativo, usa a origem atual (cross-environment)
  if (ProxyPath === '' || ProxyPath.startsWith('./') || ProxyPath.startsWith('../')) {
    // 🔥 Correção: Uso do globalThis para funcionar dentro de Service Workers
    const origin = typeof globalThis !== 'undefined' && globalThis.location 
      ? globalThis.location.origin 
      : 'http://localhost';

    const baseUrl = origin + (ProxyPath === '' ? '/' : ProxyPath);
    const base = baseUrl.replace(/\/$/, '');
    return `${base}/${cleanEndpoint}`;
  }
  
  // Se ProxyPath for um caminho absoluto (ex: "/proxy")
  const base = proxyPath.replace(/\/$/, '');
  return `${base}/${cleanEndpoint}`;
}