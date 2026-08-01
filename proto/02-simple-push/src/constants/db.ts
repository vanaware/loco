// src/constants/db.ts
export const DB_NAMES = {
  // Browser A
  IDENTIDADE_A: "BrowserA_Identidade_DB",
  FILA_A: "BrowserA_OfflineFila_DB",
  BUNDLES_A: "BrowserA_Bundles_DB",
  MENSAGENS_ENVIO_A: "BrowserA_MensagensEnvio_DB",

  // Browser B
  CHAVES_E2E_B: "BrowserB_E2E_Chaves_DB",
  LISTA_BRANCA_B: "BrowserB_ListaBranca_DB",
  CHAVES_VAPID_B: "BrowserB_Vapid_DB",
  SUBSCRIPTION_B: "BrowserB_Subscription_DB",
  MENSAGENS_RECEBIDAS_B: "BrowserB_MensagensRecebidas_DB",
} as const;

export const STORE_NAMES = {
  KEYVAL: "keyval",
} as const;

export const KEY_NAMES = {
  // Browser A - Identidade (agora armazena chave privada VAPID)
  IDENTIDADE_A: "identidade_a",
  PUBLIC_KEY_A: "public_key_a",   // chave pública VAPID (com metadados)

  // Browser A - Fila Offline (legado)
  FILA_OFFLINE: "fila_offline",

  // Browser A - Bundles (do Browser B)
  BUNDLE_ATIVO: "bundle_ativo",
  BUNDLE_HISTORICO: "bundle_historico",

  // Browser A - Mensagens de Envio
  MENSAGENS_ENVIO: "mensagens_envio",

  // Browser B - E2E (agora apenas RSA de criptografia)
  CHAVES_E2E_B: "chaves_e2e_b",
  PUBLIC_ENCRYPT_B: "public_encrypt_b",
  // PUBLIC_VERIFY_B foi removido – a verificação usa a chave pública VAPID

  // Browser B - VAPID
  CHAVES_VAPID_B: "chaves_vapid_b",
  VAPID_PUBLIC_B: "vapid_public_b",
  VAPID_PRIVATE_B: "vapid_private_b",

  // Browser B - Subscription
  SUBSCRIPTION_B: "subscription_b",
  SUBSCRIPTION_ENDPOINT_B: "subscription_endpoint_b",

  // Browser B - Lista Branca (armazena chave pública VAPID dos emissores)
  LISTA_BRANCA: "lista_branca",

  // Browser B - Mensagens Recebidas
  MENSAGENS_RECEBIDAS: "mensagens_recebidas",
} as const;

// ============================================================
// INTERFACES
// ============================================================

export interface IdentidadeA {
  name: string;
  email: string;
  privateKey: CryptoKey;   // Agora é a chave privada VAPID (ECDSA P-256)
}

export interface BundleData {
  id: string;
  nomeReceptor: string;
  emailReceptor: string;
  bundle: any;            // O bundle completo (contém subscription, vapid, e2e)
  createdAt: number;
  updatedAt: number;
}

/**
 * Chaves E2E do Browser B – agora apenas RSA para criptografia.
 * A assinatura/verificação é feita com as chaves VAPID.
 */
export interface ChavesE2EB {
  privateDecrypt: CryptoKey;       // RSA privada para decifrar mensagens recebidas
  publicEncrypt: JsonWebKey;       // RSA pública para cifrar mensagens (enviada no bundle)
  // privateSign e publicSign foram removidos – usamos VAPID
}

export interface ChavesVapidB {
  publicKey: JsonWebKey;           // ECDSA P-256 pública
  privateKey: JsonWebKey;          // ECDSA P-256 privada (cifrada no bundle)
}

export interface SubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  vapidPublicKey?: JsonWebKey;     // Chave pública VAPID usada na subscription
  createdAt: number;
  updatedAt: number;
}

export interface MensagemEnvio {
  id: string;
  bundle: any;
  payloadText: string;             // JWT completo
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
  dadosJwt: any;                   // Payload do JWT (inclui 'publicKey' VAPID)
  publicKey?: JsonWebKey;          // Chave pública VAPID do emissor (para verificação)
  homologado?: boolean;
  assinaturaValida?: boolean;
  // Dados completos do emissor para resposta (inclui subscription, chaves públicas)
  emissorCompleto?: {
    nome: string;
    email: string;
    publicKeyEncrypt: JsonWebKey;  // RSA pública para cifrar resposta
    publicKeyVapid: JsonWebKey;    // Chave pública VAPID (para verificação)
    subscription?: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };
    // private VAPID não é armazenado aqui – está cifrado no bundle original
  };
  bundleEmissor?: {
    subscription: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };
    vapid: {
      subject: string;
      publicKey: JsonWebKey;      // pública VAPID
      privateKey: string;         // privada VAPID cifrada (para o servidor)
    };
    isVapidEncrypted: boolean;
    nome: string;
    email: string;
    publicKeyEncrypt: JsonWebKey;  // RSA pública para cifrar resposta
    publicKeyVapid: JsonWebKey;    // VAPID pública para verificação
  };
  status: 'nao_lida' | 'lida' | 'notificada';
  recebidoEm: number;
  lidaEm?: number;
  notificadaEm?: number;
}

export interface EmissorHomologado {
  email: string;
  name: string;
  jwk: JsonWebKey;   // Agora armazena a chave pública VAPID (ECDSA)
}