// src/stores/profileStore.ts
import { signal } from '@preact/signals';
import { buscarProfile, salvarProfile } from '../utils/db-helpers.ts';
import type { ProfileConfig } from '../constants/db.ts';

export const profile = signal<ProfileConfig | null>(null);

export async function carregarProfile() {
  const p = await buscarProfile();
  profile.value = p || null;
}

export async function atualizarProfile(p: ProfileConfig) {
  await salvarProfile(p);
  profile.value = p;
}

export async function initProfileStore() {
  await carregarProfile();
}