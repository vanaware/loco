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
 /**
  * Wrapper que injeta o @deno/esbuild-plugin automaticamente em todas as builds.
  *
  * Isso permite que o esbuild nativo resolva imports no estilo Deno:
  * - jsr:@std/...
  * - npm:package@version
  * - https://esm.sh/...
  *
  * A injeção é feita aqui (no script específico do projeto) e não no
  * @loco/utils/build para manter o pacote de utils genérico e reutilizável.
  */
 const buildWithDenoPlugin = async (options: any): Promise<any> => {
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
     entryPoints: ["monorepo/ui/src/app.tsx"],
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
     entryPoints: ["monorepo/ui/src/worker/opfs.worker.ts"],
     platform: "browser",
     format: "iife",
     bundle: true,
     minify: false,
     sourcemap: "linked",
     drop: ["debugger"],
     conditions: ["worker"],
     metafile: true,
     write: true,
     legalComments: "none",
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
     entryPoints: ["monorepo/service-worker/src/service-worker.ts"],
     platform: "browser",
     format: "iife",
     bundle: true,
     minify: false,
     sourcemap: "linked",
     drop: ["debugger"],
     conditions: ["worker"],
     metafile: true,
     write: true,
     legalComments: "none",
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
        "monorepo/server/src/worker.ts", 
        "monorepo/server/src/functions/ping.ts",
        "monorepo/server/src/functions/publickey.ts",
        "monorepo/server/src/functions/push.ts",
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
     entryPoints: ["monorepo/ui/src/app.tsx"],
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
     outfile: "monorepo/server/build/dist/app.js",
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
     entryPoints: ["monorepo/playground/src/main.tsx"],
     outfile: "monorepo/playground/build/dist/main.js",
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
     // Obter versão atual
     const currentVer = await currentVersion(DENO_JSONC_PATH);
 
     // Modo watch: apenas o alvo watch é executado
     if (watchTarget) {
       await startWatchMode(watchTarget, currentVer);
       return;
     }
 
     // Build normal: incrementa versão (se aplicável)
     const finalVersion = globalNoVersion
       ? currentVer
       : await incrementVersion(currentVer, DENO_JSONC_PATH);
 
     // Processar cada alvo de build
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
 
   // Copiar arquivos estáticos uma vez
   await copyStaticFiles(config, currentVer);
 
   // Construir opções do esbuild
   const esbuildOptions = await buildEsbuildOptions(watchTargetName, config, currentVer);
 
   // 🔥 INJETAR PLUGIN DENO
   esbuildOptions.plugins = [...(esbuildOptions.plugins || []), denoPlugin()];
 
   // Criar contexto e ativar watch
   const ctx = await esbuild.context(esbuildOptions);
   await ctx.watch();
 
   console.log("\n✅ Watch mode ativo!");
   console.log(`📁 Monitorando: ${config.srcdir}/`);
   console.log(`📦 Output: ${config.outfile || config.distdir}/`);
   console.log(`📌 Versão: v${currentVer}`);
   console.log("\n💡 Pressione Ctrl+C para parar.\n");
 
   // Mantém o processo vivo
   await new Promise(() => {});
 }
 
 await build();