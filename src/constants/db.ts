// src/constants/db.ts

export const DB_NAMES = {
  CONFIG: "AppConfig_DB",
  MENSAGENS_ENVIADAS: "BrowserA_MensagensEnviadas_DB",
  CONTATOS: "BrowserB_Contatos_DB",
  MENSAGENS_RECEBIDAS_B: "BrowserB_MensagensRecebidas_DB",
  HANDSHAKES: "Handshake_DB",
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

export interface MensagemEnviada {
  id: string;
  contatoHash: string;
  conteudo: string;
  status: 'pendente' | 'enviando' | 'enviada' | 'falha' | 'entregue';
  tentativas: number;
  createdAt: number;
  updatedAt: number;
  erro?: string;
}

export interface MensagemRecebida {
  id: string;
  contatoPublicKeyVapid: string;
  conteudo: string;
  status: 'nao_lida' | 'lida' | 'notificada';
  recebidoEm: number;
  lidaEm?: number;
  notificadaEm?: number;
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

// 🔥 Removidos os Any: O compilador agora checará as fronteiras
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
  [key: string]: unknown; // Garante extensibilidade futura segura sem "any"
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