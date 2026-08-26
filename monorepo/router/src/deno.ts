// monorepo/router/src/deno.ts
import { Router } from "./mod.ts";
import { denoWebSocketUpgrader, createDenoStaticFileHandler } from "./adapters/deno.ts";

export interface DenoRouterOptions {
  basePath?: string;
  staticDir?: string | null;
  embeddedDir?: string | null;
  forceHttps?: boolean;
  lastBroadcastDelay?: number;
}

/**
 * Cria um Router pré-configurado para Deno.
 * Suporta tanto passagem de opções via objeto quanto via argumentos posicionais.
 */
export function createDenoRouter(
  basePathOrOptions: string | DenoRouterOptions = "",
  staticDir: string | null = "public",
  embeddedDir: string | null = null,
  forceHttps: boolean = false,
  lastBroadcastDelay?: number,
): Router {
  let options: DenoRouterOptions;
  
  if (typeof basePathOrOptions === "string") {
    options = {
      basePath: basePathOrOptions,
      staticDir,
      embeddedDir,
      forceHttps,
      lastBroadcastDelay,
    };
  } else {
    options = basePathOrOptions;
  }

  const {
    basePath = "",
    staticDir: sDir = "public",
    embeddedDir: eDir = null,
    forceHttps: fHttps = false,
    lastBroadcastDelay: lDelay,
  } = options;

  const router = new Router({
    basePath,
    forceHttps: fHttps,
    lastBroadcastDelay: lDelay,
    webSocketUpgrader: denoWebSocketUpgrader,
    staticFileHandler: sDir || eDir
      ? createDenoStaticFileHandler(sDir, eDir)
      : undefined,
  });
  
  return router;
}

// Re-exporta tudo do core
export * from "./mod.ts";
export { denoWebSocketUpgrader, createDenoStaticFileHandler } from "./adapters/deno.ts";