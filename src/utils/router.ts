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

  // Reset states
  contatoSelecionado.value = '';
  contatoCompartilharHash.value = null;
  showAdvanced.value = false;
  sharePayload.value = null;

  if (hash.startsWith('#chat=')) {
    contatoSelecionado.value = hash.substring(6);
    currentMobileView.value = 'chat';
  } else if (hash.startsWith('#detail=')) {
    contatoCompartilharHash.value = hash.substring(8);
    currentMobileView.value = 'chat';
  } else if (hash === '#advanced') {
    showAdvanced.value = true;
    currentMobileView.value = 'chat';
  // 🔥 CORREÇÃO: Adicionamos '#settings' para que ele ocupe a área principal no mobile
  } else if (hash === '#profile' || hash === '#logout' || hash === '#settings') {
    currentMobileView.value = 'chat'; 
  } else if (hash.startsWith('#share')) {
    currentMobileView.value = 'chat';
    // Extrai o payload caso venha via URL: #share=jwt_aqui
    if (hash.includes('=')) {
      sharePayload.value = hash.substring(hash.indexOf('=') + 1);
    }
  } else {
    // Se não for nenhuma das telas acima, volta para a lista (sidebar)
    currentMobileView.value = 'list';
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