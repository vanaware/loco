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