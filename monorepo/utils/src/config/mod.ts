declare const __APP_VERSION__: string;

export const APP_VERSION = __APP_VERSION__;

export * from "./proxy.ts"

export const MAX_TENTATIVAS = 3;

export const MAX_PAYLOAD_SIZE = 4096;

export const DB_NAMES = {
  CONFIG: "AppConfig_DB",
  CHAT: "Chat_DB", 
  CONTATOS: "BrowserB_Contatos_DB",
  HANDSHAKES: "Handshake_DB",
  // 🔥 ARQUITETURA: Banco atualizado para mapear as Pastas (Coleções de Mídia/Torrents)
  MIDIAS: "Midias_Metadata_DB" 
} as const;

export const STORE_NAMES = {
  KEYVAL: "keyval",
} as const;

export const KEY_NAMES = {
  PROFILE: "profile",
  CONTATO: "contato_",
  CHAT_INDEX: "chat_index_", 
} as const;

export const DefaultProxyPath: string = "/";

export const FallbackAbsoluteProxy: string = "https://proxy.vanaware.com";

export const PROXY_PATH_KEY = 'ProxyPath';

export const DEBUG_CHANNEL_NAME = "loco_debug_channel";