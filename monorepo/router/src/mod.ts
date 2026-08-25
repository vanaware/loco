// monorepo/router/src/mod.ts
import { join, normalize } from "@std/path";

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

// ✅ DUAL PARÂMETROS: receiverParams, senderParams e message
export type PermissionFn = (
  receiverParams: RouteParams,
  senderParams: RouteParams,
  message: string,
) => boolean;

export type MimeTypeResolver = (ext: string) => string | undefined;

// ✅ MIDDLEWARE: Suporte a Request modificada via next(newReq)
// - Retorne uma Response para ABORTAR o fluxo (ex: 401, 403)
// - Chame next() para CONTINUAR (opcionalmente com nova Request)
export type Middleware = (
  req: Request,
  params: RouteParams,
  next: (newReq?: Request) => Promise<Response>,
) => Promise<Response> | Response;

export const DEFAULT_LAST_BROADCAST_DELAY = 50;

export interface RouterOptions {
  basePath?: string;
  staticDir?: string | null;
  embeddedDir?: string | null;
  mimeTypeResolver?: MimeTypeResolver;
  forceHttps?: boolean;
  lastBroadcastDelay?: number;
}

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

export class Router {
  private basePath: string;
  private httpRoutes: HttpRoute[] = [];
  private wsRoutes: WsRoute[] = [];
  private middlewares: Middleware[] = [];
  private webSockets = new Map<WebSocket, { group: WebSocketGroup }>();
  private staticDir: string | null;
  private embeddedDir: string | null;
  private mimeTypeResolver: MimeTypeResolver;
  public forceHttps: boolean;
  private lastBroadcastDelay: number;

  constructor(
    basePathOrOptions: string | RouterOptions = "",
    staticDir: string | null = "public",
    embeddedDir: string | null = null,
    mimeTypeResolver: MimeTypeResolver = defaultMimeTypeResolver,
    forceHttps: boolean | undefined = undefined,
    lastBroadcastDelay: number = DEFAULT_LAST_BROADCAST_DELAY,
  ) {
    let basePath: string;
    if (typeof basePathOrOptions === "object") {
      const opts = basePathOrOptions;
      basePath = opts.basePath ?? "";
      this.staticDir = opts.staticDir ?? "public";
      this.embeddedDir = opts.embeddedDir ?? null;
      this.mimeTypeResolver = opts.mimeTypeResolver ?? defaultMimeTypeResolver;
      this.forceHttps = opts.forceHttps ?? this.getDefaultForceHttps();
      this.lastBroadcastDelay = opts.lastBroadcastDelay ?? DEFAULT_LAST_BROADCAST_DELAY;
    } else {
      basePath = basePathOrOptions;
      this.staticDir = staticDir;
      this.embeddedDir = embeddedDir;
      this.mimeTypeResolver = mimeTypeResolver;
      this.forceHttps = forceHttps ?? this.getDefaultForceHttps();
      this.lastBroadcastDelay = lastBroadcastDelay;
    }
    this.basePath = this.normalizeBasePath(basePath);
  }

  private getDefaultForceHttps(): boolean {
    try {
      return Deno.env.get("FORCE_HTTPS")?.toLowerCase() === "true";
    } catch {
      return false;
    }
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
    
    // ✅ CORREÇÃO: Suporte a múltiplos proxies (ex: "https, http")
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

  use(middleware: Middleware) {
    this.middlewares.push(middleware);
  }

  get(path: string, handler: HttpHandler) { this.addHttpRoute("GET", path, handler); }
  post(path: string, handler: HttpHandler) { this.addHttpRoute("POST", path, handler); }
  put(path: string, handler: HttpHandler) { this.addHttpRoute("PUT", path, handler); }
  delete(path: string, handler: HttpHandler) { this.addHttpRoute("DELETE", path, handler); }
  patch(path: string, handler: HttpHandler) { this.addHttpRoute("PATCH", path, handler); }
  options(path: string, handler: HttpHandler) { this.addHttpRoute("OPTIONS", path, handler); }
  head(path: string, handler: HttpHandler) { this.addHttpRoute("HEAD", path, handler); }
  ws(path: string, handler: WsHandler) { this.addWsRoute(path, handler); }

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
  ): Promise<Response> {
    try {
      const result = await route.handler(req, params);
      const isHead = req.method.toUpperCase() === "HEAD";
      const isNullBodyStatus = result.init?.status && [101, 204, 205, 304].includes(result.init.status);
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
    const { socket, response } = Deno.upgradeWebSocket(req);
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
    
    // 2. Cadeia de Middlewares (Executa MESMO se found for null/404)
    let index = 0;
    let currentReq = req;
    
    const executeChain = async (): Promise<Response> => {
      if (index < this.middlewares.length) {
        const mw = this.middlewares[index++];
        if (!mw) {
          return this.executeFinalHandler(currentReq, isWs, found);
        }
        let nextHasBeenCalled = false;
        try {
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
      // Fim da cadeia
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

  closeAllWebSockets() {
    for (const [socket] of this.webSockets.entries()) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close(1001, "Server is shutting down");
      }
    }
    this.webSockets.clear();
  }

  private async handleStaticFile(req: Request): Promise<Response> {
    if (this.staticDir === null && this.embeddedDir === null) {
      return new Response("Not Found", { status: 404 });
    }
    const { pathname } = new URL(req.url);
    const adjustedPathname = this.stripBase(pathname);
    const safePath = normalize(adjustedPathname).replace(/^(\.\.[/\\])+/, "");
    
    if (this.embeddedDir !== null) {
      const embedded = await this.tryServeEmbedded(safePath);
      if (embedded) return embedded;
    }
    if (this.staticDir !== null) {
      const staticResp = await this.tryServeStatic(safePath);
      if (staticResp) return staticResp;
    }
    return new Response("Not Found", { status: 404 });
  }

  // ✅ CORREÇÃO: Usa stat + stream para suportar binários (wasm, imagens, etc)
  private async tryServeEmbedded(pathname: string): Promise<Response | null> {
    if (!this.embeddedDir) return null;
    const candidates = this.buildFileCandidates(this.embeddedDir, pathname);
    for (const candidate of candidates) {
      try {
        const info = await Deno.stat(candidate);
        if (info.isFile) {
          return this.serveFileWithMimeType(candidate);
        }
      } catch (err) {
        if (!(err instanceof Deno.errors.NotFound)) {
          console.error(`Embedded file error: ${candidate}`, err);
          return new Response("Internal Server Error", { status: 500 });
        }
      }
    }
    return null;
  }

  private async tryServeStatic(pathname: string): Promise<Response | null> {
    if (!this.staticDir) return null;
    const candidates = this.buildFileCandidates(this.staticDir, pathname);
    for (const candidate of candidates) {
      try {
        const info = await Deno.stat(candidate);
        if (info.isFile) {
          return this.serveFileWithMimeType(candidate);
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

  private buildFileCandidates(baseDir: string, pathname: string): string[] {
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

  private async serveFileWithMimeType(filePath: string): Promise<Response> {
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    const mimeType = this.mimeTypeResolver(ext) ?? "application/octet-stream";
    const file = await Deno.open(filePath);
    return new Response(file.readable, {
      headers: { "Content-Type": mimeType },
    });
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