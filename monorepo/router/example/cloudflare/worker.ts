// monorepo/router/example/cloudflare/worker.ts
// ☁️ Exemplo de uso em Cloudflare Workers
import { createCloudflareRouter } from "../../src/cloudflare.ts";
import type { R2Bucket, KVNamespace } from "../../src/adapters/cloudflare-types.ts";

// Tipos do Cloudflare Workers
interface Env {
  MY_BUCKET: R2Bucket;
  MY_KV: KVNamespace;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const app = createCloudflareRouter({
      basePath: "/api",
      forceHttps: true,
      r2Bucket: env.MY_BUCKET,
    });

    app.use(async (req, _params, next) => {
      const start = Date.now();
      const res = await next();
      const ms = Date.now() - start;
      console.log(`📝 ${req.method} ${req.url} - ${res.status} (${ms}ms)`);
      return res;
    });

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

    app.get("/hello", () => ({
      body: JSON.stringify({ message: "Hello from Cloudflare Workers!" }),
      init: { headers: { "Content-Type": "application/json" } },
    }));
    
    app.get("/users/:id", (_req, params) => ({
      body: JSON.stringify({ id: params.id, name: "João" }),
      init: { headers: { "Content-Type": "application/json" } },
    }));

    app.ws("/chat/:room/:user", (ws, _req, params) => {
      const room = params.room as string;
      const user = params.user as string;
      console.log(`[WS] ✅ ${user} entrou na sala ${room}`);
      const group = app.getWsGroupByPath("/chat/:room/:user");
      if (!group) {
        ws.close(1011, "Internal error");
        return;
      }
      ws.onmessage = (event) => {
        group.broadcast(
          `[${user}]: ${event.data}`,
          (receiverParams, senderParams) => receiverParams.room === senderParams.room,
          params,
        );
      };
      ws.onclose = () => {
        console.log(`[WS] ❌ ${user} saiu da sala ${room}`);
      };
    });
    
    return app.handleRequest(req);
  },
};