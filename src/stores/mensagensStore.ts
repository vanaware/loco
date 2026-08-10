// src/stores/mensagensStore.ts
import { signal, computed } from '@preact/signals';
import { listarChatPaginado, salvarChat, buscarChat } from '../utils/db-helpers.ts';
import type { Chat } from '../constants/db.ts';
import { contatoSelecionado } from '../signals/state.ts';

// O Cache ativo de mensagens na RAM
export const mensagensAtivas = signal<Chat[]>([]);
export const hasMoreMessages = signal<boolean>(true);

const PAGE_SIZE = 30;
let currentOffset = 0;
let isFetching = false;

/**
 * Reseta e carrega a primeira página de mensagens do contato selecionado.
 */
export async function inicializarChat(contatoHash: string) {
  currentOffset = 0;
  hasMoreMessages.value = true;
  mensagensAtivas.value = [];
  await carregarMaisMensagens(contatoHash);
}

/**
 * Lazy Loader: Busca a próxima fatia do IndexedDB e empurra para a RAM.
 */
export async function carregarMaisMensagens(contatoHash: string) {
  if (isFetching || !hasMoreMessages.value) return;
  isFetching = true;

  try {
    const novas = await listarChatPaginado(contatoHash, PAGE_SIZE, currentOffset);
    
    if (novas.length < PAGE_SIZE) {
      hasMoreMessages.value = false;
    }

    if (novas.length > 0) {
      currentOffset += novas.length;
      
      // Como estamos carregando de trás pra frente (paginação reversa), 
      // adicionamos as antigas no início do array
      mensagensAtivas.value = [...novas, ...mensagensAtivas.value].sort((a, b) => a.createdAt - b.createdAt);
    }
  } finally {
    isFetching = false;
  }
}

/**
 * Atualização Otimista O(1): Insere/Atualiza diretamente na memória sem engasgar o app
 */
export async function atualizarOuAdicionarChatAtivo(chat: Chat) {
  // 1. Atualiza memória (se o chat pertencer à tela atual)
  if (chat.contatoHash === contatoSelecionado.value) {
    const atual = mensagensAtivas.value;
    const index = atual.findIndex(m => m.id === chat.id);
    
    if (index !== -1) {
      const nova = [...atual];
      nova[index] = chat;
      mensagensAtivas.value = nova;
    } else {
      // É nova, empurra pro final da fila e soma no offset
      mensagensAtivas.value = [...atual, chat];
      currentOffset += 1;
    }
  }

  // 2. Persiste assincronamente no DB
  await salvarChat(chat);
}

/**
 * Helper chamado pelos Handshakes no SW (via Broadcast/PostMessage)
 */
export async function processarAtualizacaoDeStatusDB(chatId: string) {
  // Busca a versão consolidada que o SW acabou de gravar no DB
  const chatAtualizado = await buscarChat(chatId);
  if (chatAtualizado) {
    await atualizarOuAdicionarChatAtivo(chatAtualizado);
  }
}

export async function initMensagensStore() {
  // A inicialização inicial agora é vazia, pois carregamos sob demanda na UI
}