// monorepo/router/src/adapters/cloudflare.ts
import type { WebSocketUpgrader, StaticFileHandler } from "../mod.ts";
import type { R2Bucket, KVNamespace } from "./cloudflare-types.ts";

/**
 * Adaptador de WebSocket para Cloudflare Workers.
 * Usa WebSocketPair nativo do Workers.
 */
export const cloudflareWebSocketUpgrader: WebSocketUpgrader = {
  upgrade(req: Request): { socket: WebSocket; response: Response } {
    // @ts-ignore: Cloudflare Workers specific global
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    
    // @ts-ignore: Cloudflare Workers specific method
    server.accept();
    
    const response = new Response(null, {
      status: 101,
      // @ts-ignore: Cloudflare Workers specific ResponseInit property
      webSocket: client,
    });
    return { socket: server, response };
  },
};

/**
 * Cria um handler de arquivos estáticos para Cloudflare Workers.
 * Usa R2 Bucket para servir arquivos.
 */
export function createR2StaticFileHandler(bucket: R2Bucket): StaticFileHandler {
  return {
    async handle(path: string): Promise<Response | null> {
      try {
        const object = await bucket.get(path);
        if (!object) return null;
        return new Response(object.body, {
          headers: {
            "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
            "ETag": object.etag,
            "Cache-Control": object.httpMetadata?.cacheControl ?? "public, max-age=3600",
          },
        });
      } catch {
        return null;
      }
    },
  };
}

/**
 * Cria um handler de arquivos estáticos usando Cloudflare KV.
 */
export function createKVStaticFileHandler(kv: KVNamespace): StaticFileHandler {
  return {
    async handle(path: string): Promise<Response | null> {
      try {
        const content = await kv.get(path, "arrayBuffer");
        if (!content) return null;
        const ext = path.split(".").pop()?.toLowerCase() ?? "";
        const contentType = getContentType(ext);
        return new Response(content, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=3600",
          },
        });
      } catch {
        return null;
      }
    },
  };
}

function getContentType(ext: string): string {
  const map: Record<string, string> = {
    html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
    css: "text/css; charset=utf-8", js: "application/javascript; charset=utf-8",
    json: "application/json; charset=utf-8", png: "image/png",
    jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    svg: "image/svg+xml", ico: "image/x-icon", txt: "text/plain; charset=utf-8",
    pdf: "application/pdf", xml: "application/xml", woff: "font/woff",
    woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
    mp3: "audio/mpeg", mp4: "video/mp4", webm: "video/webm",
    wasm: "application/wasm",
  };
  return map[ext] ?? "application/octet-stream";
}