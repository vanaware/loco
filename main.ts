import { serve } from "https://deno.land/std@0.224.0/http/mod.ts";
import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";

serve(async (req) => {
  const url = new URL(req.url);
  
  // Serve arquivos estáticos do diretório dist
  return await serveDir(req, {
    fsDir: "./dist",
    urlRoot: "",
    quiet: true,
  });
}, { port: 8000 });

console.log("🚀 Push P2P Chat rodando em http://localhost:8000");
