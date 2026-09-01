/**
 * Geração de identidade simulada e derivação de infoHash
 * para o swarm WebTorrent.
 *
 * infoHash = SHA-1(chave_pública) → 20 bytes = 40 chars hex
 * (formato padrão do protocolo BitTorrent)
 */

export interface Identity {
  publicKey: string;
  infoHash: string;
}

export async function generateIdentity(): Promise<Identity> {
  // Usa globalThis.crypto para garantir compatibilidade em todos os ambientes de browser
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj) {
    throw new Error("API Crypto não disponível neste navegador.");
  }

  const bytes = new Uint8Array(32);
  cryptoObj.getRandomValues(bytes);
  const publicKey = bytesToHex(bytes);
  
  const infoHash = await deriveInfoHash(publicKey);
  return { publicKey, infoHash };
}

export async function deriveInfoHash(publicKey: string): Promise<string> {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.subtle) {
    throw new Error("Crypto.subtle não disponível. Verifique se está usando HTTPS ou localhost.");
  }

  const data = new TextEncoder().encode(publicKey);
  const hash = await cryptoObj.subtle.digest("SHA-1", data);
  return bytesToHex(new Uint8Array(hash));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}