import { transpile } from "@deno/emit";

const PORT = 8000;
const ROOT = Deno.cwd();

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".ts": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-cache",
};

async function transpileTs(filePath: string): Promise<string> {
  const fileUrl = `file://${filePath}`;
  const result = await transpile(fileUrl, {
    compilerOptions: {
      target: "ESNext",
      module: "ESNext",
    },
  });
  return result.get(fileUrl) || "";
}

Deno.serve({ port: PORT }, async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = `${ROOT}/src${pathname}`;
  const ext = pathname.substring(pathname.lastIndexOf("."));

  try {
    if (ext === ".ts") {
      const js = await transpileTs(filePath);
      return new Response(js, {
        headers: { "Content-Type": MIME[".js"], ...CORS_HEADERS },
      });
    }

    const data = await Deno.readFile(filePath);
    return new Response(data, {
      headers: {
        "Content-Type": MIME[ext] || "application/octet-stream",
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    console.error(`404 ${pathname}`, err);
    return new Response("404 Not Found", { status: 404 });
  }
});

console.log(`\n🚀 Teste WebTorrent Presença`);
console.log(`   http://localhost:${PORT}\n`);
console.log(`   Abra em DUAS abas para testar presença.\n`);