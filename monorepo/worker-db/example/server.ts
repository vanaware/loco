import { serveDir } from "@std/http/file-server";
import { copy, ensureDir } from "@std/fs";
import { join } from "@std/path";

async function prepareAndBuild() {
  const startTime = performance.now();
  console.log("🔨 [DEV SERVER] Preparando ambiente...");

  // 2. Garante a existência do diretório
  await ensureDir("./build");

  // 3. Faz o bundle do index.html do exemplo para ser servido no navegador
  console.log("📦 [DEV SERVER] Fazendo bundle do index.html...");
  const result = await Deno.bundle({
    entrypoints: [
      "./example/index.html"
    ],
    outputDir: "./build",
    platform: "browser",
    format: "esm",
    packages: "external",
    keepnames: true,
    inlineImports: true,
    codeSplitting: false,
    minify: false,
    sourcemap: "linked",
    write: true,
  });

  if (!result.success) {
    console.error(result.errors);
    throw new Error("Falha ao gerar bundle pelo compilador interno.");
  }

  for (const warning of result.warnings || []) {
    console.warn(warning);
  }

  const endTime = performance.now();
  console.log(`✅ [DEV SERVER] Build concluído com sucesso em ${(endTime - startTime).toFixed(2)}ms!`);
}

// Inicia o processo de build e depois sobe o servidor HTTP
await prepareAndBuild();

console.log(`\n🚀 Servidor estático rodando em: http://localhost:9000`);
console.log("   Disponibilizando o diretório: ./build/");

Deno.serve({ port: 9000 }, (req) => {
  return serveDir(req, {
    fsRoot: "./build/",
    showDirListing: true,
    enableCors: true,
  });
});