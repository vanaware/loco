// src/constants/config.ts
import { get as idbGet, set as idbSet, createStore } from "idb-keyval";
import { DB_NAMES } from "./db.ts";

/**
 * 🔥 O Padrão agora é "/" (Raiz Relativa do PWA).
 */
export const DefaultProxyPath: string = "/";

/**
 * 🔥 O Fallback Absoluto (Workers Seguro).
 */
export const FallbackAbsoluteProxy: string = "https://loco.arvati.workers.dev";

const PROXY_PATH_KEY = 'ProxyPath';

let _configStore: ReturnType<typeof createStore> | null = null;

// 🔥 ARQUITETURA: Cache em Memória RAM para evitar leitura excessiva de I/O em disco
let _cachedProxyPath: string | null = null; 

function getConfigStore() {
  if (_configStore === null && typeof indexedDB !== 'undefined') {
    _configStore = createStore(DB_NAMES.CONFIG, 'keyval');
  }
  return _configStore;
}

async function loadProxyPathFromDB(): Promise<string> {
  const configStore = getConfigStore();
  if (!configStore) return DefaultProxyPath;
  
  try {
    const stored = await idbGet<any>(PROXY_PATH_KEY, configStore);
    if (stored !== undefined && stored !== null) {
      _cachedProxyPath = String(stored); // Alimenta o cache da RAM
      return _cachedProxyPath;
    }
    return DefaultProxyPath;
  } catch (error) {
    console.warn('[CONFIG] Erro ao carregar ProxyPath do IndexedDB:', error);
    return DefaultProxyPath;
  }
}

export async function getProxyPath(): Promise<string> {
  // Retorna instantaneamente se já estiver na RAM (O(1))
  if (_cachedProxyPath !== null) return _cachedProxyPath;
  return await loadProxyPathFromDB();
}

/**
 * Atualiza o ProxyPath. 
 * @param path Nova rota
 * @param persistToDisk Se false, apenas hidrata a memória RAM (evita escrita redundante).
 */
export async function setProxyPath(path: string, persistToDisk = true): Promise<void> {
  // Aborta se já for o mesmo valor e for uma requisição de disco, poupando processamento
  if (_cachedProxyPath === path && persistToDisk) return;
  
  _cachedProxyPath = path;

  if (persistToDisk) {
    const configStore = getConfigStore();
    if (!configStore) return;
    try {
      await idbSet(PROXY_PATH_KEY, path, configStore);
      console.log('[CONFIG] ProxyPath atualizado no IndexedDB:', path);
    } catch (error) {
      console.error('[CONFIG] Erro ao salvar ProxyPath no IndexedDB:', error);
      throw error;
    }
  }
}

/**
 * Resolve o BasePath nativo (ex: "/" ou "/loco/")
 */
function getAppBasePath(): string {
  if (typeof globalThis === 'undefined' || !globalThis.location) return '/';
  let basePath = globalThis.location.pathname;
  if (basePath.split('/').pop()?.includes('.')) {
    basePath = basePath.substring(0, basePath.lastIndexOf('/') + 1);
  } else if (!basePath.endsWith('/')) {
    basePath += '/';
  }
  return basePath;
}

/**
 * Constrói uma URL completa de API com inteligência de rotas relativas vs absolutas.
 */
export async function buildProxyUrl(endpoint: string, specificProxy?: string): Promise<string> {
  let proxyPath = specificProxy !== undefined ? specificProxy : await getProxyPath();
  
  if (!proxyPath || proxyPath.trim() === '') proxyPath = "/";

  const cleanEndpoint = endpoint.replace(/^\/+/, '');
  let base = "";

  if (proxyPath.startsWith('http://') || proxyPath.startsWith('https://')) {
    base = proxyPath;
  } 
  else {
    const origin = typeof globalThis !== 'undefined' && globalThis.location 
      ? globalThis.location.origin 
      : 'http://localhost';
    
    const appBase = getAppBasePath();
    const cleanProxyPath = proxyPath.replace(/^(\.\/|\.\.\/|\/+)/, '');
    
    base = origin + appBase + cleanProxyPath;
  }

  base = base.replace(/\/$/, '');
  return `${base}/${cleanEndpoint}`;
}

/**
 * Dispara um Heartbeat para testar a validade da URL
 */
export async function pingProxy(proxyUrlToCheck: string): Promise<boolean> {
  try {
    const url = await buildProxyUrl('/ping', proxyUrlToCheck);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    let res = await fetch(url, { 
      method: 'POST', 
      signal: controller.signal 
    }).catch(() => null);
    
    if (!res || !res.ok) {
      res = await fetch(url, { 
        method: 'GET', 
        signal: controller.signal 
      }).catch(() => null);
    }
    
    clearTimeout(timeoutId);
    
    if (!res || !res.ok) return false;
    
    const data = await res.json();
    return data && data.status === "ok" && data.service === "loco-proxy";
  } catch (err) {
    return false;
  }
}