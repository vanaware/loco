// src/signals/state.ts
import { signal } from '@preact/signals';

// Define qual visualização está ativa no layout mobile
// 'list' = mostra a sidebar (contatos), 'chat' = mostra a área de mensagens, 'profile' = mostra configurações
export const currentMobileView = signal<'list' | 'chat' | 'profile'>('list');

export const contatoSelecionado = signal<string>('');
export const mensagemEnvio = signal<string>('');

// 🔥 Inicializamos vazios em vez de "Alice" para evitar o piscar na tela
export const profileInput = signal<string>('');
export const profileName = signal<string>('');
export const profileEmail = signal<string>('');
export const debugLogs = signal<string[]>([]);

export function addDebugLog(msg: string): void {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = `[${timestamp}] ${msg}`;
  debugLogs.value = [...debugLogs.value, logEntry];
  console.log(msg);
}

export function clearDebugLogs(): void {
  debugLogs.value = [];
}

export function showToast(msg: string, type: 'success' | 'error' | 'info' = 'info'): void {
  alert(`${type.toUpperCase()}: ${msg}`);
}