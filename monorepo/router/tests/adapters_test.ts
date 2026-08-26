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