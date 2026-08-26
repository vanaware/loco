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
