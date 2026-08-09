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

export interface Contato {
  publicKeyVapid: JsonWebKey;
  email: string;
  nome: string;
  publicKeyRSA: JsonWebKey;
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  vapidPrivateKey: string;
  homologado: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Handshake {
  id: string;
  mensagemId: string;
  tipo: 'confirmacao_entrega' | 'solicitar_dados' | 'resposta_dados';
  direcao: 'out' | 'in';
  status: 'pendente' | 'enviando' | 'enviado' | 'falha' | 'entregue';
  tentativas: number;
  payload: any;
  createdAt: number;
  updatedAt: number;
  erro?: string;
}

export interface PayloadMensagem {
  sub: "msg";
  aud: string;
  jti: string;
  ct: string;
  iat?: number;
}

export interface PayloadHandshake {
  sub: "hand";
  aud: string;
  jti: string;
  ct: string;
}

export interface ConteudoMensagem {
  c: string;
  e: {
    s?: {
      e?: string;
      endpoint?: string;
      k?: { p256dh: string; auth: string };
      keys?: { p256dh: string; auth: string };
      v?: string;
    };
    p?: JsonWebKey;
  };
}

export interface ConteudoHandshake {
  tipo: 'confirmacao_entrega' | 'solicitar_dados' | 'resposta_dados';
  [key: string]: any;
}