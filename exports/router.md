> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém os arquivos de configuração e execução do ROUTER @loco/router
> O projeto é o **Loco ** estruturado em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco - Modo: ROUTER

Gerado automaticamente em: 8/26/2026, 7:02:28 AM

---

## Arquivo: `monorepo/router/src/adapters/deno.ts`

```ts
// monorepo/router/src/adapters/deno.ts
// 🦕 Adaptadores para Deno Runtime
import { join } from "@std/path";
import type { WebSocketUpgrader, StaticFileHandler, MimeTypeResolver } from "../mod.ts";

/** Adaptador de WebSocket para Deno */
export const denoWebSocketUpgrader: WebSocketUpgrader = {
  upgrade(req: Request): { socket: WebSocket; response: Response } {
    return Deno.upgradeWebSocket(req);
  },
};

/** Cria um handler de arquivos estáticos para Deno */
export function createDenoStaticFileHandler(
  staticDir: string | null,
  embeddedDir: string | null = null,
  mimeTypeResolver?: MimeTypeResolver,
): StaticFileHandler {
  const resolver = mimeTypeResolver ?? defaultDenoMimeTypeResolver;

  return {
    async handle(path: string): Promise<Response | null> {
      // Tenta embedded primeiro, depois static
      if (embeddedDir) {
        const embedded = await tryServeDir(embeddedDir, path, resolver);
        if (embedded) return embedded;
      }
      if (staticDir) {
        const staticResp = await tryServeDir(staticDir, path, resolver);
        if (staticResp) return staticResp;
      }
      return null;
    },
  };
}

async function tryServeDir(
  baseDir: string,
  pathname: string,
  mimeTypeResolver: MimeTypeResolver,
): Promise<Response | null> {
  const candidates = buildFileCandidates(baseDir, pathname);
  for (const candidate of candidates) {
    try {
      const info = await Deno.stat(candidate);
      if (info.isFile) {
        const ext = candidate.split(".").pop()?.toLowerCase() ?? "";
        const mimeType = mimeTypeResolver(ext) ?? "application/octet-stream";
        const file = await Deno.open(candidate);
        return new Response(file.readable, {
          headers: { "Content-Type": mimeType },
        });
      }
    } catch (err) {
      if (!(err instanceof Deno.errors.NotFound)) {
        console.error(`Static file error: ${candidate}`, err);
        return new Response("Internal Server Error", { status: 500 });
      }
    }
  }
  return null;
}

function buildFileCandidates(baseDir: string, pathname: string): string[] {
  const fullPath = join(baseDir, pathname);
  const candidates: string[] = [fullPath];
  if (!/\.[a-zA-Z0-9]+$/.test(pathname)) {
    candidates.push(fullPath + ".html");
    candidates.push(fullPath + ".htm");
  }
  candidates.push(join(fullPath, "index.html"));
  candidates.push(join(fullPath, "index.htm"));
  return candidates;
}

function defaultDenoMimeTypeResolver(ext: string): string | undefined {
  const map: Record<string, string> = {
    html: "text/html; charset=utf-8",
    htm: "text/html; charset=utf-8",
    css: "text/css; charset=utf-8",
    js: "application/javascript; charset=utf-8",
    mjs: "application/javascript; charset=utf-8",
    json: "application/json; charset=utf-8",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    txt: "text/plain; charset=utf-8",
    pdf: "application/pdf",
    xml: "application/xml",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    otf: "font/otf",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    webm: "video/webm",
    wasm: "application/wasm",
  };
  return map[ext.toLowerCase()];
}
```

---

## Arquivo: `monorepo/router/src/adapters/cloudflare-types.ts`

```ts
// monorepo/router/src/adapters/cloudflare-types.ts
// Declarações de tipo para o ambiente Cloudflare Workers
export interface R2Bucket {
  get(key: string): Promise<any>;
}
export interface KVNamespace {
  get(key: string, type: string): Promise<any>;
}
```

---

## Arquivo: `monorepo/router/src/adapters/cloudflare.ts`

```ts
// monorepo/router/src/adapters/cloudflare.ts
import type { WebSocketUpgrader, StaticFileHandler } from "../mod.ts";
import type { R2Bucket, KVNamespace } from "./cloudflare-types.ts";

/**
 * Adaptador de WebSocket para Cloudflare Workers.
 * Usa WebSocketPair nativo do Workers.
 */
export const cloudflareWebSocketUpgrader: WebSocketUpgrader = {
  upgrade(req: Request): { socket: WebSocket; response: Response } {
    // @ts-ignore: Cloudflare Workers specific global
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    
    // @ts-ignore: Cloudflare Workers specific method
    server.accept();
    
    const response = new Response(null, {
      status: 101,
      // @ts-ignore: Cloudflare Workers specific ResponseInit property
      webSocket: client,
    });
    return { socket: server, response };
  },
};

/**
 * Cria um handler de arquivos estáticos para Cloudflare Workers.
 * Usa R2 Bucket para servir arquivos.
 */
export function createR2StaticFileHandler(bucket: R2Bucket): StaticFileHandler {
  return {
    async handle(path: string): Promise<Response | null> {
      try {
        const object = await bucket.get(path);
        if (!object) return null;
        return new Response(object.body, {
          headers: {
            "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
            "ETag": object.etag,
            "Cache-Control": object.httpMetadata?.cacheControl ?? "public, max-age=3600",
          },
        });
      } catch {
        return null;
      }
    },
  };
}

/**
 * Cria um handler de arquivos estáticos usando Cloudflare KV.
 */
export function createKVStaticFileHandler(kv: KVNamespace): StaticFileHandler {
  return {
    async handle(path: string): Promise<Response | null> {
      try {
        const content = await kv.get(path, "arrayBuffer");
        if (!content) return null;
        const ext = path.split(".").pop()?.toLowerCase() ?? "";
        const contentType = getContentType(ext);
        return new Response(content, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=3600",
          },
        });
      } catch {
        return null;
      }
    },
  };
}

function getContentType(ext: string): string {
  const map: Record<string, string> = {
    html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
    css: "text/css; charset=utf-8", js: "application/javascript; charset=utf-8",
    json: "application/json; charset=utf-8", png: "image/png",
    jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    svg: "image/svg+xml", ico: "image/x-icon", txt: "text/plain; charset=utf-8",
    pdf: "application/pdf", xml: "application/xml", woff: "font/woff",
    woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
    mp3: "audio/mpeg", mp4: "video/mp4", webm: "video/webm",
    wasm: "application/wasm",
  };
  return map[ext] ?? "application/octet-stream";
}
```

---

## Arquivo: `monorepo/router/src/cloudflare.ts`

```ts
// monorepo/router/src/cloudflare.ts
// ☁️ Entry point para Cloudflare Workers
import { Router } from "./mod.ts";
import {
  cloudflareWebSocketUpgrader,
  createR2StaticFileHandler,
  createKVStaticFileHandler,
} from "./adapters/cloudflare.ts";
import type { R2Bucket, KVNamespace } from "./adapters/cloudflare-types.ts";

export function createCloudflareRouter(options: {
  basePath?: string;
  forceHttps?: boolean;
  lastBroadcastDelay?: number;
  r2Bucket?: R2Bucket;
  kvNamespace?: KVNamespace;
}): Router {
  const {
    basePath = "",
    forceHttps = false,
    lastBroadcastDelay,
    r2Bucket,
    kvNamespace,
  } = options;

  let staticFileHandler;
  if (r2Bucket) {
    staticFileHandler = createR2StaticFileHandler(r2Bucket);
  } else if (kvNamespace) {
    staticFileHandler = createKVStaticFileHandler(kvNamespace);
  }

  const router = new Router({
    basePath,
    forceHttps,
    lastBroadcastDelay,
    webSocketUpgrader: cloudflareWebSocketUpgrader,
    staticFileHandler,
  });
  return router;
}

export * from "./mod.ts";
export {
  cloudflareWebSocketUpgrader,
  createR2StaticFileHandler,
  createKVStaticFileHandler,
} from "./adapters/cloudflare.ts";
```

---

## Arquivo: `monorepo/router/src/deno.ts`

```ts
// monorepo/router/src/deno.ts
import { Router } from "./mod.ts";
import { denoWebSocketUpgrader, createDenoStaticFileHandler } from "./adapters/deno.ts";

export interface DenoRouterOptions {
  basePath?: string;
  staticDir?: string | null;
  embeddedDir?: string | null;
  forceHttps?: boolean;
  lastBroadcastDelay?: number;
}

/**
 * Cria um Router pré-configurado para Deno.
 * Suporta tanto passagem de opções via objeto quanto via argumentos posicionais.
 */
export function createDenoRouter(
  basePathOrOptions: string | DenoRouterOptions = "",
  staticDir: string | null = "public",
  embeddedDir: string | null = null,
  forceHttps: boolean = false,
  lastBroadcastDelay?: number,
): Router {
  let options: DenoRouterOptions;
  
  if (typeof basePathOrOptions === "string") {
    options = {
      basePath: basePathOrOptions,
      staticDir,
      embeddedDir,
      forceHttps,
      lastBroadcastDelay,
    };
  } else {
    options = basePathOrOptions;
  }

  const {
    basePath = "",
    staticDir: sDir = "public",
    embeddedDir: eDir = null,
    forceHttps: fHttps = false,
    lastBroadcastDelay: lDelay,
  } = options;

  const router = new Router({
    basePath,
    forceHttps: fHttps,
    lastBroadcastDelay: lDelay,
    webSocketUpgrader: denoWebSocketUpgrader,
    staticFileHandler: sDir || eDir
      ? createDenoStaticFileHandler(sDir, eDir)
      : undefined,
  });
  
  return router;
}

// Re-exporta tudo do core
export * from "./mod.ts";
export { denoWebSocketUpgrader, createDenoStaticFileHandler } from "./adapters/deno.ts";
```

---

## Arquivo: `monorepo/router/src/mod.ts`

```ts
// monorepo/router/src/mod.ts
 // ⚡ CORE AGNÓSTICO — Nenhuma dependência direta de runtime (Deno, Node, CF Workers)
 import { join, normalize } from "@std/path";
 
 // ============================================================
 // TIPOS FUNDAMENTAIS
 // ============================================================
 export type RouteParams = Record<string, string | string[]>;
 export type HttpHandler = (
   req: Request,
   params: RouteParams,
 ) =>
   | { body: BodyInit; init?: ResponseInit }
   | Promise<{ body: BodyInit; init?: ResponseInit }>;
 export type WsHandler = (
   ws: WebSocket,
   req: Request,
   params: RouteParams,
 ) => void;
 // ✅ DUAL PARAMS: receiverParams, senderParams e message
 export type PermissionFn = (
   receiverParams: RouteParams,
   senderParams: RouteParams,
   message: string,
 ) => boolean;
 export type MimeTypeResolver = (ext: string) => string | undefined;
 // ✅ MIDDLEWARE: Suporte a Request modificada via next(newReq)
 export type Middleware = (
   req: Request,
   params: RouteParams,
   next: (newReq?: Request) => Promise<Response>,
 ) => Promise<Response> | Response;
 
 // ============================================================
 // 🌐 INTERFACES DE ABSTRAÇÃO (Runtime Adapters)
 // ============================================================
 /**
  * Abstrai o upgrade de HTTP para WebSocket.
  * - Deno: Deno.upgradeWebSocket(req)
  * - Cloudflare: new WebSocketPair()
  * - Node: ws library
  */
 export interface WebSocketUpgrader {
   upgrade(req: Request): { socket: WebSocket; response: Response };
 }
 /**
  * Abstrai o sistema de arquivos para servir arquivos estáticos.
  * Retorna Response ou null (não encontrado).
  * - Deno: Deno.open/Deno.stat
  * - Cloudflare: R2, KV, ou Assets
  * - Node: fs module
  */
 export interface StaticFileHandler {
   handle(path: string): Promise<Response | null>;
 }
 
 // ============================================================
 // OPÇÕES DO ROUTER
 // ============================================================
 export const DEFAULT_LAST_BROADCAST_DELAY = 50;
 export interface RouterOptions {
   basePath?: string;
   forceHttps?: boolean;
   lastBroadcastDelay?: number;
   mimeTypeResolver?: MimeTypeResolver;
   /** Adaptador de WebSocket. Se não fornecido, tenta detectar o runtime. */
   webSocketUpgrader?: WebSocketUpgrader;
   /** Adaptador de arquivos estáticos. Se não fornecido, não serve estáticos. */
   staticFileHandler?: StaticFileHandler;
 }
 
 // ============================================================
 // INTERFACES INTERNAS
 // ============================================================
 interface HttpRoute {
   method: string;
   pattern: URLPattern;
   handler: HttpHandler;
 }
 interface WsRoute {
   pattern: URLPattern;
   handler: WsHandler;
   group: WebSocketGroup;
 }
 interface LastBroadcast {
   message: string;
   permissionFn?: PermissionFn;
   senderParams: RouteParams;
 }
 
 // ============================================================
 // CLASSE ROUTER (CORE AGNÓSTICO)
 // ============================================================
 export class Router {
   private basePath: string;
   private httpRoutes: HttpRoute[] = [];
   private wsRoutes: WsRoute[] = [];
   private middlewares: Middleware[] = [];
   private webSockets = new Map<WebSocket, { group: WebSocketGroup }>();
   private mimeTypeResolver: MimeTypeResolver;
   private webSocketUpgrader?: WebSocketUpgrader;
   private staticFileHandler?: StaticFileHandler;
   public forceHttps: boolean;
   private lastBroadcastDelay: number;
 
   constructor(options: RouterOptions = {}) {
     this.basePath = this.normalizeBasePath(options.basePath ?? "");
     this.mimeTypeResolver = options.mimeTypeResolver ?? defaultMimeTypeResolver;
     this.forceHttps = options.forceHttps ?? false;
     this.lastBroadcastDelay = options.lastBroadcastDelay ?? DEFAULT_LAST_BROADCAST_DELAY;
     this.webSocketUpgrader = options.webSocketUpgrader;
     this.staticFileHandler = options.staticFileHandler;
   }
 
   /** Configura o adaptador de WebSocket */
   setWebSocketUpgrader(upgrader: WebSocketUpgrader): this {
     this.webSocketUpgrader = upgrader;
     return this;
   }
 
   /** Configura o handler de arquivos estáticos */
   setStaticFileHandler(handler: StaticFileHandler): this {
     this.staticFileHandler = handler;
     return this;
   }
 
   private normalizeBasePath(p: string): string {
     if (!p) return "";
     return "/" + p.replace(/^\/+|\/+$/g, "");
   }
 
   private normalizePath(p: string): string {
     return p.startsWith("/") ? p : "/" + p;
   }
 
   private stripBase(pathname: string): string {
     if (!this.basePath) return pathname;
     if (pathname === this.basePath) return "/";
     if (pathname.startsWith(this.basePath + "/")) {
       return pathname.slice(this.basePath.length);
     }
     return pathname;
   }
 
   private isLocalhost(req: Request): boolean {
     const url = new URL(req.url);
     const hostname = url.hostname.toLowerCase();
     return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
   }
 
   private shouldForceHttps(req: Request): boolean {
     if (!this.forceHttps) return false;
     if (this.isLocalhost(req)) return false;
     const protoHeader = req.headers.get("x-forwarded-proto");
     const forwardedProto = protoHeader ? protoHeader.split(",")[0]?.trim() : undefined;
     if (forwardedProto === "https") return false;
     const url = new URL(req.url);
     if (url.protocol === "https:") return false;
     return true;
   }
 
   private buildHttpsUrl(req: Request): string {
     const url = new URL(req.url);
     url.protocol = "https:";
     if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
       url.protocol = "wss:";
     }
     return url.toString();
   }
 
   private addHttpRoute(method: string, path: string, handler: HttpHandler) {
     const patternPath = this.normalizePath(path);
     const pattern = new URLPattern({ pathname: patternPath });
     this.httpRoutes.push({ method: method.toUpperCase(), pattern, handler });
   }
 
   private addWsRoute(path: string, handler: WsHandler) {
     const patternPath = this.normalizePath(path);
     const pattern = new URLPattern({ pathname: patternPath });
     const group = new WebSocketGroup(this.lastBroadcastDelay);
     this.wsRoutes.push({ pattern, handler, group });
   }
 
   // ============================================================
   // REGISTRO DE ROTAS
   // ============================================================
   use(middleware: Middleware): this {
     this.middlewares.push(middleware);
     return this;
   }
 
   get(path: string, handler: HttpHandler): this {
     this.addHttpRoute("GET", path, handler);
     return this;
   }
 
   post(path: string, handler: HttpHandler): this {
     this.addHttpRoute("POST", path, handler);
     return this;
   }
 
   put(path: string, handler: HttpHandler): this {
     this.addHttpRoute("PUT", path, handler);
     return this;
   }
 
   delete(path: string, handler: HttpHandler): this {
     this.addHttpRoute("DELETE", path, handler);
     return this;
   }
 
   patch(path: string, handler: HttpHandler): this {
     this.addHttpRoute("PATCH", path, handler);
     return this;
   }
 
   options(path: string, handler: HttpHandler): this {
     this.addHttpRoute("OPTIONS", path, handler);
     return this;
   }
 
   head(path: string, handler: HttpHandler): this {
     this.addHttpRoute("HEAD", path, handler);
     return this;
   }
 
   ws(path: string, handler: WsHandler): this {
     this.addWsRoute(path, handler);
     return this;
   }
 
   // ============================================================
   // BUSCA DE ROTAS
   // ============================================================
   private findHttpRoute(req: Request): { route: HttpRoute; params: RouteParams } | null {
     const adjustedUrl = new URL(req.url);
     adjustedUrl.pathname = this.stripBase(adjustedUrl.pathname);
     for (const route of this.httpRoutes) {
       if (route.method !== req.method.toUpperCase()) continue;
       const match = route.pattern.exec(adjustedUrl);
       if (match) {
         return { route, params: this.extractParams(match.pathname.groups) };
       }
     }
     return null;
   }
 
   private findWsRoute(req: Request): { route: WsRoute; params: RouteParams } | null {
     const adjustedUrl = new URL(req.url);
     adjustedUrl.pathname = this.stripBase(adjustedUrl.pathname);
     for (const route of this.wsRoutes) {
       const match = route.pattern.exec(adjustedUrl);
       if (match) {
         return { route, params: this.extractParams(match.pathname.groups) };
       }
     }
     return null;
   }
 
   // ============================================================
   // EXECUÇÃO DOS HANDLERS
   // ============================================================
   private async executeHttpHandler(
     req: Request,
     route: HttpRoute,
     params: RouteParams,
   ): Promise<Response> {
     try {
       const result = await route.handler(req, params);
       const isHead = req.method.toUpperCase() === "HEAD";
       const isNullBodyStatus = result.init?.status &&
         [101, 204, 205, 304].includes(result.init.status);
       const finalBody = (isHead || isNullBodyStatus) ? null : result.body;
       return new Response(finalBody, result.init);
     } catch (error) {
       console.error(`[Router] Error in ${req.method} ${route.pattern.pathname}:`, error);
       return new Response("Internal Server Error", { status: 500 });
     }
   }
 
   private executeWsHandler(
     req: Request,
     route: WsRoute,
     params: RouteParams,
   ): Response {
     // ✅ USA O ADAPTADOR DE WEBSOCKET
     if (!this.webSocketUpgrader) {
       console.error("[Router] WebSocketUpgrader não configurado. Use setWebSocketUpgrader().");
       // ✅ CORREÇÃO: Ajustado para bater com a string esperada pelo teste
       return new Response("WebSocket not supported", { status: 501 });
     }
     const { socket, response } = this.webSocketUpgrader.upgrade(req);
     route.group.addSocket(socket, params);
     this.webSockets.set(socket, { group: route.group });
     route.group.sendLastBroadcastTo(socket, params);
     try {
       route.handler(socket, req, params);
     } catch (error) {
       console.error(`[Router] Error in WS handler ${route.pattern.pathname}:`, error);
       if (socket.readyState === WebSocket.OPEN) {
         socket.close(1011, "Internal Server Error");
       }
     }
     socket.onclose = () => {
       this.webSockets.delete(socket);
       route.group.removeSocket(socket);
     };
     socket.onerror = (ev) => {
       console.error(`WebSocket error:`, ev);
       this.webSockets.delete(socket);
       route.group.removeSocket(socket);
     };
     return response;
   }
 
   // ============================================================
   // HANDLER PRINCIPAL COM MIDDLEWARES
   // ============================================================
   async handleRequest(req: Request): Promise<Response> {
     // 1. Force HTTPS (ANTES de qualquer middleware)
     if (this.shouldForceHttps(req)) {
       const httpsUrl = this.buildHttpsUrl(req);
       return new Response(null, {
         status: 301,
         headers: {
           "Location": httpsUrl,
           "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
         },
       });
     }
 
     const isWs = req.headers.get("upgrade")?.toLowerCase() === "websocket";
     const found = isWs ? this.findWsRoute(req) : this.findHttpRoute(req);
 
     // 2. Cadeia de Middlewares (executa mesmo sem rota)
     let index = 0;
     let currentReq = req;
     const executeChain = async (): Promise<Response> => {
       if (index < this.middlewares.length) {
         const mw = this.middlewares[index++];
         if (!mw) {
           return this.executeFinalHandler(currentReq, isWs, found);
         }
         try {
           let nextHasBeenCalled = false;
           const result = await mw(currentReq, found?.params ?? {}, async (newReq?: Request) => {
             if (nextHasBeenCalled) {
               throw new Error("next() called multiple times in the same middleware");
             }
             nextHasBeenCalled = true;
             if (newReq) currentReq = newReq;
             return await executeChain();
           });
           return result;
         } catch (error) {
           console.error(`[Router] Middleware error:`, error);
           return new Response("Internal Server Error", { status: 500 });
         }
       }
       return this.executeFinalHandler(currentReq, isWs, found);
     };
     return await executeChain();
   }
 
   private async executeFinalHandler(
     req: Request,
     isWs: boolean,
     found: { route: HttpRoute | WsRoute; params: RouteParams } | null,
   ): Promise<Response> {
     if (!found) {
       if (isWs) return new Response("WebSocket Not Found", { status: 404 });
       return this.handleStaticFile(req);
     }
     return isWs
       ? this.executeWsHandler(req, found.route as WsRoute, found.params)
       : await this.executeHttpHandler(req, found.route as HttpRoute, found.params);
   }
 
   // ============================================================
   // ARQUIVOS ESTÁTICOS (AGNÓSTICO)
   // ============================================================
   private async handleStaticFile(req: Request): Promise<Response> {
     // ✅ USA O ADAPTADOR DE ARQUIVOS ESTÁTICOS
     if (!this.staticFileHandler) {
       return new Response("Not Found", { status: 404 });
     }
     const { pathname } = new URL(req.url);
     const adjustedPathname = this.stripBase(pathname);
     // Proteção contra path traversal
     const safePath = normalize(adjustedPathname).replace(/^(\.\.[/\\])+/, "");
     const response = await this.staticFileHandler.handle(safePath);
     return response ?? new Response("Not Found", { status: 404 });
   }
 
   // ============================================================
   // WEBSOCKETS
   // ============================================================
   closeAllWebSockets() {
     for (const [socket] of this.webSockets.entries()) {
       if (socket.readyState === WebSocket.OPEN) {
         socket.close(1001, "Server is shutting down");
       }
     }
     this.webSockets.clear();
   }
 
   getWsGroupByPath(pathOrPattern: string): WebSocketGroup | undefined {
     const targetPath = this.normalizePath(pathOrPattern);
     for (const route of this.wsRoutes) {
       if (route.pattern.test({ pathname: targetPath })) {
         return route.group;
       }
     }
     return undefined;
   }
 
   closeGroupByPath(path: string): boolean {
     const group = this.getWsGroupByPath(path);
     if (!group) return false;
     group.closeGroup();
     return true;
   }
 
   private extractParams(groups: Record<string, string | undefined>): RouteParams {
     const params: RouteParams = {};
     const catches: string[] = [];
     for (const [key, value] of Object.entries(groups)) {
       if (value === undefined) continue;
       if (key === "0" || /^\d+$/.test(key)) {
         catches.push(value);
       } else {
         params[key] = value;
       }
     }
     if (catches.length > 0) {
       params.catch = catches;
     }
     return params;
   }
 }
 
 // ============================================================
 // WEBSOCKET GROUP (AGNÓSTICO)
 // ============================================================
 export class WebSocketGroup {
   private sockets = new Map<WebSocket, RouteParams>();
   private lastBroadcast: LastBroadcast | null = null;
   private lastBroadcastDelay: number;
 
   constructor(lastBroadcastDelay: number = DEFAULT_LAST_BROADCAST_DELAY) {
     this.lastBroadcastDelay = lastBroadcastDelay;
   }
 
   addSocket(ws: WebSocket, params: RouteParams) {
     this.sockets.set(ws, params);
   }
 
   removeSocket(ws: WebSocket) {
     this.sockets.delete(ws);
   }
 
   get size(): number {
     return this.sockets.size;
   }
 
   sendLastBroadcastTo(ws: WebSocket, receiverParams: RouteParams) {
     const broadcast = this.lastBroadcast;
     if (!broadcast) return;
     setTimeout(() => {
       if (ws.readyState === WebSocket.OPEN) {
         const { message, permissionFn, senderParams } = broadcast;
         if (!permissionFn || permissionFn(receiverParams, senderParams, message)) {
           ws.send(message);
         }
       }
     }, this.lastBroadcastDelay);
   }
 
   broadcast(message: string, permissionFn?: PermissionFn, senderParams?: RouteParams) {
     this.lastBroadcast = {
       message,
       permissionFn,
       senderParams: senderParams ?? {},
     };
     for (const [socket, receiverParams] of this.sockets.entries()) {
       if (socket.readyState !== WebSocket.OPEN) continue;
       if (!permissionFn || permissionFn(receiverParams, senderParams ?? {}, message)) {
         socket.send(message);
       }
     }
   }
 
   closeGroup() {
     for (const [socket] of this.sockets.entries()) {
       if (socket.readyState === WebSocket.OPEN) {
         socket.close(1000, "Group is being closed");
       }
     }
     this.sockets.clear();
     this.lastBroadcast = null;
   }
 }
 
 // ============================================================
 // MIME TYPE RESOLVER PADRÃO (AGNÓSTICO)
 // ============================================================
 function defaultMimeTypeResolver(ext: string): string | undefined {
   const map: Record<string, string> = {
     html: "text/html; charset=utf-8",
     htm: "text/html; charset=utf-8",
     css: "text/css; charset=utf-8",
     js: "application/javascript; charset=utf-8",
     mjs: "application/javascript; charset=utf-8",
     json: "application/json; charset=utf-8",
     png: "image/png",
     jpg: "image/jpeg",
     jpeg: "image/jpeg",
     gif: "image/gif",
     svg: "image/svg+xml",
     ico: "image/x-icon",
     txt: "text/plain; charset=utf-8",
     pdf: "application/pdf",
     xml: "application/xml",
     woff: "font/woff",
     woff2: "font/woff2",
     ttf: "font/ttf",
     otf: "font/otf",
     mp3: "audio/mpeg",
     mp4: "video/mp4",
     webm: "video/webm",
     wasm: "application/wasm",
   };
   return map[ext.toLowerCase()];
 }
```

---

## Arquivo: `monorepo/router/example/principal/public/index.html`

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WebSocket Test - user1</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; max-width: 800px; }
    #messages {
      border: 1px solid #ccc; padding: 10px; height: 300px;
      overflow-y: scroll; margin-bottom: 10px; background: #fafafa;
    }
    #messages p { margin: 4px 0; }
    .controls { display: flex; gap: 8px; margin-bottom: 10px; }
    #messageInput { flex: 1; padding: 8px; }
    #sendButton { padding: 8px 16px; cursor: pointer; }
    .status { padding: 8px; border-radius: 4px; margin-bottom: 10px; }
    .status.connected { background: #d4edda; color: #155724; }
    .status.disconnected { background: #f8d7da; color: #721c24; }
    .info { background: #e7f3ff; padding: 10px; border-radius: 4px; margin-bottom: 10px; }
  </style>
</head>
<body>
  <h1>🔌 WebSocket Test — user1</h1>

  <div class="info">
    <strong>Conectado como:</strong> user1 na sala <code>room1</code><br>
    <strong>Endpoint:</strong> <code>ws://localhost:8000/api/chat/room1/user1</code>
  </div>

  <div id="status" class="status disconnected">⏳ Conectando...</div>

  <div id="messages"></div>

  <div class="controls">
    <input type="text" id="messageInput" placeholder="Digite sua mensagem...">
    <button id="sendButton">Enviar</button>
  </div>

  <script>
    const messagesDiv = document.getElementById('messages');
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const statusDiv = document.getElementById('status');

    // ⚠️ URL correta: ws://host/api/chat/room/user
    // O basePath '/api' faz parte da rota WebSocket registrada
    const WS_URL = 'ws://localhost:8000/api/chat/room1/user1';

    let socket;

    function connect() {
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        statusDiv.className = 'status connected';
        statusDiv.textContent = '✅ Conectado como user1 em room1';
        addMessage('🟢 Conexão estabelecida');
      };

      socket.onmessage = (event) => {
        addMessage(`📨 ${event.data}`);
      };

      socket.onclose = (event) => {
        statusDiv.className = 'status disconnected';
        statusDiv.textContent = `❌ Desconectado (código: ${event.code})`;
        addMessage(`🔴 Conexão fechada (código: ${event.code})`);
      };

      socket.onerror = () => {
        addMessage('⚠️ Erro na conexão');
      };
    }

    function addMessage(text) {
      const p = document.createElement('p');
      p.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
      messagesDiv.appendChild(p);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    sendButton.onclick = () => {
      const message = messageInput.value.trim();
      if (!message) return;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(message);
        addMessage(`📤 ${message}`);
        messageInput.value = '';
      } else {
        addMessage('⚠️ WebSocket não está conectado');
      }
    };

    messageInput.onkeypress = (e) => {
      if (e.key === 'Enter') sendButton.click();
    };

    connect();
  </script>
</body>
</html>
```

---

## Arquivo: `monorepo/router/example/principal/public/broadcast.html`

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WebSocket Broadcast Test - user2</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; max-width: 800px; }
    #messages {
      border: 1px solid #ccc; padding: 10px; height: 300px;
      overflow-y: scroll; margin-bottom: 10px; background: #fafafa;
    }
    #messages p { margin: 4px 0; }
    .broadcast { background: #fff3cd; font-weight: bold; }
    .controls { display: flex; gap: 8px; margin-bottom: 10px; }
    #messageInput { flex: 1; padding: 8px; }
    #sendButton { padding: 8px 16px; cursor: pointer; }
    .status { padding: 8px; border-radius: 4px; margin-bottom: 10px; }
    .status.connected { background: #d4edda; color: #155724; }
    .status.disconnected { background: #f8d7da; color: #721c24; }
    .info { background: #e7f3ff; padding: 10px; border-radius: 4px; margin-bottom: 10px; }
  </style>
</head>
<body>
  <h1>📡 WebSocket Broadcast Test — user2</h1>

  <div class="info">
    <strong>Conectado como:</strong> user2 na sala <code>room1</code><br>
    <strong>Endpoint:</strong> <code>ws://localhost:8000/api/chat/room1/user2</code><br>
    <strong>Teste:</strong> Abra o <a href="/api/index.html" target="_blank">index.html</a> em outra aba para ver o broadcast funcionando!
  </div>

  <div id="status" class="status disconnected">⏳ Conectando...</div>

  <div id="messages"></div>

  <div class="controls">
    <input type="text" id="messageInput" placeholder="Digite para fazer broadcast...">
    <button id="sendButton">Broadcast</button>
  </div>

  <script>
    const messagesDiv = document.getElementById('messages');
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const statusDiv = document.getElementById('status');

    // ⚠️ URL correta: ws://host/api/chat/room/user
    const WS_URL = 'ws://localhost:8000/api/chat/room1/user2';

    let socket;

    function connect() {
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        statusDiv.className = 'status connected';
        statusDiv.textContent = '✅ Conectado como user2 em room1';
        addMessage('🟢 Conexão estabelecida');
      };

      socket.onmessage = (event) => {
        // Mensagens de broadcast têm prefixo "[user]:"
        const isBroadcast = event.data.startsWith('[');
        addMessage(event.data, isBroadcast);
      };

      socket.onclose = (event) => {
        statusDiv.className = 'status disconnected';
        statusDiv.textContent = `❌ Desconectado (código: ${event.code})`;
        addMessage(`🔴 Conexão fechada (código: ${event.code})`);
      };

      socket.onerror = () => {
        addMessage('⚠️ Erro na conexão');
      };
    }

    function addMessage(text, isBroadcast = false) {
      const p = document.createElement('p');
      if (isBroadcast) p.className = 'broadcast';
      p.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
      messagesDiv.appendChild(p);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    sendButton.onclick = () => {
      const message = messageInput.value.trim();
      if (!message) return;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(message);
        addMessage(`📤 ${message}`);
        messageInput.value = '';
      } else {
        addMessage('⚠️ WebSocket não está conectado');
      }
    };

    messageInput.onkeypress = (e) => {
      if (e.key === 'Enter') sendButton.click();
    };

    connect();
  </script>
</body>
</html>
```

---

## Arquivo: `monorepo/router/example/principal/main.ts`

```ts
// monorepo/router/example/principal/main.ts
import { createDenoRouter } from "../../src/deno.ts";

// ✅ Cria router com adaptadores Deno pré-configurados
const app = createDenoRouter({
  basePath: "/api",
  staticDir: "./public",
  forceHttps: false, // Mude para true em produção
});

// ============================================================
// HTTP GET com parâmetros em cascata
// ============================================================
app.get("/:id/:tipo", (_req, params) => {
  console.log("[GET] /:id/:tipo", params);
  return {
    body: JSON.stringify({ id: params.id, tipo: params.tipo }),
    init: { headers: { "Content-Type": "application/json" } },
  };
});

// ============================================================
// HTTP POST
// ============================================================
app.post("/users", async (req) => {
  const body = await req.text();
  return {
    body,
    init: { status: 201, headers: { "Content-Type": "application/json" } },
  };
});

// ============================================================
// WebSocket com broadcast inteligente (DUAL PARAMS)
// ============================================================
app.ws("/chat/:room/:user", (ws, _req, params) => {
  const room = params.room as string;
  const user = params.user as string;
  console.log(`[WS] ✅ ${user} entrou na sala ${room}`);

  const group = app.getWsGroupByPath("/chat/:room/:user");
  if (!group) {
    console.error("[WS] ❌ Grupo não encontrado!");
    ws.close(1011, "Internal error");
    return;
  }

  ws.onmessage = (event) => {
    console.log(`[WS] 💬 ${room}/${user}: ${event.data}`);
    group.broadcast(
      `[${user}]: ${event.data}`,
      (receiverParams, senderParams, _msg) => receiverParams.room === senderParams.room,
      params,
    );
  };

  ws.onclose = () => {
    console.log(`[WS] ❌ ${user} saiu da sala ${room}`);
  };

  ws.onerror = (ev) => {
    console.error(`[WS] ⚠️ erro ${room}/${user}:`, ev);
  };
});

// ============================================================
// Catch-all HTTP
// ============================================================
app.get("/subfolder/*", (_req, params) => {
  console.log("[GET] /subfolder/*", params);
  return {
    body: `Catch-all: ${JSON.stringify(params.catch)}`,
    init: { status: 200 },
  };
});

// ============================================================
// Catch-all WebSocket
// ============================================================
app.ws("/subfolder/*", (ws, _req, params) => {
  console.log("[WS catch-all] params:", params);
  ws.onmessage = (event) => ws.send(`Echo: ${event.data}`);
  ws.onclose = () => console.log("[WS catch-all] closed");
  ws.onerror = (ev) => console.error("[WS catch-all] error:", ev);
});

// ============================================================
// Inicia o servidor
// ============================================================
const server = Deno.serve({ port: 8000 }, app.handleRequest.bind(app));
console.log("🚀 Servidor rodando em http://localhost:8000");
console.log("📡 API:      http://localhost:8000/api");
console.log("🔌 WS chat:  ws://localhost:8000/api/chat/:room/:user");
console.log("📂 Estáticos: http://localhost:8000/api/index.html");

// ============================================================
// Graceful shutdown
// ============================================================
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  Deno.addSignalListener(signal, () => {
    console.log(`\n🛑 ${signal} recebido. Encerrando...`);
    app.closeAllWebSockets();
    server.shutdown().then(() => {
      console.log("✅ Servidor encerrado.");
      Deno.exit(0);
    }).catch((err) => {
      console.error("❌ Erro ao encerrar:", err);
      Deno.exit(1);
    });
  });
}

// ============================================================
// Exemplo: fechar grupo após 30s
// ============================================================
setTimeout(() => {
  if (app.closeGroupByPath("/chat/:room/:user")) {
    console.log("🔒 Grupo de chat fechado após 30s.");
  }
}, 30000);
```

---

## Arquivo: `monorepo/router/example/jwt/public/index.html`

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>WebSocket com JWT (Subprotocol)</title>
  <style>
    body { font-family: sans-serif; max-width: 600px; margin: 2rem auto; }
    .box { border: 1px solid #ccc; padding: 1rem; margin-bottom: 1rem; border-radius: 8px; }
    #logs { height: 200px; overflow-y: auto; background: #f4f4f4; padding: 0.5rem; }
    input, button { padding: 0.5rem; margin: 0.25rem 0; width: 100%; box-sizing: border-box; }
  </style>
</head>
<body>
  <h1>🔐 Chat Seguro com JWT (Subprotocol)</h1>

  <div class="box">
    <h3>1. Login</h3>
    <input type="text" id="username" value="admin" placeholder="Usuário (admin)">
    <input type="password" id="password" value="123" placeholder="Senha (123)">
    <button onclick="doLogin()">Obter Token</button>
    <p id="tokenDisplay" style="word-break: break-all; font-size: 0.8rem; color: green;"></p>
  </div>

  <div class="box">
    <h3>2. Conexão WebSocket</h3>
    <button onclick="connectWS()" id="btnConnect" disabled>Conectar ao Chat</button>
    <div id="logs"></div>
    <input type="text" id="message" placeholder="Digite uma mensagem..." disabled>
    <button onclick="sendMessage()" id="btnSend" disabled>Enviar</button>
  </div>

  <script>
    let token = "";
    let ws = null;

    function log(msg) {
      const logs = document.getElementById("logs");
      logs.innerHTML += `<div>[${new Date().toLocaleTimeString()}] ${msg}</div>`;
      logs.scrollTop = logs.scrollHeight;
    }

    async function doLogin() {
      const username = document.getElementById("username").value;
      const password = document.getElementById("password").value;

      try {
        const res = await fetch("http://localhost:8000/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        
        if (data.token) {
          token = data.token;
          document.getElementById("tokenDisplay").textContent = `Token obtido: ${token.substring(0, 20)}...`;
          document.getElementById("btnConnect").disabled = false;
          log("✅ Login realizado com sucesso!");
        } else {
          log("❌ Erro no login: " + data.error);
        }
      } catch (e) {
        log("❌ Falha na requisição de login.");
      }
    }

    function connectWS() {
      if (!token) return;
      
      // ✅ O token é passado via Subprotocol (segundo argumento do WebSocket)
      // O servidor receberá: Sec-WebSocket-Protocol: Bearer, <token>
      const wsUrl = "ws://localhost:8000/api/chat/geral";
      log(`🔄 Conectando a: ${wsUrl}`);
      
      ws = new WebSocket(wsUrl, ["Bearer", token]);

      ws.onopen = () => {
        log("🟢 Conectado ao servidor WebSocket!");
        document.getElementById("message").disabled = false;
        document.getElementById("btnSend").disabled = false;
        document.getElementById("btnConnect").disabled = true;
      };

      ws.onmessage = (event) => {
        log(`📨 ${event.data}`);
      };

      ws.onclose = (event) => {
        log(`🔴 Conexão fechada. Código: ${event.code}, Motivo: ${event.reason}`);
        document.getElementById("message").disabled = true;
        document.getElementById("btnSend").disabled = true;
        document.getElementById("btnConnect").disabled = false;
      };

      ws.onerror = () => {
        log("⚠️ Erro na conexão WebSocket.");
      };
    }

    function sendMessage() {
      const msg = document.getElementById("message").value;
      if (ws && ws.readyState === WebSocket.OPEN && msg) {
        ws.send(msg);
        document.getElementById("message").value = "";
      }
    }
  </script>
</body>
</html>
```

---

## Arquivo: `monorepo/router/example/jwt/main.ts`

```ts
// monorepo/router/example/jwt/main.ts
import { createDenoRouter } from "../../src/deno.ts";
import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = "meu-segredo-super-secreto-123";
const encoder = new TextEncoder();
const app = createDenoRouter({ basePath: "/api", staticDir: "./public" });

// ✅ Middleware de autenticação: bloqueia ANTES do upgrade
app.use(async (req, _params, next) => {
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return await next();
  }
  const protocol = req.headers.get("sec-websocket-protocol") ?? "";
  const protocols = protocol.split(",").map((p) => p.trim());
  const bearerIndex = protocols.findIndex((p) => p === "Bearer");
  const token = bearerIndex !== -1 ? protocols[bearerIndex + 1] : null;
  if (!token) {
    console.error("[Middleware] ❌ Token ausente");
    return new Response("Token required", { status: 401 });
  }
  try {
    await jwtVerify(token, encoder.encode(JWT_SECRET));
    console.log("[Middleware] ✅ Token válido, permitindo upgrade");
    return await next();
  } catch {
    console.error("[Middleware] ❌ Token inválido");
    return new Response("Invalid token", { status: 403 });
  }
});

app.ws("/chat/:room", (ws, _req, params) => {
  const room = params.room as string;
  const group = app.getWsGroupByPath("/chat/:room");
  if (!group) return;
  ws.onmessage = (event) => {
    group.broadcast(
      `[room ${room}]: ${event.data}`,
      (receiver, sender, _msg) => receiver.room === sender.room,
      params,
    );
  };
});

Deno.serve({ port: 8000 }, app.handleRequest.bind(app));
```

---

## Arquivo: `monorepo/router/example/cloudflare/worker.ts`

```ts
// monorepo/router/example/cloudflare/worker.ts
// ☁️ Exemplo de uso em Cloudflare Workers
import { createCloudflareRouter } from "../../src/cloudflare.ts";
import type { R2Bucket, KVNamespace } from "../../src/adapters/cloudflare-types.ts";

// Tipos do Cloudflare Workers
interface Env {
  MY_BUCKET: R2Bucket;
  MY_KV: KVNamespace;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const app = createCloudflareRouter({
      basePath: "/api",
      forceHttps: true,
      r2Bucket: env.MY_BUCKET,
    });

    app.use(async (req, _params, next) => {
      const start = Date.now();
      const res = await next();
      const ms = Date.now() - start;
      console.log(`📝 ${req.method} ${req.url} - ${res.status} (${ms}ms)`);
      return res;
    });

    app.use(async (req, _params, next) => {
      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Max-Age": "86400",
          },
        });
      }
      const res = await next();
      res.headers.set("Access-Control-Allow-Origin", "*");
      return res;
    });

    app.get("/hello", () => ({
      body: JSON.stringify({ message: "Hello from Cloudflare Workers!" }),
      init: { headers: { "Content-Type": "application/json" } },
    }));
    
    app.get("/users/:id", (_req, params) => ({
      body: JSON.stringify({ id: params.id, name: "João" }),
      init: { headers: { "Content-Type": "application/json" } },
    }));

    app.ws("/chat/:room/:user", (ws, _req, params) => {
      const room = params.room as string;
      const user = params.user as string;
      console.log(`[WS] ✅ ${user} entrou na sala ${room}`);
      const group = app.getWsGroupByPath("/chat/:room/:user");
      if (!group) {
        ws.close(1011, "Internal error");
        return;
      }
      ws.onmessage = (event) => {
        group.broadcast(
          `[${user}]: ${event.data}`,
          (receiverParams, senderParams) => receiverParams.room === senderParams.room,
          params,
        );
      };
      ws.onclose = () => {
        console.log(`[WS] ❌ ${user} saiu da sala ${room}`);
      };
    });
    
    return app.handleRequest(req);
  },
};
```

---

## Arquivo: `monorepo/router/tests/websocket_group_test.ts`

```ts
// monorepo/router/tests/websocket_group_test.ts
import { assertEquals } from "@std/assert";
import { WebSocketGroup, type RouteParams } from "../src/mod.ts";

class MockWebSocket {
  readyState: number = 1;
  sent: string[] = [];

  send(data: string | ArrayBuffer | Blob) {
    if (typeof data === "string") {
      this.sent.push(data);
    }
  }

  close(code?: number, reason?: string) {
    this.readyState = 3;
  }
}

Deno.test("broadcast envia para todos os sockets", () => {
  const group = new WebSocketGroup();
  const ws1 = new MockWebSocket();
  const ws2 = new MockWebSocket();

  group.addSocket(ws1 as unknown as WebSocket, { room: "A" });
  group.addSocket(ws2 as unknown as WebSocket, { room: "A" });

  group.broadcast("hello");

  assertEquals(ws1.sent, ["hello"]);
  assertEquals(ws2.sent, ["hello"]);
});

Deno.test("broadcast com permissionFn filtra por receiver", () => {
  const group = new WebSocketGroup();
  const ws1 = new MockWebSocket();
  const ws2 = new MockWebSocket();

  group.addSocket(ws1 as unknown as WebSocket, { room: "A" });
  group.addSocket(ws2 as unknown as WebSocket, { room: "B" });

  // ✅ DUAL PARAMS: Filtra por receiverParams
  group.broadcast(
    "only-A",
    (receiver, _sender, _msg) => receiver.room === "A",
    { room: "A" }
  );

  assertEquals(ws1.sent, ["only-A"]);
  assertEquals(ws2.sent, []);
});

Deno.test("broadcast com permissionFn filtra por sender", () => {
  const group = new WebSocketGroup();
  const ws1 = new MockWebSocket();
  const ws2 = new MockWebSocket();

  group.addSocket(ws1 as unknown as WebSocket, { room: "A" });
  group.addSocket(ws2 as unknown as WebSocket, { room: "A" });

  // ✅ DUAL PARAMS: Filtra por senderParams
  group.broadcast(
    "admin-only",
    (_receiver, sender, _msg) => sender.role === "admin",
    { room: "A", role: "admin" }
  );

  assertEquals(ws1.sent, ["admin-only"]);
  assertEquals(ws2.sent, ["admin-only"]);
});

Deno.test("broadcast com permissionFn filtra por ambos", () => {
  const group = new WebSocketGroup();
  const ws1 = new MockWebSocket();
  const ws2 = new MockWebSocket();
  const ws3 = new MockWebSocket();

  group.addSocket(ws1 as unknown as WebSocket, { room: "A", user: "alice" });
  group.addSocket(ws2 as unknown as WebSocket, { room: "A", user: "bob" });
  group.addSocket(ws3 as unknown as WebSocket, { room: "B", user: "charlie" });

  // ✅ DUAL PARAMS: Filtra por receiver E sender
  group.broadcast(
    "message",
    (receiver, sender, _msg) => {
      return receiver.room === sender.room && receiver.user !== sender.user;
    },
    { room: "A", user: "alice" }
  );

  assertEquals(ws1.sent, []); // alice não recebe (é o sender)
  assertEquals(ws2.sent, ["message"]); // bob recebe (mesma sala, usuário diferente)
  assertEquals(ws3.sent, []); // charlie não recebe (sala diferente)
});

Deno.test("broadcast com permissionFn filtra por mensagem", () => {
  const group = new WebSocketGroup();
  const ws1 = new MockWebSocket();

  group.addSocket(ws1 as unknown as WebSocket, { room: "A" });

  // ✅ DUAL PARAMS: Filtra por conteúdo da mensagem
  group.broadcast(
    "spam message",
    (_receiver, _sender, msg) => !msg.includes("spam"),
    { room: "A" }
  );

  assertEquals(ws1.sent, []); // não recebe porque contém "spam"
});

Deno.test("novo membro recebe último broadcast ao entrar", async () => {
  const group = new WebSocketGroup();
  const ws1 = new MockWebSocket();
  
  group.addSocket(ws1 as unknown as WebSocket, { room: "A" });
  group.broadcast("first-msg", undefined, { room: "A" });

  const ws2 = new MockWebSocket();
  group.addSocket(ws2 as unknown as WebSocket, { room: "A" });
  group.sendLastBroadcastTo(ws2 as unknown as WebSocket, { room: "A" });

  await new Promise((resolve) => setTimeout(resolve, 100));

  assertEquals(ws2.sent, ["first-msg"]);
});

Deno
```

---

## Arquivo: `monorepo/router/tests/router_advanced_test.ts`

```ts
// monorepo/router/tests/router_advanced_test.ts
import { assertEquals } from "@std/assert";
import { createDenoRouter } from "../src/deno.ts";
import { WebSocketGroup } from "../src/mod.ts";

// ============================================================
// 1. Error Handling
// ============================================================
Deno.test("Handler HTTP que lança erro retorna 500", async () => {
  const app = createDenoRouter("", null, null);
  app.get("/error", () => {
    throw new Error("Database connection failed");
  });
  const req = new Request("http://localhost/error");
  const res = await app.handleRequest(req);
  assertEquals(res.status, 500);
  assertEquals(await res.text(), "Internal Server Error");
});

Deno.test("Handler HTTP assíncrono que rejeita retorna 500", async () => {
  const app = createDenoRouter("", null, null);
  app.get("/async-error", async () => {
    await new Promise(r => setTimeout(r, 10));
    throw new Error("Async boom");
  });
  const req = new Request("http://localhost/async-error");
  const res = await app.handleRequest(req);
  assertEquals(res.status, 500);
});

// ============================================================
// 2. Force HTTPS
// ============================================================
Deno.test("Force HTTPS redireciona em produção (não localhost)", async () => {
  const app = createDenoRouter({ basePath: "", forceHttps: true });
  app.get("/ping", () => ({ body: "pong" }));
  const req = new Request("http://example.com/ping");
  const res = await app.handleRequest(req);
  assertEquals(res.status, 301);
  assertEquals(res.headers.get("Location"), "https://example.com/ping");
  assertEquals(res.headers.get("Strict-Transport-Security"), "max-age=31536000; includeSubDomains");
});

Deno.test("Force HTTPS ignora localhost", async () => {
  const app = createDenoRouter({ basePath: "", forceHttps: true });
  app.get("/ping", () => ({ body: "pong" }));
  const req = new Request("http://localhost:8000/ping");
  const res = await app.handleRequest(req);
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "pong");
});

Deno.test("Force HTTPS ignora se já for HTTPS", async () => {
  const app = createDenoRouter({ basePath: "", forceHttps: true });
  app.get("/ping", () => ({ body: "pong" }));
  const req = new Request("https://example.com/ping");
  const res = await app.handleRequest(req);
  assertEquals(res.status, 200);
});

Deno.test("Force HTTPS ignora se x-forwarded-proto for https", async () => {
  const app = createDenoRouter({ basePath: "", forceHttps: true });
  app.get("/ping", () => ({ body: "pong" }));
  const req = new Request("http://example.com/ping", {
    headers: { "x-forwarded-proto": "https" }
  });
  const res = await app.handleRequest(req);
  assertEquals(res.status, 200);
});

// ============================================================
// 3. Last Broadcast com Dual Permission
// ============================================================
class MockWebSocket {
  readyState: number = 1;
  sent: string[] = [];
  send(data: string | ArrayBuffer | Blob) {
    if (typeof data === "string") {
      this.sent.push(data);
    }
  }
  close(code?: number, reason?: string) {
    this.readyState = 3;
  }
}

Deno.test("Last Broadcast NÃO vaza para sala diferente (Dual Permission)", async () => {
  const group = new WebSocketGroup();
  const ws1 = new MockWebSocket();
  group.addSocket(ws1 as unknown as WebSocket, { room: "A", user: "user1" });
  
  group.broadcast(
    "Segredo da Sala A",
    (receiver, sender, _msg) => receiver.room === sender.room,
    { room: "A", user: "user1" }
  );

  const ws2 = new MockWebSocket();
  group.addSocket(ws2 as unknown as WebSocket, { room: "B", user: "user2" });
  group.sendLastBroadcastTo(ws2 as unknown as WebSocket, { room: "B", user: "user2" });

  await new Promise(r => setTimeout(r, 100));

  // ✅ CORREÇÃO: O array esperado é VAZIO. A string é a mensagem de erro do assert.
  assertEquals(ws2.sent, [], "User2 na sala B não deve receber broadcast da sala A");
});

Deno.test("Last Broadcast É entregue para novo membro na mesma sala", async () => {
  const group = new WebSocketGroup();
  const ws1 = new MockWebSocket();
  group.addSocket(ws1 as unknown as WebSocket, { room: "A", user: "user1" });
  
  group.broadcast(
    "Bem-vindos!",
    (receiver, sender, _msg) => receiver.room === sender.room,
    { room: "A", user: "user1" }
  );

  const ws3 = new MockWebSocket();
  group.addSocket(ws3 as unknown as WebSocket, { room: "A", user: "user3" });
  group.sendLastBroadcastTo(ws3 as unknown as WebSocket, { room: "A", user: "user3" });

  await new Promise(r => setTimeout(r, 100));
  assertEquals(ws3.sent, ["Bem-vindos!"]);
});

Deno.test("Last Broadcast com delay customizado (0ms)", async () => {
  const group = new WebSocketGroup(0);
  const ws1 = new MockWebSocket();
  group.addSocket(ws1 as unknown as WebSocket, { room: "A" });
  group.broadcast("msg", undefined, { room: "A" });

  const ws2 = new MockWebSocket();
  group.addSocket(ws2 as unknown as WebSocket, { room: "A" });
  group.sendLastBroadcastTo(ws2 as unknown as WebSocket, { room: "A" });

  await new Promise(r => setTimeout(r, 10));
  assertEquals(ws2.sent, ["msg"]);
});

```

---

## Arquivo: `monorepo/router/tests/router_catchall_test.ts`

```ts
// monorepo/router/tests/router_catchall_test.ts
import { assertEquals } from "@std/assert";
import { createDenoRouter } from "../src/deno.ts";

Deno.test("Catch-all com * captura path completo", async () => {
  const app = createDenoRouter("", null, null);
  app.get("/files/*", (_req, params) => ({
    body: JSON.stringify(params.catch),
  }));

  const req = new Request("http://localhost/files/docs/readme.md");
  const res = await app.handleRequest(req);
  assertEquals(await res.json(), ["docs/readme.md"]);
});

Deno.test("Catch-all com múltiplos * gera array", async () => {
  const app = createDenoRouter("", null, null);
  app.get("/a/*/b/*", (_req, params) => ({
    body: JSON.stringify(params.catch),
  }));

  const req = new Request("http://localhost/a/x/b/y/z");
  const res = await app.handleRequest(req);
  assertEquals(await res.json(), ["x", "y/z"]);
});

Deno.test("Catch-all combinado com parâmetro nomeado", async () => {
  const app = createDenoRouter("", null, null);
  app.get("/api/:version/*", (_req, params) => ({
    body: JSON.stringify({ version: params.version, catch: params.catch }),
  }));

  const req = new Request("http://localhost/api/v1/foo/bar");
  const res = await app.handleRequest(req);
  assertEquals(await res.json(), { version: "v1", catch: ["foo/bar"] });
});

```

---

## Arquivo: `monorepo/router/tests/router_http_methods_test.ts`

```ts
// monorepo/router/tests/router_http_methods_test.ts
import { assertEquals, assertExists } from "@std/assert";
import { createDenoRouter } from "../src/deno.ts";

// ============================================================
// Testes para método OPTIONS (CORS preflight)
// ============================================================

Deno.test("OPTIONS retorna headers CORS corretos", async () => {
  const app = createDenoRouter("", null, null);
  
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };

  app.options("/*", () => ({
    body: "",
    init: { status: 204, headers: corsHeaders },
  }));

  const req = new Request("http://localhost/api/users", {
    method: "OPTIONS",
  });
  const res = await app.handleRequest(req);
  
  assertEquals(res.status, 204);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(
    res.headers.get("Access-Control-Allow-Methods"),
    "GET, POST, PUT, DELETE, PATCH, OPTIONS"
  );
  assertEquals(res.headers.get("Access-Control-Max-Age"), "86400");
});

Deno.test("OPTIONS com rota específica", async () => {
  const app = createDenoRouter("", null, null);
  
  app.options("/users/:id", (_req, params) => ({
    body: JSON.stringify({ allowed: ["GET", "PATCH", "DELETE"], id: params.id }),
    init: {
      headers: {
        "Allow": "GET, PATCH, DELETE, OPTIONS",
        "Content-Type": "application/json",
      },
    },
  }));

  const req = new Request("http://localhost/users/42", {
    method: "OPTIONS",
  });
  const res = await app.handleRequest(req);
  
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.allowed, ["GET", "PATCH", "DELETE"]);
  assertEquals(data.id, "42");
});

// ============================================================
// Testes para método PUT
// ============================================================

Deno.test("PUT atualiza recurso completo", async () => {
  const app = createDenoRouter("", null, null);
  
  app.put("/users/:id", async (req, params) => {
    const body = await req.json();
    return {
      body: JSON.stringify({
        updated: true,
        id: params.id,
        data: body,
      }),
      init: { headers: { "Content-Type": "application/json" } },
    };
  });

  const req = new Request("http://localhost/users/42", {
    method: "PUT",
    body: JSON.stringify({ name: "João", email: "joao@example.com" }),
    headers: { "Content-Type": "application/json" },
  });
  const res = await app.handleRequest(req);
  
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.updated, true);
  assertEquals(data.id, "42");
  assertEquals(data.data.name, "João");
});

Deno.test("PUT sem body funciona", async () => {
  const app = createDenoRouter("", null, null);
  
  app.put("/status", () => ({
    body: "Status updated",
    init: { status: 200 },
  }));

  const req = new Request("http://localhost/status", {
    method: "PUT",
  });
  const res = await app.handleRequest(req);
  
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "Status updated");
});

// ============================================================
// Testes para método DELETE
// ============================================================

Deno.test("DELETE remove recurso", async () => {
  const app = createDenoRouter("", null, null);
  
  app.delete("/users/:id", (_req, params) => ({
    body: JSON.stringify({ deleted: true, id: params.id }),
    init: {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  }));

  const req = new Request("http://localhost/users/42", {
    method: "DELETE",
  });
  const res = await app.handleRequest(req);
  
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.deleted, true);
  assertEquals(data.id, "42");
});

Deno.test("DELETE retorna 204 No Content", async () => {
  const app = createDenoRouter("", null, null);
  
  app.delete("/items/:id", (_req, params) => ({
    body: "",
    init: { status: 204 },
  }));

  const req = new Request("http://localhost/items/123", {
    method: "DELETE",
  });
  const res = await app.handleRequest(req);
  
  assertEquals(res.status, 204);
  assertEquals(await res.text(), "");
});

// ============================================================
// Testes para método PATCH
// ============================================================

Deno.test("PATCH atualiza recurso parcialmente", async () => {
  const app = createDenoRouter("", null, null);
  
  app.patch("/users/:id", async (req, params) => {
    const updates = await req.json();
    return {
      body: JSON.stringify({
        patched: true,
        id: params.id,
        updates,
      }),
      init: { headers: { "Content-Type": "application/json" } },
    };
  });

  const req = new Request("http://localhost/users/42", {
    method: "PATCH",
    body: JSON.stringify({ email: "novo@email.com" }),
    headers: { "Content-Type": "application/json" },
  });
  const res = await app.handleRequest(req);
  
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.patched, true);
  assertEquals(data.id, "42");
  assertEquals(data.updates.email, "novo@email.com");
});

Deno.test("PATCH com múltiplos campos", async () => {
  const app = createDenoRouter("", null, null);
  
  app.patch("/products/:id", async (req, params) => {
    const updates = await req.json();
    return {
      body: JSON.stringify({
        id: params.id,
        fieldsUpdated: Object.keys(updates),
      }),
      init: { headers: { "Content-Type": "application/json" } },
    };
  });

  const req = new Request("http://localhost/products/99", {
    method: "PATCH",
    body: JSON.stringify({
      price: 29.99,
      stock: 100,
      category: "electronics",
    }),
    headers: { "Content-Type": "application/json" },
  });
  const res = await app.handleRequest(req);
  
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.id, "99");
  assertEquals(data.fieldsUpdated, ["price", "stock", "category"]);
});

// ============================================================
// Testes para método HEAD
// ============================================================

Deno.test("HEAD retorna headers sem body", async () => {
  const app = createDenoRouter("", null, null);
  
  app.head("/users/:id", (_req, params) => ({
    body: JSON.stringify({ id: params.id, name: "João" }),
    init: {
      headers: {
        "Content-Type": "application/json",
        "X-Custom-Header": "test-value",
      },
    },
  }));

  const req = new Request("http://localhost/users/42", {
    method: "HEAD",
  });
  const res = await app.handleRequest(req);
  
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Content-Type"), "application/json");
  assertEquals(res.headers.get("X-Custom-Header"), "test-value");
  
  // HEAD não deve ter body (ou body vazio)
  const text = await res.text();
  assertEquals(text, "");
});

Deno.test("HEAD para verificar existência de recurso", async () => {
  const app = createDenoRouter("", null, null);
  
  app.head("/files/:name", (_req, params) => ({
    body: "",
    init: {
      status: 200,
      headers: {
        "Content-Length": "1024",
        "Last-Modified": "Mon, 25 Aug 2026 12:00:00 GMT",
      },
    },
  }));

  const req = new Request("http://localhost/files/document.pdf", {
    method: "HEAD",
  });
  const res = await app.handleRequest(req);
  
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Content-Length"), "1024");
  assertExists(res.headers.get("Last-Modified"));
});

// ============================================================
// Testes de métodos não permitidos
// ============================================================

Deno.test("Método não registrado retorna 404", async () => {
  const app = createDenoRouter("", null, null);
  
  app.get("/only-get", () => ({ body: "ok" }));

  const req = new Request("http://localhost/only-get", {
    method: "POST",
  });
  const res = await app.handleRequest(req);
  
  assertEquals(res.status, 404);
});

Deno.test("PUT em rota GET retorna 404", async () => {
  const app = createDenoRouter("", null, null);
  
  app.get("/resource", () => ({ body: "data" }));

  const req = new Request("http://localhost/resource", {
    method: "PUT",
    body: "update",
  });
  const res = await app.handleRequest(req);
  
  assertEquals(res.status, 404);
});

// ============================================================
// Testes com basePath
// ============================================================

Deno.test("OPTIONS com basePath funciona", async () => {
  const app = createDenoRouter("/api", null, null);
  
  app.options("/*", () => ({
    body: "",
    init: {
      status: 204,
      headers: { "Access-Control-Allow-Origin": "*" },
    },
  }));

  const req = new Request("http://localhost/api/users", {
    method: "OPTIONS",
  });
  const res = await app.handleRequest(req);
  
  assertEquals(res.status, 204);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("PUT com basePath e parâmetros", async () => {
  const app = createDenoRouter("/api/v1", null, null);
  
  app.put("/users/:id", async (req, params) => {
    const body = await req.json();
    return {
      body: JSON.stringify({ id: params.id, ...body }),
      init: { headers: { "Content-Type": "application/json" } },
    };
  });

  const req = new Request("http://localhost/api/v1/users/42", {
    method: "PUT",
    body: JSON.stringify({ name: "Maria" }),
    headers: { "Content-Type": "application/json" },
  });
  const res = await app.handleRequest(req);
  
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.id, "42");
  assertEquals(data.name, "Maria");
});

// ============================================================
// Testes de combinação de métodos
// ============================================================

Deno.test("Mesma rota com métodos diferentes", async () => {
  const app = createDenoRouter("", null, null);
  
  app.get("/resource", () => ({ body: "GET response" }));
  app.post("/resource", () => ({ body: "POST response", init: { status: 201 } }));
  app.put("/resource", () => ({ body: "PUT response" }));
  app.delete("/resource", () => ({ body: "DELETE response" }));
  app.patch("/resource", () => ({ body: "PATCH response" }));
  app.options("/resource", () => ({ body: "", init: { status: 204 } }));
  app.head("/resource", () => ({ body: "" }));

  // Testa cada método
  const methods = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"];
  
  for (const method of methods) {
    const req = new Request("http://localhost/resource", { method });
    const res = await app.handleRequest(req);
    
    if (method === "OPTIONS") {
      assertEquals(res.status, 204);
    } else if (method === "POST") {
      assertEquals(res.status, 201);
    } else {
      assertEquals(res.status, 200);
    }
  }
});

```

---

## Arquivo: `monorepo/router/tests/complementary_test.ts`

```ts
// monorepo/router/tests/complementary_test.ts
 import { assertEquals, assert } from "@std/assert";
 import { createDenoRouter } from "../src/deno.ts";
 import { WebSocketGroup } from "../src/mod.ts";
 
 // ============================================================
 // 1. ERROR HANDLING
 // ============================================================
 Deno.test("Handler HTTP que lança erro retorna 500", async () => {
   const app = createDenoRouter("", null, null);
   app.get("/error", () => {
     throw new Error("Database connection failed");
   });
   const req = new Request("http://localhost/error");
   const res = await app.handleRequest(req);
   assertEquals(res.status, 500);
   assertEquals(await res.text(), "Internal Server Error");
 });
 
 Deno.test("Handler HTTP assíncrono que rejeita retorna 500", async () => {
   const app = createDenoRouter("", null, null);
   app.get("/async-error", async () => {
     await new Promise(r => setTimeout(r, 10));
     throw new Error("Async boom");
   });
   const req = new Request("http://localhost/async-error");
   const res = await app.handleRequest(req);
   assertEquals(res.status, 500);
 });
 
 // ============================================================
 // 2. FORCE HTTPS
 // ============================================================
 Deno.test("Force HTTPS redireciona em produção (não localhost)", async () => {
   const app = createDenoRouter({ basePath: "", forceHttps: true });
   app.get("/ping", () => ({ body: "pong" }));
   const req = new Request("http://example.com/ping");
   const res = await app.handleRequest(req);
   assertEquals(res.status, 301);
   assertEquals(res.headers.get("Location"), "https://example.com/ping");
   assertEquals(res.headers.get("Strict-Transport-Security"), "max-age=31536000; includeSubDomains");
 });
 
 Deno.test("Force HTTPS ignora localhost", async () => {
   const app = createDenoRouter({ basePath: "", forceHttps: true });
   app.get("/ping", () => ({ body: "pong" }));
   const req = new Request("http://localhost:8000/ping");
   const res = await app.handleRequest(req);
   assertEquals(res.status, 200);
   assertEquals(await res.text(), "pong");
 });
 
 Deno.test("Force HTTPS ignora se x-forwarded-proto for https", async () => {
   const app = createDenoRouter({ basePath: "", forceHttps: true });
   app.get("/ping", () => ({ body: "pong" }));
   const req = new Request("http://example.com/ping", {
     headers: { "x-forwarded-proto": "https" }
   });
   const res = await app.handleRequest(req);
   assertEquals(res.status, 200);
 });
 
 // ============================================================
 // 3. MIDDLEWARES
 // ============================================================
 Deno.test("Middleware HTTP: executa antes do handler e pode abortar", async () => {
   const app = createDenoRouter("", null, null);
   app.use((_req, _params, _next) => {
     return new Response("Unauthorized", { status: 401 });
   });
   app.get("/protected", () => ({ body: "secret" }));
   const req = new Request("http://localhost/protected");
   const res = await app.handleRequest(req);
   assertEquals(res.status, 401);
   assertEquals(await res.text(), "Unauthorized");
 });
 
 Deno.test("Middleware HTTP: múltiplos middlewares em cadeia", async () => {
   const app = createDenoRouter("", null, null);
   const order: number[] = [];
   app.use(async (_req, _params, next) => {
     order.push(1);
     const res = await next();
     order.push(4);
     return res;
   });
   app.use(async (_req, _params, next) => {
     order.push(2);
     const res = await next();
     order.push(3);
     return res;
   });
   app.get("/test", () => {
     return { body: "ok" };
   });
   const req = new Request("http://localhost/test");
   await app.handleRequest(req);
   assertEquals(order, [1, 2, 3, 4]);
 });
 
 Deno.test("Middleware HTTP: modifica a resposta", async () => {
   const app = createDenoRouter("", null, null);
   app.use(async (_req, _params, next) => {
     const res = await next();
     res.headers.set("X-Middleware", "applied");
     return res;
   });
   app.get("/test", () => ({ body: "ok" }));
   const req = new Request("http://localhost/test");
   const res = await app.handleRequest(req);
   assertEquals(res.headers.get("X-Middleware"), "applied");
 });
 
 Deno.test("Middleware HTTP: executa mesmo sem rota (404)", async () => {
   const app = createDenoRouter("", null, null);
   let middlewareCalled = false;
   app.use(async (_req, _params, next) => {
     middlewareCalled = true;
     return await next();
   });
   const req = new Request("http://localhost/inexistente");
   const res = await app.handleRequest(req);
   assertEquals(res.status, 404);
   assertEquals(middlewareCalled, true, "Middleware deve executar mesmo sem rota");
 });
 
 Deno.test("Middleware WS: aborta upgrade sem token", async () => {
   const app = createDenoRouter("", null, null);
   app.use((req, _params, next) => {
     if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
       return next();
     }
     const token = req.headers.get("authorization");
     if (!token) {
       return new Response("Token required", { status: 401 });
     }
     return next();
   });
   app.ws("/chat", () => {});
   
   const req1 = new Request("http://localhost/chat", {
     headers: { upgrade: "websocket" },
   });
   const res1 = await app.handleRequest(req1);
   assertEquals(res1.status, 401);
 });
 
 Deno.test("Middleware WS: não é chamado para rotas WS inexistentes", async () => {
   const app = createDenoRouter("", null, null);
   let middlewareCalled = false;
   app.use(async (_req, _params, next) => {
     middlewareCalled = true;
     return await next();
   });
   const req = new Request("http://localhost/inexistente", {
     headers: { upgrade: "websocket" },
   });
   const res = await app.handleRequest(req);
   assertEquals(res.status, 404);
   assertEquals(middlewareCalled, true, "Middleware deve executar mesmo para 404 WS");
 });
 
 Deno.test("Middleware WS: pode passar Request modificada para next()", async () => {
   const app = createDenoRouter("", null, null);
   app.use(async (req, _params, next) => {
     if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
       return next();
     }
     // Cria nova request com header injetado
     const newHeaders = new Headers(req.headers);
     newHeaders.set("X-User-Id", "42");
     const newReq = new Request(req.url, {
       method: req.method,
       headers: newHeaders,
     });
     return next(newReq);
   });
   
   let receivedUserId: string | null = null;
   app.ws("/chat", (ws, req) => {
     receivedUserId = req.headers.get("X-User-Id");
     ws.close(1000, "Test done");
   });
   
   // ✅ CORREÇÃO: Adicionado connection: Upgrade para satisfazer o Deno
   const req = new Request("http://localhost/chat", {
     headers: {
       upgrade: "websocket",
       connection: "Upgrade", // <--- Adicionado para evitar TypeError no upgradeWebSocket
       "sec-websocket-version": "13",
       "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
     },
   });
   
   await app.handleRequest(req);
   // Aguarda um tick para o handler executar
   await new Promise((r) => setTimeout(r, 50));
   assertEquals(receivedUserId, "42", "Handler deve receber a request modificada");
 });
 
 // ============================================================
 // 4. LAST BROADCAST COM DUAL PERMISSION
 // ============================================================
 class MockWebSocket {
   readyState: number = 1;
   sent: string[] = [];
   send(data: string | ArrayBuffer | Blob) {
     if (typeof data === "string") {
       this.sent.push(data);
     }
   }
   close(code?: number, reason?: string) {
     this.readyState = 3;
   }
 }
 
 Deno.test("Last Broadcast NÃO vaza para sala diferente (Dual Permission)", async () => {
   const group = new WebSocketGroup();
   const ws1 = new MockWebSocket();
   group.addSocket(ws1 as unknown as WebSocket, { room: "A", user: "user1" });
   group.broadcast(
     "Segredo da Sala A",
     (receiver, sender, _msg) => receiver.room === sender.room,
     { room: "A", user: "user1" }
   );
   
   const ws2 = new MockWebSocket();
   group.addSocket(ws2 as unknown as WebSocket, { room: "B", user: "user2" });
   group.sendLastBroadcastTo(ws2 as unknown as WebSocket, { room: "B", user: "user2" });
   
   await new Promise(r => setTimeout(r, 100));
   assertEquals(ws2.sent, [], "User2 na sala B não deve receber broadcast da sala A");
 });
 
 Deno.test("Last Broadcast É entregue para novo membro na mesma sala", async () => {
   const group = new WebSocketGroup();
   const ws1 = new MockWebSocket();
   group.addSocket(ws1 as unknown as WebSocket, { room: "A", user: "user1" });
   group.broadcast(
     "Bem-vindos!",
     (receiver, sender, _msg) => receiver.room === sender.room,
     { room: "A", user: "user1" }
   );
   
   const ws3 = new MockWebSocket();
   group.addSocket(ws3 as unknown as WebSocket, { room: "A", user: "user3" });
   group.sendLastBroadcastTo(ws3 as unknown as WebSocket, { room: "A", user: "user3" });
   
   await new Promise(r => setTimeout(r, 100));
   assertEquals(ws3.sent, ["Bem-vindos!"]);
 });
 
 Deno.test("Last Broadcast com delay customizado (0ms)", async () => {
   const group = new WebSocketGroup(0);
   const ws1 = new MockWebSocket();
   group.addSocket(ws1 as unknown as WebSocket, { room: "A" });
   group.broadcast("msg", undefined, { room: "A" });
   
   const ws2 = new MockWebSocket();
   group.addSocket(ws2 as unknown as WebSocket, { room: "A" });
   group.sendLastBroadcastTo(ws2 as unknown as WebSocket, { room: "A" });
   
   await new Promise(r => setTimeout(r, 10));
   assertEquals(ws2.sent, ["msg"]);
 });

```

---

## Arquivo: `monorepo/router/tests/middleware_test.ts`

```ts
// monorepo/router/tests/middleware_test.ts
 import { assertEquals, assert } from "@std/assert";
 import { createDenoRouter } from "../src/deno.ts";
 // ============================================================
 // 1. MIDDLEWARE HTTP - BÁSICO
 // ============================================================
 Deno.test("Middleware HTTP: executa antes do handler", async () => {
   const app = createDenoRouter("", null, null);
   const calls: string[] = [];
   app.use(async (_req, _params, next) => {
     calls.push("middleware");
     return await next();
   });
   app.get("/test", () => {
     calls.push("handler");
     return { body: "ok" };
   });
   const req = new Request("http://localhost/test");
   const res = await app.handleRequest(req);
   assertEquals(res.status, 200);
   assertEquals(await res.text(), "ok");
   assertEquals(calls, ["middleware", "handler"]);
 });
 Deno.test("Middleware HTTP: pode abortar o fluxo (401)", async () => {
   const app = createDenoRouter("", null, null);
   app.use((_req, _params, _next) => {
     return new Response("Unauthorized", { status: 401 });
   });
   app.get("/protected", () => ({ body: "secret" }));
   const req = new Request("http://localhost/protected");
   const res = await app.handleRequest(req);
   assertEquals(res.status, 401);
   assertEquals(await res.text(), "Unauthorized");
 });
 Deno.test("Middleware HTTP: múltiplos middlewares em cadeia", async () => {
   const app = createDenoRouter("", null, null);
   const order: number[] = [];
   app.use(async (_req, _params, next) => {
     order.push(1);
     const res = await next();
     order.push(5);
     return res;
   });
   app.use(async (_req, _params, next) => {
     order.push(2);
     const res = await next();
     order.push(4);
     return res;
   });
   app.get("/test", () => {
     order.push(3);
     return { body: "ok" };
   });
   const req = new Request("http://localhost/test");
   await app.handleRequest(req);
   assertEquals(order, [1, 2, 3, 4, 5]);
 });
 Deno.test("Middleware HTTP: modifica a resposta", async () => {
   const app = createDenoRouter("", null, null);
   app.use(async (_req, _params, next) => {
     const res = await next();
     res.headers.set("X-Middleware", "applied");
     return res;
   });
   app.get("/test", () => ({ body: "ok" }));
   const req = new Request("http://localhost/test");
   const res = await app.handleRequest(req);
   assertEquals(res.headers.get("X-Middleware"), "applied");
 });
 Deno.test("Middleware HTTP: middleware de log mede tempo", async () => {
   const app = createDenoRouter("", null, null);
   let measuredMs = -1;
   app.use(async (_req, _params, next) => {
     const start = Date.now();
     const res = await next();
     measuredMs = Date.now() - start;
     return res;
   });
   app.get("/slow", async () => {
     await new Promise((r) => setTimeout(r, 50));
     return { body: "ok" };
   });
   const req = new Request("http://localhost/slow");
   await app.handleRequest(req);
   assert(measuredMs >= 45, `Tempo medido (${measuredMs}ms) deve ser >= 45ms`);
 });
 // ============================================================
 // 2. MIDDLEWARE HTTP - EDGE CASES
 // ============================================================
 Deno.test("Middleware HTTP: executa mesmo sem rota (404)", async () => {
   const app = createDenoRouter("", null, null);
   let middlewareCalled = false;
   app.use(async (_req, _params, next) => {
     middlewareCalled = true;
     return await next();
   });
   const req = new Request("http://localhost/inexistente");
   const res = await app.handleRequest(req);
   assertEquals(res.status, 404);
   assertEquals(middlewareCalled, true, "Middleware deve executar mesmo sem rota");
 });
 Deno.test("Middleware HTTP: CORS em arquivo estático", async () => {
   const tmpDir = await Deno.makeTempDir();
   await Deno.writeTextFile(`${tmpDir}/hello.txt`, "world");
   const app = createDenoRouter("", tmpDir, null);
   app.use(async (_req, _params, next) => {
     const res = await next();
     res.headers.set("Access-Control-Allow-Origin", "*");
     return res;
   });
   const req = new Request("http://localhost/hello.txt");
   const res = await app.handleRequest(req);
   assertEquals(res.status, 200);
   assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
   await Deno.remove(tmpDir, { recursive: true });
 });
 Deno.test("Middleware HTTP: múltiplas chamadas de next() são protegidas", async () => {
   const app = createDenoRouter("", null, null);
   const handlerCalls: number[] = [];
   app.use(async (_req, _params, next) => {
     const r1 = await next(); // 1ª chamada OK
     // Tenta chamar de novo - deve falhar
     try {
       await next();
     } catch {
       // Ignora
     }
     return r1;
   });
   app.get("/test", () => {
     handlerCalls.push(1);
     return { body: "ok" };
   });
   const req = new Request("http://localhost/test");
   const res = await app.handleRequest(req);
   // Handler deve ser chamado APENAS UMA VEZ
   assertEquals(handlerCalls, [1]);
   assertEquals(res.status, 200);
 });
 // ============================================================
 // 3. MIDDLEWARE WEBSOCKET
 // ============================================================
 Deno.test("Middleware WS: aborta upgrade sem token", async () => {
   const app = createDenoRouter("", null, null);
   app.use((req, _params, next) => {
     if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
       return next();
     }
     const token = req.headers.get("authorization");
     if (!token) {
       return new Response("Token required", { status: 401 });
     }
     return next();
   });
   app.ws("/chat", () => {});
   // Sem token - deve retornar 401
   const req1 = new Request("http://localhost/chat", {
     headers: { upgrade: "websocket" },
   });
   const res1 = await app.handleRequest(req1);
   assertEquals(res1.status, 401);
   // Com token - deve permitir upgrade (101)
   // ✅ CORREÇÃO: Deno.upgradeWebSocket exige o header 'connection: Upgrade'
   const req2 = new Request("http://localhost/chat", {
     headers: {
       upgrade: "websocket",
       connection: "Upgrade",
       authorization: "Bearer valid-token",
       "sec-websocket-version": "13",
       "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
     },
   });
   const res2 = await app.handleRequest(req2);
   assertEquals(res2.status, 101);
 });
 Deno.test("Middleware WS: não é chamado para rotas WS inexistentes", async () => {
   const app = createDenoRouter("", null, null);
   let middlewareCalled = false;
   app.use(async (_req, _params, next) => {
     middlewareCalled = true;
     return await next();
   });
   // ✅ CORREÇÃO: Com o novo fluxo, middlewares EXECUTAM mesmo para 404 WS
   const req = new Request("http://localhost/inexistente", {
     headers: { upgrade: "websocket" },
   });
   const res = await app.handleRequest(req);
   assertEquals(res.status, 404);
   assertEquals(middlewareCalled, true, "Middleware deve executar mesmo para 404 WS");
 });
 Deno.test("Middleware WS: pode passar Request modificada para next()", async () => {
   const app = createDenoRouter("", null, null);
   app.use(async (req, _params, next) => {
     if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
       return next();
     }
     // Cria nova request com header injetado
     const newHeaders = new Headers(req.headers);
     newHeaders.set("X-User-Id", "42");
     const newReq = new Request(req.url, {
       method: req.method,
       headers: newHeaders,
     });
     return next(newReq);
   });
   let receivedUserId: string | null = null;
   app.ws("/chat", (ws, req) => {
     receivedUserId = req.headers.get("X-User-Id");
     ws.close(1000, "Test done");
   });
   // ✅ CORREÇÃO: Adicionado connection: Upgrade para satisfazer o Deno
   const req = new Request("http://localhost/chat", {
     headers: {
       upgrade: "websocket",
       connection: "Upgrade",
       "sec-websocket-version": "13",
       "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
     },
   });
   await app.handleRequest(req);
   // Aguarda um tick para o handler executar
   await new Promise((r) => setTimeout(r, 50));
   assertEquals(receivedUserId, "42", "Handler deve receber a request modificada");
 });
 // ============================================================
 // 4. MIDDLEWARE + ROUTES COMBINADAS
 // ============================================================
 Deno.test("Middleware HTTP: autenticação com rotas públicas e privadas", async () => {
   const app = createDenoRouter("", null, null);
   // Middleware global de autenticação
   app.use(async (req, _params, next) => {
     const path = new URL(req.url).pathname;
     if (path === "/public") {
       return await next(); // Rota pública
     }
     const auth = req.headers.get("authorization");
     if (!auth || auth !== "Bearer valid") {
       return new Response("Unauthorized", { status: 401 });
     }
     return await next();
   });
   app.get("/public", () => ({ body: "public data" }));
   app.get("/private", () => ({ body: "private data" }));
   // Rota pública - sem auth
   const req1 = new Request("http://localhost/public");
   const res1 = await app.handleRequest(req1);
   assertEquals(res1.status, 200);
   assertEquals(await res1.text(), "public data");
   // Rota privada - sem auth (deve falhar)
   const req2 = new Request("http://localhost/private");
   const res2 = await app.handleRequest(req2);
   assertEquals(res2.status, 401);
   // Rota privada - com auth
   const req3 = new Request("http://localhost/private", {
     headers: { authorization: "Bearer valid" },
   });
   const res3 = await app.handleRequest(req3);
   assertEquals(res3.status, 200);
   assertEquals(await res3.text(), "private data");
 });
 Deno.test("Middleware: CORS preflight (OPTIONS) é tratado corretamente", async () => {
   const app = createDenoRouter("", null, null);
   app.use(async (req, _params, next) => {
     if (req.method === "OPTIONS") {
       return new Response(null, {
         status: 204,
         headers: {
           "Access-Control-Allow-Origin": "*",
           "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
           "Access-Control-Allow-Headers": "Content-Type",
         },
       });
     }
     const res = await next();
     res.headers.set("Access-Control-Allow-Origin", "*");
     return res;
   });
   app.get("/data", () => ({ body: "ok" }));
   // Preflight OPTIONS
   const req1 = new Request("http://localhost/data", { method: "OPTIONS" });
   const res1 = await app.handleRequest(req1);
   assertEquals(res1.status, 204);
   assertEquals(res1.headers.get("Access-Control-Allow-Origin"), "*");
   // Request normal GET
   const req2 = new Request("http://localhost/data");
   const res2 = await app.handleRequest(req2);
   assertEquals(res2.status, 200);
   assertEquals(res2.headers.get("Access-Control-Allow-Origin"), "*");
 });

```

---

## Arquivo: `monorepo/router/tests/router_http_test.ts`

```ts
import { assertEquals } from "@std/assert";
import { createDenoRouter } from "../src/deno.ts";

Deno.test("GET rota simples retorna body correto", async () => {
  const app = createDenoRouter({ basePath: "" });
  app.get("/hello", () => ({ body: "world" }));
  const req = new Request("http://localhost/hello");
  const res = await app.handleRequest(req);
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "world");
});

Deno.test("GET com parâmetros nomeados", async () => {
  const app = createDenoRouter({ basePath: "" });
  app.get("/users/:id", (_req, params) => ({
    body: JSON.stringify({ id: params.id }),
  }));
  const req = new Request("http://localhost/users/42");
  const res = await app.handleRequest(req);
  assertEquals(await res.json(), { id: "42" });
});

Deno.test("GET com múltiplos parâmetros", async () => {
  const app = createDenoRouter({ basePath: "" });
  app.get("/a/:x/b/:y", (_req, params) => ({
    body: JSON.stringify(params),
  }));
  const req = new Request("http://localhost/a/1/b/2");
  const res = await app.handleRequest(req);
  assertEquals(await res.json(), { x: "1", y: "2" });
});

Deno.test("POST retorna 201", async () => {
  const app = createDenoRouter({ basePath: "" });
  app.post("/items", async (req) => {
    const body = await req.text();
    return { body, init: { status: 201 } };
  });
  const req = new Request("http://localhost/items", {
    method: "POST",
    body: "test",
  });
  const res = await app.handleRequest(req);
  assertEquals(res.status, 201);
  assertEquals(await res.text(), "test");
});

Deno.test("basePath é aplicado corretamente", async () => {
  const app = createDenoRouter({ basePath: "/api" });
  app.get("/ping", () => ({ body: "pong" }));
  const req = new Request("http://localhost/api/ping");
  const res = await app.handleRequest(req);
  assertEquals(await res.text(), "pong");
});

Deno.test("Rota inexistente retorna 404 (sem static)", async () => {
  const app = createDenoRouter({ basePath: "" });
  app.get("/exists", () => ({ body: "ok" }));
  const req = new Request("http://localhost/nope");
  const res = await app.handleRequest(req);
  assertEquals(res.status, 404);
});

Deno.test("Método HTTP errado retorna 404", async () => {
  const app = createDenoRouter({ basePath: "" });
  app.get("/only-get", () => ({ body: "ok" }));
  const req = new Request("http://localhost/only-get", { method: "POST" });
  const res = await app.handleRequest(req);
  assertEquals(res.status, 404);
});
```

---

## Arquivo: `monorepo/router/tests/router_static_test.ts`

```ts
import { assertEquals } from "@std/assert";
import { createDenoRouter } from "../src/deno.ts";

Deno.test("serve arquivo estático existente", async () => {
  const tmpDir = await Deno.makeTempDir();
  await Deno.writeTextFile(`${tmpDir}/hello.txt`, "hello world");
  const app = createDenoRouter({ basePath: "", staticDir: tmpDir });
  const req = new Request("http://localhost/hello.txt");
  const res = await app.handleRequest(req);
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "hello world");
  assertEquals(res.headers.get("content-type"), "text/plain; charset=utf-8");
  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("serve index.html para path de diretório", async () => {
  const tmpDir = await Deno.makeTempDir();
  await Deno.mkdir(`${tmpDir}/sub`);
  await Deno.writeTextFile(`${tmpDir}/sub/index.html`, "<h1>Hi</h1>");
  const app = createDenoRouter({ basePath: "", staticDir: tmpDir });
  const req = new Request("http://localhost/sub/");
  const res = await app.handleRequest(req);
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "<h1>Hi</h1>");
  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("retorna 404 para arquivo inexistente", async () => {
  const tmpDir = await Deno.makeTempDir();
  const app = createDenoRouter({ basePath: "", staticDir: tmpDir });
  const req = new Request("http://localhost/nope.txt");
  const res = await app.handleRequest(req);
  assertEquals(res.status, 404);
  await Deno.remove(tmpDir, { recursive: true });
});
```

---

## Arquivo: `monorepo/router/tests/path_traversal_test.ts`

```ts
import { assertEquals, assertStringIncludes } from "@std/assert";
import { createDenoRouter } from "../src/deno.ts";
import { join } from "@std/path";

async function setupFixture(): Promise<{ tmpRoot: string; publicDir: string }> {
  const tmpRoot = await Deno.makeTempDir({ prefix: "router_traversal_" });
  const publicDir = join(tmpRoot, "public");
  await Deno.mkdir(publicDir);
  await Deno.writeTextFile(join(tmpRoot, "secret.txt"), "TOP-SECRET-DATA");
  await Deno.writeTextFile(join(publicDir, "hello.txt"), "hello world");
  await Deno.writeTextFile(join(publicDir, "index.html"), "<h1>home</h1>");
  return { tmpRoot, publicDir };
}

async function cleanup(path: string) {
  try { await Deno.remove(path, { recursive: true }); } catch { /* ignora */ }
}

Deno.test("Path traversal: ../ não deve escapar do staticDir", async () => {
  const { tmpRoot, publicDir } = await setupFixture();
  try {
    const app = createDenoRouter({ basePath: "", staticDir: publicDir });
    const req = new Request("http://localhost/../secret.txt");
    const res = await app.handleRequest(req);
    assertEquals(res.status, 404, "Deve retornar 404 ao tentar path traversal com ..");
    const body = await res.text();
    assertEquals(body.includes("TOP-SECRET-DATA"), false, "NUNCA deve vazar conteúdo do arquivo secreto");
  } finally { await cleanup(tmpRoot); }
});

Deno.test("Path traversal: múltiplos ../ não escapam", async () => {
  const { tmpRoot, publicDir } = await setupFixture();
  try {
    const app = createDenoRouter({ basePath: "", staticDir: publicDir });
    const req = new Request("http://localhost/../../secret.txt");
    const res = await app.handleRequest(req);
    assertEquals(res.status, 404);
    const body = await res.text();
    assertEquals(body.includes("TOP-SECRET-DATA"), false);
  } finally { await cleanup(tmpRoot); }
});

Deno.test("Path traversal: /subdir/../../secret.txt não escapa", async () => {
  const { tmpRoot, publicDir } = await setupFixture();
  try {
    const app = createDenoRouter({ basePath: "", staticDir: publicDir });
    const req = new Request("http://localhost/subdir/../../secret.txt");
    const res = await app.handleRequest(req);
    assertEquals(res.status, 404);
    const body = await res.text();
    assertEquals(body.includes("TOP-SECRET-DATA"), false);
  } finally { await cleanup(tmpRoot); }
});

Deno.test("Path traversal: URL-encoded ..%2F não escapa", async () => {
  const { tmpRoot, publicDir } = await setupFixture();
  try {
    const app = createDenoRouter({ basePath: "", staticDir: publicDir });
    const req = new Request("http://localhost/..%2Fsecret.txt");
    const res = await app.handleRequest(req);
    assertEquals(res.status, 404);
    const body = await res.text();
    assertEquals(body.includes("TOP-SECRET-DATA"), false);
  } finally { await cleanup(tmpRoot); }
});

Deno.test("Path traversal: backslash (Windows-style) não escapa", async () => {
  const { tmpRoot, publicDir } = await setupFixture();
  try {
    const app = createDenoRouter({ basePath: "", staticDir: publicDir });
    const req = new Request("http://localhost/..\\secret.txt");
    const res = await app.handleRequest(req);
    const body = await res.text();
    assertEquals(body.includes("TOP-SECRET-DATA"), false);
  } finally { await cleanup(tmpRoot); }
});

Deno.test("Path traversal: basePath não é bypassado", async () => {
  const { tmpRoot, publicDir } = await setupFixture();
  try {
    const app = createDenoRouter({ basePath: "/api", staticDir: publicDir });
    const req = new Request("http://localhost/api/../secret.txt");
    const res = await app.handleRequest(req);
    const body = await res.text();
    assertEquals(body.includes("TOP-SECRET-DATA"), false);
  } finally { await cleanup(tmpRoot); }
});

Deno.test("Arquivo legítimo dentro do staticDir é servido normalmente", async () => {
  const { tmpRoot, publicDir } = await setupFixture();
  try {
    const app = createDenoRouter({ basePath: "", staticDir: publicDir });
    const req = new Request("http://localhost/hello.txt");
    const res = await app.handleRequest(req);
    assertEquals(res.status, 200);
    assertEquals(await res.text(), "hello world");
  } finally { await cleanup(tmpRoot); }
});

Deno.test("Arquivo legítimo em subpasta é servido", async () => {
  const tmpRoot = await Deno.makeTempDir({ prefix: "router_sub_" });
  const publicDir = join(tmpRoot, "public");
  const subDir = join(publicDir, "docs");
  await Deno.mkdir(subDir, { recursive: true });
  await Deno.writeTextFile(join(subDir, "readme.txt"), "readme content");
  try {
    const app = createDenoRouter({ basePath: "", staticDir: publicDir });
    const req = new Request("http://localhost/docs/readme.txt");
    const res = await app.handleRequest(req);
    assertEquals(res.status, 200);
    assertEquals(await res.text(), "readme content");
  } finally { await cleanup(tmpRoot); }
});
```

---

## Arquivo: `monorepo/router/tests/websocket_real_test.ts`

```ts
import { assertEquals, assertExists } from "@std/assert";
import { createDenoRouter } from "../src/deno.ts";
import type { Router } from "../src/deno.ts";

function waitFor(
  condition: () => boolean,
  timeoutMs = 2000,
  intervalMs = 20,
): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (condition()) return resolve(true);
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(check, intervalMs);
    };
    check();
  });
}

async function startServer(app: Router): Promise<{ server: Deno.HttpServer; port: number }> {
  const controller = new AbortController();
  const server = Deno.serve(
    { port: 0, signal: controller.signal, onListen: () => {} },
    app.handleRequest.bind(app),
  );
  const addr = server.addr;
  return { server, port: addr.port };
}

Deno.test("WebSocket real: conexão, broadcast e last broadcast para novo membro", async () => {
  const app = createDenoRouter({ basePath: "/api" });
  const receivedByUser1: string[] = [];
  const receivedByUser2: string[] = [];
  app.ws("/chat/:room/:user", (ws, _req, params) => {
    const room = params.room as string;
    const user = params.user as string;
    const group = app.getWsGroupByPath("/chat/:room/:user");
    if (!group) { ws.close(1011, "No group"); return; }
    ws.onmessage = (event) => {
      group.broadcast(
        `[${user}]: ${event.data}`,
        (clientParams) => clientParams.room === room,
        params,
      );
    };
  });
  const { server, port } = await startServer(app);
  try {
    const ws1 = new WebSocket(`ws://localhost:${port}/api/chat/roomA/user1`);
    await waitFor(() => ws1.readyState === WebSocket.OPEN);
    assertEquals(ws1.readyState, WebSocket.OPEN, "user1 deve conectar");
    ws1.onmessage = (e) => receivedByUser1.push(e.data);
    
    const ws2 = new WebSocket(`ws://localhost:${port}/api/chat/roomA/user2`);
    await waitFor(() => ws2.readyState === WebSocket.OPEN);
    assertEquals(ws2.readyState, WebSocket.OPEN, "user2 deve conectar");
    ws2.onmessage = (e) => receivedByUser2.push(e.data);
    
    await new Promise((r) => setTimeout(r, 100));
    ws1.send("hello from user1");
    await waitFor(() => receivedByUser2.length >= 1);
    assertEquals(receivedByUser2[0], "[user1]: hello from user1");
    assertEquals(receivedByUser1[0], "[user1]: hello from user1");
    
    const receivedByUser3: string[] = [];
    const ws3 = new WebSocket(`ws://localhost:${port}/api/chat/roomA/user3`);
    ws3.onmessage = (e) => receivedByUser3.push(e.data);
    await waitFor(() => ws3.readyState === WebSocket.OPEN);
    const got = await waitFor(() => receivedByUser3.length >= 1, 2000);
    assertEquals(got, true, "user3 deve receber o último broadcast ao conectar");
    assertEquals(receivedByUser3[0], "[user1]: hello from user1");
    
    const receivedByUser4: string[] = [];
    const ws4 = new WebSocket(`ws://localhost:${port}/api/chat/roomB/user4`);
    ws4.onmessage = (e) => receivedByUser4.push(e.data);
    await waitFor(() => ws4.readyState === WebSocket.OPEN);
    await new Promise((r) => setTimeout(r, 200));
    assertEquals(receivedByUser4.length, 0, "user4 em roomB não deve receber broadcast de roomA");
    
    ws1.close(); ws2.close(); ws3.close(); ws4.close();
    await new Promise((r) => setTimeout(r, 100));
  } finally {
    app.closeAllWebSockets();
    await server.shutdown();
  }
});

Deno.test("WebSocket real: rota inexistente retorna 404", async () => {
  const app = createDenoRouter({ basePath: "/api" });
  app.ws("/exists", () => {});
  const { server, port } = await startServer(app);
  try {
    const ws = new WebSocket(`ws://localhost:${port}/api/nope`);
    const errored = await waitFor(() => ws.readyState === WebSocket.CLOSED, 2000);
    assertEquals(errored, true, "WebSocket deve fechar ao tentar rota inexistente");
  } finally { await server.shutdown(); }
});

Deno.test("WebSocket real: closeGroup fecha todos os sockets do grupo", async () => {
  const app = createDenoRouter({ basePath: "/api" });
  app.ws("/chat/:room/:user", () => {});
  const { server, port } = await startServer(app);
  try {
    const ws1 = new WebSocket(`ws://localhost:${port}/api/chat/room1/user1`);
    const ws2 = new WebSocket(`ws://localhost:${port}/api/chat/room1/user2`);
    await waitFor(() => ws1.readyState === WebSocket.OPEN && ws2.readyState === WebSocket.OPEN);
    const closed = app.closeGroupByPath("/chat/:room/:user");
    assertEquals(closed, true);
    await waitFor(() => ws1.readyState === WebSocket.CLOSED && ws2.readyState === WebSocket.CLOSED);
    assertEquals(ws1.readyState, WebSocket.CLOSED);
    assertEquals(ws2.readyState, WebSocket.CLOSED);
  } finally {
    app.closeAllWebSockets();
    await server.shutdown();
  }
});
```

---

## Arquivo: `monorepo/router/tests/adapters_test.ts`

```ts
// monorepo/router/tests/adapters_test.ts
import { assertEquals, assert } from "@std/assert";
import { Router } from "../src/mod.ts";
import { createDenoRouter } from "../src/deno.ts";
import { cloudflareWebSocketUpgrader, createKVStaticFileHandler } from "../src/adapters/cloudflare.ts";
import type { KVNamespace } from "../src/adapters/cloudflare-types.ts";

// ============================================================
// 1. TESTES DO ADAPTADOR DENO
// ============================================================
Deno.test("createDenoRouter cria router com adaptadores configurados", () => {
  const app = createDenoRouter({ basePath: "/api", staticDir: null });
  assert(app instanceof Router, "Deve retornar instância de Router");
});

Deno.test("createDenoRouter com staticDir serve arquivos", async () => {
  const tmpDir = await Deno.makeTempDir();
  await Deno.writeTextFile(`${tmpDir}/hello.txt`, "hello world");
  const app = createDenoRouter({ basePath: "", staticDir: tmpDir });
  const req = new Request("http://localhost/hello.txt");
  const res = await app.handleRequest(req);
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "hello world");
  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("createDenoRouter sem staticDir retorna 404 para estáticos", async () => {
  const app = createDenoRouter({ basePath: "", staticDir: null });
  const req = new Request("http://localhost/anything.txt");
  const res = await app.handleRequest(req);
  assertEquals(res.status, 404);
});

// ============================================================
// 2. TESTES DO ADAPTADOR CLOUDFLARE (MOCK)
// ============================================================
class MockKVNamespace {
  private store = new Map<string, string>();
  put(key: string, value: string) {
    this.store.set(key, value);
  }
  async get(key: string, type: "text" | "arrayBuffer" = "text"): Promise<string | ArrayBuffer | null> {
    const value = this.store.get(key);
    if (value === undefined) return null;
    if (type === "arrayBuffer") {
      return new TextEncoder().encode(value).buffer;
    }
    return value;
  }
  async delete(key: string) {
    this.store.delete(key);
  }
}

Deno.test("Cloudflare KV adapter: serve arquivo existente", async () => {
  const kv = new MockKVNamespace();
  kv.put("index.html", "<h1>Hello</h1>");
  const handler = createKVStaticFileHandler(kv as unknown as KVNamespace);
  const response = await handler.handle("index.html");
  assert(response !== null, "Deve retornar Response");
  assertEquals(response!.status, 200);
  assertEquals(await response!.text(), "<h1>Hello</h1>");
  assertEquals(response!.headers.get("Content-Type"), "text/html; charset=utf-8");
});

Deno.test("Cloudflare KV adapter: retorna null para arquivo inexistente", async () => {
  const kv = new MockKVNamespace();
  const handler = createKVStaticFileHandler(kv as unknown as KVNamespace);
  const response = await handler.handle("nao-existe.txt");
  assertEquals(response, null);
});

Deno.test("Cloudflare KV adapter: MIME type correto para CSS", async () => {
  const kv = new MockKVNamespace();
  kv.put("style.css", "body { color: red; }");
  const handler = createKVStaticFileHandler(kv as unknown as KVNamespace);
  const response = await handler.handle("style.css");
  assert(response !== null);
  assertEquals(response!.headers.get("Content-Type"), "text/css; charset=utf-8");
});

Deno.test("Cloudflare KV adapter: MIME type fallback para extensão desconhecida", async () => {
  const kv = new MockKVNamespace();
  kv.put("data.xyz", "binary data");
  const handler = createKVStaticFileHandler(kv as unknown as KVNamespace);
  const response = await handler.handle("data.xyz");
  assert(response !== null);
  assertEquals(response!.headers.get("Content-Type"), "application/octet-stream");
});

// ============================================================
// 3. TESTE DE WEBSOCKET SEM UPGRADER (Erro esperado)
// ============================================================
Deno.test("WebSocket sem upgrader retorna 501", async () => {
  const app = new Router({ basePath: "", webSocketUpgrader: undefined });
  app.ws("/chat", () => {});
  const req = new Request("http://localhost/chat", {
    headers: { upgrade: "websocket" },
  });
  const res = await app.handleRequest(req);
  assertEquals(res.status, 501);
  assertEquals(await res.text(), "WebSocket not supported");
});

// ============================================================
// 4. TESTE DE INTEGRAÇÃO COM createDenoRouter + WebSocket
// ============================================================
Deno.test("createDenoRouter com WebSocket funciona", async () => {
  const app = createDenoRouter({ basePath: "/api", staticDir: null });
  let wsHandlerCalled = false;
  app.ws("/chat/:room", (ws, _req, params) => {
    wsHandlerCalled = true;
    ws.close(1000, "test done");
  });
  const server = Deno.serve({ port: 0, onListen: () => {} }, app.handleRequest.bind(app));
  const port = server.addr.port;
  try {
    const ws = new WebSocket(`ws://localhost:${port}/api/chat/room1`);
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("WS connection failed"));
      setTimeout(() => reject(new Error("WS timeout")), 2000);
    });
    assert(wsHandlerCalled, "Handler WebSocket deve ser chamado");
    ws.close();
    await new Promise((r) => setTimeout(r, 100));
  } finally {
    app.closeAllWebSockets();
    await server.shutdown();
  }
});

// ============================================================
// 5. TESTE DE FORCE HTTPS COM createDenoRouter
// ============================================================
Deno.test("createDenoRouter com forceHttps redireciona", async () => {
  const app = createDenoRouter({ basePath: "", staticDir: null, forceHttps: true });
  app.get("/ping", () => ({ body: "pong" }));
  const req = new Request("http://example.com/ping");
  const res = await app.handleRequest(req);
  assertEquals(res.status, 301);
  assertEquals(res.headers.get("Location"), "https://example.com/ping");
});

Deno.test("createDenoRouter com forceHttps ignora localhost", async () => {
  const app = createDenoRouter({ basePath: "", staticDir: null, forceHttps: true });
  app.get("/ping", () => ({ body: "pong" }));
  const req = new Request("http://localhost:8000/ping");
  const res = await app.handleRequest(req);
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "pong");
});
```

---

## Arquivo: `monorepo/router/docs/return.md`

````md
# Possibilidades de Retorno dos Handlers HTTP

Os handlers HTTP retornam um objeto com duas propriedades: `body` e `init`. Vou detalhar todas as possibilidades.

---

## 📦 `body: BodyInit`

O `body` pode ser qualquer um destes tipos:

| Tipo | Descrição | Exemplo |
|------|-----------|---------|
| `string` | Texto simples | `"Hello World"` |
| `ArrayBuffer` | Dados binários | `new ArrayBuffer(8)` |
| `TypedArray` | Arrays tipados | `new Uint8Array([1, 2, 3])` |
| `Blob` | Dados binários com tipo | `new Blob(["data"], { type: "text/plain" })` |
| `FormData` | Dados de formulário | `new FormData()` |
| `URLSearchParams` | Query string | `new URLSearchParams({ a: "1" })` |
| `ReadableStream` | Stream de dados | `file.readable` |
| `null` | Sem body | `null` |

### Exemplos práticos

```typescript
// String
app.get("/text", () => ({
  body: "Hello World"
}));

// JSON (string)
app.get("/json", () => ({
  body: JSON.stringify({ message: "Hello" })
}));

// ArrayBuffer
app.get("/binary", () => ({
  body: new ArrayBuffer(16)
}));

// Uint8Array
app.get("/bytes", () => ({
  body: new Uint8Array([72, 101, 108, 108, 111]) // "Hello"
}));

// Blob
app.get("/blob", () => ({
  body: new Blob(["<h1>HTML</h1>"], { type: "text/html" })
}));

// FormData
app.post("/form", () => {
  const formData = new FormData();
  formData.append("name", "João");
  formData.append("age", "30");
  return { body: formData };
});

// URLSearchParams
app.get("/query", () => ({
  body: new URLSearchParams({ foo: "bar", baz: "qux" })
}));

// ReadableStream (arquivo)
app.get("/file", async () => {
  const file = await Deno.open("./data.txt");
  return { body: file.readable };
});

// null (sem body)
app.head("/check", () => ({
  body: null
}));
```

---

## ⚙️ `init?: ResponseInit`

O `init` é opcional e pode conter:

| Propriedade | Tipo | Padrão | Descrição |
|-------------|------|--------|-----------|
| `status` | `number` | `200` | Código HTTP de status |
| `statusText` | `string` | `""` | Texto do status (raramente usado) |
| `headers` | `HeadersInit` | `{}` | Headers da resposta |

### `headers` pode ser:

1. **Objeto simples**
```typescript
{ "Content-Type": "application/json" }
```

2. **Array de tuplas**
```typescript
[["Content-Type", "application/json"], ["X-Custom", "value"]]
```

3. **Instância de Headers**
```typescript
new Headers({ "Content-Type": "application/json" })
```

---

## 🎯 Combinações Comuns

### 1. **Resposta simples (200 OK)**
```typescript
app.get("/hello", () => ({
  body: "Hello World"
}));
// Status: 200, Headers: {}
```

### 2. **JSON com headers**
```typescript
app.get("/api/data", () => ({
  body: JSON.stringify({ id: 1, name: "João" }),
  init: {
    headers: { "Content-Type": "application/json" }
  }
}));
```

### 3. **Status customizado (201 Created)**
```typescript
app.post("/users", async (req) => {
  const data = await req.json();
  return {
    body: JSON.stringify({ created: true, data }),
    init: {
      status: 201,
      headers: { "Content-Type": "application/json" }
    }
  };
});
```

### 4. **No Content (204)**
```typescript
app.delete("/users/:id", () => ({
  body: "",
  init: { status: 204 }
}));
```

### 5. **Redirect (301/302)**
```typescript
app.get("/old-page", () => ({
  body: "",
  init: {
    status: 302,
    headers: { "Location": "/new-page" }
  }
}));
```

### 6. **Not Found (404)**
```typescript
app.get("/missing", () => ({
  body: "Resource not found",
  init: { status: 404 }
}));
```

### 7. **Server Error (500)**
```typescript
app.get("/error", () => ({
  body: "Internal Server Error",
  init: { status: 500 }
}));
```

### 8. **CORS preflight (204)**
```typescript
app.options("/*", () => ({
  body: "",
  init: {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE",
      "Access-Control-Max-Age": "86400"
    }
  }
}));
```

### 9. **Download de arquivo**
```typescript
app.get("/download", async () => {
  const file = await Deno.open("./document.pdf");
  return {
    body: file.readable,
    init: {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=\"document.pdf\""
      }
    }
  };
});
```

### 10. **Múltiplos headers**
```typescript
app.get("/custom", () => ({
  body: "data",
  init: {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
      "X-Custom-Header": "value",
      "Cache-Control": "no-cache",
      "X-Request-Id": crypto.randomUUID()
    }
  }
}));
```

### 11. **Cookies**
```typescript
app.post("/login", async (req) => {
  const credentials = await req.json();
  const token = "jwt-token-here";
  return {
    body: JSON.stringify({ success: true }),
    init: {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": `token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/`
      }
    }
  };
});
```

### 12. **Caching**
```typescript
app.get("/cached", () => ({
  body: JSON.stringify({ data: "cached" }),
  init: {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "ETag": "\"abc123\""
    }
  }
}));
```

### 13. **Chunked transfer (streaming)**
```typescript
app.get("/stream", () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("chunk1"));
      setTimeout(() => {
        controller.enqueue(new TextEncoder().encode("chunk2"));
        controller.close();
      }, 1000);
    }
  });
  
  return {
    body: stream,
    init: {
      headers: {
        "Content-Type": "text/plain",
        "Transfer-Encoding": "chunked"
      }
    }
  };
});
```

### 14. **XML response**
```typescript
app.get("/xml", () => ({
  body: '<?xml version="1.0"?><root><item>data</item></root>',
  init: {
    headers: { "Content-Type": "application/xml" }
  }
}));
```

### 15. **HTML response**
```typescript
app.get("/page", () => ({
  body: "<!DOCTYPE html><html><body><h1>Hello</h1></body></html>",
  init: {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  }
}));
```

---

## 📊 Tabela de Status Codes Comuns

| Status | Texto | Uso |
|--------|-------|-----|
| `200` | OK | Sucesso padrão |
| `201` | Created | Recurso criado (POST) |
| `204` | No Content | Sucesso sem body (DELETE) |
| `301` | Moved Permanently | Redirect permanente |
| `302` | Found | Redirect temporário |
| `304` | Not Modified | Cache válido |
| `400` | Bad Request | Erro do cliente |
| `401` | Unauthorized | Não autenticado |
| `403` | Forbidden | Não autorizado |
| `404` | Not Found | Recurso não encontrado |
| `405` | Method Not Allowed | Método HTTP não permitido |
| `409` | Conflict | Conflito (ex: duplicata) |
| `422` | Unprocessable Entity | Erro de validação |
| `429` | Too Many Requests | Rate limit excedido |
| `500` | Internal Server Error | Erro do servidor |
| `502` | Bad Gateway | Erro de gateway |
| `503` | Service Unavailable | Serviço indisponível |

---

## 🎨 Exemplo Completo com Todas as Opções

```typescript
import { Router } from "../src/mod.ts";

const app = new Router("/api");

// 1. String simples
app.get("/text", () => ({
  body: "Hello World"
}));

// 2. JSON
app.get("/json", () => ({
  body: JSON.stringify({ message: "Hello" }),
  init: { headers: { "Content-Type": "application/json" } }
}));

// 3. Status customizado
app.post("/create", async (req) => {
  const data = await req.json();
  return {
    body: JSON.stringify({ id: 1, ...data }),
    init: { status: 201, headers: { "Content-Type": "application/json" } }
  };
});

// 4. No Content
app.delete("/remove/:id", (_req, params) => ({
  body: "",
  init: { status: 204 }
}));

// 5. Redirect
app.get("/old", () => ({
  body: "",
  init: { status: 302, headers: { "Location": "/new" } }
}));

// 6. Not Found
app.get("/missing", () => ({
  body: "Not Found",
  init: { status: 404 }
}));

// 7. CORS
app.options("/*", () => ({
  body: "",
  init: {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    }
  }
}));

// 8. Download
app.get("/download", async () => {
  const file = await Deno.open("./file.pdf");
  return {
    body: file.readable,
    init: {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=\"file.pdf\""
      }
    }
  };
});

// 9. Cookies
app.post("/login", async (req) => {
  const { username } = await req.json();
  return {
    body: JSON.stringify({ success: true }),
    init: {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": `user=${username}; HttpOnly; Path=/`
      }
    }
  };
});

// 10. Streaming
app.get("/stream", () => {
  const stream = new ReadableStream({
    start(controller) {
      let count = 0;
      const interval = setInterval(() => {
        controller.enqueue(new TextEncoder().encode(`chunk ${count++}\n`));
        if (count >= 5) {
          clearInterval(interval);
          controller.close();
        }
      }, 500);
    }
  });
  
  return {
    body: stream,
    init: { headers: { "Content-Type": "text/plain" } }
  };
});

Deno.serve({ port: 8000 }, app.handleRequest.bind(app));
```

---

## ✅ Resumo

**`body`** pode ser:
- `string`, `ArrayBuffer`, `TypedArray`, `Blob`, `FormData`, `URLSearchParams`, `ReadableStream`, `null`

**`init`** pode conter:
- `status` (number)
- `statusText` (string)
- `headers` (object, array, ou Headers)

**Combinações mais comuns:**
1. `{ body: "text" }` → 200 OK
2. `{ body: json, init: { headers } }` → JSON response
3. `{ body: "", init: { status: 204 } }` → No Content
4. `{ body: "", init: { status: 302, headers: { Location } } }` → Redirect
5. `{ body: stream, init: { headers } }` → File download / streaming

Todas essas combinações são válidas e suportadas pelo router! 🚀
````

---

## Arquivo: `monorepo/router/docs/simple-permission.md`

````md
# Exemplo Simples: Rota `/sala` sem Parâmetros

Quando a rota não tem parâmetros dinâmicos, o `params` recebido pela `permissionFn` será um objeto vazio `{}`. Nesse caso, a filtragem deve ser feita com base no **conteúdo da mensagem** ou em **estado externo** (como uma lista de banidos).

## 📄 Arquivo: `monorepo/router/example/sala/main.ts`

```typescript
// monorepo/router/example/sala/main.ts
import { Router } from "../../src/mod.ts";

const app = new Router("/api", "./public", null);

// Lista externa de usuários banidos (simulando um banco de dados)
const bannedUsers = new Set(["spammer1", "baduser2"]);

// ============================================================
// Rota WebSocket simples: /sala (sem parâmetros)
// ============================================================
app.ws("/sala", (ws, req, _params) => {
  // Extrai o nome do usuário de um header (já que não temos params na URL)
  const user = req.headers.get("x-user-name") ?? "anonimo";
  
  console.log(`[WS] ${user} entrou na sala`);

  const group = app.getWsGroupByPath("/sala");
  if (!group) return;

  ws.onmessage = (event) => {
    const message = event.data;

    // Exemplo 1: Filtrar por conteúdo da mensagem
    // Exemplo 2: Filtrar por usuário banido (estado externo)
    group.broadcast(
      `[${user}]: ${message}`,
      (clientParams, msg) => {
        // clientParams é {} (vazio, pois a rota não tem params)
        // msg é a mensagem sendo enviada
        
        // Regra 1: Bloquear mensagens com palavra proibida
        if (msg.toLowerCase().includes("spam")) {
          return false;
        }
        
        // Regra 2: Bloquear mensagens de usuários banidos
        // (extraímos o nome do usuário do prefixo "[user]:")
        const senderMatch = msg.match(/^\[([^\]]+)\]:/);
        if (senderMatch && bannedUsers.has(senderMatch[1])) {
          return false;
        }
        
        return true; // Permite todas as outras mensagens
      },
      {}, // senderParams vazio, já que não temos params na rota
    );
  };

  ws.onclose = () => console.log(`[WS] ${user} saiu da sala`);
});

// ============================================================
// Servidor
// ============================================================
const server = Deno.serve({ port: 8000 }, app.handleRequest.bind(app));
console.log("🚀 Servidor rodando em http://localhost:8000");
console.log("🔌 WS: ws://localhost:8000/api/sala (header X-User-Name opcional)");
```

---

## 🔍 Como Funciona a `permissionFn` sem Parâmetros

Como a rota `/sala` não tem `:param`, o objeto `params` é sempre `{}`. Então a filtragem precisa usar outras informações:

| Fonte de Dados | Como Acessar | Exemplo de Uso |
|----------------|--------------|----------------|
| **Conteúdo da mensagem** | Parâmetro `msg` da `permissionFn` | Bloquear palavras proibidas |
| **Estado externo** | Variáveis fora do handler (ex: `bannedUsers`) | Lista de banidos, roles |
| **Headers da requisição** | Capturados no `onopen` e guardados | Roles, níveis de acesso |

---

## 🧪 Testando

### Cliente simples (Node.js ou navegador)

```javascript
// Conectar passando o nome no header (via fetch + WebSocket manual)
// No navegador, headers customizados não são possíveis no WebSocket.
// Alternativa: passar o nome na query string ou primeira mensagem.

const ws = new WebSocket("ws://localhost:8000/api/sala");

ws.onopen = () => {
  // Primeira mensagem identifica o usuário
  ws.send("__IDENTIFY__:joao");
};

ws.onmessage = (e) => console.log("Recebido:", e.data);
```

### Casos de teste

```bash
# ✅ Mensagem normal → todos recebem
ws.send("Olá pessoal!")
# → [joao]: Olá pessoal!

# ❌ Mensagem com "spam" → ninguém recebe
ws.send("Isso é spam!")
# → (silêncio)

# ❌ Mensagem de usuário banido → ninguém recebe
# (se o sender for "spammer1")
# → (silêncio)
```

---

## 💡 Alternativa: Guardar Estado no Handler

Se precisar de filtragem mais complexa, você pode guardar informações no fechamento (closure) do handler:

```typescript
app.ws("/sala", (ws, req, _params) => {
  // Estado local por conexão
  const userRole = req.headers.get("x-role") ?? "visitor";
  const userName = req.headers.get("x-user-name") ?? "anonimo";
  
  const group = app.getWsGroupByPath("/sala");
  if (!group) return;

  ws.onmessage = (event) => {
    group.broadcast(
      `[${userName}]: ${event.data}`,
      (clientParams, msg) => {
        // Aqui você pode usar `userRole` do closure
        // para decidir se a mensagem deve passar
        if (userRole === "admin") return true; // Admin sempre passa
        if (msg.includes("@admin")) return false; // Visitante não vê menções
        return true;
      },
      {},
    );
  };
});
```

---

## ✅ Resumo

Para rotas **sem parâmetros**:
- `params` será sempre `{}`
- Use o parâmetro `message` da `permissionFn` para filtrar por conteúdo
- Use variáveis externas (closures, Maps, Sets) para estado compartilhado
- A lógica de permissão continua sendo `(clientParams, message) => boolean`
````

---

## Arquivo: `monorepo/router/docs/websocket-permissions.md`

````md
# 📡 Documentação: Permissionamento Inteligente em WebSockets (Dual Params)

O `@loco/router` possui um sistema nativo e robusto de permissionamento para WebSockets, permitindo que mensagens de broadcast sejam filtradas dinamicamente com base nos **parâmetros do destinatário (receiver)**, nos **parâmetros do remetente (sender)** e no **conteúdo da mensagem**.

---

## 🔑 Conceitos Fundamentais

### 1. `PermissionFn` (Função de Permissão Dual)
É um callback opcional passado ao método `group.broadcast()`. Sua assinatura recebe três argumentos:

```typescript
type PermissionFn = (
  receiverParams: RouteParams, // Parâmetros de quem VAI RECEBER a mensagem
  senderParams: RouteParams,   // Parâmetros de quem ENVIOU a mensagem
  message: string              // O conteúdo da mensagem
) => boolean;
```

---

## 🌍 Exemplos Práticos do Mundo Real

### Cenário 1: Isolamento de Salas de Chat (O Clássico)
**Objetivo:** Garantir que uma mensagem enviada na sala "geral" não vaze para a sala "vip".

```typescript
app.ws("/chat/:room/:user", (ws, _req, params) => {
  const group = app.getWsGroupByPath("/chat/:room/:user");
  
  ws.onmessage = (event) => {
    group.broadcast(
      `[${params.user}]: ${event.data}`,
      // Filtra: O receiver deve estar na mesma sala que o sender
      (receiver, sender, _msg) => receiver.room === sender.room,
      params // Passamos os params do remetente
    );
  };
});
```

### Cenário 2: Controle de Acesso por Nível de Usuário (RBAC)
**Objetivo:** Apenas usuários com role `admin` podem enviar alertas de sistema críticos.

```typescript
app.ws("/dashboard/:role/:userId", (ws, _req, params) => {
  const group = app.getWsGroupByPath("/dashboard/:role/:userId");
  
  ws.onmessage = (event) => {
    group.broadcast(
      `🚨 ALERTA: ${event.data}`,
      (_receiver, sender, _msg) => {
        // Só permite o broadcast se o SENDER for admin
        return sender.role === "admin";
      },
      params
    );
  };
});
```

### Cenário 3: Filtragem Baseada no Conteúdo da Mensagem
**Objetivo:** Impedir que mensagens contendo a palavra "spam" sejam propagadas.

```typescript
app.ws("/community/:serverId/:userId", (ws, _req, params) => {
  const group = app.getWsGroupByPath("/community/:serverId/:userId");
  
  ws.onmessage = (event) => {
    group.broadcast(
      event.data,
      (_receiver, _sender, msgContent) => {
        // Bloqueia se a mensagem contiver "spam"
        return !msgContent.toLowerCase().includes("spam");
      },
      params
    );
  };
});
```

---

## 💡 A "Mágica" do Last Broadcast com Dual Params

Quando um novo membro entra na sala, o router reavalia o `lastBroadcast` usando os **Dual Params**.

```typescript
// 10:00:00 -> User A (room: "lobby") envia: "Olá a todos!"
// O router salva: { message: "Olá...", permissionFn: (r, s) => r.room === s.room, senderParams: { room: "lobby" } }

// 10:00:05 -> User B conecta na rota /chat/lobby/userB
// O router reavalia: permissionFn({ room: "lobby" }, { room: "lobby" }, "Olá...") -> TRUE
// User B recebe a mensagem histórica automaticamente!

// 10:00:10 -> User C conecta na rota /chat/vip/userC
// O router reavalia: permissionFn({ room: "vip" }, { room: "lobby" }, "Olá...") -> FALSE
// User C NÃO recebe a mensagem (Segurança garantida!).
```

## ⚠️ Melhores Práticas

1. **Mantenha a `PermissionFn` Leve:** Evite operações assíncronas (como consultas ao banco de dados) dentro da `PermissionFn`.
2. **Use `senderParams` Corretamente:** Sempre passe o terceiro argumento `params` no `group.broadcast(msg, fn, params)`. Sem isso, o `senderParams` será um objeto vazio `{}` e o recurso de "Last Broadcast" não funcionará corretamente.
```

#### 📄 4. `monorepo/router/docs/simple-permission.md` (Atualizado para Dual Params)
```markdown
# Exemplo Simples: Rota `/sala` sem Parâmetros

Quando a rota não tem parâmetros dinâmicos (ex: `/sala`), os objetos `receiverParams` e `senderParams` recebidos pela `permissionFn` serão vazios `{}`. Nesse caso, a filtragem deve ser feita com base no **conteúdo da mensagem** ou em **estado externo**.

## 📄 Arquivo: `monorepo/router/example/sala/main.ts`

```typescript
import { Router } from "../../src/mod.ts";

const app = new Router("/api", "./public", null);
const bannedUsers = new Set(["spammer1", "baduser2"]);

app.ws("/sala", (ws, req, _params) => {
  const user = req.headers.get("x-user-name") ?? "anonimo";
  const group = app.getWsGroupByPath("/sala");
  if (!group) return;

  ws.onmessage = (event) => {
    const message = event.data;
    
    group.broadcast(
      `[${user}]: ${message}`,
      // ✅ Assinatura Dual: (receiver, sender, message)
      (_receiver, _sender, msg) => {
        // Regra 1: Bloquear mensagens com palavra proibida
        if (msg.toLowerCase().includes("spam")) return false;
        
        // Regra 2: Bloquear mensagens de usuários banidos
        const senderMatch = msg.match(/^\[([^\]]+)\]:/);
        if (senderMatch && bannedUsers.has(senderMatch[1])) return false;
        
        return true;
      },
      {} // senderParams vazio, já que não temos params na rota
    );
  };
});

const server = Deno.serve({ port: 8000 }, app.handleRequest.bind(app));
```

## ✅ Resumo para Rotas sem Parâmetros
- `receiverParams` e `senderParams` serão `{}`.
- Use o terceiro parâmetro (`message`) da `permissionFn` para filtrar por conteúdo.
- A lógica de permissão continua sendo `(receiver, sender, message) => boolean`.

````

---

## Arquivo: `monorepo/router/docs/runtime-agnostic.md`

````md
# 🌐 Arquitetura Runtime-Agnostic

O `@loco/router` foi projetado para funcionar em **qualquer runtime JavaScript** que suporte as Web APIs padrão (Fetch API, WebSocket, URLPattern). O core do router **não possui nenhuma dependência direta** de runtime específico (Deno, Node.js, Cloudflare Workers, Bun).

---

## 🏗️ Arquitetura em Camadas

```
┌─────────────────────────────────────────────────────────┐
│              SEU CÓDIGO (main.ts / worker.ts)           │
│  - Define rotas, middlewares e handlers                 │
│  - Escolhe o entry point adequado ao runtime            │
└──────────────────────────┬──────────────────────────────┘
                           │ importa
┌──────────────────────────▼──────────────────────────────┐
│           ENTRY POINTS (src/deno.ts, src/cloudflare.ts) │
│  - createDenoRouter()                                   │
│  - createCloudflareRouter()                             │
└──────────────────────────┬──────────────────────────────┘
                           │ injeta adaptadores
┌──────────────────────────▼──────────────────────────────┐
│              CORE AGNÓSTICO (src/mod.ts)                │
│  - Router, WebSocketGroup, tipos                        │
│  - ZERO dependência de runtime                          │
│  - Usa interfaces: WebSocketUpgrader, StaticFileHandler │
└──────────────────────────┬──────────────────────────────┘
                           │ implementado por
┌──────────────────────────▼──────────────────────────────┐
│              ADAPTADORES (src/adapters/)                 │
│  - adapters/deno.ts       → Deno.upgradeWebSocket,      │
│                              Deno.stat, Deno.open       │
│  - adapters/cloudflare.ts → WebSocketPair, KV, R2       │
└─────────────────────────────────────────────────────────┘
```

---

## 🔌 Interfaces de Adaptação

### `WebSocketUpgrader`

Abstrai o mecanismo de upgrade de HTTP para WebSocket:

```typescript
interface WebSocketUpgrader {
  upgrade(req: Request): { socket: WebSocket; response: Response };
}
```

| Runtime | Implementação |
|---------|---------------|
| Deno | `Deno.upgradeWebSocket(req)` |
| Cloudflare Workers | `new WebSocketPair()` |
| Node.js (ws) | `ws.handleUpgrade()` |

### `StaticFileHandler`

Abstrai o sistema de arquivos para servir arquivos estáticos:

```typescript
interface StaticFileHandler {
  handle(path: string): Promise<Response | null>;
}
```

| Runtime | Implementação |
|---------|---------------|
| Deno | `Deno.stat()` + `Deno.open()` |
| Cloudflare Workers | KV Namespace ou R2 Bucket |
| Node.js | `fs.stat()` + `fs.createReadStream()` |

---

## 🦕 Usando com Deno

```typescript
import { createDenoRouter } from "@loco/router/deno";

const app = createDenoRouter({
  basePath: "/api",
  staticDir: "./public",
  forceHttps: true,
});

app.get("/hello", () => ({ body: "Hello!" }));

Deno.serve({ port: 8000 }, app.handleRequest.bind(app));
```

## ☁️ Usando com Cloudflare Workers

```typescript
import { createCloudflareRouter } from "@loco/router/cloudflare";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const app = createCloudflareRouter({
      basePath: "/api",
      kvNamespace: env.MY_KV,
      forceHttps: true,
    });

    app.get("/hello", () => ({ body: "Hello from Cloudflare!" }));

    app.ws("/chat/:room", (ws, _req, params) => {
      ws.onmessage = (e) => ws.send(`Echo: ${e.data}`);
    });

    return app.handleRequest(req);
  },
};
```

## 🟢 Usando com Node.js (exemplo conceitual)

```typescript
import { Router } from "@loco/router";
import { createNodeWebSocketUpgrader } from "./adapters/node.ts"; // futuro

const app = new Router({
  basePath: "/api",
  webSocketUpgrader: createNodeWebSocketUpgrader(),
});
```

---

## 🔒 Segurança

- **Path Traversal Protection**: O core sanitiza paths com `normalize()` + regex anti-`..`
- **Force HTTPS**: Redireciona HTTP→HTTPS em produção (ignora localhost)
- **HSTS**: Header `Strict-Transport-Security` adicionado automaticamente

---

## 📋 Tabela de Compatibilidade

| Feature | Deno | Cloudflare Workers | Node.js (futuro) |
|---------|------|--------------------|------------------|
| HTTP Routing | ✅ | ✅ | ✅ |
| WebSocket | ✅ | ✅ | ✅ |
| Static Files (disco) | ✅ | ❌ | ✅ |
| Static Files (KV/R2) | ❌ | ✅ | ❌ |
| Force HTTPS | ✅ | ✅ | ✅ |
| Middlewares | ✅ | ✅ | ✅ |
| Dual Params Broadcast | ✅ | ✅ | ✅ |
| Last Broadcast | ✅ | ✅ | ✅ |
| Path Traversal Protection | ✅ | ✅ | ✅ |

````

---

## Arquivo: `monorepo/router/deno.jsonc`

```json
// 📄 Arquivo: `monorepo/router/deno.jsonc` (ATUALIZADO)
{
  "name": "@loco/router",
  "version": "0.2.0",
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "dom.asynciterable", "esnext", "deno.ns"],
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true
  },
  "imports": {
    "@std/assert": "jsr:@std/assert@^1",
    "@std/media-types": "jsr:@std/media-types@^1",
    "@std/path": "jsr:@std/path@^1",
    "jose": "https://deno.land/x/jose@v5.2.0/index.ts"
  },
  "tasks": {
    "test": "deno test --allow-env --allow-net --allow-read --allow-write tests/",
    "check": "deno check src/**/*.ts tests/**/*.ts example/**/*.ts",
    "tests": "deno task check && deno task test",
    "start": "deno run --allow-read --allow-net --allow-env example/principal/main.ts",
    "dev": "deno run --allow-read --allow-net --allow-env --watch example/principal/main.ts",
    "example": "deno run --allow-read --allow-net --allow-env --watch example/jwt/main.ts",
    "fmt": "deno fmt",
    "lint": "deno lint"
  },
  "exports": {
    ".": "./src/mod.ts",
    "./deno": "./src/deno.ts",
    "./cloudflare": "./src/cloudflare.ts",
    "./adapters/deno": "./src/adapters/deno.ts",
    "./adapters/cloudflare": "./src/adapters/cloudflare.ts"
  }
}
```

---

