// src/stores/mensagensStore.ts
import { signal, batch } from '@preact/signals';
import { listarChatPaginado, salvarChat, buscarChat, removerChat } from '../../../utils/src/db/mod.ts';
import { ExpurgarMensagens } from '../handshakes/hand-mensagem.ts';
import type { Chat } from '../../../utils/src/interfaces/db.ts';
import { contatoSelecionado } from './state.ts';

export const mensagensAtivas = signal<Chat[]>([]);
export const hasMoreMessages = signal<boolean>(true);
export const isFetchingMensagens = signal<boolean>(false);

const PAGE_SIZE = 30;
let currentOffset = 0;

export function limparMemoriaChat() {
  batch(() => {
    mensagensAtivas.value = [];
    hasMoreMessages.value = true;
    isFetchingMensagens.value = false;
    currentOffset = 0;
  });
}

export async function inicializarChat(contatoHash: string) {
  limparMemoriaChat();
  await carregarMaisMensagens(contatoHash);
}

export async function carregarMaisMensagens(contatoHash: string) {
  if (isFetchingMensagens.value || !hasMoreMessages.value) return;
  
  isFetchingMensagens.value = true;

  try {
    const novas = await listarChatPaginado(contatoHash, PAGE_SIZE, currentOffset);
    
    if (contatoHash !== contatoSelecionado.value) {
      return; 
    }
    
    batch(() => {
      if (novas.length < PAGE_SIZE) {
        hasMoreMessages.value = false;
      }

      if (novas.length > 0) {
        currentOffset += novas.length;
        const unificadas = [...novas, ...mensagensAtivas.value];
        mensagensAtivas.value = unificadas.sort((a, b) => a.createdAt - b.createdAt);
      }
    });
  } finally {
    isFetchingMensagens.value = false;
  }
}

export async function atualizarOuAdicionarChatAtivo(chat: Chat) {
  if (chat.contatoHash === contatoSelecionado.value) {
    const atual = mensagensAtivas.value;
    const index = atual.findIndex(m => m.id === chat.id);
    
    if (index !== -1) {
      const nova = [...atual];
      nova[index] = chat;
      mensagensAtivas.value = nova;
    } else {
      mensagensAtivas.value = [...atual, chat];
      currentOffset += 1;
    }
  }

  await salvarChat(chat);
}

export async function processarAtualizacaoDeStatusDB(chatId: string) {
  const chatAtualizado = await buscarChat(chatId);
  if (chatAtualizado) {
    await atualizarOuAdicionarChatAtivo(chatAtualizado);
  } else {
    // Se a mensagem não está mais no DB ou o histórico foi limpo
    const atual = mensagensAtivas.value;
    const existe = atual.some(m => m.id === chatId || chatId === 'ALL_PURGED');
    if (existe) {
      batch(() => {
        mensagensAtivas.value = chatId === 'ALL_PURGED' ? [] : atual.filter(m => m.id !== chatId);
        currentOffset = chatId === 'ALL_PURGED' ? 0 : Math.max(0, currentOffset - 1);
      });
    }
  }
}

export async function excluirMensagem(msgId: string, contatoHash: string) {
  // 1. Otimista (limpa da tela imediatamente)
  if (contatoSelecionado.value === contatoHash) {
    batch(() => {
      mensagensAtivas.value = mensagensAtivas.value.filter(m => m.id !== msgId);
      currentOffset = Math.max(0, currentOffset - 1);
    });
  }

  // 2. Busca a mensagem no banco antes de apagar
  const msgLocal = await buscarChat(msgId);
  
  const deveAvisarRemoto = msgLocal && msgLocal.handshake !== 'self';

  // 3. Apaga do IndexedDB
  await removerChat(msgId, contatoHash);

  // 4. Delega para o Service Worker enviar a notificação de exclusão remota
  if (deveAvisarRemoto && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg.active) {
        reg.active.postMessage({
          type: 'CRIAR_HANDSHAKE_OUT',
          payload: {
            rotasModulo: 'mensagem',
            params: { function: 'excluirMensagem', contato: contatoHash, msgId: msgId }
          }
        });
      }
    } catch (e) {
      console.warn("Falha ao enviar handshake de exclusão remota", e);
    }
  }
}

export async function limparTodoHistorico(contatoHash: string) {
  if (contatoSelecionado.value === contatoHash) {
    limparMemoriaChat();
  }
  // 🔥 Envia 'true' no segundo parâmetro para disparar o Handshake Único de expurgo do histórico no dispositivo remoto
  await ExpurgarMensagens(contatoHash, true);
}

export async function initMensagensStore() {}