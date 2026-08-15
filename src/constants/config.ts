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

export interface FetchProxyOptions extends Omit<RequestInit, 'body'> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body?: any; 
  specificProxy?: string; 
}

export async function fetchLocoProxy(endpoint: string, options: FetchProxyOptions = {}): Promise<Response> {
  const { specificProxy, body, headers, ...restOptions } = options;
  const url = await buildProxyUrl(endpoint, specificProxy);
  
  const mergedHeaders = new Headers(headers);
  if (!mergedHeaders.has('Content-Type') && body) {
    mergedHeaders.set('Content-Type', 'application/json');
  }

  const finalOptions: RequestInit = {
    method: 'POST', 
    mode: 'cors',
    credentials: 'omit', 
    headers: mergedHeaders,
    ...restOptions
  };

  if (body) {
    finalOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    
    // 🔥 ARQUITETURA: Validação Preemptiva de Rede.
    const payloadSizeBytes = new Blob([finalOptions.body]).size;
    
    addDebugLog("info", "NETWORK:FETCH", `Tamanho total da requisição HTTP gerada: ${payloadSizeBytes} bytes.`);

    if (payloadSizeBytes > 8192) {
      addDebugLog("error", "NETWORK:FETCH", `Abortado localmente: O Payload HTTP (${payloadSizeBytes} bytes) excede o limite seguro do servidor Proxy (8192 bytes).`);
      throw new Error(`Pacote muito grande (${payloadSizeBytes} bytes). O limite de roteamento do servidor é de 8KB.`);
    }
  }

  try {
    return await fetch(url, finalOptions);
  } catch (error: any) {
    throw new Error(`Falha ao acessar o nó proxy da rede (${url}). Erro de conectividade ou bloqueio de CORS. Detalhes: ${error.message}`);
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