// src/stores/contatosStore.ts
import { signal } from '@preact/signals';
import { 
  listarContatos, 
  salvarContato, 
  removerContato, 
  homologarContato, 
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
    const hash = await serializarPublicKeyVapid(c.publicKeyVapid);
    return { contato: c, hash };
  }));
  contatosComHash.value = comHash;
}

export async function adicionarContato(contato: Contato) {
  await salvarContato(contato);
  await carregarContatos();
}

export async function removerContatoPorPublicKey(publicKeyVapid: JsonWebKey) {
  await removerContato(publicKeyVapid);
  await carregarContatos();
}

export async function homologarContatoPorPublicKey(publicKeyVapid: JsonWebKey) {
  await homologarContato(publicKeyVapid);
  await carregarContatos();
}

export async function buscarContatoPorHash(hash: string): Promise<Contato | undefined> {
  const item = contatosComHash.value.find(item => item.hash === hash);
  if (item) return item.contato;
  return await buscarContatoPorChave(hash);
}

export async function initContatosStore() {
  await carregarContatos();
}

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'CONTATO_ATUALIZADO') {
      carregarContatos();
    }
  });
}