/// <reference lib="deno.ns" />
import * as esbuild from "esbuild";
import { denoPlugin } from "@deno/esbuild-plugin";
import {
  parseArgs,
  currentVersion,
  incrementVersion,
  processTarget,
  listAssetsForCache,
  copyStaticFiles,
  buildEsbuildOptions
} from "@loco/utils/build";
import type { GlobalTargetConfig } from "@loco/utils/interfaces";

const DENO_JSONC_PATH = "deno.jsonc";

// ============================================================================
// 🔌 WRAPPER ESBUILD COM PLUGIN DENO
// ============================================================================
// deno-lint-ignore no-explicit-any
const buildWithDenoPlugin = (options: any): Promise<any> => {
  options.plugins = [...(options.plugins || []), denoPlugin({ "configPath" : DENO_JSONC_PATH })];
  return esbuild.build(options);
};

// ============================================================================
// 📦 CONFIGURAÇÃO DECLARATIVA DE BUILDS (específica do Loco)
// ============================================================================
const CONFIG: GlobalTargetConfig = {
  // ------------------------------------------------------------------
  // 🎯 ALVOS DE BUILD (rodam por padrão)
  // ------------------------------------------------------------------
  ui: {
    mode: 'build',
    default: true,
    srcdir: "monorepo/ui/src",
    distdir: "monorepo/server/build/dist",
    publicdir: "monorepo/ui/public",
    indexHtml: true,
    clean: ["."],
    entryPoints: ["app.tsx"],
    platform: "browser",
    format: "esm",
    bundle: true,
    minify: false,
    sourcemap: "linked",
    conditions: ["browser"],
    drop: ["debugger"],
    jsx: "automatic",
    jsxImportSource: "preact",
    metafile: true,
    write: true,
    legalComments: "none",
    keepNames: true,
    splitting: false,
    banner: {
      js: `/* Loco v__APP_VERSION__ */\n`,
    },
  },
  worker: {
    mode: 'build',
    default: true,
    srcdir: "monorepo/ui/src",
    distdir: "monorepo/server/build/dist",
    clean: ["opfs.worker.js", "opfs.worker.js.map"],
    entryPoints: ["worker-opfs/opfs.worker.ts"],
    platform: "browser",
    format: "esm",
    bundle: true,
    minify: false,
    sourcemap: "linked",
    drop: ["debugger"],
    conditions: ["worker"],
    metafile: true,
    write: true,
    legalComments: "none",
    keepNames: true,
    splitting: false,
    banner: {
      js: `/* Loco v__APP_VERSION__ */\n`,
    },
  },
  sw: {
    mode: 'build',
    default: true,
    srcdir: "monorepo/service-worker/src",
    distdir: "monorepo/server/build/dist",
    clean: ["service-worker.js", "service-worker.js.map"],
    entryPoints: ["service-worker.ts"],
    platform: "browser",
    format: "esm",
    bundle: true,
    minify: false,
    sourcemap: "linked",
    drop: ["debugger"],
    conditions: ["worker"],
    metafile: true,
    write: true,
    legalComments: "none",
    keepNames: true,
    splitting: false,
    banner: {
      js: `/* Loco v__APP_VERSION__ */\n`,
    },
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
    bundle: true,
    minify: false,
    sourcemap: "linked",
    drop: ["debugger"],
    conditions: ["worker"],
    metafile: true,
    write: true,
    legalComments: "none",
    indexHtml: false,
    keepNames: true,
    splitting: false,
    banner: {
      js: `/* Loco v__APP_VERSION__ */\n`,
    },
  },
  // ------------------------------------------------------------------
  // 👀 ALVOS WATCH (modo de desenvolvimento contínuo)
  // ------------------------------------------------------------------
  'watch': {
    mode: 'watch',
    default: false,
    srcdir: "monorepo/ui/src",
    distdir: "monorepo/server/build/dist",
    publicdir: "monorepo/ui/public",
    indexHtml: true,
    entryPoints: ["app.tsx"],
    platform: "browser",
    format: "esm",
    bundle: true,
    minify: false,
    sourcemap: "inline",
    conditions: ["browser"],
    jsx: "automatic",
    jsxImportSource: "preact",
    write: true,
    legalComments: "none",
    // 🔥 CORREÇÃO: outfile agora é RELATIVO ao distdir
    outfile: "app.js",
    banner: {
      js: `/* Loco v__APP_VERSION__ */\n`,
    },
  },
  playground: {
    mode: 'watch',
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
    bundle: true,
    minify: false,
    sourcemap: "inline",
    conditions: ["browser"],
    drop: ["debugger"],
    jsx: "automatic",
    jsxImportSource: "preact",
    metafile: true,
    write: true,
    legalComments: "none",
    banner: {
      js: `/* Loco Playground v__APP_VERSION__ */\n`,
    },
  },
};

// ============================================================================
// 🚀 PIPELINE PRINCIPAL
// ============================================================================
async function build() {
  const start = performance.now();
  const { targets, globalNoVersion, watchTarget } = parseArgs(Deno.args, CONFIG);
  
  console.log("\n🚀 Iniciando Orquestrador de Build Loco (esbuild nativo + @deno/esbuild-plugin)");
  if (watchTarget) {
    console.log(`👀 Modo Watch ativo: ${watchTarget}`);
  } else {
    console.log(`📋 Alvos de build (ordem segura do CONFIG): ${targets.join(", ") || "(nenhum)"}`);
  }
  console.log(`🔒 Noversion: ${globalNoVersion}\n`);

  try {
    const currentVer = await currentVersion(DENO_JSONC_PATH);

    if (watchTarget) {
      await startWatchMode(watchTarget, currentVer);
      return;
    }

    const finalVersion = globalNoVersion
      ? currentVer
      : await incrementVersion(currentVer, DENO_JSONC_PATH);

    for (const targetName of targets) {
      const targetConfig = CONFIG[targetName];
      if (!targetConfig) {
        console.warn(`⚠️ Alvo '${targetName}' não encontrado no CONFIG. Pulando.`);
        continue;
      }
      
      await processTarget(
        targetName,
        targetConfig,
        finalVersion,
        buildWithDenoPlugin,
        listAssetsForCache
      );
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

async function startWatchMode(watchTargetName: string, currentVer: string) {
  const config = CONFIG[watchTargetName];
  if (!config) {
    throw new Error(`❌ Alvo watch '${watchTargetName}' não encontrado no CONFIG`);
  }

  console.log(`\n👀 Iniciando Watch Mode: ${watchTargetName}\n`);

  await copyStaticFiles(config, currentVer);

  const esbuildOptions = await buildEsbuildOptions(watchTargetName, config, currentVer);
  
  esbuildOptions.plugins = [...(esbuildOptions.plugins || []), denoPlugin()];

  const ctx = await esbuild.context(esbuildOptions);
  await ctx.watch();
  
  console.log("\n✅ Watch mode ativo!");
  console.log(`📁 Monitorando: ${config.srcdir}/`);
  
  // 🔥 CORREÇÃO: Mostra o outfile resolvido (relativo ao distdir)
  const resolvedOutfile = esbuildOptions.outfile || (config.distdir ? `${config.distdir}/` : 'N/A');
  console.log(`📦 Output: ${resolvedOutfile}`);
  console.log(`📌 Versão: v${currentVer}`);
  console.log("\n💡 Pressione Ctrl+C para parar.\n");

  await new Promise(() => {});
}

await build();