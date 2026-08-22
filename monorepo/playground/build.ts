// build.ts
import { ensureDir } from "@std/fs";


const clean = async () => {
  try {
    await Deno.remove("./build/dist", { recursive: true });
    console.log("📁 Arquivos anteriores excluídos");
  } catch {
    // diretório não existe, ok
  }
  await ensureDir("./build/dist");
}

const build = async () => {

  console.log("🚀 Iniciando build do Loco PWA...");
  const startTime = performance.now();

  try {
    // 1. Garante que a pasta de destino exista
    await clean();

    // 3. Compilação da aplicação
    console.log("⚙️ Gerando bundle da aplicação...");
    const result = await Deno.bundle({
      entrypoints: [
        "./src/main.tsx"
      ],
      outputDir: "./build/dist",
      platform: "browser",
      format: "esm",
      bundle: true,
      minify: false, 
      write: true,   
      jsx: "automatic",
      jsxImportSource: "preact",
      jsxFactory: "h",
      jsxFragment: "Fragment",
    });

    if (!result.success) {
      console.error(result.errors);
      throw new Error("Falha ao gerar bundle pelo compilador interno.");
    }
    
    for (const warning of result.warnings || []) {
      console.warn(warning);
    }

    // 4. Copia o arquivo estático HTML
    await Deno.copyFile("./src/index.html", "./build/dist/index.html");

    const endTime = performance.now();
    console.log(`✅ Build concluído com sucesso em ${(endTime - startTime).toFixed(2)}ms!`);
    console.log("📁 Saída gerada no diretório: ./build/dist/");

  } catch (error) {
    console.error("❌ Erro fatal durante o processo de build:");
    console.error(error);
    Deno.exit(1);
  }
}

await build();