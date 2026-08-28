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
  
  // --- Configurações do Esbuild ---
  entryPoints: string[];
  outdir?: string;
  outfile?: string;
  platform?: "browser" | "node" | "neutral";
  format?: "esm" | "iife" | "cjs";
  bundle?: boolean;
  minify?: boolean;
  sourcemap?: boolean | "linked" | "inline" | "external";
  jsx?: "automatic" | "transform" | "preserve";
  jsxImportSource?: string;
  conditions?: string[];
  define?: Record<string, string>;
  drop?: string[]; // ← NOVO: Remove console/debugger em produção
  external?: string[]; // ← NOVO: Marca pacotes como externos (CDN)
  metafile?: boolean; // ← NOVO: Gera análise de bundle
}

interface GlobalConfig {
  [targetName: string]: TargetConfig;
}

const CONFIG: GlobalConfig = {
  // --- ALVO: App Principal (Browser Main Thread) ---
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
    // ✅ Remove console.log e debugger em produção
    drop: ["console", "debugger"],
    // ✅ Gera metafile para análise
    metafile: true,
  },

  // --- ALVO: Service Worker (Offline-First) ---
  sw: {
    srcdir: "src",
    distdir: "monorepo/server/build/dist",
    
    entryPoints: ["src/service-worker.ts"],
    platform: "browser",
    format: "iife",
    bundle: true,
    minify: true,
    conditions: ["worker"],
    define: {
      // __GENERATED_ASSETS__ será preenchido dinamicamente
    },
    // ✅ Mantém console.log no SW para debugging, remove apenas debugger
    drop: ["debugger"],
    metafile: true,
  },

  // --- ALVO: Web Worker Dedicado (P2P / OPFS) ---
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
  },

  // --- ALVO: Watch Mode (Desenvolvimento) ---
  watch: {
    srcdir: "src",
    distdir: "monorepo/server/build/dist",
    publicdir: "public",
    indexHtml: true,
    
    entryPoints: ["src/main.tsx"],
    platform: "browser",
    format: "esm",
    bundle: true,
    minify: false, // ❌ Não minifica em dev
    sourcemap: "inline", // ✅ Source maps inline para debug
    conditions: ["browser"],
    jsx: "automatic",
    jsxImportSource: "preact",
    // ✅ Mantém console.log em desenvolvimento
    drop: [],
    metafile: false, // ❌ Não gera metafile em dev
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

  // 5. Preparar defines
  const finalDefine: Record<string, string> = {
    ...config.define,
    "__APP_VERSION__": JSON.stringify(`v${appVersion}`),
  };

  // Lógica especial para Service Worker
  if (targetName === "sw") {
    const assets = await listarAssetsParaCache(distDir);
    finalDefine["__GENERATED_ASSETS__"] = JSON.stringify(assets);
    console.log(`📋 ${assets.length} assets listados para cache do SW`);
  }

  // 6. Executar build
  console.log(`🔨 Compilando com esbuild-wasm...`);
  const startTime = performance.now();
  
  try {
    const result = await esbuild.build({
      entryPoints: config.entryPoints,
      bundle: config.bundle ?? true,
      outdir: config.outdir ?? distDir,
      outfile: config.outfile,
      platform: config.platform ?? "browser",
      format: config.format ?? "esm",
      minify: config.minify ?? false,
      sourcemap: config.sourcemap ?? false,
      write: true,
      jsx: config.jsx,
      jsxImportSource: config.jsxImportSource,
      conditions: config.conditions,
      define: finalDefine,
      drop: config.drop, // ✅ Remove console/debugger
      external: config.external,
      treeShaking: true,
      legalComments: "none",
      metafile: config.metafile, // ✅ Gera metafile
    });

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
  const exclude = new Set(['service-worker.js', 'service-worker.tmp.js', 'metafile.json']);
  
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
  
  // Copia arquivos estáticos uma vez
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

  // Cria contexto do esbuild
  const ctx = await esbuild.context({
    entryPoints: config.entryPoints,
    bundle: config.bundle ?? true,
    outdir: config.outdir ?? distDir,
    platform: config.platform ?? "browser",
    format: config.format ?? "esm",
    minify: config.minify ?? false,
    sourcemap: config.sourcemap ?? "inline",
    jsx: config.jsx,
    jsxImportSource: config.jsxImportSource,
    conditions: config.conditions,
    define: {
      "__APP_VERSION__": JSON.stringify("dev"),
    },
    drop: config.drop,
    treeShaking: true,
  });

  // Inicia watch
  await ctx.watch();
  
  console.log("\n✅ Watch mode ativo!");
  console.log(`📁 Monitorando: ${config.srcdir}/`);
  console.log(`📦 Output: ${distDir}/`);
  console.log("\n💡 Pressione Ctrl+C para parar.\n");
  
  // Mantém o processo rodando
  await new Promise(() => {});
}

// ============================================================================
// 🚀 PIPELINE PRINCIPAL
// ============================================================================

async function build() {
  const { targets, globalNoVersion } = parseArgs();
  
  // Verifica se é watch mode
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

    // Watch mode
    if (isWatchMode) {
      await startWatchMode();
      return;
    }

    // Build normal
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