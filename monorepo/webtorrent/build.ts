// Arquivo: monorepo/webtorrent/build.ts
import { ensureDir } from "@std/fs";
import { join } from "@std/path";

const DIST_DIR = "./build/dist";

async function clean() {
  try {
    await Deno.remove(DIST_DIR, { recursive: true });
  } catch {}
  await ensureDir(DIST_DIR);
  await ensureDir(join(DIST_DIR, "sw"));
}

async function build() {
  console.log("🚀 Build WebTorrent...");
  await clean();

  // Bundle App
  const appResult = await Deno.bundle({
    entrypoints: ["./src/main.tsx"],
    outputDir: DIST_DIR,
    platform: "browser",
    format: "esm",
    minify: false,
    write: true,
    packages: "bundle",
    jsx: "react-jsx",
    jsxImportSource: "preact",
  });
  if (!appResult.success) console.error(appResult.errors);

  // Bundle SW (Formato ESM para Service Workers modernos)
  const swResult = await Deno.bundle({
    entrypoints: ["./src/sw/worker.ts"],
    outputDir: join(DIST_DIR, "sw"),
    platform: "browser",
    format: "esm", 
    minify: false,
    write: true,
    packages: "bundle",
  });
  if (!swResult.success) console.error(swResult.errors);

  // Copy HTML
  await Deno.copyFile("./src/index.html", join(DIST_DIR, "index.html"));
  console.log("✅ Build concluído.");
}

await build();