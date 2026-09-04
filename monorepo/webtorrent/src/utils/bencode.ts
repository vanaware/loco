// /loco/monorepo/webtorrent/src/utils/bencode.ts

/**
 * @module @loco/utils/bencode
 * @description
 * Implementação completa, nativa e estritamente tipada de Bencode para o Loco.
 * Bencode é o formato de serialização utilizado pelo BitTorrent para arquivos .torrent
 * e para a comunicação do protocolo Wire (DHT, PEX, etc).
 * 
 * Este módulo lida corretamente com o `noUncheckedIndexedAccess` do TypeScript,
 * evitando erros de compilação ao acessar chaves de objetos dinâmicos e omitindo
 * valores `undefined` conforme a especificação do BitTorrent.
 */

export type BencodeValue =
  | string
  | number
  | bigint
  | Uint8Array
  | BencodeValue[]
  | { [key: string]: BencodeValue };

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

/**
 * Codifica um valor JavaScript em um Uint8Array no formato Bencode.
 * 
 * @param value - O valor a ser codificado
 * @returns Uint8Array contendo os dados Bencode
 * @throws Error se o valor for null, undefined ou de tipo não suportado
 */
export function encode(value: BencodeValue): Uint8Array {
  const parts: (string | Uint8Array)[] = [];
  _encodeValue(value, parts);

  // Calcula o tamanho total para alocar o buffer final de uma vez (performance)
  let totalLength = 0;
  for (const part of parts) {
    totalLength += typeof part === 'string' ? TEXT_ENCODER.encode(part).length : part.length;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    if (typeof part === 'string') {
      const encoded = TEXT_ENCODER.encode(part);
      result.set(encoded, offset);
      offset += encoded.length;
    } else {
      result.set(part, offset);
      offset += part.length;
    }
  }

  return result;
}

function _encodeValue(value: BencodeValue, parts: (string | Uint8Array)[]): void {
  if (value === null || value === undefined) {
    throw new Error('[Bencode] Bencode não suporta valores null ou undefined.');
  }

  if (typeof value === 'string') {
    const encoded = TEXT_ENCODER.encode(value);
    parts.push(`${encoded.length}:`);
    parts.push(encoded);
  } else if (typeof value === 'number' || typeof value === 'bigint') {
    parts.push(`i${value.toString()}e`);
  } else if (value instanceof Uint8Array) {
    parts.push(`${value.length}:`);
    parts.push(value);
  } else if (Array.isArray(value)) {
    parts.push('l');
    for (const item of value) {
      _encodeValue(item, parts);
    }
    parts.push('e');
  } else if (typeof value === 'object') {
    parts.push('d');
    // A especificação Bencode exige que as chaves do dicionário sejam strings e estejam ordenadas
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      // 🔥 CORREÇÃO TS2345:
      // Com `noUncheckedIndexedAccess` ativado, `value[key]` é inferido como `BencodeValue | undefined`.
      // Extraímos a variável e validamos para satisfazer o TS e a spec do BitTorrent.
      const val = (value as Record<string, BencodeValue>)[key];
      
      if (val !== undefined) {
        // Codifica a chave
        const encodedKey = TEXT_ENCODER.encode(key);
        parts.push(`${encodedKey.length}:`);
        parts.push(encodedKey);
        // Codifica o valor
        _encodeValue(val, parts);
      }
    }
    parts.push('e');
  } else {
    throw new Error(`[Bencode] Tipo não suportado para codificação: ${typeof value}`);
  }
}

/**
 * Decodifica um Uint8Array Bencode para uma estrutura JavaScript.
 * 
 * @param data - O buffer Bencode
 * @returns O valor JavaScript decodificado
 * @throws Error se os dados forem malformados
 */
export function decode(data: Uint8Array): BencodeValue {
  let offset = 0;

  function decodeNext(): BencodeValue {
    if (offset >= data.length) {
      throw new Error('[Bencode] Fim inesperado dos dados.');
    }

    // 🔥 CORREÇÃO TS18048:
    // O TypeScript com `noUncheckedIndexedAccess` infere `data[offset]` como `number | undefined`.
    // Como já validamos `offset >= data.length` acima, sabemos que é seguro usar `!`.
    const byte = data[offset]!;

    // Inteiro: i<número>e
    if (byte === 0x69) { // 'i'
      offset++;
      const end = data.indexOf(0x65, offset); // 'e'
      if (end === -1) throw new Error('[Bencode] Inteiro não terminado.');
      const numStr = TEXT_DECODER.decode(data.subarray(offset, end));
      offset = end + 1;
      
      // Tenta converter para Number, cai para BigInt se exceder MAX_SAFE_INTEGER
      const num = Number(numStr);
      return Number.isSafeInteger(num) ? num : BigInt(numStr);
    }

    // Lista: l<itens>e
    if (byte === 0x6c) { // 'l'
      offset++;
      const list: BencodeValue[] = [];
      while (offset < data.length && data[offset]! !== 0x65) { // 'e'
        list.push(decodeNext());
      }
      if (data[offset]! !== 0x65) throw new Error('[Bencode] Lista não terminada.');
      offset++; // pula o 'e'
      return list;
    }

    // Dicionário: d<chave><valor>...e
    if (byte === 0x64) { // 'd'
      offset++;
      const dict: Record<string, BencodeValue> = {};
      while (offset < data.length && data[offset]! !== 0x65) { // 'e'
        const key = decodeNext();
        let keyStr: string;
        
        if (typeof key === 'string') {
          keyStr = key;
        } else if (key instanceof Uint8Array) {
          keyStr = TEXT_DECODER.decode(key);
        } else {
          throw new Error('[Bencode] Chave de dicionário inválida (deve ser string ou bytes).');
        }
        
        dict[keyStr] = decodeNext();
      }
      if (data[offset]! !== 0x65) throw new Error('[Bencode] Dicionário não terminado.');
      offset++; // pula o 'e'
      return dict;
    }

    // String ou ByteArray: <tamanho>:<conteúdo>
    if (byte >= 0x30 && byte <= 0x39) { // '0'-'9'
      const colon = data.indexOf(0x3a, offset); // ':'
      if (colon === -1) throw new Error('[Bencode] Tamanho de string inválido.');
      const lengthStr = TEXT_DECODER.decode(data.subarray(offset, colon));
      const length = parseInt(lengthStr, 10);
      offset = colon + 1;
      
      if (offset + length > data.length) {
        throw new Error('[Bencode] String excede o tamanho do buffer.');
      }
      
      const bytes = data.subarray(offset, offset + length);
      offset += length;

      // Heurística: Tenta decodificar como UTF-8. Se for válido e não contiver 
      // o caractere de substituição (), assumimos que é uma string.
      // Caso contrário, retornamos o Uint8Array cru (comum para hashes SHA-1 e peças).
      try {
        const str = TEXT_DECODER.decode(bytes);
        if (!str.includes('\uFFFD')) {
          return str;
        }
      } catch {
        // Ignora e retorna Uint8Array
      }
      return new Uint8Array(bytes);
    }

    throw new Error(`[Bencode] Dados inválidos no offset ${offset} (byte: ${byte})`);
  }

  return decodeNext();
}