// /loco/monorepo/webtorrent/src/crypto/hasher.ts
/**
 * Wrapper para a API nativa `crypto.subtle` do browser/Deno.
 * Substitui o `simple-sha1` e `crypto-browserify`.
 */

/**
 * Calcula o hash SHA-1 de um Uint8Array.
 * O BitTorrent usa SHA-1 para verificar as peças (pieces).
 */
export async function sha1(data: Uint8Array): Promise<string> {
  // O Deno/TypeScript é estrito com `BufferSource` e rejeita `ArrayBufferLike` 
  // (que é a união de ArrayBuffer | SharedArrayBuffer). 
  // O método `.slice()` garante um novo buffer contíguo, e a asserção `as ArrayBuffer` 
  // satisfaz o verificador de tipos sem custo real de performance em ambientes padrão.
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  
  const hashBuffer = await crypto.subtle.digest("SHA-1", buffer);
  const hashArray = new Uint8Array(hashBuffer);
  
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Calcula o hash SHA-256 (útil para extensões futuras ou magnet URIs v2).
 */
export async function sha256(data: Uint8Array): Promise<string> {
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = new Uint8Array(hashBuffer);
  
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Versão síncrona do SHA-1 (lança erro, pois WebCrypto é assíncrono).
 * Mantida apenas para compatibilidade de assinatura de tipos, se necessário.
 */
export function sha1Sync(_data: Uint8Array): string {
  throw new Error(
    "sha1Sync não é suportado no browser/Deno via WebCrypto. Use a versão assíncrona (await sha1())."
  );
}