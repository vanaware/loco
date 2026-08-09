// src/signals/state.ts
import { signal } from '@preact/signals';
import { addDebugLog as emitLog } from '../utils/debug-utils.ts';

export const currentMobileView = signal<'list' | 'chat' | 'profile'>('list');

export const contatoSelecionado = signal<string>('');
export const contatoCompartilharHash = signal<string | null>(null); 
export const showAdvanced = signal<boolean>(false);
export const mensagemEnvio = signal<string>('');

export const profileInput = signal<string>('');
export const profileName = signal<string>('');
export const profileEmail = signal<string>('');

/**
 * Re-exportação com sobrecarga mantendo compatibilidade com toda a Interface de Usuário
 */
export function addDebugLog(
  typeOrMsg: string,
  moduleOrDetails?: any,
  message?: string,
  details?: unknown
): void {
  emitLog(typeOrMsg, moduleOrDetails, message, details);
}

export function clearDebugLogs(): void {
  // A persistência de limpeza de logs agora ocorre nativamente no DebugPanel.tsx
  // Esta casca existe apenas para não quebrar referências antigas.
}

export function showToast(msg: string, type: 'success' | 'error' | 'info' = 'info'): void {
  alert(`${type.toUpperCase()}: ${msg}`);
}