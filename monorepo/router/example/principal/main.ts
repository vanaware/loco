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