// monorepo/router/example/jwt/main.ts
import { createDenoRouter } from "../../src/deno.ts";
import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = "meu-segredo-super-secreto-123";
const encoder = new TextEncoder();
const app = createDenoRouter({ basePath: "/api", staticDir: "./public" });

// ✅ Middleware de autenticação: bloqueia ANTES do upgrade
app.use(async (req, _params, next) => {
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return await next();
  }
  const protocol = req.headers.get("sec-websocket-protocol") ?? "";
  const protocols = protocol.split(",").map((p) => p.trim());
  const bearerIndex = protocols.findIndex((p) => p === "Bearer");
  const token = bearerIndex !== -1 ? protocols[bearerIndex + 1] : null;
  if (!token) {
    console.error("[Middleware] ❌ Token ausente");
    return new Response("Token required", { status: 401 });
  }
  try {
    await jwtVerify(token, encoder.encode(JWT_SECRET));
    console.log("[Middleware] ✅ Token válido, permitindo upgrade");
    return await next();
  } catch {
    console.error("[Middleware] ❌ Token inválido");
    return new Response("Invalid token", { status: 403 });
  }
});

app.ws("/chat/:room", (ws, _req, params) => {
  const room = params.room as string;
  const group = app.getWsGroupByPath("/chat/:room");
  if (!group) return;
  ws.onmessage = (event) => {
    group.broadcast(
      `[room ${room}]: ${event.data}`,
      (receiver, sender, _msg) => receiver.room === sender.room,
      params,
    );
  };
});

Deno.serve({ port: 8000 }, app.handleRequest.bind(app));