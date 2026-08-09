// src/stores/contatosStore.ts
import { signal } from '@preact/signals';
import { 
  listarContatos, 
  salvarContato, 
  removerContato, 
  buscarContatoPorChave,
  serializarPublicKeyVapid,
} from '../utils/db-helpers.ts';
import type { Contato } from '../constants/db.ts';

export const contatos = signal<Contato[]>([]);
export const contatosComHash = signal<Array<{ contato: Contato; hash: string }>>([]);

export async function carregarContatos() {
  const lista = await listarContatos();
  contatos.value = lista;
  const comHash = await Promise.all(lista.map(async (c) => {
    // Usamos vapidPublicKey no lugar de publicKeyVapid
    const hash = await serializarPublicKeyVapid(c.vapidPublicKey);
    return { contato: c, hash };
  }));
  contatosComHash.value = comHash;
}

export async function adicionarContato(contato: Contato) {
  await salvarContato(contato);
  await carregarContatos();
}

export async function removerContatoPorPublicKey(vapidPublicKey: JsonWebKey) {
  await removerContato(vapidPublicKey);
  await carregarContatos();
}

export async function homologarContatoPorPublicKey(vapidPublicKey: JsonWebKey) {
  const hash = await serializarPublicKeyVapid(vapidPublicKey);
  const contato = await buscarContatoPorChave(hash);
  if (contato) {
    contato.trusted = true; // Substitui o antigo 'homologado'
    contato.updatedAt = Date.now();
    await salvarContato(contato);
    await carregarContatos();
  }
}

export async function buscarContatoPorHash(hash: string): Promise<Contato | undefined> {
  const item = contatosComHash.value.find(item => item.hash === hash);
  if (item) return item.contato;
  return await buscarContatoPorChave(hash);
}

export async function initContatosStore() {
  await carregarContatos();
}

// Ouve os avisos do novo Service Worker Router para recarregar a tela
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'CONTATO_ATUALIZADO') {
      carregarContatos();
    }
  });
}