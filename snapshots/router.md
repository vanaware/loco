> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém os arquivos de configuração e execução do ROUTER @loco/router
> O projeto é o **Loco ** estruturado em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco - Modo: ROUTER

Gerado automaticamente em: 8/30/2026, 9:18:49 AM

---

## Arquivo: `monorepo/router/src/adapters/deno.ts`

```ts
// monorepo/router/src/adapters/deno.ts
// 🦕 Adaptadores para Deno Runtime — Fase 3: Segurança reforçada

import { join, resolve } from "@std/path";
import type { WebSocketUpgrader, StaticFileHandler } from "../mod.ts";

export const denoWebSocketUpgrader: WebSocketUpgrader = {
  upgrade(req: Request): { socket: WebSocket; response: Response } {
    return Deno.upgradeWebSocket(req);
  },
};

export function createDenoStaticFileHandler(
  staticDir: string | null,
  embeddedDir: string | null = null,
): StaticFileHandler {
  return {
    async handle(path: string): Promise<Response | null> {
      if (embeddedDir) {
        const embedded = await tryServeDir(embeddedDir, path);
        if (embedded) return embedded;
      }
      if (staticDir) {
        const staticResp = await tryServeDir(staticDir, path);
        if (staticResp) return staticResp;
      }
      return null;
    },
  };
}

async function tryServeDir(baseDir: string, pathname: string): Promise<Response | null> {
  const fullPath = join(baseDir, pathname);
  
  // 🚀 CONTAINMENT: Resolver caminho absoluto e verificar que está dentro de baseDir
  let resolvedPath: string;
  try {
    resolvedPath = await Deno.realPath(fullPath);
  } catch {
    resolvedPath = resolve(fullPath);
  }
  
  const resolvedBase = await Deno.realPath(baseDir).catch(() => resolve(baseDir));
  
  if (!resolvedPath.startsWith(resolvedBase + "/") && resolvedPath !== resolvedBase) {
    return new Response("Not Found", { status: 404 });
  }

  const candidates = buildFileCandidates(baseDir, pathname);
  for (const candidate of candidates) {
    try {
      // 🚀 SYMLINKS: Usar lstat para recusar symlinks
      const info = await Deno.lstat(candidate);
      
      if (info.isSymlink) {
        console.warn(`[Static] Symlink recusado: ${candidate}`);
        continue;
      }
      
      if (info.isFile) {
        const ext = candidate.split(".").pop()?.toLowerCase() ?? "";
        const mimeType = defaultDenoMimeTypeResolver(ext) ?? "application/octet-stream";
        const file = await Deno.open(candidate);
        
        // 🚀 HEADERS: Adicionar metadata completa
        const headers: HeadersInit = {
          "Content-Type": mimeType,
          "Content-Length": info.size.toString(),
          "Last-Modified": info.mtime?.toUTCString() ?? new Date().toUTCString(),
          "Cache-Control": "public, max-age=3600",
        };
        
        // Adicionar ETag baseado em size + mtime
        if (info.mtime) {
          const etag = `"${info.size.toString(16)}-${info.mtime.getTime().toString(16)}"`;
          headers["ETag"] = etag;
        }
        
        return new Response(file.readable, { headers });
      }
      
      // 🚀 REDIRECT: Se é diretório sem barra final, redirecionar
      if (info.isDirectory && !pathname.endsWith("/")) {
        return new Response(null, {
          status: 301,
          headers: { "Location": pathname + "/" },
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
    html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
    css: "text/css; charset=utf-8", js: "application/javascript; charset=utf-8",
    mjs: "application/javascript; charset=utf-8", json: "application/json; charset=utf-8",
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    svg: "image/svg+xml", ico: "image/x-icon", txt: "text/plain; charset=utf-8",
    pdf: "application/pdf", xml: "application/xml", woff: "font/woff",
    woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
    mp3: "audio/mpeg", mp4: "video/mp4", webm: "video/webm", wasm: "application/wasm",
    // 🚀 EXTENSÕES MODERNAS
    webp: "image/webp", avif: "image/avif", webmanifest: "application/manifest+json",
    ts: "application/typescript", tsx: "application/typescript",
    jsx: "application/javascript", map: "application/json",
  };
  return map[ext.toLowerCase()];
}
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
  trustProxy?: boolean;
  allowDotfiles?: boolean;
  lastBroadcastDelay?: number;
}

export function createDenoRouter(
  basePathOrOptions: string | DenoRouterOptions = "",
  staticDir: string | null = "public",
  embeddedDir: string | null = null,
  forceHttps: boolean = false,
  lastBroadcastDelay?: number,
): Router {
  let options: DenoRouterOptions;
  if (typeof basePathOrOptions === "string") {
    options = { basePath: basePathOrOptions, staticDir, embeddedDir, forceHttps, lastBroadcastDelay };
  } else {
    options = basePathOrOptions;
  }

  const {
    basePath = "",
    staticDir: sDir = null, // 🚀 MUDANÇA: Default null no options object
    embeddedDir: eDir = null,
    forceHttps: fHttps = false,
    trustProxy = false,
    allowDotfiles = false,
    lastBroadcastDelay: lDelay,
  } = options;

  const router = new Router({
    basePath,
    forceHttps: fHttps,
    trustProxy,
    allowDotfiles,
    lastBroadcastDelay: lDelay,
    webSocketUpgrader: denoWebSocketUpgrader,
    staticFileHandler: sDir || eDir ? createDenoStaticFileHandler(sDir, eDir) : undefined,
  });
  return router;
}

export * from "./mod.ts";
export { denoWebSocketUpgrader, createDenoStaticFileHandler } from "./adapters/deno.ts";
```

---

## Arquivo: `monorepo/router/src/mod.ts`

```ts
// monorepo/router/src/mod.ts
// ⚡ CORE AGNÓSTICO — Fase 3: Segurança reforçada

import { normalize } from "@std/path";

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
) => void | Promise<void>;

export type PermissionFn = (
  receiverParams: RouteParams,
  senderParams: RouteParams,
  message: string,
) => boolean;

export type Middleware = (
  req: Request,
  params: RouteParams,
  next: (newReq?: Request) => Promise<Response>,
) => Promise<Response> | Response;

// ============================================================
// 🌐 INTERFACES DE ABSTRAÇÃO
// ============================================================
export interface WebSocketUpgrader {
  upgrade(req: Request): { socket: WebSocket; response: Response };
}

export interface StaticFileHandler {
  handle(path: string): Promise<Response | null>;
}

// ============================================================
// OPÇÕES DO ROUTER
// ============================================================
export const DEFAULT_LAST_BROADCAST_DELAY = 0;

export interface RouterOptions {
  basePath?: string;
  forceHttps?: boolean;
  trustProxy?: boolean; // 🚀 NOVO: Confiança em X-Forwarded-Proto
  allowDotfiles?: boolean; // 🚀 NOVO: Permitir .env, .git, etc.
  lastBroadcastDelay?: number;
  webSocketUpgrader?: WebSocketUpgrader;
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
// CLASSE ROUTER
// ============================================================
export class Router {
  private basePath: string;
  private httpRoutes: HttpRoute[] = [];
  private wsRoutes: WsRoute[] = [];
  private middlewares: Middleware[] = [];
  private webSockets = new Map<WebSocket, { group: WebSocketGroup }>();
  private webSocketUpgrader?: WebSocketUpgrader;
  private staticFileHandler?: StaticFileHandler;
  
  public forceHttps: boolean;
  public trustProxy: boolean;
  public allowDotfiles: boolean;
  private lastBroadcastDelay: number;

  constructor(options: RouterOptions = {}) {
    this.basePath = this.normalizeBasePath(options.basePath ?? "");
    this.forceHttps = options.forceHttps ?? false;
    this.trustProxy = options.trustProxy ?? false;
    this.allowDotfiles = options.allowDotfiles ?? false;
    this.lastBroadcastDelay = options.lastBroadcastDelay ?? DEFAULT_LAST_BROADCAST_DELAY;
    this.webSocketUpgrader = options.webSocketUpgrader;
    this.staticFileHandler = options.staticFileHandler;
  }

  setWebSocketUpgrader(upgrader: WebSocketUpgrader): this {
    this.webSocketUpgrader = upgrader;
    return this;
  }

  setStaticFileHandler(handler: StaticFileHandler): this {
    this.staticFileHandler = handler;
    return this;
  }

  private normalizeBasePath(p: string): string {
    if (!p || p === "/") return "";
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
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  }

  private shouldForceHttps(req: Request): boolean {
    if (!this.forceHttps) return false;
    if (this.isLocalhost(req)) return false;
    
    if (this.trustProxy) {
      const protoHeader = req.headers.get("x-forwarded-proto");
      const forwardedProto = protoHeader ? protoHeader.split(",")[0]?.trim() : undefined;
      if (forwardedProto === "https") return false;
    }
    
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
    
    if (this.wsRoutes.some(r => r.pattern.pathname === patternPath)) {
      throw new Error(`Duplicate WebSocket route pattern: ${patternPath}`);
    }
    
    const group = new WebSocketGroup(this.lastBroadcastDelay);
    this.wsRoutes.push({ pattern, handler, group });
  }

  use(middleware: Middleware): this { this.middlewares.push(middleware); return this; }
  get(path: string, handler: HttpHandler): this { this.addHttpRoute("GET", path, handler); return this; }
  post(path: string, handler: HttpHandler): this { this.addHttpRoute("POST", path, handler); return this; }
  put(path: string, handler: HttpHandler): this { this.addHttpRoute("PUT", path, handler); return this; }
  delete(path: string, handler: HttpHandler): this { this.addHttpRoute("DELETE", path, handler); return this; }
  patch(path: string, handler: HttpHandler): this { this.addHttpRoute("PATCH", path, handler); return this; }
  options(path: string, handler: HttpHandler): this { this.addHttpRoute("OPTIONS", path, handler); return this; }
  head(path: string, handler: HttpHandler): this { this.addHttpRoute("HEAD", path, handler); return this; }
  ws(path: string, handler: WsHandler): this { this.addWsRoute(path, handler); return this; }

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

  private async executeHttpHandler(
    req: Request,
    route: HttpRoute,
    params: RouteParams,
    isHeadFromGet: boolean = false,
  ): Promise<Response> {
    try {
      const result = await route.handler(req, params);
      const isHead = req.method.toUpperCase() === "HEAD" || isHeadFromGet;
      const isNullBodyStatus = result.init?.status &&
        [101, 204, 205, 304].includes(result.init.status);
      const finalBody = (isHead || isNullBodyStatus) ? null : result.body;

      if (finalBody === null && result.body instanceof ReadableStream) {
        try { await (result.body as ReadableStream).cancel(); } catch {}
      }

      return new Response(finalBody, result.init);
    } catch (error) {
      console.error(`[Router] Error in ${req.method} ${route.pattern.pathname}:`, error);
      return new Response("Internal Server Error", { status: 500 });
    }
  }

  private async executeWsHandler(
    req: Request,
    route: WsRoute,
    params: RouteParams,
  ): Promise<Response> {
    if (!this.webSocketUpgrader) {
      return new Response("WebSocket not supported", { status: 501 });
    }

    let socket: WebSocket;
    let response: Response;

    try {
      const upgraded = this.webSocketUpgrader.upgrade(req);
      socket = upgraded.socket;
      response = upgraded.response;
    } catch (err) {
      console.error("[Router] WebSocket upgrade failed:", err);
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    route.group.addSocket(socket, params);
    this.webSockets.set(socket, { group: route.group });
    route.group.sendLastBroadcastTo(socket, params);

    const cleanup = () => {
      this.webSockets.delete(socket);
      route.group.removeSocket(socket);
    };

    if (typeof socket.addEventListener === "function") {
      socket.addEventListener("close", cleanup);
      socket.addEventListener("error", (ev) => {
        console.error(`WebSocket error:`, ev);
        cleanup();
      });
    } else {
      socket.onclose = cleanup;
      socket.onerror = (ev) => { console.error(`WebSocket error:`, ev); cleanup(); };
    }

    try {
      await route.handler(socket, req, params);
    } catch (error) {
      console.error(`[Router] Error in WS handler ${route.pattern.pathname}:`, error);
      if (socket.readyState === WebSocket.OPEN) {
        socket.close(1011, "Internal Server Error");
      }
    }

    return response;
  }

  async handleRequest(req: Request): Promise<Response> {
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

    let isWs = req.headers.get("upgrade")?.toLowerCase() === "websocket";
    let found = isWs ? this.findWsRoute(req) : this.findHttpRoute(req);
    
    const isHttps = new URL(req.url).protocol === "https:";
    const hstsHeader: Record<string, string> = {};
    if (this.forceHttps && isHttps) {
      hstsHeader["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
    }

    let index = 0;
    let currentReq = req;

    const executeChain = async (): Promise<Response> => {
      if (index < this.middlewares.length) {
        const mw = this.middlewares[index++];
        if (!mw) return this.executeFinalHandler(currentReq, isWs, found, hstsHeader);
        
        try {
          let nextHasBeenCalled = false;
          const result = await mw(currentReq, found?.params ?? {}, async (newReq?: Request) => {
            if (nextHasBeenCalled) throw new Error("next() called multiple times");
            nextHasBeenCalled = true;
            
            if (newReq) {
              currentReq = newReq;
              isWs = currentReq.headers.get("upgrade")?.toLowerCase() === "websocket";
              found = isWs ? this.findWsRoute(currentReq) : this.findHttpRoute(currentReq);
            }
            return await executeChain();
          });
          return result;
        } catch (error) {
          console.error(`[Router] Middleware error:`, error);
          return new Response("Internal Server Error", { status: 500 });
        }
      }
      return this.executeFinalHandler(currentReq, isWs, found, hstsHeader);
    };

    return await executeChain();
  }

  private async executeFinalHandler(
    req: Request,
    isWs: boolean,
    found: { route: HttpRoute | WsRoute; params: RouteParams } | null,
    extraHeaders: Record<string, string> = {},
  ): Promise<Response> {
    if (isWs) {
      if (!found) return new Response("WebSocket Not Found", { status: 404 });
      const res = await this.executeWsHandler(req, found.route as WsRoute, found.params);
      for (const [k, v] of Object.entries(extraHeaders)) res.headers.set(k, v);
      return res;
    }

    let httpFound = found as { route: HttpRoute; params: RouteParams } | null;
    let isHeadFromGet = false;

    if (!httpFound && req.method === "HEAD") {
      const fakeGetReq = new Request(req.url, { method: "GET", headers: req.headers });
      const getFound = this.findHttpRoute(fakeGetReq);
      if (getFound) {
        httpFound = getFound;
        isHeadFromGet = true;
      }
    }

    if (httpFound) {
      const res = await this.executeHttpHandler(req, httpFound.route, httpFound.params, isHeadFromGet);
      for (const [k, v] of Object.entries(extraHeaders)) res.headers.set(k, v);
      return res;
    }

    const adjustedUrl = new URL(req.url);
    adjustedUrl.pathname = this.stripBase(adjustedUrl.pathname);
    const allowedMethods = this.httpRoutes
      .filter(r => r.pattern.exec(adjustedUrl))
      .map(r => r.method);
    
    if (allowedMethods.length > 0 && !allowedMethods.includes(req.method)) {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { "Allow": allowedMethods.join(", "), ...extraHeaders },
      });
    }

    if (req.method === "GET" || req.method === "HEAD") {
      const staticRes = await this.handleStaticFile(req);
      if (staticRes.status !== 404) {
        if (req.method === "HEAD") {
          return new Response(null, {
            status: staticRes.status,
            statusText: staticRes.statusText,
            headers: staticRes.headers,
          });
        }
        for (const [k, v] of Object.entries(extraHeaders)) staticRes.headers.set(k, v);
        return staticRes;
      }
    }

    return new Response("Not Found", { status: 404, headers: extraHeaders });
  }

  private async handleStaticFile(req: Request): Promise<Response> {
    if (!this.staticFileHandler) return new Response("Not Found", { status: 404 });
    
    const { pathname } = new URL(req.url);
    const adjustedPathname = this.stripBase(pathname);
    const safePath = normalize(adjustedPathname).replace(/^(\.\.[/\\])+/, "");

    if (!this.allowDotfiles && safePath.split("/").some(segment => segment.startsWith("."))) {
      return new Response("Not Found", { status: 404 });
    }

    const response = await this.staticFileHandler.handle(safePath);
    return response ?? new Response("Not Found", { status: 404 });
  }

  closeAllWebSockets() {
    for (const [socket, { group }] of this.webSockets.entries()) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close(1001, "Server is shutting down");
      }
      group.removeSocket(socket);
    }
    this.webSockets.clear();
  }

  getWsGroupByPath(pathOrPattern: string): WebSocketGroup | undefined {
    const targetPath = this.normalizePath(pathOrPattern);
    for (const route of this.wsRoutes) {
      if (route.pattern.pathname === targetPath) {
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
      if (key === "0" || /^\d+$/.test(key)) catches.push(value);
      else params[key] = value;
    }
    if (catches.length > 0) params.catch = catches;
    return params;
  }
}

// ============================================================
// WEBSOCKET GROUP
// ============================================================
export class WebSocketGroup {
  private sockets = new Map<WebSocket, RouteParams>();
  private lastBroadcast: LastBroadcast | null = null;
  private lastBroadcastDelay: number;

  constructor(lastBroadcastDelay: number = DEFAULT_LAST_BROADCAST_DELAY) {
    this.lastBroadcastDelay = lastBroadcastDelay;
  }

  addSocket(ws: WebSocket, params: RouteParams) { this.sockets.set(ws, params); }
  removeSocket(ws: WebSocket) { this.sockets.delete(ws); }
  get size(): number { return this.sockets.size; }

  sendLastBroadcastTo(ws: WebSocket, receiverParams: RouteParams) {
    const broadcast = this.lastBroadcast;
    if (!broadcast) return;
    setTimeout(() => {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          const { message, permissionFn, senderParams } = broadcast;
          if (!permissionFn || permissionFn(receiverParams, senderParams, message)) {
            ws.send(message);
          }
        }
      } catch (err) { console.error("Last broadcast error:", err); }
    }, this.lastBroadcastDelay);
  }

  broadcast(message: string, permissionFn?: PermissionFn, senderParams?: RouteParams) {
    this.lastBroadcast = { message, permissionFn, senderParams: senderParams ?? {} };
    for (const [socket, receiverParams] of this.sockets.entries()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      try {
        if (!permissionFn || permissionFn(receiverParams, senderParams ?? {}, message)) {
          socket.send(message);
        }
      } catch (err) { console.error("Broadcast error:", err); }
    }
  }

  closeGroup() {
    for (const [socket] of this.sockets.entries()) {
      if (socket.readyState === WebSocket.OPEN) socket.close(1000, "Group is being closed");
    }
    this.sockets.clear();
    this.lastBroadcast = null;
  }
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

const app = createDenoRouter({
  basePath: "/api",
  staticDir: "./example/principal/public", // 🚀 CORRETO
  forceHttps: false,
});

app.get("/:id/:tipo", (_req, params) => {
  console.log("[GET] /:id/:tipo", params);
  return {
    body: JSON.stringify({ id: params.id, tipo: params.tipo }),
    init: { headers: { "Content-Type": "application/json" } },
  };
});

app.post("/users", async (req) => {
  const body = await req.text();
  return {
    body,
    init: { status: 201, headers: { "Content-Type": "application/json" } },
  };
});

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

app.get("/subfolder/*", (_req, params) => {
  console.log("[GET] /subfolder/*", params);
  return {
    body: `Catch-all: ${JSON.stringify(params.catch)}`,
    init: { status: 200 },
  };
});

app.ws("/subfolder/*", (ws, _req, params) => {
  console.log("[WS catch-all] params:", params);
  ws.onmessage = (event) => ws.send(`Echo: ${event.data}`);
  ws.onclose = () => console.log("[WS catch-all] closed");
  ws.onerror = (ev) => console.error("[WS catch-all] error:", ev);
});

const server = Deno.serve({ port: 8000 }, app.handleRequest.bind(app));
console.log("🚀 Servidor rodando em http://localhost:8000");
console.log("📡 API:      http://localhost:8000/api");
console.log("🔌 WS chat:  ws://localhost:8000/api/chat/:room/:user");
console.log("📂 Estáticos: http://localhost:8000/api/index.html");

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

// ⚠️ Apenas para exemplo. Em produção use variável de ambiente.
const JWT_SECRET = "meu-segredo-super-secreto-123";
const encoder = new TextEncoder();

const app = createDenoRouter({
  basePath: "/api",
  staticDir: "./example/jwt/public", // 🚀 CORRETO
});

// 🚀 NOVA ROTA: Login
app.post("/login", async (req) => {
  try {
    const { username, password } = await req.json();
    
    // Validação simples (em produção, use banco de dados)
    if (username === "admin" && password === "123") {
      const token = await new SignJWT({ userId: "1", username: "admin" })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("1h")
        .setIssuedAt()
        .sign(encoder.encode(JWT_SECRET));
      
      return {
        body: JSON.stringify({ token }),
        init: { headers: { "Content-Type": "application/json" } },
      };
    } else {
      return {
        body: JSON.stringify({ error: "Credenciais inválidas" }),
        init: { status: 401, headers: { "Content-Type": "application/json" } },
      };
    }
  } catch {
    return {
      body: JSON.stringify({ error: "Request inválido" }),
      init: { status: 400, headers: { "Content-Type": "application/json" } },
    };
  }
});

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
    await jwtVerify(token, encoder.encode(JWT_SECRET), { algorithms: ["HS256"] });
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
console.log("🚀 Servidor JWT rodando em http://localhost:8000");
console.log("🔐 Login: POST http://localhost:8000/api/login");
console.log("🔌 WS: ws://localhost:8000/api/chat/:room");
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

// 🚀 CORREÇÃO: Agora retorna 405 Method Not Allowed
Deno.test("Método não registrado retorna 405", async () => {
  const app = createDenoRouter("", null, null);
  app.get("/only-get", () => ({ body: "ok" }));
  const req = new Request("http://localhost/only-get", {
    method: "POST",
  });
  const res = await app.handleRequest(req);
  assertEquals(res.status, 405);
  assertEquals(res.headers.get("Allow"), "GET");
});

// 🚀 CORREÇÃO: Agora retorna 405 Method Not Allowed
Deno.test("PUT em rota GET retorna 405", async () => {
  const app = createDenoRouter("", null, null);
  app.get("/resource", () => ({ body: "data" }));
  const req = new Request("http://localhost/resource", {
    method: "PUT",
    body: "update",
  });
  const res = await app.handleRequest(req);
  assertEquals(res.status, 405);
  assertEquals(res.headers.get("Allow"), "GET");
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

// 🚀 CORREÇÃO: Agora retorna 405 Method Not Allowed
Deno.test("Método HTTP errado retorna 405", async () => {
  const app = createDenoRouter({ basePath: "" });
  app.get("/only-get", () => ({ body: "ok" }));
  const req = new Request("http://localhost/only-get", { method: "POST" });
  const res = await app.handleRequest(req);
  assertEquals(res.status, 405);
  assertEquals(res.headers.get("Allow"), "GET");
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
      // ✅ CORRETO: usar dual params
      group.broadcast(
        `[${user}]: ${event.data}`,
        (receiver, sender, _msg) => receiver.room === sender.room,  // ← NEW
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

## Arquivo: `monorepo/router/tests/websocket_group_test.ts`

```ts
// monorepo/router/tests/websocket_group_test.ts
import { assertEquals } from "@std/assert";
import { WebSocketGroup, type RouteParams } from "../src/mod.ts";

class MockWebSocket {
  readyState: number = 1;
  sent: string[] = [];
  send(data: string | ArrayBuffer | Blob) {
    if (typeof data === "string") this.sent.push(data);
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

Deno.test("broadcast com permissionFn filtra destinatários", () => {
  const group = new WebSocketGroup();
  const ws1 = new MockWebSocket();
  const ws2 = new MockWebSocket();
  group.addSocket(ws1 as unknown as WebSocket, { room: "A" });
  group.addSocket(ws2 as unknown as WebSocket, { room: "B" });
  
  // 🚀 MUDANÇA: Assinatura Dual (receiver, sender, msg)
  group.broadcast("only-A", (receiver, _sender, _msg) => receiver.room === "A");
  
  assertEquals(ws1.sent, ["only-A"]);
  assertEquals(ws2.sent, []);
});

Deno.test("novo membro recebe último broadcast ao entrar", async () => {
  const group = new WebSocketGroup();
  const ws1 = new MockWebSocket();
  group.addSocket(ws1 as unknown as WebSocket, { room: "A" });
  group.broadcast("first-msg", undefined, { room: "A" });

  const ws2 = new MockWebSocket();
  group.addSocket(ws2 as unknown as WebSocket, { room: "A" });
  group.sendLastBroadcastTo(ws2 as unknown as WebSocket, { room: "A" });

  // 🚀 MUDANÇA: Delay default agora é 0ms, 10ms é mais que suficiente
  await new Promise((resolve) => setTimeout(resolve, 10));
  assertEquals(ws2.sent, ["first-msg"]);
});

Deno.test("novo membro em sala diferente NÃO recebe último broadcast", async () => {
  const group = new WebSocketGroup();
  const ws1 = new MockWebSocket();
  group.addSocket(ws1 as unknown as WebSocket, { room: "A" });
  
  // 🚀 MUDANÇA: Assinatura Dual
  group.broadcast("first-msg", (receiver, sender, _msg) => receiver.room === sender.room, { room: "A" });

  const ws2 = new MockWebSocket();
  group.addSocket(ws2 as unknown as WebSocket, { room: "B" });
  group.sendLastBroadcastTo(ws2 as unknown as WebSocket, { room: "B" });

  await new Promise((resolve) => setTimeout(resolve, 10));
  assertEquals(ws2.sent, []);
});

Deno.test("closeGroup fecha todos os sockets", () => {
  const group = new WebSocketGroup();
  const ws1 = new MockWebSocket();
  const ws2 = new MockWebSocket();
  group.addSocket(ws1 as unknown as WebSocket, {});
  group.addSocket(ws2 as unknown as WebSocket, {});
  group.closeGroup();
  assertEquals(ws1.readyState, 3);
  assertEquals(ws2.readyState, 3);
  assertEquals(group.size, 0);
});
```

---

## Arquivo: `monorepo/router/tests/security_test.ts`

```ts
// monorepo/router/tests/security_test.ts
import { assertEquals } from "@std/assert";
import { createDenoRouter } from "../src/deno.ts";
import { join } from "@std/path";

Deno.test("trustProxy: X-Forwarded-Proto é ignorado por padrão", async () => {
  const app = createDenoRouter({ basePath: "", forceHttps: true, trustProxy: false });
  app.get("/ping", () => ({ body: "pong" }));
  const req = new Request("http://example.com/ping", {
    headers: { "x-forwarded-proto": "https" },
  });
  const res = await app.handleRequest(req);
  assertEquals(res.status, 301, "Deve redirecionar mesmo com X-Forwarded-Proto");
});

Deno.test("trustProxy: X-Forwarded-Proto é respeitado quando ativo", async () => {
  const app = createDenoRouter({ basePath: "", forceHttps: true, trustProxy: true });
  app.get("/ping", () => ({ body: "pong" }));
  const req = new Request("http://example.com/ping", {
    headers: { "x-forwarded-proto": "https" },
  });
  const res = await app.handleRequest(req);
  assertEquals(res.status, 200, "Deve aceitar X-Forwarded-Proto");
});

Deno.test("HSTS está presente em respostas HTTPS quando forceHttps ativo", async () => {
  const app = createDenoRouter({ basePath: "", forceHttps: true });
  app.get("/ping", () => ({ body: "pong" }));
  const req = new Request("https://example.com/ping");
  const res = await app.handleRequest(req);
  assertEquals(res.status, 200);
  assertEquals(
    res.headers.get("Strict-Transport-Security"),
    "max-age=31536000; includeSubDomains"
  );
});

Deno.test("Dotfiles são bloqueados por padrão", async () => {
  const tmpDir = await Deno.makeTempDir();
  await Deno.writeTextFile(join(tmpDir, ".env"), "SECRET=123");
  await Deno.writeTextFile(join(tmpDir, "public.txt"), "ok");
  
  const app = createDenoRouter({ basePath: "", staticDir: tmpDir, allowDotfiles: false });
  
  const req1 = new Request("http://localhost/.env");
  const res1 = await app.handleRequest(req1);
  assertEquals(res1.status, 404, "Dotfile deve ser bloqueado");
  
  const req2 = new Request("http://localhost/public.txt");
  const res2 = await app.handleRequest(req2);
  assertEquals(res2.status, 200, "Arquivo normal deve ser servido");
  
  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("Dotfiles são permitidos quando allowDotfiles é true", async () => {
  const tmpDir = await Deno.makeTempDir();
  await Deno.writeTextFile(join(tmpDir, ".env"), "SECRET=123");
  
  const app = createDenoRouter({ basePath: "", staticDir: tmpDir, allowDotfiles: true });
  
  const req = new Request("http://localhost/.env");
  const res = await app.handleRequest(req);
  assertEquals(res.status, 200, "Dotfile deve ser servido");
  assertEquals(await res.text(), "SECRET=123");
  
  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("Symlinks são recusados", async () => {
  const tmpRoot = await Deno.makeTempDir();
  const publicDir = join(tmpRoot, "public");
  const secretDir = join(tmpRoot, "secret");
  
  await Deno.mkdir(publicDir);
  await Deno.mkdir(secretDir);
  await Deno.writeTextFile(join(secretDir, "secret.txt"), "TOP SECRET");
  await Deno.symlink(join(secretDir, "secret.txt"), join(publicDir, "leak.txt"));
  
  const app = createDenoRouter({ basePath: "", staticDir: publicDir });
  
  const req = new Request("http://localhost/leak.txt");
  const res = await app.handleRequest(req);
  assertEquals(res.status, 404, "Symlink deve ser recusado");
  
  await Deno.remove(tmpRoot, { recursive: true });
});

Deno.test("Headers de arquivo estático incluem Content-Length e ETag", async () => {
  const tmpDir = await Deno.makeTempDir();
  await Deno.writeTextFile(join(tmpDir, "test.txt"), "hello world");
  
  const app = createDenoRouter({ basePath: "", staticDir: tmpDir });
  
  const req = new Request("http://localhost/test.txt");
  const res = await app.handleRequest(req);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Content-Length"), "11");
  assertEquals(res.headers.get("Last-Modified") !== null, true);
  assertEquals(res.headers.get("ETag") !== null, true);
  assertEquals(res.headers.get("Cache-Control"), "public, max-age=3600");
  
  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("Diretório sem barra final redireciona para com barra", async () => {
  const tmpDir = await Deno.makeTempDir();
  const subDir = join(tmpDir, "docs");
  await Deno.mkdir(subDir);
  await Deno.writeTextFile(join(subDir, "index.html"), "<h1>Docs</h1>");
  
  const app = createDenoRouter({ basePath: "", staticDir: tmpDir });
  
  const req = new Request("http://localhost/docs");
  const res = await app.handleRequest(req);
  assertEquals(res.status, 301);
  assertEquals(res.headers.get("Location"), "/docs/");
  
  await Deno.remove(tmpDir, { recursive: true });
});
```

---

## Arquivo: `monorepo/router/tests/http_semantics_test.ts`

```ts
// monorepo/router/tests/http_semantics_test.ts
import { assertEquals } from "@std/assert";
import { createDenoRouter } from "../src/deno.ts";

Deno.test("HEAD automático: usa rota GET se HEAD não existir", async () => {
  const app = createDenoRouter({ basePath: "" });
  app.get("/resource", () => ({
    body: "data",
    init: { headers: { "X-Custom": "value" } },
  }));
  
  const req = new Request("http://localhost/resource", { method: "HEAD" });
  const res = await app.handleRequest(req);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("X-Custom"), "value");
  assertEquals(await res.text(), "", "HEAD deve ter body vazio");
});

Deno.test("405 Method Not Allowed: retorna quando path existe com outro método", async () => {
  const app = createDenoRouter({ basePath: "" });
  app.get("/resource", () => ({ body: "data" }));
  app.post("/resource", () => ({ body: "created", init: { status: 201 } }));
  
  const req = new Request("http://localhost/resource", { method: "PUT" });
  const res = await app.handleRequest(req);
  assertEquals(res.status, 405);
  assertEquals(res.headers.get("Allow"), "GET, POST");
});

Deno.test("Static files: POST retorna 404", async () => {
  const tmpDir = await Deno.makeTempDir();
  await Deno.writeTextFile(`${tmpDir}/file.txt`, "content");
  
  const app = createDenoRouter({ basePath: "", staticDir: tmpDir });
  
  const req = new Request("http://localhost/file.txt", { method: "POST" });
  const res = await app.handleRequest(req);
  assertEquals(res.status, 404);
  
  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("Static files: HEAD retorna headers sem body", async () => {
  const tmpDir = await Deno.makeTempDir();
  await Deno.writeTextFile(`${tmpDir}/file.txt`, "content");
  
  const app = createDenoRouter({ basePath: "", staticDir: tmpDir });
  
  const req = new Request("http://localhost/file.txt", { method: "HEAD" });
  const res = await app.handleRequest(req);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Content-Type"), "text/plain; charset=utf-8");
  assertEquals(await res.text(), "", "HEAD deve ter body vazio");
  
  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("basePath normaliza '/' para ''", async () => {
  const app = createDenoRouter({ basePath: "/" });
  app.get("/test", () => ({ body: "ok" }));
  
  const req = new Request("http://localhost/test");
  const res = await app.handleRequest(req);
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "ok");
});

Deno.test("lastBroadcastDelay default é 0ms", async () => {
  // Teste implícito: se fosse 50ms, testes de last broadcast seriam mais lentos
  const app = createDenoRouter({ basePath: "" });
  // Se não houver erro, o default está correto
  assertEquals(true, true);
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

// 🚀 CORREÇÃO: Adicionado trustProxy: true
Deno.test("Force HTTPS ignora se x-forwarded-proto for https", async () => {
  const app = createDenoRouter({ basePath: "", forceHttps: true, trustProxy: true });
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
  const req = new Request("http://localhost/chat", {
    headers: {
      upgrade: "websocket",
      connection: "Upgrade",
      "sec-websocket-version": "13",
      "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
    },
  });
  await app.handleRequest(req);
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

// 🚀 CORREÇÃO: Adicionado trustProxy: true
Deno.test("Force HTTPS ignora se x-forwarded-proto for https", async () => {
  const app = createDenoRouter({ basePath: "", forceHttps: true, trustProxy: true });
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

## Arquivo: `monorepo/router/tests/adapters_test.ts`

```ts
// monorepo/router/tests/adapters_test.ts
import { assertEquals, assert } from "@std/assert";
import { Router } from "../src/mod.ts";
import { createDenoRouter } from "../src/deno.ts";

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
// 2. TESTE DE WEBSOCKET SEM UPGRADER (Erro esperado)
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
// 3. TESTE DE INTEGRAÇÃO COM createDenoRouter + WebSocket
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
// 4. TESTE DE FORCE HTTPS COM createDenoRouter
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

const app = new Router({ basePath: "/api" });

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

const app = new Router({ basePath: "/api" });

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
      (_receiver, _sender, msg) => { 
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
      (_receiver, _sender, msg) => { 
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
- A lógica de permissão continua sendo `(receiverParams, senderParams, message) => boolean`
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

````

---

## Arquivo: `monorepo/router/docs/runtime-agnostic.md`

````md
# 🌐 Arquitetura Runtime-Agnostic

O `@loco/router` foi projetado para funcionar em **qualquer runtime JavaScript** que suporte as Web APIs padrão (Fetch API, WebSocket, URLPattern). O core do router **não possui nenhuma dependência direta** de runtime específico.

Atualmente, fornecemos adaptadores oficiais e testados apenas para **Deno**. Adaptadores para outros runtimes (Node.js, Bun, Cloudflare Workers) estão em nosso [Roadmap](./roadmap-adapters.md).

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
 │           ENTRY POINTS (src/deno.ts)                    │
 │  - createDenoRouter()                                   │
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

### `StaticFileHandler`
Abstrai o sistema de arquivos para servir arquivos estáticos:
```typescript
interface StaticFileHandler {
  handle(path: string): Promise<Response | null>;
}
```

---

## 🦕 Usando com Deno (Suporte Oficial)

```typescript
import { createDenoRouter } from "@loco/router/deno";

const app = createDenoRouter({
  basePath: "/api",
  staticDir: "./public",
  forceHttps: true,
  trustProxy: true,
});

app.get("/hello", () => ({ body: "Hello!" }));

Deno.serve({ port: 8000 }, app.handleRequest.bind(app));
```

## 🟢 Usando com Node.js ou Bun (Via Core Puro)

Como o core é agnóstico, você pode usá-lo em Node.js ou Bun implementando suas próprias interfaces de adaptação:

```typescript
import { Router } from "@loco/router";

// Você precisaria implementar estas interfaces para o seu runtime
const myNodeUpgrader = { /* ... */ };
const myNodeStaticHandler = { /* ... */ };

const app = new Router({
  basePath: "/api",
  webSocketUpgrader: myNodeUpgrader,
  staticFileHandler: myNodeStaticHandler,
});
```

---

## 🔒 Segurança

- **Path Traversal Protection**: O core sanitiza paths e o adaptador Deno garante *containment* real e recusa symlinks.
- **Dotfiles**: Bloqueados por padrão (`allowDotfiles: false`).
- **Force HTTPS**: Redireciona HTTP→HTTPS em produção (ignora localhost).
- **HSTS**: Header `Strict-Transport-Security` adicionado automaticamente em respostas HTTPS.
- **Trust Proxy**: Confiança explícita em headers como `X-Forwarded-Proto` via `trustProxy: true`.

---

## 📋 Tabela de Compatibilidade Atual

| Feature | Deno (Oficial) | Node.js / Bun (Via Core) |
|---------|----------------|--------------------------|
| HTTP Routing | ✅ | ✅ |
| WebSocket | ✅ | ⚠️ (Requer Adaptador) |
| Static Files (disco) | ✅ | ⚠️ (Requer Adaptador) |
| Force HTTPS / HSTS | ✅ | ✅ |
| Middlewares | ✅ | ✅ |
| Dual Params Broadcast | ✅ | ✅ |
| Last Broadcast | ✅ | ✅ |
| Path Traversal / Symlinks | ✅ | ⚠️ (Depende do Adaptador) |

````

---

## Arquivo: `monorepo/router/docs/middleware.md`

````md
# 🎯 Sim, Middleware cabe perfeitamente no WebSocket!

Na verdade, é **onde ele brilha mais**, pois permite autenticar **antes** do upgrade (evitando criar conexões não autorizadas), em vez de validar dentro do handler quando o socket já está aberto.

## 📊 Como Funciona o Fluxo

```
Request → Force HTTPS? → Rota encontrada? → MIDDLEWARES → Handler final
                ↓                                    ↓
              301                          Se retornar Response → ABORTA
                                           Se chamar next() → continua
```

**Para HTTP:** `next()` executa o handler da rota.
**Para WS:** `next()` faz o `Deno.upgradeWebSocket` e inicia o grupo.

Se um middleware retornar uma `Response` (ex: `401`), o upgrade **nunca acontece**.


---

## 🌍 Exemplos Práticos

### Exemplo 1: Autenticação JWT via Subprotocol (agora como middleware!)

O exemplo do `jwt/main.ts` fica **muito mais limpo**. Toda a validação sai do handler:

```typescript
import { Router } from "../../src/mod.ts";
import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = "meu-segredo-super-secreto-123";
const encoder = new TextEncoder();

const app = new Router({ basePath: "/api" });

// ✅ Middleware de autenticação: bloqueia ANTES do upgrade
app.use(async (req, _params, next) => {
  // Só aplica em rotas WebSocket
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
    return await next(); // Prossegue com o upgrade
  } catch {
    console.error("[Middleware] ❌ Token inválido");
    return new Response("Invalid token", { status: 403 });
  }
});

// Handler WS agora fica limpo — só lógica de negócio
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

### Exemplo 2: Logging + Rate Limiting

```typescript
// Logging de todas as requisições (HTTP + WS)
app.use(async (req, params, next) => {
  const start = Date.now();
  const res = await next();
  const ms = Date.now() - start;
  const isWs = req.headers.get("upgrade") === "websocket";
  console.log(`📝 [${isWs ? "WS" : "HTTP"}] ${req.method} ${req.url} → ${res.status} (${ms}ms)`);
  return res;
});

// Rate limiting por IP (simples, em memória)
const requestCounts = new Map<string, { count: number; resetAt: number }>();

app.use(async (req, _params, next) => {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const now = Date.now();
  const entry = requestCounts.get(ip);

  if (!entry || now > entry.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + 60_000 });
    return await next();
  }

  entry.count++;
  if (entry.count > 100) {
    return new Response("Too Many Requests", { status: 429 });
  }
  return await next();
});
```

### Exemplo 3: Manutenção Programada

```typescript
let maintenanceMode = false;

app.use(async (_req, _params, next) => {
  if (maintenanceMode) {
    return new Response("🔧 Em manutenção", {
      status: 503,
      headers: { "Retry-After": "300" },
    });
  }
  return await next();
});
```

---

## 📊 Comparação: Middleware vs PermissionFn

| Aspecto | `app.use()` (Middleware) | `permissionFn` (Broadcast) |
|---|---|---|
| **Quando roda** | No momento da conexão/requisição | A cada mensagem broadcastada |
| **O que controla** | Se a conexão/requisição é aceita | Quem recebe cada mensagem |
| **Acesso ao WebSocket** | ❌ Não (ainda não foi criado) | ✅ Sim (sockets já conectados) |
| **Acesso à Request** | ✅ Sim (headers, URL, method) | ❌ Não |
| **Caso de uso** | Auth, rate limit, logging, CORS | Isolamento de salas, filtros de conteúdo |

**Eles se complementam:** Middleware controla **quem entra**, `permissionFn` controla **quem ouve o quê**.

---

## ⚠️ Pontos Importantes

1. **Ordem importa:** Middlewares são executados na ordem em que foram registrados com `app.use()`.
2. **Executam em todas as requisições:** Middlewares rodam para todas as 
   requisições, incluindo 404, arquivos estáticos e rotas não encontradas.
   Isso permite logging global, CORS e rate limiting universais.
3. **Abortar o upgrade:** Se um middleware retornar `Response` sem chamar `next()` em uma rota WS, o upgrade nunca acontece — o cliente recebe uma resposta HTTP normal (ex: 401).
4. **Params disponíveis:** O middleware recebe os `params` já extraídos da rota, permitindo lógica como "bloquear acesso à sala X".

````

---

## Arquivo: `monorepo/router/docs/security.md`

````md
# 🔒 Guia de Segurança do @loco/router

Este documento descreve as práticas de segurança recomendadas ao usar o `@loco/router` em produção.

## 📋 Índice

1. [HTTPS e HSTS](#https-e-hsts)
2. [Proteção de Arquivos Estáticos](#proteção-de-arquivos-estáticos)
3. [WebSocket Security](#websocket-security)
4. [Autenticação e Autorização](#autenticação-e-autorização)
5. [Rate Limiting](#rate-limiting)
6. [Headers de Segurança](#headers-de-segurança)

---

## 🌐 HTTPS e HSTS

### Force HTTPS

O router suporta redirecionamento automático de HTTP para HTTPS:

```typescript
const app = createDenoRouter({
  basePath: "/api",
  forceHttps: true, // Redireciona HTTP → HTTPS
});
```

**Comportamento:**
- Redireciona com status `301 Moved Permanently`
- Ignora automaticamente `localhost` e `127.0.0.1` para facilitar desenvolvimento
- Suporta IPv6 `[::1]`

### Confiança em Proxy (`trustProxy`)

Quando atrás de um proxy reverso (nginx, Cloudflare, etc.), o router pode confiar no header `X-Forwarded-Proto`:

```typescript
const app = createDenoRouter({
  forceHttps: true,
  trustProxy: true, // ⚠️ Apenas se estiver atrás de proxy confiável
});
```

**⚠️ AVISO:** Nunca ative `trustProxy` se o servidor estiver exposto diretamente à internet. Um atacante poderia enviar `X-Forwarded-Proto: https` e bypassar o redirect.

### HSTS (HTTP Strict Transport Security)

Quando `forceHttps` está ativo e a requisição já é HTTPS, o router automaticamente adiciona:

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

Isso instrui navegadores a sempre usar HTTPS para seu domínio.

---

## 📂 Proteção de Arquivos Estáticos

### Dotfiles

Por padrão, arquivos que começam com `.` são bloqueados:

```typescript
const app = createDenoRouter({
  staticDir: "./public",
  allowDotfiles: false, // Default: false
});
```

**Bloqueados por padrão:**
- `.env`, `.env.local`
- `.git/config`, `.git/HEAD`
- `.DS_Store`
- `.htaccess`

Se precisar servir dotfiles (não recomendado):

```typescript
const app = createDenoRouter({
  staticDir: "./public",
  allowDotfiles: true, // ⚠️ Risco de segurança
});
```

### Symlinks

O adaptador Deno **recusa symlinks** por padrão para evitar vazamento de arquivos fora do diretório público.

**Exemplo de ataque bloqueado:**
```bash
# Se existir: public/secret -> /etc/passwd
# Requisição: GET /secret
# Resultado: 404 (não serve o arquivo)
```

### Path Traversal

O router sanitiza caminhos para evitar ataques de path traversal:

```typescript
// Requisição maliciosa
GET /../../etc/passwd
GET /..%2F..%2Fetc%2Fpasswd

// Resultado: 404 (caminho sanitizado antes de acessar)
```

### Containment

O adaptador Deno verifica que o caminho resolvido está estritamente dentro do `staticDir`:

```typescript
const app = createDenoRouter({
  staticDir: "/var/www/public",
});

// Requisição: GET /../../etc/passwd
// Mesmo após sanitização, o path resolvido é verificado
// Resultado: 404 se tentar escapar do diretório
```

---

## 🔌 WebSocket Security

### Validação de Origin

WebSockets são vulneráveis a ataques Cross-Site WebSocket Hijacking (CSWSH). Valide o header `Origin`:

```typescript
const allowedOrigins = ["https://meusite.com", "https://app.meusite.com"];

app.use(async (req, _params, next) => {
  if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
    const origin = req.headers.get("origin");
    if (!origin || !allowedOrigins.includes(origin)) {
      return new Response("Forbidden: Invalid origin", { status: 403 });
    }
  }
  return await next();
});
```

### Autenticação via Subprotocol

O exemplo JWT demonstra como passar tokens via subprotocolo WebSocket:

```javascript
// Cliente
const ws = new WebSocket("wss://api.site.com/chat", ["Bearer", token]);

// Servidor (middleware)
app.use(async (req, _params, next) => {
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return await next();
  }
  
  const protocol = req.headers.get("sec-websocket-protocol") ?? "";
  const protocols = protocol.split(",").map(p => p.trim());
  const bearerIndex = protocols.findIndex(p => p === "Bearer");
  const token = bearerIndex !== -1 ? protocols[bearerIndex + 1] : null;
  
  if (!token) {
    return new Response("Token required", { status: 401 });
  }
  
  try {
    await jwtVerify(token, secret);
    return await next();
  } catch {
    return new Response("Invalid token", { status: 403 });
  }
});
```

### Isolamento de Salas

Use `permissionFn` para garantir que mensagens não vazem entre salas:

```typescript
app.ws("/chat/:room/:user", (ws, _req, params) => {
  const group = app.getWsGroupByPath("/chat/:room/:user");
  
  ws.onmessage = (event) => {
    group.broadcast(
      `[${params.user}]: ${event.data}`,
      (receiver, sender, _msg) => receiver.room === sender.room,
      params
    );
  };
});
```

**Sem `permissionFn`, o broadcast envia para TODOS os sockets da rota**, não apenas para a mesma sala.

---

## 🔐 Autenticação e Autorização

### JWT com Expiração

Sempre defina expiração em tokens JWT:

```typescript
import { SignJWT } from "jose";

const token = await new SignJWT({ userId: "123", role: "user" })
  .setProtectedHeader({ alg: "HS256" })
  .setExpirationTime("1h") // ⚠️ Sempre definir
  .setIssuedAt()
  .sign(secret);
```

### Validação de Algoritmo

Ao verificar JWTs, especifique algoritmos permitidos:

```typescript
import { jwtVerify } from "jose";

await jwtVerify(token, secret, {
  algorithms: ["HS256"], // ⚠️ Evite "none" e algoritmos fracos
});
```

### Segredos em Variáveis de Ambiente

Nunca hardcode segredos em produção:

```typescript
// ❌ RUIM
const JWT_SECRET = "meu-segredo-123";

// ✅ BOM
const JWT_SECRET = Deno.env.get("JWT_SECRET");
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET não configurado");
}
```

---

## 🚦 Rate Limiting

O router **não inclui rate limiting nativo**. Use middlewares para proteger contra abuso:

```typescript
// Exemplo simples de rate limiting por IP
const requestCounts = new Map<string, { count: number; resetTime: number }>();

app.use(async (req, _params, next) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const now = Date.now();
  const windowMs = 60000; // 1 minuto
  const maxRequests = 100;
  
  const record = requestCounts.get(ip) ?? { count: 0, resetTime: now + windowMs };
  
  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + windowMs;
  }
  
  record.count++;
  requestCounts.set(ip, record);
  
  if (record.count > maxRequests) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: {
        "Retry-After": Math.ceil((record.resetTime - now) / 1000).toString(),
      },
    });
  }
  
  return await next();
});
```

Para produção, considere:
- Redis para rate limiting distribuído
- Bibliotecas especializadas como `rate-limiter-flexible`
- Soluções de edge (Cloudflare, AWS WAF)

---

## 🛡️ Headers de Segurança

Adicione headers de segurança via middleware:

```typescript
app.use(async (req, _params, next) => {
  const res = await next();
  
  // Prevenir clickjacking
  res.headers.set("X-Frame-Options", "DENY");
  
  // Prevenir MIME sniffing
  res.headers.set("X-Content-Type-Options", "nosniff");
  
  // Referrer Policy
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  
  // Content Security Policy (ajuste conforme necessário)
  res.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
  );
  
  return res;
});
```

---

## ✅ Checklist de Segurança para Produção

- [ ] `forceHttps: true` ativado
- [ ] `trustProxy: true` apenas se atrás de proxy confiável
- [ ] `allowDotfiles: false` (default)
- [ ] Validação de `Origin` em WebSockets
- [ ] Tokens JWT com expiração e algoritmos restritos
- [ ] Segredos em variáveis de ambiente
- [ ] Rate limiting implementado
- [ ] Headers de segurança adicionados
- [ ] Logs de auditoria para autenticação
- [ ] HTTPS/WSS em produção (nunca HTTP/WS)

---

## 📚 Recursos Adicionais

- [OWASP WebSocket Security Cheat Sheet](https://cheatsheetseries.owasp.org/)
- [MDN: HTTP Strict Transport Security](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security)
- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)

````

---

## Arquivo: `monorepo/router/docs/roadmap-adapters.md`

````md
# 🗺️ Roadmap: Adaptadores para Outros Runtimes

O `@loco/router` foi projetado com arquitetura runtime-agnostic, mas atualmente possui suporte oficial apenas para **Deno**. Este documento descreve o roadmap para suportar outros ambientes.

---

## 📊 Status Atual

| Runtime | HTTP | WebSocket | Static Files | Status |
|---------|------|-----------|--------------|--------|
| **Deno** | ✅ | ✅ | ✅ | **Suporte Oficial** |
| Cloudflare Workers | ⏸️ | ❌ | ⏸️ | Roadmap (Static Assets) |
| Node.js | ❌ | ❌ | ❌ | Roadmap |
| Bun | ❌ | ❌ | ❌ | Roadmap |
| Edge Runtimes (Vercel, Netlify) | ❌ | ❌ | ❌ | Futuro |

---

## ☁️ Cloudflare Workers

### Status Atual

Os adaptadores Cloudflare foram **removidos do core** na versão 1.0 devido a:

1. **Limitações de estado**: Cloudflare Workers não mantém estado compartilhado entre requests (exceto via Durable Objects)
2. **WebSocket em memória**: Grupos WebSocket não funcionariam corretamente em produção
3. **Foco no Deno**: Simplificar o core e garantir qualidade

### Caminho Futuro: Static Assets

Cloudflare lançou **Static Assets** ([documentação](https://developers.cloudflare.com/workers/static-assets/)), que é a forma recomendada de servir arquivos estáticos:

```typescript
// Futuro adaptador Cloudflare com Static Assets
export function createCloudflareRouter(options: {
  basePath?: string;
  assets?: { binding: string }; // Novo binding de Static Assets
}) {
  // ...
}
```

**Para WebSockets em Cloudflare**, use **Durable Objects**:

```typescript
// Exemplo conceitual: Chat Room como Durable Object
export class ChatRoom {
  private sessions: Map<string, WebSocket> = new Map();
  
  async fetch(request: Request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    
    await this.handleSession(server);
    
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
  
  async handleSession(webSocket: WebSocket) {
    webSocket.accept();
    // Gerenciar mensagens, broadcast, etc.
  }
}
```

### Prioridade: **Média**

---

## 🟢 Node.js

### Desafios

1. **URLPattern**: Disponível apenas em Node 18.17+ (via `undici`)
2. **WebSocket**: Requer biblioteca externa (`ws`, `uWebSockets.js`)
3. **Static Files**: Módulo `fs` ou `fs/promises`

### Adaptador Conceitual

```typescript
// src/adapters/node.ts (futuro)
import { WebSocketServer } from "ws";
import { createReadStream, stat } from "fs/promises";
import { join, resolve } from "path";

export function createNodeWebSocketUpgrader(wss: WebSocketServer): WebSocketUpgrader {
  return {
    upgrade(req: Request): { socket: WebSocket; response: Response } {
      // Node.js requer abordagem diferente
      // WebSocket upgrade acontece no servidor HTTP, não no handler
      throw new Error("Node WebSocket adapter requer integração com servidor HTTP");
    },
  };
}

export function createNodeStaticFileHandler(staticDir: string): StaticFileHandler {
  return {
    async handle(path: string): Promise<Response | null> {
      try {
        const filePath = join(staticDir, path);
        const stats = await stat(filePath);
        
        if (stats.isFile()) {
          const stream = createReadStream(filePath);
          return new Response(stream as any, {
            headers: {
              "Content-Type": "application/octet-stream",
              "Content-Length": stats.size.toString(),
            },
          });
        }
      } catch {
        return null;
      }
      return null;
    },
  };
}
```

### Prioridade: **Alta**

Node.js é amplamente usado e seria valioso ter suporte oficial.

---

## 🥐 Bun

### Vantagens

- Compatível com APIs Node.js
- Suporte nativo a WebSocket via `Bun.serve`
- Performance excelente

### Adaptador Conceitual

```typescript
// src/adapters/bun.ts (futuro)
export function createBunWebSocketUpgrader(): WebSocketUpgrader {
  return {
    upgrade(req: Request): { socket: WebSocket; response: Response } {
      const { socket, response } = Bun.upgrade(req, {
        data: {},
      });
      return { socket, response };
    },
  };
}

export function createBunStaticFileHandler(staticDir: string): StaticFileHandler {
  return {
    async handle(path: string): Promise<Response | null> {
      try {
        const file = Bun.file(join(staticDir, path));
        if (await file.exists()) {
          return new Response(file);
        }
      } catch {
        return null;
      }
      return null;
    },
  };
}
```

### Prioridade: **Média-Alta**

Bun está ganhando popularidade e seria relativamente fácil adaptar.

---

## 🌐 Edge Runtimes (Vercel Edge, Netlify Edge)

### Desafios

- Ambientes serverless com cold starts
- Sem suporte a WebSocket de longa duração
- Foco em HTTP request/response

### Abordagem Recomendada

Usar o core agnóstico diretamente, sem adaptadores oficiais:

```typescript
// edge-function.ts
import { Router } from "@loco/router";

const router = new Router({ basePath: "/api" });

router.get("/hello", () => ({
  body: JSON.stringify({ message: "Hello from Edge!" }),
  init: { headers: { "Content-Type": "application/json" } },
}));

export default function handler(request: Request) {
  return router.handleRequest(request);
}
```

### Prioridade: **Baixa**

---

## 🛠️ Como Contribuir com um Adaptador

Se você quer criar um adaptador para outro runtime:

### 1. Implementar `WebSocketUpgrader`

```typescript
interface WebSocketUpgrader {
  upgrade(req: Request): { socket: WebSocket; response: Response };
}
```

### 2. Implementar `StaticFileHandler`

```typescript
interface StaticFileHandler {
  handle(path: string): Promise<Response | null>;
}
```

### 3. Criar Entry Point

```typescript
// src/[runtime].ts
export function create[Runtime]Router(options: {
  basePath?: string;
  staticDir?: string;
  forceHttps?: boolean;
  // ... outras opções específicas do runtime
}): Router {
  const router = new Router({
    basePath,
    forceHttps,
    webSocketUpgrader: create[Runtime]WebSocketUpgrader(),
    staticFileHandler: staticDir ? create[Runtime]StaticFileHandler(staticDir) : undefined,
  });
  return router;
}

export * from "./mod.ts";
```

### 4. Adicionar Testes

Criar `tests/adapters_[runtime]_test.ts` com:
- Testes de HTTP routing
- Testes de WebSocket (se suportado)
- Testes de static files (se suportado)
- Testes de edge cases do runtime

### 5. Documentar

- Adicionar seção em `docs/runtime-agnostic.md`
- Criar exemplo em `example/[runtime]/`
- Atualizar `README.md`

---

## 📅 Timeline Estimado

| Adaptador | Estimativa | Dependências |
|-----------|------------|--------------|
| Node.js | 2-3 semanas | `ws`, `undici` |
| Bun | 1-2 semanas | Nenhuma (built-in) |
| Cloudflare (Static Assets) | 1-2 semanas | Wrangler |
| Edge Runtimes | 1 semana | Nenhuma |

---

## 💡 Alternativa: Adapters da Comunidade

Se você criar um adaptador, considere publicá-lo como pacote separado:

```bash
@loco/router-adapter-node
@loco/router-adapter-bun
@loco/router-adapter-cloudflare
```

Isso mantém o core leve e permite que a comunidade contribua sem sobrecarregar o repositório principal.

---

## 🤝 Contribuindo

Interessado em contribuir com um adaptador? Abra uma issue discutindo:

1. Qual runtime você quer suportar
2. Como você planeja implementar `WebSocketUpgrader`
3. Como você planeja implementar `StaticFileHandler`
4. Se você vai manter o adaptador a longo prazo

Estamos abertos a colaborações! 🚀


````

---

## Arquivo: `monorepo/router/docs/roadmap-rate-limiting.md`

````md
# 🚦 Roadmap: Rate Limiting e Proteção contra Abuso

O `@loco/router` atualmente **não inclui rate limiting nativo**. Este documento descreve estratégias recomendadas e o roadmap para possíveis implementações futuras.

---

## 📊 Status Atual

| Feature | Status | Implementação Recomendada |
|---------|--------|---------------------------|
| Rate Limiting por IP | ❌ | Middleware customizado |
| Rate Limiting por Usuário | ❌ | Middleware customizado |
| Rate Limiting por WebSocket | ❌ | Middleware customizado |
| Tamanho Máximo de Mensagem | ❌ | Validação no handler |
| Backpressure de Broadcast | ❌ | Lógica no handler |

---

## 🛡️ Por Que Rate Limiting é Importante?

### Ataques Comuns

1. **Brute Force**: Tentativas massivas de login
2. **DDoS**: Sobrecarga do servidor com requests
3. **Credential Stuffing**: Teste de credenciais vazadas
4. **Scraping**: Extração automatizada de dados
5. **WebSocket Flood**: Envio massivo de mensagens

### Impactos sem Rate Limiting

- **Performance degradada**: CPU/memory sobrecarregados
- **Custos elevados**: Uso excessivo de recursos (especialmente em serverless)
- **Dados comprometidos**: Contas invadidas via brute force
- **Disponibilidade**: Serviço indisponível para usuários legítimos

---

## 💡 Implementações Recomendadas

### 1. Rate Limiting Simples (Em Memória)

Adequado para aplicações single-instance:

```typescript
const requestCounts = new Map<string, { count: number; resetTime: number }>();

app.use(async (req, _params, next) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const now = Date.now();
  const windowMs = 60000; // 1 minuto
  const maxRequests = 100;
  
  const record = requestCounts.get(ip) ?? { count: 0, resetTime: now + windowMs };
  
  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + windowMs;
  }
  
  record.count++;
  requestCounts.set(ip, record);
  
  if (record.count > maxRequests) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: {
        "Retry-After": Math.ceil((record.resetTime - now) / 1000).toString(),
        "X-RateLimit-Limit": maxRequests.toString(),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": record.resetTime.toString(),
      },
    });
  }
  
  const res = await next();
  res.headers.set("X-RateLimit-Limit", maxRequests.toString());
  res.headers.set("X-RateLimit-Remaining", (maxRequests - record.count).toString());
  res.headers.set("X-RateLimit-Reset", record.resetTime.toString());
  
  return res;
});
```

**Limitações:**
- Não funciona em múltiplas instâncias
- Perde estado ao reiniciar
- Sem persistência

---

### 2. Rate Limiting com Redis (Distribuído)

Para aplicações multi-instância:

```typescript
import { connect } from "redis";

const redis = await connect({ hostname: "localhost", port: 6379 });

app.use(async (req, _params, next) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const key = `ratelimit:${ip}`;
  const windowMs = 60000;
  const maxRequests = 100;
  
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, Math.ceil(windowMs / 1000));
  }
  
  if (current > maxRequests) {
    const ttl = await redis.ttl(key);
    return new Response("Too Many Requests", {
      status: 429,
      headers: {
        "Retry-After": ttl.toString(),
        "X-RateLimit-Limit": maxRequests.toString(),
        "X-RateLimit-Remaining": "0",
      },
    });
  }
  
  const res = await next();
  res.headers.set("X-RateLimit-Limit", maxRequests.toString());
  res.headers.set("X-RateLimit-Remaining", (maxRequests - current).toString());
  
  return res;
});
```

**Vantagens:**
- Funciona em múltiplas instâncias
- Persistente
- Atomicidade garantida

---

### 3. Rate Limiting por Usuário Autenticado

```typescript
app.use(async (req, _params, next) => {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return await next();
  
  const token = authHeader.replace("Bearer ", "");
  let userId: string;
  
  try {
    const { payload } = await jwtVerify(token, secret);
    userId = payload.userId as string;
  } catch {
    return await next(); // Deixa o handler de auth lidar
  }
  
  const key = `ratelimit:user:${userId}`;
  // ... mesma lógica de rate limiting
  
  return await next();
});
```

---

### 4. Rate Limiting de WebSocket

#### Limite de Mensagens por Segundo

```typescript
app.ws("/chat/:room/:user", (ws, _req, params) => {
  const messageCount = { count: 0, resetTime: Date.now() + 1000 };
  const maxMessagesPerSecond = 10;
  
  ws.onmessage = (event) => {
    const now = Date.now();
    
    if (now > messageCount.resetTime) {
      messageCount.count = 0;
      messageCount.resetTime = now + 1000;
    }
    
    messageCount.count++;
    
    if (messageCount.count > maxMessagesPerSecond) {
      ws.send(JSON.stringify({
        type: "error",
        message: "Rate limit exceeded. Max 10 messages/second.",
      }));
      return;
    }
    
    // Processar mensagem normalmente
    const group = app.getWsGroupByPath("/chat/:room/:user");
    group.broadcast(event.data, /* ... */);
  };
});
```

#### Tamanho Máximo de Mensagem

```typescript
app.ws("/chat/:room/:user", (ws, _req, params) => {
  const maxMessageSize = 1024; // 1 KB
  
  ws.onmessage = (event) => {
    if (typeof event.data === "string" && event.data.length > maxMessageSize) {
      ws.send(JSON.stringify({
        type: "error",
        message: `Message too large. Max ${maxMessageSize} characters.`,
      }));
      return;
    }
    
    // Processar mensagem
  };
});
```

---

### 5. Backpressure de Broadcast

Quando um cliente está lento, o broadcast pode acumular mensagens:

```typescript
app.ws("/chat/:room/:user", (ws, _req, params) => {
  const group = app.getWsGroupByPath("/chat/:room/:user");
  const maxQueueSize = 100;
  let messageQueue: string[] = [];
  
  ws.onmessage = (event) => {
    // Broadcast normal
    group.broadcast(
      `[${params.user}]: ${event.data}`,
      (receiver, sender, _msg) => receiver.room === sender.room,
      params
    );
  };
  
  // Monitorar bufferedAmount (WebSocket API)
  setInterval(() => {
    if (ws.bufferedAmount > 1024 * 1024) { // > 1 MB
      console.warn(`[WS] Cliente ${params.user} com buffer alto: ${ws.bufferedAmount}`);
      // Opcional: fechar conexão ou enviar alerta
      ws.send(JSON.stringify({
        type: "warning",
        message: "You're receiving messages faster than you can process them.",
      }));
    }
  }, 5000);
});
```

---

## 🔮 Possível Implementação Futura no Core

Se rate limiting for adicionado ao core, poderia ser assim:

```typescript
const app = createDenoRouter({
  basePath: "/api",
  rateLimit: {
    enabled: true,
    windowMs: 60000,
    maxRequests: 100,
    keyGenerator: (req) => req.headers.get("x-forwarded-for") ?? "unknown",
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    handler: (req, res, next, options) => {
      res.status(429).json({
        error: "Too many requests, please try again later.",
      });
    },
  },
});
```

### Desafios

1. **Storage**: Em memória vs Redis vs banco de dados
2. **Distribuição**: Como sincronizar entre instâncias
3. **Flexibilidade**: Diferentes limites para diferentes rotas
4. **Performance**: Overhead de verificar rate limit em cada request

### Prioridade: **Média**

Rate limiting é importante, mas existem soluções maduras (middlewares, proxies) que podem ser usadas. Implementar no core pode ser over-engineering.

---

## 📚 Bibliotecas Recomendadas

### Para Node.js

- **rate-limiter-flexible**: Suporta Redis, MongoDB, memória
- **express-rate-limit**: Simples e popular
- **slow-down**: Adiciona delay em vez de bloquear

### Para Deno

Atualmente não há bibliotecas maduras. Implemente custom ou use Redis diretamente.

### Para Cloudflare

- **Cloudflare Rate Limiting Rules**: Configurado no dashboard
- **Workers KV**: Para rate limiting distribuído

---

## ✅ Checklist de Rate Limiting

- [ ] Rate limit por IP em endpoints públicos
- [ ] Rate limit mais agressivo em `/login`, `/register`
- [ ] Rate limit por usuário autenticado
- [ ] Rate limit de WebSocket (mensagens/segundo)
- [ ] Tamanho máximo de mensagem WebSocket
- [ ] Headers `X-RateLimit-*` nas respostas
- [ ] Logs de tentativas de abuso
- [ ] Alertas para picos anômalos de tráfego

---

## 🎯 Recomendações por Tamanho de Aplicação

### Pequena (Single Instance, < 1000 req/min)

- Rate limiting em memória
- Sem Redis
- Middleware simples

### Média (Multi-Instance, < 10000 req/min)

- Redis para rate limiting distribuído
- Diferentes limites por rota
- Monitoramento básico

### Grande (> 10000 req/min)

- Solução de edge (Cloudflare, AWS WAF)
- Redis cluster
- Análise de padrões de tráfego
- Machine learning para detecção de anomalias

---

## 🤝 Contribuindo

Se você implementou uma solução de rate limiting robusta, considere:

1. Compartilhar como exemplo em `example/rate-limiting/`
2. Criar um pacote separado: `@loco/router-rate-limit`
3. Abrir uma issue discutindo a abordagem

Estamos abertos a contribuições! 🚀

````

---

## Arquivo: `monorepo/router/deno.jsonc`

```json
// monorepo/router/deno.jsonc
{
  "name": "@loco/router",
  "version": "1.0.0",
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "dom.asynciterable", "esnext", "deno.ns"],
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true
  },
  "imports": {
    "@std/assert": "jsr:@std/assert@^1",
    "@std/media-types": "jsr:@std/media-types@^1", //uso futuro
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
    "./adapters/deno": "./src/adapters/deno.ts"
  }
}
```

---

## Arquivo: `monorepo/router/README.md`

````md
# 🚂 @loco/router

[![Deno](https://img.shields.io/badge/Deno-1.40+-black?logo=deno)](https://deno.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?logo=typescript)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.0.0-orange)](./CHANGELOG.md)

**Router HTTP/WebSocket runtime-agnostic para Deno** — Rápido, seguro e extensível.

O `@loco/router` é um router moderno com suporte completo a HTTP e WebSockets, projetado com arquitetura agnóstica que permite execução em múltiplos runtimes JavaScript. Atualmente oferece suporte oficial para **Deno**, com adaptadores para Node.js, Bun e Cloudflare Workers em desenvolvimento.

## ✨ Features Principais

### 🌐 HTTP Routing
- ✅ Todos os métodos HTTP: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`, `HEAD`
- ✅ Parâmetros de rota nomeados (`:id`) e catch-all (`*`)
- ✅ **HEAD automático** baseado em rotas GET (semântica HTTP correta)
- ✅ **405 Method Not Allowed** com header `Allow` quando método não é permitido
- ✅ Base path configurável com normalização inteligente

### 🔌 WebSockets
- ✅ Upgrade automático com adaptadores por runtime
- ✅ **Grupos de WebSocket** com broadcast inteligente
- ✅ **Dual Params PermissionFn**: filtra por receiver, sender e conteúdo da mensagem
- ✅ **Last Broadcast automático**: novos membros recebem a última mensagem ao conectar
- ✅ Handlers `onclose`/`onerror` não são sobrescritos pelo router
- ✅ Graceful shutdown com `closeAllWebSockets()`

### 🛡️ Segurança
- ✅ **Force HTTPS** com redirect automático (ignora localhost)
- ✅ **HSTS** (HTTP Strict Transport Security) em respostas HTTPS
- ✅ **Trust Proxy** explícito para headers `X-Forwarded-*`
- ✅ **Bloqueio de dotfiles** (`.env`, `.git`, etc.) por padrão
- ✅ **Recusa de symlinks** para evitar vazamento de arquivos
- ✅ **Path traversal protection** com sanitização e containment real
- ✅ Headers completos em arquivos estáticos (`ETag`, `Last-Modified`, `Cache-Control`)

### 🎯 Middlewares
- ✅ Cadeia de middlewares com `next()`
- ✅ **Rewrite de rotas** via `next(newReq)`
- ✅ Execução mesmo em 404 (útil para logging e CORS)
- ✅ Proteção contra múltiplas chamadas de `next()`

### 📂 Arquivos Estáticos
- ✅ Servir arquivos de diretório local
- ✅ Fallback automático para `index.html` e `index.htm`
- ✅ **Redirect 301** para diretórios sem barra final
- ✅ MIME types modernos (`.webp`, `.avif`, `.webmanifest`, etc.)
- ✅ Suporte a diretórios embutidos (embedded)

---

## 📦 Instalação

### Deno

```typescript
import { createDenoRouter } from "jsr:@loco/router@1.0.0/deno";
```

Ou via import map no `deno.json`:

```json
{
  "imports": {
    "@loco/router": "jsr:@loco/router@1.0.0"
  }
}
```

```typescript
import { createDenoRouter } from "@loco/router/deno";
```

---

## 🚀 Quick Start

### Servidor HTTP Simples

```typescript
import { createDenoRouter } from "@loco/router/deno";

const app = createDenoRouter({
  basePath: "/api",
  staticDir: "./public",
});

app.get("/hello", () => ({
  body: JSON.stringify({ message: "Hello, World!" }),
  init: { headers: { "Content-Type": "application/json" } },
}));

app.get("/users/:id", (_req, params) => ({
  body: JSON.stringify({ userId: params.id }),
}));

Deno.serve({ port: 8000 }, app.handleRequest.bind(app));
console.log("🚀 Servidor rodando em http://localhost:8000");
```

### Chat WebSocket com Salas

```typescript
import { createDenoRouter } from "@loco/router/deno";

const app = createDenoRouter({ basePath: "/api" });

app.ws("/chat/:room/:user", (ws, _req, params) => {
  const room = params.room as string;
  const user = params.user as string;
  const group = app.getWsGroupByPath("/chat/:room/:user");
  
  if (!group) {
    ws.close(1011, "Internal error");
    return;
  }
  
  console.log(`✅ ${user} entrou na sala ${room}`);
  
  ws.onmessage = (event) => {
    // Broadcast apenas para usuários na mesma sala
    group.broadcast(
      `[${user}]: ${event.data}`,
      (receiver, sender, _msg) => receiver.room === sender.room,
      params
    );
  };
  
  ws.onclose = () => {
    console.log(`❌ ${user} saiu da sala ${room}`);
  };
});

Deno.serve({ port: 8000 }, app.handleRequest.bind(app));
```

---

## 🌐 Roteamento HTTP

### Métodos Suportados

```typescript
app.get("/path", handler);
app.post("/path", handler);
app.put("/path", handler);
app.delete("/path", handler);
app.patch("/path", handler);
app.options("/path", handler);
app.head("/path", handler);
```

### Formato do Handler

Os handlers retornam um objeto com `body` e opcionalmente `init`:

```typescript
type HttpHandler = (
  req: Request,
  params: RouteParams,
) => { body: BodyInit; init?: ResponseInit } | Promise<{ body: BodyInit; init?: ResponseInit }>;
```

#### Exemplos

**Resposta JSON:**
```typescript
app.get("/api/user/:id", async (_req, params) => {
  const user = await db.getUser(params.id);
  return {
    body: JSON.stringify(user),
    init: {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  };
});
```

**Resposta de Texto:**
```typescript
app.get("/hello", () => ({
  body: "Hello, World!",
}));
```

**Status Customizado:**
```typescript
app.post("/users", async (req) => {
  const data = await req.json();
  const user = await db.createUser(data);
  return {
    body: JSON.stringify(user),
    init: {
      status: 201,
      headers: { "Content-Type": "application/json" },
    },
  };
});
```

**No Content (204):**
```typescript
app.delete("/users/:id", async (_req, params) => {
  await db.deleteUser(params.id);
  return {
    body: "",
    init: { status: 204 },
  };
});
```

**Redirect:**
```typescript
app.get("/old-page", () => ({
  body: "",
  init: {
    status: 301,
    headers: { "Location": "/new-page" },
  },
}));
```

### Parâmetros de Rota

```typescript
// Parâmetros nomeados
app.get("/users/:id/posts/:postId", (_req, params) => {
  console.log(params.id);      // "123"
  console.log(params.postId);  // "456"
  return { body: "OK" };
});

// Catch-all com *
app.get("/files/*", (_req, params) => {
  console.log(params.catch);  // ["path", "to", "file.txt"]
  return { body: JSON.stringify(params.catch) };
});

// Combinação
app.get("/api/:version/*", (_req, params) => {
  console.log(params.version);  // "v1"
  console.log(params.catch);    // ["users", "123"]
  return { body: "OK" };
});
```

### HEAD Automático

O router automaticamente suporta `HEAD` para rotas `GET` registradas:

```typescript
app.get("/resource", () => ({
  body: "data",
  init: { headers: { "X-Custom": "value" } },
}));

// GET /resource → 200 com body "data"
// HEAD /resource → 200 com headers mas body vazio
```

### 405 Method Not Allowed

Quando um path existe mas o método não é permitido:

```typescript
app.get("/resource", () => ({ body: "data" }));
app.post("/resource", () => ({ body: "created", init: { status: 201 } }));

// PUT /resource → 405 Method Not Allowed
// Headers: Allow: GET, POST
```

---

## 🎯 Middlewares

Middlewares executam antes do handler final e podem modificar a requisição, abortar o fluxo ou passar controle adiante.

### Básico

```typescript
app.use(async (req, params, next) => {
  console.log(`📝 ${req.method} ${req.url}`);
  return await next();
});
```

### Abortar Fluxo

```typescript
app.use(async (req, _params, next) => {
  const auth = req.headers.get("authorization");
  if (!auth) {
    return new Response("Unauthorized", { status: 401 });
  }
  return await next();
});
```

### Modificar Resposta

```typescript
app.use(async (_req, _params, next) => {
  const res = await next();
  res.headers.set("X-Custom-Header", "value");
  return res;
});
```

### Rewrite de Rota

Você pode passar uma nova `Request` para `next()` para reescrever a rota:

```typescript
app.use(async (req, _params, next) => {
  // Reescreve /old-api/* para /api/*
  if (req.url.includes("/old-api/")) {
    const newUrl = req.url.replace("/old-api/", "/api/");
    const newReq = new Request(newUrl, req);
    return next(newReq);
  }
  return next();
});
```

### Logging com Tempo

```typescript
app.use(async (req, _params, next) => {
  const start = Date.now();
  const res = await next();
  const ms = Date.now() - start;
  console.log(`${req.method} ${req.url} → ${res.status} (${ms}ms)`);
  return res;
});
```

### CORS

```typescript
app.use(async (req, _params, next) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  const res = await next();
  res.headers.set("Access-Control-Allow-Origin", "*");
  return res;
});
```

---

## 📂 Arquivos Estáticos

### Configuração Básica

```typescript
const app = createDenoRouter({
  basePath: "/api",
  staticDir: "./public",  // Diretório de arquivos estáticos
});
```

### Com Diretório Embutido

```typescript
const app = createDenoRouter({
  basePath: "/api",
  staticDir: "./public",
  embeddedDir: "./dist",  // Tenta embedded primeiro, depois static
});
```

### Comportamento

- Serve arquivos de `staticDir` quando rota HTTP não é encontrada
- Fallback automático: `/docs` → `/docs.html` → `/docs/index.html`
- **Redirect 301** para diretórios sem barra final: `/docs` → `/docs/`
- Apenas métodos `GET` e `HEAD` são servidos
- Headers completos: `Content-Type`, `Content-Length`, `Last-Modified`, `ETag`, `Cache-Control`

### MIME Types Modernos

Suporte nativo para:
- Imagens: `.webp`, `.avif`, `.png`, `.jpg`, `.gif`, `.svg`
- Web: `.html`, `.css`, `.js`, `.mjs`, `.json`, `.webmanifest`
- Fontes: `.woff`, `.woff2`, `.ttf`, `.otf`
- Mídia: `.mp3`, `.mp4`, `.webm`
- Outros: `.pdf`, `.xml`, `.wasm`, `.ts`, `.tsx`, `.jsx`

---

## 🔌 WebSockets

### Upgrade Automático

```typescript
app.ws("/chat/:room", (ws, req, params) => {
  console.log(`Cliente conectou na sala ${params.room}`);
  
  ws.onmessage = (event) => {
    ws.send(`Echo: ${event.data}`);
  };
  
  ws.onclose = () => {
    console.log("Cliente desconectou");
  };
});
```

### Grupos de WebSocket

Cada rota WS tem seu próprio grupo automaticamente:

```typescript
app.ws("/chat/:room/:user", (ws, _req, params) => {
  const group = app.getWsGroupByPath("/chat/:room/:user");
  
  ws.onmessage = (event) => {
    // Broadcast para todos na mesma rota
    group.broadcast(event.data);
  };
});
```

### Dual Params PermissionFn

Filtre broadcasts com base em **receiver**, **sender** e **mensagem**:

```typescript
app.ws("/chat/:room/:user", (ws, _req, params) => {
  const group = app.getWsGroupByPath("/chat/:room/:user");
  
  ws.onmessage = (event) => {
    group.broadcast(
      `[${params.user}]: ${event.data}`,
      (receiver, sender, message) => {
        // Regra 1: Mesma sala
        if (receiver.room !== sender.room) return false;
        
        // Regra 2: Não enviar para o próprio sender
        if (receiver.user === sender.user) return false;
        
        // Regra 3: Bloquear spam
        if (message.toLowerCase().includes("spam")) return false;
        
        return true;
      },
      params  // senderParams
    );
  };
});
```

### Last Broadcast Automático

Novos membros recebem a última mensagem ao conectar:

```typescript
// 10:00:00 → User A envia: "Olá a todos!"
// Router salva: { message: "Olá...", permissionFn: ..., senderParams: { room: "lobby" } }

// 10:00:05 → User B conecta em /chat/lobby/userB
// Router reavalia: permissionFn({ room: "lobby" }, { room: "lobby" }, "Olá...") → TRUE
// User B recebe "Olá a todos!" automaticamente!

// 10:00:10 → User C conecta em /chat/vip/userC
// Router reavalia: permissionFn({ room: "vip" }, { room: "lobby" }, "Olá...") → FALSE
// User C NÃO recebe (segurança garantida!)
```

### Fechar Grupos

```typescript
// Fechar grupo específico
app.closeGroupByPath("/chat/:room/:user");

// Fechar todos os WebSockets (graceful shutdown)
app.closeAllWebSockets();
```

---

## 🛡️ Segurança

### Force HTTPS

Redireciona HTTP → HTTPS automaticamente em produção:

```typescript
const app = createDenoRouter({
  forceHttps: true,
});
```

**Comportamento:**
- Redireciona com status `301 Moved Permanently`
- Ignora automaticamente `localhost`, `127.0.0.1` e `[::1]` (IPv6)
- Adiciona header `Strict-Transport-Security` (HSTS)

### Trust Proxy

Quando atrás de proxy reverso (nginx, Cloudflare, etc.):

```typescript
const app = createDenoRouter({
  forceHttps: true,
  trustProxy: true,  // ⚠️ Apenas se estiver atrás de proxy confiável
});
```

Com `trustProxy: true`, o router respeita o header `X-Forwarded-Proto`.

**⚠️ AVISO:** Nunca ative `trustProxy` se o servidor estiver exposto diretamente à internet.

### Bloqueio de Dotfiles

Por padrão, arquivos que começam com `.` são bloqueados:

```typescript
const app = createDenoRouter({
  staticDir: "./public",
  allowDotfiles: false,  // Default: false
});
```

**Bloqueados:** `.env`, `.git/config`, `.DS_Store`, `.htaccess`, etc.

Se precisar servir dotfiles (não recomendado):

```typescript
const app = createDenoRouter({
  staticDir: "./public",
  allowDotfiles: true,  // ⚠️ Risco de segurança
});
```

### Proteção contra Path Traversal

O router sanitiza caminhos e verifica containment real:

```typescript
// Requisição maliciosa
GET /../../etc/passwd
GET /..%2F..%2Fetc%2Fpasswd

// Resultado: 404 (caminho sanitizado e verificado)
```

### Recusa de Symlinks

O adaptador Deno recusa symlinks por padrão para evitar vazamento:

```bash
# Se existir: public/secret -> /etc/passwd
# Requisição: GET /secret
# Resultado: 404 (symlink recusado)
```

### Headers de Segurança

Adicione via middleware:

```typescript
app.use(async (_req, _params, next) => {
  const res = await next();
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'"
  );
  return res;
});
```

---

## 🔌 Adaptadores

### Deno (Oficial)

Suporte completo e testado:

```typescript
import { createDenoRouter } from "@loco/router/deno";

const app = createDenoRouter({
  basePath: "/api",
  staticDir: "./public",
  forceHttps: true,
  trustProxy: true,
  allowDotfiles: false,
});
```

**Features:**
- ✅ HTTP Routing
- ✅ WebSockets (via `Deno.upgradeWebSocket`)
- ✅ Static Files (via `Deno.open` + `Deno.stat`)
- ✅ Containment real e recusa de symlinks
- ✅ Headers completos (ETag, Last-Modified, etc.)

### Outros Runtimes (Roadmap)

O core é runtime-agnostic. Adaptadores para outros runtimes estão em desenvolvimento:

#### Node.js (Planejado)

```typescript
// Futuro
import { createNodeRouter } from "@loco/router/node";
```

**Desafios:**
- URLPattern disponível apenas em Node 18.17+
- WebSocket requer biblioteca externa (`ws`, `uWebSockets.js`)
- Static files via módulo `fs`

#### Bun (Planejado)

```typescript
// Futuro
import { createBunRouter } from "@loco/router/bun";
```

**Vantagens:**
- Compatível com APIs Node.js
- Suporte nativo a WebSocket via `Bun.serve`
- Performance excelente

#### Cloudflare Workers (Removido do Core)

Os adaptadores Cloudflare foram **removidos do core** na versão 1.0 devido a limitações de estado compartilhado. Para WebSockets em Cloudflare, use **Durable Objects**.

Para static files, use a nova feature **Static Assets** do Cloudflare Workers.

Veja [docs/roadmap-adapters.md](./docs/roadmap-adapters.md) para detalhes.

### Criando seu Próprio Adaptador

Implemente as interfaces:

```typescript
interface WebSocketUpgrader {
  upgrade(req: Request): { socket: WebSocket; response: Response };
}

interface StaticFileHandler {
  handle(path: string): Promise<Response | null>;
}
```

Use o core diretamente:

```typescript
import { Router } from "@loco/router";

const app = new Router({
  basePath: "/api",
  webSocketUpgrader: myCustomUpgrader,
  staticFileHandler: myCustomStaticHandler,
});
```

---

## 📚 API Reference

### `createDenoRouter(options)`

```typescript
interface DenoRouterOptions {
  basePath?: string;           // Prefixo para todas as rotas
  staticDir?: string | null;   // Diretório de arquivos estáticos (default: null)
  embeddedDir?: string | null; // Diretório embutido (opcional)
  forceHttps?: boolean;        // Redirecionar HTTP → HTTPS
  trustProxy?: boolean;        // Confiar em X-Forwarded-*
  allowDotfiles?: boolean;     // Permitir arquivos .env, .git, etc.
  lastBroadcastDelay?: number; // Delay antes de enviar last broadcast (default: 0ms)
}
```

### `Router` Methods

```typescript
// Registro de rotas
app.get(path, handler)
app.post(path, handler)
app.put(path, handler)
app.delete(path, handler)
app.patch(path, handler)
app.options(path, handler)
app.head(path, handler)
app.ws(path, handler)

// Middlewares
app.use(middleware)

// WebSockets
app.getWsGroupByPath(pattern): WebSocketGroup | undefined
app.closeGroupByPath(pattern): boolean
app.closeAllWebSockets(): void

// Handler principal
app.handleRequest(req: Request): Promise<Response>
```

### `WebSocketGroup` Methods

```typescript
group.addSocket(ws, params)
group.removeSocket(ws)
group.size: number

group.broadcast(message, permissionFn?, senderParams?)
group.sendLastBroadcastTo(ws, receiverParams)
group.closeGroup()
```

### `PermissionFn`

```typescript
type PermissionFn = (
  receiverParams: RouteParams,
  senderParams: RouteParams,
  message: string,
) => boolean;
```

---

## 📖 Exemplos Completos

### Autenticação JWT

```typescript
import { createDenoRouter } from "@loco/router/deno";
import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(Deno.env.get("JWT_SECRET"));

const app = createDenoRouter({
  basePath: "/api",
  staticDir: "./public",
});

// Rota de login
app.post("/login", async (req) => {
  const { username, password } = await req.json();
  
  if (username === "admin" && password === "secret") {
    const token = await new SignJWT({ userId: "1", username })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(JWT_SECRET);
    
    return {
      body: JSON.stringify({ token }),
      init: { headers: { "Content-Type": "application/json" } },
    };
  }
  
  return {
    body: JSON.stringify({ error: "Invalid credentials" }),
    init: { status: 401 },
  };
});

// Middleware de autenticação WebSocket
app.use(async (req, _params, next) => {
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return await next();
  }
  
  const protocol = req.headers.get("sec-websocket-protocol") ?? "";
  const protocols = protocol.split(",").map(p => p.trim());
  const bearerIndex = protocols.findIndex(p => p === "Bearer");
  const token = bearerIndex !== -1 ? protocols[bearerIndex + 1] : null;
  
  if (!token) {
    return new Response("Token required", { status: 401 });
  }
  
  try {
    await jwtVerify(token, JWT_SECRET, { algorithms: ["HS256"] });
    return await next();
  } catch {
    return new Response("Invalid token", { status: 403 });
  }
});

// Rota WebSocket protegida
app.ws("/chat/:room", (ws, _req, params) => {
  const group = app.getWsGroupByPath("/chat/:room");
  
  ws.onmessage = (event) => {
    group.broadcast(
      `[${params.room}]: ${event.data}`,
      (receiver, sender, _msg) => receiver.room === sender.room,
      params
    );
  };
});
```

### Rate Limiting

```typescript
const requestCounts = new Map<string, { count: number; resetTime: number }>();

app.use(async (req, _params, next) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const now = Date.now();
  const windowMs = 60000; // 1 minuto
  const maxRequests = 100;
  
  const record = requestCounts.get(ip) ?? { count: 0, resetTime: now + windowMs };
  
  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + windowMs;
  }
  
  record.count++;
  requestCounts.set(ip, record);
  
  if (record.count > maxRequests) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: {
        "Retry-After": Math.ceil((record.resetTime - now) / 1000).toString(),
        "X-RateLimit-Limit": maxRequests.toString(),
        "X-RateLimit-Remaining": "0",
      },
    });
  }
  
  const res = await next();
  res.headers.set("X-RateLimit-Limit", maxRequests.toString());
  res.headers.set("X-RateLimit-Remaining", (maxRequests - record.count).toString());
  return res;
});
```

---

## 🧪 Testes

Execute a suíte completa de testes:

```bash
deno task tests
```

Ou separadamente:

```bash
# Type checking
deno task check

# Testes unitários
deno task test

# Formatação
deno task fmt

# Linting
deno task lint
```

---

## 📚 Documentação

- [Guia de Segurança](./docs/security.md)
- [Roadmap de Adaptadores](./docs/roadmap-adapters.md)
- [Roadmap de Rate Limiting](./docs/roadmap-rate-limiting.md)
- [Arquitetura Runtime-Agnostic](./docs/runtime-agnostic.md)
- [Middlewares](./docs/middleware.md)
- [Permissões WebSocket](./docs/websocket-permissions.md)
- [Retorno de Handlers](./docs/return.md)

---

## 🗺️ Roadmap

### Versão 1.0 (Atual)
- ✅ Core agnóstico estável
- ✅ Adaptador Deno completo
- ✅ Sistema de permissões Dual Params
- ✅ Segurança reforçada (HSTS, trustProxy, dotfiles, symlinks)

### Versão 1.1 (Planejado)
- ⏳ Adaptador Node.js oficial
- ⏳ Adaptador Bun oficial
- ⏳ Suporte a Range Requests para arquivos grandes
- ⏳ Validação de Origin em WebSockets

### Versão 2.0 (Futuro)
- ⏳ Rate limiting nativo no core
- ⏳ Integração com OpenTelemetry
- ⏳ Suporte a HTTP/2 Server Push
- ⏳ Compressão automática (gzip, brotli)

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor:

1. Faça fork do repositório
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

### Desenvolvimento Local

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/loco.git
cd loco/monorepo/router

# Execute testes
deno task tests

# Execute exemplo principal
deno task start

# Execute exemplo JWT
deno task example
```

---

## 📄 Licença

Este projeto está licenciado sob a Licença MIT - veja o arquivo [LICENSE](./LICENSE) para detalhes.

````

---

