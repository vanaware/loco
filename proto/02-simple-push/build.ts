/// <reference lib="deno.ns" />
import { ensureDir, copy } from "@std/fs";
import { join } from "@std/path";

const DIST_DIR = "dist";
const SRC_DIR = "src";
const PUBLIC_DIR = "public";

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

// Escaneia a pasta dist/ após o build das páginas e cria o Service Worker estático com os caches injetados
async function processarEGravarServiceWorker() {
  const srcSwPath = join(SRC_DIR, "service-worker.js");
  const distSwPath = join(DIST_DIR, "service-worker.js");

  try {
    const assetsEncontrados: string[] = [];


    // 1. Vasculha a pasta dist/ para mapear todos os arquivos gerados com hash pelas páginas HTML
    for await (const entry of Deno.readDir(DIST_DIR)) {
      // Mapeia todos os arquivos gerados, ignorando mapas de desenvolvimento (.map)
      if (entry.isFile && !entry.name.endsWith(".map")) {
        assetsEncontrados.push(`/${entry.name}`);
      }
    }
    console.log("📦 Arquivos mapeados para o Cache Offline:", assetsEncontrados);

    // 2. Cria uma versão única baseada no timestamp atual para estourar o cache antigo
    const uniqueVersion = Date.now().toString(); 

    // 3. Converte o array do JavaScript em uma string formatada para injeção no array
    const assetsArrayString = assetsEncontrados.map(asset => `"${asset}"`).join(", ");

    // 4. CORREÇÃO DA ROTA: Lê o arquivo direto da pasta de ORIGEM (src/) para evitar erros de NotFound
    let swCode = await Deno.readTextFile(srcSwPath);

    // 5. Faz as substituições cirúrgicas nos placeholders do service-worker original
    swCode = swCode.replace("VERSION_HASH", uniqueVersion);
    swCode = swCode.replace("__GENERATED_ASSETS__", assetsArrayString);

    // 6. Grava o Service Worker definitivo diretamente na raiz de dist/ com o nome fixo perfeito
    await Deno.writeTextFile(distSwPath, swCode);
    console.log(`✨ Service Worker gerado com nome fixo e cache versionado para: v_${uniqueVersion}`);
  } catch (err) {
    console.error("⚠️ Falha ao processar ou gravar o Service Worker:", err);
  }
}

async function build() {
  console.log("\n🚀 Iniciando build do protótipo...\n");
  const start = performance.now();

  await clean();
  await copyStatic();

  // @ts-ignore: Deno.bundle é instável, usamos o fallback seguro do namespace se disponível
  const bundleFn = (Deno as any).bundle;

  if (!bundleFn) {
    throw new Error("A API Deno.bundle não está disponível. Execute com a flag --unstable-bundle");
  }

  // 1. Build das páginas HTML principais (Grava os arquivos JS com hash físicos na pasta dist/)
  await bundleFn({
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

  // 2. Processa o Service Worker lendo da origem, injetando os JS com hash descobertos na etapa 1 e salvando em dist/
  await processarEGravarServiceWorker();

  const elapsed = (performance.now() - start).toFixed(0);
  console.log(`\n✨ Build completo em ${elapsed}ms → ${DIST_DIR}/\n`);
}

await build();
