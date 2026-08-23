// build.ts
import { ensureDir } from "@std/fs";

const clean = async () => {
  try {
    await Promise.all([
      Deno.remove("../server/build/dist/worker-db.js"),
      Deno.remove("../server/build/dist/worker-db.js.map")
    ]);
    console.log("📁 Arquivo anterior excluído");
  } catch {
    // diretório não existe, ok
  }
  await ensureDir("../server/build/dist");
};

const build = async () => {
  console.log("🚀 Iniciando build do Worker DB ...");
  const startTime = performance.now();

  try {
    // 1. Garante que a pasta de destino exista
    await clean();

    // 2. Compilação do Worker da aplicação
    console.log("⚙️ Gerando bundle do Worker...");
    // @ts-ignore: A tipagem de Deno.bundle não está presente nas definições padrão, mas funciona no runtime deste projeto.
    const result = await Deno.bundle({
      entrypoints: ["./src/db.ts"],
      outputPath: "../server/build/dist/worker-db.js",
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

    if (!result.success) {
      console.error(result.errors);
      throw new Error("Falha ao gerar bundle pelo compilador interno.");
    }

    for (const warning of result.warnings || []) {
      console.warn(warning);
    }

    const endTime = performance.now();
    console.log(`✅ Build concluído com sucesso em ${(endTime - startTime).toFixed(2)}ms!`);
    console.log("📁 Saída gerada no diretório: ../server/build/dist/");
  } catch (error) {
    console.error("❌ Erro fatal durante o processo de build:");
    console.error(error);
    Deno.exit(1);
  }
};

await build();