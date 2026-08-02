// src/constants/db.ts

export const DB_NAMES = {
  CONFIG: "AppConfig_DB",
  MENSAGENS_ENVIO_A: "BrowserA_MensagensEnvio_DB",
  CONTATOS: "BrowserB_Contatos_DB",
  MENSAGENS_RECEBIDAS_B: "BrowserB_MensagensRecebidas_DB",
} as const;

export const STORE_NAMES = {
  KEYVAL: "keyval",
} as const;

export const KEY_NAMES = {
  PROFILE: "profile",
  MENSAGENS_ENVIO: "mensagens_envio",
  CONTATO: "contato_",
  MENSAGENS_RECEBIDAS: "mensagens_recebidas",
} as const;

// ============================================================
// INTERFACES PRINCIPAIS (UNIFICADAS)
// ============================================================

/**
 * Perfil do usuário – armazenado na store AppConfig_DB com a chave "profile".
 * Contém todas as informações necessárias para identificar o usuário,
 * assinar mensagens, cifrar/decifrar e receber notificações.
 */
export interface ProfileConfig {
  // Identidade do usuário
  name: string;
  email: string;

  // Chaves VAPID (ECDSA P-256) – completas
  vapidPublicKey: JsonWebKey;
  vapidPrivateKeyJwk: JsonWebKey;  // chave privada exportável (para assinar)

  // Chaves E2E (RSA-OAEP) – completas
  e2ePublicKey: JsonWebKey;
  e2ePrivateKeyJwk: JsonWebKey;    // chave privada exportável (para decifrar)

  // Subscription do Web Push
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };

  // Metadados
  createdAt: number;
  updatedAt: number;
}

// ============================================================
// INTERFACES DE DADOS (MANTIDAS)
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
  contatoPublicKeyVapid: string; // hash SHA-256
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
  vapidPrivateKey: string;   // cifrada
  homologado: boolean;
  createdAt: number;
  updatedAt: number;
}