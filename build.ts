/// <reference lib="deno.ns" />
/**
 * @file build.ts
 * @description Build alternativo usando Deno.bundle API nativa (--unstable-bundle)
 *
 * Este é um script ALTERNATIVO ao esbuild.ts oficial do Loco.
 * Usa a API nativa Deno.bundle() sem dependências externas.
 *
 * Toda a lógica de processamento está em @loco/utils/build (bundle.ts).
 * Este arquivo contém apenas:
 * 1. CONFIG declarativo dos alvos
 * 2. Orquestração do pipeline
 *
 * Uso:
 *   deno run --unstable-bundle -A ./build.ts
 *   deno run --unstable-bundle -A ./build.ts ui sw
 *   deno run --unstable-bundle -A ./build.ts noversion
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
    entryPoints: ["monorepo/ui/src/app.tsx"],
    platform: "browser",
    format: "esm",
    minify: false,
    sourcemap: "linked",
  },
  worker: {
    mode: "build",
    default: true,
    srcdir: "monorepo/ui/src",
    distdir: "monorepo/server/build/dist",
    clean: ["opfs.worker.js", "opfs.worker.js.map"],
    entryPoints: ["monorepo/ui/src/worker/opfs.worker.ts"],
    platform: "browser",
    format: "iife",
    minify: false,
  },
  sw: {
    mode: "build",
    default: true,
    srcdir: "monorepo/service-worker/src",
    distdir: "monorepo/server/build/dist",
    clean: ["service-worker.js", "service-worker.js.map"],
    entryPoints: ["monorepo/service-worker/src/service-worker.ts"],
    platform: "browser",
    format: "iife",
    minify: false,
  },
  playground: {
    mode: "build",
    default: false,
    srcdir: "monorepo/playground/src",
    distdir: "monorepo/playground/build/dist",
    publicdir: "monorepo/playground/public",
    indexHtml: true,
    clean: ["."],
    entryPoints: ["monorepo/playground/src/main.tsx"],
    outfile: "monorepo/playground/build/dist/main.js",
    platform: "browser",
    format: "esm",
    minify: false,
    sourcemap: "linked",
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

  // ⚠️ Watch mode não suportado — emite aviso e encerra
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
    // Obter versão atual
    const currentVer = await currentVersion(DENO_JSONC_PATH);

    // Incrementar versão (se aplicável)
    const finalVersion = globalNoVersion
      ? currentVer
      : await incrementVersion(currentVer, DENO_JSONC_PATH);

    // Processar cada alvo de build na ordem do CONFIG
    for (const targetName of targets) {
      const targetConfig = CONFIG[targetName];
      if (!targetConfig) {
        console.warn(
          `⚠️ Alvo '${targetName}' não encontrado no CONFIG. Pulando.`,
        );
        continue;
      }

      // Para o SW, passa a função de listagem de assets
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