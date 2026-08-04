// src/utils/id-utils.ts
import { nanoid } from "https://esm.sh/nanoid@5.0.7";

/**
 * Tamanho padrão do ID para mensagens.
 * 12 caracteres oferecem ~10^18 combinações, suficiente para protótipo.
 */
const ID_LENGTH = 12;

/**
 * Gera um ID único para mensagens usando NanoID.
 * @param length - Tamanho do ID (padrão: 12)
 * @returns ID único (ex: "V1StGXR8_Z5jd")
 */
export function gerarIdMensagem(length: number = ID_LENGTH): string {
  return nanoid(length);
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