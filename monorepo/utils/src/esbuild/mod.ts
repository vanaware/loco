/// <reference lib="deno.ns" />

import { emptyDir, ensureDir, copy, walk } from "@std/fs";
import { join, isAbsolute } from "@std/path";

// ============================================================================
// 📦 TIPOS
// ============================================================================

import type { ParsedVersion, GlobalTargetConfig, ParsedArgs, TargetConfig } from "../interfaces/mod.ts"

// ============================================================================
// 🔢 FUNÇÕES DE VERSÃO (puras, testáveis)
// ============================================================================

export function parseVersion(version: string): ParsedVersion {
  const versionWithoutHash = version.split("-")[0];
  const parts = versionWithoutHash.split(".");

  if (parts.length !== 3) {
    throw new Error(`❌ Formato de versão inválido: ${version}`);
  }

  const major = parseInt(parts[0], 10);
  const minor = parseInt(parts[1], 10);
  const patch = parseInt(parts[2], 10);

  if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
    throw new Error(`❌ Versão contém valores não numéricos: ${version}`);
  }

  return { major, minor, patch };
}

export function formatVersion(
  major: number,
  minor: number,
  patch: number,
  buildHash?: string
): string {
  const hash = buildHash ?? Date.now().toString(36);
  return `${major}.${minor}.${patch}-${hash}`;
}

export function extractVersionFromContent(content: string): string | null {
  const match = content.match(/"version"\s*:\s*"([^"]+)"/);
  return match && match[1] ? match[1] : null;
}

export function replaceVersionInContent(content: string, newVersion: string): string {
  return content.replace(
    /"version"\s*:\s*"[^"]+"/,
    `"version": "${newVersion}"`
  );
}

// ============================================================================
// 🛡️ VALIDAÇÃO DE PATHS (pura, testável)
// ============================================================================

export function isSafePath(cleanPath: string): boolean {
  if (cleanPath.includes("..")) return false;
  if (isAbsolute(cleanPath)) return false;
  return true;
}

// ============================================================================
// 🎯 PARSING DE ARGUMENTOS CLI (pura, testável)
// ============================================================================

/**
 * Parseia os argumentos da CLI.
 *
 * Os args apenas SELECIONAM os alvos; a ordem de execução é sempre a do CONFIG.
 * Quando nenhum alvo é especificado, apenas os alvos com `default !== false`
 * E `mode !== 'watch'` são incluídos.
 *
 * Regras de negócio:
 * 1. Alvos com `mode: 'watch'` NUNCA aparecem na lista de targets padrão.
 * 2. Se a flag 'watch' for usada, apenas o PRIMEIRO alvo com `mode: 'watch'`
 *    (na ordem do CONFIG) é executado.
 * 3. É possível solicitar um alvo watch específico pelo nome.
 * 4. Quando o modo watch está ativo, os targets de build são ignorados.
 *
 * @param args - Argumentos da CLI (ex: Deno.args)
 * @param config - Objeto CONFIG completo com todos os alvos
 * @returns Alvos de build, flags globais e alvo watch (se aplicável)
 *
 * @example
 * ```typescript
 * parseArgs([], CONFIG)                    // Sem args → targets padrão
 * parseArgs(['sw', 'ui'], CONFIG)          // Alvos específicos
 * parseArgs(['watch'], CONFIG)             // Primeiro alvo watch
 * parseArgs(['watch-admin'], CONFIG)       // Alvo watch específico
 * ```
 */
export function parseArgs(args: string[], config: GlobalTargetConfig): ParsedArgs {
  const lowerArgs = args.map(a => a.toLowerCase());
  const globalNoVersion = lowerArgs.includes('noversion');
  const isWatchFlag = lowerArgs.includes('watch');

  const configKeys = Object.keys(config);

  // Alvos de build padrão:
  // - NÃO são modo watch (watch nunca é default)
  // - default !== false
  const defaultTargets = configKeys.filter(t => {
    const cfg = config[t];
    return cfg.mode !== 'watch' && cfg.default !== false;
  });

  // Alvos solicitados via CLI (excluindo flags 'noversion' e 'watch')
  const requestedTargets = lowerArgs.filter(
    arg => !['noversion', 'watch'].includes(arg) && configKeys.includes(arg)
  );

  // Determina o alvo watch:
  let watchTarget: string | null = null;

  if (isWatchFlag) {
    // Flag 'watch' → usa o PRIMEIRO alvo com mode: 'watch' (ordem do CONFIG)
    watchTarget = configKeys.find(t => config[t].mode === 'watch') ?? null;
  } else {
    // Verifica se algum alvo solicitado tem mode: 'watch'
    watchTarget = requestedTargets.find(t => config[t].mode === 'watch') ?? null;
  }

  // Se modo watch está ativo, os targets de build são ignorados
  let finalTargets: string[];
  if (watchTarget !== null) {
    finalTargets = [];
  } else if (requestedTargets.length > 0) {
    // Alvos solicitados, na ordem do CONFIG (pipeline seguro)
    finalTargets = configKeys.filter(t => requestedTargets.includes(t));
  } else {
    // Nenhum alvo solicitado → usa defaults (que já excluem watch)
    finalTargets = defaultTargets;
  }

  return { targets: finalTargets, globalNoVersion, watchTarget };
}

// ============================================================================
// 📂 FUNÇÕES DE FILESYSTEM
// ============================================================================

export async function cleanTarget(distDir: string, cleanPaths: string[]): Promise<void> {
  if (!cleanPaths || cleanPaths.length === 0) return;

  console.log(`🧹 Limpando em ${distDir}...`);

  for (const cleanPath of cleanPaths) {
    if (!isSafePath(cleanPath)) {
      console.warn(`   ⚠️ Path perigoso ignorado (traversal/absoluto): "${cleanPath}"`);
      continue;
    }

    if (cleanPath === ".") {
      try {
        await emptyDir(distDir);
        console.log(`   ✅ Diretório esvaziado: ${distDir}`);
      } catch (error) {
        console.warn(`   ⚠️ Falha ao esvaziar ${distDir}:`, error);
      }
    } else {
      const fullPath = join(distDir, cleanPath);
      try {
        await Deno.stat(fullPath);
        await Deno.remove(fullPath, { recursive: true });
        console.log(`   ✅ Removido: ${cleanPath}`);
      } catch {
        console.log(`   ⏭️  Não existia: ${cleanPath}`);
      }
    }
  }
}

export async function currentVersion(denoJsoncPath: string): Promise<string> {
  const content = await Deno.readTextFile(denoJsoncPath);
  const version = extractVersionFromContent(content);

  if (!version) {
    throw new Error("❌ Versão não encontrada no deno.jsonc");
  }

  console.log(`📌 Versão Atual: v${version}`);
  return version;
}

export async function incrementVersion(
  version: string,
  denoJsoncPath: string,
  buildHash?: string
): Promise<string> {
  const { major, minor, patch } = parseVersion(version);
  const nextPatch = patch + 1;
  const newVersion = formatVersion(major, minor, nextPatch, buildHash);

  let content = await Deno.readTextFile(denoJsoncPath);
  content = replaceVersionInContent(content, newVersion);
  await Deno.writeTextFile(denoJsoncPath, content);

  console.log(`📈 Versão incrementada para: v${newVersion}`);
  return newVersion;
}

export async function listAssetsForCache(
  distDir: string,
  excludeFiles: string[] = []
): Promise<string[]> {
  const assets: string[] = [];
  const exclude = new Set([...excludeFiles, 'service-worker.js', 'service-worker.tmp.js']);

  for await (const entry of walk(distDir, { includeDirs: false })) {
    if (
      !entry.name.endsWith(".map") &&
      !entry.name.endsWith("metafile.json") &&
      !exclude.has(entry.name)
    ) {
      let webPath = entry.path.replace(distDir, "").replace(/\\/g, "/");
      webPath = webPath.startsWith('/') ? '.' + webPath : './' + webPath;
      assets.push(webPath);
    }
  }
  return assets;
}

export async function copyStaticFiles(
  config: TargetConfig,
  appVersion: string
): Promise<void> {
  const distDir = config.distdir;
  const srcDir = config.srcdir;

  await ensureDir(distDir);

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
}

// ============================================================================
// 🛠️ FUNÇÕES DE ESBUILD
// ============================================================================

export async function buildEsbuildOptions(
  targetName: string,
  config: TargetConfig,
  appVersion: string,
  listAssetsFn?: (distDir: string) => Promise<string[]>
): Promise<any> {
  const finalDefine: Record<string, string> = {
    ...config.define,
    "__APP_VERSION__": JSON.stringify(`v${appVersion}`),
  };

  if (targetName === "sw" && listAssetsFn) {
    const assets = await listAssetsFn(config.distdir);
    finalDefine["__GENERATED_ASSETS__"] = JSON.stringify(assets);
    console.log(`📋 ${assets.length} assets listados para cache do SW`);
  }

  const options: any = {
    entryPoints: config.entryPoints,
  };

  if (config.outfile !== undefined) {
    options.outfile = config.outfile;
  } else {
    options.outdir = config.distdir;
  }

  const optionalProps = [
    'platform', 'format', 'bundle', 'minify', 'sourcemap', 'jsx',
    'jsxImportSource', 'conditions', 'external', 'drop', 'metafile',
    'write', 'treeShaking', 'legalComments', 'keepNames', 'splitting',
    'loader', 'alias', 'inject', 'target', 'charset', 'logLevel',
    'logLimit', 'logOverride', 'entryNames', 'chunkNames', 'assetNames',
    'publicPath', 'pure'
  ];

  for (const prop of optionalProps) {
    if ((config as any)[prop] !== undefined) {
      options[prop] = (config as any)[prop];
    }
  }

  if (config.banner !== undefined) {
    options.banner = {
      js: config.banner.js?.replace(/__APP_VERSION__/g, appVersion),
      css: config.banner.css?.replace(/__APP_VERSION__/g, appVersion),
    };
  }
  if (config.footer !== undefined) {
    options.footer = {
      js: config.footer.js?.replace(/__APP_VERSION__/g, appVersion),
      css: config.footer.css?.replace(/__APP_VERSION__/g, appVersion),
    };
  }

  options.define = finalDefine;

  return options;
}

export async function processTarget(
  targetName: string,
  config: TargetConfig,
  appVersion: string,
  esbuildBuildFn: (options: any) => Promise<any>,
  listAssetsFn?: (distDir: string) => Promise<string[]>
): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🎯 PROCESSANDO ALVO: ${targetName.toUpperCase()}`);
  console.log(`${"=".repeat(60)}`);

  if (config.clean && config.clean.length > 0) {
    await cleanTarget(config.distdir, config.clean);
  }

  await copyStaticFiles(config, appVersion);

  const esbuildOptions = await buildEsbuildOptions(
    targetName,
    config,
    appVersion,
    listAssetsFn
  );

  console.log(`🔨 Compilando com esbuild-wasm...`);
  const startTime = performance.now();

  try {
    const result = await esbuildBuildFn(esbuildOptions);
    const duration = (performance.now() - startTime).toFixed(0);
    console.log(`✅ [${targetName}] Build concluído em ${duration}ms`);

    if (config.metafile && result.metafile) {
      const metafilePath = join(config.distdir, `${targetName}-metafile.json`);
      await Deno.writeTextFile(metafilePath, JSON.stringify(result.metafile, null, 2));
      console.log(`📊 Metafile gerado: ${metafilePath}`);
    }
  } catch (error) {
    console.error(`❌ Erro fatal no build [${targetName}]:`, error);
    throw error;
  }
}