/// <reference lib="deno.ns" />

import { ensureDir } from "@std/fs";
import { join } from "@std/path";

const DIST_DIR = "dist";
const SRC_DIR = "src";

interface BundleOptions {
  entrypoints: string[];
  output: string;
  platform: "browser";
  minify: boolean;
  sourcemap?: string;
  jsx?: string;
  jsxImportSource?: string;
}

interface BundleResult {
  success: boolean;
  errors: unknown[];
  warnings: unknown[];
  outputFiles?: Array<{ path: string; text(): string }>;
}

async function clean() {
  try {
    await Deno.remove(DIST_DIR, { recursive: true });
  } catch {
    // diretório não existe, ok
  }
  await ensureDir(DIST_DIR);
}

async function copyStatic() {
  for (const file of ["index.html", "manifest.json"]) {
    await Deno.copyFile(file, join(DIST_DIR, file));
  }
}

async function writeOutput(result: BundleResult, fileName: string) {
  if (!result.outputFiles || result.outputFiles.length === 0) {
    throw new Error(`Nenhum output gerado para ${fileName}`);
  }
  const text = result.outputFiles[0].text();
  await Deno.writeTextFile(join(DIST_DIR, fileName), text);
}

async function runBundle(name: string, bundleOpts: BundleOptions) {
  // deno-lint-ignore no-explicit-any
  const result = (await (Deno as any).bundle(bundleOpts)) as BundleResult;
  if (!result.success) {
    console.error(`❌ Erros no bundle ${name}:`, result.errors);
    throw new Error(`Falha ao gerar ${name}`);
  }
  for (const warning of result.warnings) {
    console.warn(`⚠️ ${name}:`, warning);
  }
  return result;
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function build() {
  console.log("\n🚀 Iniciando build do protótipo...\n");
  const start = performance.now();

  await clean();
  await copyStatic();

  const appResult = await runBundle("app", {
    entrypoints: [join(SRC_DIR, "app.tsx")],
    output: DIST_DIR,
    platform: "browser",
    minify: true,
    jsx: "react-jsx",
    jsxImportSource: "preact",
  });
  await writeOutput(appResult, "app.js");
  console.log("   ✅ app.js gerado");

  if (await exists(join(SRC_DIR, "sw.ts"))) {
    const swResult = await runBundle("sw", {
      entrypoints: [join(SRC_DIR, "sw.ts")],
      output: DIST_DIR,
      platform: "browser",
      minify: true,
    });
    await writeOutput(swResult, "sw.js");
    console.log("   ✅ sw.js gerado");
  }

  const elapsed = (performance.now() - start).toFixed(0);
  console.log(`\n✨ Build completo em ${elapsed}ms → ${DIST_DIR}/\n`);
}

await build();
