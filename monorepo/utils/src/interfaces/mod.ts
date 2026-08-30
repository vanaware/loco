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
  name: string;
  size: number;
  type: string;
  createdAt: number;
  modifiedAt: number;
}

// TODO IA: no novo worker-db, função opfs(), "id" deverá ser "_id" para pasta meta data
export interface PastaMetadata {
  id: string;
  name: string;
  magnetURI?: string;
  infoHash?: string;
  status: 'seeding' | 'downloading' | 'standby';
  complete: number;
  permission: 'public' | 'listed' | 'trusted';
  contatos: string[];
  files: FileMetadata[];
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

// 🔥 ESTRATÉGIA DE TIPAGEM: Usamos string literals explícitos em vez de
// `esbuild.LegalComments`, `esbuild.Platform`, etc. porque o esm.sh não
// re-exporta esses tipos internos do esbuild como membros do namespace.
// String literals mantêm autocomplete + type-safety e são independentes
// de como o esm.sh expõe a tipagem.

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

/** Plataformas suportadas pelo esbuild */
export type EsbuildPlatform = "browser" | "node" | "neutral";

/** Formatos de saída suportados pelo esbuild */
export type EsbuildFormat = "esm" | "iife" | "cjs";

/** Estratégias de source map */
export type EsbuildSourcemap = boolean | "linked" | "inline" | "external";

/** Modos JSX */
export type EsbuildJsx = "automatic" | "transform" | "preserve";

/** O que fazer com comentários legais */
export type EsbuildLegalComments = "none" | "inline" | "eof" | "linked" | "external";

/** O que remover do bundle (console, debugger) */
export type EsbuildDrop = "console" | "debugger";

/** Charset de saída */
export type EsbuildCharset = "ascii" | "utf8";

/** Níveis de log do esbuild */
export type EsbuildLogLevel = "verbose" | "debug" | "info" | "warning" | "error" | "silent";

/** Loaders disponíveis para diferentes tipos de arquivo */
export type EsbuildLoader =
  | "js" | "jsx" | "ts" | "tsx" | "css" | "json" | "text"
  | "base64" | "dataurl" | "file" | "binary" | "empty" | "copy";

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
   */
  mode?: TargetMode;

  // --- Configurações do Esbuild (TODAS configuráveis) ---
  entryPoints: string[];
  platform?: EsbuildPlatform;
  format?: EsbuildFormat;
  bundle?: boolean;
  minify?: boolean;
  sourcemap?: EsbuildSourcemap;
  jsx?: EsbuildJsx;
  jsxImportSource?: string;
  conditions?: string[];
  define?: Record<string, string>;
  drop?: EsbuildDrop[];
  external?: string[];
  metafile?: boolean;
  write?: boolean;
  treeShaking?: boolean;
  legalComments?: EsbuildLegalComments;
  keepNames?: boolean;
  outfile?: string;
  splitting?: boolean;
  loader?: Record<string, EsbuildLoader>;
  alias?: Record<string, string>;
  inject?: string[];
  banner?: { js?: string; css?: string };
  footer?: { js?: string; css?: string };
  target?: string | string[];
  charset?: EsbuildCharset;
  logLevel?: EsbuildLogLevel;
  logLimit?: number;
  logOverride?: Record<string, EsbuildLogLevel>;
  entryNames?: string;
  chunkNames?: string;
  assetNames?: string;
  publicPath?: string;
  pure?: string[];
}

export interface GlobalTargetConfig {
  [targetName: string]: TargetConfig;
}

// ============================================================================
// 📦 TIPOS E INTERFACES EXPORT
// ============================================================================

/**
 * Configuração de um modo de exportação.
 * Genérica o suficiente para ser usada em qualquer projeto.
 */
export interface ExportConfig {
  /** Caminho do arquivo de saída (relativo à raiz do projeto) */
  arquivoSaida: string;
  /** Extensões de arquivo que devem ser incluídas */
  extensoesPermitidas: string[];
  /** Pasta base onde a varredura começa */
  pastaBase: string;
  /** Subpastas dentro de pastaBase que devem ser varridas */
  subpastasPermitidas: string[];
  /** Caminhos adicionais fora de pastaBase que devem ser incluídos */
  caminhosAdicionaisPermitidos?: string[];
  /** Arquivos específicos na raiz de pastaBase que devem ser incluídos */
  arquivosRaizPermitidos: string[];
  /** Se deve incluir a versão do app no cabeçalho */
  incluiVersao: boolean;
  /** Texto de instrução para a IA no cabeçalho */
  instrucaoCustomizada: string;
  /**
   * Determina se o modo é incluído automaticamente quando nenhum modo
   * é especificado via CLI.
   *
   * - `true` ou `undefined`: Incluído por padrão (comportamento padrão)
   * - `false`: Só roda quando explicitamente solicitado via CLI
   *
   * @example
   * ```typescript
   * ui: { default: true, ... }       // Roda por padrão
   * tests: { default: false, ... }   // Só roda com: deno task export tests
   * ```
   */
  default?: boolean;
}