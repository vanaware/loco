// src/stores/profileStore.ts
import { signal, batch } from '@preact/signals';
import { buscarProfile, salvarProfile } from '../utils/db-helpers.ts';
import type { ProfileConfig } from '../constants/db.ts';
import { profileName, profileEmail, addDebugLog } from '../signals/state.ts';

// 🔥 ARQUITETURA: Transformado em signal para que a UI reaja e bloqueie botões
export const isSavingProfile = signal<boolean>(false);
export const profile = signal<ProfileConfig | null>(null);

export async function carregarProfile() {
  try {
    const p = await buscarProfile();
    
    // 🔥 ARQUITETURA: Uso de batch para agrupar as mudanças de estado e evitar múltiplos renders
    batch(() => {
      profile.value = p || null;
      if (p) {
        profileName.value = p.name;
        profileEmail.value = p.email;
      }
    });
  } catch (error) {
    addDebugLog("error", "STORE:PROFILE", "Falha ao carregar perfil do DB", error);
  }
}

/**
 * Atualiza o Profile localmente de forma síncrona e engatilha o DB assíncrono.
 */
export async function atualizarProfile(p: ProfileConfig) {
  if (isSavingProfile.value) {
      addDebugLog("warn", "STORE:PROFILE", "Salvamento de perfil enfileirado/ignorado por concorrência.");
      return; 
  }

  // 1. Atualização Otimista na Memória agrupada
  batch(() => {
    profile.value = { ...p };
    profileName.value = p.name;
    profileEmail.value = p.email;
  });

  // 2. Persistência Isolada com trava reativa
  isSavingProfile.value = true;
  try {
    await salvarProfile(p);
  } catch (error) {
    addDebugLog("error", "STORE:PROFILE", "Falha catastrófica ao persistir perfil no DB.", error);
  } finally {
    isSavingProfile.value = false;
  }
}

export async function initProfileStore() {
  await carregarProfile();
}