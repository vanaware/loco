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

// 🔥 Signals dedicados para o sistema de Toast não-bloqueante (MD3)
export interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
  visible: boolean;
}

export const toastState = signal<ToastState>({
  message: '',
  type: 'info',
  visible: false,
});

let toastTimer: number | null = null;

export function showToast(msg: string, type: 'success' | 'error' | 'info' = 'info'): void {
  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastState.value = {
    message: msg,
    type,
    visible: true,
  };

  // Oculta automaticamente após 3.5 segundos
  toastTimer = setTimeout(() => {
    toastState.value = { ...toastState.value, visible: false };
  }, 3500) as unknown as number;
}

export function addDebugLog(
  typeOrMsg: string,
  moduleOrDetails?: any,
  message?: string,
  details?: unknown
): void {
  emitLog(typeOrMsg, moduleOrDetails, message, details);
}

export function clearDebugLogs(): void {}