// src/utils/id-utils.ts

/**
 * Tamanho padrão do ID para mensagens.
 * 12 caracteres oferecem ~10^18 combinações, suficiente para protótipo.
 */
const ID_LENGTH = 12;

/**
 * Caracteres seguros para URL usados em IDs (como NanoID).
 * Remove: +, /, = (caracteres perigosos para URLs)
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

/**
 * Gera um ID único para mensagens usando Web Crypto API.
 * Substitui nanoid (que usa node:crypto no esm.sh) com implementação pura browser-safe.
 * @param length - Tamanho do ID (padrão: 12)
 * @returns ID único (ex: "V1StGXR8_Z5jd")
 */
export function gerarIdMensagem(length: number = ID_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  
  let id = "";
  for (let i = 0; i < length; i++) {
    id += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return id;
}

/**
 * Verifica se um ID é válido (tem o formato esperado).
 * @param id - ID a ser validado
 * @returns true se o ID parece válido
 */
export function validarIdMensagem(id: string): boolean {
  // NanoID usa caracteres A-Z, a-z, 0-9, _, -
  return /^[A-Za-z0-9_-]+$/.test(id) && id.length >= 8;
}

/**
 * Gera um ID de fallback para situações onde o nanoID não está disponível.
 * @returns ID de fallback (timestamp + random)
 */
export function gerarIdFallback(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
}