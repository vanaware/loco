import { createDenoRouter } from "@loco/router/deno";
import workerHandler from "./worker.ts";

const env = Deno.env.toObject();
const ctx = {
  waitUntil: (p: Promise<unknown>) => { p.catch(console.error); },
  passThroughOnException: () => {},
};

const app = createDenoRouter({
  basePath: "",
  staticDir: "./build/dist",
});

// Rotas do router (têm prioridade sobre o worker)
app.get("/health", () => ({ body: "OK" }));

// Worker como fallback (antes de static files)
app.worker((req) => workerHandler.fetch(req, env, ctx));

Deno.serve({ port: 8000 }, app.handleRequest.bind(app));