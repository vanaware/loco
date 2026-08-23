import { serveDir } from "@std/http/file-server";
import { copy, ensureDir } from "@std/fs";
import { join } from "@std/path";

const clean = async () => {
  try {
    await Deno.remove("./build", { recursive: true });
    console.log("📁 Arquivos anteriores excluídos");
  } catch {
    // diretório não existe, ok
  }
  await ensureDir("./build");
};

async function prepareAndBuild() {
  const startTime = performance.now();
  
  console.log("🔨 [DEV SERVER] Preparando ambiente...");
  // 1. Limpa e cria diretório
  await clean();

  // 2. Faz o bundle do index.html do exemplo para ser servido no navegador
  console.log("📦 [DEV SERVER] Fazendo bundle do index.html...");
  // @ts-ignore: A tipagem de Deno.bundle não está presente nas definições padrão, mas funciona no runtime.
  const result_html = await Deno.bundle({
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

  if (!result_html.success) {
    console.error(result_html.errors);
    throw new Error("Falha ao gerar bundle pelo compilador interno.");
  }

  for (const warning of result_html.warnings || []) {
    console.warn(warning);
  }

  // 3. Compilação do Worker da aplicação
  console.log("⚙️ Gerando bundle do Worker...");
  // @ts-ignore: A tipagem de Deno.bundle não está presente nas definições padrão, mas funciona no runtime.
  const result_worker = await Deno.bundle({
    entrypoints: ["./src/db.ts"],
    outputPath: "./build/worker-db.js",
    platform: "browser",
    format: "esm", // Alterado para ESM para suportar { type: "module" } no Worker
    packages: "external",
    keepnames: true,
    inlineImports: true,
    codeSplitting: false,
    minify: false,
    sourcemap: "linked",
    write: true,
  });

  if (!result_worker.success) {
    console.error(result_worker.errors);
    throw new Error("Falha ao gerar bundle pelo compilador interno.");
  }

  for (const warning of result_worker.warnings || []) {
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