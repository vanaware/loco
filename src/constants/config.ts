// src/constants/config.ts
import { get as idbGet, set as idbSet, createStore } from "idb-keyval";
import { DB_NAMES } from "./db.ts";
import { addDebugLog } from "../utils/debug-utils.ts";

export const DefaultProxyPath: string = "/";
export const FallbackAbsoluteProxy: string = "https://loco.arvati.workers.dev";

const PROXY_PATH_KEY = 'ProxyPath';

let _configStore: ReturnType<typeof createStore> | null = null;
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
      _cachedProxyPath = String(stored);
      return _cachedProxyPath;
    }
    return DefaultProxyPath;
  } catch (error) {
    console.warn('[CONFIG] Erro ao carregar ProxyPath do IndexedDB:', error);
    return DefaultProxyPath;
  }
}

export async function getProxyPath(): Promise<string> {
  if (_cachedProxyPath !== null) return _cachedProxyPath;
  return await loadProxyPathFromDB();
}

export async function setProxyPath(path: string, persistToDisk = true): Promise<void> {
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

// 🔥 ARQUITETURA: Resolve e devolve a BASE URl Absoluta do Proxy
export async function getAbsoluteProxyUrl(specificProxy?: string): Promise<string> {
  let proxyPath = specificProxy !== undefined ? specificProxy : await getProxyPath();
  
  if (!proxyPath || proxyPath.trim() === '') proxyPath = "/";

  if (proxyPath.startsWith('http://') || proxyPath.startsWith('https://')) {
    return proxyPath.replace(/\/$/, '');
  } 

  const origin = typeof globalThis !== 'undefined' && globalThis.location 
    ? globalThis.location.origin 
    : 'http://localhost';
  
  const appBase = getAppBasePath();
  const cleanProxyPath = proxyPath.replace(/^(\.\/|\.\.\/|\/+)/, '');
  
  let base = origin + appBase + cleanProxyPath;
  return base.replace(/\/$/, '');
}

export async function buildProxyUrl(endpoint: string, specificProxy?: string): Promise<string> {
  const base = await getAbsoluteProxyUrl(specificProxy);
  const cleanEndpoint = endpoint.replace(/^\/+/, '');
  return cleanEndpoint ? `${base}/${cleanEndpoint}` : `${base}/`;
}

export interface FetchProxyOptions extends Omit<RequestInit, 'body' | 'headers'> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body?: any; 
  specificProxy?: string; 
  headers?: any; 
}

export async function fetchLocoProxy(endpoint: string, options: FetchProxyOptions = {}): Promise<Response> {
  const { specificProxy, body, headers: _ignorado, ...restOptions } = options;
  const url = await buildProxyUrl(endpoint, specificProxy);
  
  const blindHeaders = new Headers();
  if (body) {
    blindHeaders.set('Content-Type', 'text/plain');
  }

  const finalOptions: RequestInit = {
    method: 'POST', 
    mode: 'cors',
    credentials: 'omit',
    headers: blindHeaders,
    ...restOptions
  };

  if (body) {
    finalOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    
    const payloadSizeBytes = new Blob([finalOptions.body]).size;
    addDebugLog("info", "NETWORK:FETCH", `Tamanho total da requisição HTTP gerada para ${endpoint}: ${payloadSizeBytes} bytes.`);

    if (payloadSizeBytes > 8192) {
      throw new Error(`Pacote muito grande (${payloadSizeBytes} bytes). Limite é 8KB.`);
    }
  }

  try {
    return await fetch(url, finalOptions);
  } catch (error: any) {
    throw new Error(`Falha de rede ao acessar proxy externo (${url}). Detalhes: ${error.message}`);
  }
}

export async function pingProxy(proxyUrlToCheck: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    let res = await fetchLocoProxy('/ping', { 
      specificProxy: proxyUrlToCheck,
      signal: controller.signal 
    }).catch(() => null);
    
    clearTimeout(timeoutId);
    
    if (!res || !res.ok) return false;
    
    const data = await res.json();
    return data && data.status === "ok" && data.service === "loco-proxy";
  } catch (err) {
    return false;
  }
}