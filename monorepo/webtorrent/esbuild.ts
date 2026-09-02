// Arquivo: monorepo/webtorrent/esbuild.ts
import * as esbuild from "esbuild";
import { denoPlugin } from "@deno/esbuild-plugin";
import { ensureDir, copy, emptyDir } from "@std/fs";
import { join } from "@std/path";

const BUILD_DIR = "build/dist";
const SRC_DIR = "src";

async function clean() {
  await emptyDir(BUILD_DIR);
  console.log("📁 Diretório de build limpo.");
}

async function copyStatic() {
  await ensureDir(BUILD_DIR);
  await copy(join(SRC_DIR, "index.html"), join(BUILD_DIR, "index.html"), { overwrite: true });
  console.log("📄 index.html copiado.");
}

async function build() {
  console.log("🚀 Iniciando build com esbuild (Browser Polyfills Ativados)...");
  await clean();
  await copyStatic();

  try {
    console.log("📦 Empacotando aplicação principal (main.tsx)...");
    await esbuild.build({
      plugins: [denoPlugin()],
      entryPoints: [join(SRC_DIR, "main.tsx")],
      outfile: join(BUILD_DIR, "main.js"),
      bundle: true,
      format: "esm",
      platform: "browser",
      minify: false,
      sourcemap: true,
      write: true,
    });
    console.log("✅ main.js gerado com sucesso.");

    console.log("📦 Empacotando Service Worker (worker.ts)...");
    await esbuild.build({
      plugins: [denoPlugin()],
      entryPoints: [join(SRC_DIR, "worker.ts")],
      outfile: join(BUILD_DIR, "worker.js"),
      bundle: true,
      format: "esm",
      platform: "browser",
      minify: false,
      sourcemap: true,
      write: true,
    });
    console.log("✅ worker.js gerado com sucesso.");

    console.log("✨ Build concluído com sucesso!");
  } catch (error) {
    console.error("❌ Erro fatal durante o build com esbuild:");
    console.error(error);
    Deno.exit(1);
  } finally {
    await esbuild.stop();
  }
}

await build();