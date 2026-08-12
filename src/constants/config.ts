// src/constants/config.ts

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
 * Obtém o ProxyPath atual, priorizando a configuração dinâmica do usuário.
 * Se não houver configuração salva, retorna o valor padrão.
 * 
 * @returns O ProxyPath configurado
 */
export function getProxyPath(): string {
  // Tenta obter da configuração dinâmica (se disponível no window)
  if (typeof window !== 'undefined' && (window as any).__APP_CONFIG__) {
    return (window as any).__APP_CONFIG__.proxyPath ?? DefaultProxyPath;
  }
  return DefaultProxyPath;
}

/**
 * Define o ProxyPath dinamicamente (usado pelo config-store ao carregar do IndexedDB)
 */
export function setProxyPath(path: string): void {
  if (typeof window !== 'undefined') {
    if (!(window as any).__APP_CONFIG__) {
      (window as any).__APP_CONFIG__ = {};
    }
    (window as any).__APP_CONFIG__.proxyPath = path;
  }
}

/**
 * Constrói uma URL completa para o proxy, garantindo compatibilidade
 * com caminhos relativos, absolutos e URLs completas.
 * Seguro para ser executado tanto na Main Thread (Window) quanto no Service Worker (Self).
 * 
 * @param endpoint - O endpoint específico (ex: "/", "/publickey", "/logout")
 * @returns A URL completa pronta para uso no fetch
 */
export function buildProxyUrl(endpoint: string): string {
  // Usa o ProxyPath dinâmico ou o padrão
  const proxyPath = getProxyPath();
  
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