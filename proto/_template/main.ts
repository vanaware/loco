/// <reference lib="deno.ns" />

import { serveDir } from "@std/http/file-server";

const PORT = 8080;

Deno.serve({ port: PORT }, (req) => {
  return serveDir(req, {
    fsRoot: "./dist",
    showDirListing: false,
    quiet: true,
  });
});

console.log(`🚀 Protótipo rodando em http://localhost:${PORT}`);
