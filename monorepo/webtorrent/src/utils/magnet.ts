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