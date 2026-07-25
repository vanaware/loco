import { transpile } from "https://deno.land/x/emit@0.40.0/mod.ts";
import { walk } from "@std/path";

const srcDir = "./src";
const distDir = "./dist";

// Limpa diretório de saída
try { await Deno.remove(distDir, { recursive: true }); } catch {}
await Deno.mkdir(distDir, { recursive: true });

// Coleta todos os arquivos .ts/.tsx
const tsFiles: string[] = [];
for await (const entry of walk(srcDir)) {
  if (entry.isFile && /\.(ts|tsx)$/.test(entry.path)) {
    tsFiles.push(entry.path);
  }
}

// Transpila TypeScript
const sources: Record<string, string> = {};
for (const file of tsFiles) {
  sources[`file://${Deno.cwd()}/${file}`] = await Deno.readTextFile(file);
}

const result = await transpile(sources, {
  compilerOptions: {
    jsx: "react-jsx",
    jsxImportSource: "preact",
  },
});

// Escreve arquivos transpilados
for (const [url, code] of Object.entries(result)) {
  const relPath = url.replace(`file://${Deno.cwd()}/src/`, "").replace(/\.tsx?$/, ".js");
  const outPath = `${distDir}/${relPath}`;
  await Deno.mkdir(outPath.substring(0, outPath.lastIndexOf("/")), { recursive: true });
  await Deno.writeTextFile(outPath, code);
}

// Processa index.html (injeta script do app)
let html = await Deno.readTextFile(`${srcDir}/index.html`);
const appJs = await Deno.readTextFile(`${distDir}/components/App.js`);
html = html.replace("<!-- APP_JS -->", `<script type="module">${appJs}</script>`);
await Deno.writeTextFile(`${distDir}/index.html`, html);

// Copia Service Worker
await Deno.copyFile(`${distDir}/sw.js`, `${distDir}/sw.js`);

console.log("✅ Build concluído em ./dist");
