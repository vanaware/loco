> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém experimentos e código da área de WEBTORRENT.
> O projeto é o **Loco ** estruturado em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco - Modo: WEBTORRENT

Gerado automaticamente em: 9/3/2026, 10:07:56 PM

---

## Arquivo: `monorepo/webtorrent/src/utils/buffer.ts`

```ts
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
```

---

## Arquivo: `monorepo/webtorrent/src/utils/magnet.ts`

```ts
// /loco/monorepo/webtorrent/src/utils/magnet.ts

export interface ParsedMagnet {
  infoHash: string;
  infoHashBuffer: Uint8Array;
  name?: string;
  trackers: string[];
  webSeeds: string[];
  peerAddresses: string[];
  torrentFileUrl?: string;
  magnetUri: string;
}

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BASE32_LOOKUP: Record<string, number> = {};

// 🔥 CORREÇÃO: Usar non-null assertion ou charAt para satisfazer o TS
for (let i = 0; i < BASE32_CHARS.length; i++) {
  BASE32_LOOKUP[BASE32_CHARS.charAt(i)] = i;
}

function decodeBase32(input: string): Uint8Array {
  const cleaned = input.replace(/=+$/, "").toUpperCase();
  const outputLength = Math.floor((cleaned.length * 5) / 8);
  const output = new Uint8Array(outputLength);
  
  let buffer = 0;
  let bitsLeft = 0;
  let outputIndex = 0;
  
  for (const char of cleaned) {
    const value = BASE32_LOOKUP[char];
    if (value === undefined) {
      throw new Error(`Invalid base32 character: ${char}`);
    }
    
    buffer = (buffer << 5) | value;
    bitsLeft += 5;
    
    if (bitsLeft >= 8) {
      output[outputIndex++] = (buffer >> (bitsLeft - 8)) & 0xff;
      bitsLeft -= 8;
    }
  }
  
  return output;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Invalid hex string length");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export function parseMagnet(uri: string): ParsedMagnet {
  if (!uri.startsWith("magnet:?")) {
    throw new Error("Invalid magnet URI: must start with 'magnet:?'");
  }
  
  const queryString = uri.substring(8);
  const params = new URLSearchParams(queryString);
  const xt = params.get("xt");
  
  if (!xt) {
    throw new Error("Missing 'xt' parameter in magnet URI");
  }
  
  const match = xt.match(/^urn:btih:(.+)$/i);
  
  // 🔥 CORREÇÃO: Validar explicitamente o match para garantir que hashValue é string
  if (!match || !match[1]) {
    throw new Error(`Invalid 'xt' parameter format: ${xt}`);
  }
  
  const hashValue = match[1];
  let infoHash: string;
  let infoHashBuffer: Uint8Array;
  
  if (hashValue.length === 40 && /^[0-9a-f]+$/i.test(hashValue)) {
    infoHash = hashValue.toLowerCase();
    infoHashBuffer = hexToBytes(infoHash);
  } else if (hashValue.length === 32 && /^[A-Z2-7]+$/i.test(hashValue)) {
    infoHashBuffer = decodeBase32(hashValue);
    infoHash = bytesToHex(infoHashBuffer);
  } else {
    throw new Error(
      `Invalid infoHash format: expected 40 hex chars or 32 base32 chars, got ${hashValue.length} chars`
    );
  }
  
  const trackers: string[] = [];
  params.getAll("tr").forEach((tr) => trackers.push(decodeURIComponent(tr)));
  
  const webSeeds: string[] = [];
  params.getAll("ws").forEach((ws) => webSeeds.push(decodeURIComponent(ws)));
  
  const peerAddresses: string[] = [];
  params.getAll("x.pe").forEach((pe) => peerAddresses.push(decodeURIComponent(pe)));
  
  const dn = params.get("dn");
  const name = dn ? decodeURIComponent(dn) : undefined;
  
  const xs = params.get("xs");
  const torrentFileUrl = xs ? decodeURIComponent(xs) : undefined;
  
  return {
    infoHash,
    infoHashBuffer,
    name,
    trackers,
    webSeeds,
    peerAddresses,
    torrentFileUrl,
    magnetUri: uri,
  };
}

export function encodeMagnet(parsed: Omit<ParsedMagnet, "magnetUri">): string {
  const parts: string[] = [];
  parts.push(`xt=urn:btih:${parsed.infoHash}`);
  
  if (parsed.name) parts.push(`dn=${encodeURIComponent(parsed.name)}`);
  for (const tracker of parsed.trackers) parts.push(`tr=${encodeURIComponent(tracker)}`);
  for (const webSeed of parsed.webSeeds) parts.push(`ws=${encodeURIComponent(webSeed)}`);
  for (const peer of parsed.peerAddresses) parts.push(`x.pe=${encodeURIComponent(peer)}`);
  if (parsed.torrentFileUrl) parts.push(`xs=${encodeURIComponent(parsed.torrentFileUrl)}`);
  
  return `magnet:?${parts.join("&")}`;
}
```

---

## Arquivo: `monorepo/webtorrent/src/utils/parse-torrent.ts`

```ts
// /loco/monorepo/webtorrent/src/utils/parse-torrent.ts

import { decode, encode, BencodeValue, BencodeDict } from "./bencode.ts";
import { parseMagnet, encodeMagnet } from "./magnet.ts";
import { sha1 } from "../crypto/hasher.ts";

export interface ParsedTorrentFile {
  path: string;
  name: string;
  length: number;
  offset: number;
}

export interface ParsedTorrent {
  infoHash: string;
  infoHashBuffer: Uint8Array;
  name?: string;
  announce: string[];
  urlList: string[];
  peerAddresses: string[];
  files: ParsedTorrentFile[];
  length: number;
  pieceLength: number;
  pieces: Uint8Array[];
  info: BencodeDict;
  magnetURI: string;
  comment?: string;
  createdBy?: string;
}

export async function parseTorrent(
  torrentId: string | Uint8Array | ParsedTorrent
): Promise<ParsedTorrent> {
  // 1. Se já for um objeto ParsedTorrent, apenas retorna
  if (typeof torrentId === "object" && "infoHash" in torrentId && "files" in torrentId) {
    return torrentId as ParsedTorrent;
  }

  // 2. Se for string, assume que é Magnet URI (ou infoHash puro)
  if (typeof torrentId === "string") {
    let magnetUri = torrentId;
    if (/^[a-f0-9]{40}$/i.test(torrentId) || /^[a-z2-7]{32}$/i.test(torrentId)) {
      magnetUri = `magnet:?xt=urn:btih:${torrentId}`;
    }
    if (!magnetUri.startsWith("magnet:?")) {
      throw new Error("Invalid torrent identifier");
    }
    return magnetToParsed(parseMagnet(magnetUri));
  }

  // 3. Se for Uint8Array, assume que é um arquivo .torrent codificado em Bencode
  if (torrentId instanceof Uint8Array) {
    return await bufferToParsed(torrentId);
  }

  throw new Error("Invalid torrent identifier type");
}

function magnetToParsed(magnet: ReturnType<typeof parseMagnet>): ParsedTorrent {
  return {
    infoHash: magnet.infoHash,
    infoHashBuffer: magnet.infoHashBuffer,
    name: magnet.name,
    announce: magnet.trackers,
    urlList: magnet.webSeeds,
    peerAddresses: magnet.peerAddresses,
    files: [], // Arquivos desconhecidos até baixar metadados via ut_metadata
    length: 0,
    pieceLength: 0,
    pieces: [],
    info: {},
    magnetURI: magnet.magnetUri,
  };
}

async function bufferToParsed(buffer: Uint8Array): Promise<ParsedTorrent> {
  const torrentObj = decode(buffer) as BencodeDict;
  
  const info = torrentObj["info"] as BencodeDict | undefined;
  if (!info) {
    throw new Error("Torrent is missing required field: info");
  }

  // 🔥 CRÍTICO: O infoHash é o SHA-1 do dicionário 'info' CODIFICADO EM BENCODE.
  // Nosso encoder já garante a ordenação lexicográfica das chaves, conforme a spec.
  const infoBuffer = encode(info);
  const infoHash = await sha1(infoBuffer);
  
  const infoHashBuffer = new Uint8Array(20);
  for (let i = 0; i < 20; i++) {
    infoHashBuffer[i] = parseInt(infoHash.substring(i * 2, i * 2 + 2), 16);
  }

  const pieceLength = info["piece length"] as number | undefined;
  if (typeof pieceLength !== "number") {
    throw new Error("Torrent is missing required field: info['piece length']");
  }

  const piecesRaw = info["pieces"];
  let pieces: Uint8Array[] = [];
  
  if (piecesRaw instanceof Uint8Array) {
    if (piecesRaw.length % 20 !== 0) {
      throw new Error("Invalid pieces length (must be multiple of 20)");
    }
    for (let i = 0; i < piecesRaw.length; i += 20) {
      pieces.push(piecesRaw.subarray(i, i + 20));
    }
  } else if (typeof piecesRaw === "string") {
    throw new Error("Pieces must be binary data (Uint8Array)");
  }

  const files: ParsedTorrentFile[] = [];
  let totalLength = 0;
  const textDecoder = new TextDecoder();

  if (info["files"]) {
    // Multi-file torrent
    const filesList = info["files"] as BencodeDict[];
    for (const fileDict of filesList) {
      const length = fileDict["length"] as number;
      const pathList = fileDict["path"] as (Uint8Array | string)[];
      
      const pathParts = pathList.map((p) => 
        typeof p === "string" ? p : textDecoder.decode(p)
      );
      
      const path = pathParts.join("/");
      const name = pathParts[pathParts.length - 1]!;
      
      files.push({
        path,
        name,
        length,
        offset: totalLength,
      });
      
      totalLength += length;
    }
  } else {
    // Single-file torrent
    const length = info["length"] as number;
    if (typeof length !== "number") {
      throw new Error("Torrent is missing required field: info.length or info.files");
    }
    
    const nameRaw = info["name"];
    const name = typeof nameRaw === "string" 
      ? nameRaw 
      : textDecoder.decode(nameRaw as Uint8Array);
      
    files.push({
      path: name,
      name,
      length,
      offset: 0,
    });
    
    totalLength = length;
  }

  // Extrai trackers (announce e announce-list)
  const announce: string[] = [];
  const announceSingle = torrentObj["announce"];
  if (announceSingle) {
    const url = typeof announceSingle === "string" 
      ? announceSingle 
      : textDecoder.decode(announceSingle as Uint8Array);
    announce.push(url);
  }
  
  const announceList = torrentObj["announce-list"] as (Uint8Array | string)[][] | undefined;
  if (announceList) {
    for (const tier of announceList) {
      for (const tracker of tier) {
        const url = typeof tracker === "string" 
          ? tracker 
          : textDecoder.decode(tracker);
        if (!announce.includes(url)) {
          announce.push(url);
        }
      }
    }
  }

  // Extrai web seeds (url-list)
  const urlList: string[] = [];
  const urlListRaw = torrentObj["url-list"];
  if (urlListRaw) {
    const list = Array.isArray(urlListRaw) ? urlListRaw : [urlListRaw];
    for (const url of list) {
      const decoded = typeof url === "string" ? url : textDecoder.decode(url as Uint8Array);
      urlList.push(decoded);
    }
  }

  // Extrai metadados opcionais
  const commentRaw = torrentObj["comment"];
  const comment = commentRaw 
    ? (typeof commentRaw === "string" ? commentRaw : textDecoder.decode(commentRaw as Uint8Array))
    : undefined;

  const createdByRaw = torrentObj["created by"];
  const createdBy = createdByRaw
    ? (typeof createdByRaw === "string" ? createdByRaw : textDecoder.decode(createdByRaw as Uint8Array))
    : undefined;

  const nameRootRaw = info["name"];
  const nameRoot = nameRootRaw
    ? (typeof nameRootRaw === "string" ? nameRootRaw : textDecoder.decode(nameRootRaw as Uint8Array))
    : undefined;

  // Gera a Magnet URI equivalente
  const magnetURI = encodeMagnet({
    infoHash,
    infoHashBuffer,
    name: nameRoot,
    trackers: announce,
    webSeeds: urlList,
    peerAddresses: [],
  });

  return {
    infoHash,
    infoHashBuffer,
    name: nameRoot,
    announce,
    urlList,
    peerAddresses: [],
    files,
    length: totalLength,
    pieceLength,
    pieces,
    info,
    magnetURI,
    comment,
    createdBy,
  };
}
```

---

## Arquivo: `monorepo/webtorrent/src/utils/bencode.ts`

```ts
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
```

---

## Arquivo: `monorepo/webtorrent/src/utils/event-target.ts`

```ts
// /loco/monorepo/webtorrent/src/utils/event-target.ts

/**
 * Substituto tipado para o `EventEmitter` do Node.js.
 * Usa a API nativa `EventTarget` do browser, mas com tipagem estrita para eventos.
 */

export type EventMap = Record<string, Event | CustomEvent | any>;

export class TypedEventTarget<Events extends EventMap> extends EventTarget {
  /**
   * Registra um listener para um evento específico.
   */
  on<K extends keyof Events>(
    type: K & string,
    listener: (event: Events[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): this {
    this.addEventListener(type, listener as EventListener, options);
    return this;
  }

  /**
   * Registra um listener que será removido após a primeira execução.
   */
  once<K extends keyof Events>(
    type: K & string,
    listener: (event: Events[K]) => void
  ): this {
    this.addEventListener(type, listener as EventListener, { once: true });
    return this;
  }

  /**
   * Remove um listener.
   */
  off<K extends keyof Events>(
    type: K & string,
    listener: (event: Events[K]) => void,
    options?: boolean | EventListenerOptions
  ): this {
    this.removeEventListener(type, listener as EventListener, options);
    return this;
  }

  /**
   * Emite um evento.
   * 🔥 CORREÇÃO: Usamos `(detail as any) instanceof Event` para contornar 
   * a restrição do TypeScript com tipos genéricos union (TS2358).
   */
  emit<K extends keyof Events>(type: K & string, detail?: Events[K]): boolean {
    const event =
      (detail && (detail as any) instanceof Event)
        ? (detail as any)
        : new CustomEvent(type, { detail, cancelable: true });
    
    return this.dispatchEvent(event);
  }

  /**
   * Remove todos os listeners de um tipo específico (ou de todos os tipos).
   * Nota: EventTarget nativo não expõe os listeners, então esta implementação
   * é um no-op seguro, confiando no Garbage Collector quando o alvo é destruído.
   */
  removeAllListeners<K extends keyof Events>(type?: K & string): this {
    // Em implementações nativas, recriar o EventTarget é a forma mais limpa
    // de limpar tudo, mas para o WebTorrent, o destroy() do objeto pai 
    // geralmente cuida da limpeza das referências.
    return this;
  }
}
```

---

## Arquivo: `monorepo/webtorrent/src/crypto/random.ts`

```ts
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
```

---

## Arquivo: `monorepo/webtorrent/src/crypto/hasher.ts`

```ts
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
```

---

## Arquivo: `monorepo/webtorrent/src/storage/memory-chunk-store.ts`

```ts
// /loco/monorepo/webtorrent/src/storage/memory-chunk-store.ts

import type { ChunkStore } from "./opfs-chunk-store.ts";

export interface MemoryChunkStoreOptions {
  chunkLength: number;
  length?: number;
}

export class MemoryChunkStore implements ChunkStore {
  public chunkLength: number;
  private length: number;
  private lastChunkLength: number;
  private lastChunkIndex: number;
  private chunks: Map<number, Uint8Array> = new Map();
  private closed = false;

  constructor(opts: MemoryChunkStoreOptions) {
    this.chunkLength = opts.chunkLength;
    this.length = opts.length || Infinity;
    
    if (this.length !== Infinity) {
      this.lastChunkLength = this.length % this.chunkLength || this.chunkLength;
      this.lastChunkIndex = Math.floor(this.length / this.chunkLength);
    } else {
      this.lastChunkLength = this.chunkLength;
      this.lastChunkIndex = Infinity;
    }
  }

  // ── Overloads ──
  get(index: number, opts?: { offset?: number; length?: number }): Promise<Uint8Array>;
  get(index: number, cb: (err: Error | null, buf?: Uint8Array) => void): void;
  get(index: number, opts: { offset?: number; length?: number }, cb: (err: Error | null, buf?: Uint8Array) => void): void;
  
  // ── Implementation (SEM a palavra-chave 'async') ──
  get(index: number, optsOrCb?: any, cb?: any): Promise<Uint8Array> | void {
    const opts = typeof optsOrCb === "object" ? optsOrCb : undefined;
    const callback = typeof optsOrCb === "function" ? optsOrCb : cb;

    if (callback) {
      this._getAsync(index, opts)
        .then((buf) => callback(null, buf))
        .catch((err) => callback(err));
      return; // Retorna void para a assinatura do callback
    }

    return this._getAsync(index, opts); // Retorna Promise<Uint8Array>
  }

  private async _getAsync(index: number, opts?: { offset?: number; length?: number }): Promise<Uint8Array> {
    if (this.closed) throw new Error("Storage is closed");
    
    const buf = this.chunks.get(index);
    if (!buf) {
      const err = new Error(`Chunk ${index} not found`);
      (err as any).notFound = true;
      throw err;
    }
    
    if (opts) {
      const offset = opts.offset || 0;
      const length = opts.length || buf.length - offset;
      return buf.subarray(offset, offset + length);
    }
    
    return buf;
  }

  async put(index: number, buf: Uint8Array, cb?: (err: Error | null) => void): Promise<void> {
    const promise = this._putAsync(index, buf);
    if (cb) {
      promise.then(() => cb(null)).catch((err) => cb(err));
    }
    return promise;
  }

  private async _putAsync(index: number, buf: Uint8Array): Promise<void> {
    if (this.closed) throw new Error("Storage is closed");
    
    const isLastChunk = index === this.lastChunkIndex;
    const expectedLength = isLastChunk ? this.lastChunkLength : this.chunkLength;
    
    if (buf.length !== expectedLength) {
      throw new Error(`Invalid chunk length: expected ${expectedLength}, got ${buf.length}`);
    }
    
    this.chunks.set(index, buf);
  }

  async close(cb?: (err: Error | null) => void): Promise<void> {
    const promise = this._closeAsync();
    if (cb) {
      promise.then(() => cb(null)).catch((err) => cb(err));
    }
    return promise;
  }

  private async _closeAsync(): Promise<void> {
    if (this.closed) throw new Error("Storage is already closed");
    this.closed = true;
    this.chunks.clear();
  }

  async destroy(cb?: (err: Error | null) => void): Promise<void> {
    const promise = this._destroyAsync();
    if (cb) {
      promise.then(() => cb(null)).catch((err) => cb(err));
    }
    return promise;
  }

  private async _destroyAsync(): Promise<void> {
    this.closed = true;
    this.chunks.clear();
  }
}
```

---

## Arquivo: `monorepo/webtorrent/src/storage/opfs-chunk-store.ts`

```ts
// /loco/monorepo/webtorrent/src/storage/opfs-chunk-store.ts

import { MemoryChunkStore } from "./memory-chunk-store.ts";

export interface ChunkStore {
  chunkLength: number;
  get(index: number, opts?: { offset?: number; length?: number }): Promise<Uint8Array>;
  get(index: number, cb: (err: Error | null, buf?: Uint8Array) => void): void;
  get(index: number, opts: { offset?: number; length?: number }, cb: (err: Error | null, buf?: Uint8Array) => void): void;
  put(index: number, buf: Uint8Array, cb?: (err: Error | null) => void): Promise<void>;
  close(cb?: (err: Error | null) => void): Promise<void>;
  destroy(cb?: (err: Error | null) => void): Promise<void>;
}

export interface ChunkStoreOptions {
  chunkLength: number;
  length?: number;
  rootDir?: FileSystemDirectoryHandle;
}

export class OPFSChunkStore implements ChunkStore {
  public chunkLength: number;
  private length: number;
  private lastChunkLength: number;
  private lastChunkIndex: number;
  private rootDir: FileSystemDirectoryHandle | null;
  private closed = false;
  private fallbackStore: MemoryChunkStore | null = null;

  constructor(opts: ChunkStoreOptions) {
    this.chunkLength = opts.chunkLength;
    this.length = opts.length || Infinity;
    
    if (this.length !== Infinity) {
      this.lastChunkLength = this.length % this.chunkLength || this.chunkLength;
      this.lastChunkIndex = Math.floor(this.length / this.chunkLength);
    } else {
      this.lastChunkLength = this.chunkLength;
      this.lastChunkIndex = Infinity;
    }
    
    this.rootDir = opts.rootDir || null;
    
    if (!this.rootDir) {
      console.warn("[OPFSChunkStore] OPFS not available, falling back to memory store");
      this.fallbackStore = new MemoryChunkStore({ chunkLength: this.chunkLength, length: this.length });
    }
  }

  // ── Overloads ──
  get(index: number, opts?: { offset?: number; length?: number }): Promise<Uint8Array>;
  get(index: number, cb: (err: Error | null, buf?: Uint8Array) => void): void;
  get(index: number, opts: { offset?: number; length?: number }, cb: (err: Error | null, buf?: Uint8Array) => void): void;
  
  // ── Implementation (SEM a palavra-chave 'async') ──
  get(index: number, optsOrCb?: any, cb?: any): Promise<Uint8Array> | void {
    if (this.fallbackStore) {
      if (typeof optsOrCb === "function") {
        return this.fallbackStore.get(index, optsOrCb);
      }
      return this.fallbackStore.get(index, optsOrCb as any, cb as any);
    }

    const opts = typeof optsOrCb === "object" ? optsOrCb : undefined;
    const callback = typeof optsOrCb === "function" ? optsOrCb : cb;

    if (callback) {
      this._getAsync(index, opts)
        .then((buf) => callback(null, buf))
        .catch((err) => callback(err));
      return;
    }

    return this._getAsync(index, opts);
  }

  private async _getAsync(index: number, opts?: { offset?: number; length?: number }): Promise<Uint8Array> {
    if (this.closed) throw new Error("Storage is closed");
    if (!this.rootDir) throw new Error("OPFS root directory not available");
    
    const fileName = `${index}.chunk`;
    
    try {
      const fileHandle = await this.rootDir.getFileHandle(fileName, { create: false });
      const file = await fileHandle.getFile();
      const arrayBuffer = await file.arrayBuffer();
      let buf = new Uint8Array(arrayBuffer);
      
      const isLastChunk = index === this.lastChunkIndex;
      const expectedLength = isLastChunk ? this.lastChunkLength : this.chunkLength;
      
      if (buf.length !== expectedLength) {
        throw new Error(`Chunk ${index} has invalid length: expected ${expectedLength}, got ${buf.length}`);
      }
      
      if (opts) {
        const offset = opts.offset || 0;
        const length = opts.length || buf.length - offset;
        buf = buf.subarray(offset, offset + length);
      }
      
      return buf;
    } catch (err: any) {
      if (err.name === "NotFoundError") {
        const error = new Error(`Chunk ${index} not found`);
        (error as any).notFound = true;
        throw error;
      }
      throw err;
    }
  }

  async put(index: number, buf: Uint8Array, cb?: (err: Error | null) => void): Promise<void> {
    const promise = this._putAsync(index, buf);
    if (cb) {
      promise.then(() => cb(null)).catch((err) => cb(err));
    }
    return promise;
  }

  private async _putAsync(index: number, buf: Uint8Array): Promise<void> {
    if (this.closed) throw new Error("Storage is closed");
    if (!this.rootDir) throw new Error("OPFS root directory not available");
    
    const isLastChunk = index === this.lastChunkIndex;
    const expectedLength = isLastChunk ? this.lastChunkLength : this.chunkLength;
    
    if (buf.length !== expectedLength) {
      throw new Error(`Invalid chunk length: expected ${expectedLength}, got ${buf.length}`);
    }
    
    const fileName = `${index}.chunk`;
    
    try {
      const fileHandle = await this.rootDir.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      
      // Cast explícito para satisfazer o Deno
      const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      await writable.write(arrayBuffer);
      await writable.close();
    } catch (err) {
      throw new Error(`Failed to write chunk ${index}: ${err}`);
    }
  }

  async close(cb?: (err: Error | null) => void): Promise<void> {
    const promise = this._closeAsync();
    if (cb) {
      promise.then(() => cb(null)).catch((err) => cb(err));
    }
    return promise;
  }

  private async _closeAsync(): Promise<void> {
    if (this.closed) throw new Error("Storage is already closed");
    this.closed = true;
    this.rootDir = null;
  }

  async destroy(cb?: (err: Error | null) => void): Promise<void> {
    const promise = this._destroyAsync();
    if (cb) {
      promise.then(() => cb(null)).catch((err) => cb(err));
    }
    return promise;
  }

  private async _destroyAsync(): Promise<void> {
    if (!this.rootDir) {
      this.closed = true;
      return;
    }
    
    try {
      for await (const entry of (this.rootDir as any).values()) {
        if (entry.kind === "file") {
          await this.rootDir.removeEntry(entry.name);
        }
      }
    } catch (err) {
      console.warn("[OPFSChunkStore] Error during destroy:", err);
    }
    
    this.closed = true;
    this.rootDir = null;
  }
}
```

---

## Arquivo: `monorepo/webtorrent/src/core/bitfield.ts`

```ts
// /loco/monorepo/webtorrent/src/core/bitfield.ts

/**
 * Estrutura de dados ultra-eficiente para rastrear o estado de peças (pieces).
 * Usa Uint8Array e operações bitwise para minimizar o uso de memória.
 */
export class Bitfield {
  private buffer: Uint8Array;
  public readonly length: number;

  constructor(length: number) {
    this.length = length;
    // Cada byte armazena 8 bits (peças). Math.ceil garante que cobrimos todas as peças.
    this.buffer = new Uint8Array(Math.ceil(length / 8));
  }

  /**
   * Verifica se a peça no índice fornecido já foi baixada/verificada.
   */
  get(index: number): boolean {
    if (index < 0 || index >= this.length) return false;
    const byteIndex = index >> 3; // Equivalente a Math.floor(index / 8)
    const bitIndex = 7 - (index & 7); // Equivalente a 7 - (index % 8)
    return (this.buffer[byteIndex]! & (1 << bitIndex)) !== 0;
  }

  /**
   * Marca a peça no índice fornecido como baixada/verificada.
   */
  set(index: number): void {
    if (index < 0 || index >= this.length) return;
    const byteIndex = index >> 3;
    const bitIndex = 7 - (index & 7);
    this.buffer[byteIndex]! |= (1 << bitIndex);
  }

  /**
   * Conta quantas peças já foram marcadas como completas.
   */
  count(): number {
    let count = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      // Conta os bits 1 em cada byte (Brian Kernighan's algorithm simplificado para 8 bits)
      let byte = this.buffer[i]!;
      while (byte) {
        byte &= byte - 1;
        count++;
      }
    }
    return count;
  }

  /**
   * Retorna uma cópia do buffer bruto (útil para serialização ou envio via Wire Protocol).
   */
  toBuffer(): Uint8Array {
    return this.buffer.slice();
  }
}
```

---

## Arquivo: `monorepo/webtorrent/src/core/torrent.ts`

```ts
// /loco/monorepo/webtorrent/src/core/torrent.ts

import { TypedEventTarget } from "../utils/event-target.ts";
import { ParsedTorrent } from "../utils/parse-torrent.ts";
import { ChunkStore } from "../storage/opfs-chunk-store.ts";
import { Bitfield } from "./bitfield.ts";
import { sha1 } from "../crypto/hasher.ts";

// ============================================================================
// TIPOS DE EVENTOS
// ============================================================================

export interface TorrentEvents {
  ready: Event;
  download: CustomEvent<{ bytes: number }>;
  upload: CustomEvent<{ bytes: number }>;
  done: Event;
  error: CustomEvent<{ error: Error }>;
  verified: CustomEvent<{ index: number }>;
}

export interface TorrentOptions {
  store: ChunkStore;
  skipVerify?: boolean; // Pula a verificação de peças existentes no store (útil para downloads novos)
}

// ============================================================================
// CLASSE TORRENT
// ============================================================================

/**
 * O "cérebro" do download. Orquestra o estado das peças, validação criptográfica
 * e persistência via ChunkStore.
 */
export class Torrent extends TypedEventTarget<TorrentEvents> {
  public readonly infoHash: string;
  public readonly name: string;
  public readonly pieceLength: number;
  public readonly length: number;
  public readonly files: ParsedTorrent["files"];
  
  private parsedTorrent: ParsedTorrent;
  private store: ChunkStore;
  private bitfield: Bitfield;
  private expectedPieces: Uint8Array[]; // Hashes SHA-1 esperados para cada peça
  
  private _downloaded: number = 0;
  private _uploaded: number = 0;
  private _destroyed: boolean = false;
  private _ready: boolean = false;

  constructor(parsedTorrent: ParsedTorrent, opts: TorrentOptions) {
    super();
    this.parsedTorrent = parsedTorrent;
    this.store = opts.store;
    
    this.infoHash = parsedTorrent.infoHash;
    this.name = parsedTorrent.name || "Unknown";
    this.pieceLength = parsedTorrent.pieceLength;
    this.length = parsedTorrent.length;
    this.files = parsedTorrent.files;
    
    this.bitfield = new Bitfield(parsedTorrent.pieces.length);
    this.expectedPieces = parsedTorrent.pieces;
    
    // Inicializa o estado
    this._init(opts.skipVerify || false).catch((err) => {
      this._onError(err instanceof Error ? err : new Error(String(err)));
    });
  }

  // ==========================================================================
  // GETTERS COMPUTADOS (Propriedades em tempo real)
  // ==========================================================================

  get ready(): boolean {
    return this._ready;
  }

  get destroyed(): boolean {
    return this._destroyed;
  }

  get downloaded(): number {
    return this._downloaded;
  }

  get uploaded(): number {
    return this._uploaded;
  }

  get progress(): number {
    if (this.length === 0) return 0;
    return this._downloaded / this.length;
  }

  get numPieces(): number {
    return this.expectedPieces.length;
  }

  get lastPieceLength(): number {
    return this.length % this.pieceLength || this.pieceLength;
  }

  // ==========================================================================
  // CICLO DE VIDA E INICIALIZAÇÃO
  // ==========================================================================

  private async _init(skipVerify: boolean): Promise<void> {
    try {
      if (!skipVerify) {
        await this._verifyExistingPieces();
      }
      this._ready = true;
      this.emit("ready");
    } catch (err) {
      this._onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Verifica peças que já podem existir no ChunkStore (ex: retomada de download via OPFS).
   */
  private async _verifyExistingPieces(): Promise<void> {
    for (let i = 0; i < this.numPieces; i++) {
      try {
        const opts = i === this.numPieces - 1 ? { length: this.lastPieceLength } : undefined;
        const buf = await this.store.get(i, opts);
        await this._verifyPiece(i, buf);
      } catch (err: any) {
        // Se a peça não existe no store (notFound), apenas ignoramos e seguimos.
        if (!err.notFound) {
          console.warn(`[Torrent] Erro ao verificar peça ${i}:`, err);
        }
      }
    }
  }

  // ==========================================================================
  // API PÚBLICA (Recebimento e Persistência de Dados)
  // ==========================================================================

  /**
   * Recebe um chunk de dados de um peer/webseed, valida e persiste no store.
   * Este é o método que o módulo de Rede (Wire/Peer) chamará ao receber dados.
   */
  public async receivePiece(index: number, buf: Uint8Array): Promise<boolean> {
    if (this._destroyed) return false;
    if (this.bitfield.get(index)) return true; // Já temos essa peça

    try {
      // 1. Validação Criptográfica (SHA-1)
      await this._verifyPiece(index, buf);

      // 2. Persistência no ChunkStore
      await this.store.put(index, buf);

      // 3. Atualização de Estado
      this.bitfield.set(index);
      const pieceLength = index === this.numPieces - 1 ? this.lastPieceLength : this.pieceLength;
      this._downloaded += pieceLength;

      // 4. Notificação
      this.emit("verified", new CustomEvent("verified", { detail: { index } }));
      this.emit("download", new CustomEvent("download", { detail: { bytes: pieceLength } }));

      if (this.progress >= 1) {
        this.emit("done");
      }

      return true;
    } catch (err) {
      // Peça inválida ou corrompida. O módulo de rede deve desconectar o peer que a enviou.
      console.warn(`[Torrent] Peça ${index} rejeitada (hash inválido).`);
      return false;
    }
  }

  /**
   * Lê uma peça do ChunkStore (útil para uploading para outros peers ou streaming).
   */
  public async getPiece(index: number): Promise<Uint8Array | null> {
    if (!this.bitfield.get(index)) return null;
    try {
      const opts = index === this.numPieces - 1 ? { length: this.lastPieceLength } : undefined;
      return await this.store.get(index, opts);
    } catch (err) {
      return null;
    }
  }

  /**
   * Destrói o torrent, fechando o store e liberando recursos.
   */
  public async destroy(destroyStore: boolean = false): Promise<void> {
    if (this._destroyed) return;
    this._destroyed = true;
    
    try {
      if (destroyStore) {
        await this.store.destroy();
      } else {
        await this.store.close();
      }
    } catch (err) {
      console.warn("[Torrent] Erro ao fechar store:", err);
    }
  }

  // ==========================================================================
  // MÉTODOS PRIVADOS (Validação e Erros)
  // ==========================================================================

  private async _verifyPiece(index: number, buf: Uint8Array): Promise<void> {
    const expectedHashBuffer = this.expectedPieces[index];
    if (!expectedHashBuffer) {
      throw new Error(`Índice de peça ${index} fora do limite.`);
    }

    // Calcula o SHA-1 do buffer recebido
    const actualHashHex = await sha1(buf);
    
    // Converte o hash esperado (Uint8Array de 20 bytes) para hex para comparação
    const expectedHashHex = Array.from(expectedHashBuffer)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (actualHashHex !== expectedHashHex) {
      throw new Error(`Hash mismatch na peça ${index}.`);
    }
  }

  private _onError(err: Error): void {
    this.emit("error", new CustomEvent("error", { detail: { error: err } }));
  }
}
```

---

## Arquivo: `monorepo/webtorrent/deno.jsonc`

```json
{
    "name": "@loco/webtorrent",
  "version": "0.1.0",
  "exports": "./src/mod.ts",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "lib": ["dom", "dom.iterable", "dom.asynciterable", "deno.ns", "deno.unstable"],
    "strict": true
  },
  "imports": {
    "preact": "https://esm.sh/preact@10.29.7",
    "preact/": "https://esm.sh/preact@10.29.7/",
    "preact/jsx-runtime": "https://esm.sh/preact@10.29.7/jsx-runtime",
    "@preact/signals": "https://esm.sh/@preact/signals@1.3.1?deps=preact@10.29.7",
    "@std/fs": "jsr:@std/fs",
    "@std/path": "jsr:@std/path",
    "@std/http": "jsr:@std/http",
  },
  "tasks": {
    "test": "deno test -A tests/",
    "example": "deno run -A --watch example/main.ts",
    "check": "deno check src/**/*.ts"
  }
}
```

---

## Arquivo: `monorepo/webtorrent/tests/utils_test.ts`

```ts
// /loco/monorepo/webtorrent/tests/utils_test.ts
import { assertEquals, assertThrows } from "jsr:@std/assert";
import {
  alloc,
  concat,
  equals,
  from,
  readUInt32BE,
  toString,
  writeUInt32BE,
} from "../src/utils/buffer.ts";
import { sha1 } from "../src/crypto/hasher.ts";
import { generateId, randomBytes } from "../src/crypto/random.ts";

Deno.test("buffer: alloc creates zero-filled array", () => {
  const buf = alloc(10);
  assertEquals(buf.length, 10);
  assertEquals(buf[0], 0);
  assertEquals(buf[9], 0);
});

Deno.test("buffer: from hex string", () => {
  const buf = from("48656c6c6f", "hex");
  assertEquals(toString(buf, "utf8"), "Hello");
});

Deno.test("buffer: from utf8 string", () => {
  const buf = from("Hello");
  assertEquals(toString(buf, "hex"), "48656c6c6f");
});

Deno.test("buffer: concat arrays", () => {
  const a = from("0102", "hex");
  const b = from("0304", "hex");
  const c = concat([a, b]);
  assertEquals(toString(c, "hex"), "01020304");
});

Deno.test("buffer: read/write UInt32BE", () => {
  const buf = alloc(4);
  writeUInt32BE(buf, 0x12345678, 0);
  assertEquals(readUInt32BE(buf, 0), 0x12345678);
});

Deno.test("crypto: sha1 hash", async () => {
  const data = from("hello world");
  const hash = await sha1(data);
  assertEquals(hash, "2aae6c35c94fcfb415dbe95f408b9ce91ee846ed");
});

Deno.test("crypto: randomBytes generates correct length", () => {
  const bytes = randomBytes(32);
  assertEquals(bytes.length, 32);
});

Deno.test("crypto: generateId returns 40 char hex string", () => {
  const id = generateId();
  assertEquals(id.length, 40);
  assertEquals(/^[0-9a-f]{40}$/.test(id), true);
});
```

---

## Arquivo: `monorepo/webtorrent/tests/magnet_test.ts`

```ts
// /loco/monorepo/webtorrent/tests/magnet_test.ts

import { assertEquals, assertThrows } from "jsr:@std/assert";
import { parseMagnet, encodeMagnet } from "../src/utils/magnet.ts";

Deno.test("magnet: parse simple hex infoHash", () => {
  const uri = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel";
  const parsed = parseMagnet(uri);
  
  assertEquals(parsed.infoHash, "08ada5a7a6183aae1e09d831df6748d566095a10");
  assertEquals(parsed.infoHashBuffer.length, 20);
  assertEquals(parsed.name, "Sintel");
  assertEquals(parsed.trackers.length, 0);
});

Deno.test("magnet: parse with multiple trackers", () => {
  const uri = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&tr=udp%3A%2F%2Ftracker.example.com%3A6969&tr=wss%3A%2F%2Ftracker.btorrent.xyz";
  const parsed = parseMagnet(uri);
  
  assertEquals(parsed.trackers.length, 2);
  assertEquals(parsed.trackers[0], "udp://tracker.example.com:6969");
  assertEquals(parsed.trackers[1], "wss://tracker.btorrent.xyz");
});

Deno.test("magnet: parse base32 infoHash", () => {
  // Base32 encoding of 20 zero bytes = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" (32 chars)
  const uri = "magnet:?xt=urn:btih:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const parsed = parseMagnet(uri);
  
  assertEquals(parsed.infoHash, "0000000000000000000000000000000000000000");
  assertEquals(parsed.infoHashBuffer.length, 20);
});

Deno.test("magnet: parse web seeds and peers", () => {
  const uri = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F&x.pe=192.168.1.1%3A6881";
  const parsed = parseMagnet(uri);
  
  assertEquals(parsed.webSeeds.length, 1);
  assertEquals(parsed.webSeeds[0], "https://webtorrent.io/torrents/");
  assertEquals(parsed.peerAddresses.length, 1);
  assertEquals(parsed.peerAddresses[0], "192.168.1.1:6881");
});

Deno.test("magnet: parse torrent file URL (xs)", () => {
  const uri = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&xs=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2Fsintel.torrent";
  const parsed = parseMagnet(uri);
  
  assertEquals(parsed.torrentFileUrl, "https://webtorrent.io/torrents/sintel.torrent");
});

Deno.test("magnet: throws on invalid URI", () => {
  assertThrows(
    () => parseMagnet("http://example.com"),
    Error,
    "must start with 'magnet:?'"
  );
});

Deno.test("magnet: throws on missing infoHash", () => {
  assertThrows(
    () => parseMagnet("magnet:?dn=Test"),
    Error,
    "Missing 'xt' parameter"
  );
});

Deno.test("magnet: throws on invalid infoHash length", () => {
  assertThrows(
    () => parseMagnet("magnet:?xt=urn:btih:12345"),
    Error,
    "Invalid infoHash format"
  );
});

Deno.test("magnet: encode and decode roundtrip", () => {
  const original = {
    infoHash: "08ada5a7a6183aae1e09d831df6748d566095a10",
    infoHashBuffer: new Uint8Array(20),
    name: "Sintel",
    trackers: ["udp://tracker.example.com:6969", "wss://tracker.btorrent.xyz"],
    webSeeds: ["https://webtorrent.io/torrents/"],
    peerAddresses: [],
    torrentFileUrl: "https://webtorrent.io/torrents/sintel.torrent",
  };
  
  const encoded = encodeMagnet(original);
  const decoded = parseMagnet(encoded);
  
  assertEquals(decoded.infoHash, original.infoHash);
  assertEquals(decoded.name, original.name);
  assertEquals(decoded.trackers, original.trackers);
  assertEquals(decoded.webSeeds, original.webSeeds);
  assertEquals(decoded.torrentFileUrl, original.torrentFileUrl);
});
```

---

## Arquivo: `monorepo/webtorrent/tests/chunk-store_test.ts`

```ts
// /loco/monorepo/webtorrent/tests/chunk-store_test.ts

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { MemoryChunkStore } from "../src/storage/memory-chunk-store.ts";

Deno.test("chunk-store: put and get chunk", async () => {
  const store = new MemoryChunkStore({ chunkLength: 1024 });
  const chunk = new Uint8Array(1024).fill(42);
  
  await store.put(0, chunk);
  const retrieved = await store.get(0);
  
  assertEquals(retrieved.length, 1024);
  assertEquals(retrieved[0], 42);
  assertEquals(retrieved[1023], 42);
});

Deno.test("chunk-store: get with offset and length", async () => {
  const store = new MemoryChunkStore({ chunkLength: 1024 });
  const chunk = new Uint8Array(1024);
  for (let i = 0; i < 1024; i++) chunk[i] = i % 256;
  
  await store.put(0, chunk);
  const sliced = await store.get(0, { offset: 100, length: 50 });
  
  assertEquals(sliced.length, 50);
  assertEquals(sliced[0], 100);
  assertEquals(sliced[49], 149);
});

Deno.test("chunk-store: throws on invalid chunk length", async () => {
  const store = new MemoryChunkStore({ chunkLength: 1024 });
  const invalidChunk = new Uint8Array(512);
  
  await assertRejects(
    async () => await store.put(0, invalidChunk),
    Error,
    "Invalid chunk length"
  );
});

Deno.test("chunk-store: throws on chunk not found", async () => {
  const store = new MemoryChunkStore({ chunkLength: 1024 });
  
  await assertRejects(
    async () => await store.get(999),
    Error,
    "not found"
  );
});

Deno.test("chunk-store: handles last chunk with different length", async () => {
  const store = new MemoryChunkStore({ chunkLength: 1024, length: 2500 });
  
  const chunk0 = new Uint8Array(1024).fill(1);
  const chunk1 = new Uint8Array(1024).fill(2);
  const chunk2 = new Uint8Array(452).fill(3); 
  
  await store.put(0, chunk0);
  await store.put(1, chunk1);
  await store.put(2, chunk2);
  
  const retrieved2 = await store.get(2);
  assertEquals(retrieved2.length, 452);
  assertEquals(retrieved2[0], 3);
});

Deno.test("chunk-store: close prevents further operations", async () => {
  const store = new MemoryChunkStore({ chunkLength: 1024 });
  await store.close();
  
  await assertRejects(
    async () => await store.put(0, new Uint8Array(1024)),
    Error,
    "closed"
  );
});

Deno.test("chunk-store: destroy clears all chunks", async () => {
  const store = new MemoryChunkStore({ chunkLength: 1024 });
  await store.put(0, new Uint8Array(1024));
  await store.destroy();
  
  await assertRejects(
    async () => await store.get(0),
    Error,
    "closed"
  );
});
```

---

## Arquivo: `monorepo/webtorrent/tests/parse-torrent_test.ts`

```ts
// /loco/monorepo/webtorrent/tests/parse-torrent_test.ts

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { parseTorrent, ParsedTorrent } from "../src/utils/parse-torrent.ts";
import { encode, BencodeValue } from "../src/utils/bencode.ts";

const TEXT_ENCODER = new TextEncoder();

// Helper para criar um .torrent falso em memória
function createFakeTorrentBuffer(isMultiFile = false): Uint8Array {
  const pieces = new Uint8Array(40); // 2 peças de 20 bytes cada
  
  const info: Record<string, BencodeValue> = {
    "piece length": 16384,
    pieces,
  };

  if (isMultiFile) {
    info["files"] = [
      { length: 1000, path: [TEXT_ENCODER.encode("folder"), TEXT_ENCODER.encode("file1.txt")] },
      { length: 2000, path: [TEXT_ENCODER.encode("folder"), TEXT_ENCODER.encode("file2.txt")] },
    ];
    info["name"] = TEXT_ENCODER.encode("my-multi-file-torrent");
  } else {
    info["length"] = 5000;
    info["name"] = TEXT_ENCODER.encode("single-file.mp4");
  }

  const torrentObj: Record<string, BencodeValue> = {
    info,
    announce: TEXT_ENCODER.encode("udp://tracker.example.com:6969"),
    "announce-list": [
      [TEXT_ENCODER.encode("udp://tracker.example.com:6969")],
      [TEXT_ENCODER.encode("wss://tracker.btorrent.xyz")],
    ],
    "url-list": [TEXT_ENCODER.encode("https://webtorrent.io/torrents/")],
    comment: TEXT_ENCODER.encode("Test torrent"),
    "created by": TEXT_ENCODER.encode("Loco WebTorrent"),
  };

  return encode(torrentObj);
}

Deno.test("parse-torrent: parse single-file .torrent buffer", async () => {
  const buffer = createFakeTorrentBuffer(false);
  const parsed = await parseTorrent(buffer);

  assertEquals(parsed.files.length, 1);
  assertEquals(parsed.files[0]!.name, "single-file.mp4");
  assertEquals(parsed.files[0]!.length, 5000);
  assertEquals(parsed.length, 5000);
  assertEquals(parsed.pieceLength, 16384);
  assertEquals(parsed.pieces.length, 2); // 40 bytes / 20 bytes por peça
  assertEquals(parsed.announce.length, 2); // deduplicado
  assertEquals(parsed.urlList.length, 1);
  assertEquals(parsed.comment, "Test torrent");
  assertEquals(parsed.infoHash.length, 40);
});

Deno.test("parse-torrent: parse multi-file .torrent buffer", async () => {
  const buffer = createFakeTorrentBuffer(true);
  const parsed = await parseTorrent(buffer);

  assertEquals(parsed.files.length, 2);
  assertEquals(parsed.files[0]!.path, "folder/file1.txt");
  assertEquals(parsed.files[0]!.offset, 0);
  assertEquals(parsed.files[1]!.path, "folder/file2.txt");
  assertEquals(parsed.files[1]!.offset, 1000);
  assertEquals(parsed.length, 3000);
  assertEquals(parsed.name, "my-multi-file-torrent");
});

Deno.test("parse-torrent: parse magnet URI", async () => {
  const magnet = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=udp%3A%2F%2Ftracker.example.com";
  const parsed = await parseTorrent(magnet);

  assertEquals(parsed.infoHash, "08ada5a7a6183aae1e09d831df6748d566095a10");
  assertEquals(parsed.name, "Sintel");
  assertEquals(parsed.announce.length, 1);
  assertEquals(parsed.files.length, 0); // Magnet não tem arquivos até baixar metadados
  assertEquals(parsed.length, 0);
});

Deno.test("parse-torrent: parse raw infoHash string", async () => {
  const parsed = await parseTorrent("08ada5a7a6183aae1e09d831df6748d566095a10");
  assertEquals(parsed.infoHash, "08ada5a7a6183aae1e09d831df6748d566095a10");
});

Deno.test("parse-torrent: throws on invalid input", async () => {
  await assertRejects(
    () => parseTorrent("invalid-string"),
    Error,
    "Invalid torrent identifier"
  );
});

Deno.test("parse-torrent: returns same object if already parsed", async () => {
  const original: ParsedTorrent = {
    infoHash: "08ada5a7a6183aae1e09d831df6748d566095a10",
    infoHashBuffer: new Uint8Array(20),
    announce: [],
    urlList: [],
    peerAddresses: [],
    files: [],
    length: 0,
    pieceLength: 0,
    pieces: [],
    info: {},
    magnetURI: "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10",
  };
  
  const result = await parseTorrent(original);
  assertEquals(result, original);
});
```

---

## Arquivo: `monorepo/webtorrent/tests/bencode_test.ts`

```ts
// /loco/monorepo/webtorrent/tests/bencode_test.ts

import { assertEquals, assertThrows } from "jsr:@std/assert";
import { decode, encode, BencodeValue } from "../src/utils/bencode.ts";

const strToBytes = (str: string) => new TextEncoder().encode(str);
const bytesToStr = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

Deno.test("bencode: decode integer", () => {
  const data = strToBytes("i42e");
  assertEquals(decode(data), 42);
});

Deno.test("bencode: decode negative integer", () => {
  const data = strToBytes("i-42e");
  assertEquals(decode(data), -42);
});

Deno.test("bencode: decode string", () => {
  const data = strToBytes("5:hello");
  const result = decode(data);
  assertEquals(typeof result, "string");
  assertEquals(result, "hello");
});

Deno.test("bencode: decode list", () => {
  const data = strToBytes("l4:spami42ee");
  const result = decode(data) as BencodeValue[];
  assertEquals(result[0], "spam");
  assertEquals(result[1], 42);
});

Deno.test("bencode: decode dictionary", () => {
  const data = strToBytes("d3:cow3:moo4:spam4:eggse");
  const result = decode(data) as Record<string, BencodeValue>;
  assertEquals(result["cow"], "moo");
  assertEquals(result["spam"], "eggs");
});

Deno.test("bencode: encode integer", () => {
  const result = encode(42);
  assertEquals(bytesToStr(result), "i42e");
});

Deno.test("bencode: encode string", () => {
  const result = encode("hello");
  assertEquals(bytesToStr(result), "5:hello");
});

Deno.test("bencode: encode list", () => {
  const result = encode(["spam", 42]);
  assertEquals(bytesToStr(result), "l4:spami42ee");
});

Deno.test("bencode: encode dictionary with sorted keys", () => {
  const data: BencodeValue = {
    z: "Z",
    a: "A",
    m: "M",
  };
  const result = encode(data);
  assertEquals(bytesToStr(result), "d1:a1:A1:m1:M1:z1:Ze");
});

Deno.test("bencode: roundtrip complex torrent metadata", () => {
  const original: BencodeValue = {
    announce: "udp://tracker.example.com:80",
    info: {
      name: "ubuntu-22.04.iso",
      length: 1024,
      "piece length": 16384,
      pieces: new Uint8Array([0, 1, 2, 3, 4]),
    },
  };

  const encoded = encode(original);
  const decoded = decode(encoded) as Record<string, BencodeValue>;
  const decodedInfo = decoded["info"] as Record<string, BencodeValue>;

  assertEquals(decoded["announce"], "udp://tracker.example.com:80");
  assertEquals(decodedInfo["name"], "ubuntu-22.04.iso");
  assertEquals(decodedInfo["length"], 1024);
  assertEquals(decodedInfo["piece length"], 16384);
  
  const pieces = decodedInfo["pieces"] as Uint8Array;
  assertEquals(pieces.length, 5);
  assertEquals(pieces[0], 0);
  assertEquals(pieces[4], 4);
});

Deno.test("bencode: encode and decode bigint", () => {
  const bigNum = 9007199254740991234n;
  const encoded = encode(bigNum);
  const decoded = decode(encoded);
  assertEquals(decoded, bigNum);
});
```

---

## Arquivo: `monorepo/webtorrent/tests/torrent_test.ts`

```ts
// /loco/monorepo/webtorrent/tests/torrent_test.ts

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { Torrent } from "../src/core/torrent.ts";
import { MemoryChunkStore } from "../src/storage/memory-chunk-store.ts";
import { sha1 } from "../src/crypto/hasher.ts";
import { ParsedTorrent } from "../src/utils/parse-torrent.ts";

// Helper para criar um ParsedTorrent fake com peças reais
async function createFakeParsedTorrent(): Promise<ParsedTorrent> {
  const pieceLength = 1024;
  const piece1 = new Uint8Array(pieceLength).fill(1);
  const piece2 = new Uint8Array(pieceLength).fill(2);
  
  const hash1Hex = await sha1(piece1);
  const hash2Hex = await sha1(piece2);
  
  const hashToBytes = (hex: string) => {
    const bytes = new Uint8Array(20);
    for (let i = 0; i < 20; i++) {
      bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  };

  return {
    infoHash: "0".repeat(40),
    infoHashBuffer: new Uint8Array(20),
    name: "Fake Torrent",
    announce: [],
    urlList: [],
    peerAddresses: [],
    files: [{ path: "fake.bin", name: "fake.bin", length: 2048, offset: 0 }],
    length: 2048,
    pieceLength,
    pieces: [hashToBytes(hash1Hex), hashToBytes(hash2Hex)],
    info: {},
    magnetURI: "",
  };
}

Deno.test("torrent: initializes and emits 'ready'", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => {
    torrent.on("ready", () => resolve());
  });

  assertEquals(torrent.ready, true);
  assertEquals(torrent.progress, 0);
  assertEquals(torrent.numPieces, 2);
});

Deno.test("torrent: receives valid piece, updates bitfield and emits events", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  const validPiece = new Uint8Array(parsed.pieceLength).fill(1);
  
  let downloadedBytes = 0;
  let verifiedIndex = -1;
  
  torrent.on("download", (e) => { downloadedBytes += e.detail.bytes; });
  torrent.on("verified", (e) => { verifiedIndex = e.detail.index; });

  const success = await torrent.receivePiece(0, validPiece);

  assertEquals(success, true);
  assertEquals(downloadedBytes, parsed.pieceLength);
  assertEquals(verifiedIndex, 0);
  assertEquals(torrent.progress, 0.5); // 1 de 2 peças
});

Deno.test("torrent: rejects piece with invalid hash", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  const invalidPiece = new Uint8Array(parsed.pieceLength).fill(99); // Dados errados
  
  const success = await torrent.receivePiece(0, invalidPiece);

  assertEquals(success, false);
  assertEquals(torrent.progress, 0); // Não deve ter mudado
});

Deno.test("torrent: emits 'done' when all pieces are received", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  const piece1 = new Uint8Array(parsed.pieceLength).fill(1);
  const piece2 = new Uint8Array(parsed.pieceLength).fill(2);

  let doneEmitted = false;
  torrent.on("done", () => { doneEmitted = true; });

  await torrent.receivePiece(0, piece1);
  assertEquals(doneEmitted, false);
  
  await torrent.receivePiece(1, piece2);
  assertEquals(doneEmitted, true);
  assertEquals(torrent.progress, 1);
});

Deno.test("torrent: skips verification of existing pieces if skipVerify is true", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  
  // Coloca dados inválidos no store diretamente
  const invalidPiece = new Uint8Array(parsed.pieceLength).fill(99);
  await store.put(0, invalidPiece);

  const torrent = new Torrent(parsed, { store, skipVerify: true });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  // O bitfield não deve ter a peça 0 marcada, pois pulamos a verificação
  assertEquals(torrent.progress, 0);
});
```

---

## Arquivo: `monorepo/webtorrent/docs/01-objetivo-e-apis-nativas.md`

```md
# /loco/monorepo/webtorrent/docs/01-objetivo-e-apis-nativas.md

# Objetivo do Pacote `@loco/webtorrent` e Mapeamento de APIs Nativas

## 🎯 Objetivo do Projeto
O objetivo do pacote `@loco/webtorrent` é fornecer uma implementação **pura, estritamente tipada e livre de dependências do Node.js** do protocolo BitTorrent, projetada especificamente para rodar no ambiente de navegador (Browser/Deno). 

No contexto do **Loco PWA** (mensageiro descentralizado, offline-first e E2EE), este pacote permite:
1. **Compartilhamento descentralizado de arquivos** (ex: mídias, backups de chat) sem depender de servidores centrais de armazenamento.
2. **Streaming progressivo** de arquivos diretamente no browser, utilizando APIs nativas de mídia.
3. **Redução drástica do bundle size**, eliminando polyfills pesados como `Buffer`, `readable-stream`, `crypto-browserify` e `fs`.
4. **Persistência real offline** através do Origin Private File System (OPFS), permitindo que torrents sejam pausados e retomados entre sessões do navegador.

---

## 🌐 Mapeamento de APIs do Browser (Target & Restrictions)

Abaixo está a lista exaustiva das APIs nativas do browser que este pacote utiliza ou planeja utilizar, substituindo equivalentes do Node.js.

### 🔐 1. Criptografia e Segurança (WebCrypto API)
| API Nativa | Substitui (Node.js) | Uso no Projeto | Status |
| :--- | :--- | :--- | :--- |
| `crypto.subtle.digest()` | `crypto` (Node), `rusha`, `simple-sha1` | Cálculo de hashes SHA-1 (peças) e SHA-256 (infoHash v2). | ✅ **Implementado** |
| `crypto.getRandomValues()` | `randombytes`, `crypto.randomBytes` | Geração de `peerId`, `nodeId` e nonces criptográficos. | ✅ **Implementado** |

### 💾 2. Armazenamento e Persistência (Offline-First)
| API Nativa | Substitui (Node.js) | Uso no Projeto | Status |
| :--- | :--- | :--- | :--- |
| `Origin Private File System (OPFS)` | `fs`, `fs-chunk-store` | Armazenamento persistente de chunks de torrent isolados por `infoHash`. | ✅ **Implementado** |
| `IndexedDB` | N/A (ou `memory-chunk-store`) | Fallback de armazenamento ou metadados de sessão (planejado). | 🟡 Fallback em Memória |
| `navigator.storage.getDirectory()` | `path.join`, `os.tmpdir` | Obtenção da raiz do sistema de arquivos virtual do navegador. | ✅ **Implementado** |

### 📦 3. Manipulação de Dados Binários
| API Nativa | Substitui (Node.js) | Uso no Projeto | Status |
| :--- | :--- | :--- | :--- |
| `Uint8Array` / `DataView` | `Buffer` do Node.js | Manipulação de todos os dados binários (bencode, peças, hashes). | ✅ **Implementado** |
| `TextEncoder` / `TextDecoder` | `Buffer.toString()`, `Buffer.from()` | Conversão segura entre strings UTF-8 e bytes brutos. | ✅ **Implementado** |
| `ArrayBuffer.slice()` | N/A | Criação de cópias contíguas de buffers para satisfazer o type-checking rigoroso do Deno em APIs como WebCrypto e OPFS. | ✅ **Implementado** |

### 🌊 4. Streams e Processamento
| API Nativa | Substitui (Node.js) | Uso no Projeto | Status |
| :--- | :--- | :--- | :--- |
| `ReadableStream` / `WritableStream` | `readable-stream`, `stream` | Pipeline de dados para streaming de mídia e escrita em OPFS. | 🟡 Parcial (Chunk Store) |
| `Web Workers` | `worker_threads` | (Planejado) Cálculo de hashes em background para não bloquear a UI. | 🔜 Futuro |

### 📡 5. Rede e Comunicação
| API Nativa | Substitui (Node.js) | Uso no Projeto | Status |
| :--- | :--- | :--- | :--- |
| `RTCPeerConnection` / `RTCDataChannel` | `net`, `utp` | Transporte P2P de dados (WebTorrent no browser só suporta WebRTC). | 🔜 Núcleo (Wire/Peer) |
| `WebSocket` | `ws` | Conexão com trackers WebSocket (`wss://`). | 🔜 Núcleo (Tracker) |
| `fetch()` / `AbortController` | `http`, `https`, `simple-get` | Download de metadados via Web Seeds e requisições HTTP a trackers. | ✅ Parcial (Parse Torrent) |

### ⚠️ APIs Proibidas / Não Suportadas no Browser
- **TCP / uTP Sockets:** O navegador não permite conexões TCP brutas. O transporte será estritamente WebRTC (e WebSockets para trackers).
- **DHT (UDP):** A implementação completa de DHT via UDP não é possível no browser. Dependeremos de Trackers (HTTP/WS) e WebRTC Peer Exchange (ut_pex).
- **File System Access API (com path real):** Por questões de segurança, o browser não permite acesso arbitrário ao disco do usuário. Usamos exclusivamente o **OPFS** (sandboxed).

---

## 🏗️ Decisões Arquiteturais Chave
1. **Strict TypeScript (`noUncheckedIndexedAccess`):** O projeto é compilado com as flags mais rigorosas do Deno. Isso nos forçou a usar asserções de não-nulo (`!`) de forma consciente e a tratar `undefined` explicitamente, aumentando a robustez.
2. **Zero Polyfills:** Em vez de importar `buffer` ou `stream` do npm, criamos utilitários leves (`src/utils/buffer.ts`) que imitam apenas a superfície da API do `Buffer` que o protocolo BitTorrent realmente precisa, usando `Uint8Array` por baixo dos panos.
3. **Heurística de Decodificação Bencode:** O decoder Bencode foi aprimorado para distinguir automaticamente entre strings de texto legíveis (UTF-8) e dados binários brutos (como hashes SHA-1 de peças), retornando `string` ou `Uint8Array` conforme apropriado.
```

---

## Arquivo: `monorepo/webtorrent/docs/02-modulos-e-funcoes-implementadas.md`

```md
# /loco/monorepo/webtorrent/docs/02-modulos-e-funcoes-implementadas.md

# Módulos e Funções Implementadas (Fase 1 e 2)

Este documento cataloga todas as funções, classes e tipos que foram implementados, refatorados e validados por testes unitários no pacote `@loco/webtorrent`.

---

## 🛠️ 1. Utilitários Básicos (`src/utils/`)

### `buffer.ts`
Helpers para manipulação de `Uint8Array`, substituindo o `Buffer` do Node.js com foco em performance e compatibilidade com o protocolo BitTorrent.
- `alloc(size: number): Uint8Array` - Cria um array preenchido com zeros.
- `from(input, encoding): Uint8Array` - Cria um array a partir de string (hex/utf8), array ou ArrayBuffer.
- `concat(arrays, totalLength?): Uint8Array` - Concatena múltiplos arrays de forma eficiente (calculando o tamanho total antes da alocação).
- `toString(buf, encoding, start, end): string` - Converte fatias do buffer para string hex ou utf8.
- `equals(a, b): boolean` - Comparação byte a byte de dois buffers.
- `readUInt32BE(buf, offset): number` - Leitura de inteiro sem sinal de 32 bits (Big-Endian), essencial para o Wire Protocol.
- `writeUInt32BE(buf, value, offset): void` - Escrita de inteiro sem sinal de 32 bits (Big-Endian).

### `event-target.ts`
Substituto tipado para o `EventEmitter` do Node.js, utilizando a API nativa `EventTarget` do browser.
- `class TypedEventTarget<Events>` - Classe base genérica.
  - `on(type, listener)` - Registra um listener.
  - `once(type, listener)` - Registra um listener que se remove após a primeira execução.
  - `off(type, listener)` - Remove um listener.
  - `emit(type, detail?)` - Dispara um evento com dados tipados.

---

## 🔐 2. Criptografia (`src/crypto/`)

### `hasher.ts`
Wrapper para a API nativa `crypto.subtle` do browser/Deno.
- `sha1(data: Uint8Array): Promise<string>` - Calcula o hash SHA-1 (usado para verificação de peças e infoHash v1). *Nota: Utiliza `.slice()` no buffer para satisfazer a tipagem estrita de `ArrayBuffer` do Deno.*
- `sha256(data: Uint8Array): Promise<string>` - Calcula o hash SHA-256 (para infoHash v2 e extensões futuras).
- `sha1Sync(data: Uint8Array): string` - Lança erro intencionalmente, pois WebCrypto é assíncrono no browser.

### `random.ts`
Geração de números aleatórios criptograficamente seguros.
- `randomBytes(size: number): Uint8Array` - Gera um array de bytes aleatórios.
- `generateId(): string` - Gera um ID de 40 caracteres hexadecimais (usado para `peerId` ou `nodeId`).

---

## 📦 3. Protocolo e Parsing (`src/utils/`)

### `bencode.ts`
Implementação pura de Bencode (Encoder/Decoder) com suporte a tipos recursivos e BigInt.
- **Tipos:** `BencodeValue` (string | number | bigint | Uint8Array | BencodeList | BencodeDict).
- `decode(data: Uint8Array): BencodeValue` - Parser de descida recursiva (Zero-Copy via `subarray`). Inclui heurística para retornar `string` (se for UTF-8 válido) ou `Uint8Array` (se contiver bytes binários como hashes).
- `encode(data: BencodeValue): Uint8Array` - Codificador que **garante a ordenação lexicográfica das chaves dos dicionários**, requisito crítico para que o `info_hash` do torrent seja consistente.

### `magnet.ts`
Parser e codificador de URIs Magnéticas.
- `parseMagnet(uri: string): ParsedMagnet` - Extrai `infoHash` (hex e buffer), `trackers`, `webSeeds`, `name`, etc. Suporta decodificação nativa de Base32 para Hex sem dependências externas.
- `encodeMagnet(parsed: Omit<ParsedMagnet, "magnetUri">): string` - Reconstrói a URI magnética a partir de um objeto.

### `parse-torrent.ts`
Parser unificado que aceita múltiplos formatos de entrada e retorna uma estrutura padronizada.
- `parseTorrent(torrentId: string | Uint8Array | ParsedTorrent): Promise<ParsedTorrent>`
  - Se for `string` (Magnet ou InfoHash): Retorna metadados básicos (arquivos desconhecidos até o handshake).
  - Se for `Uint8Array` (Arquivo .torrent): Decodifica o Bencode, calcula o `infoHash` via SHA-1 do dicionário `info`, e extrai a lista de arquivos, tamanhos, offsets e trackers.

---

## 💾 4. Armazenamento (Chunk Stores) (`src/storage/`)

Implementam a interface compatível com `abstract-chunk-store`, permitindo troca transparente entre memória e disco.

### `memory-chunk-store.ts`
Fallback em memória para ambientes onde o OPFS não está disponível ou para testes.
- `class MemoryChunkStore`
  - `get(index, opts?, cb?)` - Recupera um chunk. Suporta `offset` e `length` para fatiamento.
  - `put(index, buf, cb?)` - Armazena um chunk, validando o tamanho esperado.
  - `close(cb?)` / `destroy(cb?)` - Limpa o mapa de chunks da memória.

### `opfs-chunk-store.ts`
Armazenamento persistente utilizando o **Origin Private File System (OPFS)** do navegador.
- `class OPFSChunkStore`
  - Construtor aceita `rootDir: FileSystemDirectoryHandle` para isolamento por `infoHash`.
  - `get(index, opts?, cb?)` - Lê o arquivo `<index>.chunk` do OPFS. Se o arquivo não existir, retorna erro com propriedade `notFound: true`.
  - `put(index, buf, cb?)` - Escreve o chunk no OPFS usando `FileSystemWritableFileStream`. *Nota: Utiliza `.slice()` no buffer para garantir compatibilidade com `ArrayBuffer` estrito.*
  - `close(cb?)` - Fecha a referência ao diretório (não deleta arquivos).
  - `destroy(cb?)` - Itera e deleta todos os arquivos `.chunk` dentro do diretório do torrent, limpando o armazenamento.

---

## ✅ Status dos Testes
Todos os módulos acima possuem suítes de testes correspondentes na pasta `/tests/` (`utils_test.ts`, `bencode_test.ts`, `magnet_test.ts`, `parse-torrent_test.ts`, `chunk-store_test.ts`), validando:
- Codificação/Decodificação roundtrip.
- Manipulação correta de tipos (especialmente a distinção entre string e Uint8Array no Bencode).
- Validação de tamanhos de chunks e tratamento de erros (ex: chunk não encontrado, armazenamento fechado).
- Conformidade com o type-checking rigoroso do Deno 2.x.
```

---

