# Deno Router Library

Uma biblioteca de roteamento moderna e flexível para Deno, construída sobre a **URL Pattern API** nativa. Suporta rotas HTTP, WebSockets com sistema de grupos e broadcast inteligente, arquivos estáticos (locais e embarcados em executáveis), e parâmetros dinâmicos com catch-all.

## 🚀 Características

- ✅ **URL Pattern API nativa** - Padrão web moderno para matching de rotas
- ✅ **HTTP completo** - Métodos `.get()`, `.post()`, `.put()`, `.delete()`
- ✅ **WebSockets** - Rota dedicada com `.ws()` e sistema de grupos
- ✅ **Broadcast inteligente** - Com função de permissão por cliente
- ✅ **Histórico de broadcast** - Novos membros recebem a última mensagem automaticamente
- ✅ **Arquivos estáticos** - Servidos de pasta local ou embarcados no executável
- ✅ **Catch-all flexível** - Parâmetro `catch` como array para múltiplos wildcards
- ✅ **Base path configurável** - Para deploy em subpastas (ex: `/servidor/`)
- ✅ **MIME types automáticos** - Resolução inteligente por extensão
- ✅ **Graceful shutdown** - Fechamento limpo de WebSockets em sinais SIGINT/SIGTERM

---

## 📦 Instalação

### Via GitHub (recomendado)

```typescript
import { Router } from "https://raw.githubusercontent.com/vanaware/loco/main/monorepo/router/mod.ts";
```

### Cópia local

```typescript
import { Router } from "./mod.ts";
```

---

## 🏗️ Construtor do Router

```typescript
new Router(basePath, staticDir, embeddedDir, mimeTypeResolver)
```

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|--------|-----------|
| `basePath` | `string` | `''` | Prefixo aplicado a todas as rotas (ex: `/api`) |
| `staticDir` | `string \| null` | `'public'` | Pasta de arquivos estáticos. `null` desabilita |
| `embeddedDir` | `string \| null` | `null` | Prefixo para arquivos embarcados no executável |
| `mimeTypeResolver` | `function` | interna | Função `(ext: string) => string \| undefined` |

### Exemplo básico

```typescript
const app = new Router('/api', './public', null);
```

### Exemplo com arquivos embarcados

```typescript
// Para executáveis compilados com: deno compile --include=public/* main.ts
const app = new Router('/api', './public', import.meta.dirname);
```

---

## 🌐 Rotas HTTP

### Métodos disponíveis

```typescript
app.get(path, handler)
app.post(path, handler)
app.put(path, handler)
app.delete(path, handler)
```

### Assinatura do handler

```typescript
(req: Request, params: Record<string, string | string[]>) => {
  body: BodyInit;
  init?: ResponseInit;
}
```

### Exemplos

#### Rota simples

```typescript
app.get('/hello', (req, params) => {
  return {
    body: 'Hello, World!',
    init: { headers: { 'Content-Type': 'text/plain' } }
  };
});
```

#### Rota com parâmetros

```typescript
app.get('/users/:id/posts/:postId', (req, params) => {
  return {
    body: JSON.stringify({
      userId: params.id,
      postId: params.postId
    }),
    init: { headers: { 'Content-Type': 'application/json' } }
  };
});
// GET /users/42/posts/7 → { userId: "42", postId: "7" }
```

#### Rota POST com body

```typescript
app.post('/users', async (req, params) => {
  const data = await req.json();
  return {
    body: JSON.stringify({ created: data }),
    init: { status: 201, headers: { 'Content-Type': 'application/json' } }
  };
});
```

---

## 🎯 Catch-all e Parâmetro `catch`

A biblioteca usa a **URL Pattern API** nativa. Quando você usa `*` (wildcard), o valor capturado é armazenado no parâmetro `catch` como **array**.

### Regras de matching

| Padrão | URL | `params` |
|--------|-----|----------|
| `/files/*` | `/files/docs/readme.md` | `{ catch: ["docs/readme.md"] }` |
| `/a/*/b/*/c` | `/a/x/b/y/z/c` | `{ catch: ["x", "y/z"] }` |
| `/api/:id/*` | `/api/42/foo/bar` | `{ id: "42", catch: ["foo/bar"] }` |

### Exemplo

```typescript
app.get('/files/*', (req, params) => {
  const path = (params.catch as string[])[0];
  return {
    body: `Arquivo solicitado: ${path}`,
    init: { status: 200 }
  };
});
```

> **Nota:** O `*` captura tudo até o próximo delimitador fixo ou fim da URL.

---

## 📂 Arquivos Estáticos

### Pasta local (`staticDir`)

Quando uma rota HTTP não é encontrada, o router tenta servir arquivos da pasta `staticDir`.

**Comportamentos:**

1. **Arquivo exato encontrado** → servido com MIME type correto
2. **Pasta sem `/` final** → busca `index.html` ou `index.htm`
3. **Pasta com `/` final** → busca `index.html` ou `index.htm`
4. **Arquivo sem extensão** → tenta `.html` e `.htm` automaticamente
5. **Nada encontrado** → retorna 404

### Arquivos embarcados (`embeddedDir`)

Quando você compila com `deno compile --include=...`, os arquivos ficam disponíveis via `import.meta.dirname`.

**Prioridade:**
1. Primeiro tenta o arquivo embarcado (`embeddedDir`)
2. Se não encontrado, tenta a pasta local (`staticDir`)

### Exemplo de compilação

```bash
deno compile --include=public/* --allow-net --allow-read main.ts
```

### Desabilitar estáticos

```typescript
const app = new Router('/api', null, null); // Nenhum arquivo estático
```

---

## 🔌 WebSockets

### Rota WebSocket

```typescript
app.ws(path, handler)
```

### Assinatura do handler

```typescript
(ws: WebSocket, req: Request, params: Record<string, string | string[]>) => void
```

### Exemplo básico

```typescript
app.ws('/chat/:room/:user', (ws, req, params) => {
  console.log(`Conectado: ${params.user} na sala ${params.room}`);

  ws.onmessage = (event) => {
    console.log(`Mensagem de ${params.user}: ${event.data}`);
    ws.send(`Echo: ${event.data}`);
  };

  ws.onclose = () => {
    console.log(`${params.user} desconectou`);
  };

  ws.onerror = (event) => {
    console.error('Erro:', event);
  };
});
```

---

## 👥 Grupos de WebSocket

Cada rota `.ws()` cria automaticamente um **grupo** que gerencia todos os clientes conectados àquela rota.

### Obtendo um grupo

```typescript
const group = app.getWsGroupByPath('/api/chat/:room/:user');
```

### Métodos do grupo

#### `broadcast(message, permissionFn?)`

Envia mensagem para todos os membros do grupo.

```typescript
group.broadcast('Olá a todos!', (clientParams, message) => {
  // Retorna true para enviar, false para pular
  return clientParams.room === 'geral';
});
```

#### `closeGroup()`

Fecha todas as conexões do grupo.

```typescript
group.closeGroup();
```

### Exemplo completo com broadcast

```typescript
app.ws('/chat/:room/:user', (ws, req, params) => {
  const group = app.getWsGroupByPath('/api/chat/:room/:user');
  if (!group) return;

  ws.onmessage = (event) => {
    // Broadcast para todos na mesma sala
    group.broadcast(
      `${params.user}: ${event.data}`,
      (clientParams, msg) => clientParams.room === params.room
    );
  };
});
```

---

## 📜 Histórico de Broadcast (Last Broadcast)

**Funcionalidade especial:** O último broadcast de cada grupo é armazenado. Quando um **novo membro se conecta**, ele recebe automaticamente a última mensagem broadcastada (se atender aos critérios de permissão).

### O que é armazenado

- A mensagem enviada
- A função de permissão usada
- Os parâmetros do contexto original

### Exemplo prático

```typescript
// Cliente A envia mensagem às 10:00
// Cliente B conecta às 10:05
// → Cliente B recebe automaticamente a mensagem das 10:00
```

```typescript
app.ws('/news/:topic', (ws, req, params) => {
  const group = app.getWsGroupByPath('/api/news/:topic');
  if (!group) return;

  ws.onmessage = (event) => {
    group.broadcast(
      `[${params.topic}] ${event.data}`,
      (clientParams, msg) => clientParams.topic === params.topic
    );
  };
});
```

> **Importante:** O envio ao novo membro respeita a `permissionFn` original do broadcast.

---

## 🔒 Graceful Shutdown

Feche todas as conexões WebSocket ao desligar o servidor:

```typescript
const server = Deno.serve(app.handleRequest.bind(app));

const shutdownSignals = ['SIGINT', 'SIGTERM'] as const;

for (const signal of shutdownSignals) {
  Deno.addSignalListener(signal, () => {
    console.log(`Recebido ${signal}. Encerrando...`);
    app.closeAllWebSockets();
    server.shutdown().then(() => {
      console.log('Servidor encerrado.');
      Deno.exit(0);
    });
  });
}
```

---

## 🎨 MIME Type Resolver Personalizado

```typescript
const myResolver = (ext: string): string | undefined => {
  const map: Record<string, string> = {
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'svg': 'image/svg+xml',
    'wasm': 'application/wasm',
    // ... adicione o que precisar
  };
  return map[ext.toLowerCase()];
};

const app = new Router('/api', './public', null, myResolver);
```

---

## 📋 Exemplo Completo

```typescript
import { Router } from "https://raw.githubusercontent.com/vanaware/loco/main/monorepo/router/src/mod.ts";

const app = new Router('/api', './public', import.meta.dirname);

// === ROTAS HTTP ===

app.get('/users/:id', (req, params) => ({
  body: JSON.stringify({ id: params.id }),
  init: { headers: { 'Content-Type': 'application/json' } }
}));

app.post('/users', async (req) => {
  const data = await req.json();
  return {
    body: JSON.stringify({ created: true, data }),
    init: { status: 201, headers: { 'Content-Type': 'application/json' } }
  };
});

// === CATCH-ALL ===

app.get('/docs/*', (req, params) => ({
  body: `Documentação: ${(params.catch as string[])[0]}`,
  init: { status: 200 }
}));

// === WEBSOCKET ===

app.ws('/chat/:room/:user', (ws, req, params) => {
  const group = app.getWsGroupByPath('/api/chat/:room/:user');
  if (!group) return;

  console.log(`✅ ${params.user} entrou em ${params.room}`);

  ws.onmessage = (event) => {
    console.log(`💬 ${params.user}: ${event.data}`);

    // Broadcast apenas para quem está na mesma sala
    group.broadcast(
      `${params.user}: ${event.data}`,
      (clientParams) => clientParams.room === params.room
    );
  };

  ws.onclose = () => {
    console.log(`❌ ${params.user} saiu de ${params.room}`);
  };
});

// === SERVIDOR ===

const server = Deno.serve({ port: 8000 }, app.handleRequest.bind(app));

// Graceful shutdown
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  Deno.addSignalListener(signal, () => {
    console.log(`🛑 ${signal} recebido. Encerrando...`);
    app.closeAllWebSockets();
    server.shutdown().then(() => Deno.exit(0));
  });
}
```

---

## 🧪 Testando

### Executar em desenvolvimento

```bash
deno run --allow-net --allow-read main.ts
```

### Compilar como executável com assets embarcados

```bash
deno compile --include=public/* --allow-net --allow-read main.ts
```

### Testar com curl

```bash
# HTTP
curl http://localhost:8000/api/users/42

# WebSocket (use wscat ou navegador)
wscat -c ws://localhost:8000/api/chat/sala1/joao
```

---

## 📁 Estrutura recomendada

```
meu-projeto/
├── main.ts              # Entry point
├── public/              # Arquivos estáticos
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── deno.json            # Configuração Deno (opcional)
```

---

## 🐛 Troubleshooting

| Problema | Solução |
|----------|---------|
| Arquivo estático não encontrado | Verifique se `staticDir` está correto e permissões `--allow-read` |
| WebSocket 404 | Confirme que o path bate com `.ws()` registrado |
| Broadcast não chega | Verifique a `permissionFn` - ela deve retornar `true` |
| Novo membro não recebe último broadcast | Confirme que houve ao menos um `broadcast()` antes da conexão |
| `import.meta.dirname` undefined | Use apenas em arquivos compilados ou módulos ES |

---

## 📄 Licença

MIT License - veja arquivo LICENSE para detalhes.

---

## 🔗 Recursos

- [Deno Documentation](https://deno.land/)
- [URL Pattern API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API)
- [WebSocket API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
# @loco/router

Uma biblioteca de roteamento moderna e flexível para **Deno**, construída sobre a **URL Pattern API** nativa. Suporta rotas HTTP completas, WebSockets com sistema de grupos e broadcast inteligente, arquivos estáticos (locais e embarcados em executáveis) e parâmetros dinâmicos com catch-all.

## 🚀 Características

- ✅ **URL Pattern API nativa** — padrão web moderno para matching de rotas
- ✅ **HTTP completo** — métodos `.get()`, `.post()`, `.put()`, `.delete()`, `.patch()`, `.options()`, `.head()`
- ✅ **CORS integrado** — helper para preflight e headers customizados
- ✅ **WebSockets** — rota dedicada com `.ws()` e sistema de grupos
- ✅ **Broadcast inteligente** — com função de permissão por cliente
- ✅ **Histórico de broadcast** — novos membros recebem a última mensagem automaticamente
- ✅ **Arquivos estáticos** — servidos de pasta local ou embarcados no executável
- ✅ **Proteção contra Path Traversal** — segurança contra ataques `../`
- ✅ **Catch-all flexível** — parâmetro `catch` como array para múltiplos wildcards
- ✅ **Base path configurável** — para deploy em subpastas (ex: `/api/`)
- ✅ **MIME types automáticos** — resolução inteligente por extensão
- ✅ **Graceful shutdown** — fechamento limpo de WebSockets em sinais SIGINT/SIGTERM

---

## 📦 Instalação

### Via JSR (recomendado)

```typescript
import { Router } from "jsr:@loco/router";
```

### Via GitHub

```typescript
import { Router } from "https://raw.githubusercontent.com/yourusername/router/main/src/mod.ts";
```

### Clone local

```bash
git clone https://github.com/yourusername/router.git
```

```typescript
import { Router } from "./router/src/mod.ts";
```

---

## 🏗️ Construtor

```typescript
new Router(basePath, staticDir, embeddedDir, mimeTypeResolver)
```

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|--------|-----------|
| `basePath` | `string` | `""` | Prefixo aplicado a todas as rotas (ex: `/api`) |
| `staticDir` | `string \| null` | `"public"` | Pasta de arquivos estáticos. `null` desabilita |
| `embeddedDir` | `string \| null` | `null` | Prefixo para arquivos embarcados no executável |
| `mimeTypeResolver` | `function` | interna | Função `(ext: string) => string \| undefined` |

### Exemplo básico

```typescript
const app = new Router("/api", "./public", null);
```

### Exemplo com arquivos embarcados

```typescript
// Para executáveis compilados com: deno compile --include=public/* main.ts
const app = new Router("/api", "./public", import.meta.dirname);
```

---

## 🌐 Rotas HTTP

### Métodos disponíveis

```typescript
app.get(path, handler)
app.post(path, handler)
app.put(path, handler)
app.delete(path, handler)
app.patch(path, handler)
app.options(path, handler)
app.head(path, handler)
```

### Assinatura do handler

```typescript
(req: Request, params: RouteParams) => {
  body: BodyInit;
  init?: ResponseInit;
}
// ou
(req: Request, params: RouteParams) => Promise<{ body: BodyInit; init?: ResponseInit }>
```

### Exemplos

#### Rota simples

```typescript
app.get("/hello", () => ({
  body: "Hello, World!",
  init: { headers: { "Content-Type": "text/plain" } },
}));
```

#### Rota com parâmetros

```typescript
app.get("/users/:id/posts/:postId", (_req, params) => ({
  body: JSON.stringify({
    userId: params.id,
    postId: params.postId,
  }),
  init: { headers: { "Content-Type": "application/json" } },
}));
// GET /users/42/posts/7 → { userId: "42", postId: "7" }
```

#### Rota POST com body

```typescript
app.post("/users", async (req) => {
  const data = await req.json();
  return {
    body: JSON.stringify({ created: data }),
    init: { status: 201, headers: { "Content-Type": "application/json" } },
  };
});
```

---

## 🔐 CORS

### Configuração básica (permitir todas as origens)

Registre uma rota `OPTIONS` catch-all **antes** das outras rotas:

```typescript
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
```

### Helper para adicionar CORS em todas as respostas

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function withCors(init: ResponseInit = {}): ResponseInit {
  return {
    ...init,
    headers: { ...corsHeaders, ...(init.headers ?? {}) },
  };
}

// Uso
app.get("/users/:id", (_req, params) => ({
  body: JSON.stringify({ id: params.id }),
  init: withCors({ headers: { "Content-Type": "application/json" } }),
}));
```

### CORS restritivo (origens específicas)

```typescript
const allowedOrigins = new Set(["https://meusite.com", "https://app.meusite.com"]);

app.options("/*", (req) => {
  const origin = req.headers.get("origin") ?? "";
  const allow = allowedOrigins.has(origin);
  return {
    body: "",
    init: {
      status: allow ? 204 : 403,
      headers: allow ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      } : {},
    },
  };
});
```

---

## 🎯 Catch-all e Parâmetro `catch`

A biblioteca usa a **URL Pattern API** nativa. Quando você usa `*` (wildcard), o valor capturado é armazenado no parâmetro `catch` como **array**.

### Regras de matching

| Padrão | URL | `params` |
|--------|-----|----------|
| `/files/*` | `/files/docs/readme.md` | `{ catch: ["docs/readme.md"] }` |
| `/a/*/b/*/c` | `/a/x/b/y/z/c` | `{ catch: ["x", "y/z"] }` |
| `/api/:id/*` | `/api/42/foo/bar` | `{ id: "42", catch: ["foo/bar"] }` |

### Exemplo

```typescript
app.get("/files/*", (_req, params) => ({
  body: `Arquivo: ${(params.catch as string[])[0]}`,
  init: { status: 200 },
}));
```

> **Nota:** O `*` captura tudo até o próximo delimitador fixo ou fim da URL.

---

## 📂 Arquivos Estáticos

### Pasta local (`staticDir`)

Quando uma rota HTTP não é encontrada, o router tenta servir arquivos da pasta `staticDir`.

**Comportamentos:**

1. **Arquivo exato encontrado** → servido com MIME type correto
2. **Pasta sem `/` final** → busca `index.html` ou `index.htm`
3. **Pasta com `/` final** → busca `index.html` ou `index.htm`
4. **Arquivo sem extensão** → tenta `.html` e `.htm` automaticamente
5. **Nada encontrado** → retorna 404

### Arquivos embarcados (`embeddedDir`)

Quando você compila com `deno compile --include=...`, os arquivos ficam disponíveis via `import.meta.dirname`.

**Prioridade:**
1. Primeiro tenta o arquivo embarcado (`embeddedDir`)
2. Se não encontrado, tenta a pasta local (`staticDir`)

### Proteção contra Path Traversal

A biblioteca protege automaticamente contra ataques de path traversal (`../`). Tentativas de acessar arquivos fora do diretório configurado retornam 404.

```bash
# Estes ataques são bloqueados:
GET /../secret.txt          → 404
GET /subdir/../../etc/passwd → 404
GET /..%2Fsecret.txt         → 404
```

### Exemplo de compilação

```bash
deno compile --include=public/* --allow-net --allow-read main.ts
```

### Desabilitar estáticos

```typescript
const app = new Router("/api", null, null); // Nenhum arquivo estático
```

---

## 🔌 WebSockets

### Rota WebSocket

```typescript
app.ws(path, handler)
```

### Assinatura do handler

```typescript
(ws: WebSocket, req: Request, params: RouteParams) => void
```

### Exemplo básico

```typescript
app.ws("/chat/:room/:user", (ws, _req, params) => {
  console.log(`Conectado: ${params.user} na sala ${params.room}`);

  ws.onmessage = (event) => {
    console.log(`Mensagem de ${params.user}: ${event.data}`);
    ws.send(`Echo: ${event.data}`);
  };

  ws.onclose = () => console.log(`${params.user} desconectou`);
  ws.onerror = (ev) => console.error("Erro:", ev);
});
```

---

## 👥 Grupos de WebSocket

Cada rota `.ws()` cria automaticamente um **grupo** que gerencia todos os clientes conectados àquela rota.

### Obtendo um grupo

```typescript
const group = app.getWsGroupByPath("/chat/:room/:user");
```

### Métodos do grupo

#### `broadcast(message, permissionFn?, senderParams?)`

Envia mensagem para todos os membros do grupo.

```typescript
group.broadcast(
  "Olá a todos!",
  (clientParams, message) => clientParams.room === "geral",
  { room: "geral" }, // senderParams para reavaliação em novos membros
);
```

#### `sendLastBroadcastTo(ws, params)`

Envia o último broadcast para um socket específico (usado internamente quando um novo membro entra).

#### `closeGroup()`

Fecha todas as conexões do grupo.

```typescript
group.closeGroup();
```

### Exemplo completo com broadcast

```typescript
app.ws("/chat/:room/:user", (ws, _req, params) => {
  const group = app.getWsGroupByPath("/chat/:room/:user");
  if (!group) return;

  ws.onmessage = (event) => {
    // Broadcast para todos na mesma sala
    group.broadcast(
      `${params.user}: ${event.data}`,
      (clientParams) => clientParams.room === params.room,
      params, // importante: passa params do sender
    );
  };
});
```

---

## 📜 Histórico de Broadcast (Last Broadcast)

**Funcionalidade especial:** O último broadcast de cada grupo é armazenado. Quando um **novo membro se conecta**, ele recebe automaticamente a última mensagem broadcastada (se atender aos critérios de permissão).

### O que é armazenado

- A mensagem enviada
- A função de permissão usada
- Os parâmetros do sender original

### Exemplo prático

```typescript
// Cliente A envia mensagem às 10:00
// Cliente B conecta às 10:05
// → Cliente B recebe automaticamente a mensagem das 10:00
```

> **Importante:** O envio ao novo membro respeita a `permissionFn` original do broadcast, avaliada com os `senderParams`.

---

## 🔒 Graceful Shutdown

Feche todas as conexões WebSocket ao desligar o servidor:

```typescript
const server = Deno.serve({ port: 8000 }, app.handleRequest.bind(app));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  Deno.addSignalListener(signal, () => {
    console.log(`🛑 ${signal} recebido. Encerrando...`);
    app.closeAllWebSockets();
    server.shutdown().then(() => {
      console.log("✅ Servidor encerrado.");
      Deno.exit(0);
    });
  });
}
```

### Fechamento de grupo específico

```typescript
app.closeGroupByPath("/chat/:room/:user");
```

---

## 🎨 MIME Type Resolver Personalizado

```typescript
const myResolver = (ext: string): string | undefined => {
  const map: Record<string, string> = {
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    json: "application/json",
    png: "image/png",
    wasm: "application/wasm",
    // ... adicione o que precisar
  };
  return map[ext.toLowerCase()];
};

const app = new Router("/api", "./public", null, myResolver);
```

---

## 📋 Exemplo Completo

```typescript
import { Router } from "jsr:@loco/router";

const app = new Router("/api", "./public", import.meta.dirname);

// === CORS ===
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

function withCors(init: ResponseInit = {}): ResponseInit {
  return { ...init, headers: { ...corsHeaders, ...(init.headers ?? {}) } };
}

// === ROTAS HTTP ===

app.get("/users/:id", (_req, params) => ({
  body: JSON.stringify({ id: params.id }),
  init: withCors({ headers: { "Content-Type": "application/json" } }),
}));

app.post("/users", async (req) => {
  const data = await req.json();
  return {
    body: JSON.stringify({ created: true, data }),
    init: withCors({ status: 201, headers: { "Content-Type": "application/json" } }),
  };
});

// === CATCH-ALL ===

app.get("/docs/*", (_req, params) => ({
  body: `Documentação: ${(params.catch as string[])[0]}`,
  init: withCors({ status: 200 }),
}));

// === WEBSOCKET ===

app.ws("/chat/:room/:user", (ws, _req, params) => {
  const group = app.getWsGroupByPath("/chat/:room/:user");
  if (!group) return;

  console.log(`✅ ${params.user} entrou em ${params.room}`);

  ws.onmessage = (event) => {
    group.broadcast(
      `${params.user}: ${event.data}`,
      (clientParams) => clientParams.room === params.room,
      params,
    );
  };

  ws.onclose = () => console.log(`❌ ${params.user} saiu de ${params.room}`);
});

// === SERVIDOR ===

const server = Deno.serve({ port: 8000 }, app.handleRequest.bind(app));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  Deno.addSignalListener(signal, () => {
    app.closeAllWebSockets();
    server.shutdown().then(() => Deno.exit(0));
  });
}
```

---

## 🧪 Testando

### Executar em desenvolvimento

```bash
deno task dev
# ou
deno run --allow-net --allow-read --watch example/main.ts
```

### Compilar como executável com assets embarcados

```bash
deno compile --include=public/* --allow-net --allow-read main.ts
```

### Rodar a suíte de testes

```bash
deno task tests
```

### Testar com curl

```bash
# HTTP
curl http://localhost:8000/api/users/42

# CORS preflight
curl -i -X OPTIONS http://localhost:8000/api/users/42

# WebSocket (use wscat ou navegador)
wscat -c ws://localhost:8000/api/chat/sala1/joao
```

---

## 📁 Estrutura recomendada

```
monorepo/router/
├── src/
│   └── mod.ts              # Biblioteca
├── tests/
│   ├── router_http_test.ts
│   ├── router_catchall_test.ts
│   ├── router_static_test.ts
│   ├── websocket_group_test.ts
│   ├── websocket_real_test.ts
│   └── path_traversal_test.ts
├── example/
│   ├── main.ts             # Exemplo de uso
│   └── public/             # Arquivos estáticos
│       ├── index.html
│       └── broadcast.html
├── deno.jsonc
└── README.md
```

---

## 🐛 Troubleshooting

| Problema | Solução |
|----------|---------|
| Arquivo estático não encontrado | Verifique se `staticDir` está correto e permissões `--allow-read` |
| WebSocket 404 | Confirme que o path bate com `.ws()` registrado |
| Broadcast não chega | Verifique a `permissionFn` — ela deve retornar `true` |
| Novo membro não recebe último broadcast | Confirme que houve ao menos um `broadcast()` antes da conexão |
| CORS bloqueado no navegador | Registre rota `OPTIONS` catch-all e adicione headers nas respostas |
| `import.meta.dirname` undefined | Use apenas em arquivos compilados ou módulos ES |
| Path traversal funciona | Atualize para versão com `normalize()` do `@std/path` |

---

## 📄 Licença

MIT License

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Abra uma issue ou PR no repositório.

---

## 🔗 Recursos

- [Deno Documentation](https://deno.land/)
- [URL Pattern API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API)
- [WebSocket API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [CORS - MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)