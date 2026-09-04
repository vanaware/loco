// /loco/monorepo/webtorrent/src/utils/bencode.ts

/**
 * Utilitário Bencode puro para Browser/Deno.
 * Substitui o pacote 'bencode' do npm.
 * 
 * Tipos suportados:
 * - Strings: Representadas como string (UTF-8) ou Uint8Array (bytes brutos)
 * - Inteiros: number ou bigint (para tamanhos de torrent > 9PB)
 * - Listas: Array de BencodeValue
 * - Dicionários: Record<string, BencodeValue>
 */

// ============================================================================
// TIPOS EXPORTADOS (Usando interfaces para evitar TS2456 em tipos recursivos)
// ============================================================================

export interface BencodeDict {
  [key: string]: BencodeValue;
}

export interface BencodeList extends Array<BencodeValue> {}

export type BencodeValue = string | number | bigint | Uint8Array | BencodeList | BencodeDict;

// ============================================================================
// IMPLEMENTAÇÃO
// ============================================================================

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function decode(data: Uint8Array): BencodeValue {
  const parser = new BencodeDecoder(data);
  return parser.decode();
}

export function encode(data: BencodeValue): Uint8Array {
  const parts: Uint8Array[] = [];
  _encodeValue(data, parts);
  
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);
  
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  
  return result;
}

class BencodeDecoder {
  private pos = 0;

  constructor(private readonly data: Uint8Array) {}

  public decode(): BencodeValue {
    const char = this.data[this.pos]!;
    
    if (char === 105) return this.decodeInteger(); // 'i'
    if (char === 108) return this.decodeList();    // 'l'
    if (char === 100) return this.decodeDict();    // 'd'
    
    return this.decodeString();
  }

  private decodeInteger(): number | bigint {
    this.pos++;
    let end = this.pos;
    while (this.data[end] !== 101) {
      end++;
    }
    const numStr = decoder.decode(this.data.subarray(this.pos, end));
    this.pos = end + 1;
    
    const num = Number(numStr);
    // Retorna bigint se exceder o limite de inteiro seguro do JS (comum em tamanhos de torrent)
    if (Number.isSafeInteger(num)) {
      return num;
    }
    return BigInt(numStr);
  }

  private decodeString(): Uint8Array | string {
    let end = this.pos;
    while (this.data[end] !== 58) {
      end++;
    }
    const lenStr = decoder.decode(this.data.subarray(this.pos, end));
    const len = parseInt(lenStr, 10);
    this.pos = end + 1;
    
    const bytes = this.data.subarray(this.pos, this.pos + len);
    this.pos += len;
    
    // Heurística aprimorada para distinguir texto de dados binários (ex: hashes SHA-1)
    try {
      const str = decoder.decode(bytes);
      
      // 1. Se houver caractere de substituição, é binário inválido em UTF-8
      if (str.includes('\uFFFD')) {
        return bytes;
      }
      
      // 2. Se houver caracteres de controle ASCII (ex: byte nulo 0x00, comum em hashes), 
      // tratamos como binário. Metadados de texto legíveis de torrent raramente os possuem.
      if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(str)) {
        return bytes;
      }
      
      return str;
    } catch {
      // Fallback seguro para binário em caso de falha na decodificação
      return bytes;
    }
  }

  private decodeList(): BencodeList {
    this.pos++;
    const list: BencodeValue[] = [];
    while (this.data[this.pos] !== 101) {
      list.push(this.decode());
    }
    this.pos++;
    return list as BencodeList;
  }

  private decodeDict(): BencodeDict {
    this.pos++;
    const dict: BencodeDict = {};
    while (this.data[this.pos] !== 101) {
      const keyBytes = this.decodeString();
      const key = typeof keyBytes === 'string' ? keyBytes : decoder.decode(keyBytes);
      dict[key] = this.decode();
    }
    this.pos++;
    return dict;
  }
}

function _encodeValue(value: BencodeValue, parts: Uint8Array[]): void {
  if (typeof value === 'string') {
    const encoded = encoder.encode(value);
    parts.push(encoder.encode(`${encoded.length}:`));
    parts.push(encoded);
  } else if (typeof value === 'number' || typeof value === 'bigint') {
    parts.push(encoder.encode(`i${value}e`));
  } else if (value instanceof Uint8Array) {
    parts.push(encoder.encode(`${value.length}:`));
    parts.push(value);
  } else if (Array.isArray(value)) {
    parts.push(encoder.encode("l"));
    for (const item of value) {
      _encodeValue(item, parts);
    }
    parts.push(encoder.encode("e"));
  } else if (typeof value === 'object' && value !== null) {
    parts.push(encoder.encode("d"));
    
    // CRÍTICO: As chaves do dicionário DEVEM ser ordenadas lexicograficamente
    // para que o info_hash do torrent seja consistente entre todos os clientes.
    const keys = Object.keys(value).sort((a, b) => {
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    });
    
    for (const key of keys) {
      const val = (value as Record<string, BencodeValue>)[key];
      if (val !== undefined) {
        const encodedKey = encoder.encode(key);
        parts.push(encoder.encode(`${encodedKey.length}:`));
        parts.push(encodedKey);
        _encodeValue(val, parts);
      }
    }
    parts.push(encoder.encode("e"));
  } else {
    throw new TypeError(`Tipo não suportado para bencode: ${typeof value}`);
  }
}