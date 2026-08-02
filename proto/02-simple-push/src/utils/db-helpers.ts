// src/utils/db-helpers.ts
import { get, set, createStore, del, entries } from "idb-keyval";
import { STORE_NAMES, KEY_NAMES, DB_NAMES } from "../constants/db.ts";
import type {
  ProfileConfig,
  MensagemEnvio,
  MensagemRecebida,
  Contato,
} from "../constants/db.ts";

// ============================================================
// Criação de Stores
// ============================================================

export function criarStore(nome: string) {
  return createStore(nome, STORE_NAMES.KEYVAL);
}

const storeConfig = criarStore(DB_NAMES.CONFIG);
export const storeMensagensEnvioA = criarStore(DB_NAMES.MENSAGENS_ENVIO_A);
export const storeContatos = criarStore(DB_NAMES.CONTATOS);
export const storeMensagensRecebidasB = criarStore(DB_NAMES.MENSAGENS_RECEBIDAS_B);

// ============================================================
// Funções Genéricas
// ============================================================

export async function salvarChave<T>(store: IDBStore, key: string, value: T): Promise<void> {
  return set(key, value, store);
}

export async function buscarChave<T>(store: IDBStore, key: string): Promise<T | undefined> {
  return get(key, store);
}

export async function removerChave(store: IDBStore, key: string): Promise<void> {
  return del(key, store);
}

export async function listarChaves<T>(store: IDBStore): Promise<[string, T][]> {
  return entries(store) as Promise<[string, T][]>;
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

// ============================================================
// Funções de Conveniência (operam sobre o ProfileConfig)
// ============================================================

/**
 * Retorna a identidade (nome, email) e a chave privada VAPID como CryptoKey.
 */
export async function buscarIdentidadeA(): Promise<{ name: string; email: string; privateKey: CryptoKey } | undefined> {
  const profile = await buscarProfile();
  if (!profile) return undefined;
  try {
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      profile.vapidPrivateKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );
    return {
      name: profile.name,
      email: profile.email,
      privateKey,
    };
  } catch {
    return undefined;
  }
}

/**
 * Salva a identidade e a chave privada VAPID (a partir de uma CryptoKey).
 */
export async function salvarIdentidadeA(identidade: { name: string; email: string; privateKey: CryptoKey }): Promise<void> {
  const profile = await buscarProfile() || {} as ProfileConfig;
  profile.name = identidade.name;
  profile.email = identidade.email;
  profile.vapidPrivateKeyJwk = await crypto.subtle.exportKey("jwk", identidade.privateKey);
  await salvarProfile(profile);
}

/**
 * Retorna as chaves E2E: privateDecrypt (CryptoKey) e publicEncrypt (JWK).
 * A chave privada é importada a partir do JWK armazenado.
 */
export async function buscarChavesE2EB(): Promise<{ privateDecrypt: CryptoKey; publicEncrypt: JsonWebKey } | undefined> {
  const profile = await buscarProfile();
  if (!profile || !profile.e2ePublicKey || !profile.e2ePrivateKeyJwk) return undefined;
  try {
    const privateDecrypt = await crypto.subtle.importKey(
      "jwk",
      profile.e2ePrivateKeyJwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["decrypt"]
    );
    return {
      privateDecrypt,
      publicEncrypt: profile.e2ePublicKey,
    };
  } catch {
    return undefined;
  }
}

/**
 * Salva as chaves E2E (pública e privada) como JWK.
 * A privateKey é uma CryptoKey, que será exportada para JWK.
 */
export async function salvarChavesE2EB(chaves: { privateDecrypt: CryptoKey; publicEncrypt: JsonWebKey }): Promise<void> {
  const profile = await buscarProfile() || {} as ProfileConfig;
  profile.e2ePublicKey = chaves.publicEncrypt;
  profile.e2ePrivateKeyJwk = await crypto.subtle.exportKey("jwk", chaves.privateDecrypt);
  await salvarProfile(profile);
}

/**
 * Retorna as chaves VAPID (pública e privada JWK) do perfil.
 */
export async function buscarChavesVapidB(): Promise<{ publicKey: JsonWebKey; privateKey: JsonWebKey } | undefined> {
  const profile = await buscarProfile();
  if (!profile) return undefined;
  return {
    publicKey: profile.vapidPublicKey,
    privateKey: profile.vapidPrivateKeyJwk,
  };
}

/**
 * Salva as chaves VAPID no perfil.
 * A privateKey é um JWK.
 */
export async function salvarChavesVapidB(chaves: { publicKey: JsonWebKey; privateKey: JsonWebKey }): Promise<void> {
  const profile = await buscarProfile() || {} as ProfileConfig;
  profile.vapidPublicKey = chaves.publicKey;
  profile.vapidPrivateKeyJwk = chaves.privateKey;
  await salvarProfile(profile);
}

/**
 * Retorna a subscription do perfil.
 */
export async function buscarSubscriptionB(): Promise<{ endpoint: string; keys: { p256dh: string; auth: string } } | undefined> {
  const profile = await buscarProfile();
  return profile?.subscription;
}

/**
 * Salva a subscription no perfil.
 */
export async function salvarSubscriptionB(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void> {
  const profile = await buscarProfile() || {} as ProfileConfig;
  profile.subscription = subscription;
  await salvarProfile(profile);
}

/**
 * Remove a subscription do perfil.
 */
export async function removerSubscriptionB(): Promise<void> {
  const profile = await buscarProfile();
  if (profile) {
    delete profile.subscription;
    await salvarProfile(profile);
  }
}

// ============================================================
// Mensagens de Envio (não alteradas)
// ============================================================

export async function salvarMensagemEnvio(mensagem: MensagemEnvio): Promise<void> {
  await salvarChave(storeMensagensEnvioA, mensagem.id, mensagem);
}

export async function buscarMensagemEnvio(id: string): Promise<MensagemEnvio | undefined> {
  return buscarChave<MensagemEnvio>(storeMensagensEnvioA, id);
}

export async function listarMensagensEnvio(): Promise<MensagemEnvio[]> {
  const entries = await listarChaves<MensagemEnvio>(storeMensagensEnvioA);
  return entries.map(([_, msg]) => msg);
}

export async function atualizarStatusMensagemEnvio(id: string, status: MensagemEnvio['status'], erro?: string): Promise<void> {
  const mensagem = await buscarMensagemEnvio(id);
  if (mensagem) {
    mensagem.status = status;
    mensagem.atualizadoEm = Date.now();
    if (erro) mensagem.erro = erro;
    await salvarMensagemEnvio(mensagem);
  }
}

export async function removerMensagemEnvio(id: string): Promise<void> {
  await removerChave(storeMensagensEnvioA, id);
}

// ============================================================
// Mensagens Recebidas (não alteradas)
// ============================================================

export async function salvarMensagemRecebida(mensagem: MensagemRecebida): Promise<void> {
  await salvarChave(storeMensagensRecebidasB, mensagem.id, mensagem);
}

export async function buscarMensagemRecebida(id: string): Promise<MensagemRecebida | undefined> {
  return buscarChave<MensagemRecebida>(storeMensagensRecebidasB, id);
}

export async function listarMensagensRecebidas(): Promise<MensagemRecebida[]> {
  const entries = await listarChaves<MensagemRecebida>(storeMensagensRecebidasB);
  return entries.map(([_, msg]) => msg);
}

export async function atualizarStatusMensagemRecebida(id: string, status: MensagemRecebida['status']): Promise<void> {
  const mensagem = await buscarMensagemRecebida(id);
  if (mensagem) {
    mensagem.status = status;
    if (status === 'lida') mensagem.lidaEm = Date.now();
    if (status === 'notificada') mensagem.notificadaEm = Date.now();
    await salvarMensagemRecebida(mensagem);
  }
}

export async function removerMensagemRecebida(id: string): Promise<void> {
  await removerChave(storeMensagensRecebidasB, id);
}

// ============================================================
// Contatos (não alterados)
// ============================================================

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function serializarPublicKeyVapid(jwk: JsonWebKey): Promise<string> {
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
  const key = await serializarPublicKeyVapid(contato.publicKeyVapid);
  await salvarChave(storeContatos, key, contato);
}

export async function buscarContatoPorPublicKey(publicKeyVapid: JsonWebKey): Promise<Contato | undefined> {
  const key = await serializarPublicKeyVapid(publicKeyVapid);
  return buscarChave<Contato>(storeContatos, key);
}

export async function buscarContatoPorChave(chaveOuJwk: string | JsonWebKey): Promise<Contato | undefined> {
  const key = await normalizarChaveContato(chaveOuJwk);
  return buscarChave<Contato>(storeContatos, key);
}

export async function listarContatos(): Promise<Contato[]> {
  const entries = await listarChaves<Contato>(storeContatos);
  return entries.map(([_, c]) => c);
}

export async function homologarContato(publicKeyVapid: JsonWebKey): Promise<void> {
  const key = await serializarPublicKeyVapid(publicKeyVapid);
  const contato = await buscarChave<Contato>(storeContatos, key);
  if (contato) {
    contato.homologado = true;
    contato.updatedAt = Date.now();
    await salvarChave(storeContatos, key, contato);
  }
}

export async function removerContato(publicKeyVapid: JsonWebKey): Promise<void> {
  const key = await serializarPublicKeyVapid(publicKeyVapid);
  await removerChave(storeContatos, key);
}