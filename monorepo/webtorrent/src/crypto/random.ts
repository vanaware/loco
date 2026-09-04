// /loco/monorepo/webtorrent/src/crypto/random.ts
/**
 * Geração de bytes aleatórios criptograficamente seguros.
 * Substitui o `randombytes` do Node.js.
 */

/**
 * Gera um Uint8Array com bytes aleatórios seguros.
 */
export function randomBytes(size: number): Uint8Array {
  const buffer = new Uint8Array(size);
  crypto.getRandomValues(buffer);
  return buffer;
}

/**
 * Gera um Peer ID ou Node ID aleatório (20 bytes / 40 caracteres hex).
 */
export function generateId(): string {
  const bytes = randomBytes(20);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}