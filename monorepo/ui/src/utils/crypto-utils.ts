// src/utils/crypto-utils.ts
import { addDebugLog } from "./debug-utils.ts";

export function bufferToBase64Url(buffer: ArrayBuffer): string {
  try {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  } catch (err: any) {
    addDebugLog("error", "CRYPTO", "Falha crítica ao converter Buffer para Base64Url", err.message);
    throw new Error(`Buffer conversion failed: ${err.message}`);
  }
}

export function rawBufferToBase64Url(buffer: ArrayBuffer): string {
  return bufferToBase64Url(buffer);
}

export function base64UrlToBuffer(base64url: string): ArrayBuffer {
  try {
    let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    const padLength = (4 - (base64.length % 4)) % 4;
    base64 += '='.repeat(padLength);
    
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer as ArrayBuffer;
  } catch (err: any) {
    addDebugLog("error", "CRYPTO", "Tentativa de decodificar Base64Url malformado ou corrompido", err.message);
    throw new Error("Formato Base64Url inválido.");
  }
}

// ============================================================
// 🔥 COMPRESSÃO POR ESQUEMA ESTÁTICO (Static Schema Compression)
// ============================================================

export function minifyVapidPublic(jwk: JsonWebKey): any {
  if (!jwk || !jwk.kty) return jwk; 
  return { x: jwk.x, y: jwk.y };
}

export function expandVapidPublic(minified: any): JsonWebKey {
  if (typeof minified === "string") {
    try { minified = JSON.parse(minified); } catch { return {} as JsonWebKey; }
  }
  if (!minified || typeof minified !== "object") return {} as JsonWebKey;
  
  if (minified.kty) return minified as JsonWebKey;
  
  return { 
    kty: "EC", 
    crv: "P-256", 
    x: minified.x || minified.vx, 
    y: minified.y || minified.vy, 
    ext: true, 
    key_ops: ["verify"] 
  };
}

export function minifyVapidPrivate(jwk: JsonWebKey): any {
  if (!jwk || !jwk.kty) return jwk;
  return { d: jwk.d }; 
}

export function expandVapidPrivate(minifiedPriv: any, minifiedPub: any): JsonWebKey {
  if (typeof minifiedPriv === "string") {
    try { minifiedPriv = JSON.parse(minifiedPriv); } catch { return {} as JsonWebKey; }
  }
  if (!minifiedPriv || typeof minifiedPriv !== "object") return {} as JsonWebKey;
  if (minifiedPriv.kty) return minifiedPriv as JsonWebKey;
  
  return { 
    kty: "EC", 
    crv: "P-256", 
    x: minifiedPub.x || minifiedPub.vx, 
    y: minifiedPub.y || minifiedPub.vy, 
    d: minifiedPriv.d, 
    ext: true, 
    key_ops: ["sign"] 
  };
}

export function minifyRsaPublic(jwk: JsonWebKey): any {
  if (!jwk || !jwk.kty) return jwk;
  return { n: jwk.n };
}

export function expandRsaPublic(minified: any): JsonWebKey {
  if (typeof minified === "string") {
    try { minified = JSON.parse(minified); } catch { return {} as JsonWebKey; }
  }
  if (!minified || typeof minified !== "object") return {} as JsonWebKey;
  if (minified.kty) return minified as JsonWebKey;
  
  return { 
    kty: "RSA", 
    alg: "RSA-OAEP-256", 
    e: "AQAB", 
    n: minified.n || minified.en, 
    ext: true, 
    key_ops: ["encrypt"] 
  };
}

export function minifyRsaPrivate(jwk: JsonWebKey): any {
  if (!jwk || !jwk.kty) return jwk;
  return { d: jwk.d, p: jwk.p, q: jwk.q, dp: jwk.dp, dq: jwk.dq, qi: jwk.qi };
}

export function expandRsaPrivate(minifiedPriv: any, minifiedPub: any): JsonWebKey {
  if (typeof minifiedPriv === "string") {
    try { minifiedPriv = JSON.parse(minifiedPriv); } catch { return {} as JsonWebKey; }
  }
  if (!minifiedPriv || typeof minifiedPriv !== "object") return {} as JsonWebKey;
  if (minifiedPriv.kty) return minifiedPriv as JsonWebKey;
  
  return { 
    kty: "RSA", 
    alg: "RSA-OAEP-256", 
    e: "AQAB", 
    n: minifiedPub.n || minifiedPub.en, 
    d: minifiedPriv.d, 
    p: minifiedPriv.p, 
    q: minifiedPriv.q, 
    dp: minifiedPriv.dp, 
    dq: minifiedPriv.dq, 
    qi: minifiedPriv.qi, 
    ext: true, 
    key_ops: ["decrypt"] 
  };
}

// ============================================================
// GERAÇÃO E OPERAÇÕES DA WEBCRYPTO API
// ============================================================

export async function generateVAPIDKeys(): Promise<CryptoKeyPair> {
  try {
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
    addDebugLog("info", "CRYPTO", "Par de chaves VAPID (ECDSA P-256) gerado com sucesso");
    return keyPair;
  } catch (error: any) {
    addDebugLog("error", "CRYPTO", `Falha de Hardware/Browser ao gerar VAPID: ${error.message}`, error);
    throw new Error("Este navegador não suporta geração de chaves ECDSA P-256 necessárias para o funcionamento offline.");
  }
}

// 🔥 NOVA FUNÇÃO: Geração genérica de RSA para o Servidor e Testes
export async function generateRSAKeys(): Promise<CryptoKeyPair> {
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
    addDebugLog("info", "CRYPTO", "Par de chaves RSA gerado com sucesso");
    return keyPair;
  } catch (error: any) {
    addDebugLog("error", "CRYPTO", `Falha ao gerar chaves RSA: ${error.message}`, error);
    throw new Error("Este dispositivo/ambiente não suporta geração de chaves RSA-OAEP de 2048 bits.");
  }
}

export async function generateE2EEKeys(): Promise<{
  publicEncrypt: JsonWebKey;
  privateDecryptJwk: JsonWebKey;
}> {
  try {
    const keyPair = await generateRSAKeys(); // Reutiliza a nova função

    const publicEncrypt = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const privateDecryptJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

    return { publicEncrypt, privateDecryptJwk };
  } catch (error: any) {
    addDebugLog("error", "CRYPTO", `Falha ao exportar chaves E2E: ${error.message}`, error);
    throw new Error("Falha ao preparar as chaves E2E.");
  }
}

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
      ivBase64: bufferToBase64Url(iv.buffer as ArrayBuffer),
    };
  } catch (error: any) {
    addDebugLog("error", "CRYPTO", `Falha interna no motor AES-GCM (Encrypt): ${error.message}`, error);
    throw new Error("Não foi possível criptografar os dados.");
  }
}

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
    return dec.decode(decryptedBuffer);
  } catch (error: any) {
    addDebugLog("error", "CRYPTO", `Falha de decifragem AES-GCM (Chave incorreta ou corrompido): ${error.message}`, error);
    throw new Error("A decodificação falhou. Dados corrompidos ou chave inválida.");
  }
}

export async function exportKeyToJWK(key: CryptoKey): Promise<JsonWebKey> {
  try {
    const jwk = await crypto.subtle.exportKey("jwk", key);
    return jwk;
  } catch (error: any) {
    addDebugLog("error", "CRYPTO", `Erro ao extrair chave (não extraível?): ${error.message}`, error);
    throw new Error("Falha ao exportar a chave para formato seguro.");
  }
}

export async function importJWKToKey(
  jwk: JsonWebKey,
  algorithm: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams = { name: "RSA-OAEP", hash: "SHA-256" },
  extractable: boolean = true,
  keyUsages: KeyUsage[] = ["decrypt"]
): Promise<CryptoKey> {
  try {
    const key = await crypto.subtle.importKey(
      "jwk" as any,
      jwk,
      algorithm,
      extractable,
      keyUsages
    );
    return key;
  } catch (error: any) {
    addDebugLog("error", "CRYPTO", `Erro estrutural ao importar chave JWK: ${error.message}`, error);
    throw new Error("A chave de criptografia fornecida está corrompida ou é incompatível.");
  }
}