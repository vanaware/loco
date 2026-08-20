import { serveDir } from "jsr:@std/http/file-server";

const PORT = 8000;

console.log(`🌐 Servidor minimalista Loco PWA rodando.`);
console.log(`Acesse: http://localhost:${PORT}/index.html`);

Deno.serve({ port: PORT }, (req: Request) => {
  // O serveDir é nativo e otimizado para servir arquivos locais
  return serveDir(req, {
    fsRoot: "./build/dist",
    showDirListing: true,
  });
});