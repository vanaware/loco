// monorepo/router/tests/path_traversal_test.ts
import { assertEquals, assertStringIncludes } from "@std/assert";
import { Router } from "../src/mod.ts";
import { join } from "@std/path";

// Cria estrutura temporária:
//   tmpRoot/
//     secret.txt       <- arquivo "sensível" FORA do staticDir
//     public/
//       hello.txt      <- arquivo legítimo DENTRO do staticDir
async function setupFixture(): Promise<{ tmpRoot: string; publicDir: string }> {
  const tmpRoot = await Deno.makeTempDir({ prefix: "router_traversal_" });
  const publicDir = join(tmpRoot, "public");
  await Deno.mkdir(publicDir);
  await Deno.writeTextFile(join(tmpRoot, "secret.txt"), "TOP-SECRET-DATA");
  await Deno.writeTextFile(join(publicDir, "hello.txt"), "hello world");
  await Deno.writeTextFile(join(publicDir, "index.html"), "<h1>home</h1>");
  return { tmpRoot, publicDir };
}

async function cleanup(path: string) {
  try {
    await Deno.remove(path, { recursive: true });
  } catch {
    // ignora
  }
}

Deno.test("Path traversal: ../ não deve escapar do staticDir", async () => {
  const { tmpRoot, publicDir } = await setupFixture();
  try {
    const app = new Router("", publicDir, null);

    // Tenta escapar: /../secret.txt deve ser normalizado para /secret.txt (fora de publicDir)
    const req = new Request("http://localhost/../secret.txt");
    const res = await app.handleRequest(req);
    assertEquals(res.status, 404, "Deve retornar 404 ao tentar path traversal com ..");
    const body = await res.text();
    assertEquals(body.includes("TOP-SECRET-DATA"), false, "NUNCA deve vazar conteúdo do arquivo secreto");
  } finally {
    await cleanup(tmpRoot);
  }
});

Deno.test("Path traversal: múltiplos ../ não escapam", async () => {
  const { tmpRoot, publicDir } = await setupFixture();
  try {
    const app = new Router("", publicDir, null);

    const req = new Request("http://localhost/../../secret.txt");
    const res = await app.handleRequest(req);
    assertEquals(res.status, 404);
    const body = await res.text();
    assertEquals(body.includes("TOP-SECRET-DATA"), false);
  } finally {
    await cleanup(tmpRoot);
  }
});

Deno.test("Path traversal: /subdir/../../secret.txt não escapa", async () => {
  const { tmpRoot, publicDir } = await setupFixture();
  try {
    const app = new Router("", publicDir, null);

    const req = new Request("http://localhost/subdir/../../secret.txt");
    const res = await app.handleRequest(req);
    assertEquals(res.status, 404);
    const body = await res.text();
    assertEquals(body.includes("TOP-SECRET-DATA"), false);
  } finally {
    await cleanup(tmpRoot);
  }
});

Deno.test("Path traversal: URL-encoded ..%2F não escapa", async () => {
  const { tmpRoot, publicDir } = await setupFixture();
  try {
    const app = new Router("", publicDir, null);

    // URL com .. codificado
    const req = new Request("http://localhost/..%2Fsecret.txt");
    const res = await app.handleRequest(req);
    // O Deno/URL já decodifica, então deve cair no mesmo caso de traversal
    assertEquals(res.status, 404);
    const body = await res.text();
    assertEquals(body.includes("TOP-SECRET-DATA"), false);
  } finally {
    await cleanup(tmpRoot);
  }
});

Deno.test("Path traversal: backslash (Windows-style) não escapa", async () => {
  const { tmpRoot, publicDir } = await setupFixture();
  try {
    const app = new Router("", publicDir, null);

    const req = new Request("http://localhost/..\\secret.txt");
    const res = await app.handleRequest(req);
    // Deve ser tratado como path inválido ou 404
    const body = await res.text();
    assertEquals(body.includes("TOP-SECRET-DATA"), false);
  } finally {
    await cleanup(tmpRoot);
  }
});

Deno.test("Path traversal: basePath não é bypassado", async () => {
  const { tmpRoot, publicDir } = await setupFixture();
  try {
    const app = new Router("/api", publicDir, null);

    // Tenta bypassar o basePath com ..
    const req = new Request("http://localhost/api/../secret.txt");
    const res = await app.handleRequest(req);
    const body = await res.text();
    assertEquals(body.includes("TOP-SECRET-DATA"), false);
  } finally {
    await cleanup(tmpRoot);
  }
});

Deno.test("Arquivo legítimo dentro do staticDir é servido normalmente", async () => {
  const { tmpRoot, publicDir } = await setupFixture();
  try {
    const app = new Router("", publicDir, null);

    const req = new Request("http://localhost/hello.txt");
    const res = await app.handleRequest(req);
    assertEquals(res.status, 200);
    assertEquals(await res.text(), "hello world");
  } finally {
    await cleanup(tmpRoot);
  }
});

Deno.test("Arquivo legítimo em subpasta é servido", async () => {
  const tmpRoot = await Deno.makeTempDir({ prefix: "router_sub_" });
  const publicDir = join(tmpRoot, "public");
  const subDir = join(publicDir, "docs");
  await Deno.mkdir(subDir, { recursive: true });
  await Deno.writeTextFile(join(subDir, "readme.txt"), "readme content");

  try {
    const app = new Router("", publicDir, null);
    const req = new Request("http://localhost/docs/readme.txt");
    const res = await app.handleRequest(req);
    assertEquals(res.status, 200);
    assertEquals(await res.text(), "readme content");
  } finally {
    await cleanup(tmpRoot);
  }
});