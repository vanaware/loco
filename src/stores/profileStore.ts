// src/stores/profileStore.ts
import { signal } from '@preact/signals';
import { buscarProfile, salvarProfile } from '../utils/db-helpers.ts';
import type { ProfileConfig } from '../constants/db.ts';
import { profileName, profileEmail, addDebugLog } from '../signals/state.ts';

// Mutex simples para evitar condições de corrida ao salvar o perfil ativamente
let isSavingProfile = false;

export const profile = signal<ProfileConfig | null>(null);

export async function carregarProfile() {
  try {
    const p = await buscarProfile();
    profile.value = p || null;
    
    // 🔥 Preenche a UI passivamente com os dados salvos no banco de dados
    if (p) {
      profileName.value = p.name;
      profileEmail.value = p.email;
    }
  } catch (error) {
    addDebugLog("error", "STORE:PROFILE", "Falha ao carregar perfil do DB", error);
  }
}

/**
 * Atualiza o Profile localmente de forma síncrona e engatilha o DB assíncrono.
 * Implementa um mutex (isSavingProfile) caso multiplas chamadas tentem
 * gravar coisas simultâneas.
 */
export async function atualizarProfile(p: ProfileConfig) {
  // 1. Atualização Otimista na Memória
  profile.value = { ...p };
  profileName.value = p.name;
  profileEmail.value = p.email;
  
  if (isSavingProfile) {
      addDebugLog("warn", "STORE:PROFILE", "Salvamento de perfil enfileirado/ignorado por concorrência.");
      return; // Previne gravações corrompidas e cruzadas
  }

  // 2. Persistência Isolada com Trava
  isSavingProfile = true;
  try {
    await salvarProfile(p);
  } catch (error) {
    addDebugLog("error", "STORE:PROFILE", "Falha catastrófica ao persistir perfil no DB.", error);
    // Em um app real pesado, faríamos um rollback aqui recarregando do DB: await carregarProfile()
  } finally {
    isSavingProfile = false;
  }
}

export async function initProfileStore() {
  await carregarProfile();
}