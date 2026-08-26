# 🚂 @loco/router

**O router HTTP e WebSocket mais completo e seguro para Deno.**

Roteamento expressivo baseado na [URL Pattern API](https://developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API) nativa, middlewares em cadeia, segurança nativa e o revolucionário sistema de **Dual Params** para broadcasts inteligentes em WebSockets.

[![JSR](https://jsr.io/badges/@loco/router)](https://jsr.io/@loco/router)
[![Deno](https://img.shields.io/badge/Deno-2.x-blue?logo=deno)](https://deno.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

---

## 📑 Tabela de Conteúdo

- [✨ Por que @loco/router?](#-por-que-locorouter)
- [🎯 Features](#-features)
- [🌐 Arquitetura Runtime-Agnostic](#-arquitetura-runtime-agnostic)
- [🔌 Adapters: A Camada de Adaptação](#-adapters-a-camada-de-adaptação)
- [🚀 Quick Start](#-quick-start)
- [📖 API Reference](#-api-reference)
- [🧠 Dual Params: O Diferencial](#-dual-params-o-diferencial)
- [🔗 Middlewares](#-middlewares)
- [📡 WebSocket Groups & Last Broadcast](#-websocket-groups--last-broadcast)
- [🛡️ Segurança](#️-segurança)
- [📂 Arquivos Estáticos](#-arquivos-estáticos)
- [🌍 Exemplos do Mundo Real](#-exemplos-do-mundo-real)
- [⚙️ Configuração Avançada](#️-configuração-avançada)
- [🚢 Deploy](#-deploy)
- [🧪 Testes](#-testes)
- [❓ FAQ & Troubleshooting](#-faq--troubleshooting)
- [⚖️ Comparação com Alternativas](#️-comparação-com-alternativas)
- [🗺️ Roadmap](#️-roadmap)
- [🤝 Contribuindo](#-contribuindo)
- [📄 Licença](#-licença)

---

## ✨ Por que @loco/router?

A maioria dos routers Deno trata WebSockets como cidadãos de segunda classe: você conecta, recebe uma mensagem e precisa implementar toda a lógica de salas, permissões e histórico manualmente.

O **@loco/router** foi construído com uma filosofia diferente:

> **"O servidor deve entender o contexto de cada conexão e tomar decisões inteligentes sobre quem recebe o quê."**

Isso se traduz em quatro diferenciais que você não encontra em outros routers:

### 1. 🧠 Dual Params (Exclusivo)
Filtre broadcasts avaliando **três dimensões simultaneamente**: quem envia, quem recebe e o conteúdo da mensagem.

### 2. ⏳ Last Broadcast Inteligente
Novos membros recebem automaticamente a última mensagem da sala — respeitando as regras de permissão originais.

### 3. 🔗 Middlewares Unificados HTTP + WebSocket
Um único middleware pode interceptar tanto requisições HTTP quanto upgrades de WebSocket.

### 4. 🌐 Arquitetura Runtime-Agnostic (Novo!)
O core do router não depende de nenhum runtime específico. Ele funciona no Deno, Cloudflare Workers e, futuramente, Node.js — sem alterar uma linha do código de rotas.

---

## 🎯 Features

| Categoria | Recursos |
|-----------|----------|
| **HTTP** | `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`, `HEAD` |
| **Routing** | Parâmetros nomeados (`:id`), catch-all (`*`), URL Pattern API nativa |
| **WebSocket** | Grupos automáticos, broadcast com permissões, last broadcast |
| **Middlewares** | Cadeia encadeada, modificação de Request/Response, abortar fluxo |
| **Segurança** | Proteção contra Path Traversal, Force HTTPS, HSTS automático |
| **Arquivos Estáticos** | Disco ou embedded, MIME types automáticos, index.html fallback |
| **Arquitetura** | Runtime-agnostic, adapters para Deno/Cloudflare, zero dependências de runtime no core |
| **Error Handling** | Try/catch automático, retorno 500 graceful |
| **Type Safety** | TypeScript estrito, `noUncheckedIndexedAccess` compatível |

---

## 🌐 Arquitetura Runtime-Agnostic

O `@loco/router` foi projetado para funcionar em **qualquer runtime JavaScript** que suporte as Web APIs padrão (Fetch API, WebSocket, URLPattern). O core do router **não possui nenhuma dependência direta** de runtime específico (Deno, Node.js, Cloudflare Workers, Bun).

### 🏗️ Arquitetura em Camadas

```
┌─────────────────────────────────────────────────────────────┐
│              SEU CÓDIGO (main.ts / worker.ts)               │
│  - Define rotas, middlewares e handlers                     │
│  - Escolhe o entry point adequado ao runtime                │
└──────────────────────────┬──────────────────────────────────┘
                           │ importa
┌──────────────────────────▼──────────────────────────────────┐
│           ENTRY POINTS (src/deno.ts, src/cloudflare.ts)     │
│  - createDenoRouter()                                       │
│  - createCloudflareRouter()                                 │
└──────────────────────────┬──────────────────────────────────┘
                           │ injeta adaptadores
┌──────────────────────────▼──────────────────────────────────┐
│              CORE AGNÓSTICO (src/mod.ts)                    │
│  - Router, WebSocketGroup, tipos                            │
│  - ZERO dependência de runtime                              │
│  - Usa interfaces: WebSocketUpgrader, StaticFileHandler     │
└──────────────────────────┬──────────────────────────────────┘
                           │ implementado por
┌──────────────────────────▼──────────────────────────────────┐
│              ADAPTADORES (src/adapters/)                    │
│  - adapters/deno.ts       → Deno.upgradeWebSocket,          │
│                              Deno.stat, Deno.open           │
│  - adapters/cloudflare.ts → WebSocketPair, KV, R2           │
└─────────────────────────────────────────────────────────────┘
```

### Por que essa arquitetura?

| Problema | Solução |
|----------|---------|
| `Deno.upgradeWebSocket()` é específico do Deno | Interface `WebSocketUpgrader` abstrai o upgrade |
| `Deno.stat()` / `Deno.open()` são específicos do Deno | Interface `StaticFileHandler` abstrai arquivos |
| Cloudflare usa `WebSocketPair` | Adapter do Cloudflare implementa a interface |
| Cloudflare usa KV/R2 para arquivos | Adapter do Cloudflare implementa `StaticFileHandler` |
| Node.js usa `ws` e `fs` | Futuro adapter implementará as mesmas interfaces |

### Quais partes são agnósticas?

| Componente | Agnóstico? | Observação |
|------------|:----------:|------------|
| Roteamento HTTP | ✅ Sim | URL Pattern API é padrão web |
| Middlewares | ✅ Sim | Puro JavaScript |
| WebSocket Groups | ✅ Sim | Gerencia sockets de forma abstrata |
| Broadcast & Last Broadcast | ✅ Sim | Lógica pura de JavaScript |
| Force HTTPS | ✅ Sim | Manipulação de URL e headers |
| Path Traversal Protection | ✅ Sim | `@std/path` é agnóstico |
| Upgrade de WebSocket | ❌ Não | Depende do runtime → **Adapter** |
| Arquivos Estáticos | ❌ Não | Depende do filesystem → **Adapter** |

---

## 🔌 Adapters: A Camada de Adaptação

### O que são Adapters?

Adapters são implementações concretas das interfaces `WebSocketUpgrader` e `StaticFileHandler`. Eles isolam todo o código específico de runtime em módulos separados, permitindo que o core do router seja 100% agnóstico.

### Interface `WebSocketUpgrader`

```typescript
interface WebSocketUpgrader {
  upgrade(req: Request): { socket: WebSocket; response: Response };
}
```

| Runtime | Implementação | Observação |
|---------|---------------|------------|
| Deno | `Deno.upgradeWebSocket(req)` | Nativo do Deno |
| Cloudflare Workers | `new WebSocketPair()` | Específico do CF |
| Node.js (futuro) | `ws.handleUpgrade()` | Via biblioteca `ws` |

### Interface `StaticFileHandler`

```typescript
interface StaticFileHandler {
  handle(path: string): Promise<Response | null>;
}
```

| Runtime | Implementação | Observação |
|---------|---------------|------------|
| Deno | `Deno.stat()` + `Deno.open()` | Sistema de arquivos local |
| Cloudflare Workers | KV Namespace ou R2 Bucket | Armazenamento distribuído |
| Node.js (futuro) | `fs.stat()` + `fs.createReadStream()` | Sistema de arquivos local |

### Adapter Deno (`src/adapters/deno.ts`)

O adapter do Deno fornece:

```typescript
// Upgrade de WebSocket nativo do Deno
export const denoWebSocketUpgrader: WebSocketUpgrader = {
  upgrade(req: Request) {
    return Deno.upgradeWebSocket(req);
  },
};

// Handler de arquivos estáticos com suporte a:
// - Diretório estático (staticDir)
// - Arquivos embutidos (embeddedDir)
// - Resolução de MIME types
// - Candidatos: arquivo.html, arquivo.htm, index.html
export function createDenoStaticFileHandler(
  staticDir: string | null,
  embeddedDir: string | null = null,
  mimeTypeResolver?: MimeTypeResolver,
): StaticFileHandler { ... }
```

**Uso:**
```typescript
import { createDenoRouter } from "@loco/router/deno";

const app = createDenoRouter({
  basePath: "/api",
  staticDir: "./public",
  forceHttps: true,
});
```

### Adapter Cloudflare Workers (`src/adapters/cloudflare.ts`)

O adapter do Cloudflare fornece:

```typescript
// Upgrade de WebSocket via WebSocketPair (específico do CF)
export const cloudflareWebSocketUpgrader: WebSocketUpgrader = {
  upgrade(req: Request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    return {
      socket: server,
      response: new Response(null, { status: 101, webSocket: client }),
    };
  },
};

// Handler de arquivos via R2 Bucket
export function createR2StaticFileHandler(bucket: R2Bucket): StaticFileHandler;

// Handler de arquivos via KV Namespace
export function createKVStaticFileHandler(kv: KVNamespace): StaticFileHandler;
```

**Uso:**
```typescript
import { createCloudflareRouter } from "@loco/router/cloudflare";

export default {
  async fetch(req: Request, env: Env) {
    const app = createCloudflareRouter({
      basePath: "/api",
      r2Bucket: env.MY_BUCKET,
      forceHttps: true,
    });
    
    app.get("/hello", () => ({ body: "Hello!" }));
    return app.handleRequest(req);
  },
};
```

### Criando seu Próprio Adapter

Se você quer usar o `@loco/router` em outro runtime, basta implementar as duas interfaces:

```typescript
import { Router, type WebSocketUpgrader, type StaticFileHandler } from "@loco/router";

// Implemente o upgrade para seu runtime
const meuUpgrader: WebSocketUpgrader = {
  upgrade(req: Request) {
    // Implementação específica do seu runtime
    return { socket, response };
  },
};

// Implemente o handler de arquivos
const meuFileHandler: StaticFileHandler = {
  async handle(path: string) {
    // Implementação específica do seu filesystem
    return new Response(content) || null;
  },
};

const app = new Router({
  basePath: "/api",
  webSocketUpgrader: meuUpgrader,
  staticFileHandler: meuFileHandler,
});
```

---

## 🚀 Quick Start

### 🦕 Com Deno (Recomendado)

```typescript
import { createDenoRouter } from "@loco/router/deno";

const app = createDenoRouter({
  basePath: "/api",
  staticDir: "./public",
  forceHttps: true,
});

app.get("/", () => ({ body: "Olá, Mundo!" }));

Deno.serve({ port: 8000 }, app.handleRequest.bind(app));
```

### ☁️ Com Cloudflare Workers

```typescript
import { createCloudflareRouter } from "@loco/router/cloudflare";

export default {
  async fetch(req: Request, env: Env) {
    const app = createCloudflareRouter({
      basePath: "/api",
      kvNamespace: env.MY_KV,
      forceHttps: true,
    });
    app.get("/hello", () => ({ body: "Hello from Cloudflare!" }));
    return app.handleRequest(req);
  },
};
```

### 🟢 Com Node.js (Futuro)

```typescript
import { Router } from "@loco/router";
import { createNodeWebSocketUpgrader } from "@loco/router/adapters/node";

const app = new Router({
  basePath: "/api",
  webSocketUpgrader: createNodeWebSocketUpgrader(),
});
```

---

## 📖 API Reference

### Constructor

O router aceita **objeto de opções** (forma recomendada):

```typescript
const app = new Router({
  basePath: "/api",
  staticDir: "./public",
  embeddedDir: null,
  forceHttps: true,
  lastBroadcastDelay: 50,
  webSocketUpgrader: meuUpgrader,      // Adapter
  staticFileHandler: meuFileHandler,   // Adapter
});
```

### Opções (`RouterOptions`)

| Opção | Tipo | Padrão | Descrição |
|-------|------|--------|-----------|
| `basePath` | `string` | `""` | Prefixo aplicado a todas as rotas |
| `staticDir` | `string \| null` | `"public"` | Pasta de arquivos estáticos |
| `embeddedDir` | `string \| null` | `null` | Pasta de arquivos embutidos |
| `forceHttps` | `boolean` | `env.FORCE_HTTPS` | Força redirect HTTP → HTTPS |
| `lastBroadcastDelay` | `number` | `50` | Delay (ms) para handshake WS |
| `webSocketUpgrader` | `WebSocketUpgrader` | - | Adapter de upgrade WS |
| `staticFileHandler` | `StaticFileHandler` | - | Adapter de arquivos estáticos |

### Entry Points

| Import | Runtime | Observação |
|--------|---------|------------|
| `@loco/router` | Core agnóstico | Sem adapters, use `new Router()` |
| `@loco/router/deno` | Deno | `createDenoRouter()` |
| `@loco/router/cloudflare` | Cloudflare Workers | `createCloudflareRouter()` |
| `@loco/router/adapters/deno` | Deno adapters | `denoWebSocketUpgrader`, `createDenoStaticFileHandler` |
| `@loco/router/adapters/cloudflare` | Cloudflare adapters | `cloudflareWebSocketUpgrader`, `createR2StaticFileHandler` |

### Métodos HTTP

Todos os métodos seguem a mesma assinatura:

```typescript
app.get(path: string, handler: HttpHandler)
app.post(path: string, handler: HttpHandler)
app.put(path: string, handler: HttpHandler)
app.delete(path: string, handler: HttpHandler)
app.patch(path: string, handler: HttpHandler)
app.options(path: string, handler: HttpHandler)
app.head(path: string, handler: HttpHandler)
```

### `HttpHandler`

```typescript
type HttpHandler = (
  req: Request,
  params: RouteParams,
) =>
  | { body: BodyInit; init?: ResponseInit }
  | Promise<{ body: BodyInit; init?: ResponseInit }>;
```

### `body: BodyInit`

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

### `init?: ResponseInit`

| Propriedade | Tipo | Padrão | Descrição |
|-------------|------|--------|-----------|
| `status` | `number` | `200` | Código HTTP de status |
| `statusText` | `string` | `""` | Texto do status |
| `headers` | `HeadersInit` | `{}` | Headers da resposta |

### Parâmetros de Rota

#### Nomeados (`:param`)

```typescript
app.get("/users/:id/posts/:postId", (_req, params) => {
  params.id;      // "42"
  params.postId;  // "7"
  return { body: "ok" };
});
```

#### Catch-all (`*`)

Todos os wildcards são agrupados no parâmetro `catch` como **array**:

```typescript
app.get("/files/*", (_req, params) => {
  params.catch;  // ["docs", "readme.md"]
  return { body: "ok" };
});

app.get("/a/*/b/*", (_req, params) => {
  params.catch;  // ["x", "y/z"]
  return { body: "ok" };
});
```

### Middlewares (`app.use()`)

```typescript
type Middleware = (
  req: Request,
  params: RouteParams,
  next: (newReq?: Request) => Promise<Response>,
) => Promise<Response> | Response;
```

| Método | Descrição |
|--------|-----------|
| `app.use(middleware)` | Registra middleware global |
| `app.getWsGroupByPath(path)` | Retorna o grupo WS de uma rota |
| `app.closeGroupByPath(path)` | Fecha todos os sockets de um grupo |
| `app.closeAllWebSockets()` | Fecha todas as conexões WS |

---

## 🧠 Dual Params: O Diferencial

### O Problema

Em routers comuns, a função de permissão recebe apenas **um** contexto. Isso limita drasticamente os casos de uso.

### A Solução Dual Params

```typescript
type PermissionFn = (
  receiverParams: RouteParams,  // Parâmetros de quem VAI RECEBER
  senderParams: RouteParams,    // Parâmetros de quem ENVIOU
  message: string               // Conteúdo da mensagem
) => boolean;
```

### Exemplos Práticos

#### Isolamento de Salas de Chat

```typescript
app.ws("/chat/:room/:user", (ws, _req, params) => {
  const group = app.getWsGroupByPath("/chat/:room/:user");
  ws.onmessage = (event) => {
    group.broadcast(
      `[${params.user}]: ${event.data}`,
      (receiver, sender, _msg) => receiver.room === sender.room,
      params,
    );
  };
});
```

#### Controle de Acesso por Role (RBAC)

```typescript
app.ws("/dashboard/:role/:userId", (ws, _req, params) => {
  const group = app.getWsGroupByPath("/dashboard/:role/:userId");
  ws.onmessage = (event) => {
    group.broadcast(
      `🚨 ALERTA: ${event.data}`,
      (_receiver, sender, _msg) => sender.role === "admin",
      params,
    );
  };
});
```

#### Filtragem por Conteúdo

```typescript
app.ws("/community/:serverId/:userId", (ws, _req, params) => {
  const group = app.getWsGroupByPath("/community/:serverId/:userId");
  ws.onmessage = (event) => {
    group.broadcast(
      event.data,
      (_receiver, _sender, msgContent) => {
        return !msgContent.toLowerCase().includes("spam");
      },
      params,
    );
  };
});
```

#### Combinação Avançada (Sala + Role + Conteúdo)

```typescript
group.broadcast(
  event.data,
  (receiver, sender, msg) => {
    // Admin pode enviar para qualquer sala
    if (sender.role === "admin") return true;
    // Usuário comum: só mesma sala + sem spam
    return receiver.room === sender.room && !msg.includes("spam");
  },
  params,
);
```

---

## 📡 WebSocket Groups & Last Broadcast

### Grupos Automáticos

Cada rota `.ws()` cria automaticamente um grupo isolado:

```typescript
app.ws("/chat/:room/:user", (ws, _req, params) => {
  const group = app.getWsGroupByPath("/chat/:room/:user");
  if (!group) return ws.close(1011, "Internal error");
  
  ws.onmessage = (event) => {
    group.broadcast(`[${params.user}]: ${event.data}`, ...);
  };
});
```

### Last Broadcast

Quando um novo membro entra, o router automaticamente:

1. Aguarda o handshake finalizar (`lastBroadcastDelay` ms)
2. Recupera o `lastBroadcast` do grupo
3. Reavalia a `permissionFn` com os params do novo membro
4. Se aprovado, envia a mensagem histórica automaticamente

```
10:00:00 → User A (room: "lobby") envia: "Olá a todos!"
           → broadcast salva { message, permissionFn, senderParams }
           → User B (room: "lobby") recebe ✅
           → User C (room: "vip") NÃO recebe ❌

10:00:05 → User D conecta em /chat/lobby/userD
           → permissionFn({ room: "lobby" }, { room: "lobby" }, "Olá!") → TRUE
           → User D recebe "Olá a todos!" automaticamente ✅

10:00:10 → User E conecta em /chat/vip/userE
           → permissionFn({ room: "vip" }, { room: "lobby" }, "Olá!") → FALSE
           → User E NÃO recebe (Segurança garantida!) 🔒
```

### Configurando o Delay

```typescript
// Produção (padrão: 50ms)
const app = createDenoRouter({ lastBroadcastDelay: 50 });

// Testes rápidos (0ms)
const app = createDenoRouter({ lastBroadcastDelay: 0 });

// Rede lenta
const app = createDenoRouter({ lastBroadcastDelay: 200 });
```

---

## 🛡️ Segurança

### Proteção contra Path Traversal

O router normaliza paths com `@std/path` + regex anti-`..`:

```bash
GET /../../etc/passwd          → 404
GET /..%2F..%2Fetc%2Fpasswd    → 404
GET /..\..\etc\passwd          → 404
GET /subdir/../../secret.txt   → 404
```

### Force HTTPS

```typescript
const app = createDenoRouter({ forceHttps: true });
```

| Cenário | Ação |
|---------|------|
| `http://meusite.com/api` | → 301 para `https://meusite.com/api` |
| `ws://meusite.com/api` | → 301 para `wss://meusite.com/api` |
| `http://localhost:8000` | ✅ Não redireciona (dev) |
| `x-forwarded-proto: https` | ✅ Não redireciona (proxy) |

### Error Handling Automático

Handlers que lançam exceções retornam 500 automaticamente:

```typescript
app.get("/error", () => {
  throw new Error("Database connection failed");
});
// → HTTP 500 "Internal Server Error"
```

---

## 📂 Arquivos Estáticos

### Servir do Disco

```typescript
const app = createDenoRouter({
  basePath: "/api",
  staticDir: "./public",
});
```

### Resolução Automática

| Request | Tenta servir |
|---------|--------------|
| `/index.html` | `./public/index.html` |
| `/docs` | `./public/docs.html` → `./public/docs.htm` → `./public/docs/index.html` |
| `/about/` | `./public/about/index.html` → `./public/about/index.htm` |

### MIME Types Automáticos

O router resolve MIME types automaticamente para mais de 20 tipos de arquivo. Você pode customizar:

```typescript
const app = createDenoRouter({
  mimeTypeResolver: (ext) => ({
    html: "text/html; charset=utf-8",
    wasm: "application/wasm",
  })[ext],
});
```

---

## 🌍 Exemplos do Mundo Real

### API REST Completa

```typescript
import { createDenoRouter } from "@loco/router/deno";

const app = createDenoRouter({ basePath: "/api/v1" });

// Middleware de logging
app.use(async (req, _params, next) => {
  const start = Date.now();
  const res = await next();
  console.log(`${req.method} ${req.url} → ${res.status} (${Date.now() - start}ms)`);
  return res;
});

// CRUD de usuários
app.get("/users", () => ({ body: JSON.stringify(users) }));
app.get("/users/:id", (_req, params) => ({ body: JSON.stringify(users[params.id]) }));
app.post("/users", async (req) => ({ body: await req.text(), init: { status: 201 } }));
app.put("/users/:id", async (req, params) => ({ body: await req.text() }));
app.delete("/users/:id", (_req, params) => ({ body: "", init: { status: 204 } }));

Deno.serve({ port: 8000 }, app.handleRequest.bind(app));
```

### Chat com Salas Isoladas

```typescript
app.ws("/chat/:room/:user", (ws, _req, params) => {
  const group = app.getWsGroupByPath("/chat/:room/:user");
  if (!group) return ws.close(1011, "Internal error");

  ws.onmessage = (event) => {
    group.broadcast(
      `[${params.user}]: ${event.data}`,
      (receiver, sender, _msg) => receiver.room === sender.room,
      params,
    );
  };
});
```

### WebSocket com JWT via Subprotocol

```typescript
app.use(async (req, _params, next) => {
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return await next();
  }
  const protocol = req.headers.get("sec-websocket-protocol") ?? "";
  const token = protocol.split(",").find((_, i, arr) => arr[i-1] === "Bearer");
  
  if (!token) return new Response("Token required", { status: 401 });
  
  try {
    await jwtVerify(token, secret);
    return await next();
  } catch {
    return new Response("Invalid token", { status: 403 });
  }
});
```

---

## ⚙️ Configuração Avançada

### Configuração Completa

```typescript
import { createDenoRouter } from "@loco/router/deno";

const app = createDenoRouter({
  basePath: "/api/v1",
  staticDir: "./public",
  embeddedDir: "./dist",
  forceHttps: true,
  lastBroadcastDelay: 100,
  mimeTypeResolver: (ext) => ({
    html: "text/html; charset=utf-8",
    wasm: "application/wasm",
  })[ext],
});
```

### Variáveis de Ambiente

```bash
FORCE_HTTPS=true deno run --allow-net --allow-read main.ts
```

---

## 🚢 Deploy

### Deno Deploy (HTTPS Automático)

```bash
deployctl deploy --project=meu-router main.ts
```

✅ Certificado SSL automático
✅ HTTP/2 e HTTP/3 nativos
✅ CDN global

### Docker

```dockerfile
FROM denoland/deno:latest
WORKDIR /app
COPY . .
RUN deno cache main.ts
EXPOSE 8000
CMD ["run", "--allow-net", "--allow-read", "main.ts"]
```

### Executável Standalone

```bash
deno compile --allow-net --allow-read --include=./public/**/* --output=server main.ts
```

---

## 🧪 Testes

```bash
# Rodar todos os testes
deno task tests

# Rodar arquivo específico
deno test tests/middleware_test.ts

# Com coverage
deno test --coverage=cov/ tests/
deno coverage cov/
```

---

## ❓ FAQ & Troubleshooting

### WebSocket não conecta
Verifique se o header `connection: Upgrade` está presente. O Deno exige esse header para o upgrade.

### Middleware não executa para arquivos estáticos
Middlewares executam para **rotas registradas**, não para arquivos estáticos. Para interceptar estáticos, use um middleware global com `app.use()`.

### Last Broadcast não chega
Verifique se o `lastBroadcastDelay` é suficiente para o handshake. Em testes, use `lastBroadcastDelay: 0`.

### Force HTTPS não funciona em localhost
Isso é intencional! O router ignora `localhost`, `127.0.0.1` e `::1` para não atrapalhar o desenvolvimento.

---

## ⚖️ Comparação com Alternativas

| Feature | @loco/router | Hono | Oak | Fresh |
|---------|:------------:|:----:|:---:|:-----:|
| HTTP routing | ✅ | ✅ | ✅ | ✅ |
| WebSocket nativo | ✅ | ⚠️ | ⚠️ | ❌ |
| Dual Params | ✅ | ❌ | ❌ | ❌ |
| Last Broadcast | ✅ | ❌ | ❌ | ❌ |
| Middlewares unificados | ✅ | ❌ | ❌ | ❌ |
| Runtime-agnostic | ✅ | ✅ | ❌ | ❌ |
| Force HTTPS nativo | ✅ | ⚠️ | ❌ | ⚠️ |
| Zero dependências | ✅ | ✅ | ❌ | ❌ |

✅ Nativo | ⚠️ Via plugin | ❌ Não suporta

---

## 📄 Licença

MIT © Loco Framework

