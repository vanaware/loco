// src/utils/router.ts
import { signal, computed, effect } from "@preact/signals";
import {
  contatoSelecionado,
  contatoCompartilharHash,
  showAdvanced,
  currentMobileView,
  sharePayload
} from "../signals/state.ts";

export const currentHash = signal<string>(globalThis.location?.hash || "");

if (typeof globalThis !== "undefined" && globalThis.addEventListener) {
  globalThis.addEventListener("hashchange", () => {
    currentHash.value = globalThis.location.hash;
  });
}

export function navigate(hash: string) {
  if (typeof globalThis !== "undefined") {
    globalThis.location.hash = hash;
  }
}

effect(() => {
  const hash = currentHash.value;

  // Reset states genéricos
  contatoSelecionado.value = '';
  contatoCompartilharHash.value = null;
  showAdvanced.value = false;

  if (hash.startsWith('#chat=')) {
    contatoSelecionado.value = hash.substring(6);
    currentMobileView.value = 'chat';
    sharePayload.value = null;
  } else if (hash.startsWith('#detail=')) {
    contatoCompartilharHash.value = hash.substring(8);
    currentMobileView.value = 'chat';
    sharePayload.value = null;
  } else if (hash === '#advanced') {
    showAdvanced.value = true;
    currentMobileView.value = 'chat';
    sharePayload.value = null;
  } else if (hash === '#profile') {
    currentMobileView.value = 'chat';
    // 🔥 ARQUITETURA: Não limpamos o sharePayload aqui! 
    // Ele precisa sobreviver ao redirecionamento automático do Route Guard
    // para que o ProfileSection consiga ler e processar o convite do anfitrião.
  } else if (hash === '#logout' || hash === '#settings') {
    currentMobileView.value = 'chat';
    sharePayload.value = null;
  } else if (hash.startsWith('#share')) {
    currentMobileView.value = 'chat';
    // Extrai o payload caso venha via URL
    if (hash.includes('=')) {
      sharePayload.value = hash.substring(hash.indexOf('=') + 1);
    }
  } else {
    // Home / Lista de Contatos
    currentMobileView.value = 'list';
    sharePayload.value = null;
  }
});

export const activeView = computed(() => {
  const hash = currentHash.value;
  if (hash.startsWith('#chat=')) return 'chat';
  if (hash.startsWith('#detail=')) return 'detail';
  if (hash === '#advanced') return 'advanced';
  if (hash === '#profile') return 'profile';
  if (hash === '#logout') return 'logout';
  if (hash.startsWith('#share')) return 'share';
  if (hash === '#settings') return 'settings';
  return 'home';
});