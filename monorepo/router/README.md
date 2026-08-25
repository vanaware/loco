# 🚂 @loco/router

**O router HTTP e WebSocket mais completo e seguro para Deno.**

Roteamento expressivo baseado na [URL Pattern API](https://developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API) nativa, middlewares em cadeia, segurança nativa e o revolucionário sistema de **Dual Params** para broadcasts inteligentes em WebSockets.

[![JSR](https://jsr.io/badges/@loco/router)](https://jsr.io/@loco/router)
[![Deno](https://img.shields.io/badge/Deno-2.x-blue?logo=deno)](https://deno.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-80%2B%20passing-brightgreen)](#-testes)

---

## 📑 Tabela de Conteúdo

- [✨ Por que @loco/router?](#-por-que-locorouter)
- [🎯 Features](#-features)
- [📦 Instalação](#-instalação)
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

Isso se traduz em três diferenciais que você **não encontra** em outros routers:

### 🧠 1. Dual Params (Exclusivo)

Filtre broadcasts avaliando **três dimensões simultaneamente**:

```typescript
group.broadcast(
  message,
  (receiverParams, senderParams, messageContent) => {
    return receiverParams.room === senderParams.room  // Contexto do receiver
        && senderParams.role === "admin"              // Contexto do sender
        && !messageContent.includes("spam");          // Conteúdo da mensagem
  },
  senderParams
);
```

### ⏳ 2. Last Broadcast Inteligente

Novos membros recebem automaticamente a última mensagem da sala — **respeitando as regras de permissão originais**. Se um usuário entra em uma sala diferente, ele **não recebe** mensagens de outra sala (proteção contra vazamento de dados).

### 🔗 3. Middlewares Unificados HTTP + WebSocket

Um único middleware pode interceptar **tanto** requisições HTTP **quanto** upgrades de WebSocket, permitindo autenticação centralizada antes mesmo do socket ser criado.

---

## 🎯 Features

| Categoria | Recursos |
|-----------|----------|
| **HTTP** | `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`, `HEAD` |
| **Routing** | Parâmetros nomeados (`:id`), catch-all (`*`), URL Pattern API nativa |
| **WebSocket** | Grupos automáticos, broadcast com permissões, last broadcast |
| **Middlewares** | Cadeia encadeada, modificação de Request/Response, abortar fluxo |
| **Segurança** | Proteção contra Path Traversal, Force HTTPS, HSTS automático |
| **Static Files** | Disco ou embedded, MIME types automáticos, index.html fallback |
| **Error Handling** | Try/catch automático, retorno 500 graceful |
| **Type Safety** | TypeScript estrito, `noUncheckedIndexedAccess` compatível |
| **Zero Deps** | Apenas Deno Standard Library |

---

## 📦 Instalação

### Via JSR (recomendado)

```bash
deno add jsr:@loco/router
```

### Import direto

```typescript
import { Router, WebSocketGroup, type Middleware } from "jsr:@loco/router@^1";
```

### Requisitos

- Deno 2.x ou superior
- Sem dependências externas

---

## 🚀 Quick Start

### Nível 1: Olá Mundo

```typescript
import { Router } from "jsr:@loco/router@^1";

const app = new Router();

app.get("/", () => ({ body: "Olá, Mundo!" }));

Deno.serve({ port: 8000 }, app.handleRequest.bind(app));
```

### Nível 2: API REST com parâmetros

```typescript
import { Router } from "jsr:@loco/router@^1";

const app = new Router("/api");

app.get("/users/:id", (_req, params) => ({
  body: JSON.stringify({ id: params.id, name: "João" }),
  init: { headers: { "Content-Type": "application/json" } },
}));

app.post("/users", async (req) => {
  const data = await req.json();
  return {
    body: JSON.stringify({ created: true, ...data }),
    init: { status: 201, headers: { "Content-Type": "application/json" } },
  };
});

Deno.serve({ port: 8000 }, app.handleRequest.bind(app));
```

### Nível 3: Chat em tempo real com salas isoladas

```typescript
import { Router } from "jsr:@loco/router@^1";

const app = new Router("/api");

app.ws("/chat/:room/:user", (ws, _req, params) => {
  const group = app.getWsGroupByPath("/chat/:room/:user");
  if (!group) return ws.close(1011, "Internal error");

  console.log(`✅ ${params.user} entrou em ${params.room}`);

  ws.onmessage = (event) => {
    group.broadcast(
      `[${params.user}]: ${event.data}`,
      (receiver, sender, _msg) => receiver.room === sender.room,
      params
    );
  };

  ws.onclose = () => console.log(`❌ ${params.user} saiu`);
});

Deno.serve({ port: 8000 }, app.handleRequest.bind(app));
```

---

## 📖 API Reference

### Constructor

O router pode ser instanciado de duas formas:

#### Forma posicional (legado)

```typescript
new Router(basePath?, staticDir?, embeddedDir?, mimeTypeResolver?, forceHttps?, lastBroadcastDelay?)
```

#### Forma com objeto de opções (recomendado)

```typescript
new Router({
  basePath: "/api",
  staticDir: "./public",
  embeddedDir: null,
  forceHttps: true,
  lastBroadcastDelay: 50,
  mimeTypeResolver: (ext) => customMimeTypes[ext],
});
```

### `RouterOptions`

| Propriedade | Tipo | Padrão | Descrição |
|-------------|------|--------|-----------|
| `basePath` | `string` | `""` | Prefixo aplicado a todas as rotas |
| `staticDir` | `string \| null` | `"public"` | Pasta de arquivos estáticos (`null` desabilita) |
| `embeddedDir` | `string \| null` | `null` | Pasta de arquivos embutidos (para executáveis) |
| `mimeTypeResolver` | `(ext) => string` | interno | Resolver customizado de MIME types |
| `forceHttps` | `boolean` | `env.FORCE_HTTPS` | Força redirect HTTP → HTTPS |
| `lastBroadcastDelay` | `number` | `50` | Delay (ms) para handshake WS antes do histórico |

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

#### `HttpHandler`

```typescript
type HttpHandler = (
  req: Request,
  params: RouteParams
) =>
  | { body: BodyInit; init?: ResponseInit }
  | Promise<{ body: BodyInit; init?: ResponseInit }>;
```

#### Tipos de `body` suportados

| Tipo | Uso típico |
|------|------------|
| `string` | Texto, JSON serializado, HTML |
| `ArrayBuffer` / `TypedArray` | Dados binários |
| `Blob` | Arquivos com tipo |
| `FormData` | Formulários multipart |
| `URLSearchParams` | Query strings |
| `ReadableStream` | Streaming de arquivos / SSE |
| `null` | Respostas sem corpo (204, HEAD) |

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

### Método WebSocket

```typescript
app.ws(path: string, handler: WsHandler)
```

```typescript
type WsHandler = (
  ws: WebSocket,
  req: Request,
  params: RouteParams
) => void;
```

### Métodos auxiliares

| Método | Descrição |
|--------|-----------|
| `app.use(middleware)` | Registra middleware global |
| `app.getWsGroupByPath(path)` | Retorna o grupo WS de uma rota |
| `app.closeGroupByPath(path)` | Fecha todos os sockets de um grupo |
| `app.closeAllWebSockets()` | Fecha todas as conexões WS |
| `app.handleRequest(req)` | Handler principal (use com `Deno.serve`) |

---

## 🧠 Dual Params: O Diferencial

### O problema dos routers tradicionais

Em routers comuns, a função de permissão recebe apenas **um** contexto — geralmente o do destinatário. Isso limita drasticamente os casos de uso:

```typescript
// ❌ Limitado: só posso filtrar pelo receiver
group.broadcast(msg, (clientParams) => clientParams.room === "A");
```

E se eu quiser bloquear mensagens de usuários banidos? E se eu quiser filtrar por conteúdo? Precisaria de lógica externa complexa.

### A solução Dual Params

```typescript
type PermissionFn = (
  receiverParams: RouteParams,  // Quem VAI receber
  senderParams: RouteParams,    // Quem ENVIOU
  message: string               // O conteúdo
) => boolean;
```

### Exemplos por caso de uso

#### 🚪 Isolamento de salas

```typescript
group.broadcast(
  `[${user}]: ${event.data}`,
  (receiver, sender, _msg) => receiver.room === sender.room,
  params
);
```

#### 👑 Controle por role do sender

```typescript
group.broadcast(
  `🚨 ${event.data}`,
  (_receiver, sender, _msg) => sender.role === "admin",
  params
);
```

#### 🚫 Filtro de conteúdo

```typescript
group.broadcast(
  event.data,
  (_receiver, _sender, msg) => !msg.toLowerCase().includes("spam"),
  params
);
```

#### 🔒 Combinação avançada (RBAC + Sala + Conteúdo)

```typescript
group.broadcast(
  event.data,
  (receiver, sender, msg) => {
    // Admin pode enviar para qualquer sala
    if (sender.role === "admin") return true;
    // Usuário comum: só mesma sala + sem spam
    return receiver.room === sender.room 
        && !msg.includes("spam");
  },
  params
);
```

### Fluxo interno

```
┌─────────────┐
│  Sender     │ params: { room: "A", user: "joao" }
└──────┬──────┘
       │ group.broadcast(msg, permissionFn, senderParams)
       ▼
┌─────────────────────────────────────────┐
│  Para cada socket conectado:            │
│  ┌───────────────────────────────────┐  │
│  │ permissionFn(                     │  │
│  │   receiverParams,  ← do socket    │  │
│  │   senderParams,    ← do broadcast │  │
│  │   message          ← conteúdo     │  │
│  │ )                                 │  │
│  │                                   │  │
│  │ Retorna true? → envia             │  │
│  │ Retorna false? → pula             │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  Salva como lastBroadcast               │
│  (para novos membros)                   │
└─────────────────────────────────────────┘
```

---

## 🔗 Middlewares

### Assinatura

```typescript
type Middleware = (
  req: Request,
  params: RouteParams,
  next: (newReq?: Request) => Promise<Response>
) => Promise<Response> | Response;
```

### Regras fundamentais

1. **Retorne uma `Response`** → aborta o fluxo (handler nunca executa)
2. **Chame `next()`** → continua para o próximo middleware / handler
3. **Chame `next(newReq)`** → continua com uma Request modificada
4. **Nunca chame `next()` duas vezes** → erro protegido automaticamente

### Exemplo 1: Logging + Métricas

```typescript
app.use(async (req, _params, next) => {
  const start = Date.now();
  const res = await next();
  const ms = Date.now() - start;
  console.log(`${req.method} ${req.url} → ${res.status} (${ms}ms)`);
  return res;
});
```

### Exemplo 2: CORS global

```typescript
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
```

### Exemplo 3: Autenticação (HTTP + WS unificada)

```typescript
app.use(async (req, _params, next) => {
  const isPublic = new URL(req.url).pathname.startsWith("/public");
  if (isPublic) return await next();

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return new Response("Unauthorized", { status: 401 });

  try {
    await verifyJWT(token);  // sua função de validação
    return await next();
  } catch {
    return new Response("Invalid token", { status: 403 });
  }
});
```

### Exemplo 4: Injeção de contexto no WebSocket

```typescript
app.use(async (req, _params, next) => {
  if (req.headers.get("upgrade") !== "websocket") return await next();

  const userId = await extractUserIdFromSubprotocol(req);
  const newHeaders = new Headers(req.headers);
  newHeaders.set("X-User-Id", userId);
  
  return next(new Request(req.url, { headers: newHeaders }));
});

// No handler WS:
app.ws("/chat/:room", (ws, req) => {
  const userId = req.headers.get("X-User-Id");  // ✅ disponível!
});
```

### Ordem de execução

```
Request → MW1 (antes) → MW2 (antes) → Handler → MW2 (depois) → MW1 (depois) → Response
```

Middlewares executam na **ordem de registro** (FIFO) antes do handler, e em ordem **reversa** depois (como uma pilha).

---

## 📡 WebSocket Groups & Last Broadcast

### Grupos automáticos

Cada rota `.ws()` cria **automaticamente** um grupo isolado. Você o recupera com:

```typescript
const group = app.getWsGroupByPath("/chat/:room/:user");
```

> 💡 O método usa `URLPattern.test()` internamente, então aceita tanto o **pattern** (`/chat/:room/:user`) quanto uma **URL concreta** (`/chat/lobby/joao`).

### Propriedades e métodos do grupo

```typescript
group.size;                          // Número de sockets conectados
group.broadcast(msg, fn?, sender?);  // Envia para todos (com filtro)
group.closeGroup();                  // Fecha todas as conexões
```

### Last Broadcast: contexto automático

Quando um novo membro conecta, o router:

1. Aguarda o handshake finalizar (`lastBroadcastDelay` ms)
2. Recupera o `lastBroadcast` do grupo
3. Reavalia a `permissionFn` com os params do **novo membro**
4. Se aprovado, envia a mensagem histórica automaticamente

#### Timeline visual

```
10:00:00  User A (room: lobby) envia "Olá!"
          → broadcast salva { msg: "Olá!", permissionFn, senderParams: { room: "lobby" } }
          → User B (room: lobby) recebe ✅
          → User C (room: vip) NÃO recebe ❌

10:00:05  User D conecta em /chat/lobby/userD
          → sendLastBroadcastTo avalia:
            permissionFn({ room: "lobby" }, { room: "lobby" }, "Olá!") → true
          → User D recebe "Olá!" automaticamente ✅

10:00:10  User E conecta em /chat/vip/userE
          → sendLastBroadcastTo avalia:
            permissionFn({ room: "vip" }, { room: "lobby" }, "Olá!") → false
          → User E NÃO recebe (segurança!) 🔒
```

### Configurando o delay

```typescript
// Produção (padrão)
const app = new Router({ lastBroadcastDelay: 50 });

// Testes (síncrono)
const app = new Router({ lastBroadcastDelay: 0 });

// Rede lenta
const app = new Router({ lastBroadcastDelay: 200 });
```

---

## 🛡️ Segurança

### Proteção contra Path Traversal

O router **normaliza** automaticamente paths e bloqueia tentativas de escape:

```bash
GET /../../etc/passwd          → 404
GET /..%2F..%2Fetc%2Fpasswd    → 404
GET /..\..\etc\passwd          → 404
GET /subdir/../../secret       → 404
```

Implementação via `normalize()` do `@std/path` + regex anti-`..`.

### Force HTTPS

```typescript
const app = new Router({ forceHttps: true });
```

**Comportamento inteligente:**

| Cenário | Ação |
|---------|------|
| `http://meusite.com/api` | → 301 para `https://meusite.com/api` |
| `http://localhost:8000` | ✅ Não redireciona (dev) |
| `http://127.0.0.1` | ✅ Não redireciona (dev) |
| Header `x-forwarded-proto: https` | ✅ Não redireciona (proxy) |
| Já é HTTPS | ✅ Não redireciona |

Respostas incluem header **HSTS** automático:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

### Error Handling automático

Handlers que lançam exceções **não derrubam o servidor**:

```typescript
app.get("/bug", () => {
  throw new Error("Deu ruim!");
});
```

Resultado:
```
HTTP/1.1 500 Internal Server Error
Body: "Internal Server Error"
```

O erro é logado no console com stack trace completo.

---

## 📂 Arquivos Estáticos

### Servir do disco

```typescript
const app = new Router("/api", "./public");
```

Comportamentos automáticos:

| Request | Tenta servir |
|---------|--------------|
| `/index.html` | `./public/index.html` |
| `/docs` | `./public/docs.html` → `./public/docs.htm` → `./public/docs/index.html` |
| `/about/` | `./public/about/index.html` → `./public/about/index.htm` |

### Servir de embedded (executáveis)

```bash
deno compile --include=./public/**/* main.ts
```

```typescript
const app = new Router({
  basePath: "/api",
  embeddedDir: import.meta.dirname,  // Arquivos embutidos
});
```

### MIME Resolver customizado

```typescript
const app = new Router({
  mimeTypeResolver: (ext) => ({
    "html": "text/html; charset=utf-8",
    "wasm": "application/wasm",
    "svg": "image/svg+xml",
  })[ext.toLowerCase()],
});
```

---

## 🌍 Exemplos do Mundo Real

### 1. API REST completa com validação

```typescript
import { Router } from "jsr:@loco/router@^1";

const app = new Router("/api/v1");
const users = new Map<string, { name: string; email: string }>();

// Middleware de logging
app.use(async (req, _p, next) => {
  const start = Date.now();
  const res = await next();
  console.log(`${req.method} ${req.url} → ${res.status} (${Date.now() - start}ms)`);
  return res;
});

// Listar usuários
app.get("/users", () => ({
  body: JSON.stringify([...users.values()]),
  init: { headers: { "Content-Type": "application/json" } },
}));

// Buscar usuário
app.get("/users/:id", (_req, params) => {
  const user = users.get(params.id as string);
  if (!user) return { body: "Not Found", init: { status: 404 } };
  return {
    body: JSON.stringify(user),
    init: { headers: { "Content-Type": "application/json" } },
  };
});

// Criar usuário
app.post("/users", async (req) => {
  const data = await req.json();
  const id = crypto.randomUUID();
  users.set(id, data);
  return {
    body: JSON.stringify({ id, ...data }),
    init: { status: 201, headers: { "Content-Type": "application/json" } },
  };
});

// Atualização parcial
app.patch("/users/:id", async (req, params) => {
  const user = users.get(params.id as string);
  if (!user) return { body: "Not Found", init: { status: 404 } };
  const updates = await req.json();
  const updated = { ...user, ...updates };
  users.set(params.id as string, updated);
  return {
    body: JSON.stringify(updated),
    init: { headers: { "Content-Type": "application/json" } },
  };
});

// Deletar
app.delete("/users/:id", (_req, params) => {
  users.delete(params.id as string);
  return { body: "", init: { status: 204 } };
});

Deno.serve({ port: 8000 }, app.handleRequest.bind(app));
```

### 2. Chat multi-sala com histórico

```typescript
import { Router } from "jsr:@loco/router@^1";

const app = new Router("/api");

app.ws("/chat/:room/:user", (ws, _req, params) => {
  const group = app.getWsGroupByPath("/chat/:room/:user");
  if (!group) return ws.close(1011, "No group");

  const room = params.room as string;
  const user = params.user as string;

  // Notifica entrada
  group.broadcast(
    `🟢 ${user} entrou na sala`,
    (r, s, _m) => r.room === s.room,
    params
  );

  ws.onmessage = (event) => {
    group.broadcast(
      `[${user}]: ${event.data}`,
      (receiver, sender, msg) => {
        if (receiver.room !== sender.room) return false;
        if (msg.toLowerCase().includes("spam")) return false;
        return true;
      },
      params
    );
  };

  ws.onclose = () => {
    group.broadcast(
      `🔴 ${user} saiu`,
      (r, _s, _m) => r.room === room,
      params
    );
  };
});

Deno.serve({ port: 8000 }, app.handleRequest.bind(app));
```

### 3. Autenticação JWT em WebSocket (via Subprotocol)

```typescript
import { Router } from "jsr:@loco/router@^1";
import { SignJWT, jwtVerify } from "jose";

const SECRET = new TextEncoder().encode("segredo-super-secreto");
const app = new Router("/api");

// Login HTTP
app.post("/login", async (req) => {
  const { username, password } = await req.json();
  if (username !== "admin" || password !== "123") {
    return { body: "Unauthorized", init: { status: 401 } };
  }
  const token = await new SignJWT({ username, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(SECRET);
  return {
    body: JSON.stringify({ token }),
    init: { headers: { "Content-Type": "application/json" } },
  };
});

// Middleware de auth para WebSocket
app.use(async (req, _params, next) => {
  if (req.headers.get("upgrade") !== "websocket") return await next();

  const protocol = req.headers.get("sec-websocket-protocol") ?? "";
  const parts = protocol.split(",").map((p) => p.trim());
  const token = parts[parts.indexOf("Bearer") + 1];

  if (!token) return new Response("Token required", { status: 401 });

  try {
    const { payload } = await jwtVerify(token, SECRET);
    const headers = new Headers(req.headers);
    headers.set("X-User", payload.username as string);
    headers.set("X-Role", payload.role as string);
    return next(new Request(req.url, { headers }));
  } catch {
    return new Response("Invalid token", { status: 403 });
  }
});

// WS protegido
app.ws("/secure/:room", (ws, req, params) => {
  const user = req.headers.get("X-User");
  const role = req.headers.get("X-Role");
  console.log(`🔐 ${user} (${role}) conectado em ${params.room}`);

  ws.onmessage = (e) => ws.send(`Echo para ${user}: ${e.data}`);
});

Deno.serve({ port: 8000 }, app.handleRequest.bind(app));
```

**Cliente:**
```javascript
const ws = new WebSocket(
  "ws://localhost:8000/api/secure/sala1",
  ["Bearer", jwtToken]
);
```

---

## ⚙️ Configuração Avançada

### Variáveis de ambiente

```bash
# .env
FORCE_HTTPS=true
PORT=8000
```

```typescript
const app = new Router({
  forceHttps: Deno.env.get("FORCE_HTTPS") === "true",
});

Deno.serve({
  port: parseInt(Deno.env.get("PORT") ?? "8000"),
}, app.handleRequest.bind(app));
```

### HTTPS local (dev)

```bash
# Gere certificados com mkcert
mkcert localhost
```

```typescript
const cert = await Deno.readTextFile("./localhost.pem");
const key = await Deno.readTextFile("./localhost-key.pem");

Deno.serve({
  port: 8443,
  cert,
  key,
}, app.handleRequest.bind(app));
```

### Graceful shutdown

```typescript
const server = Deno.serve({ port: 8000 }, app.handleRequest.bind(app));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  Deno.addSignalListener(signal, () => {
    console.log("🛑 Encerrando...");
    app.closeAllWebSockets();
    server.shutdown().then(() => Deno.exit(0));
  });
}
```

---

## 🚢 Deploy

### Deno Deploy (HTTPS automático)

```bash
deno install -A jsr:@deno/deployctl
deployctl deploy --project=meu-router example/main.ts
```

✅ Certificado SSL automático  
✅ HTTP/2 e HTTP/3 nativos  
✅ CDN global

### Docker

```dockerfile
FROM denoland/deno:latest
WORKDIR /app
COPY . .
RUN deno cache example/main.ts
EXPOSE 8000
CMD ["run", "--allow-net", "--allow-read", "example/main.ts"]
```

### Executável standalone

```bash
deno compile \
  --allow-net \
  --allow-read \
  --include=./public/**/* \
  --output=meu-servidor \
  example/main.ts
```

---

## 🧪 Testes

O projeto possui **80+ testes** cobrindo:

- ✅ Todos os métodos HTTP
- ✅ Catch-all e parâmetros nomeados
- ✅ Path Traversal (8 cenários de ataque)
- ✅ Middlewares (HTTP + WS)
- ✅ Dual Permission (receiver, sender, message)
- ✅ Last Broadcast (incluindo anti-vazamento entre salas)
- ✅ Error Handling (síncrono e assíncrono)
- ✅ Force HTTPS (localhost, proxy, produção)
- ✅ WebSockets reais (com `Deno.upgradeWebSocket`)
- ✅ Arquivos estáticos e embedded

```bash
# Rodar todos
deno task tests

# Rodar arquivo específico
deno test --allow-net --allow-read tests/middleware_test.ts

# Com coverage
deno test --coverage=cov/ tests/
deno coverage cov/
```

---

## ❓ FAQ & Troubleshooting

### Por que meu WebSocket não conecta?

Verifique se está passando os headers corretos em testes manuais:

```typescript
new Request("http://localhost/chat", {
  headers: {
    upgrade: "websocket",
    connection: "Upgrade",  // ⚠️ OBRIGATÓRIO no Deno
    "sec-websocket-version": "13",
    "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
  },
});
```

### O `forceHttps` redireciona localhost?

**Não.** O router detecta `localhost`, `127.0.0.1` e `::1` automaticamente para não atrapalhar o desenvolvimento.

### Como passo dados do middleware para o handler?

A Request é imutável, então crie uma **nova Request** com headers injetados:

```typescript
app.use(async (req, _p, next) => {
  const headers = new Headers(req.headers);
  headers.set("X-User-Id", "42");
  return next(new Request(req.url, { headers }));
});
```

### Qual a diferença entre `staticDir` e `embeddedDir`?

| | `staticDir` | `embeddedDir` |
|---|---|---|
| **Fonte** | Disco em runtime | Embutido no executável |
| **Uso** | Desenvolvimento / servidor tradicional | Binários compilados |
| **Permissão** | `--allow-read` | Nenhuma (já está no binário) |
| **Prioridade** | Segunda | Primeira |

### Posso usar com frameworks de frontend?

Sim! O router serve arquivos estáticos e aceita CORS configurável via middleware. Funciona perfeitamente com React, Vue, Svelte, etc.

---

## ⚖️ Comparação com Alternativas

| Feature | @loco/router | Hono | Oak | Fresh |
|---------|:------------:|:----:|:---:|:-----:|
| HTTP routing | ✅ | ✅ | ✅ | ✅ |
| WebSocket nativo | ✅ | ⚠️ | ⚠️ | ❌ |
| **Dual Params** | ✅ | ❌ | ❌ | ❌ |
| **Last Broadcast** | ✅ | ❌ | ❌ | ❌ |
| Middlewares unificados (HTTP+WS) | ✅ | ❌ | ❌ | ❌ |
| Path Traversal protection | ✅ | ⚠️ | ⚠️ | ✅ |
| Force HTTPS nativo | ✅ | ⚠️ | ❌ | ⚠️ |
| Zero dependências | ✅ | ✅ | ❌ | ❌ |
| URL Pattern API | ✅ | ⚠️ | ❌ | ⚠️ |

✅ Nativo | ⚠️ Via plugin/manual | ❌ Não suporta

---

## 🗺️ Roadmap

- [ ] **v1.1** - Rate limiting nativo via middleware
- [ ] **v1.2** - Suporte a Server-Sent Events (SSE)
- [ ] **v1.3** - Compressão gzip/brotli automática
- [ ] **v2.0** - Context object (estado compartilhado middleware→handler)
- [ ] **v2.1** - Router groups (`app.group("/admin", ...)`)
- [ ] **v2.2** - OpenAPI auto-generation

---

## 🤝 Contribuindo

Contribuições são bem-vindas! 

1. Fork o repositório
2. Crie uma branch (`git checkout -b feature/minha-feature`)
3. Commit suas mudanças (`git commit -m 'feat: adiciona X'`)
4. Push para a branch (`git push origin feature/minha-feature`)
5. Abra um Pull Request

### Convenções de commit

Usamos [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` nova funcionalidade
- `fix:` correção de bug
- `docs:` documentação
- `test:` testes
- `refactor:` refatoração

---

## 📄 Licença

MIT © Loco Framework

---

<div align="center">

**Feito com ❤️ para a comunidade Deno**

Se este projeto te ajudou, considere dar uma ⭐ no repositório!

</div>