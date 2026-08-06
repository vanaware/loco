// src/stores/mensagensStore.ts
import { signal } from '@preact/signals';
import {
  listarMensagensRecebidas,
  listarMensagensEnviadas,
  salvarMensagemRecebida,
  salvarMensagemEnviada,
  atualizarStatusMensagemRecebida,
  atualizarStatusMensagemEnviada,
  removerMensagemRecebida,
  removerMensagemEnviada,
} from '../utils/db-helpers.ts';
import type { MensagemRecebida, MensagemEnviada } from '../constants/db.ts';

export const mensagensRecebidas = signal<MensagemRecebida[]>([]);
export const mensagensEnviadas = signal<MensagemEnviada[]>([]);

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

export async function adicionarMensagemRecebida(mensagem: MensagemRecebida) {
  await salvarMensagemRecebida(mensagem);
  await carregarMensagensRecebidas();
}

export async function adicionarMensagemEnviada(mensagem: MensagemEnviada) {
  await salvarMensagemEnviada(mensagem);
  await carregarMensagensEnviadas();
}

export async function marcarMensagemRecebidaComoLida(id: string) {
  await atualizarStatusMensagemRecebida(id, 'lida');
  await carregarMensagensRecebidas();
}

export async function removerMensagemRecebidaPorId(id: string) {
  await removerMensagemRecebida(id);
  await carregarMensagensRecebidas();
}

export async function removerMensagemEnviadaPorId(id: string) {
  await removerMensagemEnviada(id);
  await carregarMensagensEnviadas();
}

export async function initMensagensStore() {
  await carregarMensagensRecebidas();
  await carregarMensagensEnviadas();
}