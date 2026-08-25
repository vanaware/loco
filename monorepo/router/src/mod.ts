// monorepo/router/src/mod.ts
import { contentType } from "@std/media-types";
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
  private webSockets = new Map<WebSocket, { group: WebSocketGroup }>();
  private staticDir: string | null;
  private embeddedDir: string | null;
  private mimeTypeResolver: MimeTypeResolver;

  constructor(
    basePath = "",
    staticDir: string | null = "public",
    embeddedDir: string | null = null,
    mimeTypeResolver: MimeTypeResolver = defaultMimeTypeResolver,
  ) {
    this.basePath = this.normalizeBasePath(basePath);
    this.staticDir = staticDir;
    this.embeddedDir = embeddedDir;
    this.mimeTypeResolver = mimeTypeResolver;
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

  private addHttpRoute(method: string, path: string, handler: HttpHandler) {
    const patternPath = this.normalizePath(path);
    const pattern = new URLPattern({ pathname: patternPath });
    this.httpRoutes.push({ method: method.toUpperCase(), pattern, handler });
  }

  private addWsRoute(path: string, handler: WsHandler) {
    const patternPath = this.normalizePath(path);
    const pattern = new URLPattern({ pathname: patternPath });
    const group = new WebSocketGroup();
    this.wsRoutes.push({ pattern, handler, group });
  }

  get(path: string, handler: HttpHandler) { this.addHttpRoute("GET", path, handler); }
  post(path: string, handler: HttpHandler) { this.addHttpRoute("POST", path, handler); }
  put(path: string, handler: HttpHandler) { this.addHttpRoute("PUT", path, handler); }
  delete(path: string, handler: HttpHandler) { this.addHttpRoute("DELETE", path, handler); }
  patch(path: string, handler: HttpHandler) { this.addHttpRoute("PATCH", path, handler); }
  options(path: string, handler: HttpHandler) { this.addHttpRoute("OPTIONS", path, handler); }
  head(path: string, handler: HttpHandler) { this.addHttpRoute("HEAD", path, handler); }
  ws(path: string, handler: WsHandler) { this.addWsRoute(path, handler); }

  async handleRequest(req: Request): Promise<Response> {
    if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
      return this.handleWsUpgrade(req);
    }
    return this.handleHttpRequest(req);
  }

  private async handleHttpRequest(req: Request): Promise<Response> {
    const { method } = req;
    const adjustedUrl = new URL(req.url);
    adjustedUrl.pathname = this.stripBase(adjustedUrl.pathname);

    for (const route of this.httpRoutes) {
      if (route.method !== method.toUpperCase()) continue;
      const match = route.pattern.exec(adjustedUrl);
      if (match) {
        const params = this.extractParams(match.pathname.groups);
        const result = await route.handler(req, params);
        
        const isHead = method.toUpperCase() === "HEAD";
        const isNullBodyStatus = result.init?.status && [101, 204, 205, 304].includes(result.init.status);
        const finalBody = (isHead || isNullBodyStatus) ? null : result.body;
        
        return new Response(finalBody, result.init);
      }
    }
    return this.handleStaticFile(req);
  }

  private async handleWsUpgrade(req: Request): Promise<Response> {
    const adjustedUrl = new URL(req.url);
    adjustedUrl.pathname = this.stripBase(adjustedUrl.pathname);

    for (const route of this.wsRoutes) {
      const match = route.pattern.exec(adjustedUrl);
      if (match) {
        const { socket, response } = Deno.upgradeWebSocket(req);
        const params = this.extractParams(match.pathname.groups);

        route.group.addSocket(socket, params);
        this.webSockets.set(socket, { group: route.group });
        
        route.group.sendLastBroadcastTo(socket, params);
        
        route.handler(socket, req, params);

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
    }
    return new Response("WebSocket Not Found", { status: 404 });
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

  private async tryServeEmbedded(pathname: string): Promise<Response | null> {
    if (!this.embeddedDir) return null;
    const candidates = this.buildFileCandidates(this.embeddedDir, pathname);
    for (const candidate of candidates) {
      try {
        const content = await Deno.readTextFile(candidate);
        const ext = candidate.split(".").pop()?.toLowerCase() ?? "";
        return new Response(content, {
          headers: { "Content-Type": this.mimeTypeResolver(ext) ?? "application/octet-stream" },
        });
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
        // ✅ DUAL PARAMS: receiver (novo membro) e sender (original)
        if (!permissionFn || permissionFn(receiverParams, senderParams, message)) {
          ws.send(message);
        }
      }
    }, 50);
  }

  broadcast(message: string, permissionFn?: PermissionFn, senderParams?: RouteParams) {
    this.lastBroadcast = {
      message,
      permissionFn,
      senderParams: senderParams ?? {},
    };

    for (const [socket, receiverParams] of this.sockets.entries()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      // ✅ DUAL PARAMS: receiver (destinatário) e sender (remetente)
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