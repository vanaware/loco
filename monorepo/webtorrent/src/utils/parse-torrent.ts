// /loco/monorepo/webtorrent/src/utils/parse-torrent.ts

import { decode, encode, BencodeValue, BencodeDict } from "./bencode.ts";
import { sha1 } from "../crypto/hasher.ts";
import { parseMagnet, ParsedMagnet } from "./magnet.ts";

export interface ParsedTorrentFile {
  path: string;
  name: string;
  length: number;
  offset: number;
}

export interface ParsedTorrent {
  infoHash: string;
  infoHashBuffer: Uint8Array;
  name: string;
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

function magnetToParsed(magnet: ParsedMagnet): ParsedTorrent {
  return {
    infoHash: magnet.infoHash,
    infoHashBuffer: magnet.infoHashBuffer,
    name: magnet.name || "Unknown",
    announce: magnet.announce,
    urlList: magnet.webSeeds,
    peerAddresses: magnet.peerAddresses,
    files: [],
    length: 0,
    pieceLength: 0,
    pieces: [],
    info: {},
    magnetURI: magnet.magnetURI,
  };
}

async function bufferToParsed(buffer: Uint8Array): Promise<ParsedTorrent> {
  const torrentObj = decode(buffer) as BencodeDict;
  const info = torrentObj["info"] as BencodeDict | undefined;
  
  if (!info) {
    throw new Error("Torrent is missing required field: info");
  }

  const infoBuffer = encode(info);
  const infoHashHex = await sha1(infoBuffer);
  
  const infoHashBuffer = new Uint8Array(20);
  for (let i = 0; i < 20; i++) {
    infoHashBuffer[i] = parseInt(infoHashHex.substring(i * 2, i * 2 + 2), 16);
  }

  const pieceLength = info["piece length"] as number;
  const piecesRaw = info["pieces"] as Uint8Array;
  const pieces: Uint8Array[] = [];
  
  for (let i = 0; i < piecesRaw.length; i += 20) {
    pieces.push(piecesRaw.subarray(i, i + 20));
  }

  const files: ParsedTorrentFile[] = [];
  let totalLength = 0;
  const textDecoder = new TextDecoder();

  if (info["files"]) {
    const filesList = info["files"] as BencodeDict[];
    for (const fileDict of filesList) {
      const length = fileDict["length"] as number;
      const pathList = fileDict["path"] as (Uint8Array | string)[];
      const pathParts = pathList.map((p) => typeof p === "string" ? p : textDecoder.decode(p));
      const path = pathParts.join("/");
      const name = pathParts[pathParts.length - 1]!;
      
      files.push({ path, name, length, offset: totalLength });
      totalLength += length;
    }
  } else {
    const length = info["length"] as number;
    const nameRaw = info["name"];
    const name = typeof nameRaw === "string" ? nameRaw : textDecoder.decode(nameRaw as Uint8Array);
    
    files.push({ path: name, name, length, offset: 0 });
    totalLength = length;
  }

  const announce: string[] = [];
  if (torrentObj["announce"]) {
    const ann = torrentObj["announce"];
    if (typeof ann === "string") announce.push(ann);
  }
  if (torrentObj["announce-list"]) {
    const list = torrentObj["announce-list"] as (string | Uint8Array)[][];
    for (const tier of list) {
      for (const url of tier) {
        const urlStr = typeof url === "string" ? url : textDecoder.decode(url);
        if (!announce.includes(urlStr)) announce.push(urlStr);
      }
    }
  }

  const urlList: string[] = [];
  if (torrentObj["url-list"]) {
    const urls = torrentObj["url-list"];
    if (Array.isArray(urls)) {
      for (const url of urls) {
        const urlStr = typeof url === "string" ? url : textDecoder.decode(url as Uint8Array);
        if (!urlList.includes(urlStr)) urlList.push(urlStr);
      }
    } else if (typeof urls === "string") {
      urlList.push(urls);
    } else {
      urlList.push(textDecoder.decode(urls as Uint8Array));
    }
  }

  const nameRaw = info["name"];
  const nameRoot = typeof nameRaw === "string" ? nameRaw : textDecoder.decode(nameRaw as Uint8Array);

  // 🔥 CORREÇÃO: Verificar se é string antes de usar textDecoder.decode
  const commentRaw = torrentObj["comment"];
  const comment = commentRaw 
    ? typeof commentRaw === "string" 
      ? commentRaw 
      : textDecoder.decode(commentRaw as Uint8Array)
    : undefined;

  const createdByRaw = torrentObj["created by"];
  const createdBy = createdByRaw
    ? typeof createdByRaw === "string"
      ? createdByRaw
      : textDecoder.decode(createdByRaw as Uint8Array)
    : undefined;

  return {
    infoHash: infoHashHex,
    infoHashBuffer: infoHashBuffer,
    name: nameRoot,
    announce,
    urlList,
    peerAddresses: [],
    files,
    length: totalLength,
    pieceLength,
    pieces,
    info,
    magnetURI: "",
    comment,
    createdBy,
  };
}