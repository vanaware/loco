// src/constants/db.ts
export const DB_NAMES = {
  IDENTIDADE_A: "BrowserA_Identidade_DB",
  BUNDLES_A: "BrowserA_Bundles_DB",
  MENSAGENS_ENVIO_A: "BrowserA_MensagensEnvio_DB",

  CHAVES_E2E_B: "BrowserB_E2E_Chaves_DB",
  CHAVES_VAPID_B: "BrowserB_Vapid_DB",
  SUBSCRIPTION_B: "BrowserB_Subscription_DB",
  MENSAGENS_RECEBIDAS_B: "BrowserB_MensagensRecebidas_DB",
  CONTATOS: "BrowserB_Contatos_DB", // Chave primária: SHA-256 da chave pública VAPID
} as const;

export const STORE_NAMES = {
  KEYVAL: "keyval",
} as const;

export const KEY_NAMES = {
  IDENTIDADE_A: "identidade_a",
  PUBLIC_KEY_A: "public_key_a",
  BUNDLE_ATIVO: "bundle_ativo",
  BUNDLE_HISTORICO: "bundle_historico",
  MENSAGENS_ENVIO: "mensagens_envio",
  CHAVES_E2E_B: "chaves_e2e_b",
  PUBLIC_ENCRYPT_B: "public_encrypt_b",
  CHAVES_VAPID_B: "chaves_vapid_b",
  SUBSCRIPTION_B: "subscription_b",
  SUBSCRIPTION_ENDPOINT_B: "subscription_endpoint_b",
  MENSAGENS_RECEBIDAS: "mensagens_recebidas",
  CONTATO: "contato_",
} as const;

// ============================================================
// INTERFACES
// ============================================================

export interface IdentidadeA {
  name: string;
  email: string;
  privateKey: CryptoKey; // chave privada VAPID (ECDSA)
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
}

export interface ChavesVapidB {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}

export interface SubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  vapidPublicKey?: JsonWebKey;
  createdAt: number;
  updatedAt: number;
}

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
  contatoPublicKeyVapid: string; // chave do contato (serializada)
  conteudo: string;
  status: 'nao_lida' | 'lida' | 'notificada';
  recebidoEm: number;
  lidaEm?: number;
  notificadaEm?: number;
}

export interface Contato {
  publicKeyVapid: JsonWebKey;
  email: string;
  nome: string;
  publicKeyRSA: JsonWebKey;
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  vapidPrivateKey: string; // cifrada
  homologado: boolean;
  createdAt: number;
  updatedAt: number;
}