/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { get, set, createStore } from "idb-keyval";
import { DB_NAMES, STORE_NAMES, KEY_NAMES } from "../constants/db.ts";
import { serializarPublicKeyVapid } from "../utils/db-helpers.ts";

// ============================================================
// STORES
// ============================================================
function criarStore(nome: string) {
  try {
    return createStore(nome, STORE_NAMES.KEYVAL);
  } catch (err) {
    console.error(`[SW-UTILS] ❌ Erro ao criar store ${nome}:`, err);
    return null;
  }
}

let storeConfig = criarStore(DB_NAMES.CONFIG);
let storeMensagensRecebidasB = criarStore(DB_NAMES.MENSAGENS_RECEBIDAS_B);
let storeContatos = criarStore(DB_NAMES.CONTATOS);
let storeHandshakes = criarStore(DB_NAMES.HANDSHAKES);

function garantirStores() {
  if (!storeConfig) storeConfig = criarStore(DB_NAMES.CONFIG);
  if (!storeMensagensRecebidasB) storeMensagensRecebidasB = criarStore(DB_NAMES.MENSAGENS_RECEBIDAS_B);
  if (!storeContatos) storeContatos = criarStore(DB_NAMES.CONTATOS);
  if (!storeHandshakes) storeHandshakes = criarStore(DB_NAMES.HANDSHAKES);
}

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ============================================================
// FUNÇÕES DE BANCO UNIFICADAS
// ============================================================
export async function buscarProfile() {
  try {
    garantirStores();
    return await get(KEY_NAMES.PROFILE, storeConfig);
  } catch (err) {
    console.error("[SW-UTILS] ❌ Erro ao buscar perfil:", err);
    return null;
  }
}

export async function buscarChaveDecript() {
  try {
    const profile = await buscarProfile();
    if (!profile) {
      console.warn("[SW-UTILS] ⚠️ Perfil não encontrado.");
      return null;
    }
    if (!profile.e2ePrivateKeyJwk) {
      console.warn("[SW-UTILS] ⚠️ Chave privada RSA não encontrada no perfil.");
      return null;
    }

    const privateDecrypt = await crypto.subtle.importKey(
      "jwk",
      profile.e2ePrivateKeyJwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["decrypt"]
    );
    console.log("[SW-UTILS] 🔑 Chave de decodificação RSA encontrada e importada.");
    return privateDecrypt;
  } catch (err) {
    console.error("[SW-UTILS] ❌ Erro ao buscar chave de decodificação:", err);
    return null;
  }
}

export async function salvarContato(contato: any) {
  try {
    garantirStores();
    const key = await serializarPublicKeyVapid(contato.publicKeyVapid);
    await set(key, contato, storeContatos);
    console.log(`[SW-UTILS] ✅ Contato ${contato.email} salvo com chave hash: ${key.substring(0, 8)}...`);
  } catch (err) {
    console.error(`[SW-UTILS] ❌ Erro ao salvar contato:`, err);
  }
}

export async function buscarContatoPorPublicKey(publicKeyVapid: any) {
  try {
    garantirStores();
    const key = await serializarPublicKeyVapid(publicKeyVapid);
    return await get(key, storeContatos);
  } catch (err) {
    console.error("[SW-UTILS] ❌ Erro ao buscar contato:", err);
    return null;
  }
}

export async function salvarMensagemRecebida(mensagem: any) {
  try {
    garantirStores();
    await set(mensagem.id, mensagem, storeMensagensRecebidasB);
    console.log(`[SW-UTILS] ✅ Mensagem ${mensagem.id} salva.`);
  } catch (err) {
    console.error(`[SW-UTILS] ❌ Erro ao salvar mensagem ${mensagem.id}:`, err);
  }
}

export async function buscarContatoPorChave(chave: string | any) {
  // Importa dinamicamente para evitar circular?
  // Melhor: importar de db-helpers, mas precisamos evitar duplicação.
  // Vamos re-exportar de db-helpers ou duplicar? Pode ser feito via import.
  // Para simplificar, vamos importar de db-helpers aqui.
  // Mas como este arquivo é usado no SW, podemos importar diretamente.
  // Vou re-exportar.
  const { buscarContatoPorChave } = await import("../utils/db-helpers.ts");
  return buscarContatoPorChave(chave);
}

// Também podemos exportar serializarPublicKeyVapid já importado.
export { serializarPublicKeyVapid } from "../utils/db-helpers.ts";