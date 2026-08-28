/// <reference lib="deno.ns" />
import { ensureDir, copy, walk, emptyDir } from "@std/fs";
import { join } from "@std/path";
// ✅ Versão fixa para builds reprodutíveis. Atualize manualmente quando quiser testar novas versões.
import * as esbuild from "https://esm.sh/esbuild-wasm@0.24.0";

// ============================================================================
// 📦 CONFIGURAÇÃO DECLARATIVA DE BUILDS
// ============================================================================

interface TargetConfig {
  // --- Configurações de Pipeline (Pré/Post Build) ---
  publicdir?: string;       // Se existir, copia para distdir. Patcheia manifest.json se presente.
  srcdir: string;           // Diretório fonte base para este alvo.
  distdir: string;          // Diretório de saída final para este alvo.
  indexHtml?: boolean;      // Se true, copia srcdir/index.html para distdir.
  clean?: string[];         // Array de caminhos (relativos a distdir) para limpar antes do build.
  
  // --- Configurações do Esbuild ---
  entryPoints: string[];
  outdir?: string;          // Se não definido, usa distdir.
  outfile?: string;         // Se definido, sobrescreve outdir para um arquivo único.
  platform?: "browser" | "node" | "neutral";
  format?: "esm" | "iife" | "cjs";
  bundle?: boolean;
  minify?: boolean;
  sourcemap?: boolean | "linked" | "inline" | "external";
  jsx?: "automatic" | "transform" | "preserve";
  jsxImportSource?: string;
  conditions?: string[];
  define?: Record<string, string>; // Define base. __APP_VERSION__ é injetado automaticamente.
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
    clean: ["."], // Limpa tudo em distdir antes de começar
    
    entryPoints: ["src/main.tsx"],
    platform: "browser",
    format: "esm",
    bundle: true,
    minify: true,
    sourcemap: "linked",
    conditions: ["browser"], // Garante que usa db(), opfs(), ls() do @loco/workerdb
    jsx: "automatic",
    jsxImportSource: "preact",
  },

  // --- ALVO: Service Worker (Offline-First) ---
  sw: {
    srcdir: "src",
    distdir: "monorepo/server/build/dist",
    // Não tem publicdir nem indexHtml, pois usa o mesmo dist do 'main'
    
    entryPoints: ["src/service-worker.ts"],
    platform: "browser",
    format: "iife",
    bundle: true,
    minify: true,
    conditions: ["worker"], // Garante que usa dbsw(), opfssw() do @loco/workerdb
    define: {
      // __GENERATED_ASSETS__ será preenchido dinamicamente no pipeline
    },
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

  // 1. Limpeza (se especificada)
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

  // 2. Garantir existência do diretório de saída
  await ensureDir(distDir);

  // 3. Copiar publicdir (se existir)
  if (config.publicdir) {
    try {
      await copy(config.publicdir, distDir, { overwrite: true });
      console.log(`📁 Arquivos de ${config.publicdir} copiados para ${distDir}`);
      
      // Patchear manifest.json se existir
      const manifestPath = join(distDir, "manifest.json");
      try {
        const manifestText = await Deno.readTextFile(manifestPath);
        const manifestObj = JSON.parse(manifestText);
        manifestObj.version = appVersion;
        await Deno.writeTextFile(manifestPath, JSON.stringify(manifestObj, null, 2));
        console.log(`📱 Versão v${appVersion} injetada em manifest.json`);
      } catch {
        // manifest.json não existe ou erro, ignora
      }
    } catch {
      console.log(`⚠️ Pasta ${config.publicdir} não encontrada, pulando cópia.`);
    }
  }

  // 4. Copiar index.html (se especificado)
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

  // 5. Preparar defines para o esbuild
  const finalDefine: Record<string, string> = {
    ...config.define,
    "__APP_VERSION__": JSON.stringify(`v${appVersion}`),
  };

  // Lógica especial para o Service Worker: injetar lista de assets
  if (targetName === "sw") {
    const assets = await listarAssetsParaCache(distDir);
    finalDefine["__GENERATED_ASSETS__"] = JSON.stringify(assets);
    console.log(`📋 ${assets.length} assets listados para cache do SW`);
  }

  // 6. Executar o build do esbuild
  console.log(`🔨 Compilando com esbuild-wasm...`);
  try {
    await esbuild.build({
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
      treeShaking: true,
      legalComments: "none",
    });
    console.log(`✅ [${targetName}] Build concluído com sucesso.`);
  } catch (error) {
    console.error(`❌ Erro fatal no build [${targetName}]:`, error);
    throw error;
  }
}

async function listarAssetsParaCache(distDir: string): Promise<string[]> {
  const assets: string[] = [];
  const exclude = new Set(['service-worker.js', 'service-worker.tmp.js']);
  
  for await (const entry of walk(distDir, { includeDirs: false })) {
    if (!entry.name.endsWith(".map") && !exclude.has(entry.name)) {
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
  
  // Filtra argumentos que são nomes de alvos válidos no CONFIG
  const targets = args.filter(arg => arg !== 'noversion' && arg in CONFIG);
  
  // Se nenhum alvo válido foi especificado, usa todos na ordem do CONFIG
  const finalTargets = targets.length > 0 ? targets : Object.keys(CONFIG);
  
  return { targets: finalTargets, globalNoVersion };
}

// ============================================================================
// 🚀 PIPELINE PRINCIPAL
// ============================================================================

async function build() {
  const { targets, globalNoVersion } = parseArgs();
  
  console.log("\n🚀 Iniciando Orquestrador de Build Loco (esbuild-wasm)");
  console.log(`📋 Alvos a processar: ${targets.join(", ")}`);
  console.log(`🔒 Noversion global: ${globalNoVersion}\n`);
  
  const start = performance.now();

  try {
    // 1. Inicializa o WASM do esbuild (cacheado pelo Deno após primeira execução)
    console.log("⚙️ Inicializando esbuild-wasm...");
    await esbuild.initialize({
      wasmURL: "https://esm.sh/esbuild-wasm@0.24.0/esbuild.wasm",
    });
    console.log("✅ esbuild-wasm pronto (usando cache do Deno se disponível).\n");

    // 2. Calcula a versão UMA VEZ só
    const appVersion = await incrementVersion(globalNoVersion);

    // 3. Processa cada alvo na ordem especificada
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
    esbuild.stop();
    const elapsed = (performance.now() - start).toFixed(0);
    console.log(`\n⏱️ Tempo total: ${elapsed}ms\n`);
  }
}

await build();