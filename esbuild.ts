/// <reference lib="deno.ns" />
import { ensureDir, copy, walk, emptyDir } from "@std/fs";
import { join } from "@std/path";
import * as esbuild from "esbuild-wasm";

// ============================================================================
// 📦 CONFIGURAÇÃO DECLARATIVA DE BUILDS
// ============================================================================

interface TargetConfig {
  // --- Configurações de Pipeline (Pré/Post Build) ---
  publicdir?: string;
  srcdir: string;
  distdir: string;
  indexHtml?: boolean;
  clean?: string[];
  
  // --- Configurações do Esbuild (TODAS configuráveis) ---
  entryPoints: string[];
  platform?: "browser" | "node" | "neutral";
  format?: "esm" | "iife" | "cjs";
  bundle?: boolean;
  minify?: boolean;
  sourcemap?: boolean | "linked" | "inline" | "external";
  jsx?: "automatic" | "transform" | "preserve";
  jsxImportSource?: string;
  conditions?: string[];
  define?: Record<string, string>;
  drop?: string[];
  external?: string[];
  metafile?: boolean;
  write?: boolean;
  treeShaking?: boolean;
  legalComments?: "none" | "inline" | "eof" | "linked" | "external";
  keepNames?: boolean;
  outfile?: string;
  
  // ✅ NOVAS OPÇÕES ADICIONADAS (1-13):
  
  // 1. Code Splitting
  splitting?: boolean;
  
  // 2. Custom Loaders por Extensão
  loader?: Record<string, "js" | "jsx" | "ts" | "tsx" | "css" | "json" | "text" | "base64" | "dataurl" | "file" | "binary" | "empty" | "copy">;
  
  // 3. Redirecionamento de Imports
  alias?: Record<string, string>;
  
  // 4. Injeção Global de Código
  inject?: string[];
  
  // 5. Texto no Início/Fim do Bundle
  banner?: { js?: string; css?: string };
  footer?: { js?: string; css?: string };
  
  // 6. Versão do JavaScript
  target?: string | string[];
  
  // 7. Conjunto de Caracteres
  charset?: "ascii" | "utf8";
  
  // 8. Nível de Log
  logLevel?: "verbose" | "debug" | "info" | "warning" | "error" | "silent";
  
  // 9. Limite de Logs
  logLimit?: number;
  
  // 10. Override de Logs Específicos
  logOverride?: Record<string, "verbose" | "debug" | "info" | "warning" | "error" | "ignore">;
  
  // 11. Nomes de Arquivos
  entryNames?: string;
  chunkNames?: string;
  assetNames?: string;
  
  // 12. Path Público para Assets
  publicPath?: string;
  
  // 13. Marcar Funções como Puras
  pure?: string[];
}

interface GlobalConfig {
  [targetName: string]: TargetConfig;
}

const CONFIG: GlobalConfig = {
  main: {
    srcdir: "src",
    distdir: "monorepo/server/build/dist",
    publicdir: "public",
    indexHtml: true,
    clean: ["."],
    
    entryPoints: ["src/main.tsx"],
    platform: "browser",
    format: "esm",
    bundle: true,
    minify: true,
    sourcemap: "linked",
    conditions: ["browser"],
    jsx: "automatic",
    jsxImportSource: "preact",
    drop: ["console", "debugger"],
    metafile: true,
    write: true,
    treeShaking: true,
    legalComments: "none",
    outfile: "monorepo/server/build/dist/app.js",
    
    // ✅ Exemplos das novas opções (descomente conforme necessário):
    // 1. splitting: true, // Requer format: "esm" e outdir (não outfile)
    // 2. loader: {
    //   ".png": "file",
    //   ".svg": "dataurl",
    //   ".woff2": "file",
    //   ".txt": "text",
    // },
    // 3. alias: {
    //   "@": "./src",
    //   "@components": "./src/components",
    // },
    // 4. inject: ["./polyfills.ts"],
    // 5. banner: {
    //   js: `/* Loco v${new Date().toISOString()} */\n`,
    // },
    // footer: {
    //   js: `\n/* End of Loco Bundle */`,
    // },
    // 6. target: "es2022",
    // 7. charset: "utf8",
    // 8. logLevel: "warning",
    // 9. logLimit: 10,
    // 10. logOverride: {
    //   "unsupported-dynamic-import": "ignore",
    // },
    // 11. entryNames: "[name]-[hash]",
    // chunkNames: "chunks/[name]-[hash]",
    // assetNames: "assets/[name]-[hash]",
    // 12. publicPath: "https://cdn.loco.app/",
    // 13. pure: ["console.log", "debug"],
  },

  sw: {
    srcdir: "src",
    distdir: "monorepo/server/build/dist",
    
    entryPoints: ["src/service-worker.ts"],
    platform: "browser",
    format: "iife",
    bundle: true,
    minify: true,
    conditions: ["worker"],
    drop: ["debugger"],
    metafile: true,
    write: true,
    treeShaking: true,
    legalComments: "none",
    outfile: "monorepo/server/build/dist/service-worker.js",
    
    // ✅ Exemplos para Service Worker:
    // 6. target: "es2022",
    // 8. logLevel: "info",
  },

  worker: {
    srcdir: "src",
    distdir: "monorepo/server/build/dist",
    
    entryPoints: ["src/worker/opfs.worker.ts"],
    platform: "browser",
    format: "iife",
    bundle: true,
    minify: false,
    drop: ["debugger"],
    metafile: true,
    write: true,
    treeShaking: true,
    legalComments: "none",
    outfile: "monorepo/server/build/dist/opfs.worker.js",
    
    // ✅ Exemplos para Web Worker:
    // 6. target: "es2022",
  },

  watch: {
    srcdir: "src",
    distdir: "monorepo/server/build/dist",
    publicdir: "public",
    indexHtml: true,
    
    entryPoints: ["src/main.tsx"],
    platform: "browser",
    format: "esm",
    bundle: true,
    minify: false,
    sourcemap: "inline",
    conditions: ["browser"],
    jsx: "automatic",
    jsxImportSource: "preact",
    write: true,
    treeShaking: true,
    legalComments: "none",
    outfile: "monorepo/server/build/dist/app.js",
    
    // ✅ Watch mode geralmente não precisa de otimizações:
    // 8. logLevel: "info",
  },
};

// ============================================================================
// 🛠️ FUNÇÕES AUXILIARES
// ============================================================================

async function incrementVersion(skipIncrement: boolean = false): Promise<string> {
  const denoJsoncPath = "deno.jsonc";
  let content = await Deno.readTextFile(denoJsoncPath);
  let currentVersion = "0.0.0";
  
  if (skipIncrement) {
    const match = content.match(/"version"\s*:\s*"([^"]+)"/);
    if (match && match[1]) {
      currentVersion = match[1];
    }
    console.log(`📌 Parâmetro 'noversion' detectado. Mantendo versão: v${currentVersion}`);
    return currentVersion;
  }

  const buildHash = Date.now().toString(36);
  content = content.replace(/"version"\s*:\s*"(\d+)\.(\d+)\.(\d+)(?:-[a-zA-Z0-9]+)?"/, (_match, major, minor, patch) => {
    const nextPatch = parseInt(patch, 10) + 1;
    currentVersion = `${major}.${minor}.${nextPatch}-${buildHash}`;
    return `"version": "${currentVersion}"`;
  });

  await Deno.writeTextFile(denoJsoncPath, content);
  console.log(`📈 Versão incrementada para: v${currentVersion}`);
  return currentVersion;
}

/**
 * Constrói o objeto de opções do esbuild dinamicamente.
 * Inclui TODAS as 13 novas opções.
 */
async function buildEsbuildOptions(
  targetName: string,
  config: TargetConfig,
  appVersion: string
): Promise<esbuild.BuildOptions> {
  const finalDefine: Record<string, string> = {
    ...config.define,
    "__APP_VERSION__": JSON.stringify(`v${appVersion}`),
  };

  if (targetName === "sw") {
    const assets = await listarAssetsParaCache(config.distdir);
    finalDefine["__GENERATED_ASSETS__"] = JSON.stringify(assets);
    console.log(`📋 ${assets.length} assets listados para cache do SW`);
  }

  const options: esbuild.BuildOptions = {
    entryPoints: config.entryPoints,
  };

  // Lógica: se outfile está definido, usa ele; caso contrário, usa outdir
  if (config.outfile !== undefined) {
    options.outfile = config.outfile;
  } else {
    options.outdir = config.distdir;
  }

  // Adiciona apenas se definido (todas as propriedades são configuráveis)
  if (config.platform !== undefined) options.platform = config.platform;
  if (config.format !== undefined) options.format = config.format;
  if (config.bundle !== undefined) options.bundle = config.bundle;
  if (config.minify !== undefined) options.minify = config.minify;
  if (config.sourcemap !== undefined) options.sourcemap = config.sourcemap;
  if (config.jsx !== undefined) options.jsx = config.jsx;
  if (config.jsxImportSource !== undefined) options.jsxImportSource = config.jsxImportSource;
  if (config.conditions !== undefined) options.conditions = config.conditions;
  if (config.external !== undefined) options.external = config.external;
  if (config.drop !== undefined) options.drop = config.drop;
  if (config.metafile !== undefined) options.metafile = config.metafile;
  if (config.write !== undefined) options.write = config.write;
  if (config.treeShaking !== undefined) options.treeShaking = config.treeShaking;
  if (config.legalComments !== undefined) options.legalComments = config.legalComments;
  if (config.keepNames !== undefined) options.keepNames = config.keepNames;
  
  // ✅ NOVAS OPÇÕES (1-13):
  if (config.splitting !== undefined) options.splitting = config.splitting;
  if (config.loader !== undefined) options.loader = config.loader;
  if (config.alias !== undefined) options.alias = config.alias;
  if (config.inject !== undefined) options.inject = config.inject;
  if (config.banner !== undefined) options.banner = config.banner;
  if (config.footer !== undefined) options.footer = config.footer;
  if (config.target !== undefined) options.target = config.target;
  if (config.charset !== undefined) options.charset = config.charset;
  if (config.logLevel !== undefined) options.logLevel = config.logLevel;
  if (config.logLimit !== undefined) options.logLimit = config.logLimit;
  if (config.logOverride !== undefined) options.logOverride = config.logOverride;
  if (config.entryNames !== undefined) options.entryNames = config.entryNames;
  if (config.chunkNames !== undefined) options.chunkNames = config.chunkNames;
  if (config.assetNames !== undefined) options.assetNames = config.assetNames;
  if (config.publicPath !== undefined) options.publicPath = config.publicPath;
  if (config.pure !== undefined) options.pure = config.pure;
  
  options.define = finalDefine;

  return options;
}

async function processTarget(targetName: string, config: TargetConfig, appVersion: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🎯 PROCESSANDO ALVO: ${targetName.toUpperCase()}`);
  console.log(`${"=".repeat(60)}`);

  const distDir = config.distdir;
  const srcDir = config.srcdir;

  // 1. Limpeza
  if (config.clean && config.clean.length > 0) {
    console.log(`🧹 Limpando diretórios em ${distDir}...`);
    for (const cleanPath of config.clean) {
      const fullPath = join(distDir, cleanPath);
      try {
        if (cleanPath === ".") {
          await emptyDir(distDir);
        } else {
          await Deno.remove(fullPath, { recursive: true });
        }
        console.log(`   ✅ Limpo: ${cleanPath}`);
      } catch {
        // Ignora se não existir
      }
    }
  }

  // 2. Garantir existência do diretório
  await ensureDir(distDir);

  // 3. Copiar publicdir
  if (config.publicdir) {
    try {
      await copy(config.publicdir, distDir, { overwrite: true });
      console.log(`📁 Arquivos de ${config.publicdir} copiados para ${distDir}`);
      
      const manifestPath = join(distDir, "manifest.json");
      try {
        const manifestText = await Deno.readTextFile(manifestPath);
        const manifestObj = JSON.parse(manifestText);
        manifestObj.version = appVersion;
        await Deno.writeTextFile(manifestPath, JSON.stringify(manifestObj, null, 2));
        console.log(`📱 Versão v${appVersion} injetada em manifest.json`);
      } catch {
        // manifest.json não existe
      }
    } catch {
      console.log(`⚠️ Pasta ${config.publicdir} não encontrada, pulando cópia.`);
    }
  }

  // 4. Copiar index.html
  if (config.indexHtml) {
    const srcHtml = join(srcDir, "index.html");
    const destHtml = join(distDir, "index.html");
    try {
      await copy(srcHtml, destHtml, { overwrite: true });
      console.log(`📄 index.html copiado de ${srcDir} para ${distDir}`);
    } catch {
      console.log(`⚠️ ${srcHtml} não encontrado, pulando cópia do HTML.`);
    }
  }

  // 5. Construir opções do esbuild
  const esbuildOptions = await buildEsbuildOptions(targetName, config, appVersion);

  // 6. Executar build
  console.log(`🔨 Compilando com esbuild-wasm...`);
  const startTime = performance.now();
  
  try {
    const result = await esbuild.build(esbuildOptions);

    const duration = (performance.now() - startTime).toFixed(0);
    console.log(`✅ [${targetName}] Build concluído em ${duration}ms`);

    // 7. Salvar metafile se gerado
    if (config.metafile && result.metafile) {
      const metafilePath = join(distDir, `${targetName}-metafile.json`);
      await Deno.writeTextFile(metafilePath, JSON.stringify(result.metafile, null, 2));
      console.log(`📊 Metafile gerado: ${metafilePath}`);
      console.log(`   💡 Visualize em: https://esbuild.github.io/analyze/`);
    }

  } catch (error) {
    console.error(`❌ Erro fatal no build [${targetName}]:`, error);
    throw error;
  }
}

async function listarAssetsParaCache(distDir: string): Promise<string[]> {
  const assets: string[] = [];
  const exclude = new Set(['service-worker.js', 'service-worker.tmp.js']);
  
  for await (const entry of walk(distDir, { includeDirs: false })) {
    if (!entry.name.endsWith(".map") && !entry.name.endsWith("metafile.json") && !exclude.has(entry.name)) {
      let webPath = entry.path.replace(distDir, "").replace(/\\/g, "/");
      webPath = webPath.startsWith('/') ? '.' + webPath : './' + webPath;
      assets.push(webPath);
    }
  }
  return assets;
}

function parseArgs(): { targets: string[]; globalNoVersion: boolean } {
  const args = Deno.args.map(a => a.toLowerCase());
  const globalNoVersion = args.includes('noversion');
  
  const targets = args.filter(arg => arg !== 'noversion' && arg in CONFIG);
  const finalTargets = targets.length > 0 ? targets : Object.keys(CONFIG).filter(t => t !== 'watch');
  
  return { targets: finalTargets, globalNoVersion };
}

// ============================================================================
// 👀 WATCH MODE
// ============================================================================

async function startWatchMode() {
  console.log("\n👀 Iniciando Watch Mode (Desenvolvimento)...\n");
  
  const config = CONFIG.watch;
  const distDir = config.distdir;
  
  if (config.publicdir) {
    try {
      await copy(config.publicdir, distDir, { overwrite: true });
      console.log(`📁 Arquivos de ${config.publicdir} copiados`);
    } catch {
      console.log(`⚠️ Pasta ${config.publicdir} não encontrada`);
    }
  }
  
  if (config.indexHtml) {
    try {
      await copy(join(config.srcdir, "index.html"), join(distDir, "index.html"), { overwrite: true });
      console.log(`📄 index.html copiado`);
    } catch {
      console.log(`⚠️ index.html não encontrado`);
    }
  }

  const esbuildOptions = await buildEsbuildOptions("watch", config, "dev");
  const ctx = await esbuild.context(esbuildOptions);

  await ctx.watch();
  
  console.log("\n✅ Watch mode ativo!");
  console.log(`📁 Monitorando: ${config.srcdir}/`);
  console.log(`📦 Output: ${config.outfile || distDir}/`);
  console.log("\n💡 Pressione Ctrl+C para parar.\n");
  
  await new Promise(() => {});
}

// ============================================================================
// 🚀 PIPELINE PRINCIPAL
// ============================================================================

async function build() {
  const { targets, globalNoVersion } = parseArgs();
  
  const isWatchMode = Deno.args.map(a => a.toLowerCase()).includes('watch');
  
  console.log("\n🚀 Iniciando Orquestrador de Build Loco (esbuild-wasm)");
  console.log(`📋 Alvos a processar: ${isWatchMode ? 'WATCH MODE' : targets.join(", ")}`);
  console.log(`🔒 Noversion global: ${globalNoVersion}\n`);
  
  const start = performance.now();

  try {
    console.log("⚙️ Inicializando esbuild-wasm...");
    await esbuild.initialize({
      wasmURL: "https://esm.sh/esbuild-wasm@0.24.0/esbuild.wasm",
    });
    console.log("✅ esbuild-wasm pronto.\n");

    if (isWatchMode) {
      await startWatchMode();
      return;
    }

    const appVersion = await incrementVersion(globalNoVersion);

    for (const targetName of targets) {
      const targetConfig = CONFIG[targetName];
      if (!targetConfig) {
        console.warn(`⚠️ Alvo '${targetName}' não encontrado no CONFIG. Pulando.`);
        continue;
      }
      await processTarget(targetName, targetConfig, appVersion);
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`🎉 ORQUESTRAÇÃO CONCLUÍDA COM SUCESSO!`);
    console.log(`${"=".repeat(60)}`);

  } catch (error) {
    console.error("\n🛑 Pipeline de build falhou:", error);
    Deno.exit(1);
  } finally {
    if (!isWatchMode) {
      esbuild.stop();
    }
    const elapsed = (performance.now() - start).toFixed(0);
    console.log(`\n⏱️ Tempo total: ${elapsed}ms\n`);
  }
}

await build();