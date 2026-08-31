> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém experimentos e código da área de @loco/utils
> O projeto é o **Loco ** estruturado em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco - Modo: UTILS

Gerado automaticamente em: 8/30/2026, 10:08:58 PM

---

## Arquivo: `monorepo/utils/tests/helpers/fixtures.ts`

```ts
/// <reference lib="deno.ns" />

import { join } from "@std/path";

/**
 * Cria um diretório temporário com estrutura controlada para testes.
 * Retorna o caminho e uma função de cleanup.
 */
export async function withTempDir<T>(
  fn: (dir: string) => Promise<T>
): Promise<T> {
  const tempDir = await Deno.makeTempDir({ prefix: "loco-test-" });
  try {
    return await fn(tempDir);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
}

/**
 * Cria um arquivo deno.jsonc temporário com versão especificada.
 */
export async function withTempDenoJsonc(
  version: string,
  extras?: Record<string, unknown>
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const tempDir = await Deno.makeTempDir({ prefix: "loco-deno-test-" });
  const path = join(tempDir, "deno.jsonc");

  const content = JSON.stringify({
    name: "@loco/test",
    version,
    ...extras,
  }, null, 2);

  await Deno.writeTextFile(path, content);

  return {
    path,
    cleanup: async () => await Deno.remove(tempDir, { recursive: true }),
  };
}

/**
 * Cria uma estrutura de arquivos temporária para testes de filesystem.
 */
export async function withFileStructure(
  files: Record<string, string>
): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const tempDir = await Deno.makeTempDir({ prefix: "loco-fs-test-" });

  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(tempDir, path);
    const dirPath = fullPath.substring(0, fullPath.lastIndexOf("/"));

    if (dirPath) {
      await Deno.mkdir(dirPath, { recursive: true });
    }

    await Deno.writeTextFile(fullPath, content);
  }

  return {
    dir: tempDir,
    cleanup: async () => await Deno.remove(tempDir, { recursive: true }),
  };
}

/**
 * Verifica se um arquivo existe.
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lê o conteúdo de um arquivo como texto.
 */
export async function readText(path: string): Promise<string> {
  return await Deno.readTextFile(path);
}

/**
 * Lista arquivos em um diretório recursivamente.
 */
export async function listFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    files.push(entry.name);
  }
  return files;
}
```

---

## Arquivo: `monorepo/utils/tests/esbuild/paths.test.ts`

```ts
/// <reference lib="deno.ns" />

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { isSafePath } from "@loco/utils/build";

describe("isSafePath", () => {
  describe("paths seguros", () => {
    const safePaths = [
      "arquivo.js",
      "pasta/arquivo.js",
      "pasta/subpasta/arquivo.js",
      ".",
      "file-with-dash.js",
      "file_with_underscore.js",
      "file.name.with.dots.js",
      "UPPERCASE.js",
      "123.js",
      "path/to/file",
    ];

    for (const path of safePaths) {
      it(`aceita "${path}"`, () => {
        assertEquals(isSafePath(path), true);
      });
    }
  });

  describe("paths bloqueados (path traversal)", () => {
    const traversalPaths = [
      "..",
      "../file.js",
      "pasta/../file.js",
      "a/b/c/../../file.js",
      "../../../etc/passwd",
      "foo..bar",
      "file..js",
    ];

    for (const path of traversalPaths) {
      it(`bloqueia "${path}"`, () => {
        assertEquals(isSafePath(path), false);
      });
    }
  });

  describe("paths bloqueados (absolutos Unix)", () => {
    const absolutePaths = [
      "/etc/passwd",
      "/home/user",
      "/var/log/system.log",
      "/tmp/test",
    ];

    for (const path of absolutePaths) {
      it(`bloqueia "${path}"`, () => {
        assertEquals(isSafePath(path), false);
      });
    }
  });

  describe("edge cases", () => {
    it("string vazia é considerada segura (não é traversal nem absoluta)", () => {
      assertEquals(isSafePath(""), true);
    });

    it("path com apenas espaços é seguro", () => {
      assertEquals(isSafePath("   "), true);
    });

    it("path com caracteres especiais é seguro", () => {
      assertEquals(isSafePath("file@name.js"), true);
      assertEquals(isSafePath("file+name.js"), true);
    });
  });
});
```

---

## Arquivo: `monorepo/utils/tests/esbuild/filesystem.test.ts`

```ts
/// <reference lib="deno.ns" />

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import {
  cleanTarget,
  listAssetsForCache,
  copyStaticFiles,
} from "../../src/esbuild/mod.ts";
import {
  withTempDir,
  withFileStructure,
  fileExists,
  listFiles,
  readText,
} from "../helpers/fixtures.ts";

describe("cleanTarget", () => {
  it("remove arquivo específico", async () => {
    await withTempDir(async (dir) => {
      await Deno.writeTextFile(join(dir, "teste.js"), "code");
      assertEquals(await fileExists(join(dir, "teste.js")), true);

      await cleanTarget(dir, ["teste.js"]);

      assertEquals(await fileExists(join(dir, "teste.js")), false);
    });
  });

  it("remove pasta recursivamente", async () => {
    await withTempDir(async (dir) => {
      const subDir = join(dir, "subpasta");
      await Deno.mkdir(subDir);
      await Deno.writeTextFile(join(subDir, "arquivo.js"), "code");

      await cleanTarget(dir, ["subpasta"]);

      assertEquals(await fileExists(subDir), false);
    });
  });

  it("esvazia diretório com '.'", async () => {
    await withTempDir(async (dir) => {
      await Deno.writeTextFile(join(dir, "a.js"), "a");
      await Deno.writeTextFile(join(dir, "b.js"), "b");
      await Deno.mkdir(join(dir, "sub"));
      await Deno.writeTextFile(join(dir, "sub/c.js"), "c");

      await cleanTarget(dir, ["."]);

      const files = await listFiles(dir);
      assertEquals(files.length, 0);
    });
  });

  it("ignora path traversal (..)", async () => {
    await withTempDir(async (dir) => {
      // Cria arquivo fora do dir que não deve ser removido
      const outsideFile = join(dir, "..", "protegido.txt");
      try {
        await Deno.writeTextFile(outsideFile, "não me remova");
      } catch {
        // Pode falhar se não tiver permissão
      }

      await cleanTarget(dir, ["../protegido.txt"]);

      // O arquivo fora do dir deve ainda existir (se foi criado)
      try {
        assertEquals(await fileExists(outsideFile), true);
        await Deno.remove(outsideFile);
      } catch {
        // Se não conseguiu criar, ok
      }
    });
  });

  it("ignora paths absolutos", async () => {
    await withTempDir(async (dir) => {
      // Não deve lançar erro nem remover nada
      await cleanTarget(dir, ["/etc/passwd", "/tmp/test"]);
      assertEquals(true, true);
    });
  });

  it("não lança erro para arquivo inexistente", async () => {
    await withTempDir(async (dir) => {
      await cleanTarget(dir, ["nao-existe.js"]);
      assertEquals(true, true);
    });
  });

  it("lista vazia não faz nada", async () => {
    await withTempDir(async (dir) => {
      await Deno.writeTextFile(join(dir, "keep.js"), "keep");
      await cleanTarget(dir, []);
      assertEquals(await fileExists(join(dir, "keep.js")), true);
    });
  });

  it("processa múltiplos paths de uma vez", async () => {
    await withTempDir(async (dir) => {
      await Deno.writeTextFile(join(dir, "a.js"), "a");
      await Deno.writeTextFile(join(dir, "b.js"), "b");
      await Deno.writeTextFile(join(dir, "c.js"), "c");

      await cleanTarget(dir, ["a.js", "c.js"]);

      assertEquals(await fileExists(join(dir, "a.js")), false);
      assertEquals(await fileExists(join(dir, "b.js")), true);
      assertEquals(await fileExists(join(dir, "c.js")), false);
    });
  });
});

describe("listAssetsForCache", () => {
  it("lista arquivos em estrutura simples", async () => {
    const { dir, cleanup } = await withFileStructure({
      "app.js": "code",
      "style.css": "css",
    });

    try {
      const assets = await listAssetsForCache(dir);
      assertEquals(assets.length, 2);
      assertEquals(assets.includes("./app.js"), true);
      assertEquals(assets.includes("./style.css"), true);
    } finally {
      await cleanup();
    }
  });

  it("exclui arquivos .map", async () => {
    const { dir, cleanup } = await withFileStructure({
      "app.js": "code",
      "app.js.map": "map",
    });

    try {
      const assets = await listAssetsForCache(dir);
      assertEquals(assets.length, 1);
      assertEquals(assets[0], "./app.js");
    } finally {
      await cleanup();
    }
  });

  it("exclui metafile.json", async () => {
    const { dir, cleanup } = await withFileStructure({
      "app.js": "code",
      "ui-metafile.json": "{}",
    });

    try {
      const assets = await listAssetsForCache(dir);
      assertEquals(assets.length, 1);
    } finally {
      await cleanup();
    }
  });

  it("exclui service-worker.js por padrão", async () => {
    const { dir, cleanup } = await withFileStructure({
      "app.js": "code",
      "service-worker.js": "sw code",
    });

    try {
      const assets = await listAssetsForCache(dir);
      assertEquals(assets.includes("./service-worker.js"), false);
      assertEquals(assets.length, 1);
    } finally {
      await cleanup();
    }
  });

  it("aceita lista de exclusão customizada", async () => {
    const { dir, cleanup } = await withFileStructure({
      "app.js": "code",
      "temp.js": "temp",
      "debug.js": "debug",
    });

    try {
      const assets = await listAssetsForCache(dir, ["temp.js", "debug.js"]);
      assertEquals(assets.length, 1);
      assertEquals(assets[0], "./app.js");
    } finally {
      await cleanup();
    }
  });

  it("lida com subdiretórios", async () => {
    const { dir, cleanup } = await withFileStructure({
      "app.js": "code",
      "assets/logo.png": "png",
      "assets/icons/favicon.ico": "ico",
    });

    try {
      const assets = await listAssetsForCache(dir);
      assertEquals(assets.length, 3);
      // Deve conter os paths relativos
      const hasLogo = assets.some(a => a.includes("logo.png"));
      const hasIcon = assets.some(a => a.includes("favicon.ico"));
      assertEquals(hasLogo, true);
      assertEquals(hasIcon, true);
    } finally {
      await cleanup();
    }
  });
});

describe("copyStaticFiles", () => {
  it("copia publicdir para distdir", async () => {
    const { dir: publicDir, cleanup: cleanupPublic } = await withFileStructure({
      "manifest.json": `{ "name": "Loco", "version": "1.0.0" }`,
      "icon.png": "png",
    });

    const { dir: distDir, cleanup: cleanupDist } = await withFileStructure({});

    try {
      const config = {
        srcdir: "/tmp/src",
        distdir: distDir,
        publicdir: publicDir,
        entryPoints: [],
      };

      await copyStaticFiles(config, "2.0.0");

      // Arquivos foram copiados
      assertEquals(await fileExists(join(distDir, "manifest.json")), true);
      assertEquals(await fileExists(join(distDir, "icon.png")), true);

      // manifest.json foi atualizado
      const manifest = JSON.parse(await readText(join(distDir, "manifest.json")));
      assertEquals(manifest.version, "2.0.0");
    } finally {
      await cleanupPublic();
      await cleanupDist();
    }
  });

  it("copia index.html quando indexHtml é true", async () => {
    const { dir: srcDir, cleanup: cleanupSrc } = await withFileStructure({
      "index.html": "<html></html>",
    });

    const { dir: distDir, cleanup: cleanupDist } = await withFileStructure({});

    try {
      const config = {
        srcdir: srcDir,
        distdir: distDir,
        indexHtml: true,
        entryPoints: [],
      };

      await copyStaticFiles(config, "1.0.0");

      assertEquals(await fileExists(join(distDir, "index.html")), true);
      const content = await readText(join(distDir, "index.html"));
      assertEquals(content, "<html></html>");
    } finally {
      await cleanupSrc();
      await cleanupDist();
    }
  });

  it("não falha quando publicdir não existe", async () => {
    const { dir: distDir, cleanup } = await withFileStructure({});

    try {
      const config = {
        srcdir: "/tmp/src",
        distdir: distDir,
        publicdir: "/caminho/inexistente",
        entryPoints: [],
      };

      // Não deve lançar erro
      await copyStaticFiles(config, "1.0.0");
      assertEquals(true, true);
    } finally {
      await cleanup();
    }
  });

  it("não falha quando index.html não existe", async () => {
    const { dir: srcDir, cleanup: cleanupSrc } = await withFileStructure({});
    const { dir: distDir, cleanup: cleanupDist } = await withFileStructure({});

    try {
      const config = {
        srcdir: srcDir,
        distdir: distDir,
        indexHtml: true,
        entryPoints: [],
      };

      await copyStaticFiles(config, "1.0.0");
      assertEquals(await fileExists(join(distDir, "index.html")), false);
    } finally {
      await cleanupSrc();
      await cleanupDist();
    }
  });

  it("preserva manifest.json sem version quando não há campo", async () => {
    const { dir: publicDir, cleanup: cleanupPublic } = await withFileStructure({
      "manifest.json": `{ "name": "Loco" }`,
    });

    const { dir: distDir, cleanup: cleanupDist } = await withFileStructure({});

    try {
      const config = {
        srcdir: "/tmp/src",
        distdir: distDir,
        publicdir: publicDir,
        entryPoints: [],
      };

      await copyStaticFiles(config, "3.0.0");

      const manifest = JSON.parse(await readText(join(distDir, "manifest.json")));
      assertEquals(manifest.name, "Loco");
      assertEquals(manifest.version, "3.0.0");
    } finally {
      await cleanupPublic();
      await cleanupDist();
    }
  });
});
```

---

## Arquivo: `monorepo/utils/tests/esbuild/cli.test.ts`

```ts
/// <reference lib="deno.ns" />

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { parseArgs } from "@loco/utils/build";
import type { GlobalTargetConfig } from "../../src/interfaces/mod.ts";

// Helper para criar config mínima
function makeTarget(overrides: Record<string, unknown> = {}) {
  return { srcdir: "src", distdir: "dist", entryPoints: ["a.ts"], ...overrides };
}

describe("parseArgs", () => {
  // ========================================================================
  // CONFIGS DE TESTE
  // ========================================================================

  // CONFIG legado: sem mode nem default (compatibilidade)
  const CONFIG_LEGACY: GlobalTargetConfig = {
    ui: makeTarget(),
    worker: makeTarget(),
    sw: makeTarget(),
  };

  // CONFIG com default explícito
  const CONFIG_WITH_DEFAULTS: GlobalTargetConfig = {
    ui: makeTarget({ default: true }),
    worker: makeTarget({ default: true }),
    sw: makeTarget({ default: true }),
    admin: makeTarget({ default: false }),
  };

  // CONFIG com múltiplos watches
  const CONFIG_WITH_WATCHES: GlobalTargetConfig = {
    ui: makeTarget({ mode: 'build', default: true }),
    sw: makeTarget({ mode: 'build', default: true }),
    'watch-ui': makeTarget({ mode: 'watch', default: false }),
    'watch-admin': makeTarget({ mode: 'watch', default: false }),
  };

  // CONFIG misto: builds, watches e sob demanda
  const CONFIG_MIXED: GlobalTargetConfig = {
    ui: makeTarget({ mode: 'build', default: true }),
    sw: makeTarget({ mode: 'build', default: true }),
    admin: makeTarget({ mode: 'build', default: false }),
    'watch-ui': makeTarget({ mode: 'watch', default: false }),
    'watch-admin': makeTarget({ mode: 'watch', default: false }),
  };

  // ========================================================================
  // COMPATIBILIDADE (sem mode nem default)
  // ========================================================================

  describe("compatibilidade (sem mode nem default)", () => {
    it("inclui todos os alvos por padrão", () => {
      const result = parseArgs([], CONFIG_LEGACY);
      assertEquals(result.targets, ["ui", "worker", "sw"]);
      assertEquals(result.watchTarget, null);
    });
  });

  // ========================================================================
  // PROPRIEDADE default
  // ========================================================================

  describe("propriedade default", () => {
    it("inclui apenas alvos com default !== false", () => {
      const result = parseArgs([], CONFIG_WITH_DEFAULTS);
      assertEquals(result.targets, ["ui", "worker", "sw"]);
      assertEquals(result.targets.includes("admin"), false);
    });

    it("inclui alvo com default: false quando solicitado", () => {
      const result = parseArgs(["admin"], CONFIG_WITH_DEFAULTS);
      assertEquals(result.targets, ["admin"]);
    });
  });

  // ========================================================================
  // PROPRIEDADE mode: 'watch'
  // ========================================================================

  describe("propriedade mode: 'watch'", () => {
    it("watch NUNCA aparece nos targets padrão", () => {
      const result = parseArgs([], CONFIG_WITH_WATCHES);
      assertEquals(result.targets, ["ui", "sw"]);
      assertEquals(result.targets.includes("watch-ui"), false);
      assertEquals(result.targets.includes("watch-admin"), false);
      assertEquals(result.watchTarget, null);
    });

    it("flag 'watch' seleciona o PRIMEIRO alvo watch", () => {
      const result = parseArgs(["watch"], CONFIG_WITH_WATCHES);
      assertEquals(result.watchTarget, "watch-ui");
      assertEquals(result.targets, []);
    });

    it("solicitar alvo watch pelo nome ativa modo watch", () => {
      const result = parseArgs(["watch-admin"], CONFIG_WITH_WATCHES);
      assertEquals(result.watchTarget, "watch-admin");
      assertEquals(result.targets, []);
    });

    it("modo watch ativo → targets de build vazios", () => {
      const result = parseArgs(["watch", "ui", "sw"], CONFIG_WITH_WATCHES);
      assertEquals(result.watchTarget, "watch-ui");
      assertEquals(result.targets, []);
    });

    it("watch com default: true ainda é excluído dos targets padrão", () => {
      const config: GlobalTargetConfig = {
        ui: makeTarget({ mode: 'build' }),
        'watch-ui': makeTarget({ mode: 'watch', default: true }),
      };
      const result = parseArgs([], config);
      assertEquals(result.targets, ["ui"]);
      assertEquals(result.watchTarget, null);
    });
  });

  // ========================================================================
  // MÚLTIPLOS WATCHES
  // ========================================================================

  describe("múltiplos watches", () => {
    it("flag 'watch' usa apenas o primeiro (ordem do CONFIG)", () => {
      const result = parseArgs(["watch"], CONFIG_MIXED);
      assertEquals(result.watchTarget, "watch-ui");
    });

    it("watch específico pode ser solicitado pelo nome", () => {
      const result = parseArgs(["watch-admin"], CONFIG_MIXED);
      assertEquals(result.watchTarget, "watch-admin");
    });

    it("solicitar múltiplos watches usa o primeiro na ordem do CONFIG", () => {
      const result = parseArgs(["watch-admin", "watch-ui"], CONFIG_MIXED);
      // watch-ui vem antes de watch-admin no CONFIG
      assertEquals(result.watchTarget, "watch-ui");
    });
  });

  // ========================================================================
  // FLAGS ESPECIAIS
  // ========================================================================

  describe("flags especiais", () => {
    it("detecta noversion", () => {
      const result = parseArgs(["noversion"], CONFIG_MIXED);
      assertEquals(result.globalNoVersion, true);
    });

    it("combina noversion com watch", () => {
      const result = parseArgs(["noversion", "watch"], CONFIG_MIXED);
      assertEquals(result.globalNoVersion, true);
      assertEquals(result.watchTarget, "watch-ui");
    });

    it("combina noversion com alvos de build", () => {
      const result = parseArgs(["noversion", "ui"], CONFIG_MIXED);
      assertEquals(result.globalNoVersion, true);
      assertEquals(result.targets, ["ui"]);
    });
  });

  // ========================================================================
  // ORDEM DO CONFIG
  // ========================================================================

  describe("ordem do CONFIG", () => {
    it("mantém ordem do CONFIG mesmo com solicitação fora de ordem", () => {
      const result = parseArgs(["sw", "ui"], CONFIG_MIXED);
      assertEquals(result.targets, ["ui", "sw"]);
    });

    it("preserva ordem com múltiplos alvos", () => {
      const result = parseArgs(["admin", "ui", "sw"], CONFIG_MIXED);
      assertEquals(result.targets, ["ui", "sw", "admin"]);
    });
  });

  // ========================================================================
  // CASE INSENSITIVITY
  // ========================================================================

  describe("case insensitivity", () => {
    it("aceita maiúsculas para alvos", () => {
      const result = parseArgs(["UI", "SW"], CONFIG_MIXED);
      assertEquals(result.targets, ["ui", "sw"]);
    });

    it("aceita maiúsculas para watch", () => {
      const result = parseArgs(["WATCH"], CONFIG_MIXED);
      assertEquals(result.watchTarget, "watch-ui");
    });

    it("aceita misto", () => {
      const result = parseArgs(["NoVersion", "Watch-Admin"], CONFIG_MIXED);
      assertEquals(result.globalNoVersion, true);
      assertEquals(result.watchTarget, "watch-admin");
    });
  });

  // ========================================================================
  // EDGE CASES
  // ========================================================================

  describe("edge cases", () => {
    it("retorna targets vazios se todos forem default: false", () => {
      const config: GlobalTargetConfig = {
        admin: makeTarget({ default: false }),
        debug: makeTarget({ default: false }),
      };
      const result = parseArgs([], config);
      assertEquals(result.targets, []);
      assertEquals(result.watchTarget, null);
    });

    it("ignora args desconhecidos", () => {
      const result = parseArgs(["ui", "desconhecido"], CONFIG_MIXED);
      assertEquals(result.targets, ["ui"]);
    });

    it("watchTarget é null se não houver alvo watch no CONFIG", () => {
      const result = parseArgs(["watch"], CONFIG_LEGACY);
      assertEquals(result.watchTarget, null);
      // Volta para os targets padrão já que não há watch
      assertEquals(result.targets, ["ui", "worker", "sw"]);
    });

    it("CONFIG vazio retorna tudo vazio", () => {
      const result = parseArgs([], {});
      assertEquals(result.targets, []);
      assertEquals(result.watchTarget, null);
    });
  });
});
```

---

## Arquivo: `monorepo/utils/tests/esbuild/integration.test.ts`

```ts
/// <reference lib="deno.ns" />

import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { processTarget } from "../../src/esbuild/mod.ts";
import type { TargetConfig } from "../../src/interfaces/mod.ts";
import { withFileStructure, fileExists, readText } from "../helpers/fixtures.ts";

describe("processTarget (integração)", () => {
  it("executa pipeline completo: clean, copy, build", async () => {
    const { dir: srcDir, cleanup: cleanupSrc } = await withFileStructure({
      "index.html": "<html></html>",
    });
    const { dir: publicDir, cleanup: cleanupPublic } = await withFileStructure({
      "manifest.json": `{ "name": "Loco", "version": "1.0.0" }`,
    });
    const { dir: distDir, cleanup: cleanupDist } = await withFileStructure({
      "old-file.js": "should be deleted",
    });
    try {
      const config: TargetConfig = {
        srcdir: srcDir,
        distdir: distDir,
        publicdir: publicDir,
        indexHtml: true,
        clean: ["."],
        entryPoints: ["dummy.ts"],
      };
      // Mock esbuild.build
      const mockBuild = async (options: any) => {
        // Simula escrita do arquivo de saída
        const outFile = options.outfile || join(options.outdir, "output.js");
        await Deno.writeTextFile(outFile, "// bundled code");
        return { metafile: null, errors: [], warnings: [] };
      };
      await processTarget("ui", config, "2.0.0", mockBuild);
      // Arquivo antigo foi removido (clean: ["."])
      assertEquals(await fileExists(join(distDir, "old-file.js")), false);
      // Arquivos estáticos foram copiados
      assertEquals(await fileExists(join(distDir, "index.html")), true);
      assertEquals(await fileExists(join(distDir, "manifest.json")), true);
      // manifest.json foi atualizado
      const manifest = JSON.parse(await readText(join(distDir, "manifest.json")));
      assertEquals(manifest.version, "2.0.0");
      // Bundle foi gerado
      assertEquals(await fileExists(join(distDir, "output.js")), true);
    } finally {
      await cleanupSrc();
      await cleanupPublic();
      await cleanupDist();
    }
  });

  it("salva metafile quando gerado", async () => {
    const { dir: distDir, cleanup } = await withFileStructure({});
    try {
      const config: TargetConfig = {
        srcdir: "src",
        distdir: distDir,
        entryPoints: ["dummy.ts"],
        metafile: true,
      };
      const mockBuild = async () => ({
        metafile: {
          inputs: { "src/main.ts": { bytes: 100 } },
          outputs: { "dist/main.js": { bytes: 500 } },
        },
      });
      await processTarget("ui", config, "1.0.0", mockBuild);
      const metafilePath = join(distDir, "ui-metafile.json");
      assertEquals(await fileExists(metafilePath), true);
      const metafile = JSON.parse(await readText(metafilePath));
      assertEquals(metafile.inputs["src/main.ts"].bytes, 100);
    } finally {
      await cleanup();
    }
  });

  it("não salva metafile quando metafile é false", async () => {
    const { dir: distDir, cleanup } = await withFileStructure({});
    try {
      const config: TargetConfig = {
        srcdir: "src",
        distdir: distDir,
        entryPoints: ["dummy.ts"],
        metafile: false,
      };
      const mockBuild = async () => ({
        metafile: { inputs: {} },
      });
      await processTarget("ui", config, "1.0.0", mockBuild);
      assertEquals(
        await fileExists(join(distDir, "ui-metafile.json")),
        false
      );
    } finally {
      await cleanup();
    }
  });

  it("propaga erro do esbuild.build", async () => {
    const { dir: distDir, cleanup } = await withFileStructure({});
    try {
      const config: TargetConfig = {
        srcdir: "src",
        distdir: distDir,
        entryPoints: ["dummy.ts"],
      };
      const mockBuild = async () => {
        throw new Error("Build failed");
      };
      let caughtError: Error | null = null;
      try {
        await processTarget("ui", config, "1.0.0", mockBuild);
      } catch (error) {
        caughtError = error as Error;
      }
      assertEquals(caughtError !== null, true);
      assertStringIncludes(caughtError!.message, "Build failed");
    } finally {
      await cleanup();
    }
  });

  it("usa outfile quando especificado", async () => {
    const { dir: distDir, cleanup } = await withFileStructure({});
    try {
      const config: TargetConfig = {
        srcdir: "src",
        distdir: distDir,
        entryPoints: ["dummy.ts"],
        outfile: join(distDir, "custom-name.js"),
      };
      let capturedOptions: any = null;
      const mockBuild = async (options: any) => {
        capturedOptions = options;
        await Deno.writeTextFile(options.outfile, "// code");
        return {};
      };
      await processTarget("ui", config, "1.0.0", mockBuild);
      assertEquals(capturedOptions.outfile, join(distDir, "custom-name.js"));
      assertEquals(capturedOptions.outdir, undefined);
    } finally {
      await cleanup();
    }
  });

  it("lida com SW injetando assets via listFn", async () => {
    const { dir: distDir, cleanup } = await withFileStructure({
      "app.js": "code",
      "index.html": "html",
      "service-worker.js": "sw",
    });
    try {
      const config: TargetConfig = {
        srcdir: "src",
        distdir: distDir,
        entryPoints: ["sw.ts"],
      };
      let capturedDefine: Record<string, string> = {};
      const mockBuild = async (options: any) => {
        capturedDefine = options.define;
        return {};
      };
      const mockListFn = async () => ["./app.js", "./index.html"];
      await processTarget("sw", config, "1.0.0", mockBuild, mockListFn);
      
      // 🔥 CORREÇÃO: Tratamento explícito de undefined (noUncheckedIndexedAccess)
      const generatedAssets = capturedDefine["__GENERATED_ASSETS__"]!;
      const appVersion = capturedDefine["__APP_VERSION__"]!;
      
      const assets = JSON.parse(generatedAssets);
      assertEquals(assets, ["./app.js", "./index.html"]);
      assertStringIncludes(appVersion, "v1.0.0");
    } finally {
      await cleanup();
    }
  });
});
```

---

## Arquivo: `monorepo/utils/tests/esbuild/version.test.ts`

```ts
/// <reference lib="deno.ns" />

import { describe, it } from "@std/testing/bdd";
import {
  assertEquals,
  assertThrows,
  assertStringIncludes,
} from "@std/assert";
import {
  parseVersion,
  formatVersion,
  extractVersionFromContent,
  replaceVersionInContent,
  currentVersion,
  incrementVersion,
} from  "../../src/esbuild/mod.ts";
import { withTempDenoJsonc } from "../helpers/fixtures.ts";

describe("parseVersion", () => {
  describe("casos válidos", () => {
    const validCases = [
      { input: "1.2.3", expected: { major: 1, minor: 2, patch: 3 } },
      { input: "0.0.0", expected: { major: 0, minor: 0, patch: 0 } },
      { input: "99.99.99", expected: { major: 99, minor: 99, patch: 99 } },
      { input: "0.2.148-msv0okam", expected: { major: 0, minor: 2, patch: 148 } },
      { input: "1.0.0-alpha", expected: { major: 1, minor: 0, patch: 0 } },
      { input: "2.0.0-beta.1", expected: { major: 2, minor: 0, patch: 0 } },
      { input: "1.0.0-alpha-beta-1", expected: { major: 1, minor: 0, patch: 0 } },
    ];
    for (const { input, expected } of validCases) {
      it(`parseia "${input}" corretamente`, () => {
        assertEquals(parseVersion(input), expected);
      });
    }
  });
  describe("casos inválidos", () => {
    const invalidCases = [
      { input: "", desc: "string vazia" },
      { input: "1.2", desc: "apenas 2 partes" },
      { input: "1.2.3.4", desc: "4 partes" },
      { input: "a.b.c", desc: "letras" },
      { input: "1.abc.3", desc: "parte não numérica" },
      { input: "v1.2.3", desc: "prefixo v" },
      { input: "1.2.3-", desc: "hífen sem hash" },
      { input: " 1.2.3", desc: "espaço antes" },
      { input: "1.2.3 ", desc: "espaço depois" },
    ];
    for (const { input, desc } of invalidCases) {
      it(`lança erro para ${desc} ("${input}")`, () => {
        assertThrows(() => parseVersion(input), Error);
      });
    }
  });
});

describe("formatVersion", () => {
  it("formata com hash fornecido", () => {
    assertEquals(formatVersion(1, 2, 3, "abc"), "1.2.3-abc");
  });
  it("gera hash automático quando não fornecido", () => {
    const result = formatVersion(0, 2, 149);
    assertStringIncludes(result, "0.2.149-");
    // Hash deve ter pelo menos alguns caracteres
    const hash = result.split("-")[1];
    // 🔥 CORREÇÃO: Tratamento explícito de undefined (noUncheckedIndexedAccess)
    assertEquals(hash !== undefined && hash.length > 0, true);
  });
  it("usa o mesmo hash em chamadas com mesmo parâmetro", () => {
    const hash = "fixedhash";
    assertEquals(
      formatVersion(1, 0, 0, hash),
      formatVersion(1, 0, 0, hash)
    );
  });
  it("lida com números grandes", () => {
    assertEquals(formatVersion(999, 999, 999, "x"), "999.999.999-x");
  });
});

describe("extractVersionFromContent", () => {
  it("extrai versão de JSON simples", () => {
    assertEquals(
      extractVersionFromContent(`{ "version": "1.2.3" }`),
      "1.2.3"
    );
  });
  it("extrai versão de JSONC com comentários", () => {
    const content = `{
      // Comentário
      "name": "loco",
      "version": "2.0.0", /* inline */
    }`;
    assertEquals(extractVersionFromContent(content), "2.0.0");
  });
  it("extrai versão com hash", () => {
    assertEquals(
      extractVersionFromContent(`{ "version": "1.2.3-abc123" }`),
      "1.2.3-abc123"
    );
  });
  it("retorna null quando não há versão", () => {
    assertEquals(
      extractVersionFromContent(`{ "name": "loco" }`),
      null
    );
  });
  it("retorna null para string vazia", () => {
    assertEquals(extractVersionFromContent(""), null);
  });
  it("ignora campos 'version' dentro de strings", () => {
    const content = `{ "name": "tem version: 1.0.0 no nome" }`;
    assertEquals(extractVersionFromContent(content), null);
  });
});

describe("replaceVersionInContent", () => {
  it("substitui versão preservando o resto", () => {
    const content = `{
      "name": "@loco/app",
      "version": "1.0.0-old",
      "imports": {}
    }`;
    const result = replaceVersionInContent(content, "2.0.0-new");
    assertStringIncludes(result, `"version": "2.0.0-new"`);
    assertStringIncludes(result, `"name": "@loco/app"`);
    assertStringIncludes(result, `"imports"`);
  });
  it("substitui apenas a primeira ocorrência", () => {
    const content = `{ "version": "1.0.0", "other": "version": "2.0.0" }`;
    const result = replaceVersionInContent(content, "3.0.0");
    // A primeira deve ser substituída
    assertStringIncludes(result, `"version": "3.0.0"`);
  });
});

describe("currentVersion (integração)", () => {
  it("lê versão de arquivo existente", async () => {
    const { path, cleanup } = await withTempDenoJsonc("1.2.3-abc");
    try {
      const version = await currentVersion(path);
      assertEquals(version, "1.2.3-abc");
    } finally {
      await cleanup();
    }
  });
  it("lança erro quando arquivo não existe", async () => {
    let threw = false;
    try {
      await currentVersion("/caminho/que/nao/existe/deno.jsonc");
    } catch {
      threw = true;
    }
    assertEquals(threw, true);
  });
  it("lança erro quando versão não está no arquivo", async () => {
    const { path, cleanup } = await withTempDenoJsonc("1.0.0", { version: undefined });
    try {
      // Reescreve sem version
      await Deno.writeTextFile(path, `{ "name": "loco" }`);
      let errorMessage = "";
      try {
        await currentVersion(path);
      } catch (error) {
        errorMessage = (error as Error).message;
      }
      assertStringIncludes(errorMessage, "Versão não encontrada");
    } finally {
      await cleanup();
    }
  });
});

describe("incrementVersion (integração)", () => {
  it("incrementa patch e atualiza arquivo", async () => {
    const { path, cleanup } = await withTempDenoJsonc("1.2.3");
    try {
      const newVersion = await incrementVersion("1.2.3", path, "testhash");
      assertEquals(newVersion, "1.2.4-testhash");
      const content = await Deno.readTextFile(path);
      assertStringIncludes(content, `"version": "1.2.4-testhash"`);
    } finally {
      await cleanup();
    }
  });
  it("preserva outras propriedades do JSON", async () => {
    const { path, cleanup } = await withTempDenoJsonc("0.0.1", {
      name: "@loco/app",
      imports: { preact: "https://esm.sh/preact" },
    });
    try {
      await incrementVersion("0.0.1", path, "x");
      const content = await Deno.readTextFile(path);
      assertStringIncludes(content, `"name": "@loco/app"`);
      assertStringIncludes(content, `"preact"`);
    } finally {
      await cleanup();
    }
  });
  it("incrementa múltiplas vezes", async () => {
    const { path, cleanup } = await withTempDenoJsonc("1.0.0");
    try {
      const v1 = await incrementVersion("1.0.0", path, "h1");
      assertEquals(v1, "1.0.1-h1");
      const v2 = await incrementVersion(v1, path, "h2");
      assertEquals(v2, "1.0.2-h2");
      const v3 = await incrementVersion(v2, path, "h3");
      assertEquals(v3, "1.0.3-h3");
    } finally {
      await cleanup();
    }
  });
});
```

---

## Arquivo: `monorepo/utils/tests/esbuild/esbuild-options.test.ts`

```ts
/// <reference lib="deno.ns" />
 import { describe, it } from "@std/testing/bdd";
 import { assertEquals, assertStringIncludes } from "@std/assert";
 import { buildEsbuildOptions } from "../../src/esbuild/mod.ts";
 import type { TargetConfig } from "../../src/interfaces/mod.ts";
 // Helper para criar config mínimo válida
 function makeConfig(overrides: Partial<TargetConfig> = {}): TargetConfig {
   return {
     srcdir: "src",
     distdir: "dist",
     entryPoints: ["src/main.tsx"],
     ...overrides,
   };
 }
 describe("buildEsbuildOptions", () => {
   describe("configuração básica", () => {
     it("usa outfile quando definido", async () => {
       const config = makeConfig({ outfile: "dist/app.js" });
       const options = await buildEsbuildOptions("ui", config, "1.0.0");
       assertEquals(options.outfile, "dist/app.js");
       assertEquals(options.outdir, undefined);
     });
     it("usa distdir como outdir quando outfile não definido", async () => {
       const config = makeConfig({ distdir: "monorepo/dist" });
       const options = await buildEsbuildOptions("ui", config, "1.0.0");
       assertEquals(options.outdir, "monorepo/dist");
       assertEquals(options.outfile, undefined);
     });
     it("entryPoints é sempre preservado", async () => {
       const config = makeConfig({ entryPoints: ["a.ts", "b.ts"] });
       const options = await buildEsbuildOptions("ui", config, "1.0.0");
       assertEquals(options.entryPoints, ["a.ts", "b.ts"]);
     });
   });
   describe("propriedades opcionais", () => {
     it("inclui platform quando definido", async () => {
       const config = makeConfig({ platform: "browser" });
       const options = await buildEsbuildOptions("ui", config, "1.0.0");
       assertEquals(options.platform, "browser");
     });
     it("omite propriedades undefined", async () => {
       const config = makeConfig();
       const options = await buildEsbuildOptions("ui", config, "1.0.0");
       assertEquals(options.platform, undefined);
       assertEquals(options.minify, undefined);
     });
     it("inclui todas as propriedades configuradas", async () => {
       const config = makeConfig({
         platform: "browser",
         format: "esm",
         bundle: true,
         minify: true,
         sourcemap: "linked",
         target: "es2022",
       });
       const options = await buildEsbuildOptions("ui", config, "1.0.0");
       assertEquals(options.platform, "browser");
       assertEquals(options.format, "esm");
       assertEquals(options.bundle, true);
       assertEquals(options.minify, true);
       assertEquals(options.sourcemap, "linked");
       assertEquals(options.target, "es2022");
     });
   });
   describe("define", () => {
     it("injeta __APP_VERSION__ com v", async () => {
       const config = makeConfig();
       const options = await buildEsbuildOptions("ui", config, "1.2.3-abc");
       assertEquals(options.define.__APP_VERSION__, '"v1.2.3-abc"');
     });
     it("preserva defines customizados do config", async () => {
       const config = makeConfig({
         define: {
           "__FEATURE_X__": "true",
           "__API_URL__": '"https://api.example.com"',
         },
       });
       const options = await buildEsbuildOptions("ui", config, "1.0.0");
       assertEquals(options.define.__FEATURE_X__, "true");
       assertEquals(options.define.__API_URL__, '"https://api.example.com"');
       assertEquals(options.define.__APP_VERSION__, '"v1.0.0"');
     });
   });
   describe("banner e footer", () => {
     it("substitui __APP_VERSION__ no banner", async () => {
       const config = makeConfig({
         banner: {
           js: "/* Loco v__APP_VERSION__ */\n",
         },
       });
       const options = await buildEsbuildOptions("ui", config, "2.0.0");
       assertStringIncludes(options.banner.js, "Loco v2.0.0");
     });
     it("substitui múltiplas ocorrências de __APP_VERSION__", async () => {
       const config = makeConfig({
         banner: {
           js: "/* __APP_VERSION__ build __APP_VERSION__ */",
         },
       });
       const options = await buildEsbuildOptions("ui", config, "1.0.0");
       // Substituição global
       assertEquals(options.banner.js.includes("__APP_VERSION__"), false);
     });
     it("substitui __APP_VERSION__ no CSS também", async () => {
       const config = makeConfig({
         banner: {
           css: "/* CSS __APP_VERSION__ */",
         },
       });
       const options = await buildEsbuildOptions("ui", config, "1.0.0");
       assertStringIncludes(options.banner.css, "CSS 1.0.0");
     });
     it("substitui __APP_VERSION__ no footer", async () => {
       const config = makeConfig({
         footer: {
           js: "/* End __APP_VERSION__ */",
         },
       });
       const options = await buildEsbuildOptions("ui", config, "1.0.0");
       assertStringIncludes(options.footer.js, "End 1.0.0");
     });
     it("lida com banner sem js", async () => {
       const config = makeConfig({
         banner: { css: "/* css only __APP_VERSION__ */" },
       });
       const options = await buildEsbuildOptions("ui", config, "1.0.0");
       assertEquals(options.banner.js, undefined);
       assertStringIncludes(options.banner.css, "1.0.0");
     });
   });
   describe("lógica especial para SW", () => {
     it("injeta __GENERATED_ASSETS__ quando targetName é 'sw'", async () => {
       const config = makeConfig();
       const mockListFn = async () => ["./app.js", "./index.html"];
       const options = await buildEsbuildOptions("sw", config, "1.0.0", mockListFn);
       const assets = JSON.parse(options.define.__GENERATED_ASSETS__);
       assertEquals(assets, ["./app.js", "./index.html"]);
     });
     it("não injeta __GENERATED_ASSETS__ para outros alvos", async () => {
       const config = makeConfig();
       const mockListFn = async () => ["./app.js"];
       const options = await buildEsbuildOptions("ui", config, "1.0.0", mockListFn);
       assertEquals(options.define.__GENERATED_ASSETS__, undefined);
     });
     it("não injeta __GENERATED_ASSETS__ se listFn não fornecida", async () => {
       const config = makeConfig();
       const options = await buildEsbuildOptions("sw", config, "1.0.0");
       assertEquals(options.define.__GENERATED_ASSETS__, undefined);
     });
   });
   describe("novas opções (1-13)", () => {
     it("inclui splitting", async () => {
       const config = makeConfig({ splitting: true });
       const options = await buildEsbuildOptions("ui", config, "1.0.0");
       assertEquals(options.splitting, true);
     });
     it("inclui loader customizado", async () => {
       const config = makeConfig({
         loader: { ".png": "file", ".svg": "dataurl" },
       });
       const options = await buildEsbuildOptions("ui", config, "1.0.0");
       assertEquals(options.loader[".png"], "file");
     });
     it("inclui alias", async () => {
       const config = makeConfig({
         alias: { "@": "./src", "moment": "dayjs" },
       });
       const options = await buildEsbuildOptions("ui", config, "1.0.0");
       assertEquals(options.alias["@"], "./src");
       assertEquals(options.alias.moment, "dayjs");
     });
     it("inclui inject", async () => {
       const config = makeConfig({
         inject: ["./polyfills.ts"],
       });
       const options = await buildEsbuildOptions("ui", config, "1.0.0");
       assertEquals(options.inject, ["./polyfills.ts"]);
     });
     it("inclide target como string", async () => {
       const config = makeConfig({ target: "es2022" });
       const options = await buildEsbuildOptions("ui", config, "1.0.0");
       assertEquals(options.target, "es2022");
     });
     it("inclui target como array", async () => {
       const config = makeConfig({ target: ["es2022", "chrome90"] });
       const options = await buildEsbuildOptions("ui", config, "1.0.0");
       assertEquals(options.target, ["es2022", "chrome90"]);
     });
     it("inclui drop", async () => {
       const config = makeConfig({ drop: ["console", "debugger"] });
       const options = await buildEsbuildOptions("ui", config, "1.0.0");
       assertEquals(options.drop, ["console", "debugger"]);
     });
     it("inclui pure", async () => {
       const config = makeConfig({ pure: ["console.log"] });
       const options = await buildEsbuildOptions("ui", config, "1.0.0");
       assertEquals(options.pure, ["console.log"]);
     });
     it("inclui logLevel", async () => {
       const config = makeConfig({ logLevel: "warning" });
       const options = await buildEsbuildOptions("ui", config, "1.0.0");
       assertEquals(options.logLevel, "warning");
     });
     it("inclui entryNames/chunkNames/assetNames", async () => {
       const config = makeConfig({
         entryNames: "[name]-[hash]",
         chunkNames: "chunks/[name]",
         assetNames: "assets/[name]",
       });
       const options = await buildEsbuildOptions("ui", config, "1.0.0");
       assertEquals(options.entryNames, "[name]-[hash]");
       assertEquals(options.chunkNames, "chunks/[name]");
       assertEquals(options.assetNames, "assets/[name]");
     });
   });
   // ========================================================================
   // 🔥 PLUGINS (novo)
   // ========================================================================
   describe("plugins", () => {
     it("inclui plugins quando definidos na config", async () => {
       const mockPlugin = { name: "test-plugin", setup: () => {} };
       const config = makeConfig({ plugins: [mockPlugin] });
       const options = await buildEsbuildOptions("ui", config, "1.0.0");
       assertEquals(options.plugins, [mockPlugin]);
       assertEquals(options.plugins.length, 1);
       assertEquals(options.plugins[0].name, "test-plugin");
     });
     it("inclui múltiplos plugins na ordem definida", async () => {
       const plugin1 = { name: "plugin-1", setup: () => {} };
       const plugin2 = { name: "plugin-2", setup: () => {} };
       const config = makeConfig({ plugins: [plugin1, plugin2] });
       const options = await buildEsbuildOptions("ui", config, "1.0.0");
       assertEquals(options.plugins.length, 2);
       assertEquals(options.plugins[0].name, "plugin-1");
       assertEquals(options.plugins[1].name, "plugin-2");
     });
     it("omite plugins quando não definidos (undefined)", async () => {
       const config = makeConfig();
       const options = await buildEsbuildOptions("ui", config, "1.0.0");
       assertEquals(options.plugins, undefined);
     });
     it("omite plugins quando array vazio", async () => {
       const config = makeConfig({ plugins: [] });
       const options = await buildEsbuildOptions("ui", config, "1.0.0");
       assertEquals(options.plugins, []);
     });
     it("plugins são independentes de outras opções", async () => {
       const mockPlugin = { name: "my-plugin", setup: () => {} };
       const config = makeConfig({
         plugins: [mockPlugin],
         platform: "browser",
         bundle: true,
         minify: true,
       });
       const options = await buildEsbuildOptions("ui", config, "1.0.0");
       assertEquals(options.plugins, [mockPlugin]);
       assertEquals(options.platform, "browser");
       assertEquals(options.bundle, true);
       assertEquals(options.minify, true);
     });
   });
 });
```

---

## Arquivo: `monorepo/utils/tests/export/export.test.ts`

```ts
/**
 * @file export.test.ts
 * @description Testes unitários para a lógica de filtragem do script de exportação de contexto.
 * Garante que caminhos adicionais (como .github) e regras de pastaBase funcionem corretamente.
 */

import { assertEquals } from "@std/assert";
import { deveIncluirArquivo } from "../../src/export/mod.ts"
import { CONFIGURACOES } from "../../../../export.ts";

Deno.test("deveIncluirArquivo: Deve BLOQUEAR qualquer arquivo dentro da pasta exports/", () => {
  const config = CONFIGURACOES.server;
  // Mesmo que tenha extensão válida, a proteção anti-loop deve prevalecer
  assertEquals(deveIncluirArquivo("exports/server.md", config), false);
  assertEquals(deveIncluirArquivo("exports/.github/workflows/test.yml", config), false);
});

Deno.test("deveIncluirArquivo: Deve PERMITIR caminho adicional (.github/workflows) com extensão válida", () => {
  const config = CONFIGURACOES.server;
  assertEquals(deveIncluirArquivo(".github/workflows/deploy.yml", config), true);
  assertEquals(deveIncluirArquivo(".github/workflows/ci.yaml", config), true);
});

Deno.test("deveIncluirArquivo: Deve BLOQUEAR caminho adicional com extensão INVÁLIDA", () => {
  const config = CONFIGURACOES.server;
  // .png e .secret não estão em EXTENSOES_PADRAO
  assertEquals(deveIncluirArquivo(".github/workflows/segredo.png", config), false);
  assertEquals(deveIncluirArquivo(".github/workflows/config.secret", config), false);
});

Deno.test("deveIncluirArquivo: Deve PERMITIR arquivo dentro da pastaBase e subpasta permitida", () => {
  const config = CONFIGURACOES.server;
  assertEquals(deveIncluirArquivo("monorepo/server/src/main.ts", config), true);
  assertEquals(deveIncluirArquivo("monorepo/server/docs/arquitetura.md", config), true);
});

Deno.test("deveIncluirArquivo: Deve BLOQUEAR arquivo fora da pastaBase (que não seja caminho adicional)", () => {
  const config = CONFIGURACOES.server;
  // Arquivos da UI não devem vazar para o export do server
  assertEquals(deveIncluirArquivo("monorepo/ui/src/app.tsx", config), false);
  assertEquals(deveIncluirArquivo("monorepo/utils/src/helper.ts", config), false);
});

Deno.test("deveIncluirArquivo: Deve PERMITIR arquivos raiz explicitamente configurados", () => {
  const config = CONFIGURACOES.server;
  assertEquals(deveIncluirArquivo("monorepo/server/deno.json", config), true);
  assertEquals(deveIncluirArquivo("monorepo/server/deploy.sh", config), true);
});

Deno.test("deveIncluirArquivo: Deve BLOQUEAR arquivos raiz NÃO configurados", () => {
  const config = CONFIGURACOES.server;
  // package.json não está na lista de arquivosRaizPermitidos do server
  assertEquals(deveIncluirArquivo("monorepo/server/package.json", config), false);
});

Deno.test("deveIncluirArquivo: Configuração 'docs' deve capturar raiz e subpasta docs", () => {
  const config = CONFIGURACOES.docs;
  assertEquals(deveIncluirArquivo("readme.md", config), true);
  assertEquals(deveIncluirArquivo("docs/arquitetura.md", config), true);
  // Deve bloquear código fonte fora da pasta docs ou raiz permitida
  assertEquals(deveIncluirArquivo("src/main.ts", config), false);
});

```

---

## Arquivo: `monorepo/utils/tests/export/utils.test.ts`

```````ts
/// <reference lib="deno.ns" />

import { describe, it } from "@std/testing/bdd";
import {
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import {
  normalizarCaminho,
  calcularCraseWrapper,
  mapearExtensao,
  deveIncluirArquivo,
  formatarArquivoMarkdown,
  gerarCabecalho,
} from "../../src/export/mod.ts";
import { EXTENSOES_PADRAO } from "../../src/config/mod.ts";
import type { ExportConfig } from "../../src/interfaces/mod.ts";

// Helper para criar config customizada em testes
function makeConfig(overrides: Partial<ExportConfig> = {}): ExportConfig {
  return {
    arquivoSaida: "snapshot.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "./",
    subpastasPermitidas: [],
    arquivosRaizPermitidos: [],
    incluiVersao: false,
    instrucaoCustomizada: "Teste",
    ...overrides,
  };
}

// ============================================================================
// 🛠️ FUNÇÕES UTILITÁRIAS
// ============================================================================

describe("normalizarCaminho", () => {
  it("converte barras invertidas em barras normais", () => {
    assertEquals(normalizarCaminho("a\\b\\c"), "a/b/c");
  });

  it("converte para minúsculas", () => {
    assertEquals(normalizarCaminho("ABC/DEF"), "abc/def");
  });

  it("lida com ambos simultaneamente", () => {
    assertEquals(normalizarCaminho("A\\B\\C/DEF"), "a/b/c/def");
  });

  it("preserva caminho já normalizado", () => {
    assertEquals(normalizarCaminho("a/b/c"), "a/b/c");
  });

  it("lida com string vazia", () => {
    assertEquals(normalizarCaminho(""), "");
  });
});

describe("calcularCraseWrapper", () => {
  it("retorna ``` para texto sem crases", () => {
    assertEquals(calcularCraseWrapper("texto normal"), "```");
  });

  it("retorna ```` para texto com ```", () => {
    assertEquals(calcularCraseWrapper("código com ```"), "````");
  });

  it("retorna 6 crases para texto com `````", () => {
    assertEquals(calcularCraseWrapper("texto `````"), "``````");
  });

  it("usa no mínimo 3 crases", () => {
    assertEquals(calcularCraseWrapper("com ` uma crase"), "```");
    assertEquals(calcularCraseWrapper("com `` duas"), "```");
  });

  it("lida com múltiplas sequências (usa a maior)", () => {
    assertEquals(
      calcularCraseWrapper("com ` e ``` e ``"),
      "````"
    );
  });

  it("lida com string vazia", () => {
    assertEquals(calcularCraseWrapper(""), "```");
  });
});

describe("mapearExtensao", () => {
  it("mapeia .manifest para json", () => {
    assertEquals(mapearExtensao("manifest.manifest"), "json");
  });

  it("mapeia .jsonc para json", () => {
    assertEquals(mapearExtensao("config.jsonc"), "json");
  });

  it("mapeia .yml para yaml", () => {
    assertEquals(mapearExtensao("workflow.yml"), "yaml");
  });

  it("mapeia .sh para bash", () => {
    assertEquals(mapearExtensao("deploy.sh"), "bash");
  });

  it("mapeia .env* para properties", () => {
    assertEquals(mapearExtensao(".env"), "properties");
    assertEquals(mapearExtensao(".env.example"), "properties");
    assertEquals(mapearExtensao(".env.local"), "properties");
  });

  it("retorna a extensão como está para casos não mapeados", () => {
    assertEquals(mapearExtensao("arquivo.ts"), "ts");
    assertEquals(mapearExtensao("arquivo.tsx"), "tsx");
    assertEquals(mapearExtensao("arquivo.md"), "md");
  });

  it("é case insensitive", () => {
    assertEquals(mapearExtensao("arquivo.JSONC"), "json");
    assertEquals(mapearExtensao("arquivo.YML"), "yaml");
  });
});

// ============================================================================
// 🎯 LÓGICA DE FILTRAGEM
// ============================================================================

describe("deveIncluirArquivo", () => {
  describe("proteção anti-loop", () => {
    it("bloqueia qualquer arquivo dentro de exports/", () => {
      const config = makeConfig({
        pastaBase: "./",
        subpastasPermitidas: ["exports"],
      });
      assertEquals(deveIncluirArquivo("exports/server.md", config), false);
      assertEquals(deveIncluirArquivo("exports/sub/file.ts", config), false);
    });

    it("bloqueia mesmo com extensão válida", () => {
      const config = makeConfig({
        pastaBase: "./",
        subpastasPermitidas: ["exports"],
        extensoesPermitidas: [".md", ".ts"],
      });
      assertEquals(deveIncluirArquivo("exports/qualquer.ts", config), false);
    });
  });

  describe("caminhos adicionais", () => {
    it("permite caminho adicional com extensão válida", () => {
      const config = makeConfig({
        pastaBase: "src",
        caminhosAdicionaisPermitidos: [".github/workflows"],
        extensoesPermitidas: [".yml", ".yaml"],
      });
      assertEquals(
        deveIncluirArquivo(".github/workflows/deploy.yml", config),
        true
      );
      assertEquals(
        deveIncluirArquivo(".github/workflows/ci.yaml", config),
        true
      );
    });

    it("bloqueia caminho adicional com extensão inválida", () => {
      const config = makeConfig({
        pastaBase: "src",
        caminhosAdicionaisPermitidos: [".github/workflows"],
        extensoesPermitidas: [".yml"],
      });
      assertEquals(
        deveIncluirArquivo(".github/workflows/segredo.png", config),
        false
      );
    });

    it("permite arquivo exato no caminho adicional", () => {
      const config = makeConfig({
        pastaBase: "src",
        caminhosAdicionaisPermitidos: ["README.md"],
        extensoesPermitidas: [".md"],
      });
      assertEquals(deveIncluirArquivo("README.md", config), true);
    });
  });

  describe("pastaBase e subpastas", () => {
    it("permite arquivo dentro de pastaBase e subpasta permitida", () => {
      const config = makeConfig({
        pastaBase: "monorepo/server",
        subpastasPermitidas: ["src", "docs"],
        extensoesPermitidas: [".ts", ".md"],
      });
      assertEquals(
        deveIncluirArquivo("monorepo/server/src/main.ts", config),
        true
      );
      assertEquals(
        deveIncluirArquivo("monorepo/server/docs/arquitetura.md", config),
        true
      );
    });

    it("bloqueia arquivo fora de pastaBase", () => {
      const config = makeConfig({
        pastaBase: "monorepo/server",
        subpastasPermitidas: ["src"],
      });
      assertEquals(
        deveIncluirArquivo("monorepo/ui/src/app.tsx", config),
        false
      );
    });

    it("bloqueia arquivo em subpasta não permitida", () => {
      const config = makeConfig({
        pastaBase: "monorepo/server",
        subpastasPermitidas: ["src"],
        extensoesPermitidas: [".js"],
      });
      assertEquals(
        deveIncluirArquivo("monorepo/server/dist/bundle.js", config),
        false
      );
    });
  });

  describe("arquivos raiz", () => {
    it("permite arquivos raiz explicitamente configurados", () => {
      const config = makeConfig({
        pastaBase: "monorepo/server",
        arquivosRaizPermitidos: ["deno.json", "deploy.sh"],
        subpastasPermitidas: [],
      });
      assertEquals(deveIncluirArquivo("monorepo/server/deno.json", config), true);
      assertEquals(deveIncluirArquivo("monorepo/server/deploy.sh", config), true);
    });

    it("bloqueia arquivos raiz não configurados", () => {
      const config = makeConfig({
        pastaBase: "monorepo/server",
        arquivosRaizPermitidos: ["deno.json"],
        subpastasPermitidas: [],
      });
      assertEquals(
        deveIncluirArquivo("monorepo/server/package.json", config),
        false
      );
    });
  });

  describe("configuração tipo docs", () => {
    it("captura raiz e subpasta docs", () => {
      const config = makeConfig({
        pastaBase: "./",
        subpastasPermitidas: ["docs"],
        arquivosRaizPermitidos: ["readme.md"],
        extensoesPermitidas: [".md"],
      });
      assertEquals(deveIncluirArquivo("readme.md", config), true);
      assertEquals(deveIncluirArquivo("docs/arquitetura.md", config), true);
    });

    it("bloqueia código fonte fora de docs", () => {
      const config = makeConfig({
        pastaBase: "./",
        subpastasPermitidas: ["docs"],
        extensoesPermitidas: [".md"],
      });
      assertEquals(deveIncluirArquivo("src/main.ts", config), false);
    });
  });

  describe("edge cases", () => {
    it("subpastasPermitidas vazia permite tudo dentro de pastaBase", () => {
      const config = makeConfig({
        pastaBase: "monorepo/utils",
        subpastasPermitidas: [],
        extensoesPermitidas: [".ts"],
      });
      assertEquals(
        deveIncluirArquivo("monorepo/utils/qualquer-coisa/arquivo.ts", config),
        true
      );
    });

    it("extensoesPermitidas vazia permite qualquer extensão", () => {
      const config = makeConfig({
        pastaBase: "src",
        subpastasPermitidas: ["lib"],
        extensoesPermitidas: [],
      });
      assertEquals(deveIncluirArquivo("src/lib/arquivo.xyz", config), true);
    });

    it("lida com pastaBase './'", () => {
      const config = makeConfig({
        pastaBase: "./",
        subpastasPermitidas: ["src"],
      });
      assertEquals(deveIncluirArquivo("src/main.ts", config), true);
    });

    it("lida com pastaBase '.'", () => {
      const config = makeConfig({
        pastaBase: ".",
        subpastasPermitidas: ["src"],
      });
      assertEquals(deveIncluirArquivo("src/main.ts", config), true);
    });

    it("é case insensitive na comparação", () => {
      const config = makeConfig({
        pastaBase: "SRC",
        subpastasPermitidas: ["Lib"],
        arquivosRaizPermitidos: ["README.md"],
      });
      assertEquals(deveIncluirArquivo("src/lib/arquivo.ts", config), true);
      assertEquals(deveIncluirArquivo("src/readme.md", config), true);
    });
  });
});

// ============================================================================
// 📝 GERAÇÃO DE CONTEÚDO
// ============================================================================

describe("gerarCabecalho", () => {
  it("inclui instrução customizada", () => {
    const config = makeConfig({
      instrucaoCustomizada: "Este é um código de TESTE.",
    });
    const resultado = gerarCabecalho(config, "test", "1.0.0");
    assertStringIncludes(resultado, "código de TESTE");
  });

  it("inclui versão quando incluiVersao é true", () => {
    const config = makeConfig({ incluiVersao: true });
    const resultado = gerarCabecalho(config, "ui", "1.2.3");
    assertStringIncludes(resultado, "[v1.2.3]");
    assertStringIncludes(resultado, "Loco [v1.2.3]");
  });

  it("não inclui versão quando incluiVersao é false", () => {
    const config = makeConfig({ incluiVersao: false });
    const resultado = gerarCabecalho(config, "server", "1.2.3");
    assertEquals(resultado.includes("[v1.2.3]"), false);
  });

  it("inclui nome do modo em maiúsculas", () => {
    const config = makeConfig();
    const resultado = gerarCabecalho(config, "ui", "1.0.0");
    assertStringIncludes(resultado, "Modo: UI");
  });

  it("inclui timestamp de geração", () => {
    const config = makeConfig();
    const resultado = gerarCabecalho(config, "ui", "1.0.0");
    assertStringIncludes(resultado, "Gerado automaticamente em:");
  });
});

describe("formatarArquivoMarkdown", () => {
  it("formata arquivo com caminho e conteúdo", () => {
    const resultado = formatarArquivoMarkdown(
      "src/main.ts",
      "console.log('hello');"
    );
    assertStringIncludes(resultado, "## Arquivo: `src/main.ts`");
    assertStringIncludes(resultado, "```ts");
    assertStringIncludes(resultado, "console.log('hello');");
  });

  it("usa extensão mapeada para highlight", () => {
    const resultado = formatarArquivoMarkdown("config.jsonc", "{}");
    assertStringIncludes(resultado, "```json");
  });

  it("aumenta crases quando conteúdo tem ```", () => {
    const conteudo = "código com ```\nmais código";
    const resultado = formatarArquivoMarkdown("arquivo.md", conteudo);
    // 🔥 CORREÇÃO: A extensão é "md" não "markdown"
    assertStringIncludes(resultado, "````md");
    assertStringIncludes(resultado, "````");
  });

  it("inclui separador no final", () => {
    const resultado = formatarArquivoMarkdown("src/main.ts", "code");
    assertStringIncludes(resultado, "---");
  });
});
```````

---

## Arquivo: `monorepo/utils/tests/crypto/jwt.test.ts`

```ts
/// <reference lib="deno.ns" />
import { assert, assertEquals } from "@std/assert";
import { criarJWT, verificarJWT, generateVAPIDKeys, exportKeyToJWK } from "@loco/utils/crypto";

Deno.test("JWT Helpers - Pipeline de Criação e Verificação E2E", async () => {
  const keys = await generateVAPIDKeys();
  const publicKeyJwk = await exportKeyToJWK(keys.publicKey);
  const privateKeyJwk = await exportKeyToJWK(keys.privateKey);
  const payload = { sub: "test", data: "offline-first-loco" };
  const jwt = await criarJWT(payload, privateKeyJwk, { kid: publicKeyJwk });
  assert(typeof jwt === "string" && jwt.split('.').length === 3, "JWT deve ser estruturalmente válido");
  const verified = await verificarJWT(jwt);
  assert(verified.valid, "A integridade do JWT precisa ser atestada matematicamente.");
  assertEquals(verified.payload.data, "offline-first-loco", "O payload não pode sofrer mutação no processo de encode/decode.");
});
```

---

## Arquivo: `monorepo/utils/tests/crypto/utils.test.ts`

```ts
/// <reference lib="deno.ns" />
import { assertEquals, assert } from "@std/assert";
import { 
  minifyVapidPublic, expandVapidPublic,
  minifyRsaPublic, expandRsaPublic
} from "@loco/utils/crypto";

Deno.test("Crypto Utils - Minificação e Expansão de VAPID Public (ECDSA P-256)", () => {
  const mockJwkOriginal: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: "base64Url_String_X_Aqui_Ficticia",
    y: "base64Url_String_Y_Aqui_Ficticia",
    ext: true,
    key_ops: ["verify"]
  };
  const minified = minifyVapidPublic(mockJwkOriginal);
  assert(minified.x === mockJwkOriginal.x, "Deve conter a coordenada X");
  assert(minified.y === mockJwkOriginal.y, "Deve conter a coordenada Y");
  assert(minified.kty === undefined, "Não deve conter o kty");
  assert(minified.crv === undefined, "Não deve conter a curva");
  const expanded = expandVapidPublic(minified);
  assertEquals(expanded.kty, "EC");
  assertEquals(expanded.crv, "P-256");
  assertEquals(expanded.x, mockJwkOriginal.x);
  assertEquals(expanded.y, mockJwkOriginal.y);
  assertEquals(expanded.ext, true);
  assertEquals(expanded.key_ops, ["verify"]);
});

Deno.test("Crypto Utils - Minificação e Expansão de RSA Public", () => {
  const mockRsaOriginal: JsonWebKey = {
    kty: "RSA",
    alg: "RSA-OAEP-256",
    e: "AQAB",
    n: "modulo_matematico_gigante_aqui",
    ext: true,
    key_ops: ["encrypt"]
  };
  const minified = minifyRsaPublic(mockRsaOriginal);
  assert(minified.n === mockRsaOriginal.n, "Deve reter o módulo N");
  assert(minified.kty === undefined, "Deve omitir a tipagem kty");
  const expanded = expandRsaPublic(minified);
  assertEquals(expanded.kty, "RSA");
  assertEquals(expanded.alg, "RSA-OAEP-256");
  assertEquals(expanded.e, "AQAB");
  assertEquals(expanded.n, mockRsaOriginal.n);
});

Deno.test("Crypto Utils - Expansão de chave já expandida (Idempotência)", () => {
  const jwk: JsonWebKey = { kty: "RSA", n: "123", e: "AQAB" };
  const expanded = expandRsaPublic(jwk);
  assertEquals(expanded, jwk, "A função de expansão deve ser idempotente se a chave não estiver minificada");
});
```

---

## Arquivo: `monorepo/utils/tests/crypto/aes.test.ts`

```ts
/// <reference lib="deno.ns" />
import { assertEquals, assert, assertRejects } from "@std/assert";
import { encryptTextAES, decryptTextAES } from "@loco/utils/crypto";

Deno.test("Crypto AES - Criptografar e Descriptografar texto puro (Roundtrip)", async () => {
  const secretKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const plainText = "Mensagem altamente confidencial P2P do Loco!";
  const { cipherTextBase64, ivBase64 } = await encryptTextAES(secretKey, plainText);
  assert(cipherTextBase64.length > 0, "O texto cifrado gerado não pode ser vazio");
  assert(ivBase64.length > 0, "O Vetor de Inicialização (IV) não pode ser vazio");
  const decryptedText = await decryptTextAES(secretKey, cipherTextBase64, ivBase64);
  assertEquals(decryptedText, plainText, "O texto decifrado deve ser exatamente igual à mensagem original");
});

Deno.test("Crypto AES - Deve falhar ao descriptografar com a chave AES incorreta", async () => {
  const key1 = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const key2 = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const { cipherTextBase64, ivBase64 } = await encryptTextAES(key1, "Segredo do Handshake");
  await assertRejects(
    async () => {
      await decryptTextAES(key2, cipherTextBase64, ivBase64);
    },
    Error,
    "A decodificação falhou",
    "A função deve rejeitar (throw Error) quando uma chave AES errada tenta abrir o envelope"
  );
});

Deno.test("Crypto AES - Deve falhar caso o IV (Vetor de Inicialização) seja adulterado", async () => {
  const secretKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const { cipherTextBase64 } = await encryptTextAES(secretKey, "Dados sensíveis");
  const fakeIv = crypto.getRandomValues(new Uint8Array(12));
  const fakeIvBase64 = btoa(String.fromCharCode(...fakeIv)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  await assertRejects(
    async () => {
      await decryptTextAES(secretKey, cipherTextBase64, fakeIvBase64);
    },
    Error,
    "A decodificação falhou",
    "O AES-GCM deve garantir a integridade e rejeitar a decifragem se o IV for modificado"
  );
});
```

---

## Arquivo: `monorepo/utils/tests/proxy/push-utils.test.ts`

```ts
/// <reference lib="deno.ns" />
import { assert, assertEquals } from "@std/assert";
import { cifrarChaveVapid } from "@loco/utils/proxy";
import { generateVAPIDKeys, generateE2EEKeys, exportKeyToJWK } from "@loco/utils/crypto";

Deno.test("Push Utils - Blindagem do Servidor (cifrarChaveVapid)", async () => {
  const clientKeys = await generateVAPIDKeys();
  const clientVapidPrivateJwk = await exportKeyToJWK(clientKeys.privateKey);
  const serverKeys = await generateE2EEKeys();
  const serverPublicJwk = serverKeys.publicEncrypt;
  const envelopeBase64 = await cifrarChaveVapid(clientVapidPrivateJwk, serverPublicJwk);
  assert(typeof envelopeBase64 === "string", "O envelope gerado deve ser uma string Base64");
  assert(envelopeBase64.length > 50, "O envelope não pode ser vazio");
  const envelopeJsonStr = atob(envelopeBase64);
  const envelopeObj = JSON.parse(envelopeJsonStr);
  assert(envelopeObj.iv !== undefined, "O envelope deve conter um Vetor de Inicialização (iv)");
  assert(envelopeObj.dadosCifrados !== undefined, "O envelope deve conter os dados cifrados em AES (dadosCifrados)");
  assert(envelopeObj.chaveAesCifrada !== undefined, "O envelope deve conter a chave AES trancada pela chave RSA do servidor (chaveAesCifrada)");
  assertEquals(envelopeObj.iv.length, 24, "O IV em hexadecimal deve ter exatamente 24 caracteres");
});
```

---

## Arquivo: `monorepo/utils/tests/proxy/webpush-mock.test.ts`

```ts
/// <reference lib="deno.ns" />
/// <reference lib="webworker" />
import { assertEquals, assert, assertRejects } from "@std/assert";
import { cifrarPayloadObj } from "@loco/utils/proxy";
import { generateE2EEKeys } from "@loco/utils/crypto";

interface MockPushCall {
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  payloadText: string;
  vapid: { subject: string; publicKey: JsonWebKey; privateKey: JsonWebKey };
  timestamp: number;
}

class EnviarParaProxyMock {
  private calls: MockPushCall[] = [];
  private shouldFail = false;
  private failWith?: Error;
  private customResponse?: { ok: boolean; status: number; text: string };

  setFailMode(error?: Error) {
    this.shouldFail = true;
    this.failWith = error;
  }
  setCustomResponse(response: { ok: boolean; status: number; text: string }) {
    this.customResponse = response;
  }
  clear() {
    this.calls = [];
    this.shouldFail = false;
    this.failWith = undefined;
    this.customResponse = undefined;
  }
  getCalls(): MockPushCall[] {
    return [...this.calls];
  }
  getLastCall(): MockPushCall | null {
    return this.calls.length > 0 ? this.calls[this.calls.length - 1]! : null;
  }
  getCallCount(): number {
    return this.calls.length;
  }
  async enviar(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payloadText: string,
    vapid: { subject: string; publicKey: JsonWebKey; privateKey: JsonWebKey }
  ): Promise<void> {
    const call: MockPushCall = { subscription, payloadText, vapid, timestamp: Date.now() };
    this.calls.push(call);
    if (this.shouldFail) {
      const error = this.failWith || new Error("Mock failure");
      this.shouldFail = false;
      this.failWith = undefined;
      throw error;
    }
    if (this.customResponse) {
      if (!this.customResponse.ok) {
        throw new Error(`HTTP ${this.customResponse.status}: ${this.customResponse.text}`);
      }
      return;
    }
    return;
  }
}

export const mockPushSender = new EnviarParaProxyMock();

Deno.test("EnviarParaProxyMock - captura chamada de envio", async () => {
  mockPushSender.clear();
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/test123",
    keys: { p256dh: "BM8xKzVqP9N2vQJhLkR3mT6wY8zA1bC4dE5fG7hI9jK0lM2nO3pQ4rS5tU6vW7xY8zA", auth: "abc123def456" },
  };
  const payloadText = JSON.stringify({ title: "Teste", body: "Olá!" });
  const vapidKeys = await generateE2EEKeys();
  const vapid = { subject: "mailto:test@example.com", publicKey: vapidKeys.publicEncrypt, privateKey: vapidKeys.privateDecryptJwk };
  await mockPushSender.enviar(subscription, payloadText, vapid);
  const lastCall = mockPushSender.getLastCall();
  assert(lastCall !== null, "Deve registrar a chamada");
  assertEquals(lastCall!.subscription.endpoint, subscription.endpoint);
  assertEquals(lastCall!.payloadText, payloadText);
  assertEquals(lastCall!.vapid.subject, vapid.subject);
});

Deno.test("EnviarParaProxyMock - modo de falha", async () => {
  mockPushSender.clear();
  mockPushSender.setFailMode(new Error("Falha simulada no envio"));
  const subscription = { endpoint: "https://example.com/push", keys: { p256dh: "test", auth: "test" } };
  await assertRejects(
    async () => {
      const keys = await generateE2EEKeys();
      await mockPushSender.enviar(subscription, "payload", {
        subject: "test", publicKey: keys.publicEncrypt, privateKey: keys.privateDecryptJwk,
      });
    },
    Error,
    "Falha simulada no envio"
  );
  assertEquals(mockPushSender.getCallCount(), 1);
});

Deno.test("EnviarParaProxyMock - resposta personalizada HTTP 403", async () => {
  mockPushSender.clear();
  mockPushSender.setCustomResponse({ ok: false, status: 403, text: "Forbidden - Invalid subscription" });
  const subscription = { endpoint: "https://example.com/push", keys: { p256dh: "test", auth: "test" } };
  await assertRejects(
    async () => {
      const keys = await generateE2EEKeys();
      await mockPushSender.enviar(subscription, "payload", {
        subject: "test", publicKey: keys.publicEncrypt, privateKey: keys.privateDecryptJwk,
      });
    },
    Error,
    "HTTP 403: Forbidden - Invalid subscription"
  );
});

Deno.test("EnviarParaProxyMock - múltiplas chamadas", async () => {
  mockPushSender.clear();
  for (let i = 0; i < 5; i++) {
    const keys = await generateE2EEKeys();
    await mockPushSender.enviar(
      { endpoint: `https://example.com/push/${i}`, keys: { p256dh: `key${i}`, auth: `auth${i}` } },
      `payload-${i}`,
      { subject: `test${i}@example.com`, publicKey: keys.publicEncrypt, privateKey: keys.privateDecryptJwk }
    );
  }
  assertEquals(mockPushSender.getCallCount(), 5);
  const calls = mockPushSender.getCalls();
  for (let i = 0; i < 5; i++) {
    assertEquals(calls[i]!.subscription.endpoint, `https://example.com/push/${i}`);
    assertEquals(calls[i]!.payloadText, `payload-${i}`);
  }
});

Deno.test("cifrarPayloadObj - criptografia híbrida funcional", async () => {
  const payloadObj = { title: "Teste de Criptografia", body: "Este é um payload de teste", timestamp: Date.now() };
  const keys = await generateE2EEKeys();
  const encrypted = await cifrarPayloadObj(payloadObj, keys.publicEncrypt);
  assert(encrypted.i, "Deve ter IV (initialization vector)");
  assert(encrypted.d, "Deve ter dados criptografados");
  assert(encrypted.k, "Deve ter chave AES criptografada");
  assertEquals(typeof encrypted.i, "string");
  assertEquals(typeof encrypted.d, "string");
  assertEquals(typeof encrypted.k, "string");
  assert(encrypted.i.length > 0, "IV não pode ser vazio");
  assert(encrypted.d.length > 0, "Dados criptografados não podem ser vazios");
  assert(encrypted.k.length > 0, "Chave criptografada não pode ser vazia");
});

function assertNotEquals(actual: any, expected: any, msg?: string) {
  if (actual === expected) {
    throw new Error(msg || `Esperava valores diferentes, mas eram iguais: ${actual}`);
  }
}

Deno.test("cifrarPayloadObj - payloads diferentes geram ciphertexts diferentes", async () => {
  const keys = await generateE2EEKeys();
  const payload1 = { message: "Hello" };
  const payload2 = { message: "Hello" };
  const encrypted1 = await cifrarPayloadObj(payload1, keys.publicEncrypt);
  const encrypted2 = await cifrarPayloadObj(payload2, keys.publicEncrypt);
  assertNotEquals(encrypted1.d, encrypted2.d, "Ciphertexts devem ser diferentes devido ao IV aleatório");
});

Deno.test("Reset do mock entre testes", async () => {
  mockPushSender.clear();
  const keys1 = await generateE2EEKeys();
  await mockPushSender.enviar(
    { endpoint: "https://test1.com", keys: { p256dh: "k1", auth: "a1" } },
    "payload1",
    { subject: "test1@example.com", publicKey: keys1.publicEncrypt, privateKey: keys1.privateDecryptJwk }
  );
  assertEquals(mockPushSender.getCallCount(), 1);
  mockPushSender.clear();
  assertEquals(mockPushSender.getCallCount(), 0);
  const keys2 = await generateE2EEKeys();
  await mockPushSender.enviar(
    { endpoint: "https://test2.com", keys: { p256dh: "k2", auth: "a2" } },
    "payload2",
    { subject: "test2@example.com", publicKey: keys2.publicEncrypt, privateKey: keys2.privateDecryptJwk }
  );
  assertEquals(mockPushSender.getCallCount(), 1);
  assertEquals(mockPushSender.getLastCall()!.payloadText, "payload2");
});
```

---

## Arquivo: `monorepo/utils/tests/db/db-helpers.test.ts`

```ts
/// <reference lib="deno.ns" />
import "fake-indexeddb/auto";
import { assertEquals, assertExists } from "@std/assert";
import {
  salvarProfile,
  buscarProfile,
  removerProfile,
  salvarChat,
  listarChatPaginado,
  removerTodoHistoricoChat
} from "@loco/utils/db";
import type { ProfileConfig, Chat } from "@loco/utils/interfaces";

Deno.test("DB Helpers - Profile: Deve salvar, buscar e remover o perfil corretamente", async () => {
  const mockProfile: ProfileConfig = {
    name: "Arquiteto Loco",
    email: "arq@loco.pwa",
    vapidPublicKey: { kty: "EC", crv: "P-256", x: "123", y: "456" } as JsonWebKey,
    vapidPrivateKeyJwk: { kty: "EC", d: "789" } as JsonWebKey,
    vapidPrivateKeyEnvelope: "envelope_cifrado",
    e2ePublicKey: { kty: "RSA", n: "abc", e: "AQAB" } as JsonWebKey,
    e2ePrivateKeyJwk: { kty: "RSA", d: "def" } as JsonWebKey,
    subscription: {
      endpoint: "https://push.com/123",
      keys: { p256dh: "p256", auth: "auth" },
      proxyserver: "https://loco.proxy"
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarProfile(mockProfile);
  const profileSalvo = await buscarProfile();
  assertExists(profileSalvo, "O perfil deve existir no IndexedDB da memória");
  assertEquals(profileSalvo.name, "Arquiteto Loco", "O nome deve ser preservado");
  assertEquals(profileSalvo.email, "arq@loco.pwa", "O email deve ser preservado");
  assertEquals(profileSalvo.vapidPublicKey.kty, "EC", "A chave pública VAPID deve ser expandida corretamente");
  await removerProfile();
  const profileRemovido = await buscarProfile();
  assertEquals(profileRemovido, undefined, "O perfil deve retornar undefined após ser apagado");
});

Deno.test("DB Helpers - Chat: Deve salvar mensagens e retornar paginado corretamente", async () => {
  const contatoHash = "hash-contato-paginacao-123";
  await removerTodoHistoricoChat(contatoHash);
  const totalMensagens = 35;
  for (let i = 1; i <= totalMensagens; i++) {
    const msg: Chat = {
      id: `msg-${i.toString().padStart(2, '0')}`,
      contatoHash: contatoHash,
      conteudo: `Mensagem de teste número ${i}`,
      tipo: 'out',
      createdAt: 10000 + i,
      handshake: `hand-${i}`
    };
    await salvarChat(msg);
  }
  const pagina1 = await listarChatPaginado(contatoHash, 30, 0);
  assertEquals(pagina1.length, 30, "A primeira página deve trazer exatamente 30 mensagens");
  assertEquals(pagina1[pagina1.length - 1]!.id, "msg-35", "A última mensagem da página 1 deve ser a mais recente (msg-35)");
  assertEquals(pagina1[0]!.id, "msg-06", "A primeira mensagem da página 1 deve ser a msg-06");
  const pagina2 = await listarChatPaginado(contatoHash, 30, 30);
  assertEquals(pagina2.length, 5, "A segunda página deve trazer as 5 mensagens restantes");
  assertEquals(pagina2[pagina2.length - 1]!.id, "msg-05", "A última mensagem da página 2 deve ser a msg-05");
  assertEquals(pagina2[0]!.id, "msg-01", "A primeira mensagem da página 2 deve ser a msg-01");
  const paginaVazia = await listarChatPaginado(contatoHash, 30, 35);
  assertEquals(paginaVazia.length, 0, "Deve retornar array vazio se o offset ultrapassar o total de mensagens");
  await removerTodoHistoricoChat(contatoHash);
  const paginaPosExclusao = await listarChatPaginado(contatoHash, 30, 0);
  assertEquals(paginaPosExclusao.length, 0, "O histórico de chat deve estar zerado após o expurgo");
});
```

---

## Arquivo: `monorepo/utils/tests/db/id-utils.test.ts`

```ts
/// <reference lib="deno.ns" />
import "fake-indexeddb/auto";
import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { gerarId, gerarIdFallback, validarId } from "@loco/utils/db";

Deno.test("gerarId - Deve gerar um ID no formato string e com tamanho adequado", () => {
  const id = gerarId();
  assert(typeof id === "string", "O ID gerado deve ser uma string");
  assert(id.length > 0 && id.length <= 24, "O tamanho do ID deve estar entre 1 e 24 caracteres");
});

Deno.test("gerarId - Não deve gerar IDs duplicados em chamadas sequenciais", () => {
  const id1 = gerarId();
  const id2 = gerarId();
  assertNotEquals(id1, id2, "IDs gerados sequencialmente não podem ser idênticos");
});

Deno.test("gerarIdFallback - Deve funcionar como alternativa segura", () => {
  const idFallback = gerarIdFallback();
  assert(typeof idFallback === "string", "O ID de fallback deve ser uma string");
  assert(idFallback.length > 0, "O ID de fallback não pode ser vazio");
});

Deno.test("validarId - Deve validar corretamente limites de tamanho", () => {
  const idValido = gerarId();
  const idInvalidoLongo = "a".repeat(25);
  const idInvalidoVazio = "";
  assertEquals(validarId(idValido), true, "Deve aceitar um ID gerado pela própria função");
  assertEquals(validarId(idInvalidoLongo), false, "Não deve aceitar IDs maiores que 24 caracteres");
  assertEquals(validarId(idInvalidoVazio), false, "Não deve aceitar IDs vazios");
});
```

---

## Arquivo: `monorepo/utils/tests/db/self-contact.test.ts`

```ts
/// <reference lib="deno.ns" />
import "fake-indexeddb/auto";
import { assertEquals, assertExists, assertFalse, assert } from "@std/assert";
import type { ProfileConfig, Contato } from "@loco/utils/interfaces";
import { gerarContatoProprio, ehContatoProprio, obterHashProprio } from "@loco/utils/db";

async function serializarPublicKeyVapidMock(jwk: JsonWebKey): Promise<string> {
  if (!jwk) throw new Error("Chave VAPID ausente ao tentar serializar.");
  const raw = `${jwk.kty?.toLowerCase() || ''}|${jwk.crv?.toLowerCase() || ''}|${jwk.x?.toLowerCase() || ''}|${jwk.y?.toLowerCase() || ''}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(raw));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function assertTrue(condition: boolean, msg?: string) {
  assert(condition, msg);
}

Deno.test("SELF-CONTACT: Deve gerar contato próprio válido a partir do profile", async () => {
  const mockProfile: ProfileConfig = {
    name: "João Silva",
    email: "joao@example.com",
    vapidPublicKey: { kty: "EC", crv: "P-256", x: "abc123", y: "def456" } as JsonWebKey,
    vapidPrivateKeyJwk: {} as JsonWebKey,
    vapidPrivateKeyEnvelope: "encrypted-key-data",
    e2ePublicKey: {} as JsonWebKey,
    e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: { endpoint: "https://push.example.com/subscription", keys: { p256dh: "p256dh-key", auth: "auth-key" } },
    createdAt: Date.now() - 10000,
    updatedAt: Date.now(),
  };
  const contatoProprio = await gerarContatoProprio(mockProfile);
  assertExists(contatoProprio, "Contato próprio deve ser gerado");
  assertEquals(contatoProprio.name, "João Silva (Eu)", "Nome deve ter sufixo '(Eu)'");
  assertEquals(contatoProprio.email, mockProfile.email, "Email deve corresponder ao profile");
  assertEquals(contatoProprio.trusted, true, "Contato próprio deve ser sempre confiável");
  assertEquals(contatoProprio.me, "trusted", "Status 'me' deve ser 'trusted'");
  assertEquals(contatoProprio.vapidPublicKey, mockProfile.vapidPublicKey, "Chave VAPID deve ser a mesma do profile");
  assertEquals(contatoProprio.e2ePublicKey, mockProfile.e2ePublicKey, "Chave E2E deve ser a mesma do profile");
  const hashEsperado = await serializarPublicKeyVapidMock(mockProfile.vapidPublicKey);
  assertEquals(contatoProprio.id, hashEsperado, "ID deve ser o hash da chave pública VAPID");
});

Deno.test("SELF-CONTACT: Deve retornar null se profile for inválido", async () => {
  const contatoNull = await gerarContatoProprio(null as any);
  assertEquals(contatoNull, null, "Deve retornar null para profile nulo");
  const contatoSemChave = await gerarContatoProprio({ name: "Test", email: "test@test.com" } as any);
  assertEquals(contatoSemChave, null, "Deve retornar null se não houver chave VAPID");
});

Deno.test("SELF-CONTACT: Deve identificar corretamente se contato é o próprio usuário", async () => {
  const mockProfile: ProfileConfig = {
    name: "Maria Santos",
    email: "maria@example.com",
    vapidPublicKey: { kty: "EC", crv: "P-256", x: "xyz789", y: "uvw012" } as JsonWebKey,
    vapidPrivateKeyJwk: {} as JsonWebKey,
    vapidPrivateKeyEnvelope: "encrypted",
    e2ePublicKey: {} as JsonWebKey,
    e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: { endpoint: "https://push.example.com/sub", keys: { p256dh: "key1", auth: "key2" } },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const meuHash = await serializarPublicKeyVapidMock(mockProfile.vapidPublicKey);
  const outroHash = "hash-de-outro-contato-diferente";
  const ehEu = await ehContatoProprio(meuHash, mockProfile);
  assertTrue(ehEu, "Deve identificar como próprio usuário");
  const ehOutro = await ehContatoProprio(outroHash, mockProfile);
  assertFalse(ehOutro, "Não deve identificar como próprio usuário");
  const semProfile = await ehContatoProprio(meuHash, null);
  assertFalse(semProfile, "Deve retornar false se profile for null");
});

Deno.test("SELF-CONTACT: Deve obter hash próprio corretamente", async () => {
  const mockProfile: ProfileConfig = {
    name: "Pedro Oliveira",
    email: "pedro@example.com",
    vapidPublicKey: { kty: "EC", crv: "P-256", x: "hash-test-x", y: "hash-test-y" } as JsonWebKey,
    vapidPrivateKeyJwk: {} as JsonWebKey,
    vapidPrivateKeyEnvelope: "env",
    e2ePublicKey: {} as JsonWebKey,
    e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: { endpoint: "https://example.com", keys: { p256dh: "p", auth: "a" } },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const hashObtido = await obterHashProprio(mockProfile);
  const hashEsperado = await serializarPublicKeyVapidMock(mockProfile.vapidPublicKey);
  assertExists(hashObtido, "Hash deve ser obtido");
  assertEquals(hashObtido, hashEsperado, "Hash obtido deve corresponder ao hash da chave VAPID");
  const hashNull = await obterHashProprio(null);
  assertEquals(hashNull, null, "Deve retornar null se profile for null");
});

Deno.test("SELF-CONTACT: Contato próprio deve ter todas as propriedades necessárias", async () => {
  const mockProfile: ProfileConfig = {
    name: "Ana Costa",
    email: "ana@example.com",
    vapidPublicKey: { kty: "EC", crv: "P-256", x: "x-value", y: "y-value" } as JsonWebKey,
    vapidPrivateKeyJwk: { kty: "EC", crv: "P-256", d: "private" } as JsonWebKey,
    vapidPrivateKeyEnvelope: "encrypted-envelope",
    e2ePublicKey: { kty: "RSA", e: "AQAB", n: "public" } as JsonWebKey,
    e2ePrivateKeyJwk: { kty: "RSA", d: "private" } as JsonWebKey,
    subscription: { endpoint: "https://push.server.com/endpoint/12345", keys: { p256dh: "base64url-p256dh-key", auth: "base64url-auth-secret" } },
    createdAt: 1234567890,
    updatedAt: 1234567890,
  };
  const contato = await gerarContatoProprio(mockProfile);
  assertExists(contato);
  assertExists(contato.id, "ID deve existir");
  assertExists(contato.email, "Email deve existir");
  assertExists(contato.name, "Nome deve existir");
  assertExists(contato.vapidPublicKey, "vapidPublicKey deve existir");
  assertExists(contato.e2ePublicKey, "e2ePublicKey deve existir");
  assertExists(contato.subscription, "subscription deve existir");
  assertExists(contato.subscription.endpoint, "subscription.endpoint deve existir");
  assertExists(contato.subscription.keys.p256dh, "subscription.keys.p256dh deve existir");
  assertExists(contato.subscription.keys.auth, "subscription.keys.auth deve existir");
  assertExists(contato.vapidPrivateKeyEnvelope, "vapidPrivateKeyEnvelope deve existir");
  assertEquals(typeof contato.trusted, "boolean", "trusted deve ser boolean");
  assertExists(contato.me, "me status deve existir");
  assertExists(contato.createdAt, "createdAt deve existir");
  assertExists(contato.updatedAt, "updatedAt deve existir");
});

Deno.test("SELF-CONTACT: Múltiplas chamadas devem gerar contatos consistentes", async () => {
  const mockProfile: ProfileConfig = {
    name: "Carlos Mendes",
    email: "carlos@example.com",
    vapidPublicKey: { kty: "EC", crv: "P-256", x: "consistent-x", y: "consistent-y" } as JsonWebKey,
    vapidPrivateKeyJwk: {} as JsonWebKey,
    vapidPrivateKeyEnvelope: "env",
    e2ePublicKey: {} as JsonWebKey,
    e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: { endpoint: "https://example.com", keys: { p256dh: "p", auth: "a" } },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const contato1 = await gerarContatoProprio(mockProfile);
  const contato2 = await gerarContatoProprio(mockProfile);
  const contato3 = await gerarContatoProprio(mockProfile);
  assertExists(contato1);
  assertExists(contato2);
  assertExists(contato3);
  assertEquals(contato1.id, contato2.id, "IDs devem ser iguais");
  assertEquals(contato2.id, contato3.id, "IDs devem ser iguais");
  assertEquals(contato1.email, contato2.email, "Emails devem ser iguais");
  assertEquals(contato1.name, contato3.name, "Nomes devem ser iguais");
});

Deno.test("SELF-CONTACT: Atualização de profile deve refletir no contato próprio", async () => {
  const mockProfile: ProfileConfig = {
    name: "Beatriz Lima",
    email: "beatriz@example.com",
    vapidPublicKey: { kty: "EC", crv: "P-256", x: "update-x", y: "update-y" } as JsonWebKey,
    vapidPrivateKeyJwk: {} as JsonWebKey,
    vapidPrivateKeyEnvelope: "env",
    e2ePublicKey: {} as JsonWebKey,
    e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: { endpoint: "https://example.com", keys: { p256dh: "p", auth: "a" } },
    createdAt: 1000,
    updatedAt: 1000,
  };
  const contatoAntigo = await gerarContatoProprio(mockProfile);
  assertExists(contatoAntigo);
  assertEquals(contatoAntigo.name, "Beatriz Lima (Eu)");
  assertEquals(contatoAntigo.email, "beatriz@example.com");
  mockProfile.name = "Bia Lima";
  mockProfile.email = "bia@example.com";
  mockProfile.updatedAt = Date.now();
  const contatoNovo = await gerarContatoProprio(mockProfile);
  assertExists(contatoNovo);
  assertEquals(contatoNovo.name, "Bia Lima (Eu)", "Nome deve ser atualizado");
  assertEquals(contatoNovo.email, "bia@example.com", "Email deve ser atualizado");
  assertEquals(contatoAntigo.id, contatoNovo.id, "ID deve permanecer o mesmo");
});
```

---

## Arquivo: `monorepo/utils/tests/db/share-utils.test.ts`

```ts
/// <reference lib="deno.ns" />
import "fake-indexeddb/auto";
import { assert, assertEquals, assertRejects } from "@std/assert";
import { gerarLinkConviteWeb, processarQualquerConvite, extrairDadosCompactos, expandirDadosCompactos } from "@loco/utils/db";
import { generateVAPIDKeys, generateE2EEKeys, exportKeyToJWK, bufferToBase64Url, criarJWT } from "@loco/utils/crypto";
import type { ProfileConfig, Contato } from "@loco/utils/interfaces";
import { gzipSync } from "fflate";

const mockContatos = new Map<string, Contato>();
async function salvarContatoMock(contato: Contato): Promise<void> {
  mockContatos.set(contato.id, contato);
}
async function buscarContatoPorChaveMock(hash: string): Promise<Contato | null> {
  return mockContatos.get(hash) || null;
}
async function serializarPublicKeyVapidMock(key: JsonWebKey): Promise<string> {
  const data = `${key.x}:${key.y}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.test("Share Utils - Geração e Importação de cJWT para Profile e Contato", async () => {
  const userA: ProfileConfig = {
    name: "Usuário A", email: "usuario.a@teste.com",
    vapidPublicKey: {} as JsonWebKey, vapidPrivateKeyJwk: {} as JsonWebKey, vapidPrivateKeyEnvelope: "",
    e2ePublicKey: {} as JsonWebKey, e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint-a", keys: { p256dh: "p256dh-a", auth: "auth-a" }, proxyserver: "https://mock.loco.proxy" },
    createdAt: Date.now(), updatedAt: Date.now()
  };
  const userB: ProfileConfig = {
    name: "Usuário B", email: "usuario.b@teste.com",
    vapidPublicKey: {} as JsonWebKey, vapidPrivateKeyJwk: {} as JsonWebKey, vapidPrivateKeyEnvelope: "",
    e2ePublicKey: {} as JsonWebKey, e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint-b", keys: { p256dh: "p256dh-b", auth: "auth-b" }, proxyserver: "https://mock.loco.proxy" },
    createdAt: Date.now(), updatedAt: Date.now()
  };
  const [vapidKeysA, e2eKeysA, vapidKeysB, e2eKeysB] = await Promise.all([
    generateVAPIDKeys(), generateE2EEKeys(), generateVAPIDKeys(), generateE2EEKeys()
  ]);
  userA.vapidPublicKey = await exportKeyToJWK(vapidKeysA.publicKey);
  userA.vapidPrivateKeyJwk = await exportKeyToJWK(vapidKeysA.privateKey);
  userA.e2ePublicKey = e2eKeysA.publicEncrypt;
  userA.e2ePrivateKeyJwk = e2eKeysA.privateDecryptJwk;
  userB.vapidPublicKey = await exportKeyToJWK(vapidKeysB.publicKey);
  userB.vapidPrivateKeyJwk = await exportKeyToJWK(vapidKeysB.privateKey);
  userB.e2ePublicKey = e2eKeysB.publicEncrypt;
  userB.e2ePrivateKeyJwk = e2eKeysB.privateDecryptJwk;

  const compactDataA = await extrairDadosCompactos(userA);
  assertEquals(compactDataA.nm, "Usuário A", "Nome deve ser extraído corretamente");
  assertEquals(compactDataA.em, "usuario.a@teste.com", "Email deve ser extraído corretamente");
  assertEquals(compactDataA.vp.x, userA.vapidPublicKey.x, "Chave VAPID X deve ser extraída no bloco VP");
  assertEquals(compactDataA.vp.y, userA.vapidPublicKey.y, "Chave VAPID Y deve ser extraída no bloco VP");
  assert(compactDataA.ep.n !== undefined, "Módulo 'n' da Chave E2E deve ser extraído no bloco EP");

  const expandedData = expandirDadosCompactos(compactDataA);
  assertEquals(expandedData.name, "Usuário A", "Nome deve ser expandido corretamente");
  assertEquals(expandedData.email, "usuario.a@teste.com", "Email deve ser expandido corretamente");
  assert(expandedData.vapidPublicKey !== undefined, "Chave VAPID deve ser expandida");
  assert(expandedData.e2ePublicKey !== undefined, "Chave E2E deve ser expandida");

  const cjwtUrl = await gerarLinkConviteWeb(userA, userA.vapidPrivateKeyJwk, userA.vapidPublicKey, 'http://test.localhost');
  assert(cjwtUrl.includes("#share="), "URL deve conter parâmetro share");
  const cjwtToken = cjwtUrl.split("#share=")[1];
  assert(cjwtToken && cjwtToken.length > 0, "cJWT deve ser gerado");

  const importedContato = await processarQualquerConvite(cjwtToken);
  assertEquals(importedContato.name, "Usuário A", "Nome do contato importado deve bater");
  assertEquals(importedContato.email, "usuario.a@teste.com", "Email do contato importado deve bater");
  assert(importedContato.vapidPublicKey !== undefined, "Chave VAPID deve estar presente");
  assert(importedContato.e2ePublicKey !== undefined, "Chave E2E deve estar presente");
  assert(importedContato.subscription !== undefined, "Subscription deve estar presente");
  assertEquals(importedContato.subscription.endpoint, "https://fcm.googleapis.com/fcm/send/test-endpoint-a", "Endpoint deve bater");

  assertEquals((importedContato.vapidPublicKey as JsonWebKey).x, userA.vapidPublicKey.x, "Chave VAPID X deve ser idêntica após importação");
  assertEquals((importedContato.vapidPublicKey as JsonWebKey).y, userA.vapidPublicKey.y, "Chave VAPID Y deve ser idêntica após importação");
  assertEquals((importedContato.e2ePublicKey as JsonWebKey).n, userA.e2ePublicKey.n, "Chave E2E N deve ser idêntica após importação");

  const contatoHash = await serializarPublicKeyVapidMock(userA.vapidPublicKey);
  const novoContato: Contato = {
    id: contatoHash, name: importedContato.name!, email: importedContato.email!,
    vapidPublicKey: importedContato.vapidPublicKey!, e2ePublicKey: importedContato.e2ePublicKey!,
    subscription: importedContato.subscription!, vapidPrivateKeyEnvelope: importedContato.vapidPrivateKeyEnvelope!,
    trusted: false, me: 'saved', createdAt: Date.now(), updatedAt: Date.now()
  };
  await salvarContatoMock(novoContato);
  const contatoSalvo = await buscarContatoPorChaveMock(contatoHash);
  assert(contatoSalvo !== null, "Contato deve ser salvo no banco (mock)");
  assertEquals(contatoSalvo!.name, "Usuário A", "Nome do contato salvo deve bater");

  const contatoDireto = await processarQualquerConvite(cjwtToken);
  assertEquals(contatoDireto.name, "Usuário A", "cJWT direto deve funcionar");

  const cqrData = await extrairDadosCompactos(userA);
  const cqrJson = JSON.stringify(cqrData);
  const cqrBytes = new TextEncoder().encode(cqrJson);
  const compressed = gzipSync(cqrBytes);
  const cqrToken = bufferToBase64Url(compressed.buffer as ArrayBuffer);
  const contatoCqr = await processarQualquerConvite(cqrToken);
  assertEquals(contatoCqr.name, "Usuário A", "QR Code compacto deve funcionar");

  const extraidos = await extrairDadosCompactos(userA);
  const jwtPayload = { sub: "contact", ...extraidos, iat: Math.floor(Date.now() / 1000) };
  const jwtToken = await criarJWT(jwtPayload, userA.vapidPrivateKeyJwk, { kid: userA.vapidPublicKey });
  const contatoJwt = await processarQualquerConvite(jwtToken);
  assertEquals(contatoJwt.name, "Usuário A", "JWT não-compresso deve funcionar");

  await assertRejects(
    async () => await processarQualquerConvite("token-invalido-abc123"),
    Error,
    "O link ou código colado não é um convite válido do Loco."
  );
});

Deno.test("Share Utils - Reciprocidade na troca de contatos via cJWT", async () => {
  const userX: ProfileConfig = {
    name: "Alice", email: "alice@example.com",
    vapidPublicKey: {} as JsonWebKey, vapidPrivateKeyJwk: {} as JsonWebKey, vapidPrivateKeyEnvelope: "",
    e2ePublicKey: {} as JsonWebKey, e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: { endpoint: "https://example.com/alice", keys: { p256dh: "alice-p256dh", auth: "alice-auth" }, proxyserver: "https://mock.loco.proxy" },
    createdAt: Date.now(), updatedAt: Date.now()
  };
  const userY: ProfileConfig = {
    name: "Bob", email: "bob@example.com",
    vapidPublicKey: {} as JsonWebKey, vapidPrivateKeyJwk: {} as JsonWebKey, vapidPrivateKeyEnvelope: "",
    e2ePublicKey: {} as JsonWebKey, e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: { endpoint: "https://example.com/bob", keys: { p256dh: "bob-p256dh", auth: "bob-auth" }, proxyserver: "https://mock.loco.proxy" },
    createdAt: Date.now(), updatedAt: Date.now()
  };
  const [vapidX, e2eX, vapidY, e2eY] = await Promise.all([
    generateVAPIDKeys(), generateE2EEKeys(), generateVAPIDKeys(), generateE2EEKeys()
  ]);
  userX.vapidPublicKey = await exportKeyToJWK(vapidX.publicKey);
  userX.vapidPrivateKeyJwk = await exportKeyToJWK(vapidX.privateKey);
  userX.e2ePublicKey = e2eX.publicEncrypt;
  userX.e2ePrivateKeyJwk = e2eX.privateDecryptJwk;
  userY.vapidPublicKey = await exportKeyToJWK(vapidY.publicKey);
  userY.vapidPrivateKeyJwk = await exportKeyToJWK(vapidY.privateKey);
  userY.e2ePublicKey = e2eY.publicEncrypt;
  userY.e2ePrivateKeyJwk = e2eY.privateDecryptJwk;

  const aliceInviteUrl = await gerarLinkConviteWeb(userX, userX.vapidPrivateKeyJwk, userX.vapidPublicKey, 'http://test.localhost');
  const aliceCjwt = aliceInviteUrl.split("#share=")[1]!;
  const bobImportouAlice = await processarQualquerConvite(aliceCjwt);
  assertEquals(bobImportouAlice.name, "Alice", "Bob deve importar Alice corretamente");
  assertEquals(bobImportouAlice.email, "alice@example.com", "Email deve bater");

  const bobInviteUrl = await gerarLinkConviteWeb(userY, userY.vapidPrivateKeyJwk, userY.vapidPublicKey, 'http://test.localhost');
  const bobCjwt = bobInviteUrl.split("#share=")[1]!;
  const aliceImportouBob = await processarQualquerConvite(bobCjwt);
  assertEquals(aliceImportouBob.name, "Bob", "Alice deve importar Bob corretamente");
  assertEquals(aliceImportouBob.email, "bob@example.com", "Email deve bater");

  assert((bobImportouAlice.vapidPublicKey as JsonWebKey).x === userX.vapidPublicKey.x, "Bob deve ter a chave pública correta de Alice");
  assert((aliceImportouBob.vapidPublicKey as JsonWebKey).x === userY.vapidPublicKey.x, "Alice deve ter a chave pública correta de Bob");
});
```

---

## Arquivo: `monorepo/utils/tests/config/proxy.test.ts`

```ts
/// <reference lib="deno.ns" />
import { assertEquals } from "@std/assert";
import { getAbsoluteProxyUrl, buildProxyUrl } from "@loco/utils/config";

function mockGlobalLocation(origin: string, pathname: string) {
  (globalThis as any).location = { origin, pathname };
}

Deno.test("Config Utils - getAbsoluteProxyUrl respeita URLs absolutas informadas pelo contato", async () => {
  const urlDestinoExterna = "https://servidor-amigo.workers.dev";
  const result = await getAbsoluteProxyUrl(urlDestinoExterna);
  assertEquals(result, urlDestinoExterna, "Deve retornar a URL absoluta intacta");
});

Deno.test("Config Utils - getAbsoluteProxyUrl limpa barras duplicadas no final da URL absoluta", async () => {
  const urlSuja = "https://proxy-baguncado.com//";
  const result = await getAbsoluteProxyUrl(urlSuja);
  assertEquals(result, "https://proxy-baguncado.com", "Deve remover barras à direita (trailing slashes)");
});

Deno.test("Config Utils - getAbsoluteProxyUrl resolve rotas relativas baseado na origem atual do App", async () => {
  mockGlobalLocation("https://meu-loco-app.com", "/");
  const rotaRelativaProxy = "/api";
  const result = await getAbsoluteProxyUrl(rotaRelativaProxy);
  assertEquals(result, "https://meu-loco-app.com/api", "Deve concatenar a origem local com o caminho do proxy");
});

Deno.test("Config Utils - getAbsoluteProxyUrl entende quando o PWA é servido a partir de um subdiretório", async () => {
  mockGlobalLocation("https://usuario.github.io", "/meu-repo/index.html");
  const rotaRelativaProxy = "/push-handler";
  const result = await getAbsoluteProxyUrl(rotaRelativaProxy);
  assertEquals(result, "https://usuario.github.io/meu-repo/push-handler", "Deve respeitar o subdiretório de hospedagem");
});

Deno.test("Config Utils - buildProxyUrl monta a URI do endpoint corretamente", async () => {
  const proxyAbsoluto = "https://relay.loco.net";
  const urlPush = await buildProxyUrl("/push", proxyAbsoluto);
  const urlPing = await buildProxyUrl("ping", proxyAbsoluto);
  assertEquals(urlPush, "https://relay.loco.net/push");
  assertEquals(urlPing, "https://relay.loco.net/ping");
});
```

---

## Arquivo: `monorepo/utils/src/mod.ts`

```ts

```

---

## Arquivo: `monorepo/utils/src/config/mod.ts`

```ts
declare const __APP_VERSION__: string;

export const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

export * from "./proxy.ts"

export const MAX_TENTATIVAS = 3;

export const MAX_PAYLOAD_SIZE = 4096;

export const DB_NAMES = {
  CONFIG: "AppConfig_DB",
  CHAT: "Chat_DB", 
  CONTATOS: "BrowserB_Contatos_DB",
  HANDSHAKES: "Handshake_DB",
  // 🔥 ARQUITETURA: Banco atualizado para mapear as Pastas (Coleções de Mídia/Torrents)
  MIDIAS: "Midias_Metadata_DB" 
} as const;

export const STORE_NAMES = {
  KEYVAL: "keyval",
} as const;

export const KEY_NAMES = {
  PROFILE: "profile",
  CONTATO: "contato_",
  CHAT_INDEX: "chat_index_", 
} as const;

export const DefaultProxyPath: string = "/";

export const FallbackAbsoluteProxy: string = "https://proxy.vanaware.com";

export const PROXY_PATH_KEY = 'ProxyPath';

export const DEBUG_CHANNEL_NAME = "loco_debug_channel";

/**
 * Extensões de arquivo padrão que são comumente incluídas em snapshots.
 * Reutilizável em qualquer projeto de software.
 */
export const EXTENSOES_PADRAO = [
  ".tsx", ".jsx", ".js", ".ts", ".css", ".html", ".manifest", ".map",
  ".sh", ".py", ".json", ".jsonc", ".yaml", ".yml", ".toml", ".env.example", ".md"
];
```

---

## Arquivo: `monorepo/utils/src/config/version.ts`

```ts
// Arquivo gerado automaticamente pelo build.ts
export const APP_VERSION = "0.3.26-mszev7vv";

```

---

## Arquivo: `monorepo/utils/src/config/proxy.ts`

```ts
// src/constants/config.ts
// TODO IA: todo acesso ao indexded deve ser pela lib db() de @loco/workerdb
// TODO IA: precisa diferenciar quando a chamada for por um service worker ou web worker usar a função dbsw() e opfssw()
// TODO IA: se o acesso for pela main thread (browser) usar as funções db(), opfs() e até o ls() se for o caso
import { get as idbGet, set as idbSet, createStore } from "idb-keyval";
import { 
  DB_NAMES, 
  DefaultProxyPath,
  PROXY_PATH_KEY
} from "./mod.ts";
import { addDebugLog } from "../debug/mod.ts";
import type { FetchProxyOptions } from "../interfaces/mod.ts"

let _configStore: ReturnType<typeof createStore> | null = null;
let _cachedProxyPath: string | null = null; 

function getConfigStore() {
  if (_configStore === null && typeof indexedDB !== 'undefined') {
    _configStore = createStore(DB_NAMES.CONFIG, 'keyval');
  }
  return _configStore;
}

async function loadProxyPathFromDB(): Promise<string> {
  const configStore = getConfigStore();
  if (!configStore) return DefaultProxyPath;
  try {
    const stored = await idbGet<any>(PROXY_PATH_KEY, configStore);
    if (stored !== undefined && stored !== null) {
      _cachedProxyPath = String(stored);
      return _cachedProxyPath;
    }
    return DefaultProxyPath;
  } catch (error) {
    console.warn('[CONFIG] Erro ao carregar ProxyPath do IndexedDB:', error);
    return DefaultProxyPath;
  }
}

export async function getProxyPath(): Promise<string> {
  if (_cachedProxyPath !== null) return _cachedProxyPath;
  return await loadProxyPathFromDB();
}

export async function setProxyPath(path: string, persistToDisk = true): Promise<void> {
  if (_cachedProxyPath === path && persistToDisk) return;
  _cachedProxyPath = path;
  if (persistToDisk) {
    const configStore = getConfigStore();
    if (!configStore) return;
    try {
      await idbSet(PROXY_PATH_KEY, path, configStore);
      console.log('[CONFIG] ProxyPath atualizado no IndexedDB:', path);
    } catch (error) {
      console.error('[CONFIG] Erro ao salvar ProxyPath no IndexedDB:', error);
      throw error;
    }
  }
}

function getAppBasePath(): string {
  if (typeof globalThis === 'undefined' || !globalThis.location) return '/';
  let basePath = globalThis.location.pathname;
  if (basePath.split('/').pop()?.includes('.')) {
    basePath = basePath.substring(0, basePath.lastIndexOf('/') + 1);
  } else if (!basePath.endsWith('/')) {
    basePath += '/';
  }
  return basePath;
}

// 🔥 ARQUITETURA: Resolve e devolve a BASE URl Absoluta do Proxy
export async function getAbsoluteProxyUrl(specificProxy?: string): Promise<string> {
  let proxyPath = specificProxy !== undefined ? specificProxy : await getProxyPath();
  if (!proxyPath || proxyPath.trim() === '') proxyPath = "/";
  if (proxyPath.startsWith('http://') || proxyPath.startsWith('https://')) {
    // 🔥 CORREÇÃO: Uso de /+ para remover múltiplas barras finais
    return proxyPath.replace(/\/+$/, '');
  } 
  const origin = typeof globalThis !== 'undefined' && globalThis.location 
    ? globalThis.location.origin 
    : 'http://localhost';
  const appBase = getAppBasePath();
  const cleanProxyPath = proxyPath.replace(/^(\.\/|\.\.\/|\/+)/, '');
  let base = origin + appBase + cleanProxyPath;
  // 🔥 CORREÇÃO: Uso de /+ para remover múltiplas barras finais
  return base.replace(/\/+$/, '');
}

export async function buildProxyUrl(endpoint: string, specificProxy?: string): Promise<string> {
  const base = await getAbsoluteProxyUrl(specificProxy);
  const cleanEndpoint = endpoint.replace(/^\/+/, '');
  return cleanEndpoint ? `${base}/${cleanEndpoint}` : `${base}/`;
}

export async function fetchLocoProxy(endpoint: string, options: FetchProxyOptions = {}): Promise<Response> {
  const { specificProxy, body, headers: _ignorado, ...restOptions } = options;
  const url = await buildProxyUrl(endpoint, specificProxy);
  const blindHeaders = new Headers();
  if (body) {
    blindHeaders.set('Content-Type', 'text/plain');
  }
  const finalOptions: RequestInit = {
    method: 'POST', 
    mode: 'cors',
    credentials: 'omit',
    headers: blindHeaders,
    ...restOptions
  };
  if (body) {
    finalOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    const payloadSizeBytes = new Blob([finalOptions.body]).size;
    addDebugLog("info", "NETWORK:FETCH", `Tamanho total da requisição HTTP gerada para ${endpoint}: ${payloadSizeBytes} bytes.`);
    if (payloadSizeBytes > 8192) {
      throw new Error(`Pacote muito grande (${payloadSizeBytes} bytes). Limite é 8KB.`);
    }
  }
  try {
    return await fetch(url, finalOptions);
  } catch (error: any) {
    throw new Error(`Falha de rede ao acessar proxy externo (${url}). Detalhes: ${error.message}`);
  }
}

// 🔥 CORREÇÃO DE TIPAGEM ESTRITA: Interface para o contrato de resposta do /ping
interface ProxyPingResponse {
  service?: string;
  success?: boolean;
}

export async function pingProxy(proxyUrlToCheck: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    let res = await fetchLocoProxy('/ping', { 
      specificProxy: proxyUrlToCheck,
      signal: controller.signal 
    }).catch(() => null);
    clearTimeout(timeoutId);
    if (!res || !res.ok) return false;
    
    // 🔥 CORREÇÃO: Tipagem explícita do retorno de res.json() para evitar 'unknown'
    const data = await res.json() as ProxyPingResponse | null;
    
    return data?.service === "loco-proxy";
  } catch (err) {
    return false;
  }
}
```

---

## Arquivo: `monorepo/utils/src/interfaces/mod.ts`

````ts
export type * from "./db.ts";

 export interface EnvelopeCifrado {
   i: string;
   d: string;
   k: string;
 }
 
 export interface FetchProxyOptions extends Omit<RequestInit, 'body' | 'headers'> {
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   body?: any;
   specificProxy?: string;
   headers?: any;
 }
 
 // TODO IA: no novo worker-db, função ls(), "id" deverá ser "_id" para debug
 export interface DebugLogPayload {
   id: string;
   timestamp: string;
   type: "info" | "warn" | "error" | "success";
   module: string;
   message: string;
   details?: unknown;
 }
 
 // ============================================================================
 // 📦 TIPOS ESBUILD
 // ============================================================================
 // 🔥 ESTRATÉGIA DE TIPAGEM: Usamos string literals explícitos em vez de
 // `esbuild.LegalComments`, `esbuild.Platform`, etc. porque o esm.sh não
 // re-exporta esses tipos internos do esbuild como membros do namespace.
 // String literals mantêm autocomplete + type-safety e são independentes
 // de como o esm.sh expõe a tipagem.
 export interface ParsedVersion {
   major: number;
   minor: number;
   patch: number;
 }
 
 export interface ParsedArgs {
   /** Alvos de build a processar (exclui alvos watch) */
   targets: string[];
   /** Flag global para não incrementar versão */
   globalNoVersion: boolean;
   /** Nome do alvo watch a executar, ou null se não estiver em modo watch */
   watchTarget: string | null;
 }
 
 /** Modo de operação do alvo */
 export type TargetMode = 'build' | 'watch';
 
 /** Plataformas suportadas pelo esbuild */
 export type EsbuildPlatform = "browser" | "node" | "neutral";
 
 /** Formatos de saída suportados pelo esbuild */
 export type EsbuildFormat = "esm" | "iife" | "cjs";
 
 /** Estratégias de source map */
 export type EsbuildSourcemap = boolean | "linked" | "inline" | "external";
 
 /** Modos JSX */
 export type EsbuildJsx = "automatic" | "transform" | "preserve";
 
 /** O que fazer com comentários legais */
 export type EsbuildLegalComments = "none" | "inline" | "eof" | "linked" | "external";
 
 /** O que remover do bundle (console, debugger) */
 export type EsbuildDrop = "console" | "debugger";
 
 /** Charset de saída */
 export type EsbuildCharset = "ascii" | "utf8";
 
 /** Níveis de log do esbuild */
 export type EsbuildLogLevel = "verbose" | "debug" | "info" | "warning" | "error" | "silent";
 
 /** Loaders disponíveis para diferentes tipos de arquivo */
 export type EsbuildLoader =
   | "js" | "jsx" | "ts" | "tsx" | "css" | "json" | "text"
   | "base64" | "dataurl" | "file" | "binary" | "empty" | "copy";
 
 export interface TargetConfig {
   // --- Configurações de Pipeline (Pré/Post Build) ---
   publicdir?: string;
   srcdir: string;
   distdir: string;
   indexHtml?: boolean;
   clean?: string[];
   /**
    * Determina se o alvo é incluído automaticamente quando nenhum alvo
    * é especificado via CLI.
    *
    * - `true` ou `undefined`: Incluído por padrão (comportamento padrão)
    * - `false`: Só roda quando explicitamente solicitado via CLI
    *
    * ⚠️ Esta propriedade é IGNORADA para alvos com `mode: 'watch'`.
    * Alvos watch nunca são incluídos na lista de targets padrão.
    */
   default?: boolean;
   /**
    * Modo de operação do alvo.
    *
    * - `'build'`: Alvo normal de build (padrão). Compila e termina.
    * - `'watch'`: Modo de desenvolvimento contínuo. Monitora mudanças
    *   e rebuilda automaticamente. O processo fica vivo até Ctrl+C.
    *
    * ⚠️ Se múltiplos alvos tiverem `mode: 'watch'`, apenas o PRIMEIRO
    * (na ordem do CONFIG) é executado quando a flag `watch` é usada.
    */
   mode?: TargetMode;
   // --- Configurações do Esbuild (TODAS configuráveis) ---
   entryPoints: string[];
   platform?: EsbuildPlatform;
   format?: EsbuildFormat;
   bundle?: boolean;
   minify?: boolean;
   sourcemap?: EsbuildSourcemap;
   jsx?: EsbuildJsx;
   jsxImportSource?: string;
   conditions?: string[];
   define?: Record<string, string>;
   drop?: EsbuildDrop[];
   external?: string[];
   metafile?: boolean;
   write?: boolean;
   treeShaking?: boolean;
   legalComments?: EsbuildLegalComments;
   keepNames?: boolean;
   outfile?: string;
   splitting?: boolean;
   loader?: Record<string, EsbuildLoader>;
   alias?: Record<string, string>;
   inject?: string[];
   banner?: { js?: string; css?: string };
   footer?: { js?: string; css?: string };
   target?: string | string[];
   charset?: EsbuildCharset;
   logLevel?: EsbuildLogLevel;
   logLimit?: number;
   logOverride?: Record<string, EsbuildLogLevel>;
   entryNames?: string;
   chunkNames?: string;
   assetNames?: string;
   publicPath?: string;
   pure?: string[];
   /**
    * Plugins do esbuild.
    * Permite injetar plugins customizados (ex: @deno/esbuild-plugin).
    * Os plugins definidos aqui são mesclados com quaisquer plugins
    * injetados externamente pelo orquestrador de build.
    */
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   plugins?: any[];
 }
 
 export interface GlobalTargetConfig {
   [targetName: string]: TargetConfig;
 }
 
 // ============================================================================
 // 📦 TIPOS E INTERFACES EXPORT
 // ============================================================================
 /**
  * Configuração de um modo de exportação.
  * Genérica o suficiente para ser usada em qualquer projeto.
  */
 export interface ExportConfig {
   /** Caminho do arquivo de saída (relativo à raiz do projeto) */
   arquivoSaida: string;
   /** Extensões de arquivo que devem ser incluídas */
   extensoesPermitidas: string[];
   /** Pasta base onde a varredura começa */
   pastaBase: string;
   /** Subpastas dentro de pastaBase que devem ser varridas */
   subpastasPermitidas: string[];
   /** Caminhos adicionais fora de pastaBase que devem ser incluídos */
   caminhosAdicionaisPermitidos?: string[];
   /** Arquivos específicos na raiz de pastaBase que devem ser incluídos */
   arquivosRaizPermitidos: string[];
   /** Se deve incluir a versão do app no cabeçalho */
   incluiVersao: boolean;
   /** Texto de instrução para a IA no cabeçalho */
   instrucaoCustomizada: string;
   /**
    * Determina se o modo é incluído automaticamente quando nenhum modo
    * é especificado via CLI.
    *
    * - `true` ou `undefined`: Incluído por padrão (comportamento padrão)
    * - `false`: Só roda quando explicitamente solicitado via CLI
    *
    * @example
    * ```typescript
    * ui: { default: true, ... }       // Roda por padrão
    * tests: { default: false, ... }   // Só roda com: deno task export tests
    * ```
    */
   default?: boolean;
 }

 // ============================================================================
// 📦 TIPOS DENO.BUNDLE (API nativa do Deno 2.x --unstable-bundle)
// ============================================================================

/** Plataformas suportadas pelo Deno.bundle */
export type DenoBundlePlatform = "browser" | "deno";

/** Formatos de saída suportados pelo Deno.bundle */
export type DenoBundleFormat = "esm" | "cjs" | "iife";

/** Estratégias de source map do Deno.bundle */
export type DenoBundleSourceMap = "linked" | "inline" | "external";

/** Como tratar pacotes/dependências externas */
export type DenoBundlePackageHandling = "bundle" | "external";

/**
 * Configuração de um alvo de build usando a API nativa Deno.bundle.
 *
 * Interface declarativa e explícita: cada propriedade é listada
 * diretamente, sem uso de Omit ou herança de outras interfaces.
 *
 * Seções:
 * 1. Pipeline Loco: Pré/pós processamento (cleanup, cópia de estáticos)
 * 2. Deno.bundle Options: Propriedades passadas para Deno.bundle()
 * 3. Extensões Loco: Define customizado e opções extras
 */
export interface DenoBundleTargetConfig {
  // ==========================================================================
  // 🔄 PIPELINE LOCO (Pré/Pós Build)
  // ==========================================================================

  /** Diretório fonte (onde estão os arquivos de entrada) */
  srcdir: string;

  /** Diretório de destino (onde o bundle será escrito) */
  distdir: string;

  /** Diretório de arquivos estáticos públicos (copiados para distdir) */
  publicdir?: string;

  /** Se deve copiar index.html do srcdir para distdir */
  indexHtml?: boolean;

  /**
   * Lista de paths para limpar antes do build (relativos ao distdir).
   * Use ["."] para esvaziar completamente o diretório.
   */
  clean?: string[];

  /**
   * Incluído automaticamente quando nenhum alvo é especificado via CLI.
   * - `true` ou `undefined`: Incluído por padrão
   * - `false`: Só roda quando explicitamente solicitado
   */
  default?: boolean;

  /**
   * Modo de operação do alvo.
   * - `'build'`: Compila e termina (padrão)
   * - `'watch'`: ⚠️ NÃO SUPORTADO pelo Deno.bundle — emite aviso e ignora
   */
  mode?: "build" | "watch";

  // ==========================================================================
  // ⚙️ DENO.BUNDLE OPTIONS (API nativa)
  // Ref: https://docs.deno.com/api/deno/bundler/#Deno.bundle.Options
  // ==========================================================================

  /** Pontos de entrada do bundle (arquivos TypeScript/JavaScript) */
  entryPoints: string[];

  /**
   * Formato de saída do bundle.
   * - `"esm"`: ES Modules (padrão)
   * - `"cjs"`: CommonJS
   * - `"iife"`: Immediately Invoked Function Expression
   */
  format?: DenoBundleFormat;

  /**
   * Plataforma alvo.
   * - `"browser"`: Otimizado para navegadores (padrão para UI/SW)
   * - `"deno"`: Otimizado para runtime Deno
   */
  platform?: DenoBundlePlatform;

  /** Se deve minificar o output */
  minify?: boolean;

  /** Preserva nomes originais de funções e classes */
  keepNames?: boolean;

  /**
   * Estratégia de source map.
   * - `"linked"`: Arquivo .map separado com link no bundle
   * - `"inline"`: Source map embutido no bundle (base64)
   * - `"external"`: Arquivo .map separado sem link
   */
  sourcemap?: DenoBundleSourceMap;

  /** Habilita code splitting (divide o bundle em chunks) */
  codeSplitting?: boolean;

  /** Se deve inlinar imports externos no bundle */
  inlineImports?: boolean;

  /**
   * Como tratar pacotes/dependências externas.
   * - `"bundle"`: Pacotes são incluídos no bundle (padrão)
   * - `"external"`: Pacotes são excluídos
   */
  packages?: DenoBundlePackageHandling;

  /** Módulos externos a excluir do bundle */
  external?: string[];

  // ==========================================================================
  // 🔧 EXTENSÕES LOCO (pré-processamento customizado)
  // ==========================================================================

  /**
   * Define customizado para substituição de variáveis em tempo de build.
   * Aplicado em memória nos OutputFiles ANTES de salvar no disco.
   *
   * __APP_VERSION__ é injetado automaticamente — não precisa declarar.
   *
   * @example
   * ```typescript
   * define: {
   *   "__DEBUG__": "false",
   *   "__API_URL__": '"https://api.loco.app"'
   * }
   * ```
   */
  define?: Record<string, string>;

  /**
   * Caminho explícito do arquivo de saída (quando há 1 entry point).
   * Se não especificado, usa outputDir do Deno.bundle.
   */
  outfile?: string;
}

/**
 * Configuração global de múltiplos alvos de build para Deno.bundle.
 */
export interface DenoBundleGlobalConfig {
  [targetName: string]: DenoBundleTargetConfig;
}
````

---

## Arquivo: `monorepo/utils/src/interfaces/db.ts`

```ts
// TODO IA: no novo worker-db, "_id" fixo em "profile" para ProfileConfig
 export interface ProfileConfig {
   name: string;
   email: string;
   vapidPublicKey: JsonWebKey;
   vapidPrivateKeyJwk: JsonWebKey;
   vapidPrivateKeyEnvelope: string;
   e2ePublicKey: JsonWebKey;
   e2ePrivateKeyJwk: JsonWebKey;
   subscription: {
     endpoint: string;
     keys: {
       p256dh: string;
       auth: string;
     };
     proxyserver?: string;
   };
   createdAt: number;
   updatedAt: number;
 }
 
 // TODO IA: no novo worker-db, "id" deverá ser "_id" para chat
 export interface Chat {
   id: string;
   contatoHash: string;
   conteudo: string;
   tipo: 'in' | 'out';
   readAt?: number;
   notifiedAt?: number;
   receivedAt?: number;
   sentAt?: number;
   createdAt: number;
   updatedAt?: number;
   errorAt?: number;
   handshake: string;
   // 🔥 ARQUITETURA: Ponteiro opcional para a Pasta/Coleção no OPFS
   metadataId?: string;
 }
 
 export type MeStatus = 'trusted' | 'none' | 'wrong' | 'saved' | 'deleted';
 
 // TODO IA: no novo worker-db, "id" deverá ser "_id" para contato
 export interface Contato {
   id: string;
   email: string;
   name: string;
   vapidPublicKey: JsonWebKey;
   e2ePublicKey: JsonWebKey;
   subscription: {
     endpoint: string;
     keys: { p256dh: string; auth: string };
     proxyserver?: string;
   };
   vapidPrivateKeyEnvelope: string;
   trusted: boolean;
   me: MeStatus;
   createdAt: number;
   updatedAt: number;
 }
 
 // TODO IA: no novo worker-db, função opfs(), usar interface OpfsFileInfo que já tem em db.ts
 // 🔥 ARQUITETURA: Nova Estrutura Baseada em Pastas/Manifestos P2P
 export interface FileMetadata {
   name: string;
   size: number;
   type: string;
   createdAt: number;
   modifiedAt: number;
 }
 
 // TODO IA: no novo worker-db, função opfs(), "id" deverá ser "_id" para pasta meta data
 export interface PastaMetadata {
   id: string;
   name: string;
   magnetURI?: string;
   infoHash?: string;
   status: 'seeding' | 'downloading' | 'standby';
   complete: number;
   permission: 'public' | 'listed' | 'trusted';
   contatos: string[];
   files: FileMetadata[];
   createdAt: number;
   modifiedAt: number;
 }
 
 export interface ProfileRouteData {
   campos?: string[];
   data?: Record<string, unknown>;
   id?: string;
 }
 
 export interface MensagemRouteData {
   recebida?: string;
   enviada?: string;
   conteudo?: string;
   excluida?: string;
   limparHistorico?: boolean;
   campos?: string[];
   data?: Record<string, unknown>;
 }
 
 export interface ContatoRouteData {
   id?: string;
   removerContato?: boolean;
   campos?: string[];
   data?: Record<string, unknown>;
   sync?: Record<string, unknown>;
 }
 
 export interface HandshakeRotas {
   profile?: ProfileRouteData;
   mensagem?: MensagemRouteData;
   contato?: ContatoRouteData;
   [key: string]: unknown;
 }
 
 export type StatusIn = 'recebido' | 'processando' | 'processado' | 'falha';
 export type StatusOut = 'pendente' | 'enviando' | 'enviado' | 'falha' | 'entregue';
 
 export interface FluxoIn {
   status: StatusIn;
   rotas: HandshakeRotas;
   tentativas: number;
   erro?: string;
 }
 
 export interface FluxoOut {
   status: StatusOut;
   rotas: HandshakeRotas;
   tentativas: number;
   erro?: string;
 }
 
 // TODO IA: no novo worker-db, "id" deverá ser "_id" para handshake
 export interface Handshake {
   id: string;
   aud: string;
   in?: FluxoIn;
   out?: FluxoOut;
   createdAt: number;
   updatedAt: number;
 }
 
```

---

## Arquivo: `monorepo/utils/src/crypto/mod.ts`

```ts
// src/utils/crypto-utils.ts
import { addDebugLog } from "../debug/mod.ts";

export * from "./jwt.ts"

export function bufferToBase64Url(buffer: ArrayBuffer): string {
  try {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  } catch (err: any) {
    addDebugLog("error", "CRYPTO", "Falha crítica ao converter Buffer para Base64Url", err.message);
    throw new Error(`Buffer conversion failed: ${err.message}`);
  }
}

export function rawBufferToBase64Url(buffer: ArrayBuffer): string {
  return bufferToBase64Url(buffer);
}

export function base64UrlToBuffer(base64url: string): ArrayBuffer {
  try {
    let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    const padLength = (4 - (base64.length % 4)) % 4;
    base64 += '='.repeat(padLength);
    
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer as ArrayBuffer;
  } catch (err: any) {
    addDebugLog("error", "CRYPTO", "Tentativa de decodificar Base64Url malformado ou corrompido", err.message);
    throw new Error("Formato Base64Url inválido.");
  }
}

// ============================================================
// 🔥 COMPRESSÃO POR ESQUEMA ESTÁTICO (Static Schema Compression)
// ============================================================

export function minifyVapidPublic(jwk: JsonWebKey): any {
  if (!jwk || !jwk.kty) return jwk; 
  return { x: jwk.x, y: jwk.y };
}

export function expandVapidPublic(minified: any): JsonWebKey {
  if (typeof minified === "string") {
    try { minified = JSON.parse(minified); } catch { return {} as JsonWebKey; }
  }
  if (!minified || typeof minified !== "object") return {} as JsonWebKey;
  
  if (minified.kty) return minified as JsonWebKey;
  
  return { 
    kty: "EC", 
    crv: "P-256", 
    x: minified.x || minified.vx, 
    y: minified.y || minified.vy, 
    ext: true, 
    key_ops: ["verify"] 
  };
}

export function minifyVapidPrivate(jwk: JsonWebKey): any {
  if (!jwk || !jwk.kty) return jwk;
  return { d: jwk.d }; 
}

export function expandVapidPrivate(minifiedPriv: any, minifiedPub: any): JsonWebKey {
  if (typeof minifiedPriv === "string") {
    try { minifiedPriv = JSON.parse(minifiedPriv); } catch { return {} as JsonWebKey; }
  }
  if (!minifiedPriv || typeof minifiedPriv !== "object") return {} as JsonWebKey;
  if (minifiedPriv.kty) return minifiedPriv as JsonWebKey;
  
  return { 
    kty: "EC", 
    crv: "P-256", 
    x: minifiedPub.x || minifiedPub.vx, 
    y: minifiedPub.y || minifiedPub.vy, 
    d: minifiedPriv.d, 
    ext: true, 
    key_ops: ["sign"] 
  };
}

export function minifyRsaPublic(jwk: JsonWebKey): any {
  if (!jwk || !jwk.kty) return jwk;
  return { n: jwk.n };
}

export function expandRsaPublic(minified: any): JsonWebKey {
  if (typeof minified === "string") {
    try { minified = JSON.parse(minified); } catch { return {} as JsonWebKey; }
  }
  if (!minified || typeof minified !== "object") return {} as JsonWebKey;
  if (minified.kty) return minified as JsonWebKey;
  
  return { 
    kty: "RSA", 
    alg: "RSA-OAEP-256", 
    e: "AQAB", 
    n: minified.n || minified.en, 
    ext: true, 
    key_ops: ["encrypt"] 
  };
}

export function minifyRsaPrivate(jwk: JsonWebKey): any {
  if (!jwk || !jwk.kty) return jwk;
  return { d: jwk.d, p: jwk.p, q: jwk.q, dp: jwk.dp, dq: jwk.dq, qi: jwk.qi };
}

export function expandRsaPrivate(minifiedPriv: any, minifiedPub: any): JsonWebKey {
  if (typeof minifiedPriv === "string") {
    try { minifiedPriv = JSON.parse(minifiedPriv); } catch { return {} as JsonWebKey; }
  }
  if (!minifiedPriv || typeof minifiedPriv !== "object") return {} as JsonWebKey;
  if (minifiedPriv.kty) return minifiedPriv as JsonWebKey;
  
  return { 
    kty: "RSA", 
    alg: "RSA-OAEP-256", 
    e: "AQAB", 
    n: minifiedPub.n || minifiedPub.en, 
    d: minifiedPriv.d, 
    p: minifiedPriv.p, 
    q: minifiedPriv.q, 
    dp: minifiedPriv.dp, 
    dq: minifiedPriv.dq, 
    qi: minifiedPriv.qi, 
    ext: true, 
    key_ops: ["decrypt"] 
  };
}

// ============================================================
// GERAÇÃO E OPERAÇÕES DA WEBCRYPTO API
// ============================================================

export async function generateVAPIDKeys(): Promise<CryptoKeyPair> {
  try {
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
    addDebugLog("info", "CRYPTO", "Par de chaves VAPID (ECDSA P-256) gerado com sucesso");
    return keyPair;
  } catch (error: any) {
    addDebugLog("error", "CRYPTO", `Falha de Hardware/Browser ao gerar VAPID: ${error.message}`, error);
    throw new Error("Este navegador não suporta geração de chaves ECDSA P-256 necessárias para o funcionamento offline.");
  }
}

// 🔥 NOVA FUNÇÃO: Geração genérica de RSA para o Servidor e Testes
export async function generateRSAKeys(): Promise<CryptoKeyPair> {
  try {
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
    addDebugLog("info", "CRYPTO", "Par de chaves RSA gerado com sucesso");
    return keyPair;
  } catch (error: any) {
    addDebugLog("error", "CRYPTO", `Falha ao gerar chaves RSA: ${error.message}`, error);
    throw new Error("Este dispositivo/ambiente não suporta geração de chaves RSA-OAEP de 2048 bits.");
  }
}

export async function generateE2EEKeys(): Promise<{
  publicEncrypt: JsonWebKey;
  privateDecryptJwk: JsonWebKey;
}> {
  try {
    const keyPair = await generateRSAKeys(); // Reutiliza a nova função

    const publicEncrypt = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const privateDecryptJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

    return { publicEncrypt, privateDecryptJwk };
  } catch (error: any) {
    addDebugLog("error", "CRYPTO", `Falha ao exportar chaves E2E: ${error.message}`, error);
    throw new Error("Falha ao preparar as chaves E2E.");
  }
}

export async function encryptTextAES(
  key: CryptoKey,
  plainText: string
): Promise<{ cipherTextBase64: string; ivBase64: string }> {
  try {
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedText = enc.encode(plainText);

    const cipherBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encodedText
    );

    addDebugLog("info", "CRYPTO", "Texto criptografado via AES-GCM com sucesso");

    return {
      cipherTextBase64: bufferToBase64Url(cipherBuffer),
      ivBase64: bufferToBase64Url(iv.buffer as ArrayBuffer),
    };
  } catch (error: any) {
    addDebugLog("error", "CRYPTO", `Falha interna no motor AES-GCM (Encrypt): ${error.message}`, error);
    throw new Error("Não foi possível criptografar os dados.");
  }
}

export async function decryptTextAES(
  key: CryptoKey,
  cipherTextBase64: string,
  ivBase64: string
): Promise<string> {
  try {
    const cipherBuffer = base64UrlToBuffer(cipherTextBase64);
    const ivBuffer = base64UrlToBuffer(ivBase64);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(ivBuffer) },
      key,
      cipherBuffer
    );

    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer);
  } catch (error: any) {
    addDebugLog("error", "CRYPTO", `Falha de decifragem AES-GCM (Chave incorreta ou corrompido): ${error.message}`, error);
    throw new Error("A decodificação falhou. Dados corrompidos ou chave inválida.");
  }
}

export async function exportKeyToJWK(key: CryptoKey): Promise<JsonWebKey> {
  try {
    const jwk = await crypto.subtle.exportKey("jwk", key);
    return jwk;
  } catch (error: any) {
    addDebugLog("error", "CRYPTO", `Erro ao extrair chave (não extraível?): ${error.message}`, error);
    throw new Error("Falha ao exportar a chave para formato seguro.");
  }
}

export async function importJWKToKey(
  jwk: JsonWebKey,
  algorithm: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams = { name: "RSA-OAEP", hash: "SHA-256" },
  extractable: boolean = true,
  keyUsages: KeyUsage[] = ["decrypt"]
): Promise<CryptoKey> {
  try {
    const key = await crypto.subtle.importKey(
      "jwk" as any,
      jwk,
      algorithm,
      extractable,
      keyUsages
    );
    return key;
  } catch (error: any) {
    addDebugLog("error", "CRYPTO", `Erro estrutural ao importar chave JWK: ${error.message}`, error);
    throw new Error("A chave de criptografia fornecida está corrompida ou é incompatível.");
  }
}
```

---

## Arquivo: `monorepo/utils/src/crypto/jwt.ts`

```ts
// src/utils/jwt-helpers.ts
import { 
  minifyVapidPublic, 
  expandVapidPublic,
  bufferToBase64Url,
  base64UrlToBuffer
} from "./mod.ts";


export async function criarJWT(
  payload: Record<string, any>,
  privateKeyJwk: JsonWebKey,
  headerExtra: Record<string, any> = {}
): Promise<string> {
  try {
    if (headerExtra.kid && (headerExtra.kid.kty || headerExtra.kid.x)) {
      headerExtra.kid = minifyVapidPublic(headerExtra.kid);
    }

    const header = { alg: "ES256", ...headerExtra };
    const encoder = new TextEncoder();

    const headerEnc = encoder.encode(JSON.stringify(header));
    const payloadEnc = encoder.encode(JSON.stringify(payload));

    const headerB64 = bufferToBase64Url(headerEnc.buffer as ArrayBuffer);
    const payloadB64 = bufferToBase64Url(payloadEnc.buffer as ArrayBuffer);
    const toSign = `${headerB64}.${payloadB64}`;

    const privateKey = await crypto.subtle.importKey(
      "jwk" as any,
      privateKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateKey,
      encoder.encode(toSign)
    );
    const sigB64 = bufferToBase64Url(signature);

    return `${toSign}.${sigB64}`;
  } catch (err: any) {
    throw new Error(`Falha no motor criptográfico ao assinar JWT: ${err.message}`);
  }
}

export async function verificarJWT(
  jwt: string,
  publicKeyJwk?: JsonWebKey
): Promise<{ header: any; payload: any; signature: string; valid: boolean }> {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) {
      throw new Error("JWT malformado: Estrutura diferente de 3 partições (header.payload.signature).");
    }

    const headerB64 = parts[0]!;
    const payloadB64 = parts[1]!;
    const signatureB64 = parts[2]!;
    const decoder = new TextDecoder();

    const headerJson = decoder.decode(base64UrlToBuffer(headerB64));
    const payloadJson = decoder.decode(base64UrlToBuffer(payloadB64));
    
    let header, payload;
    try {
      header = JSON.parse(headerJson);
      payload = JSON.parse(payloadJson);
    } catch (_parseErr) {
      throw new Error("Conteúdo interno do JWT não é um JSON válido.");
    }

    let publicKeyJwkFinal = publicKeyJwk;
    if (!publicKeyJwkFinal) {
      if (!header.kid) {
        throw new Error("Header JWT não contém a propriedade 'kid' (Key ID) e nenhuma chave pública externa foi fornecida.");
      }
      publicKeyJwkFinal = expandVapidPublic(header.kid);
    } else {
      publicKeyJwkFinal = expandVapidPublic(publicKeyJwkFinal);
    }

    const publicKey = await crypto.subtle.importKey(
      "jwk" as any,
      publicKeyJwkFinal as JsonWebKey,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );

    const toSign = `${headerB64}.${payloadB64}`;
    const signatureBytes = base64UrlToBuffer(signatureB64);

    const encoder = new TextEncoder();
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      signatureBytes,
      encoder.encode(toSign)
    );

    return { header, payload, signature: signatureB64, valid };
  } catch (err: any) {
    throw new Error(`Falha na verificação de integridade do JWT: ${err.message}`);
  }
}

export function decodificarJWT(jwt: string): { header: any; payload: any; signature: string } {
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    throw new Error("JWT malformado. Leitura interrompida.");
  }

  const headerB64 = parts[0]!;
  const payloadB64 = parts[1]!;
  const signatureB64 = parts[2]!;
  const decoder = new TextDecoder();

  try {
    const headerJson = decoder.decode(base64UrlToBuffer(headerB64));
    const payloadJson = decoder.decode(base64UrlToBuffer(payloadB64));

    return {
      header: JSON.parse(headerJson),
      payload: JSON.parse(payloadJson),
      signature: signatureB64
    };
  } catch (err: any) {
    throw new Error(`Falha de decodificação forçada no JWT: ${err.message}`);
  }
}
```

---

## Arquivo: `monorepo/utils/src/db/id-old.ts`

```ts
// src/utils/id-utils.ts

/**
 * Gera um identificador único curto seguro.
 * Utiliza Web Crypto API se disponível, senão cai no fallback matemático.
 * @returns {string} ID gerado
 */
export function gerarId(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(12);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('').substring(0, 12);
  }
  return gerarIdFallback();
}

/**
 * Fallback para geração de ID caso crypto.getRandomValues não esteja disponível.
 * Combina o timestamp em base36 com um random.
 * @returns {string} ID temporário
 */
export function gerarIdFallback(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

/**
 * Valida se a string tem formato aceitável de ID.
 * @param {string} id
 * @returns {boolean}
 */
export function validarId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && id.length <= 24;
}
```

---

## Arquivo: `monorepo/utils/src/db/share-utils.ts`

```ts
// src/utils/share-utils.ts
import { gzipSync, gunzipSync } from 'fflate';
import { criarJWT, verificarJWT } from '../crypto/jwt.ts';
import { 
  minifyVapidPublic, expandVapidPublic, 
  minifyRsaPublic, expandRsaPublic,
  bufferToBase64Url,
  base64UrlToBuffer
} from '../crypto/mod.ts';
import type { ProfileConfig, Contato } from '../interfaces/mod.ts';
import { getAbsoluteProxyUrl } from '../config/proxy.ts';

const FCM_PREFIX = "https://fcm.googleapis.com/fcm/send/";

export interface CompactContact {
  req?: boolean;
  tr?: boolean;
  em: string;
  nm: string;
  vp: any; 
  ep: any; 
  se: string;
  sp: string;
  sa: string;
  ve: string;
  ps?: string; 
}

// 🔥 ARQUITETURA: Agora é Assíncrono. O pacote extraído TEM que carregar a URL resolvida.
export async function extrairDadosCompactos(target: ProfileConfig | Contato, req = false, tr = false): Promise<CompactContact> {
  let ep = target.subscription.endpoint;
  if (ep.startsWith(FCM_PREFIX)) ep = "1:" + ep.replace(FCM_PREFIX, "");
  const absoluteProxy = await getAbsoluteProxyUrl(target.subscription.proxyserver);
  return {
    req,
    tr,
    em: target.email || '',
    nm: target.name || '',
    vp: minifyVapidPublic(target.vapidPublicKey),
    ep: minifyRsaPublic(target.e2ePublicKey),
    se: ep,
    sp: target.subscription.keys.p256dh,
    sa: target.subscription.keys.auth,
    ve: target.vapidPrivateKeyEnvelope,
    ps: absoluteProxy
  };
}

export function expandirDadosCompactos(c: CompactContact): Partial<Contato> {
  let ep = c.se;
  if (ep.startsWith("1:")) ep = FCM_PREFIX + ep.substring(2);
  return {
    email: c.em,
    name: c.nm,
    vapidPublicKey: expandVapidPublic(c.vp),
    e2ePublicKey: expandRsaPublic(c.ep),
    subscription: { endpoint: ep, keys: { p256dh: c.sp, auth: c.sa }, proxyserver: c.ps },
    vapidPrivateKeyEnvelope: c.ve,
    trusted: c.tr,
    me: 'saved' 
  };
}

// 🔥 Assíncrono
export async function gerarPayloadQrCodeCompacto(target: ProfileConfig | Contato): Promise<string> {
  const compact = await extrairDadosCompactos(target);
  const jsonBytes = new TextEncoder().encode(JSON.stringify(compact));
  const compressed = gzipSync(jsonBytes);
  return bufferToBase64Url(compressed.buffer as ArrayBuffer);
}

// 🔥 Assíncrono (e já usando a extração assíncrona)
export async function gerarLinkConviteWeb(
  target: ProfileConfig | Contato,
  myVapidPrivateKeyJwk: JsonWebKey,
  myVapidPublicKeyJwk: JsonWebKey,
  baseUrl?: string
): Promise<string> {
  const compact = await extrairDadosCompactos(target);
  const payload = {
    sub: "contact",
    ...compact,
    iat: Math.floor(Date.now() / 1000)
  };
  const jwt = await criarJWT(payload, myVapidPrivateKeyJwk, { kid: myVapidPublicKeyJwk });
  const jwtBytes = new TextEncoder().encode(jwt);
  const compressed = gzipSync(jwtBytes);
  const cjwt = bufferToBase64Url(compressed.buffer as ArrayBuffer);
  const origin = baseUrl || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  return `${origin}/#share=${cjwt}`;
}

export async function processarQualquerConvite(rawInput: string): Promise<Partial<Contato>> {
  let cqr: string | null = null;
  let cjwt: string | null = null;
  let jwt: string | null = null;
  const input = rawInput.trim();
  try {
    if (input.includes('://') || input.startsWith('http')) {
      const url = new URL(input);
      if (url.hash && url.hash.includes('share=')) {
        const extracted = url.hash.split('share=')[1]?.split('&')[0];
        if (extracted) cjwt = extracted;
      } else {
        cqr = url.searchParams.get('cqr');
        cjwt = url.searchParams.get('cjwt');
        jwt = url.searchParams.get('jwt');
      }
    }
  } catch (e) {}
  if (!cqr && !cjwt && !jwt) {
    if (input.includes('#share=')) {
      cjwt = input.split('#share=')[1]?.split('&')[0] || null;
    } else if (input.includes('cjwt=')) {
      cjwt = input.split('cjwt=')[1]?.split('&')[0] || null;
    } else if (input.includes('cqr=')) {
      cqr = input.split('cqr=')[1]?.split('&')[0] || null;
    } else if (input.includes('jwt=')) {
      jwt = input.split('jwt=')[1]?.split('&')[0] || null;
    }
  }
  if (!cqr && !cjwt && !jwt && input) {
    if (input.split('.').length === 3 && !input.includes('://')) {
      jwt = input;
    } else {
      try {
        const cleanBase64 = input.replace(/[^A-Za-z0-9\-_]/g, ''); 
        const compressed = new Uint8Array(base64UrlToBuffer(cleanBase64));
        const decompressed = gunzipSync(compressed);
        const text = new TextDecoder().decode(decompressed);
        if (text.startsWith('{')) {
          cqr = cleanBase64;
        } else {
          cjwt = cleanBase64;
        }
      } catch (_e) {
        cjwt = input;
      }
    }
  }
  let compactData: CompactContact | null = null;
  if (!compactData && cjwt) {
    try {
      const compressed = new Uint8Array(base64UrlToBuffer(cjwt));
      const decompressed = gunzipSync(compressed);
      const jsonText = new TextDecoder().decode(decompressed);
      const { payload, valid } = await verificarJWT(jsonText); 
      if (!valid) throw new Error("Assinatura do convite inválida ou corrompida.");
      if (payload) compactData = payload as CompactContact;
    } catch (e) {
      console.warn("Falha ao verificar cjwt:", e);
    }
  }
  if (!compactData && cqr) {
    try {
      const compressed = new Uint8Array(base64UrlToBuffer(cqr));
      const decompressed = gunzipSync(compressed);
      const jsonText = new TextDecoder().decode(decompressed);
      const parsed = JSON.parse(jsonText);
      if (parsed.vp || (parsed.vx && parsed.vy)) {
        compactData = parsed as CompactContact;
      }
    } catch (e) {
      console.warn("Falha ao ler cqr:", e);
    }
  }
  if (!compactData && jwt) {
    try {
      const { payload, valid } = await verificarJWT(jwt);
      if (!valid) throw new Error("Assinatura do convite inválida.");
      if (payload) compactData = payload as CompactContact;
    } catch (e) {
      console.warn("Falha ao verificar jwt:", e);
    }
  }
  if (!compactData) throw new Error("O link ou código colado não é um convite válido do Loco.");
  if ((compactData as any).vx && !compactData.vp) {
    compactData.vp = { x: (compactData as any).vx, y: (compactData as any).vy };
    compactData.ep = { n: (compactData as any).en };
  }
  return expandirDadosCompactos(compactData);
}
```

---

## Arquivo: `monorepo/utils/src/db/self-contact-utils.ts`

```ts
// src/utils/self-contact-utils.ts
import type { ProfileConfig, Contato } from '../interfaces/mod.ts';

/**
 * Função interna para serializar chave pública VAPID em hash SHA-256.
 * Implementação própria para evitar dependência do IndexedDB em testes.
 */
async function serializarPublicKeyVapidInterna(jwk: JsonWebKey): Promise<string> {
  if (!jwk) throw new Error("Chave VAPID ausente ao tentar serializar.");
  const raw = `${jwk.kty?.toLowerCase() || ''}|${jwk.crv?.toLowerCase() || ''}|${jwk.x?.toLowerCase() || ''}|${jwk.y?.toLowerCase() || ''}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(raw));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Gera um objeto Contato baseado no ProfileConfig do próprio usuário.
 * Este contato especial usa o hash da chave pública VAPID do profile como ID,
 * permitindo que o sistema identifique quando o usuário está enviando mensagem para si mesmo.
 * 
 * @param profile - O ProfileConfig do usuário
 * @returns Um objeto Contato representando o próprio usuário, ou null se profile for inválido
 */
export async function gerarContatoProprio(profile: ProfileConfig): Promise<Contato | null> {
  if (!profile || !profile.vapidPublicKey) {
    return null;
  }
  try {
    const id = await serializarPublicKeyVapidInterna(profile.vapidPublicKey);
    const contatoProprio: Contato = {
      id,
      email: profile.email,
      name: `${profile.name} (Eu)`,
      vapidPublicKey: profile.vapidPublicKey,
      e2ePublicKey: profile.e2ePublicKey,
      subscription: profile.subscription,
      vapidPrivateKeyEnvelope: profile.vapidPrivateKeyEnvelope,
      trusted: true,
      me: 'trusted', // 🔥 Marca especial indicando que é o próprio usuário
      createdAt: profile.createdAt,
      updatedAt: Date.now()
    };
    return contatoProprio;
  } catch (error) {
    console.error('[SELF-CONTACT] Erro ao gerar contato próprio:', error);
    return null;
  }
}

/**
 * Verifica se um determinado contato é o próprio usuário.
 * Compara o hash do contato com o hash da chave pública VAPID do profile.
 * 
 * @param contatoHash - O hash/ID do contato a verificar
 * @param profile - O ProfileConfig do usuário atual
 * @returns true se o contato for o próprio usuário, false caso contrário
 */
export async function ehContatoProprio(
  contatoHash: string, 
  profile: ProfileConfig | null
): Promise<boolean> {
  if (!profile || !profile.vapidPublicKey) {
    return false;
  }
  try {
    const meuHash = await serializarPublicKeyVapidInterna(profile.vapidPublicKey);
    return contatoHash === meuHash;
  } catch (error) {
    console.error('[SELF-CONTACT] Erro ao verificar se é contato próprio:', error);
    return false;
  }
}

/**
 * Obtém o hash do próprio usuário a partir do profile.
 * Útil para comparações rápidas sem precisar gerar o objeto Contato completo.
 * 
 * @param profile - O ProfileConfig do usuário
 * @returns O hash da chave pública VAPID do usuário, ou null se profile for inválido
 */
export async function obterHashProprio(profile: ProfileConfig | null): Promise<string | null> {
  if (!profile || !profile.vapidPublicKey) {
    return null;
  }
  try {
    return await serializarPublicKeyVapidInterna(profile.vapidPublicKey);
  } catch (error) {
    console.error('[SELF-CONTACT] Erro ao obter hash próprio:', error);
    return null;
  }
}
```

---

## Arquivo: `monorepo/utils/src/db/mod.ts`

```ts
// src/utils/db-helpers.ts
import { get, set, createStore, del, entries, values, getMany } from "idb-keyval";
import { STORE_NAMES, KEY_NAMES, DB_NAMES } from "../config/mod.ts";
import type { ProfileConfig, Chat, Contato, Handshake, PastaMetadata } from "../interfaces/mod.ts";
import { 
  minifyVapidPublic, expandVapidPublic, 
  minifyVapidPrivate, expandVapidPrivate, 
  minifyRsaPublic, expandRsaPublic, 
  minifyRsaPrivate, expandRsaPrivate 
} from "../crypto/mod.ts";

// 🔥 NOVAS EXPORTS: Centralizando todos os utilitários de DB e compartilhamento
export * from "./id-old.ts";
export * from "./share-utils.ts";
export * from "./self-contact-utils.ts";

// ============================================================
// Criação de Stores
// ============================================================
export function criarStore(nome: string, storeName: string = STORE_NAMES.KEYVAL) {
  return createStore(nome, storeName);
}
const storeConfig = criarStore(DB_NAMES.CONFIG);
export const storeChat = criarStore(DB_NAMES.CHAT); 
export const storeContatos = criarStore(DB_NAMES.CONTATOS);
export const storeHandshakes = criarStore(DB_NAMES.HANDSHAKES, STORE_NAMES.KEYVAL);
export const storeMidias = criarStore(DB_NAMES.MIDIAS);

// ============================================================
// Funções Genéricas
// ============================================================
export async function salvarChave<T>(store: any, key: string, value: T): Promise<void> {
  return set(key, value, store);
}
export async function buscarChave<T>(store: any, key: string): Promise<T | undefined> {
  return get(key, store);
}
export async function removerChave(store: any, key: string): Promise<void> {
  return del(key, store);
}
export async function listarChaves<T>(store: any): Promise<[string, T][]> {
  return entries(store) as Promise<[string, T][]>;
}
export async function listarValores<T>(store: any): Promise<T[]> {
  return values(store) as Promise<T[]>;
}

// ============================================================
// Interceptadores de Compressão (DB Middlewares)
// ============================================================
function compactarProfile(p: ProfileConfig): any {
  return {
    ...p,
    vapidPublicKey: minifyVapidPublic(p.vapidPublicKey),
    vapidPrivateKeyJwk: minifyVapidPrivate(p.vapidPrivateKeyJwk),
    e2ePublicKey: minifyRsaPublic(p.e2ePublicKey),
    e2ePrivateKeyJwk: minifyRsaPrivate(p.e2ePrivateKeyJwk)
  };
}
function expandirProfile(p: any): ProfileConfig | undefined {
  if (!p) return undefined;
  return {
    ...p,
    vapidPublicKey: expandVapidPublic(p.vapidPublicKey),
    vapidPrivateKeyJwk: expandVapidPrivate(p.vapidPrivateKeyJwk, p.vapidPublicKey),
    e2ePublicKey: expandRsaPublic(p.e2ePublicKey),
    e2ePrivateKeyJwk: expandRsaPrivate(p.e2ePrivateKeyJwk, p.e2ePublicKey)
  } as ProfileConfig;
}
function compactarContato(c: Contato): any {
  return {
    ...c,
    vapidPublicKey: minifyVapidPublic(c.vapidPublicKey),
    e2ePublicKey: minifyRsaPublic(c.e2ePublicKey)
  };
}
function expandirContato(c: any): Contato | undefined {
  if (!c) return undefined;
  return {
    ...c,
    vapidPublicKey: expandVapidPublic(c.vapidPublicKey),
    e2ePublicKey: expandRsaPublic(c.e2ePublicKey)
  } as Contato;
}

// ============================================================
// Gerenciamento do Perfil (ProfileConfig)
// ============================================================
export async function salvarProfile(profile: ProfileConfig): Promise<void> {
  profile.updatedAt = Date.now();
  if (!profile.createdAt) {
    profile.createdAt = Date.now();
  }
  await salvarChave(storeConfig, KEY_NAMES.PROFILE, compactarProfile(profile));
}
export async function buscarProfile(): Promise<ProfileConfig | undefined> {
  const p = await buscarChave<any>(storeConfig, KEY_NAMES.PROFILE);
  return expandirProfile(p);
}
export async function removerProfile(): Promise<void> {
  await removerChave(storeConfig, KEY_NAMES.PROFILE);
}
export async function buscarChaveDecript(): Promise<CryptoKey | null> {
  try {
    const profile = await buscarProfile();
    if (!profile || !profile.e2ePrivateKeyJwk) return null;
    return await crypto.subtle.importKey(
      "jwk",
      profile.e2ePrivateKeyJwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["decrypt"]
    );
  } catch (err) {
    console.error("[DB-HELPERS] ❌ Erro ao buscar chave de decodificação:", err);
    return null;
  }
}

// ============================================================
// Mensagens de Chat (Novo Formato Unificado + Lazy Loading)
// ============================================================
export async function salvarChat(chat: Chat): Promise<void> {
  chat.updatedAt = Date.now();
  await salvarChave(storeChat, chat.id, chat);
  const indexKey = `${KEY_NAMES.CHAT_INDEX}${chat.contatoHash}`;
  const index = await buscarChave<string[]>(storeChat, indexKey) || [];
  if (!index.includes(chat.id)) {
    index.push(chat.id);
    await salvarChave(storeChat, indexKey, index);
  }
}
export async function buscarChat(id: string): Promise<Chat | undefined> {
  return buscarChave<Chat>(storeChat, id);
}
export async function listarChatPaginado(contatoHash: string, limit: number, offset: number): Promise<Chat[]> {
  const indexKey = `${KEY_NAMES.CHAT_INDEX}${contatoHash}`;
  const index = await buscarChave<string[]>(storeChat, indexKey) || [];
  const total = index.length;
  if (total === 0 || offset >= total) return [];
  const startIndex = Math.max(0, total - offset - limit);
  const endIndex = total - offset;
  const sliceIds = index.slice(startIndex, endIndex);
  const records = await getMany(sliceIds, storeChat);
  return records.filter(Boolean) as Chat[];
}
export async function removerChat(id: string, contatoHash: string): Promise<void> {
  const chat = await buscarChat(id);
  if (chat && chat.handshake && chat.handshake !== 'self') {
    await removerHandshake(chat.handshake);
  }
  await removerChave(storeChat, id);
  const indexKey = `${KEY_NAMES.CHAT_INDEX}${contatoHash}`;
  let index = await buscarChave<string[]>(storeChat, indexKey) || [];
  index = index.filter(x => x !== id);
  await salvarChave(storeChat, indexKey, index);
}
export async function removerTodoHistoricoChat(contatoHash: string): Promise<void> {
  const indexKey = `${KEY_NAMES.CHAT_INDEX}${contatoHash}`;
  const index = await buscarChave<string[]>(storeChat, indexKey) || [];
  for (const id of index) {
    await removerChave(storeChat, id);
  }
  await removerChave(storeChat, indexKey);
}

// ============================================================
// Contatos
// ============================================================
async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function serializarPublicKeyVapid(jwk: JsonWebKey): Promise<string> {
  if (!jwk) throw new Error("Chave VAPID ausente ao tentar serializar.");
  const expanded = expandVapidPublic(jwk);
  const raw = `${expanded.kty?.toLowerCase() || ''}|${expanded.crv?.toLowerCase() || ''}|${expanded.x?.toLowerCase() || ''}|${expanded.y?.toLowerCase() || ''}`;
  return await sha256(raw);
}
export async function normalizarChaveContato(input: string | JsonWebKey): Promise<string> {
  if (typeof input === 'string') return input;
  if (typeof input === 'object' && input !== null && ('kty' in input || 'x' in input)) {
    return await serializarPublicKeyVapid(input as JsonWebKey);
  }
  throw new Error('Chave de contato inválida: deve ser string (hash) ou JWK.');
}
export async function salvarContato(contato: Contato): Promise<void> {
  const key = await serializarPublicKeyVapid(contato.vapidPublicKey);
  await salvarChave(storeContatos, key, compactarContato(contato));
}
export async function buscarContatoPorPublicKey(vapidPublicKey: JsonWebKey): Promise<Contato | undefined> {
  const key = await serializarPublicKeyVapid(vapidPublicKey);
  const c = await buscarChave<any>(storeContatos, key);
  return expandirContato(c);
}
export async function buscarContatoPorChave(chaveOuJwk: string | JsonWebKey): Promise<Contato | undefined> {
  const key = await normalizarChaveContato(chaveOuJwk);
  const c = await buscarChave<any>(storeContatos, key);
  return expandirContato(c);
}
export async function listarContatos(): Promise<Contato[]> {
  const entriesList = await listarChaves<any>(storeContatos);
  return entriesList.map(([_, c]) => expandirContato(c) as Contato);
}
export async function removerContato(vapidPublicKey: JsonWebKey): Promise<void> {
  const key = await serializarPublicKeyVapid(vapidPublicKey);
  await removerChave(storeContatos, key);
}
export async function removerContatoPorHash(hash: string): Promise<void> {
  await removerChave(storeContatos, hash);
}

// ============================================================
// Handshakes
// ============================================================
export async function salvarHandshake(handshake: Handshake): Promise<void> {
  handshake.updatedAt = Date.now();
  if (!handshake.createdAt) {
    handshake.createdAt = Date.now();
  }
  await salvarChave(storeHandshakes, handshake.id, handshake);
}
export async function buscarHandshake(id: string): Promise<Handshake | undefined> {
  return buscarChave<Handshake>(storeHandshakes, id);
}
export async function listarHandshakes(): Promise<Handshake[]> {
  return listarValores<Handshake>(storeHandshakes);
}
export async function removerHandshake(id: string): Promise<void> {
  await removerChave(storeHandshakes, id);
}

// ============================================================
// Metadados de Mídias e OPFS (Coleções/Pastas P2P)
// ============================================================
export async function salvarPastaMetadata(pasta: PastaMetadata): Promise<void> {
  pasta.modifiedAt = Date.now();
  await salvarChave(storeMidias, pasta.id, pasta);
}
export async function buscarPastaMetadata(id: string): Promise<PastaMetadata | undefined> {
  return buscarChave<PastaMetadata>(storeMidias, id);
}
export async function listarTodasAsPastas(): Promise<PastaMetadata[]> {
  return await listarValores<PastaMetadata>(storeMidias);
}
export async function removerPastaMetadata(id: string): Promise<void> {
  await removerChave(storeMidias, id);
}
```

---

## Arquivo: `monorepo/utils/src/proxy/mod.ts`

```ts
// src/utils/push-utils.ts
import { gzipSync } from "fflate";
import { addDebugLog } from "../debug/mod.ts";
import { 
  minifyVapidPrivate, 
  minifyVapidPublic, 
  expandVapidPublic, 
  expandVapidPrivate 
} from "../crypto/mod.ts";
import { fetchLocoProxy } from "../config/proxy.ts";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  try {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    return btoa(binary);
  } catch (e: any) {
    throw new Error(`Erro ao encodar payload cifrado para Base64: ${e.message}`);
  }
}

export async function cifrarPayloadObj(payloadObj: any, publicKeyRSA: JsonWebKey): Promise<{
  i: string;
  d: string;
  k: string;
}> {
  try {
    const encoder = new TextEncoder();
    const jsonString = JSON.stringify(payloadObj);
    const bytes = encoder.encode(jsonString);
    
    const compressed = gzipSync(bytes);
    
    addDebugLog("info", "CRYPTO:PUSH", `Comprimido: ${compressed.length} bytes (Original: ${bytes.length} bytes)`);
    if (compressed.length > 3000) {
       addDebugLog("warn", "CRYPTO:PUSH", `Atenção: O payload comprimido está em ${compressed.length} bytes. Risco de estourar o limite de 4KB após a assinatura JWT.`);
    }

    const aesKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt"]
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      compressed as unknown as BufferSource
    );

    const cryptoKeyDestino = await crypto.subtle.importKey(
      "jwk" as any,
      publicKeyRSA,
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["encrypt"]
    );
    
    const aesKeyRaw = await crypto.subtle.exportKey("raw", aesKey);
    const aesKeyEncrypted = await crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      cryptoKeyDestino,
      aesKeyRaw
    );

    return {
      i: arrayBufferToBase64(iv.buffer as ArrayBuffer),
      d: arrayBufferToBase64(encryptedBuffer),
      k: arrayBufferToBase64(aesKeyEncrypted)
    };
  } catch (err: any) {
    addDebugLog("error", "CRYPTO:PUSH", `Erro severo na montagem do envelope E2EE: ${err.message}`);
    throw new Error(`Falha de criptografia Híbrida: ${err.message}`);
  }
}

export async function enviarParaProxy(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string }; proxyserver?: string },
  payloadText: string,
  vapid: { subject: string; publicKey: JsonWebKey; privateKey: string }
): Promise<void> {
  const payloadSize = new Blob([payloadText]).size;
  if (payloadSize > 4096) {
    addDebugLog("error", "NETWORK:PUSH", `Rejeição preventiva: Payload de ${payloadSize} bytes ultrapassa o limite arquitetural de 4096 bytes do FCM.`);
    throw new Error(`Limite de cota de rede excedido. O pacote final ficou com ${payloadSize} bytes.`);
  }

  try {
    const response = await fetchLocoProxy('/push', {
      body: {
        subscription,
        payloadText,
        vapid: {
          subject: vapid.subject,
          publicKey: minifyVapidPublic(vapid.publicKey),
          privateKey: vapid.privateKey
        }
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`O servidor retransmissor rejeitou o pacote. HTTP ${response.status}: ${errorText}`);
    }
  } catch (err: any) {
     addDebugLog("error", "NETWORK:PUSH", `Falha de conexão com o Proxy: ${err.message}`);
     throw err;
  }
}

export async function cifrarChaveVapid(privateKeyJwk: JsonWebKey, serverPublicKeyJwk: JsonWebKey): Promise<string> {
  try {
    const serverKey = await crypto.subtle.importKey(
      "jwk" as any,
      serverPublicKeyJwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["encrypt"]
    );
    
    const aesKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt"]
    );
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    
    const minifiedPrivate = minifyVapidPrivate(privateKeyJwk);
    const vapidBytes = encoder.encode(JSON.stringify(minifiedPrivate));
    
    const vapidCifrado = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      vapidBytes as unknown as BufferSource
    );
    
    const aesKeyRaw = await crypto.subtle.exportKey("raw", aesKey);
    const aesKeyCifrado = await crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      serverKey,
      aesKeyRaw
    );

    const toHex = (buf: ArrayBuffer) =>
      Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    const envelope = {
      iv: toHex(iv.buffer as ArrayBuffer),
      dadosCifrados: toHex(vapidCifrado),
      chaveAesCifrada: toHex(aesKeyCifrado)
    };
    
    return btoa(JSON.stringify(envelope));
  } catch (err: any) {
    addDebugLog("error", "CRYPTO:VAPID", `Falha no envelopamento: ${err.message}`);
    throw new Error(`Erro ao blindar perfil para a rede: ${err.message}`);
  }
}

export async function decifrarChaveVapid(base64Envelope: string, serverPrivateKey: CryptoKey): Promise<any> {
  try {
    let binaryString: string;
    try {
      binaryString = atob(base64Envelope);
    } catch (_e) {
      const base64Standard = base64Envelope.replace(/-/g, "+").replace(/_/g, "/");
      binaryString = atob(base64Standard);
    }

    const { iv, dadosCifrados, chaveAesCifrada } = JSON.parse(binaryString);

    const fromHex = (hex: string) => new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
    const ivBytes = fromHex(iv);
    const dadosBytes = fromHex(dadosCifrados);
    const chaveAesCifradaBytes = fromHex(chaveAesCifrada);

    const aesChaveCruaBuffer = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" }, 
      serverPrivateKey, 
      chaveAesCifradaBytes
    );
    
    const chaveSimetricaAes = await crypto.subtle.importKey(
      "raw", 
      aesChaveCruaBuffer, 
      { name: "AES-GCM", length: 256 }, 
      false, 
      ["decrypt"]
    );
    
    const vapidOriginalBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes }, 
      chaveSimetricaAes, 
      dadosBytes
    );

    return JSON.parse(new TextDecoder().decode(vapidOriginalBuffer));
  } catch (err: any) {
    addDebugLog("error", "CRYPTO:VAPID", `Falha no deciframento do envelope: ${err.message}`);
    throw err;
  }
}

/**
 * Decifra a chave privada VAPID contida no envelope via chave RSA do Servidor e
 * reidrata/expande ambos os JWKs (Público e Privado) para o formato padrão do WebCrypto.
 */
export async function extrairEExpandirChavesVapid(
  serverPrivateKey: CryptoKey,
  publicKeyRaw: any,
  privateKeyEnvelopeBase64: string
): Promise<{ publicKey: JsonWebKey; privateKey: JsonWebKey }> {
  try {
    const privateKeyUnwrapped = await decifrarChaveVapid(privateKeyEnvelopeBase64, serverPrivateKey);
    
    const pub = typeof publicKeyRaw === "string" ? JSON.parse(publicKeyRaw) : publicKeyRaw;
    const priv = typeof privateKeyUnwrapped === "string" ? JSON.parse(privateKeyUnwrapped) : privateKeyUnwrapped;

    const expandedPub = expandVapidPublic(pub);
    const expandedPriv = expandVapidPrivate(priv, expandedPub);

    return { publicKey: expandedPub, privateKey: expandedPriv };
  } catch (err: any) {
    throw new Error(`JWK/Envelope VAPID inválido: ${err.message}`);
  }
}
```

---

## Arquivo: `monorepo/utils/src/debug/mod.ts`

```ts
import { DEBUG_CHANNEL_NAME } from "../config/mod.ts";
import type { DebugLogPayload } from "../interfaces/mod.ts";

// 🔥 Lazy initialization: só cria o channel quando for usado pela primeira vez
let debugChannel: BroadcastChannel | null = null;

function getDebugChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }
  
  // Inicializa apenas uma vez, sob demanda
  if (debugChannel === null) {
    try {
      debugChannel = new BroadcastChannel(DEBUG_CHANNEL_NAME);
    } catch (err) {
      console.warn("Erro ao criar BroadcastChannel:", err);
      return null;
    }
  }
  
  return debugChannel;
}

/**
 * Emite logs desacoplados via BroadcastChannel para o DebugPanel e inspeciona no console nativo.
 * Esta função suporta retrocompatibilidade, aceitando tanto 1 argumento (msg) quanto a versão rica.
 */
export function addDebugLog(
  typeOrMsg: string,
  moduleOrDetails?: any,
  message?: string,
  details?: unknown
): void {
  let logType: DebugLogPayload["type"] = "info";
  let logModule = "SYSTEM";
  let logMessage = "";
  let logDetails: unknown = undefined;

  // Trata a sobrecarga de argumentos
  if (arguments.length === 1 || (arguments.length === 2 && typeof moduleOrDetails !== "string")) {
    logType = "info";
    logModule = "APP";
    logMessage = typeOrMsg;
    logDetails = moduleOrDetails;
  } else {
    logType = (typeOrMsg as DebugLogPayload["type"]) || "info";
    logModule = moduleOrDetails as string || "SYSTEM";
    logMessage = message || "";
    logDetails = details;
  }

  // 🔥 Cria a estrutura exata que o DebugPanel.tsx espera receber
  const entry: DebugLogPayload = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toLocaleTimeString(),
    type: logType,
    module: logModule,
    message: logMessage,
    details: logDetails,
  };

  try {
    const channel = getDebugChannel();
    if (channel) {
      channel.postMessage({
        type: "LOCO_DEBUG_LOG",
        entry,
      });
    }
  } catch (err) {
    console.warn("Erro ao emitir log no BroadcastChannel:", err);
  }

  // Espelha no console de desenvolvedor do navegador
  const consoleMsg = `[${logModule}] ${logMessage}`;
  if (logType === "error") console.error(consoleMsg, logDetails ?? "");
  else if (logType === "warn") console.warn(consoleMsg, logDetails ?? "");
  else console.log(consoleMsg, logDetails ?? "");
}
```

---

## Arquivo: `monorepo/utils/src/esbuild/mod.ts`

```ts
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

 // ============================================================================
// 📦 RE-EXPORT DO MÓDULO BUNDLE (Deno.bundle API)
// ============================================================================
export * from "./bundle.ts";
```

---

## Arquivo: `monorepo/utils/src/esbuild/bundle.ts`

````ts
/// <reference lib="deno.ns" />
/**
 * @module @loco/utils/build/bundle
 * @description Funções específicas para o motor Deno.bundle (API nativa --unstable-bundle).
 *
 * Estratégia de Define:
 * - Deno.bundle() não suporta 'define' nativo
 * - Usamos write: false para receber os OutputFiles em memória
 * - Aplicamos substituições de defines em cada OutputFile.text()
 * - Só então salvamos os arquivos modificados no disco
 *
 * Limitações vs esbuild:
 * - Sem watch mode (Deno.bundle não suporta)
 * - Sem plugins customizados
 * - Define via regex (menos preciso que AST transform)
 */

import { ensureDir } from "@std/fs";

// ============================================================================
// 📦 TIPOS
// ============================================================================
import type { DenoBundleTargetConfig } from "../interfaces/mod.ts";

// ============================================================================
// 📂 FUNÇÕES COMPARTILHADAS (reimportadas do mod.ts)
// ============================================================================
import { cleanTarget, copyStaticFiles } from "./mod.ts";

// ============================================================================
// 🔧 APLICAÇÃO DE DEFINES (em memória, antes de salvar)
// ============================================================================

/**
 * Aplica substituições de 'define' no conteúdo textual de um OutputFile.
 *
 * Recebe o texto bruto do bundle (via OutputFile.text()) e retorna
 * uma versão com todos os defines substituídos.
 *
 * @param text - Conteúdo textual do bundle
 * @param defines - Mapa de identificador → valor de substituição
 * @returns Texto com defines aplicados
 *
 * @example
 * ```typescript
 * const modified = applyDefines(
 *   'console.log(__APP_VERSION__)',
 *   { '__APP_VERSION__': '"v1.0.0"' }
 * );
 * // resultado: 'console.log("v1.0.0")'
 * ```
 */
export function applyDefines(
  text: string,
  defines: Record<string, string>,
): string {
  let result = text;
  for (const [key, value] of Object.entries(defines)) {
    // Escapa caracteres especiais de regex no key
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escapedKey, "g");
    result = result.replace(regex, value);
  }
  return result;
}

// ============================================================================
// 🛠️ CONSTRUÇÃO DAS OPÇÕES DO DENO.BUNDLE
// ============================================================================

/**
 * Constrói as opções para Deno.bundle() a partir da config do alvo.
 *
 * ⚠️ IMPORTANTE: write é SEMPRE false.
 * Queremos receber os OutputFiles em memória para aplicar
 * defines antes de salvar no disco.
 */
export function buildBundleOptions(
  config: DenoBundleTargetConfig,
): Deno.bundle.Options {
  const options: Deno.bundle.Options = {
    entrypoints: config.entryPoints,
    write: false, // 🔥 SEMPRE false — salvamos manualmente após injetar defines
  };

  // Saída: outfile (single file) ou outputDir (múltiplos)
  if (config.outfile !== undefined) {
    options.outputPath = config.outfile;
  } else {
    options.outputDir = config.distdir;
  }

  // Propriedades opcionais repassadas diretamente
  if (config.platform !== undefined) options.platform = config.platform;
  if (config.format !== undefined) options.format = config.format;
  if (config.minify !== undefined) options.minify = config.minify;
  if (config.keepNames !== undefined) options.keepNames = config.keepNames;
  if (config.sourcemap !== undefined) options.sourcemap = config.sourcemap;
  if (config.codeSplitting !== undefined) {
    options.codeSplitting = config.codeSplitting;
  }
  if (config.inlineImports !== undefined) {
    options.inlineImports = config.inlineImports;
  }
  if (config.packages !== undefined) options.packages = config.packages;
  if (config.external !== undefined) options.external = config.external;

  return options;
}

// ============================================================================
// 🎯 PROCESSAMENTO DE ALVO (Deno.bundle)
// ============================================================================

/**
 * Processa um alvo completo usando Deno.bundle:
 * clean → copy → bundle → define → write
 *
 * Fluxo:
 * 1. Limpa diretório de saída (se configurado)
 * 2. Copia arquivos estáticos (public/, index.html)
 * 3. Executa Deno.bundle() com write: false
 * 4. Verifica erros e warnings do resultado
 * 5. Para cada OutputFile:
 *    a. Obtém conteúdo via .text()
 *    b. Aplica defines (substituição textual)
 *    c. Salva arquivo no disco
 */
export async function processBundleTarget(
  targetName: string,
  config: DenoBundleTargetConfig,
  appVersion: string,
  listAssetsFn?: (distDir: string) => Promise<string[]>,
): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🎯 PROCESSANDO ALVO: ${targetName.toUpperCase()}`);
  console.log(`${"=".repeat(60)}`);

  // 1. Limpar diretório de saída
  if (config.clean && config.clean.length > 0) {
    await cleanTarget(config.distdir, config.clean);
  }

  // 2. Copiar arquivos estáticos
  await copyStaticFiles(config, appVersion);

  // 3. Preparar defines
  const defines: Record<string, string> = {
    ...config.define,
    __APP_VERSION__: JSON.stringify(`v${appVersion}`),
  };

  // Para o SW, precisamos listar assets ANTES do bundle
  // (os assets são gerados pelos builds anteriores: ui, worker)
  if (targetName === "sw" && listAssetsFn) {
    const assets = await listAssetsFn(config.distdir);
    defines["__GENERATED_ASSETS__"] = JSON.stringify(assets);
    console.log(`📋 ${assets.length} assets listados para cache do SW`);
  }

  // 4. Executar bundle
  console.log(`🔨 Compilando com Deno.bundle...`);
  const startTime = performance.now();
  const bundleOptions = buildBundleOptions(config);
  const result = await Deno.bundle(bundleOptions);

  // 5. Verificar erros
  if (!result.success) {
    console.error("❌ Erros de compilação:");
    for (const error of result.errors) {
      const loc = error.location
        ? ` (${error.location.file}:${error.location.line}:${error.location.column})`
        : "";
      console.error(`   ${error.text}${loc}`);
      for (const note of error.notes ?? []) {
        console.error(`      💡 ${note.text}`);
      }
    }
    throw new Error(`Bundle falhou para o alvo [${targetName}]`);
  }

  // 6. Exibir warnings (se houver)
  for (const warning of result.warnings) {
    const loc = warning.location
      ? ` (${warning.location.file}:${warning.location.line}:${warning.location.column})`
      : "";
    console.warn(`   ⚠️ ${warning.text}${loc}`);
  }

  // 7. Processar OutputFiles: text() → applyDefines → writeTextFile
  const outputFiles = result.outputFiles ?? [];
  if (outputFiles.length === 0) {
    console.warn(`   ⚠️ Nenhum arquivo gerado pelo bundle [${targetName}]`);
    return;
  }

  const defineKeys = Object.keys(defines);
  const hasDefines = defineKeys.length > 0;
  if (hasDefines) {
    console.log(
      `🔧 Injetando ${defineKeys.length} define(s): ${defineKeys.join(", ")}`,
    );
  }

  for (const outputFile of outputFiles) {
    // Garante que o diretório de destino existe
    const dir = outputFile.path.substring(
      0,
      outputFile.path.lastIndexOf("/"),
    );
    if (dir) {
      await ensureDir(dir);
    }

    // Obtém conteúdo como string via .text()
    let content = outputFile.text();

    // Aplica defines no conteúdo em memória (ANTES de salvar)
    if (hasDefines) {
      content = applyDefines(content, defines);
    }

    // Salva o arquivo modificado no disco
    await Deno.writeTextFile(outputFile.path, content);
    console.log(
      `   📄 ${outputFile.path} (${(content.length / 1024).toFixed(1)}KB)`,
    );
  }

  const duration = (performance.now() - startTime).toFixed(0);
  console.log(
    `✅ [${targetName}] Build concluído em ${duration}ms (${outputFiles.length} arquivo(s))`,
  );
}
````

---

## Arquivo: `monorepo/utils/src/export/mod.ts`

```````ts
/// <reference lib="deno.ns" />

/**
 * @module @loco/utils/export
 * @description Utilitários genéricos para consolidação de contexto para IAs.
 * Contém apenas tipos, funções puras e constantes reutilizáveis.
 * As configurações específicas do projeto ficam no script de execução.
 */

// ============================================================================
// 📦 TIPOS E INTERFACES
// ============================================================================

import type { ExportConfig } from "../interfaces/mod.ts";

// ============================================================================
// 🛠️ FUNÇÕES UTILITÁRIAS PURAS
// ============================================================================

/**
 * Normaliza um caminho para comparação consistente.
 * - Converte barras invertadas em barras normais
 * - Converte para minúsculas
 */
export function normalizarCaminho(caminho: string): string {
  return caminho.replace(/\\/g, "/").toLowerCase();
}

/**
 * Normaliza um caminho para comparação de prefixos.
 * Além da normalização básica, remove o prefixo "./" se presente.
 * 
 * Exemplo:
 * - "./monorepo/ui/tests" → "monorepo/ui/tests"
 * - "monorepo/server" → "monorepo/server"
 * - "./" → ""
 * - "." → ""
 */
function normalizarPrefixo(caminho: string): string {
  let normalized = caminho.replace(/\\/g, "/").toLowerCase();
  // Remove ./ prefixo
  if (normalized === "./" || normalized === ".") {
    return "";
  }
  if (normalized.startsWith("./")) {
    normalized = normalized.substring(2);
  }
  // Remove trailing slash para comparação
  normalized = normalized.replace(/\/$/, "");
  return normalized;
}

/**
 * Calcula a quantidade mínima de crases necessárias para envolver um texto
 * em um bloco de código markdown, evitando conflitos com crases dentro do texto.
 *
 * Exemplo:
 * - Texto sem crases → "```"
 * - Texto com ``` → "````" (4 crases)
 * - Texto com ````` → "``````" (6 crases)
 */
export function calcularCraseWrapper(texto: string): string {
  const matches = texto.match(/`+/g);
  if (!matches) return "```";
  const maiorSequencia = Math.max(...matches.map(m => m.length));
  const tamanhoNecessario = Math.max(3, maiorSequencia + 1);
  return "`".repeat(tamanhoNecessario);
}

/**
 * Mapeia extensões de arquivo para a sintaxe de highlight do markdown.
 */
export function mapearExtensao(caminhoRelativo: string): string {
  const ext = caminhoRelativo.split(".").pop()?.toLowerCase() || "";
  const mapa: Record<string, string> = {
    manifest: "json",
    jsonc: "json",
    yml: "yaml",
    sh: "bash",
    env: "properties",
  };

  // Casos especiais
  if (caminhoRelativo.includes(".env")) return "properties";

  return mapa[ext] || ext;
}

/**
 * Determina se um arquivo deve ser incluído no snapshot baseado na configuração.
 *
 * Regras aplicadas (em ordem):
 * 1. Proteção anti-loop: sempre exclui arquivos em `exports/`
 * 2. Verifica se está em caminhos adicionais permitidos
 * 3. Verifica se está dentro de pastaBase
 * 4. Se está NA RAIZ de pastaBase, verifica arquivosRaizPermitidos
 * 5. Se está em SUBPASTA, verifica subpastasPermitidas
 * 6. Verifica se tem extensão permitida
 *
 * Semântica:
 * - `subpastasPermitidas: []` (vazio) = permite varrer TODAS as subpastas
 * - `arquivosRaizPermitidos` = lista explícita de arquivos permitidos NA RAIZ
 */
export function deveIncluirArquivo(
  caminhoRelativo: string,
  config: ExportConfig
): boolean {
  const caminhoNormalizado = normalizarCaminho(caminhoRelativo);

  // 🔒 Proteção anti-loop: nunca inclui arquivos da pasta exports/
  if (caminhoNormalizado.startsWith("exports/")) {
    return false;
  }

  // 🔍 Verifica caminhos adicionais (fora de pastaBase)
  if (
    config.caminhosAdicionaisPermitidos &&
    config.caminhosAdicionaisPermitidos.length > 0
  ) {
    const correspondeAdicional = config.caminhosAdicionaisPermitidos.some(
      (caminhoExtra) => {
        const extraNormalizado = normalizarCaminho(caminhoExtra);
        return (
          caminhoNormalizado === extraNormalizado ||
          caminhoNormalizado.startsWith(extraNormalizado + "/")
        );
      }
    );

    if (correspondeAdicional) {
      return config.extensoesPermitidas.some(
        (ext) =>
          caminhoNormalizado.endsWith(ext) || caminhoNormalizado === ext
      );
    }
  }

  // 🔍 Verifica se está dentro de pastaBase
  // 🔥 CORREÇÃO: Usa normalizarPrefixo que remove "./" para comparação consistente
  const prefixoBase = normalizarPrefixo(config.pastaBase);
  const prefixoBaseComBarra = prefixoBase !== "" ? prefixoBase + "/" : "";

  if (prefixoBaseComBarra !== "" && !caminhoNormalizado.startsWith(prefixoBaseComBarra)) {
    return false;
  }

  // 🔍 Extrai o caminho relativo dentro de pastaBase
  const caminhoInterno = prefixoBaseComBarra !== ""
    ? caminhoNormalizado.substring(prefixoBaseComBarra.length)
    : caminhoNormalizado;

  // 🔥 CORREÇÃO: Verifica se está NA RAIZ (não tem / no caminhoInterno)
  // Arquivos na raiz precisam estar explicitamente em arquivosRaizPermitidos
  const estaNaRaiz = !caminhoInterno.includes("/");

  if (estaNaRaiz) {
    // Verifica se está na lista de arquivos raiz permitidos (case insensitive)
    return config.arquivosRaizPermitidos.some(
      (raiz) => normalizarCaminho(raiz) === caminhoInterno
    );
  }

  // 🔍 Está em subpasta: verifica subpastasPermitidas
  let emSubpastaPermitida = false;

  if (config.subpastasPermitidas.length === 0) {
    // Vazio = permite varrer TODAS as subpastas
    emSubpastaPermitida = true;
  } else {
    emSubpastaPermitida = config.subpastasPermitidas.some((sub) => {
      const subNormalizada = normalizarCaminho(sub) + "/";
      return (
        caminhoInterno.startsWith(subNormalizada) ||
        caminhoInterno === normalizarCaminho(sub)
      );
    });
  }

  if (emSubpastaPermitida) {
    if (config.extensoesPermitidas.length === 0) return true;
    return config.extensoesPermitidas.some(
      (ext) => caminhoNormalizado.endsWith(ext) || caminhoNormalizado === ext
    );
  }

  return false;
}

// ============================================================================
// 📝 GERAÇÃO DE CONTEÚDO
// ============================================================================

/**
 * Gera o cabeçalho do snapshot com instruções para a IA.
 */
export function gerarCabecalho(
  config: ExportConfig,
  modo: string,
  versaoApp: string
): string {
  const versaoDisplay = config.incluiVersao ? `[v${versaoApp}] ` : "";

  return `> **INSTRUÇÃO PARA A IA:** 
> ${config.instrucaoCustomizada}
> O projeto é o **Loco ${versaoDisplay}** estruturado em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: \`## Arquivo: src/main.ts\`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco ${versaoDisplay}- Modo: ${modo.toUpperCase()}

Gerado automaticamente em: ${new Date().toLocaleString()}

---

`;
}

/**
 * Formata um arquivo para inclusão no snapshot markdown.
 */
export function formatarArquivoMarkdown(
  caminhoRelativo: string,
  conteudo: string
): string {
  const extensaoMarkdown = mapearExtensao(caminhoRelativo);
  const wrapperCrasis = calcularCraseWrapper(conteudo);

  let resultado = `## Arquivo: \`${caminhoRelativo}\`\n\n`;
  resultado += `${wrapperCrasis}${extensaoMarkdown}\n`;
  resultado += conteudo;
  resultado += `\n${wrapperCrasis}\n\n---\n\n`;

  return resultado;
}
```````

---

## Arquivo: `monorepo/utils/README.md`

```md

```

---

## Arquivo: `monorepo/utils/deno.jsonc`

```json
{
  "name": "@loco/utils",
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "dom.asynciterable", "esnext", "deno.ns", "deno.unstable"],
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true
  },
  "imports": {
    "@std/assert": "jsr:@std/assert",
    "@std/testing": "jsr:@std/testing",
    "idb-keyval": "https://esm.sh/idb-keyval@6.2.1",
    "fake-indexeddb": "https://esm.sh/fake-indexeddb@6.2.5?bundle",
    "fake-indexeddb/auto": "https://esm.sh/fake-indexeddb@6.2.5/auto?bundle",
    "fflate": "https://esm.sh/fflate@0.8.2?target=es2022"
  },
  "tasks": {
    "test": "deno test --allow-env --allow-net --allow-read --allow-write tests/",
    "check": "deno check src/**/*.ts src/**/*.tsx tests/**/*.ts",
    "tests": "deno task check && deno task test"
  },
  "exports": {
    ".": "./src/mod.ts",
    "./config": "./src/config/mod.ts",
    "./interfaces": "./src/interfaces/mod.ts",
    "./proxy": "./src/proxy/mod.ts",
    "./debug": "./src/debug/mod.ts",
    "./crypto": "./src/crypto/mod.ts",
    "./build": "./src/esbuild/mod.ts",
    "./db": "./src/db/mod.ts",
    "./export": "./src/export/mod.ts"
  }
}
```

---

## Arquivo: `export.ts`

```ts
/// <reference lib="deno.ns" />

/**
 * @file export.ts
 * @description Script de consolidação de contexto para IAs com suporte a parâmetros via CLI.
 * Contém as configurações específicas do projeto Loco e a lógica de execução.
 * A lógica pura reutilizável está em @loco/utils/export.
 * 
 * Comportamento:
 * - Sem args: executa todos os modos com `default !== false`
 * - Com args: executa apenas os modos solicitados
 * - Suporta múltiplos modos em uma única execução
 */

import { walk } from "@std/fs/walk";
import { relative } from "@std/path/relative";
import {
  deveIncluirArquivo,
  gerarCabecalho,
  formatarArquivoMarkdown,
} from "@loco/utils/export";
import type { ExportConfig } from "@loco/utils/interfaces"
import { APP_VERSION, EXTENSOES_PADRAO } from "@loco/utils/config";

// ============================================================================
// 📦 TIPOS ESPECÍFICOS DO PROJETO
// ============================================================================

/**
 * Modos de exportação disponíveis no Loco.
 * Específicos para este projeto.
 */
export type ModoExportacao =
  | "ui"
  | "docs"
  | "server"
  | "playground"
  | "workerdb"
  | "utils"
  | "router"
  | "sw";

// ============================================================================
// 📋 CONFIGURAÇÕES ESPECÍFICAS DO LOCO
// ============================================================================

/**
 * Dicionário de configurações para cada modo de exportação do Loco.
 * Declarativo, extensível e específico deste projeto.
 */
export const CONFIGURACOES: Record<ModoExportacao, ExportConfig> = {
  ui: {
    arquivoSaida: "snapshots/ui.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "./monorepo/ui/",
    subpastasPermitidas: ["src", "public", "tests", "docs"],
    arquivosRaizPermitidos: ["build.ts", "deno.json", "deno.jsonc", "readme.md"],
    incluiVersao: true,
    instrucaoCustomizada: "O texto abaixo contém os arquivos de CÓDIGO FONTE principais da aplicação (UI).",
    default: true, // ✅ Roda por padrão
  },
  docs: {
    arquivoSaida: "snapshots/docs.md",
    extensoesPermitidas: [".md", ".txt"],
    pastaBase: "./",
    subpastasPermitidas: ["docs"],
    arquivosRaizPermitidos: ["readme.md", "readme", "license", "license.md", "license.txt", ".tool-versions"],
    incluiVersao: true,
    instrucaoCustomizada: "O texto abaixo contém a DOCUMENTAÇÃO e diretrizes arquiteturais do projeto.",
    default: false, // ✅ Roda por padrão
  },
  server: {
    arquivoSaida: "snapshots/server.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/server",
    subpastasPermitidas: ["src", "tests", "docs"],
    caminhosAdicionaisPermitidos: [".github/workflows"],
    arquivosRaizPermitidos: [
      "build.ts", "deno.json", "deno.jsonc", "readme.md",
      "minify-keys.ts", "wrangler-worker.toml", "wrangler-pages.toml", "deploy.sh"
    ],
    incluiVersao: false,
    instrucaoCustomizada: "O texto abaixo contém os arquivos de configuração e execução do SERVIDOR @loco/server e CI/CD.",
    default: true, // ✅ Roda por padrão
  },
  playground: {
    arquivoSaida: "snapshots/playground.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/playground",
    subpastasPermitidas: ["src", "public", "tests", "docs"],
    arquivosRaizPermitidos: ["build.ts", "deno.json", "deno.jsonc", "readme.md", "server.ts"],
    incluiVersao: false,
    instrucaoCustomizada: "O texto abaixo contém experimentos e código da área de PLAYGROUND.",
    default: false, // ❌ Só roda quando solicitado explicitamente
  },
  workerdb: {
    arquivoSaida: "snapshots/worker-db.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/worker-db",
    subpastasPermitidas: ["src", "tests", "docs", "example"],
    arquivosRaizPermitidos: ["build.ts", "deno.json", "deno.jsonc", "readme.md"],
    incluiVersao: false,
    instrucaoCustomizada: "O texto abaixo contém experimentos e código da área de @loco/workerdb",
    default: true, // ✅ Roda por padrão
  },
  utils: {
    arquivoSaida: "snapshots/utils.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/utils",
    subpastasPermitidas: ["src", "tests", "docs"],
    caminhosAdicionaisPermitidos: ["export.ts", "esbuild.ts", "build.ts"],
    arquivosRaizPermitidos: ["deno.json", "deno.jsonc", "readme.md"],
    incluiVersao: false,
    instrucaoCustomizada: "O texto abaixo contém experimentos e código da área de @loco/utils",
    default: true, // ✅ Roda por padrão
  },
  sw: {
    arquivoSaida: "snapshots/sw.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/service-worker",
    subpastasPermitidas: ["src", "tests", "docs"],
    arquivosRaizPermitidos: ["deno.json", "deno.jsonc", "readme.md"],
    incluiVersao: true,
    instrucaoCustomizada: "O texto abaixo contém experimentos e código da área de @loco/service-worker",
    default: true, // ❌ Só roda quando solicitado explicitamente
  },
  router: {
    arquivoSaida: "snapshots/router.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/router",
    subpastasPermitidas: ["src", "tests", "docs", "example"],
    arquivosRaizPermitidos: ["deno.json", "deno.jsonc", "readme.md"],
    incluiVersao: false,
    instrucaoCustomizada: "O texto abaixo contém os arquivos de configuração e execução do ROUTER @loco/router",
    default: false, // ❌ Só roda quando solicitado explicitamente
  },
};

// ============================================================================
// 🎯 PARSING DE ARGUMENTOS CLI
// ============================================================================

/**
 * Parseia os argumentos da CLI e determina quais modos devem ser executados.
 * 
 * Regras:
 * - Sem args: executa todos os modos com `default !== false`
 * - Com args: executa apenas os modos solicitados (na ordem do CONFIG)
 * - Args desconhecidos são ignorados
 * 
 * @param args - Argumentos da CLI
 * @returns Array de modos a serem executados (na ordem do CONFIG)
 */
function parseArgs(args: string[]): ModoExportacao[] {
  const configKeys = Object.keys(CONFIGURACOES) as ModoExportacao[];
  
  // Normaliza args para lowercase
  const lowerArgs = args.map(a => a.toLowerCase());
  
  // Filtra args válidos (que existem no CONFIG)
  const requestedModos = lowerArgs.filter(
    arg => configKeys.includes(arg as ModoExportacao)
  ) as ModoExportacao[];
  
  // Se nenhum modo foi solicitado, usa os defaults
  if (requestedModos.length === 0) {
    return configKeys.filter(modo => {
      const config = CONFIGURACOES[modo];
      return config.default !== false;
    });
  }
  
  // Retorna na ordem do CONFIG (não na ordem da CLI)
  return configKeys.filter(modo => requestedModos.includes(modo));
}

// ============================================================================
// 🚀 EXECUÇÃO DE UM MODO ESPECÍFICO
// ============================================================================

async function exportarModo(modo: ModoExportacao): Promise<void> {
  const config = CONFIGURACOES[modo];
  const versaoDisplay = config.incluiVersao ? `[v${APP_VERSION}] ` : "";
  
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📦 EXPORTANDO MODO: ${modo.toUpperCase()} ${versaoDisplay}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`📄 Arquivo de saída: ${config.arquivoSaida}`);
  console.log(`📁 Pasta base: ${config.pastaBase}`);
  
  // Gera o cabeçalho do snapshot
  let conteudoFinal = gerarCabecalho(config, modo, APP_VERSION);
  
  let arquivosIncluidos = 0;
  
  // Varre o diretório atual e filtra os arquivos
  for await (const entry of walk(".", { includeDirs: false })) {
    const caminhoRelativo = relative(".", entry.path);
    
    if (deveIncluirArquivo(caminhoRelativo, config)) {
      try {
        console.log(`   ✅ Incluindo: ${caminhoRelativo}`);
        const conteudoArquivo = await Deno.readTextFile(entry.path);
        conteudoFinal += formatarArquivoMarkdown(caminhoRelativo, conteudoArquivo);
        arquivosIncluidos++;
      } catch (erro) {
        if (erro instanceof Error) {
          console.error(`   ❌ Erro ao ler ${caminhoRelativo}:`, erro.message);
        }
      }
    }
  }
  
  // Escreve o arquivo final
  await Deno.writeTextFile(config.arquivoSaida, conteudoFinal);
  console.log(`\n✨ Modo ${modo.toUpperCase()} concluído: ${arquivosIncluidos} arquivos exportados para ${config.arquivoSaida}`);
}

// ============================================================================
// 🚀 EXECUÇÃO PRINCIPAL
// ============================================================================

if (import.meta.main) {
  const startTime = performance.now();
  
  // Parseia args e determina quais modos executar
  const modosParaExecutar = parseArgs(Deno.args);
  
  console.log("\n🚀 Iniciando Exportação de Contexto Loco");
  console.log(`📋 Modos a exportar: ${modosParaExecutar.join(", ")}`);
  console.log(`📌 Versão: v${APP_VERSION}\n`);
  
  if (modosParaExecutar.length === 0) {
    console.log("⚠️ Nenhum modo para executar. Verifique as configurações de 'default' no CONFIG.");
    Deno.exit(0);
  }
  
  // Executa cada modo sequencialmente
  for (const modo of modosParaExecutar) {
    try {
      await exportarModo(modo);
    } catch (error) {
      console.error(`\n🛑 Erro ao exportar modo ${modo}:`, error);
      Deno.exit(1);
    }
  }
  
  const elapsed = (performance.now() - startTime).toFixed(0);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🎉 EXPORTAÇÃO CONCLUÍDA COM SUCESSO!`);
  console.log(`⏱️ Tempo total: ${elapsed}ms`);
  console.log(`${"=".repeat(60)}\n`);
}
```

---

## Arquivo: `esbuild.ts`

```ts
/// <reference lib="deno.ns" />
 import * as esbuild from "esbuild";
 import { denoPlugin } from "@deno/esbuild-plugin";
 import {
   parseArgs,
   currentVersion,
   incrementVersion,
   processTarget,
   listAssetsForCache,
   copyStaticFiles,
   buildEsbuildOptions
 } from "@loco/utils/build";
 import type { GlobalTargetConfig } from "@loco/utils/interfaces";

  const DENO_JSONC_PATH = "deno.jsonc";
 
 // ============================================================================
 // 🔌 WRAPPER ESBUILD COM PLUGIN DENO
 // ============================================================================
 /**
  * Wrapper que injeta o @deno/esbuild-plugin automaticamente em todas as builds.
  *
  * Isso permite que o esbuild nativo resolva imports no estilo Deno:
  * - jsr:@std/...
  * - npm:package@version
  * - https://esm.sh/...
  *
  * A injeção é feita aqui (no script específico do projeto) e não no
  * @loco/utils/build para manter o pacote de utils genérico e reutilizável.
  */
 const buildWithDenoPlugin = async (options: any): Promise<any> => {
   options.plugins = [...(options.plugins || []), denoPlugin({ "configPath" : DENO_JSONC_PATH })];
   return esbuild.build(options);
 };
 
 // ============================================================================
 // 📦 CONFIGURAÇÃO DECLARATIVA DE BUILDS (específica do Loco)
 // ============================================================================
 const CONFIG: GlobalTargetConfig = {
   // ------------------------------------------------------------------
   // 🎯 ALVOS DE BUILD (rodam por padrão)
   // ------------------------------------------------------------------
   ui: {
     mode: 'build',
     default: true,
     srcdir: "monorepo/ui/src",
     distdir: "monorepo/server/build/dist",
     publicdir: "monorepo/ui/public",
     indexHtml: true,
     clean: ["."],
     entryPoints: ["monorepo/ui/src/app.tsx"],
     platform: "browser",
     format: "esm",
     bundle: true,
     minify: false,
     sourcemap: "linked",
     conditions: ["browser"],
     drop: ["debugger"],
     jsx: "automatic",
     jsxImportSource: "preact",
     metafile: true,
     write: true,
     legalComments: "none",
     banner: {
       js: `/* Loco v__APP_VERSION__ */\n`,
     },
   },
   worker: {
     mode: 'build',
     default: true,
     srcdir: "monorepo/ui/src",
     distdir: "monorepo/server/build/dist",
     clean: ["opfs.worker.js", "opfs.worker.js.map"],
     entryPoints: ["monorepo/ui/src/worker/opfs.worker.ts"],
     platform: "browser",
     format: "iife",
     bundle: true,
     minify: false,
     sourcemap: "linked",
     drop: ["debugger"],
     conditions: ["worker"],
     metafile: true,
     write: true,
     legalComments: "none",
     banner: {
       js: `/* Loco v__APP_VERSION__ */\n`,
     },
   },
   sw: {
     mode: 'build',
     default: true,
     srcdir: "monorepo/service-worker/src",
     distdir: "monorepo/server/build/dist",
     clean: ["service-worker.js", "service-worker.js.map"],
     entryPoints: ["monorepo/service-worker/src/service-worker.ts"],
     platform: "browser",
     format: "iife",
     bundle: true,
     minify: false,
     sourcemap: "linked",
     drop: ["debugger"],
     conditions: ["worker"],
     metafile: true,
     write: true,
     legalComments: "none",
     banner: {
       js: `/* Loco v__APP_VERSION__ */\n`,
     },
   },
   server: {
    mode: 'build',
     default: true,
     srcdir: "monorepo/server/src",
     distdir: "monorepo/server/build",
     clean: ["worker.js", "worker.js.map", "functions"],
     entryPoints: [
        "monorepo/server/src/worker.ts", 
        "monorepo/server/src/functions/ping.ts",
        "monorepo/server/src/functions/publickey.ts",
        "monorepo/server/src/functions/push.ts",
      ],
     platform: "browser",
     format: "esm",
     bundle: true,
     minify: false,
     sourcemap: "linked",
     drop: ["debugger"],
     conditions: ["worker"],
     metafile: true,
     write: true,
     legalComments: "none",
     indexHtml: false,
     keepNames: true,
     splitting: false,
     banner: {
       js: `/* Loco v__APP_VERSION__ */\n`,
     },
   },
   // ------------------------------------------------------------------
   // 👀 ALVOS WATCH (modo de desenvolvimento contínuo)
   // ------------------------------------------------------------------
   'watch': {
     mode: 'watch',
     default: false,
     srcdir: "monorepo/ui/src",
     distdir: "monorepo/server/build/dist",
     publicdir: "monorepo/ui/public",
     indexHtml: true,
     entryPoints: ["monorepo/ui/src/app.tsx"],
     platform: "browser",
     format: "esm",
     bundle: true,
     minify: false,
     sourcemap: "inline",
     conditions: ["browser"],
     jsx: "automatic",
     jsxImportSource: "preact",
     write: true,
     legalComments: "none",
     outfile: "monorepo/server/build/dist/app.js",
     banner: {
       js: `/* Loco v__APP_VERSION__ */\n`,
     },
   },
   playground: {
     mode: 'watch',
     default: false,
     srcdir: "monorepo/playground/src",
     distdir: "monorepo/playground/build/dist",
     publicdir: "monorepo/playground/public",
     indexHtml: true,
     clean: ["."],
     entryPoints: ["monorepo/playground/src/main.tsx"],
     outfile: "monorepo/playground/build/dist/main.js",
     platform: "browser",
     format: "esm",
     bundle: true,
     minify: false,
     sourcemap: "inline",
     conditions: ["browser"],
     drop: ["debugger"],
     jsx: "automatic",
     jsxImportSource: "preact",
     metafile: true,
     write: true,
     legalComments: "none",
     banner: {
       js: `/* Loco Playground v__APP_VERSION__ */\n`,
     },
   },
 };
 
 // ============================================================================
 // 🚀 PIPELINE PRINCIPAL
 // ============================================================================

 
 async function build() {
   const start = performance.now();
   const { targets, globalNoVersion, watchTarget } = parseArgs(Deno.args, CONFIG);
 
   console.log("\n🚀 Iniciando Orquestrador de Build Loco (esbuild nativo + @deno/esbuild-plugin)");
   if (watchTarget) {
     console.log(`👀 Modo Watch ativo: ${watchTarget}`);
   } else {
     console.log(`📋 Alvos de build (ordem segura do CONFIG): ${targets.join(", ") || "(nenhum)"}`);
   }
   console.log(`🔒 Noversion: ${globalNoVersion}\n`);
 
   try {
     // Obter versão atual
     const currentVer = await currentVersion(DENO_JSONC_PATH);
 
     // Modo watch: apenas o alvo watch é executado
     if (watchTarget) {
       await startWatchMode(watchTarget, currentVer);
       return;
     }
 
     // Build normal: incrementa versão (se aplicável)
     const finalVersion = globalNoVersion
       ? currentVer
       : await incrementVersion(currentVer, DENO_JSONC_PATH);
 
     // Processar cada alvo de build
     for (const targetName of targets) {
       const targetConfig = CONFIG[targetName];
       if (!targetConfig) {
         console.warn(`⚠️ Alvo '${targetName}' não encontrado no CONFIG. Pulando.`);
         continue;
       }
 
       await processTarget(
         targetName,
         targetConfig,
         finalVersion,
         buildWithDenoPlugin,
         listAssetsForCache
       );
     }
 
     console.log(`\n${"=".repeat(60)}`);
     console.log(`🎉 ORQUESTRAÇÃO CONCLUÍDA COM SUCESSO!`);
     console.log(`${"=".repeat(60)}`);
   } catch (error) {
     console.error("\n🛑 Pipeline de build falhou:", error);
     Deno.exit(1);
   } finally {
     const elapsed = (performance.now() - start).toFixed(0);
     console.log(`\n⏱️ Tempo total: ${elapsed}ms\n`);
   }
 }
 
 async function startWatchMode(watchTargetName: string, currentVer: string) {
   const config = CONFIG[watchTargetName];
   if (!config) {
     throw new Error(`❌ Alvo watch '${watchTargetName}' não encontrado no CONFIG`);
   }
 
   console.log(`\n👀 Iniciando Watch Mode: ${watchTargetName}\n`);
 
   // Copiar arquivos estáticos uma vez
   await copyStaticFiles(config, currentVer);
 
   // Construir opções do esbuild
   const esbuildOptions = await buildEsbuildOptions(watchTargetName, config, currentVer);
 
   // 🔥 INJETAR PLUGIN DENO
   esbuildOptions.plugins = [...(esbuildOptions.plugins || []), denoPlugin()];
 
   // Criar contexto e ativar watch
   const ctx = await esbuild.context(esbuildOptions);
   await ctx.watch();
 
   console.log("\n✅ Watch mode ativo!");
   console.log(`📁 Monitorando: ${config.srcdir}/`);
   console.log(`📦 Output: ${config.outfile || config.distdir}/`);
   console.log(`📌 Versão: v${currentVer}`);
   console.log("\n💡 Pressione Ctrl+C para parar.\n");
 
   // Mantém o processo vivo
   await new Promise(() => {});
 }
 
 await build();
```

---

## Arquivo: `build.ts`

```ts
/// <reference lib="deno.ns" />
/**
 * @file build.ts
 * @description Build alternativo usando Deno.bundle API nativa (--unstable-bundle)
 *
 * Este é um script ALTERNATIVO ao esbuild.ts oficial do Loco.
 * Usa a API nativa Deno.bundle() sem dependências externas.
 *
 * Toda a lógica de processamento está em @loco/utils/build (bundle.ts).
 * Este arquivo contém apenas:
 * 1. CONFIG declarativo dos alvos
 * 2. Orquestração do pipeline
 *
 * Uso:
 *   deno run --unstable-bundle -A ./build.ts
 *   deno run --unstable-bundle -A ./build.ts ui sw
 *   deno run --unstable-bundle -A ./build.ts noversion
 */

import {
  parseArgs,
  currentVersion,
  incrementVersion,
  listAssetsForCache,
  processBundleTarget,
} from "@loco/utils/build";
import type { DenoBundleGlobalConfig } from "@loco/utils/interfaces";

// ============================================================================
// 📦 CONFIGURAÇÃO DECLARATIVA DE BUILDS
// ============================================================================

const CONFIG: DenoBundleGlobalConfig = {
  ui: {
    mode: "build",
    default: true,
    srcdir: "monorepo/ui/src",
    distdir: "monorepo/server/build/dist",
    publicdir: "monorepo/ui/public",
    indexHtml: true,
    clean: ["."],
    entryPoints: ["monorepo/ui/src/app.tsx"],
    platform: "browser",
    format: "esm",
    minify: false,
    sourcemap: "linked",
  },
  worker: {
    mode: "build",
    default: true,
    srcdir: "monorepo/ui/src",
    distdir: "monorepo/server/build/dist",
    clean: ["opfs.worker.js", "opfs.worker.js.map"],
    entryPoints: ["monorepo/ui/src/worker/opfs.worker.ts"],
    platform: "browser",
    format: "iife",
    minify: false,
  },
  sw: {
    mode: "build",
    default: true,
    srcdir: "monorepo/service-worker/src",
    distdir: "monorepo/server/build/dist",
    clean: ["service-worker.js", "service-worker.js.map"],
    entryPoints: ["monorepo/service-worker/src/service-worker.ts"],
    platform: "browser",
    format: "iife",
    minify: false,
  },
  server: {
    mode: 'build',
     default: true,
     srcdir: "monorepo/server/src",
     distdir: "monorepo/server/build",
     clean: ["worker.js", "worker.js.map", "functions"],
     entryPoints: [
        "monorepo/server/src/worker.ts", 
        "monorepo/server/src/functions/ping.ts",
        "monorepo/server/src/functions/publickey.ts",
        "monorepo/server/src/functions/push.ts",
      ],
     platform: "browser",
     format: "esm",
     minify: false,
     sourcemap: "linked",
     indexHtml: false,
     keepNames: true,
     codeSplitting: false,
     packages: "bundle",
     inlineImports: true,
   },
  playground: {
    mode: "build",
    default: false,
    srcdir: "monorepo/playground/src",
    distdir: "monorepo/playground/build/dist",
    publicdir: "monorepo/playground/public",
    indexHtml: true,
    clean: ["."],
    entryPoints: ["monorepo/playground/src/main.tsx"],
    outfile: "monorepo/playground/build/dist/main.js",
    platform: "browser",
    format: "esm",
    minify: false,
    sourcemap: "linked",
  },
};

// ============================================================================
// 🚀 PIPELINE PRINCIPAL
// ============================================================================

const DENO_JSONC_PATH = "deno.jsonc";

async function build() {
  const start = performance.now();
  const { targets, globalNoVersion, watchTarget } = parseArgs(
    Deno.args,
    CONFIG,
  );

  console.log("\n🚀 Iniciando Orquestrador de Build Loco (Deno.bundle API)");
  console.log(`   📦 Motor: Deno.bundle (nativo, --unstable-bundle)`);

  // ⚠️ Watch mode não suportado — emite aviso e encerra
  if (watchTarget) {
    console.log(
      `\n⚠️ AVISO: Modo Watch não suportado pelo Deno.bundle API.`,
    );
    console.log(`   O alvo '${watchTarget}' foi ignorado.`);
    console.log(
      `   Para watch mode, use o build oficial: deno task build watch`,
    );
    console.log(
      `   (que utiliza esbuild com suporte a esbuild.context().watch())\n`,
    );
    Deno.exit(0);
  }

  console.log(`   📋 Alvos: ${targets.join(", ") || "(nenhum)"}`);
  console.log(`   🔒 Noversion: ${globalNoVersion}\n`);

  if (targets.length === 0) {
    console.log("⚠️ Nenhum alvo para processar.");
    Deno.exit(0);
  }

  try {
    // Obter versão atual
    const currentVer = await currentVersion(DENO_JSONC_PATH);

    // Incrementar versão (se aplicável)
    const finalVersion = globalNoVersion
      ? currentVer
      : await incrementVersion(currentVer, DENO_JSONC_PATH);

    // Processar cada alvo de build na ordem do CONFIG
    for (const targetName of targets) {
      const targetConfig = CONFIG[targetName];
      if (!targetConfig) {
        console.warn(
          `⚠️ Alvo '${targetName}' não encontrado no CONFIG. Pulando.`,
        );
        continue;
      }

      // Para o SW, passa a função de listagem de assets
      const listFn = targetName === "sw" ? listAssetsForCache : undefined;
      await processBundleTarget(targetName, targetConfig, finalVersion, listFn);
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`🎉 ORQUESTRAÇÃO CONCLUÍDA COM SUCESSO!`);
    console.log(`${"=".repeat(60)}`);
  } catch (error) {
    console.error("\n🛑 Pipeline de build falhou:", error);
    Deno.exit(1);
  } finally {
    const elapsed = (performance.now() - start).toFixed(0);
    console.log(`\n⏱️ Tempo total: ${elapsed}ms\n`);
  }
}

if (import.meta.main) {
  await build();
}
```

---

