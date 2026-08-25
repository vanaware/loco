> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém os arquivos de configuração e execução do ROUTER @loco/router
> O projeto é o **Loco ** estruturado em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco - Modo: ROUTER

Gerado automaticamente em: 8/24/2026, 10:54:14 PM

---

## Arquivo: `monorepo/router/src/mod.ts`

```ts
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

export type PermissionFn = (
  params: RouteParams,
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

  sendLastBroadcastTo(ws: WebSocket, params: RouteParams) {
    const broadcast = this.lastBroadcast;
    if (!broadcast) return;
    
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        const { message, permissionFn } = broadcast;
        // ✅ CORREÇÃO: Avalia a permissão com os parâmetros do NOVO membro (params), 
        // não com os do remetente original.
        if (!permissionFn || permissionFn(params, message)) {
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

    for (const [socket, params] of this.sockets.entries()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      if (!permissionFn || permissionFn(params, message)) {
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
```

---

## Arquivo: `monorepo/router/example/principal/main.ts`

```ts
// monorepo/router/example/main.ts
import { Router } from "../../src/mod.ts";

const app = new Router("/api", "./public", null);

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
// WebSocket com broadcast inteligente
// ============================================================
app.ws("/chat/:room/:user", (ws, _req, params) => {
  const room = params.room as string;
  const user = params.user as string;
  console.log(`[WS] ✅ ${user} entrou na sala ${room}`);

  // ✅ NOVA VERSÃO MAIS SEGURA E DINÂMICA:
  // O getWsGroupByPath agora usa URLPattern.test(), então podemos passar 
  // tanto o pattern exato ("/chat/:room/:user") quanto um caminho concreto 
  // derivado dos parâmetros ("/chat/" + room + "/:user"). Ambos funcionarão!
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
      (clientParams) => clientParams.room === room,
      params, // Passamos os params do sender para reavaliação em novos membros
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
// Exemplo: fechar grupo após 30s (usando API pública)
// ============================================================
setTimeout(() => {
  if (app.closeGroupByPath("/chat/:room/:user")) {
    console.log("🔒 Grupo de chat fechado após 30s.");
  }
}, 30000);
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
// monorepo/router/example/main.ts
import { Router } from "../../src/mod.ts";
import { SignJWT, jwtVerify } from "https://deno.land/x/jose@v5.2.0/index.ts";

const JWT_SECRET = "meu-segredo-super-secreto-123";
const encoder = new TextEncoder();

const app = new Router("/api", "./public", null);

// ============================================================
// 1. Rota HTTP para gerar o Token (Login)
// ============================================================
app.post("/login", async (req) => {
  const { username, password } = await req.json();

  if (username !== "admin" || password !== "123") {
    return {
      body: JSON.stringify({ error: "Credenciais inválidas" }),
      init: { status: 401, headers: { "Content-Type": "application/json" } },
    };
  }

  const token = await new SignJWT({ username, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(encoder.encode(JWT_SECRET));

  return {
    body: JSON.stringify({ token, username }),
    init: { headers: { "Content-Type": "application/json" } },
  };
});

// ============================================================
// 2. Rota WebSocket Protegida por JWT via Subprotocol
// ============================================================
app.ws("/chat/:room", async (ws, req, params) => {
  const room = params.room as string;
  
  // ✅ Extrai o token do header Sec-WebSocket-Protocol
  // O cliente envia: ["Bearer", "eyJ..."]
  // O servidor recebe: "Bearer, eyJ..."
  const protocolHeader = req.headers.get("sec-websocket-protocol") ?? "";
  const protocols = protocolHeader.split(",").map(p => p.trim());
  
  // Procura pelo protocolo "Bearer" e pega o token que vem depois
  const bearerIndex = protocols.findIndex(p => p === "Bearer");
  const token = bearerIndex !== -1 ? protocols[bearerIndex + 1] : null;

  if (!token) {
    console.error("[WS] ❌ Token ausente no subprotocol");
    ws.close(4001, "Token de autenticação ausente");
    return;
  }

  try {
    // Verifica a validade e a assinatura do JWT
    const { payload } = await jwtVerify(token, encoder.encode(JWT_SECRET));
    const user = payload.username as string;
    const role = payload.role as string;
    
    console.log(`[WS] ✅ Usuário autenticado: ${user} (${role}) entrou na sala ${room}`);

    ws.onmessage = (event) => {
      console.log(`[WS] 💬 ${user} em ${room}: ${event.data}`);
      ws.send(`[${user}]: ${event.data}`);
    };

    ws.onclose = () => {
      console.log(`[WS] ❌ ${user} saiu da sala ${room}`);
    };

  } catch (error) {
// ✅ CORREÇÃO: Trata o erro como 'unknown' de forma segura
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[WS] Falha na autenticação:", errorMessage);
    ws.close(4002, "Token inválido ou expirado");
  }
});

// ============================================================
// Inicia o servidor
// ============================================================
const server = Deno.serve({ port: 8000 }, app.handleRequest.bind(app));
console.log("🚀 Servidor rodando em http://localhost:8000");
console.log("📡 Login:   POST http://localhost:8000/api/login");
console.log("🔌 WS:      ws://localhost:8000/api/chat/geral (com subprotocol Bearer)");
```

---

## Arquivo: `monorepo/router/tests/router_http_test.ts`

```ts
// monorepo/router/tests/router_http_test.ts
import { assertEquals } from "@std/assert";
import { Router } from "../src/mod.ts";

Deno.test("GET rota simples retorna body correto", async () => {
  const app = new Router("", null, null);
  app.get("/hello", () => ({ body: "world" }));

  const req = new Request("http://localhost/hello");
  const res = await app.handleRequest(req);
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "world");
});

Deno.test("GET com parâmetros nomeados", async () => {
  const app = new Router("", null, null);
  app.get("/users/:id", (_req, params) => ({
    body: JSON.stringify({ id: params.id }),
  }));

  const req = new Request("http://localhost/users/42");
  const res = await app.handleRequest(req);
  assertEquals(await res.json(), { id: "42" });
});

Deno.test("GET com múltiplos parâmetros", async () => {
  const app = new Router("", null, null);
  app.get("/a/:x/b/:y", (_req, params) => ({
    body: JSON.stringify(params),
  }));

  const req = new Request("http://localhost/a/1/b/2");
  const res = await app.handleRequest(req);
  assertEquals(await res.json(), { x: "1", y: "2" });
});

Deno.test("POST retorna 201", async () => {
  const app = new Router("", null, null);
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
  const app = new Router("/api", null, null);
  app.get("/ping", () => ({ body: "pong" }));

  const req = new Request("http://localhost/api/ping");
  const res = await app.handleRequest(req);
  assertEquals(await res.text(), "pong");
});

Deno.test("Rota inexistente retorna 404 (sem static)", async () => {
  const app = new Router("", null, null);
  app.get("/exists", () => ({ body: "ok" }));

  const req = new Request("http://localhost/nope");
  const res = await app.handleRequest(req);
  assertEquals(res.status, 404);
});

Deno.test("Método HTTP errado retorna 404", async () => {
  const app = new Router("", null, null);
  app.get("/only-get", () => ({ body: "ok" }));

  const req = new Request("http://localhost/only-get", { method: "POST" });
  const res = await app.handleRequest(req);
  assertEquals(res.status, 404);
});
```

---

## Arquivo: `monorepo/router/tests/router_catchall_test.ts`

```ts
// monorepo/router/tests/router_catchall_test.ts
import { assertEquals } from "@std/assert";
import { Router } from "../src/mod.ts";

Deno.test("Catch-all com * captura path completo", async () => {
  const app = new Router("", null, null);
  app.get("/files/*", (_req, params) => ({
    body: JSON.stringify(params.catch),
  }));

  const req = new Request("http://localhost/files/docs/readme.md");
  const res = await app.handleRequest(req);
  assertEquals(await res.json(), ["docs/readme.md"]);
});

Deno.test("Catch-all com múltiplos * gera array", async () => {
  const app = new Router("", null, null);
  app.get("/a/*/b/*", (_req, params) => ({
    body: JSON.stringify(params.catch),
  }));

  const req = new Request("http://localhost/a/x/b/y/z");
  const res = await app.handleRequest(req);
  assertEquals(await res.json(), ["x", "y/z"]);
});

Deno.test("Catch-all combinado com parâmetro nomeado", async () => {
  const app = new Router("", null, null);
  app.get("/api/:version/*", (_req, params) => ({
    body: JSON.stringify({ version: params.version, catch: params.catch }),
  }));

  const req = new Request("http://localhost/api/v1/foo/bar");
  const res = await app.handleRequest(req);
  assertEquals(await res.json(), { version: "v1", catch: ["foo/bar"] });
});
```

---

## Arquivo: `monorepo/router/tests/router_static_test.ts`

```ts
// monorepo/router/tests/router_static_test.ts
import { assertEquals } from "@std/assert";
import { Router } from "../src/mod.ts";

Deno.test("serve arquivo estático existente", async () => {
  // Cria arquivo temporário
  const tmpDir = await Deno.makeTempDir();
  await Deno.writeTextFile(`${tmpDir}/hello.txt`, "hello world");

  const app = new Router("", tmpDir, null);
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

  const app = new Router("", tmpDir, null);
  const req = new Request("http://localhost/sub/");
  const res = await app.handleRequest(req);

  assertEquals(res.status, 200);
  assertEquals(await res.text(), "<h1>Hi</h1>");

  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("retorna 404 para arquivo inexistente", async () => {
  const tmpDir = await Deno.makeTempDir();
  const app = new Router("", tmpDir, null);
  const req = new Request("http://localhost/nope.txt");
  const res = await app.handleRequest(req);
  assertEquals(res.status, 404);
  await Deno.remove(tmpDir, { recursive: true });
});
```

---

## Arquivo: `monorepo/router/tests/path_traversal_test.ts`

```ts
// monorepo/router/tests/path_traversal_test.ts
import { assertEquals, assertStringIncludes } from "@std/assert";
import { Router } from "../src/mod.ts";
import { join } from "@std/path";

// Cria estrutura temporária:
//   tmpRoot/
//     secret.txt       <- arquivo "sensível" FORA do staticDir
//     public/
//       hello.txt      <- arquivo legítimo DENTRO do staticDir
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
  try {
    await Deno.remove(path, { recursive: true });
  } catch {
    // ignora
  }
}

Deno.test("Path traversal: ../ não deve escapar do staticDir", async () => {
  const { tmpRoot, publicDir } = await setupFixture();
  try {
    const app = new Router("", publicDir, null);

    // Tenta escapar: /../secret.txt deve ser normalizado para /secret.txt (fora de publicDir)
    const req = new Request("http://localhost/../secret.txt");
    const res = await app.handleRequest(req);
    assertEquals(res.status, 404, "Deve retornar 404 ao tentar path traversal com ..");
    const body = await res.text();
    assertEquals(body.includes("TOP-SECRET-DATA"), false, "NUNCA deve vazar conteúdo do arquivo secreto");
  } finally {
    await cleanup(tmpRoot);
  }
});

Deno.test("Path traversal: múltiplos ../ não escapam", async () => {
  const { tmpRoot, publicDir } = await setupFixture();
  try {
    const app = new Router("", publicDir, null);

    const req = new Request("http://localhost/../../secret.txt");
    const res = await app.handleRequest(req);
    assertEquals(res.status, 404);
    const body = await res.text();
    assertEquals(body.includes("TOP-SECRET-DATA"), false);
  } finally {
    await cleanup(tmpRoot);
  }
});

Deno.test("Path traversal: /subdir/../../secret.txt não escapa", async () => {
  const { tmpRoot, publicDir } = await setupFixture();
  try {
    const app = new Router("", publicDir, null);

    const req = new Request("http://localhost/subdir/../../secret.txt");
    const res = await app.handleRequest(req);
    assertEquals(res.status, 404);
    const body = await res.text();
    assertEquals(body.includes("TOP-SECRET-DATA"), false);
  } finally {
    await cleanup(tmpRoot);
  }
});

Deno.test("Path traversal: URL-encoded ..%2F não escapa", async () => {
  const { tmpRoot, publicDir } = await setupFixture();
  try {
    const app = new Router("", publicDir, null);

    // URL com .. codificado
    const req = new Request("http://localhost/..%2Fsecret.txt");
    const res = await app.handleRequest(req);
    // O Deno/URL já decodifica, então deve cair no mesmo caso de traversal
    assertEquals(res.status, 404);
    const body = await res.text();
    assertEquals(body.includes("TOP-SECRET-DATA"), false);
  } finally {
    await cleanup(tmpRoot);
  }
});

Deno.test("Path traversal: backslash (Windows-style) não escapa", async () => {
  const { tmpRoot, publicDir } = await setupFixture();
  try {
    const app = new Router("", publicDir, null);

    const req = new Request("http://localhost/..\\secret.txt");
    const res = await app.handleRequest(req);
    // Deve ser tratado como path inválido ou 404
    const body = await res.text();
    assertEquals(body.includes("TOP-SECRET-DATA"), false);
  } finally {
    await cleanup(tmpRoot);
  }
});

Deno.test("Path traversal: basePath não é bypassado", async () => {
  const { tmpRoot, publicDir } = await setupFixture();
  try {
    const app = new Router("/api", publicDir, null);

    // Tenta bypassar o basePath com ..
    const req = new Request("http://localhost/api/../secret.txt");
    const res = await app.handleRequest(req);
    const body = await res.text();
    assertEquals(body.includes("TOP-SECRET-DATA"), false);
  } finally {
    await cleanup(tmpRoot);
  }
});

Deno.test("Arquivo legítimo dentro do staticDir é servido normalmente", async () => {
  const { tmpRoot, publicDir } = await setupFixture();
  try {
    const app = new Router("", publicDir, null);

    const req = new Request("http://localhost/hello.txt");
    const res = await app.handleRequest(req);
    assertEquals(res.status, 200);
    assertEquals(await res.text(), "hello world");
  } finally {
    await cleanup(tmpRoot);
  }
});

Deno.test("Arquivo legítimo em subpasta é servido", async () => {
  const tmpRoot = await Deno.makeTempDir({ prefix: "router_sub_" });
  const publicDir = join(tmpRoot, "public");
  const subDir = join(publicDir, "docs");
  await Deno.mkdir(subDir, { recursive: true });
  await Deno.writeTextFile(join(subDir, "readme.txt"), "readme content");

  try {
    const app = new Router("", publicDir, null);
    const req = new Request("http://localhost/docs/readme.txt");
    const res = await app.handleRequest(req);
    assertEquals(res.status, 200);
    assertEquals(await res.text(), "readme content");
  } finally {
    await cleanup(tmpRoot);
  }
});
```

---

## Arquivo: `monorepo/router/tests/router_http_methods_test.ts`

```ts
// monorepo/router/tests/router_http_methods_test.ts
import { assertEquals, assertExists } from "@std/assert";
import { Router } from "../src/mod.ts";

// ============================================================
// Testes para método OPTIONS (CORS preflight)
// ============================================================

Deno.test("OPTIONS retorna headers CORS corretos", async () => {
  const app = new Router("", null, null);
  
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
  const app = new Router("", null, null);
  
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
  const app = new Router("", null, null);
  
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
  const app = new Router("", null, null);
  
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
  const app = new Router("", null, null);
  
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
  const app = new Router("", null, null);
  
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
  const app = new Router("", null, null);
  
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
  const app = new Router("", null, null);
  
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
  const app = new Router("", null, null);
  
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
  const app = new Router("", null, null);
  
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
  const app = new Router("", null, null);
  
  app.get("/only-get", () => ({ body: "ok" }));

  const req = new Request("http://localhost/only-get", {
    method: "POST",
  });
  const res = await app.handleRequest(req);
  
  assertEquals(res.status, 404);
});

Deno.test("PUT em rota GET retorna 404", async () => {
  const app = new Router("", null, null);
  
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
  const app = new Router("/api", null, null);
  
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
  const app = new Router("/api/v1", null, null);
  
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
  const app = new Router("", null, null);
  
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

## Arquivo: `monorepo/router/tests/websocket_real_test.ts`

```ts
// monorepo/router/tests/websocket_real_test.ts
import { assertEquals, assertExists } from "@std/assert";
import { Router } from "../src/mod.ts";

// Helper: aguarda até que uma condição seja verdadeira ou timeout
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

// Helper: inicia servidor em porta aleatória disponível
async function startServer(app: Router): Promise<{ server: Deno.HttpServer; port: number }> {
  const controller = new AbortController();
  const server = Deno.serve(
    { port: 0, signal: controller.signal, onListen: () => {} },
    app.handleRequest.bind(app),
  );
  // Aguarda o servidor ficar pronto e descobre a porta
  const addr = server.addr;
  return { server, port: addr.port };
}

Deno.test("WebSocket real: conexão, broadcast e last broadcast para novo membro", async () => {
  const app = new Router("/api", null, null);
  const receivedByUser1: string[] = [];
  const receivedByUser2: string[] = [];

  app.ws("/chat/:room/:user", (ws, _req, params) => {
    const room = params.room as string;
    const user = params.user as string;
    const group = app.getWsGroupByPath("/chat/:room/:user");
    if (!group) {
      ws.close(1011, "No group");
      return;
    }

    ws.onmessage = (event) => {
      // Cada usuário faz broadcast filtrando pela própria sala
      group.broadcast(
        `[${user}]: ${event.data}`,
        (clientParams) => clientParams.room === room,
        params,
      );
    };
  });

  const { server, port } = await startServer(app);

  try {
    // Conecta user1
    const ws1 = new WebSocket(`ws://localhost:${port}/api/chat/roomA/user1`);
    await waitFor(() => ws1.readyState === WebSocket.OPEN);
    assertEquals(ws1.readyState, WebSocket.OPEN, "user1 deve conectar");
    ws1.onmessage = (e) => receivedByUser1.push(e.data);

    // Conecta user2 na mesma sala
    const ws2 = new WebSocket(`ws://localhost:${port}/api/chat/roomA/user2`);
    await waitFor(() => ws2.readyState === WebSocket.OPEN);
    assertEquals(ws2.readyState, WebSocket.OPEN, "user2 deve conectar");
    ws2.onmessage = (e) => receivedByUser2.push(e.data);

    // Aguarda ambos estabilizarem
    await new Promise((r) => setTimeout(r, 100));

    // user1 envia mensagem -> user2 deve receber
    ws1.send("hello from user1");
    await waitFor(() => receivedByUser2.length >= 1);
    assertEquals(receivedByUser2[0], "[user1]: hello from user1");
    // user1 também recebe (broadcast inclui o sender)
    assertEquals(receivedByUser1[0], "[user1]: hello from user1");

    // Agora conecta user3 -> deve receber o último broadcast automaticamente
    const receivedByUser3: string[] = [];
    const ws3 = new WebSocket(`ws://localhost:${port}/api/chat/roomA/user3`);
    
    // ✅ CORREÇÃO: Atribuir onmessage IMEDIATAMENTE para evitar condição de corrida
    // onde a mensagem chega antes do listener ser registrado.
    ws3.onmessage = (e) => receivedByUser3.push(e.data);
    
    await waitFor(() => ws3.readyState === WebSocket.OPEN);

    // Aguarda o último broadcast chegar ao user3
    const got = await waitFor(() => receivedByUser3.length >= 1, 2000);
    assertEquals(got, true, "user3 deve receber o último broadcast ao conectar");
    assertEquals(receivedByUser3[0], "[user1]: hello from user1");

    // user3 em sala diferente NÃO deve receber broadcast de roomA
    const receivedByUser4: string[] = [];
    const ws4 = new WebSocket(`ws://localhost:${port}/api/chat/roomB/user4`);
    
    ws4.onmessage = (e) => receivedByUser4.push(e.data);
    
    await waitFor(() => ws4.readyState === WebSocket.OPEN);
    await new Promise((r) => setTimeout(r, 200));
    assertEquals(receivedByUser4.length, 0, "user4 em roomB não deve receber broadcast de roomA");

    // Limpa
    ws1.close();
    ws2.close();
    ws3.close();
    ws4.close();
    await new Promise((r) => setTimeout(r, 100));
  } finally {
    app.closeAllWebSockets();
    await server.shutdown();
  }
});

Deno.test("WebSocket real: rota inexistente retorna 404", async () => {
  const app = new Router("/api", null, null);
  app.ws("/exists", () => {});

  const { server, port } = await startServer(app);

  try {
    const ws = new WebSocket(`ws://localhost:${port}/api/nope`);
    const errored = await waitFor(() => ws.readyState === WebSocket.CLOSED, 2000);
    assertEquals(errored, true, "WebSocket deve fechar ao tentar rota inexistente");
  } finally {
    await server.shutdown();
  }
});

Deno.test("WebSocket real: closeGroup fecha todos os sockets do grupo", async () => {
  const app = new Router("/api", null, null);
  app.ws("/chat/:room/:user", () => {});

  const { server, port } = await startServer(app);

  try {
    const ws1 = new WebSocket(`ws://localhost:${port}/api/chat/room1/user1`);
    const ws2 = new WebSocket(`ws://localhost:${port}/api/chat/room1/user2`);
    await waitFor(() => ws1.readyState === WebSocket.OPEN && ws2.readyState === WebSocket.OPEN);

    // Fecha o grupo
    const closed = app.closeGroupByPath("/chat/:room/:user");
    assertEquals(closed, true);

    // Ambos devem fechar
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

// Mock simples de WebSocket para testes
class MockWebSocket {
  readyState: number = 1; // WebSocket.OPEN
  sent: string[] = [];

  send(data: string | ArrayBuffer | Blob) {
    if (typeof data === "string") {
      this.sent.push(data);
    }
  }

  close(code?: number, reason?: string) {
    this.readyState = 3; // WebSocket.CLOSED
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

  group.broadcast("only-A", (p) => p.room === "A");

  assertEquals(ws1.sent, ["only-A"]);
  assertEquals(ws2.sent, []);
});

Deno.test("novo membro recebe último broadcast ao entrar", async () => {
  const group = new WebSocketGroup();
  const ws1 = new MockWebSocket();
  
  group.addSocket(ws1 as unknown as WebSocket, { room: "A" });
  group.broadcast("first-msg", undefined, { room: "A" });

  // Novo membro entra
  const ws2 = new MockWebSocket();
  group.addSocket(ws2 as unknown as WebSocket, { room: "A" });
  group.sendLastBroadcastTo(ws2 as unknown as WebSocket, { room: "A" });

  // ✅ CORREÇÃO: Aguarda o delay do setTimeout interno (50ms) + margem de segurança
  await new Promise((resolve) => setTimeout(resolve, 100));

  assertEquals(ws2.sent, ["first-msg"]);
});

// ✅ NOVO TESTE: Garante que a correção de permissão funcione para salas diferentes
Deno.test("novo membro em sala diferente NÃO recebe último broadcast", async () => {
  const group = new WebSocketGroup();
  const ws1 = new MockWebSocket();
  
  group.addSocket(ws1 as unknown as WebSocket, { room: "A" });
  group.broadcast("first-msg", (p) => p.room === "A", { room: "A" });

  // Novo membro em sala B entra
  const ws2 = new MockWebSocket();
  group.addSocket(ws2 as unknown as WebSocket, { room: "B" });
  group.sendLastBroadcastTo(ws2 as unknown as WebSocket, { room: "B" });

  // Aguarda o delay do setTimeout interno (50ms) + margem de segurança
  await new Promise((resolve) => setTimeout(resolve, 100));

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

## Arquivo: `monorepo/router/docs/websocket-permissions.md`

````md
# 📡 Documentação: Permissionamento Inteligente em WebSockets

O `@loco/router` possui um sistema nativo e robusto de permissionamento para WebSockets, permitindo que mensagens de broadcast sejam filtradas dinamicamente com base nos **parâmetros da rota** e no **conteúdo da mensagem**. 

Além disso, o sistema gerencia automaticamente o "Último Broadcast" (Last Broadcast), garantindo que novos membros de um grupo recebam o contexto histórico, respeitando as mesmas regras de permissão.

---

## 🔑 Conceitos Fundamentais

### 1. `RouteParams`
São os parâmetros extraídos da URL quando o cliente se conecta. 
Exemplo: Na rota `/chat/:room/:user`, se a URL for `/chat/lobby/joao`, os parâmetros serão `{ room: "lobby", user: "joao" }`.

### 2. `PermissionFn` (Função de Permissão)
É um callback opcional passado ao método `group.broadcast()`. Sua assinatura é:
```typescript
type PermissionFn = (params: RouteParams, message: string) => boolean;
```
- **`params`**: Os parâmetros da conexão do cliente que está sendo avaliado para receber a mensagem.
- **`message`**: O conteúdo da mensagem sendo enviada.
- **Retorno**: `true` (envia a mensagem) ou `false` (bloqueia a mensagem para este cliente específico).

### 3. `senderParams`
São os parâmetros de quem **originou** a mensagem. O router os armazena automaticamente para que, quando um novo membro entrar, o sistema possa reavaliar se aquele membro tem direito de receber o último broadcast com base no contexto original.

---

## ⚙️ Como Funciona (Fluxo Interno)

1. Um cliente envia uma mensagem via WebSocket.
2. O handler chama `group.broadcast(mensagem, permissionFn, paramsDoSender)`.
3. O router salva essa combinação (`mensagem` + `permissionFn` + `paramsDoSender`) como o `lastBroadcast` do grupo.
4. O router itera sobre **todos** os sockets conectados ao grupo.
5. Para cada socket, ele executa a `permissionFn` passando os parâmetros *desse socket específico* e a mensagem.
6. Se a função retornar `true`, a mensagem é enviada. Se retornar `false`, o socket é ignorado.
7. **Novos Membros**: Quando um novo socket se conecta, o router aguarda o handshake finalizar (50ms) e reexecuta a `permissionFn` do `lastBroadcast`. Se for `true`, o novo membro recebe a mensagem histórica automaticamente.

---

## 🌍 Exemplos Práticos do Mundo Real

### Cenário 1: Isolamento de Salas de Chat (O Clássico)
**Objetivo:** Garantir que uma mensagem enviada na sala "geral" não vaze para a sala "vip".

```typescript
app.ws("/chat/:room/:user", (ws, _req, params) => {
  const currentRoom = params.room as string;
  const group = app.getWsGroupByPath("/chat/:room/:user");

  ws.onmessage = (event) => {
    // A função de permissão verifica se o cliente destinatário está na mesma sala do remetente
    group.broadcast(
      `[${params.user}]: ${event.data}`,
      (clientParams) => clientParams.room === currentRoom,
      params // Passamos os params do remetente para histórico
    );
  };
});
```

### Cenário 2: Controle de Acesso por Nível de Usuário (RBAC)
**Objetivo:** Em um dashboard, apenas usuários com role `admin` ou `moderator` podem receber alertas de sistema críticos.

```typescript
app.ws("/dashboard/:role/:userId", (ws, _req, params) => {
  const group = app.getWsGroupByPath("/dashboard/:role/:userId");

  // Função simulada que envia um alerta
  function sendSystemAlert(alertMessage: string) {
    group.broadcast(
      `🚨 ALERTA: ${alertMessage}`,
      (clientParams) => {
        // Só permite a passagem se o role do destinatário for admin ou moderator
        return clientParams.role === "admin" || clientParams.role === "moderator";
      }
    );
  }
});
```

### Cenário 3: Filtragem Baseada no Conteúdo da Mensagem
**Objetivo:** Impedir que mensagens contendo a menção `@everyone` sejam enviadas, a menos que o remetente seja um administrador.

```typescript
app.ws("/community/:serverId/:userId", (ws, _req, params) => {
  const group = app.getWsGroupByPath("/community/:serverId/:userId");

  ws.onmessage = (event) => {
    const message = event.data;

    group.broadcast(
      message,
      (clientParams, msgContent) => {
        // Se a mensagem contiver @everyone, só passa se o DESTINATÁRIO for admin 
        // (ou você pode checar o senderParams se salvar no contexto, mas aqui filtramos o destino)
        if (msgContent.includes("@everyone")) {
          return clientParams.role === "admin"; 
        }
        return true; // Mensagens normais passam para todos
      },
      params
    );
  };
});
```

### Cenário 4: Mensagens Diretas (DM) ou Notificações Privadas
**Objetivo:** Enviar uma notificação apenas para o usuário específico dentro de um grupo amplo.

```typescript
app.ws("/notifications/:tenantId/:userId", (ws, _req, params) => {
  const group = app.getWsGroupByPath("/notifications/:tenantId/:userId");

  // Função chamada pelo backend quando há uma nova notificação para o user "42"
  function notifyUser(targetUserId: string, notificationData: string) {
    group.broadcast(
      notificationData,
      (clientParams) => clientParams.userId === targetUserId, // Filtra pelo ID exato
      params
    );
  }
});
```

---

## 💡 Recursos Avançados e "Mágica" do Last Broadcast

### O Problema que isso resolve:
Em aplicações de chat ou dashboards em tempo real, se um usuário entra em uma sala onde uma discussão já está acontecendo, ele perde o contexto. 

### A Solução do `@loco/router`:
Graças ao armazenamento do `lastBroadcast`, o sistema faz isso automaticamente:

```typescript
// 10:00:00 -> User A (room: "lobby") envia: "Olá a todos!"
// O router salva: { message: "Olá a todos!", permissionFn: (p) => p.room === "lobby", senderParams: { room: "lobby", user: "A" } }

// 10:00:05 -> User B conecta na rota /chat/lobby/userB
// O router detecta a conexão, aguarda 50ms (para o socket ficar OPEN), 
// reavalia a permissionFn do último broadcast e, como "lobby" === "lobby", 
// envia "Olá a todos!" automaticamente para o User B.
```

**Nota de Segurança:** O router reavalia a permissão usando os `senderParams` originais no momento da reconexão/histórico. Isso garante que a regra de negócio original (ex: "esta mensagem era apenas para a sala X") seja respeitada, evitando que um usuário entre em uma sala diferente e receba mensagens vazadas de outro contexto.

---

## ⚠️ Melhores Práticas e Cuidados

1. **Mantenha a `PermissionFn` Leve:** 
   A função é executada para **cada** cliente conectado no grupo. Evite operações assíncronas (como consultas ao banco de dados) dentro da `PermissionFn`. Use-a apenas para verificações síncronas de estado (strings, arrays, roles).

2. **Não Confie Apenas no Frontend:** 
   Os `RouteParams` são extraídos da URL no momento do handshake. Se a autenticação for crítica, valide o token JWT *antes* de chamar `Deno.upgradeWebSocket` ou dentro do handler do WebSocket, e injete o `role` ou `userId` validado nos parâmetros ou em um contexto seguro.

3. **Use `senderParams` Corretamente:** 
   Sempre passe o terceiro argumento `params` no `group.broadcast(msg, fn, params)`. Sem isso, o recurso de "Last Broadcast" para novos membros não terá o contexto necessário para reavaliar a permissão de forma segura.

4. **Limpeza de Grupos:** 
   Se um grupo ficar obsoleto (ex: uma sala de jogo que acabou), use `app.closeGroupByPath("/game/:roomId")` para liberar a memória e fechar os sockets pendentes, o que também limpa o `lastBroadcast`.

--- 

*Este documento faz parte da especificação oficial do `@loco/router`. Para mais detalhes sobre a API, consulte o `README.md` principal.*
````

---

## Arquivo: `monorepo/router/deno.jsonc`

```json
{
  "name": "@loco/router",
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
  "exports": "./src/mod.ts"
}
```

---

