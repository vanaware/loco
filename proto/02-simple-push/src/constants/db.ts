// src/constants/db.ts

export const DB_NAMES = {
  CONFIG: "AppConfig_DB",
  MENSAGENS_ENVIADAS: "BrowserA_MensagensEnviadas_DB",
  CONTATOS: "BrowserB_Contatos_DB",
  MENSAGENS_RECEBIDAS_B: "BrowserB_MensagensRecebidas_DB",
  HANDSHAKES: "Handshake_DB", // NOVO
} as const;

export const STORE_NAMES = {
  KEYVAL: "keyval",
} as const;

export const KEY_NAMES = {
  PROFILE: "profile",
  MENSAGENS_ENVIADAS: "mensagens_enviadas",
  CONTATO: "contato_",
  MENSAGENS_RECEBIDAS: "mensagens_recebidas",
} as const;

// ============================================================
// Constantes
// ============================================================
export const MAX_TENTATIVAS = 3;

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
  vapidPrivateKeyJwk: JsonWebKey;  // chave privada em JWK (para assinar)
  vapidPrivateKeyEnvelope: string; // envelope cifrado da chave privada (para enviar ao proxy)

  // Chaves E2E (RSA-OAEP) – completas
  e2ePublicKey: JsonWebKey;
  e2ePrivateKeyJwk: JsonWebKey;    // chave privada em JWK (para decifrar envelopes)

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
// INTERFACES DE DADOS
// ============================================================

export interface MensagemEnviada {
  id: string;                      // Ex: "msg_1738765432100_abc123"
  contatoHash: string;             // hash SHA-256 da chave pública VAPID do contato
  conteudo: string;                // texto original da mensagem
  status: 'pendente' | 'enviando' | 'enviada' | 'falha';
  tentativas: number;
  createdAt: number;
  updatedAt: number;
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
  vapidPrivateKey: string;   // envelope cifrado da chave privada VAPID (para o proxy)
  homologado: boolean;
  createdAt: number;
  updatedAt: number;
}

// ============================================================
// NOVA INTERFACE: HANDSHAKE
// ============================================================

export interface Handshake {
  id: string;                     // NanoID (12 caracteres)
  mensagemId: string;            // ID da mensagem original (para confirmação de entrega)
  tipo: 'confirmacao_entrega';   // (futuramente: 'recebimento', 'leitura', etc.)
  direcao: 'out' | 'in';         // enviado ou recebido
  status: 'pendente' | 'enviado' | 'falha' | 'entregue'; // 'entregue' para recebidos processados
  tentativas: number;
  payload: any;                  // dados adicionais específicos do tipo
  createdAt: number;
  updatedAt: number;
  erro?: string;
}