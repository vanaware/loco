/// <reference lib="deno.ns" />
/**
 * @file build.ts
 * @description Build alternativo usando Deno.bundle API nativa (--unstable-bundle)
 */
import {
  parseArgs,
  currentVersion,
  incrementVersion,
  listAssetsForCache,
  processBundleTarget,
} from "@loco/utils/build";
import type { DenoBundleGlobalConfig } from "@loco/utils/interfaces";

// ============================================================================
// 📦 CONFIGURAÇÃO DECLARATIVA DE BUILDS
// ============================================================================
const CONFIG: DenoBundleGlobalConfig = {
  ui: {
    mode: "build",
    default: true,
    srcdir: "monorepo/ui/src",
    distdir: "monorepo/server/build/dist",
    publicdir: "monorepo/ui/public",
    indexHtml: true,
    clean: ["."],
    entryPoints: ["app.tsx"],
    platform: "browser",
    format: "esm",
    minify: false,
    sourcemap: "linked",
    keepNames: true,
    codeSplitting: false,
    packages: "bundle",
    inlineImports: true
  },
  worker: {
    mode: "build",
    default: true,
    srcdir: "monorepo/ui/src",
    distdir: "monorepo/server/build/dist",
    clean: ["opfs.worker.js", "opfs.worker.js.map"],
    entryPoints: ["worker-opfs/opfs.worker.ts"],
    platform: "browser",
    format: "esm",
    minify: false,
    sourcemap: "linked",
    indexHtml: false,
    keepNames: true,
    codeSplitting: false,
    packages: "bundle",
    inlineImports: true
  },
  sw: {
    mode: "build",
    default: true,
    srcdir: "monorepo/service-worker/src",
    distdir: "monorepo/server/build/dist",
    clean: ["service-worker.js", "service-worker.js.map"],
    entryPoints: ["service-worker.ts"],
    platform: "browser",
    format: "esm",
    minify: false,
    sourcemap: "linked",
    indexHtml: false,
    keepNames: true,
    codeSplitting: false,
    packages: "bundle",
    inlineImports: true
  },
  server: {
   mode: 'build',
    default: true,
    srcdir: "monorepo/server/src",
    distdir: "monorepo/server/build",
    clean: ["worker.js", "worker.js.map", "functions"],
    entryPoints: [
       "worker.ts", 
       "functions/ping.ts",
       "functions/publickey.ts",
       "functions/push.ts",
     ],
    platform: "browser",
    format: "esm",
    minify: false,
    sourcemap: "linked",
    indexHtml: false,
    keepNames: true,
    codeSplitting: false,
    packages: "bundle",
    inlineImports: true
  },
  playground: {
    mode: "build",
    default: false,
    srcdir: "monorepo/playground/src",
    distdir: "monorepo/playground/build/dist",
    publicdir: "monorepo/playground/public",
    indexHtml: true,
    clean: ["."],
    entryPoints: ["main.tsx"],
    // 🔥 CORREÇÃO: outfile agora é RELATIVO ao distdir
    outfile: "main.js",
    platform: "browser",
    format: "esm",
    minify: false,
    sourcemap: "linked",
    keepNames: true,
    codeSplitting: false,
    packages: "bundle"
  },
};

// ============================================================================
// 🚀 PIPELINE PRINCIPAL
// ============================================================================
const DENO_JSONC_PATH = "deno.jsonc";

async function build() {
  const start = performance.now();
  const { targets, globalNoVersion, watchTarget } = parseArgs(
    Deno.args,
    CONFIG,
  );

  console.log("\n🚀 Iniciando Orquestrador de Build Loco (Deno.bundle API)");
  console.log(`   📦 Motor: Deno.bundle (nativo, --unstable-bundle)`);

  if (watchTarget) {
    console.log(
      `\n⚠️ AVISO: Modo Watch não suportado pelo Deno.bundle API.`,
    );
    console.log(`   O alvo '${watchTarget}' foi ignorado.`);
    console.log(
      `   Para watch mode, use o build oficial: deno task build watch`,
    );
    console.log(
      `   (que utiliza esbuild com suporte a esbuild.context().watch())\n`,
    );
    Deno.exit(0);
  }

  console.log(`   📋 Alvos: ${targets.join(", ") || "(nenhum)"}`);
  console.log(`   🔒 Noversion: ${globalNoVersion}\n`);

  if (targets.length === 0) {
    console.log("⚠️ Nenhum alvo para processar.");
    Deno.exit(0);
  }

  try {
    const currentVer = await currentVersion(DENO_JSONC_PATH);

    const finalVersion = globalNoVersion
      ? currentVer
      : await incrementVersion(currentVer, DENO_JSONC_PATH);

    for (const targetName of targets) {
      const targetConfig = CONFIG[targetName];
      if (!targetConfig) {
        console.warn(
          `⚠️ Alvo '${targetName}' não encontrado no CONFIG. Pulando.`,
        );
        continue;
      }

      const listFn = targetName === "sw" ? listAssetsForCache : undefined;
      await processBundleTarget(targetName, targetConfig, finalVersion, listFn);
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`🎉 ORQUESTRAÇÃO CONCLUÍDA COM SUCESSO!`);
    console.log(`${"=".repeat(60)}`);
  } catch (error) {
    console.error("\n🛑 Pipeline de build falhou:", error);
    Deno.exit(1);
  } finally {
    const elapsed = (performance.now() - start).toFixed(0);
    console.log(`\n⏱️ Tempo total: ${elapsed}ms\n`);
  }
}

if (import.meta.main) {
  await build();
}