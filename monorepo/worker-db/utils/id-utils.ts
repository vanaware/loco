/**
 * Gera um identificador único curto seguro (12 caracteres hexadecimais).
 * Utiliza Web Crypto API se disponível, senão cai no fallback matemático.
 */
export function gerarId(): string {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const array = new Uint8Array(12);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .substring(0, 12);
  }
  return gerarIdFallback();
}

/**
 * Fallback para geração de ID caso crypto.getRandomValues não esteja disponível.
 */
export function gerarIdFallback(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

/**
 * Gera um ID formatado com prefixo (Ex: "USER:a1b2c3d4e5f6").
 */
export function gerarIdComPrefixo(prefixo: string): string {
  return `${prefixo}:${gerarId()}`;
}

/**
 * Valida se a string tem formato aceitável de ID.
 */
export function validarId(id: string): boolean {
  return typeof id === "string" && id.length > 0 && id.length <= 64;
}