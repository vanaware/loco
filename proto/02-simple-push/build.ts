/// <reference lib="deno.ns" />
import { ensureDir, copy } from "@std/fs";
import { join } from "@std/path";

const DIST_DIR = "dist";
const SRC_DIR = "src";
const PUBLIC_DIR = "public";

interface BundleResult {
  success: boolean;
  errors?: unknown[];
  warnings?: unknown[];
  outputFiles?: Array<{
    path: string;
    contents: Record<string, number> | Uint8Array | string;
    hash?: string;
  }>;
  code?: string;
  output?: string;
}

interface BundleOptions {
  entrypoints: string[];
  outputDir?: string;
  outputFile?: string;
  platform?: "browser" | "deno" | "neutral";
  format?: "esm" | "iife" | "cjs";
  bundle?: boolean;
  minify?: boolean;
  sourcemap?: boolean | "linked" | "inline";
  write?: boolean;
  jsx?: "automatic" | "react" | "preserve";
  jsxImportSource?: string;
  jsxFactory?: string;
  jsxFragment?: string;
}

async function clean() {
  try {
    await Deno.remove(DIST_DIR, { recursive: true });
  } catch {
    // diretório não existe, ok
  }
  await ensureDir(DIST_DIR);
  console.log("📁 Arquivos anteriores excluídos");
}

async function copyStatic() {
  try {
    await copy(PUBLIC_DIR, DIST_DIR, { overwrite: true });
    console.log("📁 Arquivos estáticos copiados");
  } catch {
    console.log("⚠️ Pasta public não encontrada ou erro na cópia");
  }
}

/**
 * Converte o contents do outputFiles para string
 */
function contentsToString(contents: Record<string, number> | Uint8Array | string): string {
  // Se já é string, retorna
  if (typeof contents === 'string') {
    return contents;
  }
  
  // Se é Uint8Array, decodifica
  if (contents instanceof Uint8Array) {
    return new TextDecoder().decode(contents);
  }
  
  // Se é objeto com índices numéricos, converte para bytes
  if (contents && typeof contents === 'object') {
    const bytes: number[] = [];
    const keys = Object.keys(contents);
    const isNumericKeys = keys.every(k => !isNaN(Number(k)));
    
    if (isNumericKeys && keys.length > 0) {
      const sortedKeys = keys.map(Number).sort((a, b) => a - b);
      for (const key of sortedKeys) {
        const value = (contents as Record<string, number>)[key.toString()];
        if (typeof value === 'number' && value >= 0 && value <= 255) {
          bytes.push(value);
        }
      }
      if (bytes.length > 0) {
        return new TextDecoder().decode(new Uint8Array(bytes));
      }
    }
  }
  
  // Fallback: stringify
  return JSON.stringify(contents);
}

/**
 * Escreve o resultado do bundle no disco
 */
async function writeOutput(result: BundleResult, fileName: string): Promise<void> {
  if (!result.outputFiles || result.outputFiles.length === 0) {
    throw new Error(`Nenhum output gerado para ${fileName}`);
  }

  const text = contentsToString(result.outputFiles[0].contents);
  await Deno.writeTextFile(join(DIST_DIR, fileName), text);
}

/**
 * Extrai o código do bundle para manipulação em memória
 */
function extrairCodigoDoBundle(result: BundleResult): string {
  if (!result.outputFiles || result.outputFiles.length === 0) {
    return '';
  }
  return contentsToString(result.outputFiles[0].contents);
}

async function runBundle(name: string, bundleOpts: BundleOptions): Promise<BundleResult> {
  console.log(`🔨 [${name}] Iniciando bundle...`);
  
  // deno-lint-ignore no-explicit-any
  const result = (await (Deno as any).bundle(bundleOpts)) as BundleResult;
  
  if (!result.success) {
    console.error(`❌ Erros no bundle ${name}:`, result.errors);
    throw new Error(`Falha ao gerar ${name}`);
  }
  
  for (const warning of result.warnings || []) {
    console.warn(`⚠️ ${name}:`, warning);
  }
  
  return result;
}

/**
 * Gera ou carrega as chaves RSA do servidor usando Deno.env nativo
 */
async function gerarOuCarregarChavesServidor() {
  // 🔥 Lê diretamente do Deno.env (já carregado via --env)
  let publicKey = Deno.env.get('SERVER_PUBLIC_KEY');
  let privateKey = Deno.env.get('SERVER_PRIVATE_KEY');
  
  // Se encontrou as chaves, usa
  if (publicKey && privateKey) {
    console.log("🔑 Chaves do servidor carregadas do .env");
    return;
  }
  
  // Gera novas chaves RSA
  console.log("🔐 Gerando novas chaves RSA do servidor...");
  
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );
  
  // Exporta as chaves como JWK
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  
  const publicKeyStr = JSON.stringify(publicJwk);
  const privateKeyStr = JSON.stringify(privateJwk);
  
  // 🔥 Define no Deno.env (disponível no processo atual)
  Deno.env.set('SERVER_PUBLIC_KEY', publicKeyStr);
  Deno.env.set('SERVER_PRIVATE_KEY', privateKeyStr);
  
  // 🔥 Persiste no arquivo .env para futuras execuções
  await Deno.writeTextFile(
    '.env',
    `# Chaves RSA do Servidor - Geradas automaticamente pelo build\n` +
    `# NÃO COMMITAR ESTE ARQUIVO!\n` +
    `SERVER_PUBLIC_KEY=${publicKeyStr}\n` +
    `SERVER_PRIVATE_KEY=${privateKeyStr}\n`
  );
  
  console.log(`✅ Chaves do servidor salvas em .env`);
  console.log("   ⚠️  NÃO COMMITAR este arquivo!");
  console.log("   💡 Use 'deno task start' para rodar o servidor");
}

async function listarAssetsParaCache(): Promise<string[]> {
  const assets: string[] = [];
  const exclude = new Set(['service-worker.js', 'service-worker.tmp.js']);
  
  for await (const entry of Deno.readDir(DIST_DIR)) {
    if (entry.isFile && !entry.name.endsWith(".map") && !exclude.has(entry.name)) {
      assets.push(`/${entry.name}`);
    }
  }
  
  return assets;
}

async function build() {
  console.log("\n🚀 Iniciando build do protótipo...\n");
  const start = performance.now();

  // 0. Gera/carrega chaves do servidor usando Deno.env
  await gerarOuCarregarChavesServidor();

  // 1. Limpa e copia arquivos estáticos
  await clean();
  await copyStatic();

  // 2. Build das páginas HTML
  console.log("📦 Compilando páginas HTML...");
  await runBundle("HTML", {
    entrypoints: [
      join(SRC_DIR, "browser-a.html"),
      join(SRC_DIR, "browser-b.html")
    ],
    outputDir: DIST_DIR,
    platform: "browser",
    format: "esm",
    bundle: true,
    minify: false,
    write: true,
    jsx: "automatic",
    jsxImportSource: "preact",
    jsxFactory: "h",
    jsxFragment: "Fragment",
  });

  // 3. Build do Service Worker em memória (write: false)
  console.log("📦 Compilando bundle do Service Worker em memória...");
  const swResult = await runBundle("ServiceWorker", {
    entrypoints: [join(SRC_DIR, "service-worker.js")],
    platform: "browser",
    format: "iife",
    bundle: true,
    minify: false,
    write: false,
  });

  // 4. Extrai código do SW em memória
  console.log("📖 Extraindo código do Service Worker em memória...");
  let swCode = extrairCodigoDoBundle(swResult);
  
  if (swCode.length < 100) {
    throw new Error("Não foi possível extrair o código do Service Worker");
  }

  console.log(`   📄 Código extraído: ${swCode.length} caracteres`);

  // 5. Lista assets e injeta cache
  console.log("📦 Mapeando assets para cache offline...");
  const assets = await listarAssetsParaCache();
  console.log(`   📄 ${assets.length} assets encontrados`);

  const versionHash = Date.now().toString();
  const assetsArrayString = assets.map(asset => `"${asset}"`).join(", ");
  
  swCode = swCode.replace(/VERSION_HASH/g, versionHash);
  swCode = swCode.replace(/__GENERATED_ASSETS__/g, assetsArrayString);

  // 6. Salva Service Worker
  const swOutputPath = join(DIST_DIR, "service-worker.js");
  await Deno.writeTextFile(swOutputPath, swCode);
  
  console.log(`✨ Service Worker gerado com sucesso! (v_${versionHash})`);
  console.log(`   📦 ${assets.length} assets em cache`);
  console.log(`   📄 Tamanho: ${(swCode.length / 1024).toFixed(2)} KB`);

  const elapsed = (performance.now() - start).toFixed(0);
  console.log(`\n✨ Build completo em ${elapsed}ms → ${DIST_DIR}/`);
  console.log(`   📄 Assets cacheados: ${assets.join(', ')}\n`);
}

await build();