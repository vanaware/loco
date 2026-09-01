
/// <reference types="@cloudflare/workers-types" />

import { sendResponse, handlePreflight } from "./shared.ts";
import { handlePing } from "./functions/ping.ts";
import { handlePublicKey } from "./functions/publickey.ts";
import { handlePush } from "./functions/push.ts";

import type { ExportedHandler } from "@cloudflare/workers-types";

const workerHandler : ExportedHandler  = {
  // deno-lint-ignore no-explicit-any
  async fetch(request: Request, env: any, _ctx: any): Promise<Response> {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname;
      const method = request.method;

      if (method === "OPTIONS") {
          return handlePreflight(request);
      }

      if (method === "POST") {
        // Roteamento explícito delegando a execução para os handlers importados
        switch (pathname) {
          case "/ping":
            return await handlePing(request, env);

          case "/publickey":
            return await handlePublicKey(request, env);

          case "/push":
            return await handlePush(request, env);

          default:
            return sendResponse(request, { error: `Rota '${pathname}' não encontrada no Worker.` }, 404);
        }
      } else {
        return sendResponse(request, { error: `Método '${method}' não encontrado no Worker.` }, 404);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // [WORKER EXCEPTION]: ${errorMessage}
      return sendResponse(request, { success: false, error: errorMessage }, 400);
    }
  },
};

export default workerHandler;