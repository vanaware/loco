import { copy, ensureDir } from "@std/fs";
import { join } from "@std/path";

const DIST_DIR = "dist";
const SRC_DIR = "src";

interface BuildOptions {
  watch: boolean;
}

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

const opts: BuildOptions = {
  watch: Deno.args.includes("--watch"),
};

async function clean() {
  try {
    await Deno.remove(DIST_DIR, { recursive: true });
    console.log("🧹 dist/ limpo");
  } catch {
    // diretório não existe, ok
  }
  await ensureDir(DIST_DIR);
}

async function copyStatic() {
  await Deno.copyFile("index.html", join(DIST_DIR, "index.html"));
  await Deno.copyFile("manifest.json", join(DIST_DIR, "manifest.json"));

  try {
    await copy("public", join(DIST_DIR, "public"), { overwrite: true });
  } catch {
    // public pode não existir
  }

  console.log("📁 Arquivos estáticos copiados");
}

function formatSize(result: BundleResult): string {
  if (!result.outputFiles || result.outputFiles.length === 0) {
    return "tamanho desconhecido";
  }
  const totalBytes = result.outputFiles.reduce(
    (sum, f) => sum + new TextEncoder().encode(f.text()).length,
    0,
  );
  return `${(totalBytes / 1024).toFixed(1)} KB`;
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

async function buildMain() {
  console.log("🔨 Build: src/main/main.tsx → dist/main.js");
  const result = await runBundle("main", {
    entrypoints: [join(SRC_DIR, "main", "main.tsx")],
    output: DIST_DIR,
    platform: "browser",
    minify: !opts.watch,
    sourcemap: opts.watch ? "linked" : undefined,
    jsx: "react-jsx",
    jsxImportSource: "preact",
  });
  await writeOutput(result, "main.js");
  console.log(`   ✅ main.js gerado (${formatSize(result)})`);
}

async function buildWorker() {
  console.log("🔨 Build: src/worker/worker.ts → dist/worker.js");
  const result = await runBundle("worker", {
    entrypoints: [join(SRC_DIR, "worker", "worker.ts")],
    output: DIST_DIR,
    platform: "browser",
    minify: !opts.watch,
    sourcemap: opts.watch ? "linked" : undefined,
  });
  await writeOutput(result, "worker.js");
  console.log(`   ✅ worker.js gerado (${formatSize(result)})`);
}

async function buildServiceWorker() {
  console.log("🔨 Build: src/sw/sw.ts → dist/sw.js");
  const result = await runBundle("sw", {
    entrypoints: [join(SRC_DIR, "sw", "sw.ts")],
    output: DIST_DIR,
    platform: "browser",
    minify: !opts.watch,
    sourcemap: opts.watch ? "linked" : undefined,
  });
  await writeOutput(result, "sw.js");
  console.log(`   ✅ sw.js gerado (${formatSize(result)})`);
}

async function build() {
  console.log("\n🚀 Iniciando build PWA...\n");
  const start = performance.now();

  await clean();
  await copyStatic();

  await Promise.all([
    buildMain(),
    buildWorker(),
    buildServiceWorker(),
  ]);

  const elapsed = (performance.now() - start).toFixed(0);
  console.log(`\n✨ Build completo em ${elapsed}ms → dist/`);
}

await build();

if (opts.watch) {
  console.log("👀 Watch mode ativo. Pressione Ctrl+C para parar.\n");
  const watcher = Deno.watchFs(SRC_DIR);
  let debounce: number | undefined;

  for await (const event of watcher) {
    if (
      event.kind === "modify" || event.kind === "create" ||
      event.kind === "remove"
    ) {
      clearTimeout(debounce);
      debounce = setTimeout(async () => {
        console.log(`\n🔄 Mudança detectada: ${event.paths.join(", ")}`);
        try {
          await build();
        } catch (err) {
          console.error("❌ Erro no rebuild:", err);
        }
      }, 100);
    }
  }
}
