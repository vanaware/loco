// src/stores/mensagensStore.ts
import { signal } from '@preact/signals';
import {
  listarMensagensRecebidas,
  listarMensagensEnviadas,
  salvarMensagemRecebida,
  salvarMensagemEnviada,
  atualizarStatusMensagemRecebida as dbAtualizarStatusRecebida,
  atualizarStatusMensagemEnviada as dbAtualizarStatusEnviada,
  removerMensagemRecebida,
  removerMensagemEnviada,
} from '../utils/db-helpers.ts';
import type { MensagemRecebida, MensagemEnviada } from '../constants/db.ts';

export const mensagensRecebidas = signal<MensagemRecebida[]>([]);
export const mensagensEnviadas = signal<MensagemEnviada[]>([]);

/**
 * Carrega o histórico completo do banco. 
 * Deve ser chamado APENAS na inicialização do app.
 */
export async function carregarMensagensRecebidas() {
  const lista = await listarMensagensRecebidas();
  lista.sort((a, b) => b.recebidoEm - a.recebidoEm);
  mensagensRecebidas.value = lista;
}

export async function carregarMensagensEnviadas() {
  const lista = await listarMensagensEnviadas();
  lista.sort((a, b) => b.createdAt - a.createdAt);
  mensagensEnviadas.value = lista;
}

/**
 * Atualização Otimista: Injeta na memória instantaneamente e depois salva no DB
 */
export async function adicionarMensagemRecebida(mensagem: MensagemRecebida) {
  // 1. Atualiza a memória (Signal) clonando raso para evitar re-renderização total
  mensagensRecebidas.value = [mensagem, ...mensagensRecebidas.value].sort((a, b) => b.recebidoEm - a.recebidoEm);
  // 2. Persiste no banco em background
  await salvarMensagemRecebida(mensagem);
}

export async function adicionarMensagemEnviada(mensagem: MensagemEnviada) {
  mensagensEnviadas.value = [mensagem, ...mensagensEnviadas.value].sort((a, b) => b.createdAt - a.createdAt);
  await salvarMensagemEnviada(mensagem);
}

/**
 * Atualização Granular: Modifica apenas a mensagem específica sem buscar o DB inteiro
 */
export async function marcarMensagemRecebidaComoLida(id: string) {
  // Modificação direta em memória
  const atual = mensagensRecebidas.value;
  const index = atual.findIndex(m => m.id === id);
  if (index !== -1) {
    const nova = [...atual];
    nova[index] = { ...nova[index], status: 'lida', lidaEm: Date.now() };
    mensagensRecebidas.value = nova;
  }
  // Sincronização em background com o DB
  await dbAtualizarStatusRecebida(id, 'lida');
}

export async function atualizarStatusDeMensagemEnviada(id: string, status: MensagemEnviada['status'], erro?: string) {
  const atual = mensagensEnviadas.value;
  const index = atual.findIndex(m => m.id === id);
  if (index !== -1) {
    const nova = [...atual];
    const msgAtualizada = { ...nova[index], status, updatedAt: Date.now() };
    if (erro) msgAtualizada.erro = erro;
    nova[index] = msgAtualizada;
    mensagensEnviadas.value = nova;
  }
  
  await dbAtualizarStatusEnviada(id, status, erro);
}

export async function removerMensagemRecebidaPorId(id: string) {
  mensagensRecebidas.value = mensagensRecebidas.value.filter(m => m.id !== id);
  await removerMensagemRecebida(id);
}

export async function removerMensagemEnviadaPorId(id: string) {
  mensagensEnviadas.value = mensagensEnviadas.value.filter(m => m.id !== id);
  await removerMensagemEnviada(id);
}

export async function initMensagensStore() {
  await carregarMensagensRecebidas();
  await carregarMensagensEnviadas();
}