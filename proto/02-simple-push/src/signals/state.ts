// src/signals/state.ts
import { signal } from '@preact/signals';

export const contatoSelecionado = signal<string>('');
export const mensagemEnvio = signal<string>('');
export const profileInput = signal<string>('');
export const profileName = signal<string>('Alice');
export const profileEmail = signal<string>('alice@example.com');
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