/// <reference lib="deno.ns" />
 import { emptyDir, ensureDir, copy, walk } from "@std/fs";
 import { join, isAbsolute } from "@std/path";
 // ============================================================================
 // 📦 TIPOS
 // ============================================================================
 import type { 
    ParsedVersion, 
    GlobalTargetConfig, 
    DenoBundleGlobalConfig, 
    ParsedArgs, 
    TargetConfig, 
    DenoBundleTargetConfig
  } from "../interfaces/mod.ts";
 // ============================================================================
 // 🔢 FUNÇÕES DE VERSÃO (puras, testáveis)
 // ============================================================================
 export function parseVersion(version: string): ParsedVersion {
   // 🔥 CORREÇÃO: Validação mais rigorosa para formatos inválidos
   const trimmed = version.trim();
   if (trimmed !== version) {
     throw new Error(`❌ Versão não pode ter espaços: ${version}`);
   }
   const versionWithoutHash = version.split("-")[0] ?? "";
   // 🔥 CORREÇÃO: Verifica se há hífen mas sem hash (ex: "1.2.3-")
   if (version.includes("-") && version.endsWith("-")) {
     throw new Error(`❌ Formato de versão inválido (hífen sem hash): ${version}`);
   }
   const parts = versionWithoutHash.split(".");
   if (parts.length !== 3) {
     throw new Error(`❌ Formato de versão inválido: ${version}`);
   }
   const majorStr = parts[0];
   const minorStr = parts[1];
   const patchStr = parts[2];
   if (majorStr === undefined || minorStr === undefined || patchStr === undefined) {
     throw new Error(`❌ Formato de versão inválido: ${version}`);
   }
   const major = parseInt(majorStr, 10);
   const minor = parseInt(minorStr, 10);
   const patch = parseInt(patchStr, 10);
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
 export function parseArgs(args: string[], config: GlobalTargetConfig | DenoBundleGlobalConfig): ParsedArgs {
   const lowerArgs = args.map(a => a.toLowerCase());
   const globalNoVersion = lowerArgs.includes('noversion');
   const isWatchFlag = lowerArgs.includes('watch');
   const configKeys = Object.keys(config);
   const defaultTargets = configKeys.filter(t => {
     const cfg = config[t]!;
     return cfg.mode !== 'watch' && cfg.default !== false;
   });
   const requestedTargets = lowerArgs.filter(
     arg => !['noversion', 'watch'].includes(arg) && configKeys.includes(arg)
   );
   let watchTarget: string | null = null;
   if (isWatchFlag) {
     // 🔥 CORREÇÃO: Usa a ordem do CONFIG, não a ordem da CLI
     // Encontra o PRIMEIRO alvo com mode: 'watch' na ordem do CONFIG
     watchTarget = configKeys.find(t => config[t]!.mode === 'watch') ?? null;
   } else if (requestedTargets.length > 0) {
     // Verifica se algum alvo solicitado tem mode: 'watch'
     // 🔥 CORREÇÃO: Usa a ordem do CONFIG para determinar qual watch executar
     // Primeiro encontra todos os watches solicitados
     const requestedWatches = requestedTargets.filter(t => config[t]!.mode === 'watch');
     if (requestedWatches.length > 0) {
       // Retorna o PRIMEIRO watch na ordem do CONFIG
       watchTarget = configKeys.find(t => requestedWatches.includes(t)) ?? null;
     }
   }
   let finalTargets: string[];
   if (watchTarget !== null) {
     finalTargets = [];
   } else if (requestedTargets.length > 0) {
     finalTargets = configKeys.filter(t => requestedTargets.includes(t));
   } else {
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
   config: TargetConfig | DenoBundleTargetConfig,
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
     __APP_VERSION__: JSON.stringify(`v${appVersion}`),
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
     'publicPath', 'pure', 'plugins'
   ];
   for (const prop of optionalProps) {
     if ((config as any)[prop] !== undefined) {
       options[prop] = (config as any)[prop];
     }
   }
   // 🔥 CORREÇÃO: Construção segura de banner
   // O esbuild REJEITA propriedades com valor undefined.
   // Se config.banner existe mas só tem js (ou só css), devemos criar
   // o objeto banner APENAS com a propriedade que tem valor string.
   if (config.banner !== undefined) {
     const banner: { js?: string; css?: string } = {};
     if (config.banner.js !== undefined) {
       banner.js = config.banner.js.replace(/__APP_VERSION__/g, appVersion);
     }
     if (config.banner.css !== undefined) {
       banner.css = config.banner.css.replace(/__APP_VERSION__/g, appVersion);
     }
     // Só atribui se pelo menos uma propriedade foi definida
     if (banner.js !== undefined || banner.css !== undefined) {
       options.banner = banner;
     }
   }
   // 🔥 CORREÇÃO: Construção segura de footer (mesma lógica do banner)
   if (config.footer !== undefined) {
     const footer: { js?: string; css?: string } = {};
     if (config.footer.js !== undefined) {
       footer.js = config.footer.js.replace(/__APP_VERSION__/g, appVersion);
     }
     if (config.footer.css !== undefined) {
       footer.css = config.footer.css.replace(/__APP_VERSION__/g, appVersion);
     }
     if (footer.js !== undefined || footer.css !== undefined) {
       options.footer = footer;
     }
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
   console.log(`🔨 Compilando com esbuild...`);
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