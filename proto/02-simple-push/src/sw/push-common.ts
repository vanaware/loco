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
    console.error(`[SW-COMMON] ❌ Erro ao criar store ${nome}:`, err);
    return null;
  }
}

let storeConfig = criarStore(DB_NAMES.CONFIG);
let storeContatos = criarStore(DB_NAMES.CONTATOS);
let storeMensagensRecebidasB = criarStore(DB_NAMES.MENSAGENS_RECEBIDAS_B);

function garantirStores() {
  if (!storeConfig) storeConfig = criarStore(DB_NAMES.CONFIG);
  if (!storeContatos) storeContatos = criarStore(DB_NAMES.CONTATOS);
  if (!storeMensagensRecebidasB) storeMensagensRecebidasB = criarStore(DB_NAMES.MENSAGENS_RECEBIDAS_B);
}

// ============================================================
// FUNÇÕES DE BANCO
// ============================================================
export async function buscarProfile() {
  try {
    garantirStores();
    return await get(KEY_NAMES.PROFILE, storeConfig);
  } catch (err) {
    console.error("[SW-COMMON] ❌ Erro ao buscar perfil:", err);
    return null;
  }
}

export async function buscarChaveDecript() {
  try {
    const profile = await buscarProfile();
    if (!profile) {
      console.warn("[SW-COMMON] ⚠️ Perfil não encontrado.");
      return null;
    }
    if (!profile.e2ePrivateKeyJwk) {
      console.warn("[SW-COMMON] ⚠️ Chave privada RSA não encontrada no perfil.");
      return null;
    }

    const privateDecrypt = await crypto.subtle.importKey(
      "jwk",
      profile.e2ePrivateKeyJwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["decrypt"]
    );
    console.log("[SW-COMMON] 🔑 Chave de decodificação RSA encontrada e importada.");
    return privateDecrypt;
  } catch (err) {
    console.error("[SW-COMMON] ❌ Erro ao buscar chave de decodificação:", err);
    return null;
  }
}

export async function salvarContato(contato: any) {
  try {
    garantirStores();
    const key = await serializarPublicKeyVapid(contato.publicKeyVapid);
    await set(key, contato, storeContatos);
    console.log(`[SW-COMMON] ✅ Contato ${contato.email} salvo com chave hash: ${key.substring(0, 8)}...`);
  } catch (err) {
    console.error(`[SW-COMMON] ❌ Erro ao salvar contato:`, err);
  }
}

export async function buscarContatoPorPublicKey(publicKeyVapid: any) {
  try {
    garantirStores();
    const key = await serializarPublicKeyVapid(publicKeyVapid);
    return await get(key, storeContatos);
  } catch (err) {
    console.error("[SW-COMMON] ❌ Erro ao buscar contato:", err);
    return null;
  }
}

export async function salvarMensagemRecebida(mensagem: any) {
  try {
    garantirStores();
    await set(mensagem.id, mensagem, storeMensagensRecebidasB);
    console.log(`[SW-COMMON] ✅ Mensagem ${mensagem.id} salva.`);
  } catch (err) {
    console.error(`[SW-COMMON] ❌ Erro ao salvar mensagem ${mensagem.id}:`, err);
  }
}