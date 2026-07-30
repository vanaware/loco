// src/constants/db.ts
export const DB_NAMES = {
  // Browser A
  IDENTIDADE_A: "BrowserA_Identidade_DB",
  FILA_A: "BrowserA_OfflineFila_DB",
  BUNDLES_A: "BrowserA_Bundles_DB",
  MENSAGENS_ENVIO_A: "BrowserA_MensagensEnvio_DB", // 🔥 NOVO
  
  // Browser B
  CHAVES_E2E_B: "BrowserB_E2E_Chaves_DB",
  LISTA_BRANCA_B: "BrowserB_ListaBranca_DB",
  CHAVES_VAPID_B: "BrowserB_Vapid_DB",
  SUBSCRIPTION_B: "BrowserB_Subscription_DB",
  MENSAGENS_RECEBIDAS_B: "BrowserB_MensagensRecebidas_DB", // 🔥 NOVO
} as const;

export const STORE_NAMES = {
  KEYVAL: "keyval",
} as const;

export const KEY_NAMES = {
  // Browser A - Identidade
  IDENTIDADE_A: "identidade_a",
  PUBLIC_KEY_A: "public_key_a",
  
  // Browser A - Fila Offline (legado, será substituído)
  FILA_OFFLINE: "fila_offline",
  
  // Browser A - Bundles (do Browser B)
  BUNDLE_ATIVO: "bundle_ativo",
  BUNDLE_HISTORICO: "bundle_historico",
  
  // Browser A - Mensagens de Envio
  MENSAGENS_ENVIO: "mensagens_envio",
  
  // Browser B - E2E
  CHAVES_E2E_B: "chaves_e2e_b",
  PUBLIC_ENCRYPT_B: "public_encrypt_b",
  PUBLIC_VERIFY_B: "public_verify_b",
  
  // Browser B - VAPID
  CHAVES_VAPID_B: "chaves_vapid_b",
  VAPID_PUBLIC_B: "vapid_public_b",
  VAPID_PRIVATE_B: "vapid_private_b",
  
  // Browser B - Subscription
  SUBSCRIPTION_B: "subscription_b",
  SUBSCRIPTION_ENDPOINT_B: "subscription_endpoint_b",
  
  // Browser B - Lista Branca
  LISTA_BRANCA: "lista_branca",
  
  // Browser B - Mensagens Recebidas
  MENSAGENS_RECEBIDAS: "mensagens_recebidas",
} as const;

// ============================================================
// Interfaces para Mensagens
// ============================================================

export interface MensagemEnvio {
  id: string;
  bundle: any;
  payloadText: string;
  mensagemOriginal: string;
  destinatario: string;
  status: 'pendente' | 'enviando' | 'enviada' | 'falha';
  tentativas: number;
  maxTentativas: number;
  criadoEm: number;
  atualizadoEm: number;
  erro?: string;
}

export interface MensagemRecebida {
  id: string;
  remetente: string;
  remetenteEmail: string;
  titulo: string;
  conteudo: string;
  dadosJwt: any;
  status: 'nao_lida' | 'lida' | 'notificada';
  recebidoEm: number;
  lidaEm?: number;
  notificadaEm?: number;
}

// ============================================================
// Interfaces Existentes
// ============================================================

export interface IdentidadeA {
  name: string;
  email: string;
  privateKey: CryptoKey;
}

export interface BundleData {
  id: string;
  nomeReceptor: string;
  emailReceptor: string;
  bundle: any;
  createdAt: number;
  updatedAt: number;
}

export interface ChavesE2EB {
  privateDecrypt: CryptoKey;
  publicEncrypt: JsonWebKey;
  privateSign: CryptoKey;
  publicSign: JsonWebKey;
}

export interface ChavesVapidB {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}

export interface SubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  vapidPublicKey?: JsonWebKey;
  createdAt: number;
  updatedAt: number;
}

export interface EmissorHomologado {
  email: string;
  name: string;
  jwk: JsonWebKey;
}