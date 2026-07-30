// src/utils/db-helpers.ts
import { get, set, createStore, del, entries } from "idb-keyval";
import { 
  DB_NAMES, 
  STORE_NAMES, 
  KEY_NAMES, 
  IdentidadeA, 
  ChavesE2EB, 
  ChavesVapidB,
  SubscriptionData,
  BundleData,
  MensagemEnvio,
  MensagemRecebida,
  EmissorHomologado 
} from "../constants/db.ts";

// ============================================================
// Criação de Stores
// ============================================================

export function criarStore(nome: string) {
  return createStore(nome, STORE_NAMES.KEYVAL);
}

// Stores do Browser A
export const storeIdentidadeA = criarStore(DB_NAMES.IDENTIDADE_A);
export const storeFilaDisparosA = criarStore(DB_NAMES.FILA_A); // Legado
export const storeBundlesA = criarStore(DB_NAMES.BUNDLES_A);
export const storeMensagensEnvioA = criarStore(DB_NAMES.MENSAGENS_ENVIO_A); // 🔥 NOVO

// Stores do Browser B
export const storeChavesE2E = criarStore(DB_NAMES.CHAVES_E2E_B);
export const storeListaBranca = criarStore(DB_NAMES.LISTA_BRANCA_B);
export const storeChavesVapid = criarStore(DB_NAMES.CHAVES_VAPID_B);
export const storeSubscription = criarStore(DB_NAMES.SUBSCRIPTION_B);
export const storeMensagensRecebidasB = criarStore(DB_NAMES.MENSAGENS_RECEBIDAS_B); // 🔥 NOVO

// ============================================================
// Funções Genéricas
// ============================================================

export async function salvarChave<T>(store: IDBStore, key: string, value: T): Promise<void> {
  return set(key, value, store);
}

export async function buscarChave<T>(store: IDBStore, key: string): Promise<T | undefined> {
  return get(key, store);
}

export async function removerChave(store: IDBStore, key: string): Promise<void> {
  return del(key, store);
}

export async function listarChaves<T>(store: IDBStore): Promise<[string, T][]> {
  return entries(store) as Promise<[string, T][]>;
}

// ============================================================
// Funções Específicas - Browser A (Identidade)
// ============================================================

export async function salvarIdentidadeA(identidade: IdentidadeA): Promise<void> {
  await salvarChave(storeIdentidadeA, KEY_NAMES.IDENTIDADE_A, identidade);
}

export async function buscarIdentidadeA(): Promise<IdentidadeA | undefined> {
  return buscarChave<IdentidadeA>(storeIdentidadeA, KEY_NAMES.IDENTIDADE_A);
}

export async function salvarPublicKeyA(publicKeyJwk: JsonWebKey): Promise<void> {
  await salvarChave(storeIdentidadeA, KEY_NAMES.PUBLIC_KEY_A, publicKeyJwk);
}

export async function buscarPublicKeyA(): Promise<JsonWebKey | undefined> {
  return buscarChave<JsonWebKey>(storeIdentidadeA, KEY_NAMES.PUBLIC_KEY_A);
}

// ============================================================
// Funções Específicas - Browser A (Bundles)
// ============================================================

export async function salvarBundleAtivo(bundle: any): Promise<void> {
  const bundleData: BundleData = {
    id: `bundle_${Date.now()}`,
    nomeReceptor: bundle.e2e?.ownerName || "Desconhecido",
    emailReceptor: bundle.e2e?.ownerEmail || "Desconhecido",
    bundle: bundle,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarChave(storeBundlesA, KEY_NAMES.BUNDLE_ATIVO, bundleData);
}

export async function buscarBundleAtivo(): Promise<BundleData | undefined> {
  return buscarChave<BundleData>(storeBundlesA, KEY_NAMES.BUNDLE_ATIVO);
}

export async function salvarBundleHistorico(bundle: any): Promise<void> {
  const bundleData: BundleData = {
    id: `bundle_${Date.now()}`,
    nomeReceptor: bundle.e2e?.ownerName || "Desconhecido",
    emailReceptor: bundle.e2e?.ownerEmail || "Desconhecido",
    bundle: bundle,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  const historico = await buscarChave<BundleData[]>(storeBundlesA, KEY_NAMES.BUNDLE_HISTORICO) || [];
  historico.push(bundleData);
  if (historico.length > 10) historico.shift();
  await salvarChave(storeBundlesA, KEY_NAMES.BUNDLE_HISTORICO, historico);
}

export async function buscarHistoricoBundles(): Promise<BundleData[]> {
  return await buscarChave<BundleData[]>(storeBundlesA, KEY_NAMES.BUNDLE_HISTORICO) || [];
}

export async function limparBundleAtivo(): Promise<void> {
  await removerChave(storeBundlesA, KEY_NAMES.BUNDLE_ATIVO);
}

// ============================================================
// Funções Específicas - Browser A (Mensagens de Envio)
// 🔥 NOVO
// ============================================================

export async function salvarMensagemEnvio(mensagem: MensagemEnvio): Promise<void> {
  await salvarChave(storeMensagensEnvioA, mensagem.id, mensagem);
}

export async function buscarMensagemEnvio(id: string): Promise<MensagemEnvio | undefined> {
  return buscarChave<MensagemEnvio>(storeMensagensEnvioA, id);
}

export async function buscarMensagensEnvioPorStatus(status: MensagemEnvio['status']): Promise<MensagemEnvio[]> {
  const todas = await listarMensagensEnvio();
  return todas.filter(m => m.status === status);
}

export async function listarMensagensEnvio(): Promise<MensagemEnvio[]> {
  const entries = await listarChaves<MensagemEnvio>(storeMensagensEnvioA);
  return entries.map(([_, msg]) => msg);
}

export async function atualizarStatusMensagemEnvio(id: string, status: MensagemEnvio['status'], erro?: string): Promise<void> {
  const mensagem = await buscarMensagemEnvio(id);
  if (mensagem) {
    mensagem.status = status;
    mensagem.atualizadoEm = Date.now();
    if (erro) mensagem.erro = erro;
    await salvarMensagemEnvio(mensagem);
  }
}

export async function removerMensagemEnvio(id: string): Promise<void> {
  await removerChave(storeMensagensEnvioA, id);
}

export async function limparMensagensEnvioAntigas(dias: number = 30): Promise<void> {
  const todas = await listarMensagensEnvio();
  const limite = Date.now() - (dias * 24 * 60 * 60 * 1000);
  for (const msg of todas) {
    if (msg.criadoEm < limite && msg.status === 'enviada') {
      await removerMensagemEnvio(msg.id);
    }
  }
}

// ============================================================
// Funções Específicas - Browser B (E2E)
// ============================================================

export async function salvarChavesE2EB(chaves: ChavesE2EB): Promise<void> {
  await salvarChave(storeChavesE2E, KEY_NAMES.CHAVES_E2E_B, chaves);
}

export async function buscarChavesE2EB(): Promise<ChavesE2EB | undefined> {
  return buscarChave<ChavesE2EB>(storeChavesE2E, KEY_NAMES.CHAVES_E2E_B);
}

export async function salvarPublicEncryptB(publicKey: JsonWebKey): Promise<void> {
  await salvarChave(storeChavesE2E, KEY_NAMES.PUBLIC_ENCRYPT_B, publicKey);
}

export async function buscarPublicEncryptB(): Promise<JsonWebKey | undefined> {
  return buscarChave<JsonWebKey>(storeChavesE2E, KEY_NAMES.PUBLIC_ENCRYPT_B);
}

export async function salvarPublicVerifyB(publicKey: JsonWebKey): Promise<void> {
  await salvarChave(storeChavesE2E, KEY_NAMES.PUBLIC_VERIFY_B, publicKey);
}

export async function buscarPublicVerifyB(): Promise<JsonWebKey | undefined> {
  return buscarChave<JsonWebKey>(storeChavesE2E, KEY_NAMES.PUBLIC_VERIFY_B);
}

// ============================================================
// Funções Específicas - Browser B (VAPID)
// ============================================================

export async function salvarChavesVapidB(chaves: ChavesVapidB): Promise<void> {
  await salvarChave(storeChavesVapid, KEY_NAMES.CHAVES_VAPID_B, chaves);
}

export async function buscarChavesVapidB(): Promise<ChavesVapidB | undefined> {
  return buscarChave<ChavesVapidB>(storeChavesVapid, KEY_NAMES.CHAVES_VAPID_B);
}

// ============================================================
// Funções Específicas - Browser B (Subscription)
// ============================================================

export async function salvarSubscriptionB(subscription: SubscriptionData): Promise<void> {
  await salvarChave(storeSubscription, KEY_NAMES.SUBSCRIPTION_B, subscription);
}

export async function buscarSubscriptionB(): Promise<SubscriptionData | undefined> {
  return buscarChave<SubscriptionData>(storeSubscription, KEY_NAMES.SUBSCRIPTION_B);
}

export async function salvarSubscriptionEndpointB(endpoint: string): Promise<void> {
  await salvarChave(storeSubscription, KEY_NAMES.SUBSCRIPTION_ENDPOINT_B, endpoint);
}

export async function buscarSubscriptionEndpointB(): Promise<string | undefined> {
  return buscarChave<string>(storeSubscription, KEY_NAMES.SUBSCRIPTION_ENDPOINT_B);
}

export async function removerSubscriptionB(): Promise<void> {
  await removerChave(storeSubscription, KEY_NAMES.SUBSCRIPTION_B);
  await removerChave(storeSubscription, KEY_NAMES.SUBSCRIPTION_ENDPOINT_B);
}

// ============================================================
// Funções Específicas - Browser B (Lista Branca)
// ============================================================

export async function salvarEmissorHomologado(email: string, emissor: EmissorHomologado): Promise<void> {
  await salvarChave(storeListaBranca, email, emissor);
}

export async function buscarEmissorHomologado(email: string): Promise<EmissorHomologado | undefined> {
  return buscarChave<EmissorHomologado>(storeListaBranca, email);
}

export async function listarEmissoresHomologados(): Promise<[string, EmissorHomologado][]> {
  return listarChaves<EmissorHomologado>(storeListaBranca);
}

// ============================================================
// Funções Específicas - Browser B (Mensagens Recebidas)
// 🔥 NOVO
// ============================================================

export async function salvarMensagemRecebida(mensagem: MensagemRecebida): Promise<void> {
  await salvarChave(storeMensagensRecebidasB, mensagem.id, mensagem);
}

export async function buscarMensagemRecebida(id: string): Promise<MensagemRecebida | undefined> {
  return buscarChave<MensagemRecebida>(storeMensagensRecebidasB, id);
}

export async function buscarMensagensRecebidasPorStatus(status: MensagemRecebida['status']): Promise<MensagemRecebida[]> {
  const todas = await listarMensagensRecebidas();
  return todas.filter(m => m.status === status);
}

export async function listarMensagensRecebidas(): Promise<MensagemRecebida[]> {
  const entries = await listarChaves<MensagemRecebida>(storeMensagensRecebidasB);
  return entries.map(([_, msg]) => msg);
}

export async function atualizarStatusMensagemRecebida(id: string, status: MensagemRecebida['status']): Promise<void> {
  const mensagem = await buscarMensagemRecebida(id);
  if (mensagem) {
    mensagem.status = status;
    if (status === 'lida') mensagem.lidaEm = Date.now();
    if (status === 'notificada') mensagem.notificadaEm = Date.now();
    await salvarMensagemRecebida(mensagem);
  }
}

export async function removerMensagemRecebida(id: string): Promise<void> {
  await removerChave(storeMensagensRecebidasB, id);
}

export async function limparMensagensRecebidasAntigas(dias: number = 30): Promise<void> {
  const todas = await listarMensagensRecebidas();
  const limite = Date.now() - (dias * 24 * 60 * 60 * 1000);
  for (const msg of todas) {
    if (msg.recebidoEm < limite && msg.status === 'lida') {
      await removerMensagemRecebida(msg.id);
    }
  }
}


const PERFIL_B_KEY = "perfil_b";

export async function salvarPerfilB(nome: string, email: string): Promise<void> {
  await salvarChave(storeChavesE2E, PERFIL_B_KEY, { nome, email, atualizadoEm: Date.now() });
}

export async function buscarPerfilB(): Promise<{ nome: string; email: string; atualizadoEm: number } | undefined> {
  return buscarChave(storeChavesE2E, PERFIL_B_KEY);
}