// src/constants/db.ts

export const DB_NAMES = {
  CONFIG: "AppConfig_DB",
  CHAT: "Chat_DB", // 🔥 Unificou MensagensEnviadas e MensagensRecebidas
  CONTATOS: "BrowserB_Contatos_DB",
  HANDSHAKES: "Handshake_DB",
} as const;

export const STORE_NAMES = {
  KEYVAL: "keyval",
} as const;

export const KEY_NAMES = {
  PROFILE: "profile",
  CONTATO: "contato_",
  CHAT_INDEX: "chat_index_", // 🔥 Novo prefixo para guardar os arrays de paginação
} as const;

export const MAX_TENTATIVAS = 3;
export const MAX_PAYLOAD_SIZE = 4096;

export interface ProfileConfig {
  name: string;
  email: string;
  vapidPublicKey: JsonWebKey;
  vapidPrivateKeyJwk: JsonWebKey;
  vapidPrivateKeyEnvelope: string;
  e2ePublicKey: JsonWebKey;
  e2ePrivateKeyJwk: JsonWebKey;
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
  createdAt: number;
  updatedAt: number;
}

// 🔥 Nova Estrutura Unificada e Baseada em Timestamps
export interface Chat {
  id: string;
  contatoHash: string;
  conteudo: string;
  tipo: 'in' | 'out';
  readAt?: number;
  notifiedAt?: number;
  receivedAt?: number;
  sentAt?: number;
  createdAt: number;
  updatedAt?: number;
  errorAt?: number;
  handshake: string;
}

export type MeStatus = 'trusted' | 'none' | 'wrong' | 'saved';

export interface Contato {
  id: string; 
  email: string;
  name: string;
  vapidPublicKey: JsonWebKey;
  e2ePublicKey: JsonWebKey;
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  vapidPrivateKeyEnvelope: string;
  trusted: boolean;
  me: MeStatus;
  createdAt: number;
  updatedAt: number;
}

export interface ProfileRouteData {
  campos?: string[];
  data?: Record<string, unknown>;
  id?: string;
}

export interface MensagemRouteData {
  recebida?: string;
  enviada?: string;
  conteudo?: string;
  campos?: string[];
  data?: Record<string, unknown>;
}

export interface ContatoRouteData {
  id?: string;
  campos?: string[];
  data?: Record<string, unknown>;
  sync?: Record<string, unknown>;
}

export interface HandshakeRotas { 
  profile?: ProfileRouteData; 
  mensagem?: MensagemRouteData; 
  contato?: ContatoRouteData; 
  [key: string]: unknown;
}

export type StatusIn = 'recebido' | 'processando' | 'processado' | 'falha';
export type StatusOut = 'pendente' | 'enviando' | 'enviado' | 'falha' | 'entregue';

export interface FluxoIn {
  status: StatusIn;
  rotas: HandshakeRotas;
  tentativas: number; 
  erro?: string;
}

export interface FluxoOut {
  status: StatusOut;
  rotas: HandshakeRotas;
  tentativas: number; 
  erro?: string;
}

export interface Handshake { 
  id: string; 
  aud: string; 
  in?: FluxoIn; 
  out?: FluxoOut; 
  createdAt: number; 
  updatedAt: number; 
}

export interface EnvelopeCifrado {
  i: string;
  d: string;
  k: string;
}