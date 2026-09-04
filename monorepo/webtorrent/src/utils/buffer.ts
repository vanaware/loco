// /loco/monorepo/webtorrent/src/utils/buffer.ts
/**
 * Helpers para manipulação de Uint8Array, substituindo o `Buffer` do Node.js.
 * Focado em performance e compatibilidade com o protocolo BitTorrent.
 */

/**
 * Cria um Uint8Array preenchido com zeros.
 */
export function alloc(size: number): Uint8Array {
  return new Uint8Array(size);
}

/**
 * Cria um Uint8Array a partir de uma string (hex ou utf8) ou array.
 */
export function from(
  input: string | number[] | ArrayBuffer | Uint8Array,
  encoding: "hex" | "utf8" = "utf8"
): Uint8Array {
  if (input instanceof Uint8Array) return input.slice();
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (Array.isArray(input)) return new Uint8Array(input);

  if (typeof input === "string") {
    if (encoding === "hex") {
      const cleanStr = input.replace(/\s+/g, "");
      if (cleanStr.length % 2 !== 0) throw new Error("Invalid hex string");
      const arr = new Uint8Array(cleanStr.length / 2);
      for (let i = 0; i < cleanStr.length; i += 2) {
        arr[i / 2] = parseInt(cleanStr.substring(i, i + 2), 16);
      }
      return arr;
    }
    // utf8
    return new TextEncoder().encode(input);
  }

  throw new Error("Unsupported input type for buffer.from");
}

/**
 * Concatena múltiplos Uint8Arrays em um único.
 */
export function concat(arrays: Uint8Array[], totalLength?: number): Uint8Array {
  if (totalLength === undefined) {
    totalLength = 0;
    for (const arr of arrays) {
      totalLength += arr.length;
    }
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Converte Uint8Array para string.
 */
export function toString(
  buf: Uint8Array,
  encoding: "hex" | "utf8" = "utf8",
  start = 0,
  end?: number
): string {
  const slice = buf.subarray(start, end);
  if (encoding === "hex") {
    return Array.from(slice)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return new TextDecoder().decode(slice);
}

/**
 * Compara dois Uint8Arrays.
 */
export function equals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Lê um UInt32 Big-Endian (usado extensivamente no Wire Protocol).
 * Usamos '!' para afirmar ao TypeScript que o índice existe, garantindo 
 * performance sem verificações de runtime desnecessárias.
 */
export function readUInt32BE(buf: Uint8Array, offset = 0): number {
  return (
    ((buf[offset]!) << 24) |
    ((buf[offset + 1]!) << 16) |
    ((buf[offset + 2]!) << 8) |
    (buf[offset + 3]!)
  ) >>> 0; // >>> 0 força conversão para unsigned 32-bit
}

/**
 * Escreve um UInt32 Big-Endian.
 */
export function writeUInt32BE(buf: Uint8Array, value: number, offset = 0): void {
  buf[offset] = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}