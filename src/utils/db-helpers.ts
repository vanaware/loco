// src/utils/db-helpers.ts
import { get, set, createStore, del, entries, values, getMany } from "idb-keyval";
import { STORE_NAMES, KEY_NAMES, DB_NAMES } from "../constants/db.ts";
import type {
  ProfileConfig,
  Chat,
  Contato,
  Handshake,
} from "../constants/db.ts";

// ============================================================
// Criação de Stores
// ============================================================

export function criarStore(nome: string, storeName: string = STORE_NAMES.KEYVAL) {
  return createStore(nome, storeName);
}

const storeConfig = criarStore(DB_NAMES.CONFIG);
export const storeChat = criarStore(DB_NAMES.CHAT); // 🔥 Unificado
export const storeContatos = criarStore(DB_NAMES.CONTATOS);
export const storeHandshakes = criarStore(DB_NAMES.HANDSHAKES, STORE_NAMES.KEYVAL);

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
// Gerenciamento do Perfil (ProfileConfig)
// ============================================================

export async function salvarProfile(profile: ProfileConfig): Promise<void> {
  profile.updatedAt = Date.now();
  if (!profile.createdAt) {
    profile.createdAt = Date.now();
  }
  await salvarChave(storeConfig, KEY_NAMES.PROFILE, profile);
}

export async function buscarProfile(): Promise<ProfileConfig | undefined> {
  return buscarChave<ProfileConfig>(storeConfig, KEY_NAMES.PROFILE);
}

export async function removerProfile(): Promise<void> {
  await removerChave(storeConfig, KEY_NAMES.PROFILE);
}

export async function buscarChaveDecript(): Promise<CryptoKey | null> {
  try {
    const profile = await buscarProfile();
    if (!profile) return null;
    if (!profile.e2ePrivateKeyJwk) return null;

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

/**
 * Salva a mensagem e adiciona seu ID ao índice de paginação do contato.
 */
export async function salvarChat(chat: Chat): Promise<void> {
  chat.updatedAt = Date.now();
  await salvarChave(storeChat, chat.id, chat);

  // Mantém um índice ordenado por data para não precisar carregar o DB inteiro
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

/**
 * 🔥 Lazy Loading Paginado: Carrega apenas uma fatia de mensagens de um contato.
 * O `offset` dita de onde começar de baixo para cima (mais recentes primeiro).
 */
export async function listarChatPaginado(contatoHash: string, limit: number, offset: number): Promise<Chat[]> {
  const indexKey = `${KEY_NAMES.CHAT_INDEX}${contatoHash}`;
  const index = await buscarChave<string[]>(storeChat, indexKey) || [];

  // Pega do final do array (mais recentes) para o começo
  const total = index.length;
  if (total === 0 || offset >= total) return [];

  const startIndex = Math.max(0, total - offset - limit);
  const endIndex = total - offset;
  
  // Pega os IDs da fatia solicitada
  const sliceIds = index.slice(startIndex, endIndex);

  // Busca os dados físicos desses IDs em batch
  const records = await getMany(sliceIds, storeChat);
  return records.filter(Boolean) as Chat[];
}

export async function removerChat(id: string, contatoHash: string): Promise<void> {
  await removerChave(storeChat, id);
  const indexKey = `${KEY_NAMES.CHAT_INDEX}${contatoHash}`;
  let index = await buscarChave<string[]>(storeChat, indexKey) || [];
  index = index.filter(x => x !== id);
  await salvarChave(storeChat, indexKey, index);
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
  const raw = `${jwk.kty?.toLowerCase() || ''}|${jwk.crv?.toLowerCase() || ''}|${jwk.x?.toLowerCase() || ''}|${jwk.y?.toLowerCase() || ''}`;
  return await sha256(raw);
}

export async function normalizarChaveContato(input: string | JsonWebKey): Promise<string> {
  if (typeof input === 'string') return input;
  if (typeof input === 'object' && input !== null && 'kty' in input) {
    return await serializarPublicKeyVapid(input);
  }
  throw new Error('Chave de contato inválida: deve ser string (hash) ou JWK.');
}

export async function salvarContato(contato: Contato): Promise<void> {
  const key = await serializarPublicKeyVapid(contato.vapidPublicKey);
  await salvarChave(storeContatos, key, contato);
}

export async function buscarContatoPorPublicKey(vapidPublicKey: JsonWebKey): Promise<Contato | undefined> {
  const key = await serializarPublicKeyVapid(vapidPublicKey);
  return await buscarChave<Contato>(storeContatos, key);
}

export async function buscarContatoPorChave(chaveOuJwk: string | JsonWebKey): Promise<Contato | undefined> {
  const key = await normalizarChaveContato(chaveOuJwk);
  return await buscarChave<Contato>(storeContatos, key);
}

export async function listarContatos(): Promise<Contato[]> {
  const entriesList = await listarChaves<Contato>(storeContatos);
  return entriesList.map(([_, c]) => c);
}

export async function removerContato(vapidPublicKey: JsonWebKey): Promise<void> {
  const key = await serializarPublicKeyVapid(vapidPublicKey);
  await removerChave(storeContatos, key);
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