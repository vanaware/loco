// src/constants/config.ts
import { get as idbGet, set as idbSet, createStore } from "idb-keyval";
import { DB_NAMES } from "./db.ts";

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

// 🔥 ARQUITETURA: Wrapper Centralizado para as chamadas de rede do App
// Garante que todas as requisições possuam o mesmo padrão de segurança (CORS e Headers)
export interface FetchProxyOptions extends Omit<RequestInit, 'body'> {
  body?: any; // Permitimos objetos JavaScript literais, a função fará o stringify
  specificProxy?: string; // Permite forçar o disparo para uma URL de proxy que não é a padrão
}

export async function fetchLocoProxy(endpoint: string, options: FetchProxyOptions = {}): Promise<Response> {
  const { specificProxy, body, headers, ...restOptions } = options;
  const url = await buildProxyUrl(endpoint, specificProxy);
  
  const mergedHeaders = new Headers(headers);
  if (!mergedHeaders.has('Content-Type') && body) {
    mergedHeaders.set('Content-Type', 'application/json');
  }

  const finalOptions: RequestInit = {
    method: 'POST', // Padrão Loco
    mode: 'cors',
    credentials: 'omit', // Crucial para não engasgar o W3C CORS Wildcard do Worker (*)
    headers: mergedHeaders,
    ...restOptions
  };

  if (body) {
    finalOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  try {
    return await fetch(url, finalOptions);
  } catch (error: any) {
    // Intercepta erros de rede puros (DNS, Offline, CORS) para dar uma mensagem mais limpa
    throw new Error(`Falha de conectividade (Rede/CORS) ao acessar o proxy remoto. Verifique a internet e o console do navegador. Detalhes: ${error.message}`);
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
    
    if (!res || !res.ok) {
      res = await fetchLocoProxy('/ping', { 
        method: 'GET', 
        specificProxy: proxyUrlToCheck,
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