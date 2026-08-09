// src/utils/crypto-utils.ts
import { addDebugLog } from "./debug-utils.ts";

/**
 * Converte ArrayBuffer para string Base64URL
 */
export function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Alias de compatibilidade para conversão de ArrayBuffer em Base64URL
 */
export function rawBufferToBase64Url(buffer: ArrayBuffer): string {
  return bufferToBase64Url(buffer);
}

/**
 * Converte string Base64URL para ArrayBuffer
 */
export function base64UrlToBuffer(base64url: string): ArrayBuffer {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Gera um par de chaves VAPID (ECDSA P-256) via WebCrypto API
 */
export async function generateVAPIDKeys(): Promise<CryptoKeyPair> {
  try {
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
    addDebugLog("info", "CRYPTO", "Par de chaves VAPID (ECDSA P-256) gerado com sucesso");
    return keyPair;
  } catch (error) {
    addDebugLog("error", "CRYPTO", "Erro ao gerar chaves VAPID", error);
    throw error;
  }
}

/**
 * Gera um par de chaves RSA-OAEP 2048 para Criptografia E2E
 */
export async function generateE2EEKeys(): Promise<{
  publicEncrypt: JsonWebKey;
  privateDecryptJwk: JsonWebKey;
}> {
  try {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt"]
    );

    const publicEncrypt = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const privateDecryptJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

    addDebugLog("info", "CRYPTO", "Par de chaves RSA-OAEP gerado com sucesso");
    return { publicEncrypt, privateDecryptJwk };
  } catch (error) {
    addDebugLog("error", "CRYPTO", "Erro ao gerar chaves RSA E2E", error);
    throw error;
  }
}

/**
 * Criptografa um texto em UTF-8 usando AES-GCM
 */
export async function encryptTextAES(
  key: CryptoKey,
  plainText: string
): Promise<{ cipherTextBase64: string; ivBase64: string }> {
  try {
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedText = enc.encode(plainText);

    const cipherBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encodedText
    );

    addDebugLog("info", "CRYPTO", "Texto criptografado via AES-GCM com sucesso");

    return {
      cipherTextBase64: bufferToBase64Url(cipherBuffer),
      ivBase64: bufferToBase64Url(iv.buffer),
    };
  } catch (error) {
    addDebugLog("error", "CRYPTO", "Erro ao criptografar texto AES-GCM", error);
    throw error;
  }
}

/**
 * Descriptografa um ciphertext em Base64URL usando AES-GCM
 */
export async function decryptTextAES(
  key: CryptoKey,
  cipherTextBase64: string,
  ivBase64: string
): Promise<string> {
  try {
    const cipherBuffer = base64UrlToBuffer(cipherTextBase64);
    const ivBuffer = base64UrlToBuffer(ivBase64);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(ivBuffer) },
      key,
      cipherBuffer
    );

    const dec = new TextDecoder();
    addDebugLog("info", "CRYPTO", "Texto decriptografado via AES-GCM com sucesso");
    return dec.decode(decryptedBuffer);
  } catch (error) {
    addDebugLog("error", "CRYPTO", "Erro ao descriptografar texto AES-GCM", error);
    throw error;
  }
}

/**
 * Exporta chave CryptoKey para formato JWK seguro
 */
export async function exportKeyToJWK(key: CryptoKey): Promise<JsonWebKey> {
  try {
    const jwk = await crypto.subtle.exportKey("jwk", key);
    addDebugLog("info", "CRYPTO", "Chave exportada para JWK", { kty: jwk.kty, alg: jwk.alg });
    return jwk;
  } catch (error) {
    addDebugLog("error", "CRYPTO", "Erro ao exportar chave para JWK", error);
    throw error;
  }
}

/**
 * Importa chave JWK para CryptoKey
 */
export async function importJWKToKey(
  jwk: JsonWebKey,
  algorithm: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams,
  extractable: boolean,
  keyUsages: KeyUsage[]
): Promise<CryptoKey> {
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      algorithm,
      extractable,
      keyUsages
    );
    addDebugLog("info", "CRYPTO", "Chave JWK importada com sucesso", { algorithm });
    return key;
  } catch (error) {
    addDebugLog("error", "CRYPTO", "Erro ao importar chave JWK", error);
    throw error;
  }
}