// src/stores/contatosStore.ts
import { signal, computed } from "@preact/signals";
import {
  listarContatos,
  salvarContato,
  removerContato,
  serializarPublicKeyVapid,
} from "../utils/db-helpers.ts";
import type { Contato } from "../constants/db.ts";
import { addDebugLog } from "../utils/debug-utils.ts";

export type { Contato };

export const contatosRaw = signal<Contato[]>([]);

/**
 * Signal computado que mapeia os contatos junto com seus hashes SHA-256 das chaves VAPID.
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
 * Carrega a lista de contatos do IndexedDB para a memória.
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

export async function initContatosStore(): Promise<void> {
  await carregarContatos();

  // 🔥 Ouve mensagens do Service Worker para sincronizar atualizações em background
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'CONTATO_ATUALIZADO') {
        carregarContatos();
      }
    });
  }
}

/**
 * Adiciona ou atualiza um contato usando Inserção Otimista em Memória
 */
export async function adicionarContato(contato: Contato): Promise<void> {
  try {
    const atual = contatosRaw.value;
    const index = atual.findIndex(c => c.id === contato.id);
    if (index >= 0) {
      const novaLista = [...atual];
      novaLista[index] = contato;
      contatosRaw.value = novaLista;
    } else {
      contatosRaw.value = [...atual, contato];
    }

    await salvarContato(contato);
    addDebugLog("success", "STORE:CONTATO", `Contato salvo em disco: ${contato.name}`);
  } catch (err) {
    addDebugLog("error", "STORE:CONTATO", `Erro ao persistir contato ${contato.id}`, err);
    throw err;
  }
}

export function adicionarOuAtualizarContato(contato: Contato): void {
  adicionarContato(contato).catch((err) => {
    addDebugLog("error", "STORE:CONTATO", "Falha assíncrona ao adicionar/atualizar contato", err);
  });
}

/**
 * Remove um contato com atualização local imediata
 */
export async function removerContatoPorPublicKey(vapidPublicKey: JsonWebKey): Promise<void> {
  try {
    const hash = await serializarPublicKeyVapid(vapidPublicKey);
    
    contatosRaw.value = contatosRaw.value.filter(c => c.id !== hash);
    
    await removerContato(vapidPublicKey);
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
    const hash = await serializarPublicKeyVapid(vapidPublicKey);
    const atual = contatosRaw.value;
    const index = atual.findIndex(c => c.id === hash);
    
    if (index >= 0) {
      const novaLista = [...atual];
      novaLista[index] = { ...novaLista[index], trusted: true, updatedAt: Date.now() };
      contatosRaw.value = novaLista;
      
      await salvarContato(novaLista[index]);
      addDebugLog("success", "STORE:CONTATO", `Contato homologado como confiável: ${novaLista[index].name}`);
    } else {
      addDebugLog("warn", "STORE:CONTATO", "Contato não encontrado em memória para homologação");
    }
  } catch (err) {
    addDebugLog("error", "STORE:CONTATO", "Erro ao homologar contato", err);
  }
}

export function atualizarStatusVerificacaoContato(id: string, meStatus: Contato["me"]): void {
  const atual = contatosRaw.value;
  const index = atual.findIndex(c => c.id === id);
  if (index >= 0) {
    const novaLista = [...atual];
    novaLista[index] = { ...novaLista[index], me: meStatus, updatedAt: Date.now() };
    contatosRaw.value = novaLista;
    
    salvarContato(novaLista[index]).catch(err => {
        addDebugLog("error", "STORE:CONTATO", `Erro em background ao atualizar status do contato ${id}`, err);
    });
  } else {
    addDebugLog("error", "STORE:CONTATO", `Contato ${id} não encontrado na memória para atualizar status`);
  }
}