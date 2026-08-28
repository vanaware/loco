// src/utils/db-helpers.ts
import { get, set, createStore, del, entries, values, getMany } from "idb-keyval";
import { STORE_NAMES, KEY_NAMES, DB_NAMES } from "../interfaces/db.ts";
import type { ProfileConfig, Chat, Contato, Handshake, PastaMetadata } from "../interfaces/db.ts";
import { 
  minifyVapidPublic, expandVapidPublic, 
  minifyVapidPrivate, expandVapidPrivate, 
  minifyRsaPublic, expandRsaPublic, 
  minifyRsaPrivate, expandRsaPrivate 
} from "../crypto/mod.ts";

// ============================================================
// Criação de Stores
// ============================================================

export function criarStore(nome: string, storeName: string = STORE_NAMES.KEYVAL) {
  return createStore(nome, storeName);
}

const storeConfig = criarStore(DB_NAMES.CONFIG);
export const storeChat = criarStore(DB_NAMES.CHAT); 
export const storeContatos = criarStore(DB_NAMES.CONTATOS);
export const storeHandshakes = criarStore(DB_NAMES.HANDSHAKES, STORE_NAMES.KEYVAL);
// 🔥 ARQUITETURA: Store para os metadados de Mídias/Pastas
export const storeMidias = criarStore(DB_NAMES.MIDIAS);

// ============================================================
// Funções Genéricas
// ============================================================

export async function salvarChave<T>(store: any, key: string, value: T): Promise<void> {
  return set(key, value, store);
}

export async function buscarChave<T>(store: any, key: string): Promise<T | undefined> {
  return get(key, store);
}

export async function removerChave(store: any, key: string): Promise<void> {
  return del(key, store);
}

export async function listarChaves<T>(store: any): Promise<[string, T][]> {
  return entries(store) as Promise<[string, T][]>;
}

export async function listarValores<T>(store: any): Promise<T[]> {
  return values(store) as Promise<T[]>;
}

// ============================================================
// Interceptadores de Compressão (DB Middlewares)
// ============================================================

function compactarProfile(p: ProfileConfig): any {
  return {
    ...p,
    vapidPublicKey: minifyVapidPublic(p.vapidPublicKey),
    vapidPrivateKeyJwk: minifyVapidPrivate(p.vapidPrivateKeyJwk),
    e2ePublicKey: minifyRsaPublic(p.e2ePublicKey),
    e2ePrivateKeyJwk: minifyRsaPrivate(p.e2ePrivateKeyJwk)
  };
}

function expandirProfile(p: any): ProfileConfig | undefined {
  if (!p) return undefined;
  return {
    ...p,
    vapidPublicKey: expandVapidPublic(p.vapidPublicKey),
    vapidPrivateKeyJwk: expandVapidPrivate(p.vapidPrivateKeyJwk, p.vapidPublicKey),
    e2ePublicKey: expandRsaPublic(p.e2ePublicKey),
    e2ePrivateKeyJwk: expandRsaPrivate(p.e2ePrivateKeyJwk, p.e2ePublicKey)
  } as ProfileConfig;
}

function compactarContato(c: Contato): any {
  return {
    ...c,
    vapidPublicKey: minifyVapidPublic(c.vapidPublicKey),
    e2ePublicKey: minifyRsaPublic(c.e2ePublicKey)
  };
}

function expandirContato(c: any): Contato | undefined {
  if (!c) return undefined;
  return {
    ...c,
    vapidPublicKey: expandVapidPublic(c.vapidPublicKey),
    e2ePublicKey: expandRsaPublic(c.e2ePublicKey)
  } as Contato;
}

// ============================================================
// Gerenciamento do Perfil (ProfileConfig)
// ============================================================

export async function salvarProfile(profile: ProfileConfig): Promise<void> {
  profile.updatedAt = Date.now();
  if (!profile.createdAt) {
    profile.createdAt = Date.now();
  }
  await salvarChave(storeConfig, KEY_NAMES.PROFILE, compactarProfile(profile));
}

export async function buscarProfile(): Promise<ProfileConfig | undefined> {
  const p = await buscarChave<any>(storeConfig, KEY_NAMES.PROFILE);
  return expandirProfile(p);
}

export async function removerProfile(): Promise<void> {
  await removerChave(storeConfig, KEY_NAMES.PROFILE);
}

export async function buscarChaveDecript(): Promise<CryptoKey | null> {
  try {
    const profile = await buscarProfile();
    if (!profile || !profile.e2ePrivateKeyJwk) return null;

    return await crypto.subtle.importKey(
      "jwk",
      profile.e2ePrivateKeyJwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["decrypt"]
    );
  } catch (err) {
    console.error("[DB-HELPERS] ❌ Erro ao buscar chave de decodificação:", err);
    return null;
  }
}

// ============================================================
// Mensagens de Chat (Novo Formato Unificado + Lazy Loading)
// ============================================================

export async function salvarChat(chat: Chat): Promise<void> {
  chat.updatedAt = Date.now();
  await salvarChave(storeChat, chat.id, chat);

  const indexKey = `${KEY_NAMES.CHAT_INDEX}${chat.contatoHash}`;
  const index = await buscarChave<string[]>(storeChat, indexKey) || [];
  
  if (!index.includes(chat.id)) {
    index.push(chat.id);
    await salvarChave(storeChat, indexKey, index);
  }
}

export async function buscarChat(id: string): Promise<Chat | undefined> {
  return buscarChave<Chat>(storeChat, id);
}

export async function listarChatPaginado(contatoHash: string, limit: number, offset: number): Promise<Chat[]> {
  const indexKey = `${KEY_NAMES.CHAT_INDEX}${contatoHash}`;
  const index = await buscarChave<string[]>(storeChat, indexKey) || [];

  const total = index.length;
  if (total === 0 || offset >= total) return [];

  const startIndex = Math.max(0, total - offset - limit);
  const endIndex = total - offset;
  
  const sliceIds = index.slice(startIndex, endIndex);

  const records = await getMany(sliceIds, storeChat);
  return records.filter(Boolean) as Chat[];
}

export async function removerChat(id: string, contatoHash: string): Promise<void> {
  const chat = await buscarChat(id);
  if (chat && chat.handshake && chat.handshake !== 'self') {
    await removerHandshake(chat.handshake);
  }

  await removerChave(storeChat, id);
  const indexKey = `${KEY_NAMES.CHAT_INDEX}${contatoHash}`;
  let index = await buscarChave<string[]>(storeChat, indexKey) || [];
  index = index.filter(x => x !== id);
  await salvarChave(storeChat, indexKey, index);
}

export async function removerTodoHistoricoChat(contatoHash: string): Promise<void> {
  const indexKey = `${KEY_NAMES.CHAT_INDEX}${contatoHash}`;
  const index = await buscarChave<string[]>(storeChat, indexKey) || [];
  
  for (const id of index) {
    await removerChave(storeChat, id);
  }
  await removerChave(storeChat, indexKey);
}

// ============================================================
// Contatos
// ============================================================

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function serializarPublicKeyVapid(jwk: JsonWebKey): Promise<string> {
  if (!jwk) throw new Error("Chave VAPID ausente ao tentar serializar.");
  
  const expanded = expandVapidPublic(jwk);
  const raw = `${expanded.kty?.toLowerCase() || ''}|${expanded.crv?.toLowerCase() || ''}|${expanded.x?.toLowerCase() || ''}|${expanded.y?.toLowerCase() || ''}`;
  return await sha256(raw);
}

export async function normalizarChaveContato(input: string | JsonWebKey): Promise<string> {
  if (typeof input === 'string') return input;
  if (typeof input === 'object' && input !== null && ('kty' in input || 'x' in input)) {
    return await serializarPublicKeyVapid(input as JsonWebKey);
  }
  throw new Error('Chave de contato inválida: deve ser string (hash) ou JWK.');
}

export async function salvarContato(contato: Contato): Promise<void> {
  const key = await serializarPublicKeyVapid(contato.vapidPublicKey);
  await salvarChave(storeContatos, key, compactarContato(contato));
}

export async function buscarContatoPorPublicKey(vapidPublicKey: JsonWebKey): Promise<Contato | undefined> {
  const key = await serializarPublicKeyVapid(vapidPublicKey);
  const c = await buscarChave<any>(storeContatos, key);
  return expandirContato(c);
}

export async function buscarContatoPorChave(chaveOuJwk: string | JsonWebKey): Promise<Contato | undefined> {
  const key = await normalizarChaveContato(chaveOuJwk);
  const c = await buscarChave<any>(storeContatos, key);
  return expandirContato(c);
}

export async function listarContatos(): Promise<Contato[]> {
  const entriesList = await listarChaves<any>(storeContatos);
  return entriesList.map(([_, c]) => expandirContato(c) as Contato);
}

export async function removerContato(vapidPublicKey: JsonWebKey): Promise<void> {
  const key = await serializarPublicKeyVapid(vapidPublicKey);
  await removerChave(storeContatos, key);
}

export async function removerContatoPorHash(hash: string): Promise<void> {
  await removerChave(storeContatos, hash);
}

// ============================================================
// Handshakes
// ============================================================

export async function salvarHandshake(handshake: Handshake): Promise<void> {
  handshake.updatedAt = Date.now();
  if (!handshake.createdAt) {
    handshake.createdAt = Date.now();
  }
  await salvarChave(storeHandshakes, handshake.id, handshake);
}

export async function buscarHandshake(id: string): Promise<Handshake | undefined> {
  return buscarChave<Handshake>(storeHandshakes, id);
}

export async function listarHandshakes(): Promise<Handshake[]> {
  return listarValores<Handshake>(storeHandshakes);
}

export async function removerHandshake(id: string): Promise<void> {
  await removerChave(storeHandshakes, id);
}

// ============================================================
// Metadados de Mídias e OPFS (Coleções/Pastas P2P)
// ============================================================

export async function salvarPastaMetadata(pasta: PastaMetadata): Promise<void> {
  pasta.modifiedAt = Date.now();
  await salvarChave(storeMidias, pasta.id, pasta);
}

export async function buscarPastaMetadata(id: string): Promise<PastaMetadata | undefined> {
  return buscarChave<PastaMetadata>(storeMidias, id);
}

export async function listarTodasAsPastas(): Promise<PastaMetadata[]> {
  return await listarValores<PastaMetadata>(storeMidias);
}

export async function removerPastaMetadata(id: string): Promise<void> {
  await removerChave(storeMidias, id);
}