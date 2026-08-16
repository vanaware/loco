// src/stores/mensagensStore.ts
import { signal } from '@preact/signals';
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
  // Reset de estado
  currentOffset = 0;
  hasMoreMessages.value = true;
  mensagensAtivas.value = [];
  
  await carregarMaisMensagens(contatoHash);
}

/**
 * Lazy Loader: Busca a próxima fatia do IndexedDB e empurra para a RAM.
 */
export async function carregarMaisMensagens(contatoHash: string) {
  // Bloqueio preventivo
  if (isFetching || !hasMoreMessages.value) return;
  
  isFetching = true;

  try {
    const novas = await listarChatPaginado(contatoHash, PAGE_SIZE, currentOffset);
    
    // 🔥 SEGURANÇA: Verificação de contexto
    // Se o usuário mudou o contato durante o await, descartamos os dados do contato anterior.
    if (contatoHash !== contatoSelecionado.value) {
      return; 
    }
    
    if (novas.length < PAGE_SIZE) {
      hasMoreMessages.value = false;
    }

    if (novas.length > 0) {
      currentOffset += novas.length;
      
      // Adicionamos as antigas no início, preservando a ordem cronológica
      const unificadas = [...novas, ...mensagensAtivas.value];
      mensagensAtivas.value = unificadas.sort((a, b) => a.createdAt - b.createdAt);
    }
  } finally {
    isFetching = false;
  }
}

/**
 * Atualização Otimista O(1): Insere/Atualiza diretamente na memória sem engasgar o app
 */
export async function atualizarOuAdicionarChatAtivo(chat: Chat) {
  // 1. Atualiza memória apenas se o chat pertencer ao contato que está na tela
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
  const chatAtualizado = await buscarChat(chatId);
  if (chatAtualizado) {
    await atualizarOuAdicionarChatAtivo(chatAtualizado);
  }
}

export async function initMensagensStore() {
  // Inicialização sob demanda pela UI
}