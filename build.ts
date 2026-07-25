import { expandGlob } from "https://deno.land/std@0.224.0/fs/expand_glob.ts";
import ts from "https://esm.sh/typescript@5.5.4?bundle";

const distDir = "./dist";
const publicDir = "./public";

// Limpa diretório de saída
try { await Deno.remove(distDir, { recursive: true }); } catch {}
await Deno.mkdir(distDir, { recursive: true });

// Lê todos os arquivos TS/TSX do src/
const modules = new Map<string, string>();
const srcFiles: string[] = [];

for await (const entry of expandGlob("./src/**/*.{ts,tsx}")) {
  if (entry.isFile) {
    srcFiles.push(entry.path);
    modules.set(entry.path, await Deno.readTextFile(entry.path));
  }
}

// Resolve o caminho absoluto do entrypoint
const entryPath = Deno.realPathSync("./src/components/App.tsx");

const tsConfig = {
  jsx: ts.JsxEmit.ReactJSX,
  jsxImportSource: "preact",
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  esModuleInterop: true,
  strict: false,
  skipLibCheck: true,
  declaration: false,
  allowJs: true,
};

const outputs: Record<string, string> = {};

function resolvePath(fileName: string): string | undefined {
  if (modules.has(fileName)) return fileName;
  try {
    const real = Deno.realPathSync(fileName);
    if (modules.has(real)) return real;
  } catch {
    // ignore
  }
  return undefined;
}

// Cria um host do TypeScript virtual
const compilerHost: ts.CompilerHost = {
  getSourceFile: (fileName) => {
    const resolved = resolvePath(fileName) || fileName;
    const content = modules.get(resolved);
    if (!content) return undefined;
    return ts.createSourceFile(fileName, content, ts.ScriptTarget.ES2022, true);
  },
  getDefaultLibFileName: () => "lib.es2022.d.ts",
  writeFile: (name, data) => {
    outputs[name] = data;
  },
  getCurrentDirectory: () => Deno.cwd(),
  getDirectories: () => [],
  fileExists: (fileName) => !!resolvePath(fileName),
  readFile: (fileName) => {
    const resolved = resolvePath(fileName);
    return resolved ? modules.get(resolved) : undefined;
  },
  getCanonicalFileName: (fileName) => fileName,
  useCaseSensitiveFileNames: () => true,
  getNewLine: () => "\n",
};

const program = ts.createProgram([entryPath], tsConfig, compilerHost);
program.emit();

// Salva os arquivos JS na dist/
for (const [name, code] of Object.entries(outputs)) {
  const relPath = name.replace(Deno.cwd() + "/src/", "");
  const outPath = `${distDir}/${relPath}`;
  const dir = outPath.substring(0, outPath.lastIndexOf("/"));
  if (dir) await Deno.mkdir(dir, { recursive: true });
  await Deno.writeTextFile(outPath, code);
}

// Copia arquivos públicos
try {
  for await (const entry of expandGlob(`${publicDir}/**/*`)) {
    if (entry.isFile) {
      const relPath = entry.path.replace(`${Deno.cwd()}/public/`, "");
      const destPath = `${distDir}/${relPath}`;
      const destDir = destPath.substring(0, destPath.lastIndexOf("/"));
      if (destDir) await Deno.mkdir(destDir, { recursive: true });
      await Deno.copyFile(entry.path, destPath);
    }
  }
  console.log("✅ Arquivos públicos copiados");
} catch (e) {
  console.warn("⚠️ Erro ao copiar public/:", e);
}

// Gera index.html com o App.js inline
let html = await Deno.readTextFile("./src/index.html");
const appJs = outputs[entryPath.replace(/\.tsx?$/, ".js")];

const importMap = `<script type="importmap">
{
  "imports": {
    "preact": "https://esm.sh/preact@10.19.3",
    "preact/hooks": "https://esm.sh/preact@10.19.3/hooks",
    "preact/jsx-runtime": "https://esm.sh/preact@10.19.3/jsx-runtime",
    "@preact/signals": "https://esm.sh/@preact/signals@1.2.2",
    "@material/web/all.js": "https://esm.sh/@material/web@1.5.1?bundle",
    "idb-keyval": "https://esm.sh/idb-keyval@6.2.1",
    "fflate": "https://esm.sh/fflate@0.8.2",
    "@libs/qrcode": "https://esm.sh/@libs/qrcode@1.2.2"
  }
}
</script>`;

html = html.replace("<!-- APP_JS -->", `${importMap}\n<script type="module">${appJs}</script>`);

// Adiciona link para Material Icons
const iconsLink = `<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">`;
html = html.replace("</head>", `${iconsLink}\n</head>`);

await Deno.writeTextFile(`${distDir}/index.html`, html);

console.log("✅ Build concluído em ./dist");
