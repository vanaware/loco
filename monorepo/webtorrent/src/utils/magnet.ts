// /loco/monorepo/webtorrent/src/utils/magnet.ts

export interface ParsedMagnet {
  infoHash: string;
  infoHashBuffer: Uint8Array;
  name?: string;
  announce: string[];
  webSeeds: string[];
  peerAddresses: string[];
  torrentFileUrl?: string;
  magnetURI: string;
}

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BASE32_LOOKUP: Record<string, number> = {};

for (let i = 0; i < BASE32_CHARS.length; i++) {
  BASE32_LOOKUP[BASE32_CHARS.charAt(i)] = i;
}

function base32ToHex(base32: string): string {
  let bits = "";
  let hex = "";
  for (let i = 0; i < base32.length; i++) {
    // 🔥 CORREÇÃO: Non-null assertion (!) para satisfazer o TypeScript
    const char = base32[i]!.toUpperCase();
    const val = BASE32_LOOKUP[char];
    if (val === undefined) throw new Error("Invalid base32 character");
    bits += val.toString(2).padStart(5, "0");
  }
  for (let i = 0; i + 4 <= bits.length; i += 4) {
    const chunk = bits.slice(i, i + 4);
    hex += parseInt(chunk, 2).toString(16);
  }
  return hex;
}

export function parseMagnet(uri: string): ParsedMagnet {
  if (!uri.startsWith("magnet:?")) {
    throw new Error("Invalid magnet URI: must start with 'magnet:?'");
  }

  const searchParams = new URLSearchParams(uri.slice(8));
  const xt = searchParams.get("xt");

  if (!xt || !xt.startsWith("urn:btih:")) {
    throw new Error("Invalid magnet URI: missing or invalid 'xt' parameter");
  }

  let infoHash = xt.slice(9).toLowerCase();
  let infoHashBuffer: Uint8Array;

  if (infoHash.length === 32) {
    infoHash = base32ToHex(infoHash);
  } else if (infoHash.length !== 40) {
    throw new Error("Invalid infoHash length in magnet URI");
  }

  infoHashBuffer = new Uint8Array(20);
  for (let i = 0; i < 20; i++) {
    infoHashBuffer[i] = parseInt(infoHash.slice(i * 2, i * 2 + 2), 16);
  }

  const announce: string[] = [];
  searchParams.getAll("tr").forEach((tr) => {
    if (tr && !announce.includes(tr)) announce.push(tr);
  });

  const webSeeds: string[] = [];
  searchParams.getAll("ws").forEach((ws) => {
    if (ws && !webSeeds.includes(ws)) webSeeds.push(ws);
  });

  const peerAddresses: string[] = [];
  searchParams.getAll("x.pe").forEach((pe) => {
    if (pe && !peerAddresses.includes(pe)) peerAddresses.push(pe);
  });

  return {
    infoHash,
    infoHashBuffer,
    name: searchParams.get("dn") || undefined,
    announce,
    webSeeds,
    peerAddresses,
    torrentFileUrl: searchParams.get("xs") || undefined,
    magnetURI: uri,
  };
}

export function encodeMagnet(parsed: Omit<ParsedMagnet, "infoHashBuffer" | "magnetURI">): string {
  const parts: string[] = [`xt=urn:btih:${parsed.infoHash}`];
  if (parsed.name) parts.push(`dn=${encodeURIComponent(parsed.name)}`);
  for (const tracker of parsed.announce) parts.push(`tr=${encodeURIComponent(tracker)}`);
  for (const webSeed of parsed.webSeeds) parts.push(`ws=${encodeURIComponent(webSeed)}`);
  for (const peer of parsed.peerAddresses) parts.push(`x.pe=${encodeURIComponent(peer)}`);
  if (parsed.torrentFileUrl) parts.push(`xs=${encodeURIComponent(parsed.torrentFileUrl)}`);
  
  return `magnet:?${parts.join("&")}`;
}