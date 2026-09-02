// Arquivo: monorepo/webtorrent/server.ts
import { serveDir } from "@std/http/file-server";
const PORT = 8000;
console.log(`\n🌐 Servidor WebTorrent Test rodando.`);
console.log(`   Acesse: http://localhost:${PORT}/index.html\n`);
console.log(`   Abra em DUAS abas para testar a presença P2P.\n`);
Deno.serve({ port: PORT }, async (req: Request) => {
  const response = await serveDir(req, {
    fsRoot: "./build/dist",
    showDirListing: true,
  });
  response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  // Headers necessários para Service Worker e SharedArrayBuffer (se necessário)
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  return response;
});