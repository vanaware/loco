// src/stores/contatosStore.ts
import { signal, computed } from "@preact/signals";
import {
  listarContatos,
  salvarContato,
  removerContato,
  serializarPublicKeyVapid,
  buscarProfile,
  removerContatoPorHash,
  listarHandshakes,
  removerHandshake
} from "../utils/db-helpers.ts";
import type { Contato } from "../constants/db.ts";
import { addDebugLog } from "../utils/debug-utils.ts";
import { gerarContatoProprio } from "../utils/self-contact-utils.ts";

import { ExpurgarMensagens } from "../handshakes/hand-mensagem.ts";
import { ExpurgarHandshakesContato } from "../handshakes/hand-contato.ts";
import { ExpurgarHandshakesProfile } from "../handshakes/hand-profile.ts";

export type { Contato };

export const contatosRaw = signal<Contato[]>([]);

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

export async function carregarContatos(): Promise<void> {
  try {
    const lista = await listarContatos();
    
    // 🔥 Carrega o contato próprio (baseado no profile) e adiciona à lista
    const profile = await buscarProfile();
    if (profile) {
      const contatoProprio = await gerarContatoProprio(profile);
      if (contatoProprio) {
        const indexExistente = lista.findIndex(c => c.id === contatoProprio.id);
        if (indexExistente >= 0) {
          lista[indexExistente] = contatoProprio;
        } else {
          lista.push(contatoProprio);
        }
      }
    }
    
    contatosRaw.value = lista;
    addDebugLog("info", "STORE:CONTATO", `Carregados ${lista.length} contatos do banco local`);
  } catch (err) {
    addDebugLog("error", "STORE:CONTATO", "Erro ao carregar contatos do IndexedDB", err);
  }
}

let isContatosListenerInitialized = false;

export async function initContatosStore(): Promise<void> {
  await carregarContatos();

  if (!isContatosListenerInitialized && 'serviceWorker' in navigator) {
    isContatosListenerInitialized = true;
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'CONTATO_ATUALIZADO') {
        carregarContatos();
      }
    });
  }
}

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

// Retrocompatibilidade (Chamará o expurgo completo internamente)
export async function removerContatoPorPublicKey(vapidPublicKey: JsonWebKey): Promise<void> {
  try {
    const hash = await serializarPublicKeyVapid(vapidPublicKey);
    await removerContatoCompletamente(hash);
  } catch (err) {
    addDebugLog("error", "STORE:CONTATO", "Erro ao remover contato por chave pública", err);
  }
}

// 🔥 ARQUITETURA: Orquestrador Central de Expurgo (Wipeout)
export async function removerContatoCompletamente(hash: string): Promise<void> {
  try {
    addDebugLog("warn", "STORE:CONTATO", `Iniciando EXPURGO DE DADOS TOTAL para o contato ${hash}`);

    // 1. Remove da UI localmente primeiro (Optimistic Update)
    contatosRaw.value = contatosRaw.value.filter(c => c.id !== hash);
    
    // 2. Aciona os expurgos modulares para limpar as entranhas da máquina de estados
    await ExpurgarMensagens(hash);
    await ExpurgarHandshakesContato(hash);
    await ExpurgarHandshakesProfile(hash);
    
    // 3. (Fallback de Segurança) Limpa também qualquer handshake genérico órfão desse aud
    const handshakes = await listarHandshakes();
    for (const h of handshakes) {
      if (h.aud === hash) await removerHandshake(h.id);
    }

    // 4. Remove o contato físico do banco de dados de contatos
    await removerContatoPorHash(hash);
    
    addDebugLog("success", "STORE:CONTATO", `Contato ${hash} e DADOS VINCULADOS expurgados com sucesso.`);
  } catch (err) {
    addDebugLog("error", "STORE:CONTATO", "Erro catastrófico ao expurgar contato e histórico", err);
    throw err;
  }
}

export async function homologarContatoPorPublicKey(vapidPublicKey: JsonWebKey): Promise<void> {
  try {
    const hash = await serializarPublicKeyVapid(vapidPublicKey);
    const atual = contatosRaw.value;
    const index = atual.findIndex(c => c.id === hash);
    
    if (index >= 0 && atual[index]) {
      const contatoAtual = atual[index];
      const contatoModificado: Contato = { ...contatoAtual, trusted: true, updatedAt: Date.now() };
      const novaLista = [...atual];
      novaLista[index] = contatoModificado;
      contatosRaw.value = novaLista;
      
      await salvarContato(contatoModificado);
      addDebugLog("success", "STORE:CONTATO", `Contato homologado como confiável: ${contatoModificado.name}`);
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
  if (index >= 0 && atual[index]) {
    const contatoAtual = atual[index];
    const contatoModificado: Contato = { ...contatoAtual, me: meStatus, updatedAt: Date.now() };
    const novaLista = [...atual];
    novaLista[index] = contatoModificado;
    contatosRaw.value = novaLista;
    
    salvarContato(contatoModificado).catch(err => {
        addDebugLog("error", "STORE:CONTATO", `Erro em background ao atualizar status do contato ${id}`, err);
    });
  } else {
    addDebugLog("error", "STORE:CONTATO", `Contato ${id} não encontrado na memória para atualizar status`);
  }
}