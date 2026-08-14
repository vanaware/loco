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
      return String(stored);
    }
    return DefaultProxyPath;
  } catch (error) {
    console.warn('[CONFIG] Erro ao carregar ProxyPath do IndexedDB:', error);
    return DefaultProxyPath;
  }
}

export async function getProxyPath(): Promise<string> {
  return await loadProxyPathFromDB();
}

export async function setProxyPath(path: string): Promise<void> {
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
  
  // Normalização de input: se o usuário deixou vazio, tratamos como "/"
  if (!proxyPath || proxyPath.trim() === '') proxyPath = "/";

  const cleanEndpoint = endpoint.replace(/^\/+/, '');
  let base = "";

  // Cenário 1: É uma URL Absoluta Externa (https://...)
  if (proxyPath.startsWith('http://') || proxyPath.startsWith('https://')) {
    base = proxyPath;
  } 
  // Cenário 2: Caminho Relativo local (ex: "/", "/api", "./api")
  else {
    const origin = typeof globalThis !== 'undefined' && globalThis.location 
      ? globalThis.location.origin 
      : 'http://localhost';
    
    const appBase = getAppBasePath(); // Ex: "/" ou "/loco/"
    
    // Removemos possíveis "/", "./" ou "../" do começo do proxyPath do usuário
    const cleanProxyPath = proxyPath.replace(/^(\.\/|\.\.\/|\/+)/, '');
    
    base = origin + appBase + cleanProxyPath;
  }

  base = base.replace(/\/$/, ''); // Tira barra do final da base
  return `${base}/${cleanEndpoint}`;
}

/**
 * Dispara um Heartbeat para testar a validade da URL
 */
export async function pingProxy(proxyUrlToCheck: string): Promise<boolean> {
  try {
    const url = await buildProxyUrl('/ping', proxyUrlToCheck);
    
    // Configura um timeout de 3 segundos para não travar a aplicação
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const res = await fetch(url, { 
      method: 'POST', // 🔥 ARQUITETURA: POST para furar o cache do navegador e Edge Nodes
      signal: controller.signal 
    });
    
    clearTimeout(timeoutId);
    
    if (!res.ok) return false;
    
    const data = await res.json();
    return data && data.status === "ok" && data.service === "loco-proxy";
  } catch (err) {
    return false;
  }
}