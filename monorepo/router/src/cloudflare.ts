// monorepo/router/src/cloudflare.ts
// ☁️ Entry point para Cloudflare Workers
import { Router } from "./mod.ts";
import {
  cloudflareWebSocketUpgrader,
  createR2StaticFileHandler,
  createKVStaticFileHandler,
} from "./adapters/cloudflare.ts";
import type { R2Bucket, KVNamespace } from "./adapters/cloudflare-types.ts";

export function createCloudflareRouter(options: {
  basePath?: string;
  forceHttps?: boolean;
  lastBroadcastDelay?: number;
  r2Bucket?: R2Bucket;
  kvNamespace?: KVNamespace;
}): Router {
  const {
    basePath = "",
    forceHttps = false,
    lastBroadcastDelay,
    r2Bucket,
    kvNamespace,
  } = options;

  let staticFileHandler;
  if (r2Bucket) {
    staticFileHandler = createR2StaticFileHandler(r2Bucket);
  } else if (kvNamespace) {
    staticFileHandler = createKVStaticFileHandler(kvNamespace);
  }

  const router = new Router({
    basePath,
    forceHttps,
    lastBroadcastDelay,
    webSocketUpgrader: cloudflareWebSocketUpgrader,
    staticFileHandler,
  });
  return router;
}

export * from "./mod.ts";
export {
  cloudflareWebSocketUpgrader,
  createR2StaticFileHandler,
  createKVStaticFileHandler,
} from "./adapters/cloudflare.ts";