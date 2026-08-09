// src/stores/contatosStore.ts
import { signal, computed } from "@preact/signals";
import {
  listarContatos,
  salvarContato,
  removerContato,
  serializarPublicKeyVapid,
  buscarContatoPorPublicKey,
} from "../utils/db-helpers.ts";
import type { Contato } from "../constants/db.ts";
import { addDebugLog } from "../utils/debug-utils.ts";

export type { Contato };

export const contatosRaw = signal<Contato[]>([]);

/**
 * Signal computado que mapeia os contatos junto com seus hashes SHA-256 das chaves VAPID.
 * Utilizado por ChatSection, ContactDetailSection e ContatosSection.
 */
export const contatosComHash = computed(() => {
  return contatosRaw.value.map((contato) => ({
    contato,
    hash: contato.id,
  }));
});

export const contatosMap = computed(() => {
  const map = new Map<string, Contato>();
  for (const c of contatosRaw.value) {
    map.set(c.id, c);
  }
  return map;
});

/**
 * Carrega a lista de contatos do IndexedDB para a memória
 */
export async function carregarContatos(): Promise<void> {
  try {
    const lista = await listarContatos();
    contatosRaw.value = lista;
    addDebugLog("info", "STORE:CONTATO", `Carregados ${lista.length} contatos do banco local`);
  } catch (err) {
    addDebugLog("error", "STORE:CONTATO", "Erro ao carregar contatos do IndexedDB", err);
  }
}

/**
 * Inicializa a store de contatos
 */
export async function initContatosStore(): Promise<void> {
  await carregarContatos();
}

/**
 * Adiciona ou atualiza um contato no banco IndexedDB e recarrega o estado reativo
 */
export async function adicionarContato(contato: Contato): Promise<void> {
  try {
    await salvarContato(contato);
    await carregarContatos();
    addDebugLog("success", "STORE:CONTATO", `Contato salvo: ${contato.name} (${contato.id})`);
  } catch (err) {
    addDebugLog("error", "STORE:CONTATO", `Erro ao adicionar contato ${contato.id}`, err);
    throw err;
  }
}

export function adicionarOuAtualizarContato(contato: Contato): void {
  adicionarContato(contato).catch((err) => {
    addDebugLog("error", "STORE:CONTATO", "Falha assíncrona ao adicionar/atualizar contato", err);
  });
}

/**
 * Remove um contato a partir de sua chave pública VAPID
 */
export async function removerContatoPorPublicKey(vapidPublicKey: JsonWebKey): Promise<void> {
  try {
    await removerContato(vapidPublicKey);
    await carregarContatos();
    addDebugLog("warn", "STORE:CONTATO", "Contato removido por chave pública");
  } catch (err) {
    addDebugLog("error", "STORE:CONTATO", "Erro ao remover contato por chave pública", err);
  }
}

/**
 * Marca um contato como verificado/confiável (trusted: true)
 */
export async function homologarContatoPorPublicKey(vapidPublicKey: JsonWebKey): Promise<void> {
  try {
    const contato = await buscarContatoPorPublicKey(vapidPublicKey);
    if (contato) {
      contato.trusted = true;
      contato.updatedAt = Date.now();
      await salvarContato(contato);
      await carregarContatos();
      addDebugLog("success", "STORE:CONTATO", `Contato homologado como confiável: ${contato.name}`);
    } else {
      addDebugLog("warn", "STORE:CONTATO", "Contato não encontrado para homologação");
    }
  } catch (err) {
    addDebugLog("error", "STORE:CONTATO", "Erro ao homologar contato", err);
  }
}

export function atualizarStatusVerificacaoContato(id: string, meStatus: Contato["me"]): void {
  const contato = contatosMap.value.get(id);
  if (contato) {
    const atualizado = { ...contato, me: meStatus, updatedAt: Date.now() };
    adicionarContato(atualizado).catch((err) => {
      addDebugLog("error", "STORE:CONTATO", `Erro ao atualizar status do contato ${id}`, err);
    });
  } else {
    addDebugLog("error", "STORE:CONTATO", `Contato ${id} não encontrado para atualizar status`);
  }
}