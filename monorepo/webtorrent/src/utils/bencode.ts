// /loco/monorepo/webtorrent/src/utils/bencode.ts

export interface BencodeDict {
  [key: string]: BencodeValue;
}

export interface BencodeList extends Array<BencodeValue> {}

export type BencodeValue = string | number | bigint | Uint8Array | BencodeList | BencodeDict;

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
    if (this.pos >= this.data.length) {
      throw new Error("Unexpected end of data");
    }
    
    const char = this.data[this.pos]!;
    
    if (char === 105) return this.decodeInteger(); // 'i'
    if (char === 108) return this.decodeList();    // 'l'
    if (char === 100) return this.decodeDict();    // 'd'
    
    return this.decodeString();
  }

  private decodeInteger(): number | bigint {
    this.pos++;
    let end = this.pos;
    while (end < this.data.length && this.data[end] !== 101) { // 101 é 'e'
      end++;
    }
    if (end >= this.data.length) {
      throw new Error("Invalid integer format: missing 'e'");
    }
    const numStr = decoder.decode(this.data.subarray(this.pos, end));
    this.pos = end + 1;
    
    const num = Number(numStr);
    if (Number.isSafeInteger(num)) {
      return num;
    }
    return BigInt(numStr);
  }

  private decodeString(): Uint8Array | string {
    let end = this.pos;
    while (end < this.data.length && this.data[end] !== 58) { // 58 é ':'
      end++;
    }
    if (end >= this.data.length) {
      throw new Error("Invalid string format: missing ':'");
    }
    const lenStr = decoder.decode(this.data.subarray(this.pos, end));
    const len = parseInt(lenStr, 10);
    this.pos = end + 1;
    
    if (this.pos + len > this.data.length) {
      throw new Error("String length exceeds buffer size");
    }
    
    const bytes = this.data.subarray(this.pos, this.pos + len);
    this.pos += len;
    
    try {
      const str = decoder.decode(bytes);
      // 🔥 CORREÇÃO: Verifica se é UTF-8 válido E não contém caracteres de controle 
      // (comuns em hashes binários e dados de peças, como o byte nulo 0x00)
      if (!str.includes('\uFFFD') && !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(str)) {
        return str;
      }
    } catch {
      // Ignora e retorna Uint8Array em caso de falha na decodificação
    }
    return bytes;
  }

  private decodeList(): BencodeList {
    this.pos++;
    const list: BencodeValue[] = [];
    while (this.pos < this.data.length && this.data[this.pos] !== 101) { // 101 é 'e'
      list.push(this.decode());
    }
    if (this.pos >= this.data.length) {
      throw new Error("Invalid list format: missing 'e'");
    }
    this.pos++;
    return list as BencodeList;
  }

  private decodeDict(): BencodeDict {
    this.pos++;
    const dict: BencodeDict = {};
    while (this.pos < this.data.length && this.data[this.pos] !== 101) { // 101 é 'e'
      const keyBytes = this.decodeString();
      const key = typeof keyBytes === 'string' ? keyBytes : decoder.decode(keyBytes);
      dict[key] = this.decode();
    }
    if (this.pos >= this.data.length) {
      throw new Error("Invalid dict format: missing 'e'");
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