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

async function injetarCacheNoServiceWorker() {
  const distSwPath = join(DIST_DIR, "service-worker.js");
  try {
    const assetsEncontrados: string[] = [];
    for await (const entry of Deno.readDir(DIST_DIR)) {
      if (entry.isFile && !entry.name.endsWith(".map") && entry.name !== "service-worker.js") {
        assetsEncontrados.push(`/${entry.name}`);
      }
    }
    console.log("📦 Arquivos mapeados para o Cache Offline:", assetsEncontrados);

    const uniqueVersion = Date.now().toString(); 
    const assetsArrayString = assetsEncontrados.map(asset => `"${asset}"`).join(", ");

    let swCode = await Deno.readTextFile(distSwPath);
    swCode = swCode.replace("VERSION_HASH", uniqueVersion);
    swCode = swCode.replace("__GENERATED_ASSETS__", assetsArrayString);

    await Deno.writeTextFile(distSwPath, swCode);
    console.log(`✨ Cache injetado com sucesso no SW: v_${uniqueVersion}`);
  } catch (err) {
    console.error("⚠️ Falha ao injetar cache no Service Worker:", err);
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

  // 2. Build do Service Worker resolvendo o deno.json e transpilando para formato clássico IIFE
  console.log("📦 Compilando bundle do Service Worker ...");
  await bundleFn({
    entrypoints: [join(SRC_DIR, "service-worker.js")],
    outputDir: DIST_DIR,
    outputFile: join(DIST_DIR, "service-worker.js"),
    platform: "browser",
    format: "iife",
    bundle: true,
    minify: false,
    write: true
  });

  // 3. Injeta a lista de hashes gerada na pasta dist no arquivo final do worker
  await injetarCacheNoServiceWorker();

  const elapsed = (performance.now() - start).toFixed(0);
  console.log(`\n✨ Build completo em ${elapsed}ms → ${DIST_DIR}/\n`);
}

await build();
