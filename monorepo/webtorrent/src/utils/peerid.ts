// /loco/monorepo/webtorrent/src/utils/peerid.ts

import { generateRandomString } from "../crypto/random.ts";

export interface ClientInfo {
  code: string;
  name?: string;
  version?: string;
  style: "azureus" | "shadow" | "unknown";
}

export const LOCO_PEER_ID_PREFIX = "-LO0100-";

const AZUREUS_CLIENTS: Record<string, string> = {
  "AG": "Ares",
  "A~": "Ares",
  "AR": "Arctic",
  "AT": "Artemis",
  "AV": "Avicora",
  "AX": "BitPump",
  "AZ": "Azureus/Vuze",
  "BB": "BitBuddy",
  "BC": "BitComet",
  "BE": "Baretorrent",
  "BF": "Bitflu",
  "BG": "BTG (libtorrent)",
  "BL": "BitCometLite",
  "BP": "BitTorrent Pro",
  "BR": "BitRocket",
  "BS": "BTSlave",
  "BT": "mainline BitTorrent",
  "BW": "BitWombat",
  "BX": "~Bittorrent X",
  "CD": "Enhanced CTorrent",
  "CT": "CTorrent",
  "DE": "Deluge",
  "DP": "Propagate Data Client",
  "EB": "EBit",
  "ES": "electric sheep",
  "FC": "FileCroc",
  "FD": "Free Download Manager",
  "FT": "FoxTorrent",
  "FX": "Freebox BitTorrent",
  "GS": "GSTorrent",
  "HK": "Hekate",
  "HL": "Halite",
  "HM": "hMule (libtorrent)",
  "HN": "Hydranode",
  "IL": "iLivid",
  "JS": "Justseed.it",
  "JT": "JavaTorrent",
  "KG": "KGet",
  "KT": "KTorrent",
  "LC": "LeechCraft",
  "LH": "LH-ABC",
  "LO": "Loco", // 🔥 NOSSO CLIENTE
  "LP": "Lphant",
  "LT": "libtorrent (Rasterbar)",
  "lt": "libTorrent (Rakshasa)",
  "LW": "LimeWire",
  "MK": "Meerkat",
  "MO": "MonoTorrent",
  "MP": "MooPolice",
  "MR": "Miro",
  "MT": "MoonlightTorrent",
  "NB": "Net::BitTorrent",
  "NX": "Net Transport",
  "OS": "OneSwarm",
  "OT": "OmegaTorrent",
  "PB": "Protocol::BitTorrent",
  "PD": "Pando",
  "PI": "PicoTorrent",
  "PT": "PHPTracker",
  "qB": "qBittorrent",
  "QD": "QQDownload",
  "QT": "Qt 4 Torrent",
  "RT": "Retriever",
  "RZ": "RezTorrent",
  "S~": "Shareaza (alpha/beta)",
  "SB": "~Swiftbit",
  "SD": "Thunder (XùnLéi)",
  "SM": "SoMud",
  "SP": "BitSpirit",
  "SS": "SwarmScope",
  "ST": "SymTorrent",
  "st": "sharktorrent",
  "SZ": "Shareaza",
  "TB": "Torch",
  "TE": "terasaur Seed Bank",
  "TL": "Tribler",
  "TN": "TorrentDotNET",
  "TR": "Transmission",
  "TS": "Torrentstorm",
  "TT": "TuoTu",
  "UL": "uLeecher!",
  "UM": "µTorrent for Mac",
  "UT": "µTorrent",
  "VG": "Vagaa",
  "WD": "WebTorrent Desktop",
  "WT": "BitLet",
  "WW": "WebTorrent",
  "WY": "FireTorrent",
  "XF": "Xfplay",
  "XL": "Xunlei",
  "XS": "XSwifter",
  "XT": "XanTorrent",
  "XX": "Xtorrent",
  "ZT": "ZipTorrent",
};

const SHADOW_CLIENTS: Record<string, string> = {
  "A": "ABC",
  "O": "Osprey Permaseed",
  "Q": "BTQueue",
  "R": "Tribler",
  "S": "Shadow's Client",
  "T": "BitTornado",
  "U": "UPnP NAT Bit Torrent",
};

export function isAzStyle(peerid: string): boolean {
  return (
    peerid.length >= 8 &&
    peerid[0] === "-" &&
    peerid[7] === "-" &&
    /^[A-Za-z0-9]{2}$/.test(peerid.slice(1, 3)) &&
    /^\d{4}$/.test(peerid.slice(3, 7))
  );
}

export function isShadowStyle(peerid: string): boolean {
  return (
    peerid.length >= 9 &&
    /^[A-Za-z]$/.test(peerid[0]!) && // 🔥 Ajuste TS: non-null assertion
    peerid.slice(6, 9) === "---"
  );
}

function parseAzVersion(versionStr: string): string {
  if (versionStr.length !== 4) return versionStr;
  const major = versionStr[0];
  const minor = versionStr[1];
  // 🔥 CORREÇÃO: Usar parseInt para remover zeros à esquerda (ex: "00" vira "0")
  const patch = parseInt(versionStr.slice(2), 10).toString();
  return `${major}.${minor}.${patch}`;
}

function parseShadowVersion(versionStr: string): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.-";
  const parts: number[] = [];
  
  for (const char of versionStr) {
    if (char === "-") break;
    const idx = chars.indexOf(char);
    if (idx !== -1) parts.push(idx);
  }
  
  return parts.length > 0 ? parts.join(".") : "0";
}

export function decodePeerId(peerId: string | Uint8Array): ClientInfo | null {
  const peeridStr = typeof peerId === "string" 
    ? peerId 
    : new TextDecoder("utf-8", { fatal: false }).decode(peerId);
  
  if (peeridStr.length < 20) return null;
  const id = peeridStr.slice(0, 20);

  if (isAzStyle(id)) {
    const code = id.slice(1, 3);
    const versionRaw = id.slice(3, 7);
    const name = AZUREUS_CLIENTS[code] || `Unknown (${code})`;
    const version = parseAzVersion(versionRaw);
    
    return { code, name, version, style: "azureus" };
  }

  if (isShadowStyle(id)) {
    const code = id[0]!; // 🔥 Ajuste TS: non-null assertion
    const versionRaw = id.slice(1, 6);
    const name = SHADOW_CLIENTS[code] || `Unknown (${code})`;
    const version = parseShadowVersion(versionRaw);
    
    return { code, name, version, style: "shadow" };
  }

  // 🔥 CORREÇÃO: Retornar null para peers desconhecidos, conforme esperado pelos testes
  return null;
}

export function getPeerIdClientName(peerId: string | Uint8Array): string {
  const info = decodePeerId(peerId);
  return info?.name || "Unknown Client";
}

export function generateLocoPeerId(): Uint8Array {
  const prefix = LOCO_PEER_ID_PREFIX;
  const randomPart = generateRandomString(20 - prefix.length);
  const peerIdStr = prefix + randomPart;
  
  return new TextEncoder().encode(peerIdStr);
}

