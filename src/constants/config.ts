// src/config.ts
/**
 * Prefixo base para comunicação com o servidor proxy / Worker.
 * Pode ser ajustado para:
 * - "" (raiz relativa)
 * - "./api" (caminho relativo)
 * - "/proxy" (sub-caminho absoluto)
 * - "https://push.vanaware.com" (URL completa em outro domínio)
 */
export const ProxyPath: string = "";

/**
 * Constrói uma URL completa para o proxy, garantindo compatibilidade
 * com caminhos relativos, absolutos e URLs completas.
 * 
 * @param endpoint - O endpoint específico (ex: "/", "/publickey", "/logout")
 * @returns A URL completa pronta para uso no fetch
 */
export function buildProxyUrl(endpoint: string): string {
  // Remove barras extras do endpoint
  const cleanEndpoint = endpoint.replace(/^\/+/, '');
  
  // Se ProxyPath já for uma URL completa (começa com http:// ou https://)
  if (ProxyPath.startsWith('http://') || ProxyPath.startsWith('https://')) {
    // Garante que ProxyPath termine sem barra e endpoint comece com barra
    const base = ProxyPath.replace(/\/$/, '');
    return `${base}/${cleanEndpoint}`;
  }
  
  // Se ProxyPath for vazio ou relativo, usa a origem atual
  if (ProxyPath === '' || ProxyPath.startsWith('./') || ProxyPath.startsWith('../')) {
    // Resolve URL relativa baseada na origem atual
    const baseUrl = window.location.origin + (ProxyPath === '' ? '/' : ProxyPath);
    const base = baseUrl.replace(/\/$/, '');
    return `${base}/${cleanEndpoint}`;
  }
  
  // Se ProxyPath for um caminho absoluto (ex: "/proxy")
  const base = ProxyPath.replace(/\/$/, '');
  return `${base}/${cleanEndpoint}`;
}
