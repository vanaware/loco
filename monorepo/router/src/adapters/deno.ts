// monorepo/router/src/adapters/deno.ts
// 🦕 Adaptadores para Deno Runtime
import { join } from "@std/path";
import type { WebSocketUpgrader, StaticFileHandler, MimeTypeResolver } from "../mod.ts";

/** Adaptador de WebSocket para Deno */
export const denoWebSocketUpgrader: WebSocketUpgrader = {
  upgrade(req: Request): { socket: WebSocket; response: Response } {
    return Deno.upgradeWebSocket(req);
  },
};

/** Cria um handler de arquivos estáticos para Deno */
export function createDenoStaticFileHandler(
  staticDir: string | null,
  embeddedDir: string | null = null,
  mimeTypeResolver?: MimeTypeResolver,
): StaticFileHandler {
  const resolver = mimeTypeResolver ?? defaultDenoMimeTypeResolver;

  return {
    async handle(path: string): Promise<Response | null> {
      // Tenta embedded primeiro, depois static
      if (embeddedDir) {
        const embedded = await tryServeDir(embeddedDir, path, resolver);
        if (embedded) return embedded;
      }
      if (staticDir) {
        const staticResp = await tryServeDir(staticDir, path, resolver);
        if (staticResp) return staticResp;
      }
      return null;
    },
  };
}

async function tryServeDir(
  baseDir: string,
  pathname: string,
  mimeTypeResolver: MimeTypeResolver,
): Promise<Response | null> {
  const candidates = buildFileCandidates(baseDir, pathname);
  for (const candidate of candidates) {
    try {
      const info = await Deno.stat(candidate);
      if (info.isFile) {
        const ext = candidate.split(".").pop()?.toLowerCase() ?? "";
        const mimeType = mimeTypeResolver(ext) ?? "application/octet-stream";
        const file = await Deno.open(candidate);
        return new Response(file.readable, {
          headers: { "Content-Type": mimeType },
        });
      }
    } catch (err) {
      if (!(err instanceof Deno.errors.NotFound)) {
        console.error(`Static file error: ${candidate}`, err);
        return new Response("Internal Server Error", { status: 500 });
      }
    }
  }
  return null;
}

function buildFileCandidates(baseDir: string, pathname: string): string[] {
  const fullPath = join(baseDir, pathname);
  const candidates: string[] = [fullPath];
  if (!/\.[a-zA-Z0-9]+$/.test(pathname)) {
    candidates.push(fullPath + ".html");
    candidates.push(fullPath + ".htm");
  }
  candidates.push(join(fullPath, "index.html"));
  candidates.push(join(fullPath, "index.htm"));
  return candidates;
}

function defaultDenoMimeTypeResolver(ext: string): string | undefined {
  const map: Record<string, string> = {
    html: "text/html; charset=utf-8",
    htm: "text/html; charset=utf-8",
    css: "text/css; charset=utf-8",
    js: "application/javascript; charset=utf-8",
    mjs: "application/javascript; charset=utf-8",
    json: "application/json; charset=utf-8",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    txt: "text/plain; charset=utf-8",
    pdf: "application/pdf",
    xml: "application/xml",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    otf: "font/otf",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    webm: "video/webm",
    wasm: "application/wasm",
  };
  return map[ext.toLowerCase()];
}