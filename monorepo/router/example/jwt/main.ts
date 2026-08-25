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