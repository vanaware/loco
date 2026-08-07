// src/stores/profileStore.ts
import { signal } from '@preact/signals';
import { buscarProfile, salvarProfile } from '../utils/db-helpers.ts';
import type { ProfileConfig } from '../constants/db.ts';
import { profileName, profileEmail } from '../signals/state.ts';

export const profile = signal<ProfileConfig | null>(null);

export async function carregarProfile() {
  const p = await buscarProfile();
  profile.value = p || null;
  
  // 🔥 Preenche a UI automaticamente com os dados salvos no banco de dados
  if (p) {
    profileName.value = p.name;
    profileEmail.value = p.email;
  }
}

export async function atualizarProfile(p: ProfileConfig) {
  await salvarProfile(p);
  profile.value = p;
  
  // 🔥 Atualiza a UI quando salvamos um novo perfil
  profileName.value = p.name;
  profileEmail.value = p.email;
}

export async function initProfileStore() {
  await carregarProfile();
}