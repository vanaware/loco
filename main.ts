import { serveDir } from "@std/http/file-server";
import { join } from "@std/path";

Deno.serve({ port: 8000 }, async (req) => {
  const url = new URL(req.url);
  if (url.pathname === "/") {
    const file = await Deno.open("./dist/index.html", { read: true });
    return new Response(file.readable, {
      headers: { "Content-Type": "text/html" },
    });
  }

  const filePath = join("./dist", url.pathname);
  try {
    const fileInfo = await Deno.stat(filePath);
    if (fileInfo.isFile) {
      const file = await Deno.open(filePath, { read: true });
      return new Response(file.readable);
    }
  } catch {
    // fall through to serveDir
  }

  return serveDir(req, {
    fsDir: "./dist",
    urlRoot: "",
    showDirListing: false,
    quiet: true,
  });
});

console.log("🚀 Loco rodando em http://localhost:8000");
