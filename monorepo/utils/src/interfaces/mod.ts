// TODO IA: no novo worker-db, "_id" fixo em "profile" para ProfileConfig

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
    proxyserver?: string;
  };
  createdAt: number;
  updatedAt: number;
}

// TODO IA: no novo worker-db, "id" deverá ser "_id" para chat

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
  // 🔥 ARQUITETURA: Ponteiro opcional para a Pasta/Coleção no OPFS
  metadataId?: string; 
}

export type MeStatus = 'trusted' | 'none' | 'wrong' | 'saved' | 'deleted';

// TODO IA: no novo worker-db, "id" deverá ser "_id" para contato

export interface Contato {
  id: string; 
  email: string;
  name: string;
  vapidPublicKey: JsonWebKey;
  e2ePublicKey: JsonWebKey;
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    proxyserver?: string;
  };
  vapidPrivateKeyEnvelope: string;
  trusted: boolean;
  me: MeStatus;
  createdAt: number;
  updatedAt: number;
}

// TODO IA: no novo worker-db, função opfs(), usar interface OpfsFileInfo que já tem em db.ts

// 🔥 ARQUITETURA: Nova Estrutura Baseada em Pastas/Manifestos P2P
export interface FileMetadata {
  name: string;      // Nome original (ex: foto.jpg). É o mesmo nome salvo no OPFS dentro da pasta.
  size: number;      // Tamanho em bytes
  type: string;      // MIME Type (ex: image/jpeg, video/mp4)
  createdAt: number; 
  modifiedAt: number;
}

// TODO IA: no novo worker-db, função opfs(), "id" deverá ser "_id" para pasta meta data

export interface PastaMetadata {
  id: string;                                    // ID único da pasta (gerado e espelhado pelo Manifesto JSON)
  name: string;                                  // Nome da pasta
  magnetURI?: string;                            // Magnet URI da coleção (opcional se a pasta for estritamente local por enquanto)
  infoHash?: string;                             // Identificador único da rede BitTorrent (útil para resume e caching)
  status: 'seeding' | 'downloading' | 'standby'; // Standby: o motor P2P ignora essa pasta ao ligar
  complete: number;                              // 0 a 100 (% dos bytes baixados)
  permission: 'public' | 'listed' | 'trusted';   // Controle de distribuição do Handshake do Magnet URI
  contatos: string[];                            // Array de hashes de contatos com acesso explícito (usado se 'listed')
  files: FileMetadata[];                         // Lista de arquivos contidos na pasta
  createdAt: number;
  modifiedAt: number;
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
  excluida?: string;
  limparHistorico?: boolean; 
  campos?: string[];
  data?: Record<string, unknown>;
}


export interface ContatoRouteData {
  id?: string;
  removerContato?: boolean; 
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

// TODO IA: no novo worker-db, "id" deverá ser "_id" para handshake

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

export interface FetchProxyOptions extends Omit<RequestInit, 'body' | 'headers'> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body?: any; 
  specificProxy?: string; 
  headers?: any; 
}

// TODO IA: no novo worker-db, função ls(), "id" deverá ser "_id" para debug 

export interface DebugLogPayload {
  id: string;
  timestamp: string;
  type: "info" | "warn" | "error" | "success";
  module: string;
  message: string;
  details?: unknown;
}

// ============================================================================
// 📦 TIPOS ESBUILD
// ============================================================================

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

export interface ParsedArgs {
  /** Alvos de build a processar (exclui alvos watch) */
  targets: string[];
  /** Flag global para não incrementar versão */
  globalNoVersion: boolean;
  /** Nome do alvo watch a executar, ou null se não estiver em modo watch */
  watchTarget: string | null;
}

/** Modo de operação do alvo */
export type TargetMode = 'build' | 'watch';

export interface TargetConfig {
  // --- Configurações de Pipeline (Pré/Post Build) ---
  publicdir?: string;
  srcdir: string;
  distdir: string;
  indexHtml?: boolean;
  clean?: string[];

  /**
   * Determina se o alvo é incluído automaticamente quando nenhum alvo
   * é especificado via CLI.
   *
   * - `true` ou `undefined`: Incluído por padrão (comportamento padrão)
   * - `false`: Só roda quando explicitamente solicitado via CLI
   *
   * ⚠️ Esta propriedade é IGNORADA para alvos com `mode: 'watch'`.
   * Alvos watch nunca são incluídos na lista de targets padrão.
   *
   * @example
   * ```typescript
   * ui: { default: true, ... }       // Roda por padrão
   * admin: { default: false, ... }   // Só roda com: deno task build admin
   * ```
   */
  default?: boolean;

  /**
   * Modo de operação do alvo.
   *
   * - `'build'`: Alvo normal de build (padrão). Compila e termina.
   * - `'watch'`: Modo de desenvolvimento contínuo. Monitora mudanças
   *   e rebuilda automaticamente. O processo fica vivo até Ctrl+C.
   *
   * ⚠️ Se múltiplos alvos tiverem `mode: 'watch'`, apenas o PRIMEIRO
   * (na ordem do CONFIG) é executado quando a flag `watch` é usada.
   * Para usar um watch específico, solicite-o pelo nome.
   *
   * @example
   * ```typescript
   * ui: { mode: 'build', ... }       // Build normal (padrão)
   * 'watch-ui': { mode: 'watch', ... }    // Watch principal
   * 'watch-admin': { mode: 'watch', ... } // Watch secundário
   * ```
   */
  mode?: TargetMode;

  // --- Configurações do Esbuild (TODAS configuráveis) ---
  entryPoints: string[];
  platform?: "browser" | "node" | "neutral";
  format?: "esm" | "iife" | "cjs";
  bundle?: boolean;
  minify?: boolean;
  sourcemap?: boolean | "linked" | "inline" | "external";
  jsx?: "automatic" | "transform" | "preserve";
  jsxImportSource?: string;
  conditions?: string[];
  define?: Record<string, string>;
  drop?: string[];
  external?: string[];
  metafile?: boolean;
  write?: boolean;
  treeShaking?: boolean;
  legalComments?: "none" | "inline" | "eof" | "linked" | "external";
  keepNames?: boolean;
  outfile?: string;
  splitting?: boolean;
  loader?: Record<string, string>;
  alias?: Record<string, string>;
  inject?: string[];
  banner?: { js?: string; css?: string };
  footer?: { js?: string; css?: string };
  target?: string | string[];
  charset?: "ascii" | "utf8";
  logLevel?: "verbose" | "debug" | "info" | "warning" | "error" | "silent";
  logLimit?: number;
  logOverride?: Record<string, string>;
  entryNames?: string;
  chunkNames?: string;
  assetNames?: string;
  publicPath?: string;
  pure?: string[];
}

export interface GlobalTargetConfig {
  [targetName: string]: TargetConfig;
}