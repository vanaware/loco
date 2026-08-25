// monorepo/router/example/principal/main.ts
import { Router } from "../../src/mod.ts";

const app = new Router("/api", "./public", null);

// ============================================================
// 🛡️ MIDDLEWARES GLOBAIS (Executam antes de qualquer rota)
// ============================================================

// 1. Middleware de Log (Mede tempo de resposta)
app.use(async (req, _params, next) => {
  const start = Date.now();
  const res = await next(); // Chama o próximo middleware ou a rota
  const ms = Date.now() - start;
  console.log(`📝 ${req.method} ${req.url} - ${res.status} (${ms}ms)`);
  return res;
});

// 2. Middleware de CORS Global (Substitui a necessidade de app.options)
app.use(async (req, _params, next) => {
  // Se for preflight (OPTIONS), já responde na hora
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
  
  // Se for outra requisição, deixa passar e injeta o header na resposta
  const res = await next();
  res.headers.set("Access-Control-Allow-Origin", "*");
  return res;
});

// 3. Middleware de Segurança (Ex: Bloqueia usuários banidos)
const bannedIPs = ["192.168.1.100"];
app.use(async (req, _params, next) => {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (bannedIPs.includes(ip)) {
    return new Response("Forbidden", { status: 403 });
  }
  return await next();
});

// ============================================================
// 🚀 ROTAS HTTP
// ============================================================
app.get("/:id/:tipo", (_req, params) => {
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

// ============================================================
// 📡 WEBSOCKET (Continua igual, pois WS tem seu próprio upgrade)
// ============================================================
app.ws("/chat/:room/:user", (ws, _req, params) => {
  const room = params.room as string;
  const user = params.user as string;
  const group = app.getWsGroupByPath("/chat/:room/:user");
  if (!group) return ws.close(1011, "Internal error");

  ws.onmessage = (event) => {
    group.broadcast(
      `[${user}]: ${event.data}`,
      (receiverParams, senderParams, _msg) => receiverParams.room === senderParams.room,
      params
    );
  };
});

// ============================================================
// 🏁 Inicia o servidor
// ============================================================
const server = Deno.serve({ port: 8000 }, app.handleRequest.bind(app));
console.log("🚀 Servidor rodando em http://localhost:8000");