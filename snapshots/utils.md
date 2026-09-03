> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém experimentos e código da área de @loco/utils
> O projeto é o **Loco ** estruturado em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco - Modo: UTILS

Gerado automaticamente em: 9/3/2026, 12:19:25 AM

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
import { join } from "@std/path";
import { buildEsbuildOptions } from "../../src/esbuild/mod.ts";
import type { TargetConfig } from "../../src/interfaces/mod.ts";
import { withFileStructure } from "../helpers/fixtures.ts";

// Helper para criar config mínima válida com paths que existem
function makeConfig(dir: string, overrides: Partial<TargetConfig> = {}): TargetConfig {
  return {
    srcdir: join(dir, "src"),
    distdir: "dist",
    entryPoints: ["main.tsx"],
    ...overrides,
  } as TargetConfig;
}

describe("buildEsbuildOptions", () => {
  describe("configuração básica", () => {
    it("usa outfile quando definido", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir, { outfile: "app.js" });
        const options = await buildEsbuildOptions("ui", config, "1.0.0");
        assertEquals(options.outfile, "dist/app.js");
        assertEquals(options.outdir, undefined);
      } finally {
        await cleanup();
      }
    });
    it("usa distdir como outdir quando outfile não definido", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir, { distdir: "monorepo/dist" });
        const options = await buildEsbuildOptions("ui", config, "1.0.0");
        assertEquals(options.outdir, "monorepo/dist");
        assertEquals(options.outfile, undefined);
      } finally {
        await cleanup();
      }
    });
    it("entryPoints é sempre preservado", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/a.ts": "", "src/b.ts": "" });
      try {
        const config = makeConfig(dir, { entryPoints: ["a.ts", "b.ts"] });
        const options = await buildEsbuildOptions("ui", config, "1.0.0");
        assertEquals(options.entryPoints, [join(dir, "src", "a.ts"), join(dir, "src", "b.ts")]);
      } finally {
        await cleanup();
      }
    });
  });
  describe("propriedades opcionais", () => {
    it("inclui platform quando definido", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir, { platform: "browser" });
        const options = await buildEsbuildOptions("ui", config, "1.0.0");
        assertEquals(options.platform, "browser");
      } finally {
        await cleanup();
      }
    });
    it("omite propriedades undefined", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir);
        const options = await buildEsbuildOptions("ui", config, "1.0.0");
        assertEquals(options.platform, undefined);
        assertEquals(options.minify, undefined);
      } finally {
        await cleanup();
      }
    });
    it("inclui todas as propriedades configuradas", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir, {
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
      } finally {
        await cleanup();
      }
    });
  });
  describe("define", () => {
    it("injeta __APP_VERSION__ com v", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir);
        const options = await buildEsbuildOptions("ui", config, "1.2.3-abc");
        assertEquals(options.define.__APP_VERSION__, '"v1.2.3-abc"');
      } finally {
        await cleanup();
      }
    });
    it("preserva defines customizados do config", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir, {
          define: {
            "__FEATURE_X__": "true",
            "__API_URL__": '"https://api.example.com"',
          },
        });
        const options = await buildEsbuildOptions("ui", config, "1.0.0");
        assertEquals(options.define.__FEATURE_X__, "true");
        assertEquals(options.define.__API_URL__, '"https://api.example.com"');
        assertEquals(options.define.__APP_VERSION__, '"v1.0.0"');
      } finally {
        await cleanup();
      }
    });
  });
  describe("banner e footer", () => {
    it("substitui __APP_VERSION__ no banner", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir, {
          banner: {
            js: "/* Loco v__APP_VERSION__ */\n",
          },
        });
        const options = await buildEsbuildOptions("ui", config, "2.0.0");
        assertStringIncludes(options.banner.js, "Loco v2.0.0");
      } finally {
        await cleanup();
      }
    });
    it("substitui múltiplas ocorrências de __APP_VERSION__", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir, {
          banner: {
            js: "/* __APP_VERSION__ build __APP_VERSION__ */",
          },
        });
        const options = await buildEsbuildOptions("ui", config, "1.0.0");
        assertEquals(options.banner.js.includes("__APP_VERSION__"), false);
      } finally {
        await cleanup();
      }
    });
    it("substitui __APP_VERSION__ no CSS também", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir, {
          banner: {
            css: "/* CSS __APP_VERSION__ */",
          },
        });
        const options = await buildEsbuildOptions("ui", config, "1.0.0");
        assertStringIncludes(options.banner.css, "CSS 1.0.0");
      } finally {
        await cleanup();
      }
    });
    it("substitui __APP_VERSION__ no footer", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir, {
          footer: {
            js: "/* End __APP_VERSION__ */",
          },
        });
        const options = await buildEsbuildOptions("ui", config, "1.0.0");
        assertStringIncludes(options.footer.js, "End 1.0.0");
      } finally {
        await cleanup();
      }
    });
    it("lida com banner sem js", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir, {
          banner: { css: "/* css only __APP_VERSION__ */" },
        });
        const options = await buildEsbuildOptions("ui", config, "1.0.0");
        assertEquals(options.banner.js, undefined);
        assertStringIncludes(options.banner.css, "1.0.0");
      } finally {
        await cleanup();
      }
    });
  });
  describe("lógica especial para SW", () => {
    it("injeta __GENERATED_ASSETS__ quando targetName é 'sw'", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir);
        const mockListFn = async () => ["./app.js", "./index.html"];
        const options = await buildEsbuildOptions("sw", config, "1.0.0", mockListFn);
        const assets = JSON.parse(options.define.__GENERATED_ASSETS__);
        assertEquals(assets, ["./app.js", "./index.html"]);
      } finally {
        await cleanup();
      }
    });
    it("não injeta __GENERATED_ASSETS__ para outros alvos", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir);
        const mockListFn = async () => ["./app.js"];
        const options = await buildEsbuildOptions("ui", config, "1.0.0", mockListFn);
        assertEquals(options.define.__GENERATED_ASSETS__, undefined);
      } finally {
        await cleanup();
      }
    });
    it("não injeta __GENERATED_ASSETS__ se listFn não fornecida", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir);
        const options = await buildEsbuildOptions("sw", config, "1.0.0");
        assertEquals(options.define.__GENERATED_ASSETS__, undefined);
      } finally {
        await cleanup();
      }
    });
  });
  describe("novas opções (1-13)", () => {
    it("inclui splitting", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir, { splitting: true });
        const options = await buildEsbuildOptions("ui", config, "1.0.0");
        assertEquals(options.splitting, true);
      } finally {
        await cleanup();
      }
    });
    it("inclui loader customizado", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir, {
          loader: { ".png": "file", ".svg": "dataurl" },
        });
        const options = await buildEsbuildOptions("ui", config, "1.0.0");
        assertEquals(options.loader[".png"], "file");
      } finally {
        await cleanup();
      }
    });
    it("inclui alias", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir, {
          alias: { "@": "./src", "moment": "dayjs" },
        });
        const options = await buildEsbuildOptions("ui", config, "1.0.0");
        assertEquals(options.alias["@"], "./src");
        assertEquals(options.alias.moment, "dayjs");
      } finally {
        await cleanup();
      }
    });
    it("inclui inject", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir, {
          inject: ["./polyfills.ts"],
        });
        const options = await buildEsbuildOptions("ui", config, "1.0.0");
        assertEquals(options.inject, ["./polyfills.ts"]);
      } finally {
        await cleanup();
      }
    });
    it("inclui target como string", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir, { target: "es2022" });
        const options = await buildEsbuildOptions("ui", config, "1.0.0");
        assertEquals(options.target, "es2022");
      } finally {
        await cleanup();
      }
    });
    it("inclui target como array", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir, { target: ["es2022", "chrome90"] });
        const options = await buildEsbuildOptions("ui", config, "1.0.0");
        assertEquals(options.target, ["es2022", "chrome90"]);
      } finally {
        await cleanup();
      }
    });
    it("inclui drop", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir, { drop: ["console", "debugger"] });
        const options = await buildEsbuildOptions("ui", config, "1.0.0");
        assertEquals(options.drop, ["console", "debugger"]);
      } finally {
        await cleanup();
      }
    });
    it("inclui pure", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir, { pure: ["console.log"] });
        const options = await buildEsbuildOptions("ui", config, "1.0.0");
        assertEquals(options.pure, ["console.log"]);
      } finally {
        await cleanup();
      }
    });
    it("inclui logLevel", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir, { logLevel: "warning" });
        const options = await buildEsbuildOptions("ui", config, "1.0.0");
        assertEquals(options.logLevel, "warning");
      } finally {
        await cleanup();
      }
    });
    it("inclui entryNames/chunkNames/assetNames", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir, {
          entryNames: "[name]-[hash]",
          chunkNames: "chunks/[name]",
          assetNames: "assets/[name]",
        });
        const options = await buildEsbuildOptions("ui", config, "1.0.0");
        assertEquals(options.entryNames, "[name]-[hash]");
        assertEquals(options.chunkNames, "chunks/[name]");
        assertEquals(options.assetNames, "assets/[name]");
      } finally {
        await cleanup();
      }
    });
  });
  describe("plugins", () => {
    it("inclui plugins quando definidos na config", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const mockPlugin = { name: "test-plugin", setup: () => {} };
        const config = makeConfig(dir, { plugins: [mockPlugin] });
        const options = await buildEsbuildOptions("ui", config, "1.0.0");
        assertEquals(options.plugins, [mockPlugin]);
        assertEquals(options.plugins.length, 1);
        assertEquals(options.plugins[0].name, "test-plugin");
      } finally {
        await cleanup();
      }
    });
    it("inclui múltiplos plugins na ordem definida", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const plugin1 = { name: "plugin-1", setup: () => {} };
        const plugin2 = { name: "plugin-2", setup: () => {} };
        const config = makeConfig(dir, { plugins: [plugin1, plugin2] });
        const options = await buildEsbuildOptions("ui", config, "1.0.0");
        assertEquals(options.plugins.length, 2);
        assertEquals(options.plugins[0].name, "plugin-1");
        assertEquals(options.plugins[1].name, "plugin-2");
      } finally {
        await cleanup();
      }
    });
    it("omite plugins quando não definidos (undefined)", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir);
        const options = await buildEsbuildOptions("ui", config, "1.0.0");
        assertEquals(options.plugins, undefined);
      } finally {
        await cleanup();
      }
    });
    it("omite plugins quando array vazio", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const config = makeConfig(dir, { plugins: [] });
        const options = await buildEsbuildOptions("ui", config, "1.0.0");
        assertEquals(options.plugins, []);
      } finally {
        await cleanup();
      }
    });
    it("plugins são independentes de outras opções", async () => {
      const { dir, cleanup } = await withFileStructure({ "src/main.tsx": "" });
      try {
        const mockPlugin = { name: "my-plugin", setup: () => {} };
        const config = makeConfig(dir, {
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
      } finally {
        await cleanup();
      }
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
      "dummy.ts": "// dummy",
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
    const { dir: srcDir, cleanup: cleanupSrc } = await withFileStructure({
      "dummy.ts": "// dummy",
    });
    const { dir: distDir, cleanup: cleanupDist } = await withFileStructure({});
    try {
      const config: TargetConfig = {
        srcdir: srcDir,
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
      await cleanupSrc();
      await cleanupDist();
    }
  });

  it("não salva metafile quando metafile é false", async () => {
    const { dir: srcDir, cleanup: cleanupSrc } = await withFileStructure({
      "dummy.ts": "// dummy",
    });
    const { dir: distDir, cleanup: cleanupDist } = await withFileStructure({});
    try {
      const config: TargetConfig = {
        srcdir: srcDir,
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
      await cleanupSrc();
      await cleanupDist();
    }
  });

  it("propaga erro do esbuild.build", async () => {
    const { dir: srcDir, cleanup: cleanupSrc } = await withFileStructure({
      "dummy.ts": "// dummy",
    });
    const { dir: distDir, cleanup: cleanupDist } = await withFileStructure({});
    try {
      const config: TargetConfig = {
        srcdir: srcDir,
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
      await cleanupSrc();
      await cleanupDist();
    }
  });

  it("usa outfile quando especificado", async () => {
    const { dir: srcDir, cleanup: cleanupSrc } = await withFileStructure({
      "dummy.ts": "// dummy",
    });
    const { dir: distDir, cleanup: cleanupDist } = await withFileStructure({});
    try {
      const config: TargetConfig = {
        srcdir: srcDir,
        distdir: distDir,
        entryPoints: ["dummy.ts"],
        outfile: "custom-name.js",
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
      await cleanupSrc();
      await cleanupDist();
    }
  });

  it("lida com SW injetando assets via listFn", async () => {
    const { dir: srcDir, cleanup: cleanupSrc } = await withFileStructure({
      "sw.ts": "// sw",
    });
    const { dir: distDir, cleanup: cleanupDist } = await withFileStructure({
      "app.js": "code",
      "index.html": "html",
      "service-worker.js": "sw",
    });
    try {
      const config: TargetConfig = {
        srcdir: srcDir,
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
      await cleanupSrc();
      await cleanupDist();
    }
  });
});
```

---

## Arquivo: `monorepo/utils/tests/esbuild/output-paths.test.ts`

```ts
/// <reference lib="deno.ns" />
import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows, assertStringIncludes } from "@std/assert";
import { 
  validateTargetConfig, 
  resolveOutputPaths 
} from "../../src/esbuild/mod.ts";
import type { TargetConfig } from "../../src/interfaces/mod.ts";

describe("validateTargetConfig", () => {
  describe("distdir obrigatório", () => {
    it("lança erro quando publicdir existe mas distdir não", () => {
      const config: TargetConfig = {
        srcdir: "src",
        publicdir: "public",
        entryPoints: ["app.tsx"],
      };
      assertThrows(
        () => validateTargetConfig("ui", config),
        Error,
        "'distdir'"
      );
    });
    it("lança erro quando indexHtml é true mas distdir não", () => {
      const config: TargetConfig = {
        srcdir: "src",
        indexHtml: true,
        entryPoints: ["app.tsx"],
      };
      assertThrows(
        () => validateTargetConfig("ui", config),
        Error,
        "'distdir'"
      );
    });
    it("lança erro quando outfile não existe e distdir não", () => {
      const config: TargetConfig = {
        srcdir: "src",
        entryPoints: ["app.tsx"],
      };
      assertThrows(
        () => validateTargetConfig("ui", config),
        Error,
        "'distdir'"
      );
    });
    it("NÃO lança erro quando outfile existe mas distdir não", () => {
      const config: TargetConfig = {
        srcdir: "src",
        outfile: "/absolute/path/app.js",
        entryPoints: ["app.tsx"],
      };
      // Não deve lançar
      validateTargetConfig("ui", config);
    });
    it("NÃO lança erro quando distdir existe", () => {
      const config: TargetConfig = {
        srcdir: "src",
        distdir: "dist",
        entryPoints: ["app.tsx"],
      };
      validateTargetConfig("ui", config);
    });
  });

  describe("mensagens de erro didáticas", () => {
    it("lista todos os motivos quando múltiplas condições falham", () => {
      const config: TargetConfig = {
        srcdir: "src",
        publicdir: "public",
        indexHtml: true,
        entryPoints: ["app.tsx"],
      };
      try {
        validateTargetConfig("ui", config);
      } catch (e) {
        const msg = (e as Error).message;
        assertStringIncludes(msg, "'publicdir' está configurado");
        assertStringIncludes(msg, "'indexHtml' é true");
        assertStringIncludes(msg, "'outfile' não está configurado");
      }
    });
  });
});

describe("resolveOutputPaths", () => {
  describe("outfile relativo ao distdir", () => {
    it("faz join quando ambos existem", () => {
      const config: TargetConfig = {
        srcdir: "src",
        distdir: "monorepo/server/build/dist",
        outfile: "app.js",
        entryPoints: ["app.tsx"],
      };
      const result = resolveOutputPaths(config);
      assertEquals(result.outfile, "monorepo/server/build/dist/app.js");
      assertEquals(result.outdir, undefined);
    });
    it("faz join com subdiretórios", () => {
      const config: TargetConfig = {
        srcdir: "src",
        distdir: "dist",
        outfile: "js/app.js",
        entryPoints: ["app.tsx"],
      };
      const result = resolveOutputPaths(config);
      assertEquals(result.outfile, "dist/js/app.js");
    });
  });

  describe("outfile absoluto (sem distdir)", () => {
    it("mantém outfile como está quando distdir não existe", () => {
      const config: TargetConfig = {
        srcdir: "src",
        outfile: "/absolute/path/app.js",
        entryPoints: ["app.tsx"],
      };
      const result = resolveOutputPaths(config);
      assertEquals(result.outfile, "/absolute/path/app.js");
      assertEquals(result.outdir, undefined);
    });
  });

  describe("distdir como outdir (sem outfile)", () => {
    it("usa distdir como outdir quando outfile não existe", () => {
      const config: TargetConfig = {
        srcdir: "src",
        distdir: "dist",
        entryPoints: ["app.tsx"],
      };
      const result = resolveOutputPaths(config);
      assertEquals(result.outdir, "dist");
      assertEquals(result.outfile, undefined);
    });
  });

  describe("nenhum configurado", () => {
    it("retorna objeto vazio", () => {
      const config: TargetConfig = {
        srcdir: "src",
        entryPoints: ["app.tsx"],
      };
      const result = resolveOutputPaths(config);
      assertEquals(result.outfile, undefined);
      assertEquals(result.outdir, undefined);
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
   srcdir?: string;
   distdir?: string;
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
  srcdir?: string;

  /** Diretório de destino (onde o bundle será escrito) */
  distdir?: string;

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
  const trimmed = version.trim();
  if (trimmed !== version) {
    throw new Error(`❌ Versão não pode ter espaços: ${version}`);
  }
  const versionWithoutHash = version.split("-")[0] ?? "";
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
// 🎯 VALIDAÇÃO DE CONFIGURAÇÃO DO ALVO (fail-fast com mensagens claras)
// ============================================================================
/**
 * Valida se a configuração do alvo possui os campos obrigatórios para as operações solicitadas.
 * Lança erro com mensagem didática indicando exatamente qual condição falhou.
 * 
 * Regras de obrigatoriedade:
 * - 'distdir' é obrigatório quando 'publicdir' está configurado, 'indexHtml' é true, ou 'outfile' não está configurado
 * - 'srcdir' é obrigatório quando 'indexHtml' é true ou quando 'entryPoints' contém paths relativos
 */
export function validateTargetConfig(
  targetName: string, 
  config: TargetConfig | DenoBundleTargetConfig
): void {
  const reasons: string[] = [];
  
  // Validação de distdir
  if (config.publicdir && !config.distdir) {
    reasons.push("'publicdir' está configurado (necessário 'distdir' para copiar arquivos estáticos)");
  }
  if (config.indexHtml === true && !config.distdir) {
    reasons.push("'indexHtml' é true (necessário 'distdir' para copiar o HTML)");
  }
  if (!config.outfile && !config.distdir) {
    reasons.push("'outfile' não está configurado (necessário 'distdir' para usar como 'outdir')");
  }
  
  // Validação de srcdir
  if (config.indexHtml === true && !config.srcdir) {
    reasons.push("'indexHtml' é true (necessário 'srcdir' para copiar o HTML)");
  }
  
  // Verifica se algum entrypoint é relativo e srcdir não existe
  if (!config.srcdir && config.entryPoints && config.entryPoints.length > 0) {
    const hasRelativeEntry = config.entryPoints.some(entry => !isAbsolute(entry));
    if (hasRelativeEntry) {
      reasons.push("'entryPoints' contém caminhos relativos (necessário 'srcdir' para resolver)");
    }
  }
  
  if (reasons.length > 0) {
    const missingFields: string[] = [];
    if (!config.distdir && reasons.some(r => r.includes("'distdir'"))) missingFields.push("'distdir'");
    if (!config.srcdir && reasons.some(r => r.includes("'srcdir'"))) missingFields.push("'srcdir'");
    
    throw new Error(
      `❌ [${targetName}] Configuração incompleta.\n` +
      `   Campos obrigatórios faltando: ${missingFields.join(", ")}\n` +
      `   Motivos:\n` +
      reasons.map(r => `   - ${r}`).join('\n') +
      `\n   Por favor, configure os campos necessários no alvo '${targetName}'.`
    );
  }
}

// ============================================================================
// 📍 RESOLUÇÃO DE OUTPUT PATHS (outfile relativo ao distdir)
// ============================================================================
/**
 * Resolve os caminhos de saída (outfile/outdir) baseado na configuração.
 * 
 * Regras:
 * 1. Se 'outfile' e 'distdir' existem: outfile é RELATIVO ao distdir → join(distdir, outfile)
 * 2. Se apenas 'outfile' existe (sem distdir): outfile é ABSOLUTO
 * 3. Se apenas 'distdir' existe (sem outfile): distdir é usado como outdir
 * 4. Se nenhum existe: retorna objeto vazio (não deveria acontecer se validateTargetConfig foi chamado)
 * 
 * @returns Objeto com 'outfile' ou 'outdir' resolvidos (nunca ambos)
 */
export function resolveOutputPaths(
  config: TargetConfig | DenoBundleTargetConfig
): { outfile?: string; outdir?: string } {
  if (config.outfile) {
    if (config.distdir) {
      // outfile relativo ao distdir
      return { outfile: join(config.distdir, config.outfile) };
    }
    // outfile absoluto (sem distdir)
    return { outfile: config.outfile };
  }
  // Sem outfile, usa distdir como outdir
  if (config.distdir) {
    return { outdir: config.distdir };
  }
  // Nem outfile nem distdir (não deveria chegar aqui se validateTargetConfig foi chamado)
  return {};
}

// ============================================================================
// 🎯 RESOLUÇÃO DE ENTRYPOINTS (relativo ao srcdir quando disponível)
// ============================================================================
/**
 * Resolve os entrypoints relativos ao srcdir (se disponível) e valida sua existência no disco.
 * Lança um erro claro e didático se algum arquivo não for encontrado.
 * 
 * Se srcdir não está configurado, trata todos os entrypoints como absolutos.
 */
export function resolveEntryPoints(
  srcdir: string | undefined, 
  entryPoints: string[]
): string[] {
  return entryPoints.map((entry) => {
    let resolvedPath: string;
    
    if (srcdir && !isAbsolute(entry)) {
      // srcdir existe e entry é relativo → faz join
      resolvedPath = join(srcdir, entry);
    } else {
      // srcdir não existe OU entry já é absoluto → usa como está
      resolvedPath = entry;
    }
    
    try {
      Deno.statSync(resolvedPath);
    } catch {
      throw new Error(
        `❌ Entrypoint não encontrado em: "${resolvedPath}"\n` +
        `   Origem configurada: "${entry}"\n` +
        (srcdir ? `   Verifique se o caminho está correto em relação ao srcdir: "${srcdir}".` : 
                  `   Verifique se o caminho absoluto está correto.`)
      );
    }
    
    return resolvedPath;
  });
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
    watchTarget = configKeys.find(t => config[t]!.mode === 'watch') ?? null;
  } else if (requestedTargets.length > 0) {
    const requestedWatches = requestedTargets.filter(t => config[t]!.mode === 'watch');
    if (requestedWatches.length > 0) {
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
  // 🔥 CORREÇÃO: Verifica se distDir foi fornecido antes de tentar caminhar
  if (!distDir) {
    console.warn(`⚠️ 'listAssetsForCache' chamado sem 'distDir'. Retornando array vazio.`);
    return [];
  }
  
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
  // 🔥 CORREÇÃO: Valida distdir e srcdir antes de operações
  if (!config.distdir) {
    if (config.publicdir) {
      console.warn(`⚠️ 'publicdir' configurado mas 'distdir' ausente. Pulando cópia de estáticos.`);
    }
    if (config.indexHtml) {
      console.warn(`⚠️ 'indexHtml' é true mas 'distdir' ausente. Pulando cópia do HTML.`);
    }
    return;
  }
  
  if (config.indexHtml && !config.srcdir) {
    console.warn(`⚠️ 'indexHtml' é true mas 'srcdir' ausente. Pulando cópia do HTML.`);
    return;
  }
  
  const distDir = config.distdir;
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
  
  if (config.indexHtml && config.srcdir) {
    const srcDir = config.srcdir;
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
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  const finalDefine: Record<string, string> = {
    ...config.define,
    __APP_VERSION__: JSON.stringify(`v${appVersion}`),
  };
  
  // 🔥 CORREÇÃO: Só lista assets se distdir existe
  if (targetName === "sw" && listAssetsFn && config.distdir) {
    const assets = await listAssetsFn(config.distdir);
    finalDefine["__GENERATED_ASSETS__"] = JSON.stringify(assets);
    console.log(`📋 ${assets.length} assets listados para cache do SW`);
  }

  // 🔥 RESOLUÇÃO DE ENTRYPOINTS (srcdir opcional)
  const resolvedEntryPoints = resolveEntryPoints(config.srcdir, config.entryPoints);

  // 🔥 RESOLUÇÃO DE OUTPUT PATHS (outfile relativo ao distdir)
  const { outfile, outdir } = resolveOutputPaths(config);

  // deno-lint-ignore no-explicit-any
  const options: any = {
    entryPoints: resolvedEntryPoints,
  };
  
  // 🔥 CORREÇÃO: Usa outfile resolvido ou outdir
  if (outfile) {
    options.outfile = outfile;
  } else if (outdir) {
    options.outdir = outdir;
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
    // deno-lint-ignore no-explicit-any
    if ((config as any)[prop] !== undefined) {
      // deno-lint-ignore no-explicit-any
      (options as any)[prop] = (config as any)[prop];
    }
  }
  
  // 🔥 CORREÇÃO: Construção segura de banner
  if (config.banner !== undefined) {
    const banner: { js?: string; css?: string } = {};
    if (config.banner.js !== undefined) {
      banner.js = config.banner.js.replace(/__APP_VERSION__/g, appVersion);
    }
    if (config.banner.css !== undefined) {
      banner.css = config.banner.css.replace(/__APP_VERSION__/g, appVersion);
    }
    if (banner.js !== undefined || banner.css !== undefined) {
      options.banner = banner;
    }
  }
  
  // 🔥 CORREÇÃO: Construção segura de footer
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
  // deno-lint-ignore no-explicit-any
  esbuildBuildFn: (options: any) => Promise<any>,
  listAssetsFn?: (distDir: string) => Promise<string[]>
): Promise<void> {
  // 🔥 VALIDAÇÃO FAIL-FAST: Verifica configuração ANTES de qualquer operação
  validateTargetConfig(targetName, config);
  
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🎯 PROCESSANDO ALVO: ${targetName.toUpperCase()}`);
  console.log(`${"=".repeat(60)}`);
  
  if (config.clean && config.clean.length > 0) {
    // 🔥 CORREÇÃO: Só limpa se distdir existe
    if (config.distdir) {
      await cleanTarget(config.distdir, config.clean);
    } else {
      console.warn(`⚠️ 'clean' configurado mas 'distdir' ausente. Pulando limpeza.`);
    }
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
    
    // 🔥 CORREÇÃO: Só salva metafile se distdir existe
    if (config.metafile && result.metafile && config.distdir) {
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

```ts
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
import { 
  cleanTarget, 
  copyStaticFiles, 
  resolveEntryPoints, 
  resolveOutputPaths,
  validateTargetConfig 
} from "./mod.ts";

// ============================================================================
// 🔧 APLICAÇÃO DE DEFINES (em memória, antes de salvar)
// ============================================================================
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
export function buildBundleOptions(
  config: DenoBundleTargetConfig,
): Deno.bundle.Options {
  // 🔥 RESOLUÇÃO DE ENTRYPOINTS (srcdir opcional)
  const resolvedEntryPoints = resolveEntryPoints(config.srcdir, config.entryPoints);

  // 🔥 RESOLUÇÃO DE OUTPUT PATHS (outfile relativo ao distdir)
  const { outfile, outdir } = resolveOutputPaths(config);

  const options: Deno.bundle.Options = {
    entrypoints: resolvedEntryPoints,
    write: false, // 🔥 SEMPRE false — salvamos manualmente após injetar defines
  };
  
  // 🔥 CORREÇÃO: Usa outputPath resolvido ou outputDir
  if (outfile) {
    options.outputPath = outfile;
  } else if (outdir) {
    options.outputDir = outdir;
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
export async function processBundleTarget(
  targetName: string,
  config: DenoBundleTargetConfig,
  appVersion: string,
  listAssetsFn?: (distDir: string) => Promise<string[]>,
): Promise<void> {
  // 🔥 VALIDAÇÃO FAIL-FAST: Verifica configuração ANTES de qualquer operação
  validateTargetConfig(targetName, config);
  
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🎯 PROCESSANDO ALVO: ${targetName.toUpperCase()}`);
  console.log(`${"=".repeat(60)}`);
  
  // 1. Limpar diretório de saída
  if (config.clean && config.clean.length > 0) {
    // 🔥 CORREÇÃO: Só limpa se distdir existe
    if (config.distdir) {
      await cleanTarget(config.distdir, config.clean);
    } else {
      console.warn(`⚠️ 'clean' configurado mas 'distdir' ausente. Pulando limpeza.`);
    }
  }
  
  // 2. Copiar arquivos estáticos
  await copyStaticFiles(config, appVersion);
  
  // 3. Preparar defines
  const defines: Record<string, string> = {
    ...config.define,
    __APP_VERSION__: JSON.stringify(`v${appVersion}`),
  };
  
  // 🔥 CORREÇÃO: Só lista assets se distdir existe
  if (targetName === "sw" && listAssetsFn && config.distdir) {
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
```

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

## Arquivo: `monorepo/utils/src/webtorrent/mod.ts`

````ts
// monorepo/utils/src/webtorrent/mod.ts

/**
 * ============================================================================
 * @loco/utils/webtorrent
 * Wrapper completo e resiliente da API WebTorrent para o Loco PWA
 * ============================================================================
 *
 * Este módulo encapsula toda a complexidade do WebTorrent, oferecendo:
 * - Inicialização resiliente com checklist de capacidade do browser
 * - Integração automática com Service Worker para streaming P2P
 * - Armazenamento isolado no OPFS por infoHash (`/webtorrent/<hash>/`)
 * - Handshake bidirecional com SW via MessageChannel (ACK garantido)
 * - API tipada e documentada para toda a funcionalidade do WebTorrent
 *
 * @module @loco/utils/webtorrent
 *
 * @example
 * ```ts
 * import { webTorrent } from '@loco/utils/webtorrent';
 *
 * // 1. Inicializar (executa checklist + handshake com SW)
 * await webTorrent.startWebTorrent();
 *
 * // 2. Streamar um arquivo de um Magnet URI
 * const { file, streamUrl, torrent } = await webTorrent.getTorrentFileStream(
 *   'magnet:?xt=urn:btih:...',
 *   '.mp4'
 * );
 * document.querySelector('video').src = streamUrl;
 *
 * // 3. Monitorar progresso
 * torrent.on('download', () => {
 *   console.log(`${Math.round(torrent.progress * 100)}% baixado`);
 * });
 *
 * // 4. Desligar ao sair
 * await webTorrent.stopWebTorrent();
 * ```
 */

// ============================================================================
// DECLARAÇÕES DE TIPO (Autocontidas)
// ============================================================================

declare global {
  interface Window {
    WebTorrent: typeof WebTorrentClient;
  }
}

/**
 * Opções de inicialização do cliente WebTorrent.
 * @see https://github.com/webtorrent/webtorrent#client--new-webtorrentopts
 */
export interface WebTorrentOptions {
  /** Máximo de conexões por torrent (default: 55) */
  maxConns?: number;
  /** Node ID do DHT (default: random) */
  nodeId?: string | Uint8Array;
  /** Peer ID do protocolo Wire (default: random) */
  peerId?: string | Uint8Array;
  /** Habilita trackers (default: true) */
  tracker?: boolean | object;
  /** Habilita DHT (default: true) */
  dht?: boolean | object;
  /** Habilita BEP14 Local Service Discovery (default: true) */
  lsd?: boolean;
  /** Habilita BEP11 Peer Exchange (default: true) */
  utPex?: boolean;
  /** Habilita BEP19 Web Seeds (default: true) */
  webSeeds?: boolean;
  /** Habilita BEP29 uTP (default: true) */
  utp?: boolean;
  /** Conexões de saída durante seeding (default: true) */
  seedOutgoingConnections?: boolean;
  /** Lista de IPs para bloquear */
  blocklist?: string[] | string;
  /** Limite de download em bytes/sec (-1 = ilimitado) */
  downloadLimit?: number;
  /** Limite de upload em bytes/sec (-1 = ilimitado) */
  uploadLimit?: number;
  /** Criptografia RC4: 0=off, 1=handshake, 2=full */
  secure?: 0 | 1 | 2;
}

/**
 * Opções do chunk store (usadas internamente pelo WebTorrent).
 * O campo `rootDir` é a integração Loco com OPFS.
 */
export interface TorrentStoreOptions {
  /** FileSystemDirectoryHandle do OPFS para isolamento por infoHash */
  rootDir?: FileSystemDirectoryHandle;
  [key: string]: any;
}

/**
 * Opções ao adicionar ou fazer seed de um torrent.
 * @see https://github.com/webtorrent/webtorrent#clientaddtorrentid-opts-function-ontorrent-torrent-
 */
export interface TorrentOptions {
  /** Trackers adicionais */
  announce?: string[];
  /** Callback para parâmetros customizados ao tracker */
  getAnnounceOpts?: () => object;
  /** Web seeds adicionais */
  urlList?: string[];
  /** Máx de conexões simultâneas por web seed (default: 4) */
  maxWebConns?: number;
  /** Pasta de destino (relativa ou absoluta) */
  path?: string;
  /** Se true, não compartilha hash no DHT/PEX */
  private?: boolean;
  /** Chunk store customizado (API abstract-chunk-store) */
  store?: (chunkLength: number, storeOpts: any) => any;
  /** Se true, deleta arquivos ao destruir torrent */
  destroyStoreOnDestroy?: boolean;
  /** Número de pieces em cache na RAM (default: 20) */
  storeCacheSlots?: number;
  /** Opções customizadas do store (aqui entra o rootDir do OPFS) */
  storeOpts?: TorrentStoreOptions;
  /** Pula verificação de pieces existentes */
  skipVerify?: boolean;
  /** Bitfield pré-carregado */
  bitfield?: Uint8Array;
  /** Store pré-carregado */
  preloadedStore?: any;
  /** Estratégia de seleção: 'rarest' ou 'sequential' (default) */
  strategy?: 'rarest' | 'sequential';
  /** Intervalo entre verificações de 'noPeers' (segundos, default: 30) */
  noPeersIntervalTime?: number;
  /** Cria o torrent já pausado */
  paused?: boolean;
  /** Cria sem pieces selecionadas */
  deselect?: boolean;
  /** Auto-choke seeders quando seeding (default: true) */
  alwaysChokeSeeders?: boolean;
}

/**
 * Opções para criar servidor HTTP virtual (browser).
 */
export interface CreateServerOptions {
  /** ServiceWorkerRegistration ativo (OBRIGATÓRIO no browser) */
  controller: ServiceWorkerRegistration;
  /** Origin permitida ('*' por padrão, false = same-origin) */
  origin?: string;
}

/**
 * Representa uma conexão ativa com um peer (Wire Protocol).
 */
export interface Wire {
  peerId: string;
  type: 'webrtc' | 'tcpIncoming' | 'tcpOutgoing' | 'utpIncoming' | 'utpOutgoing' | 'webSeed';
  uploaded: number;
  downloaded: number;
  uploadSpeed: number;
  downloadSpeed: number;
  remoteAddress?: string;
  remotePort?: number;
  destroy(): void;
  on(event: 'close' | 'timeout' | string, callback: (...args: any[]) => void): this;
}

/**
 * Representa uma piece do torrent.
 */
export interface Piece {
  length: number;
  missing: number;
}

/**
 * Opções de slice para operações de arquivo (start/end em bytes).
 */
export interface FileSliceOptions {
  start?: number;
  end?: number;
}

/**
 * Representa um arquivo individual dentro de um torrent.
 */
export interface TorrentFile {
  name: string;
  path: string;
  length: number;
  size: number;
  type: string;
  downloaded: number;
  progress: number;
  select(priority?: number): void;
  deselect(): void;
  createReadStream(opts?: FileSliceOptions): any;
  stream(opts?: FileSliceOptions): ReadableStream;
  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array>;
  arrayBuffer(opts?: FileSliceOptions): Promise<ArrayBuffer>;
  blob(opts?: FileSliceOptions): Promise<Blob>;
  /**
   * Define a fonte de um elemento HTML para a URL de streaming.
   * Requer que `createServer` tenha sido chamado antes.
   */
  streamTo(elem: HTMLVideoElement | HTMLAudioElement | HTMLImageElement): void;
  /** URL virtual reconhecida pelo Service Worker */
  streamURL: string;
  includes(pieceIndex: number): boolean;
  on(event: 'done' | 'stream' | 'iterator' | string, callback: (...args: any[]) => void): this;
}

/**
 * Representa um torrent ativo no cliente.
 */
export interface Torrent {
  name: string;
  infoHash: string;
  magnetURI: string;
  torrentFile: Uint8Array;
  torrentFileBlob: Blob;
  announce: string[];
  files: TorrentFile[];
  pieces: (Piece | null)[];
  pieceLength: number;
  lastPieceLength: number;
  timeRemaining: number;
  received: number;
  downloaded: number;
  uploaded: number;
  downloadSpeed: number;
  uploadSpeed: number;
  progress: number;
  ratio: number;
  numPeers: number;
  maxWebConns: number;
  path: string;
  ready: boolean;
  paused: boolean;
  done: boolean;
  length: number;
  created?: Date;
  createdBy?: string;
  comment?: string;
  destroy(opts?: { destroyStore?: boolean }, callback?: () => void): void;
  addPeer(peer: string | any): boolean;
  addWebSeed(urlOrConn: string | any): void;
  removePeer(peer: string | any): void;
  select(start: number, end: number, priority?: number, notify?: () => void): void;
  deselect(start: number, end: number): void;
  critical(start: number, end: number): void;
  pause(): void;
  resume(): void;
  rescanFiles(callback?: (err?: Error) => void): void;
  on(
    event:
      | 'infoHash'
      | 'metadata'
      | 'ready'
      | 'warning'
      | 'error'
      | 'idle'
      | 'done'
      | 'download'
      | 'upload'
      | 'wire'
      | 'noPeers'
      | 'verified'
      | string,
    callback: (...args: any[]) => void
  ): this;
}

/**
 * Classe real do WebTorrent (carregada via tag <script> no HTML).
 * Não deve ser instanciada diretamente - use o singleton `webTorrent`.
 */
export declare class WebTorrentClient {
  static WEBRTC_SUPPORT: boolean;
  constructor(opts?: WebTorrentOptions);
  add(torrentId: string | Uint8Array | File, opts?: TorrentOptions, onTorrent?: (torrent: Torrent) => void): Torrent;
  seed(input: File | FileList | Blob | Uint8Array | any[], opts?: TorrentOptions, onSeed?: (torrent: Torrent) => void): Torrent;
  remove(torrentId: string | Torrent, opts?: { destroyStore?: boolean }, callback?: (err?: Error) => void): Promise<void>;
  destroy(callback?: (err?: Error) => void): void;
  get(torrentId: string): Promise<Torrent | null>;
  createServer(opts: CreateServerOptions, force?: 'browser' | 'node'): any;
  throttleDownload(rate: number): void;
  throttleUpload(rate: number): void;
  torrents: Torrent[];
  downloadSpeed: number;
  uploadSpeed: number;
  progress: number;
  ratio: number;
  on(event: 'add' | 'remove' | 'torrent' | 'error' | string, callback: (...args: any[]) => void): this;
}

// ============================================================================
// INTERFACES DE RETORNO (Loco-specific)
// ============================================================================

/**
 * Retorno de `getTorrentFileStream`.
 */
export interface TorrentStreamData {
  /** Objeto do arquivo encontrado */
  file: TorrentFile;
  /** URL virtual para usar em <video>, <audio> ou <img> */
  streamUrl: string;
  /** Instância completa do torrent para monitoramento */
  torrent: Torrent;
}

/**
 * Snapshot consolidado de estatísticas de todos os torrents ativos.
 * Retornado por `webTorrent.getStats()`.
 */
export interface WebTorrentStats {
  /** Número de torrents ativos */
  activeTorrents: number;
  /** Velocidade total de download (bytes/sec) */
  downloadSpeed: number;
  /** Velocidade total de upload (bytes/sec) */
  uploadSpeed: number;
  /** Progresso agregado (0 a 1) */
  progress: number;
  /** Ratio total (uploaded / downloaded) */
  ratio: number;
  /** Total baixado em bytes (todos os torrents) */
  totalDownloaded: number;
  /** Total enviado em bytes (todos os torrents) */
  totalUploaded: number;
  /** Total de peers conectados */
  totalPeers: number;
  /** WebTorrent está pronto? */
  isReady: boolean;
  /** Service Worker confirmou handshake? */
  isSwReady: boolean;
}

/**
 * Metadados de um torrent armazenado no OPFS.
 * Retornado por `listStoredTorrents()`.
 */
export interface StoredTorrentInfo {
  infoHash: string;
  /** FileSystemDirectoryHandle da pasta do torrent */
  dirHandle: FileSystemDirectoryHandle;
  /** Lista de nomes de arquivos dentro da pasta */
  files: string[];
  /** Tamanho aproximado em bytes (soma dos arquivos) */
  size: number;
}

// ============================================================================
// CLASSE WRAPPER (Singleton)
// ============================================================================

/**
 * Facade resiliente da API WebTorrent para o Loco.
 *
 * **Características principais:**
 * - Checklist de inicialização em cascata (WebRTC, OPFS, SW)
 * - Handshake bidirecional com SW via MessageChannel
 * - Armazenamento isolado no OPFS por infoHash
 * - Cleanup automático em `beforeunload` / `pagehide`
 * - Rollback de segurança em caso de falha
 *
 * @example
 * ```ts
 * import { webTorrent } from '@loco/utils/webtorrent';
 *
 * if (!webTorrent.isReady) {
 *   await webTorrent.startWebTorrent();
 * }
 * ```
 */
class WebTorrentManager {
  private client: WebTorrentClient | null = null;
  private isInitialized: boolean = false;
  private isSwReady: boolean = false;
  private cleanupBound: () => void;

  constructor() {
    this.cleanupBound = this.stopWebTorrent.bind(this);
  }

  // ==========================================================================
  // LIFECYCLE MANAGEMENT
  // ==========================================================================

  /**
   * **LIGA** o WebTorrent.
   *
   * Executa o checklist completo de resiliência:
   * 1. Verifica `window.WebTorrent` (biblioteca carregada via <script>)
   * 2. Verifica suporte a WebRTC (obrigatório para P2P no browser)
   * 3. Instancia o cliente com opções otimizadas para PWA
   * 4. Vincula ao Service Worker via `createServer()`
   * 5. Aguarda `WEBTORRENT_ACK` via MessageChannel (timeout: 5s)
   * 6. Registra listeners de cleanup (`beforeunload`/`pagehide`)
   *
   * Em caso de falha em qualquer etapa, faz **rollback** destruindo o cliente
   * para evitar estados zumbis.
   *
   * @throws {Error} Se `window.WebTorrent` não estiver disponível
   * @throws {Error} Se WebRTC não for suportado
   * @throws {Error} Se o Service Worker não estiver ativo
   * @throws {Error} Se o SW não responder com WEBTORRENT_ACK em 5s
   *
   * @example
   * ```ts
   * try {
   *   await webTorrent.startWebTorrent();
   *   console.log('WebTorrent pronto para uso');
   * } catch (err) {
   *   console.error('Falha ao iniciar:', err.message);
   * }
   * ```
   */
  public async startWebTorrent(): Promise<void> {
    if (this.isInitialized) {
      console.log('[WebTorrent] Já está em execução. Ignorando chamada.');
      return;
    }

    console.log('[WebTorrent] 🚀 Iniciando checklist de resiliência...');

    if (!window.WebTorrent) {
      throw new Error(
        '[WebTorrent] Falha Crítica: Biblioteca global `window.WebTorrent` não encontrada. ' +
        'Verifique se a tag <script src="https://esm.sh/webtorrent@latest/webtorrent.min.js"> está no index.html.'
      );
    }

    if (!window.WebTorrent.WEBRTC_SUPPORT) {
      throw new Error(
        '[WebTorrent] Falha Crítica: WebRTC não é suportado neste navegador. ' +
        'O streaming P2P não funcionará.'
      );
    }

    try {
      this.client = new window.WebTorrent({
        maxConns: 30,
        webSeeds: true,
        dht: true,
        tracker: true,
        secure: 1, // RC4 apenas no handshake (equilíbrio performance/segurança)
      });
      console.log('[WebTorrent] ✅ Cliente instanciado.');
    } catch (error) {
      throw new Error(`[WebTorrent] Falha ao instanciar cliente: ${error}`);
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      if (!registration || !registration.active) {
        throw new Error('Service Worker não está registrado ou ativo.');
      }

      this.client.createServer({ controller: registration });
      console.log('[WebTorrent] ✅ Servidor vinculado ao SW.');

      await this.waitForSwAck(registration.active);

      this.isInitialized = true;
      this.isSwReady = true;

      window.addEventListener('beforeunload', this.cleanupBound);
      window.addEventListener('pagehide', this.cleanupBound);

      console.log('[WebTorrent] 🎉 Inicializado e sincronizado com o SW.');
    } catch (error) {
      console.error('[WebTorrent] ❌ Falha ao vincular ao SW. Fazendo rollback...', error);
      if (this.client) {
        this.client.destroy();
        this.client = null;
      }
      throw new Error(`[WebTorrent] Falha na inicialização: ${error}`);
    }
  }

  /**
   * **DESLIGA** o WebTorrent.
   *
   * - Remove listeners de ciclo de vida
   * - Destrói todas as conexões de peer
   * - Libera recursos de rede e memória
   * - **NÃO** deleta arquivos do OPFS (use `clearAllTorrents()` para isso)
   *
   * @example
   * ```ts
   * await webTorrent.stopWebTorrent();
   * ```
   */
  public async stopWebTorrent(): Promise<void> {
    if (!this.client) return;

    console.log('[WebTorrent] 🧹 Desligando e limpando recursos...');

    window.removeEventListener('beforeunload', this.cleanupBound);
    window.removeEventListener('pagehide', this.cleanupBound);

    this.client.destroy((err?: Error) => {
      if (err) console.error('[WebTorrent] Erro ao destruir cliente:', err);
      else console.log('[WebTorrent] ✅ Cliente destruído.');
    });

    this.client = null;
    this.isInitialized = false;
    this.isSwReady = false;
  }

  /**
   * Indica se o WebTorrent está pronto para uso.
   *
   * Retorna `true` apenas se **ambas** as condições forem verdadeiras:
   * - Cliente instanciado e vinculado ao SW
   * - SW respondeu com WEBTORRENT_ACK
   *
   * @example
   * ```ts
   * if (!webTorrent.isReady) {
   *   await webTorrent.startWebTorrent();
   * }
   * ```
   */
  public get isReady(): boolean {
    return this.isInitialized && this.isSwReady;
  }

  /**
   * Indica se o navegador suporta WebRTC.
   *
   * Pode ser verificado **antes** de chamar `startWebTorrent()` para
   * decidir se exibe fallback UI.
   *
   * @example
   * ```ts
   * if (!webTorrent.isWebRtcSupported) {
   *   alert('Seu navegador não suporta streaming P2P.');
   * }
   * ```
   */
  public get isWebRtcSupported(): boolean {
    return !!window.WebTorrent?.WEBRTC_SUPPORT;
  }

  /**
   * Retorna a instância bruta do cliente WebTorrent.
   *
   * **⚠️ Uso avançado.** Prefira os métodos do wrapper.
   * Lança erro se o cliente não estiver inicializado.
   *
   * @throws {Error} Se `startWebTorrent()` não foi chamado com sucesso
   */
  public get rawClient(): WebTorrentClient {
    this.ensureInitialized();
    return this.client!;
  }

  // ==========================================================================
  // CLIENT API WRAPPERS
  // ==========================================================================

  /**
   * Adiciona um novo torrent para download.
   *
   * **Integração Loco**: automaticamente cria uma pasta isolada no OPFS
   * em `/webtorrent/<infoHash>/` antes de iniciar o download.
   *
   * @param torrentId - Magnet URI, Uint8Array (.torrent), infoHash, File ou URL
   * @param opts - Opções adicionais (exceto `storeOpts`, gerenciado pelo wrapper)
   * @param onTorrent - Callback disparado quando metadados estiverem prontos
   * @returns Instância do Torrent para monitoramento
   * @throws {Error} Se cliente não estiver inicializado
   * @throws {Error} Se falhar ao criar pasta no OPFS
   *
   * @example
   * ```ts
   * const torrent = await webTorrent.add('magnet:?xt=urn:btih:...');
   * torrent.on('ready', () => console.log('Pronto!', torrent.name));
   * torrent.on('download', () => console.log(`${Math.round(torrent.progress * 100)}%`));
   * ```
   *
   * @see https://github.com/webtorrent/webtorrent#clientaddtorrentid-opts-function-ontorrent-torrent-
   */
  public async add(
    torrentId: string | Uint8Array | File,
    opts?: Omit<TorrentOptions, 'storeOpts'>,
    onTorrent?: (torrent: Torrent) => void
  ): Promise<Torrent> {
    this.ensureInitialized();

    // Para Magnet URIs, extraímos infoHash antecipadamente para criar a pasta
    if (typeof torrentId === 'string' && torrentId.startsWith('magnet:')) {
      const infoHash = this.extractInfoHash(torrentId);
      if (infoHash) {
        try {
          const opfsDir = await this.getTorrentOpfsDir(infoHash);
          return this.client!.add(
            torrentId,
            { ...opts, storeOpts: { rootDir: opfsDir }, destroyStoreOnDestroy: false },
            onTorrent
          );
        } catch (err) {
          console.warn('[WebTorrent] Falha ao criar pasta OPFS, usando fallback:', err);
        }
      }
    }

    // Fallback: usa opções padrão sem OPFS
    return this.client!.add(torrentId, opts, onTorrent);
  }

  /**
   * Cria um novo torrent a partir de arquivos locais e inicia o seeding.
   *
   * @param input - File, FileList, Blob, Uint8Array ou array desses tipos
   * @param opts - Opções de create-torrent + client.add
   * @param onSeed - Callback disparado quando seeding iniciar
   * @returns Instância do Torrent
   * @throws {Error} Se cliente não estiver inicializado
   *
   * @example
   * ```ts
   * const file = input.files[0]; // de um <input type="file">
   * const torrent = await webTorrent.seed(file, {
   *   announce: ['wss://tracker.openwebtorrent.com']
   * });
   * console.log('Magnet URI:', torrent.magnetURI);
   * ```
   *
   * @see https://github.com/webtorrent/webtorrent#clientseedinput-opts-function-onseed-torrent-
   */
  public async seed(
    input: File | FileList | Blob | Uint8Array | any[],
    opts?: TorrentOptions,
    onSeed?: (torrent: Torrent) => void
  ): Promise<Torrent> {
    this.ensureInitialized();
    return this.client!.seed(input, opts, onSeed);
  }

  /**
   * Remove um torrent do cliente e fecha todas as conexões.
   *
   * @param torrentId - infoHash, magnet URI ou instância Torrent
   * @param opts.destroyStore - Se true, deleta arquivos do disco/OPFS
   * @param callback - Disparado quando destruição completar
   * @throws {Error} Se cliente não estiver inicializado
   *
   * @example
   * ```ts
   * await webTorrent.remove('abcd1234...', { destroyStore: true });
   * ```
   *
   * @see https://github.com/webtorrent/webtorrent#await-clientremovetorrentid-opts-function-callback-err-
   */
  public async remove(
    torrentId: string | Torrent,
    opts?: { destroyStore?: boolean },
    callback?: (err?: Error) => void
  ): Promise<void> {
    this.ensureInitialized();
    await this.client!.remove(torrentId, opts, callback);
  }

  /**
   * Busca um torrent na lista ativa pelo infoHash ou magnet URI.
   *
   * @param torrentId - infoHash ou magnet URI
   * @returns Torrent encontrado ou `null`
   * @throws {Error} Se cliente não estiver inicializado
   *
   * @example
   * ```ts
   * const torrent = await webTorrent.get('abcd1234...');
   * if (torrent) console.log(torrent.name);
   * ```
   */
  public async get(torrentId: string): Promise<Torrent | null> {
    this.ensureInitialized();
    return await this.client!.get(torrentId);
  }

  /**
   * Define limite de velocidade de download.
   *
   * @param rate - Bytes por segundo (0 = bloqueia, -1 = ilimitado)
   * @throws {Error} Se cliente não estiver inicializado
   *
   * @example
   * ```ts
   * webTorrent.throttleDownload(500 * 1024); // 500 KB/s
   * webTorrent.throttleDownload(-1); // ilimitado
   * ```
   */
  public throttleDownload(rate: number): void {
    this.ensureInitialized();
    this.client!.throttleDownload(rate);
  }

  /**
   * Define limite de velocidade de upload.
   *
   * @param rate - Bytes por segundo (0 = bloqueia, -1 = ilimitado)
   * @throws {Error} Se cliente não estiver inicializado
   *
   * @example
   * ```ts
   * webTorrent.throttleUpload(100 * 1024); // 100 KB/s
   * ```
   */
  public throttleUpload(rate: number): void {
    this.ensureInitialized();
    this.client!.throttleUpload(rate);
  }

  // ==========================================================================
  // CLIENT PROPERTIES (GETTERS)
  // ==========================================================================

  /**
   * Array de todos os torrents ativos no cliente.
   * @throws {Error} Se cliente não estiver inicializado
   */
  public get torrents(): Torrent[] {
    this.ensureInitialized();
    return this.client!.torrents;
  }

  /** Velocidade agregada de download (bytes/sec) */
  public get downloadSpeed(): number {
    return this.client?.downloadSpeed ?? 0;
  }

  /** Velocidade agregada de upload (bytes/sec) */
  public get uploadSpeed(): number {
    return this.client?.uploadSpeed ?? 0;
  }

  /** Progresso agregado de todos os torrents ativos (0 a 1) */
  public get progress(): number {
    return this.client?.progress ?? 0;
  }

  /** Ratio agregado (uploaded / downloaded) */
  public get ratio(): number {
    return this.client?.ratio ?? 0;
  }

  // ==========================================================================
  // TORRENT MANAGEMENT (CONVENIÊNCIA LOCO)
  // ==========================================================================

  /**
   * Adiciona um torrent e retorna dados prontos para streaming.
   *
   * **Método principal de uso no Loco.** Combina:
   * - Criação automática de pasta OPFS isolada
   * - Busca do arquivo por extensão
   * - Retorno da URL de streaming via Service Worker
   *
   * @param magnetUri - Link magnet completo
   * @param fileExtension - Extensão desejada (default: '.mp4')
   * @param customOpts - Opções adicionais (exceto storeOpts)
   * @returns Objeto com file, streamUrl e torrent
   * @throws {Error} Se cliente não inicializado
   * @throws {Error} Se infoHash inválido
   * @throws {Error} Se nenhum arquivo com a extensão for encontrado
   *
   * @example
   * ```ts
   * const { file, streamUrl, torrent } = await webTorrent.getTorrentFileStream(
   *   'magnet:?xt=urn:btih:...',
   *   '.mp4'
   * );
   * document.querySelector('video').src = streamUrl;
   * ```
   */
  public async getTorrentFileStream(
    magnetUri: string,
    fileExtension: string = '.mp4',
    customOpts?: Omit<TorrentOptions, 'storeOpts'>
  ): Promise<TorrentStreamData> {
    this.ensureInitialized();

    const infoHash = this.extractInfoHash(magnetUri);
    if (!infoHash) {
      throw new Error('[WebTorrent] InfoHash inválido no Magnet URI.');
    }

    return new Promise((resolve, reject) => {
      this.getTorrentOpfsDir(infoHash)
        .then((opfsDir) => {
          const torrent = this.client!.add(magnetUri, {
            ...customOpts,
            storeOpts: { rootDir: opfsDir },
            destroyStoreOnDestroy: false,
          });

          torrent.on('error', (err: Error) =>
            reject(new Error(`[WebTorrent] Erro no torrent: ${err.message}`))
          );

          torrent.on('ready', () => {
            const file = torrent.files.find((f) =>
              f.name.toLowerCase().endsWith(fileExtension.toLowerCase())
            );
            if (!file) {
              reject(
                new Error(`[WebTorrent] Nenhum arquivo '${fileExtension}' encontrado em ${torrent.name}`)
              );
              return;
            }
            resolve({ file, streamUrl: file.streamURL, torrent });
          });
        })
        .catch((err) => reject(new Error(`[WebTorrent] Falha no OPFS: ${err.message}`)));
    });
  }

  /**
   * Remove um torrent e **deleta seus arquivos do OPFS**.
   *
   * @param infoHash - infoHash do torrent a remover
   * @returns true se removido com sucesso
   *
   * @example
   * ```ts
   * await webTorrent.removeTorrentAndFiles('abcd1234...');
   * ```
   */
  public async removeTorrentAndFiles(infoHash: string): Promise<boolean> {
    this.ensureInitialized();

    const torrent = await this.client!.get(infoHash);
    if (torrent) {
      await this.client!.remove(torrent, { destroyStore: true });
    }

    try {
      const root = await navigator.storage.getDirectory();
      const wtDir = await root.getDirectoryHandle('webtorrent', { create: false });
      const torrentDir = await wtDir.getDirectoryHandle(infoHash, { create: false });
      
      // Remove todos os arquivos dentro
      for await (const entry of (torrentDir as any).values()) {
        await torrentDir.removeEntry(entry.name, { recursive: true });
      }
      await wtDir.removeEntry(infoHash, { recursive: true });
      
      console.log(`[WebTorrent] 🗑️ Pasta OPFS removida: /webtorrent/${infoHash}/`);
      return true;
    } catch (err) {
      console.warn(`[WebTorrent] Pasta OPFS não encontrada para ${infoHash}:`, err);
      return !!torrent;
    }
  }

  /**
   * Pausa todos os torrents ativos (para de conectar a novos peers).
   *
   * @example
   * ```ts
   * webTorrent.pauseAll(); // economiza bateria em mobile
   * ```
   */
  public pauseAll(): void {
    if (!this.client) return;
    for (const torrent of this.client.torrents) {
      torrent.pause();
    }
  }

  /**
   * Retoma todos os torrents pausados.
   */
  public resumeAll(): void {
    if (!this.client) return;
    for (const torrent of this.client.torrents) {
      torrent.resume();
    }
  }

  // ==========================================================================
  // OPFS & STORAGE
  // ==========================================================================

  /**
   * Retorna o handle do diretório raiz do WebTorrent no OPFS (`/webtorrent/`).
   *
   * @param create - Se true, cria caso não exista (default: true)
   * @returns FileSystemDirectoryHandle ou null se OPFS não suportado
   *
   * @example
   * ```ts
   * const wtRoot = await webTorrent.getOpfsRoot();
   * if (wtRoot) {
   *   for await (const entry of wtRoot.values()) {
   *     console.log('Torrent armazenado:', entry.name);
   *   }
   * }
   * ```
   */
  public async getOpfsRoot(create: boolean = true): Promise<FileSystemDirectoryHandle | null> {
    try {
      const root = await navigator.storage.getDirectory();
      return await root.getDirectoryHandle('webtorrent', { create });
    } catch (err) {
      console.warn('[WebTorrent] OPFS indisponível:', err);
      return null;
    }
  }

  /**
   * Retorna o handle da pasta isolada de um torrent específico.
   *
   * @param infoHash - infoHash do torrent
   * @param create - Se true, cria caso não exista (default: true)
   * @returns FileSystemDirectoryHandle
   * @throws {Error} Se OPFS não suportado ou acesso negado
   */
  public async getTorrentOpfsDir(
    infoHash: string,
    create: boolean = true
  ): Promise<FileSystemDirectoryHandle> {
    const root = await navigator.storage.getDirectory();
    const wtDir = await root.getDirectoryHandle('webtorrent', { create });
    return await wtDir.getDirectoryHandle(infoHash.toLowerCase(), { create });
  }

  /**
   * Lista todos os torrents armazenados no OPFS.
   *
   * @returns Array de metadados dos torrents persistidos
   *
   * @example
   * ```ts
   * const stored = await webTorrent.listStoredTorrents();
   * for (const t of stored) {
   *   console.log(`${t.infoHash}: ${t.files.length} arquivos, ${t.size} bytes`);
   * }
   * ```
   */
  public async listStoredTorrents(): Promise<StoredTorrentInfo[]> {
    const result: StoredTorrentInfo[] = [];
    const wtRoot = await this.getOpfsRoot(false);
    if (!wtRoot) return result;

    try {
      for await (const entry of (wtRoot as any).values()) {
        if (entry.kind === 'directory') {
          const infoHash = entry.name;
          const dirHandle = entry as FileSystemDirectoryHandle;
          const files: string[] = [];
          let size = 0;

          try {
            for await (const fileEntry of (dirHandle as any).values()) {
              if (fileEntry.kind === 'file') {
                files.push(fileEntry.name);
                try {
                  const file = await (fileEntry as FileSystemFileHandle).getFile();
                  size += file.size;
                } catch {
                  // ignora arquivos ilegíveis
                }
              }
            }
          } catch {
            // pasta ilegível, pula
          }

          result.push({ infoHash, dirHandle, files, size });
        }
      }
    } catch (err) {
      console.warn('[WebTorrent] Erro ao listar OPFS:', err);
    }

    return result;
  }

  /**
   * Limpa **todo** o armazenamento do WebTorrent no OPFS.
   *
   * ⚠️ **Ação destrutiva.** Use com cautela.
   *
   * @returns Número de torrents removidos
   *
   * @example
   * ```ts
   * const count = await webTorrent.clearAllTorrents();
   * console.log(`${count} torrents removidos do OPFS`);
   * ```
   */
  public async clearAllTorrents(): Promise<number> {
    const wtRoot = await this.getOpfsRoot(false);
    if (!wtRoot) return 0;

    let count = 0;
    try {
      for await (const entry of (wtRoot as any).values()) {
        if (entry.kind === 'directory') {
          await wtRoot.removeEntry(entry.name, { recursive: true });
          count++;
        }
      }
      console.log(`[WebTorrent] 🧹 ${count} pastas de torrent removidas do OPFS.`);
    } catch (err) {
      console.error('[WebTorrent] Erro ao limpar OPFS:', err);
    }
    return count;
  }

  // ==========================================================================
  // STATISTICS & MONITORING
  // ==========================================================================

  /**
   * Retorna um snapshot consolidado de todas as estatísticas.
   *
   * Útil para renderizar dashboards e indicadores de performance.
   *
   * @returns Objeto WebTorrentStats com métricas agregadas
   *
   * @example
   * ```ts
   * const stats = webTorrent.getStats();
   * console.log(`${stats.activeTorrents} torrents, ${stats.totalPeers} peers`);
   * ```
   */
  public getStats(): WebTorrentStats {
    if (!this.client) {
      return {
        activeTorrents: 0,
        downloadSpeed: 0,
        uploadSpeed: 0,
        progress: 0,
        ratio: 0,
        totalDownloaded: 0,
        totalUploaded: 0,
        totalPeers: 0,
        isReady: false,
        isSwReady: false,
      };
    }

    let totalDownloaded = 0;
    let totalUploaded = 0;
    let totalPeers = 0;

    for (const torrent of this.client.torrents) {
      totalDownloaded += torrent.downloaded;
      totalUploaded += torrent.uploaded;
      totalPeers += torrent.numPeers;
    }

    return {
      activeTorrents: this.client.torrents.length,
      downloadSpeed: this.client.downloadSpeed,
      uploadSpeed: this.client.uploadSpeed,
      progress: this.client.progress,
      ratio: this.client.ratio,
      totalDownloaded,
      totalUploaded,
      totalPeers,
      isReady: this.isInitialized,
      isSwReady: this.isSwReady,
    };
  }

  // ==========================================================================
  // EVENT WRAPPERS (CLIENT-LEVEL)
  // ==========================================================================

  /**
   * Registra um listener de evento no nível do cliente.
   *
   * @param event - 'add' | 'remove' | 'torrent' | 'error' | string
   * @param callback - Função a ser chamada
   * @returns this (para chaining)
   * @throws {Error} Se cliente não estiver inicializado
   *
   * @example
   * ```ts
   * webTorrent.on('torrent', (t) => console.log('Novo torrent:', t.name));
   * webTorrent.on('error', (err) => console.error(err));
   * ```
   */
  public on(event: 'add' | 'remove' | 'torrent' | 'error' | string, callback: (...args: any[]) => void): this {
    this.ensureInitialized();
    this.client!.on(event, callback);
    return this;
  }

  // ==========================================================================
  // MÉTODOS PRIVADOS
  // ==========================================================================

  /**
   * Aguarda ACK do SW via MessageChannel (padrão Loco).
   * Evita colisões com outros listeners globais de 'message'.
   */
  private async waitForSwAck(activeWorker: ServiceWorker): Promise<void> {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();

      const timeout = setTimeout(() => {
        channel.port1.close();
        reject(new Error('Timeout: SW não respondeu com WEBTORRENT_ACK em 5s.'));
      }, 5000);

      channel.port1.onmessage = (event) => {
        if (event.data && event.data.type === 'WEBTORRENT_ACK') {
          clearTimeout(timeout);
          channel.port1.close();
          resolve();
        }
      };

      activeWorker.postMessage({ type: 'WEBTORRENT_READY' }, [channel.port2]);
    });
  }

  /**
   * Extrai o infoHash (case-insensitive) de um Magnet URI.
   */
  private extractInfoHash(magnetUri: string): string | null {
    const match = magnetUri.match(/btih:([a-zA-Z0-9]+)/i);
    // 🔥 CORREÇÃO: Verificação explícita de match[1] para satisfazer noUncheckedIndexedAccess
    return match && match[1] ? match[1].toLowerCase() : null;
  }

  /**
   * Garante que o cliente está inicializado.
   * @throws {Error} Se `startWebTorrent()` não foi chamado
   */
  private ensureInitialized(): void {
    if (!this.isInitialized || !this.client) {
      throw new Error(
        '[WebTorrent] Cliente não inicializado. Chame `await webTorrent.startWebTorrent()` primeiro.'
      );
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * Instância singleton do wrapper WebTorrent.
 *
 * Importe este objeto em qualquer parte do Loco para interagir com
 * o WebTorrent de forma tipada, resiliente e integrada ao Service Worker.
 *
 * @example
 * ```ts
 * import { webTorrent } from '@loco/utils/webtorrent';
 *
 * await webTorrent.startWebTorrent();
 * const { streamUrl } = await webTorrent.getTorrentFileStream(magnetUri);
 * ```
 */
export const webTorrent = new WebTorrentManager();
````

---

## Arquivo: `monorepo/utils/src/eventbus/mod.ts`

```ts
// monorepo/utils/src/eventbus/mod.ts
// exportado como @loco/utils/eventbus

/**
 * Barramento de Eventos Interno do Loco.
 * Substitui a necessidade de espalhar addEventListener customizados pela aplicação.
 * Garante tipagem estrita entre emissores e receptores.
 * 
 * IMPORTANTE: Este é o contrato único. Se um arquivo tenta emitir um evento que não está aqui,
 * o TypeScript irá falhar, protegendo a aplicação de erros de digitação ou eventos órfãos.
 */
type EventMap = {
  // ==========================================
  // 1. COMUNICAÇÃO SW -> UI (Notificações de Estado)
  // ==========================================
  'sw:notify:chat-updated': { chatId: string };
  'sw:notify:contact-updated': { contatoHash: string };
  'sw:notify:pong-version': { version: string };
  'sw:notify:webtorrent-ack': void;

  // ==========================================
  // 2. EVENTOS DE REDE E CONECTIVIDADE
  // ==========================================
  'loco:network:online': void;
  'loco:network:offline': void;
  'loco:network:sync-completed': { syncedCount: number };

  // ==========================================
  // 3. EVENTOS DE HANDSHAKE E SW (Internos / Entrada)
  // ==========================================
  'loco:sw:ready': void;
  'loco:sw:message-received': { type: string; payload: unknown };
  'loco:handshake:state-changed': { newState: string; peerId: string };

  // ==========================================
  // 4. EVENTOS DE UI E NAVEGAÇÃO
  // ==========================================
  'loco:ui:route-changed': { path: string; params: Record<string, string> };
  'loco:ui:theme-changed': { theme: 'light' | 'dark' };
  'loco:ui:config-updated': { key: string; value: unknown };

  // ==========================================
  // 5. EVENTOS DE CICLO DE VIDA DO APP
  // ==========================================
  'loco:app:backgrounded': void;
  'loco:app:foregrounded': void;
};

type EventCallback<T> = (payload: T) => void;

class EventBusImpl {
  private listeners = new Map<keyof EventMap, Set<EventCallback<any>>>();

  /**
   * Assina um evento interno.
   * Retorna uma função de cleanup para remover o listener (evita vazamentos).
   */
  on<K extends keyof EventMap>(
    event: K, 
    callback: EventCallback<EventMap[K]>
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    
    const callbacks = this.listeners.get(event)!;
    callbacks.add(callback);

    // Retorna função de unsubscribe
    return () => {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  /**
   * Emite um evento interno.
   */
  emit<K extends keyof EventMap>(
    event: K, 
    ...args: EventMap[K] extends void ? [] : [EventMap[K]]
  ): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const payload = args[0];
      for (const callback of callbacks) {
        try {
          callback(payload);
        } catch (error) {
          console.error(`[EventBus] Erro no listener do evento '${String(event)}':`, error);
        }
      }
    }
  }
}

// Instância Singleton
export const EventBus = new EventBusImpl();

/**
 * Hook utilitário para Preact (usar dentro de componentes).
 * Garante que o listener seja removido automaticamente quando o componente desmontar.
 */
export function useEvent<K extends keyof EventMap>(
  event: K,
  callback: EventCallback<EventMap[K]>
) {
  // A implementação real do useEffect será feita na camada de UI.
  // Aqui apenas retornamos a função de cleanup do EventBus.
  return EventBus.on(event, callback);
}
```

---

## Arquivo: `monorepo/utils/docs/webtorrent-api.md`

````md
# WebTorrent Documentation

WebTorrent is a streaming torrent client for **Node.js** and the **web**. WebTorrent
provides the same API in both environments.

To use WebTorrent in the browser, [WebRTC] support is required (Chrome, Firefox, Opera, Safari).

[webrtc]: https://en.wikipedia.org/wiki/WebRTC

## Install

```bash
npm install webtorrent
```

## Quick Example

```js
const client = new WebTorrent()

const torrentId = 'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F&xs=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2Fsintel.torrent'

const controller = await navigator.serviceWorker.register('./sw.min.js', { scope: './' })
await navigator.serviceWorker.ready
client.createServer({ controller })

client.add(torrentId, torrent => {
  // Torrents can contain many files. Let's use the .mp4 file
  const file = torrent.files.find(file => {
    return file.name.endsWith('.mp4')
  })

  // Display the file by adding it to the DOM. Supports video, audio, image, etc. files
  file.streamTo(document.querySelector('video'))
})
```

# WebTorrent API

## `WebTorrent.WEBRTC_SUPPORT`

Is WebRTC natively supported in the environment?

```js
if (WebTorrent.WEBRTC_SUPPORT) {
  // WebRTC is supported
} else {
  // Use a fallback
}
```

## `client = new WebTorrent([opts])`

Create a new `WebTorrent` instance.

If `opts` is specified, then the default options (shown below) will be overridden.

```js
{
  maxConns: Number,        // Max number of connections per torrent (default=55)
  nodeId: String|Uint8Array,   // DHT protocol node ID (default=randomly generated)
  peerId: String|Uint8Array,   // Wire protocol peer ID (default=randomly generated)
  tracker: Boolean|Object, // Enable trackers (default=true), or options object for Tracker
  dht: Boolean|Object,     // Enable DHT (default=true), or options object for DHT
  lsd: Boolean,            // Enable BEP14 local service discovery (default=true)
  utPex: Boolean,          // Enable BEP11 Peer Exchange (default=true)
  natUpnp: Boolean | String, // Enable NAT port mapping via NAT-UPnP (default=true). NodeJS only
  natPmp: Boolean,         // Enable NAT port mapping via NAT-PMP (default=true). NodeJS only.
  webSeeds: Boolean,       // Enable BEP19 web seeds (default=true)
  utp: Boolean,            // Enable BEP29 uTorrent transport protocol (default=true)
  seedOutgoingConnections: Boolean // Enable outgoing connections when seeding (default=true)
  blocklist: Array|String, // List of IP's to block
  downloadLimit: Number,   // Max download speed (bytes/sec) over all torrents (default=-1)
  uploadLimit: Number,     // Max upload speed (bytes/sec) over all torrents (default=-1)
  secure: Number           // Enable RC4 encryption (default=1). Allowed values: 0, 1, 2
}
```

For possible values of `opts.dht` see the
[`bittorrent-dht` documentation](https://github.com/webtorrent/bittorrent-dht#dht--new-dhtopts).

For possible values of `opts.tracker` see the
[`bittorrent-tracker` documentation](https://github.com/webtorrent/bittorrent-tracker#client).

For possible values of `opts.blocklist` see the
[`load-ip-set` documentation](https://github.com/webtorrent/load-ip-set#usage).

For `opts.natUpnp` and `opts.natPmp`, if both are set to `true`, PMP will be attempted first, then fallback to UPNP. NodeJS only.

For `opts.natUpnp`, if set to `true`, a temporary mapping is used, if set to `permanent`, a permanent TTL will be used for UPNP if the router only supports permanent leases. NodeJS only.

For `opts.seedOutgoingConnections`, if set `true`, outgoing connections will be established while seeding, otherwise, only inbound connections will be responded to.

For `downloadLimit` and `uploadLimit` the possible values can be:
  - `> 0`. The client will set the throttle at that speed
  - `0`. The client will block any data from being downloaded or uploaded
  - `-1`. The client will is disable the throttling and use the whole bandwidth available

For `secure` the possible values can be:
  - `0`. RC4 encryption is disabled.
  - `1`. RC4 encryption is enabled for handshake only. Has close to 0 performance impact.
  - `2`. RC4 encryption is enabled for handshake and payload. Consider using `--openssl-legacy-provider` for a native RC4 implementation, which offers much better performance than the JS version.

## `client.add(torrentId, [opts], [function ontorrent (torrent) {}])`

Start downloading a new torrent.

`torrentId` can be one of:

- magnet uri (string)
- torrent file (Uint8Array)
- info hash (hex string or Uint8Array)
- parsed torrent (from [parse-torrent](https://github.com/webtorrent/parse-torrent))
- http/https url to a torrent file (string)
- filesystem path to a torrent file (string) *(Node.js only)*

If `opts` is specified, then the default options (shown below) will be overridden.

```js
{
  announce: [String],        // Torrent trackers to use (added to list in .torrent or magnet uri)
  getAnnounceOpts: Function, // Custom callback to allow sending extra parameters to the tracker
  urlList: [String],         // Array of web seeds
  maxWebConns: Number,       // Max number of simultaneous connections per web seed [default=4]
  path: String,              // Folder to download files to (default=`/tmp/webtorrent/`)
  private: Boolean,          // If true, client will not share the hash with the DHT nor with PEX (default is the privacy of the parsed torrent)
  store: Function,           // Custom chunk store (must follow [abstract-chunk-store](https://www.npmjs.com/package/abstract-chunk-store) API)
  destroyStoreOnDestroy: Boolean, // If truthy, client will delete the torrent's chunk store (e.g. files on disk) when the torrent is destroyed
  storeCacheSlots: Number,   // Number of chunk store entries (torrent pieces) to cache in memory [default=20]; 0 to disable caching
  storeOpts: Object,         // Custom options passed to the store
  addUID: Boolean,           // (Node.js only) If true, the torrent will be stored in it's infoHash folder to prevent file name collisions (default=false)
  skipVerify: Boolean,       // If true, client will skip verification of pieces for existing store and assume it's correct
  bitfield: Uint8Array,      // Preloaded numerical array/buffer to use to know what pieces are already downloaded (any type accepted by UInt8Array constructor is valid)
  preloadedStore: Function,  // Custom, pre-loaded chunk store (must follow [abstract-chunk-store](https://www.npmjs.com/package/abstract-chunk-store) API)
  strategy: String,          // Piece selection strategy, `rarest` or `sequential`(defaut=`sequential`)
  noPeersIntervalTime: Number, // The amount of time (in seconds) to wait between each check of the `noPeers` event (default=30)
  paused: Boolean,           // If true, create the torrent in a paused state (default=false)
  deselect: Boolean,         // If true, create the torrent with no pieces selected (default=false)
  alwaysChokeSeeders: Boolean // If true, client will automatically choke seeders if it's seeding. (default=true)
}
```

If `ontorrent` is specified, then it will be called when **this** torrent is ready to be
used (i.e. metadata is available). Note: this is distinct from the 'torrent' event which
will fire for **all** torrents.

If you want access to the torrent object immediately in order to listen to events as the
metadata is fetched from the network, then use the return value of `client.add`. If you
just want the file data, then use `ontorrent` or the 'torrent' event.

If you provide `opts.store`, it will be called as
`opts.store(chunkLength, storeOpts)` with:

* `storeOpts` - custom `storeOpts` specified in `opts`
* `storeOpts.length` - size of all the files in the torrent
* `storeOpts.files` - an array of torrent file objects
* `storeOpts.torrent` - the torrent instance being stored
* `storeOpts.path` - path to the store, based on `opts.path`
* `storeOpts.name` - the info hash of the torrent instance being stored
* `storeOpts.addUID` - boolean which tells the store if it should include an UID in it's file paths
* `storeOpts.rootDir` - *(browser only)* [FileSystemDirectoryHandle](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemDirectoryHandle) - if supported by the browser, allows the user to specify a custom directory to stores the files in, retaining the torrent's folder and file structure

**Note (browser only):** If you don't want to retain data across sessions, make sure to manually destroy the torrent store when the page closes (More on how below). This has to happen on the `beforeunload` event at latest, in order for the data to be removed. [About page lifecycles.](https://developers.google.com/web/updates/2018/07/page-lifecycle-api)

**Note:** Downloading a torrent automatically seeds it, making it available for download by other peers.

## `client.seed(input, [opts], [function onseed (torrent) {}])`

Start seeding a new torrent.

`input` can be any of the following:

- filesystem path to file or folder
 (string) *(Node.js only)*
- W3C [FileList](https://developer.mozilla.org/en-US/docs/Web/API/FileList) object (basically an array of `File` objects) *(browser only)*
- W3C [File](https://developer.mozilla.org/en-US/docs/Web/API/File)/[Blob](https://developer.mozilla.org/en-US/docs/Web/API/Blob) object (from an `<input>` or drag and drop)
- typed array or array of numbers
- Node [Buffer](https://nodejs.org/api/buffer.html) object
- Node [Readable stream](https://nodejs.org/api/stream.html#stream_class_stream_readable) object

Or, an **array of of any of those values**.

If `opts` is specified, it should contain the following types of options:

- options for [create-torrent](https://github.com/webtorrent/create-torrent#createtorrentinput-opts-function-callback-err-torrent-) (to allow configuration of the .torrent file that is created)
- options for `client.add` (see above)

If `onseed` is specified, it will be called when the client has begun seeding the file.

**Note:** Every torrent is required to have a name. If one is not explicitly provided
through `opts.name`, one will be determined automatically using the following logic:

- If all files share a common path prefix, that will be used. For example, if all file
  paths start with `/imgs/` the torrent name will be `imgs`.
- Otherwise, the first file that has a name will determine the torrent name. For example,
  if the first file is `/foo/bar/baz.txt`, the torrent name will be `baz.txt`.
- If no files have names (say that all files are Uint8Array or Stream objects), then a name
  like "Unnamed Torrent <id>" will be generated.

**Note:** Every file is required to have a name. For filesystem paths or W3C File objects,
the name is included in the object. For Uint8Array or Readable stream types, a `name` property
can be set on the object, like this:

```js
const buf = new Uint8Array('Some file content')
buf.name = 'Some file name'
client.seed(buf, cb)
```

## `client.on('add', function (torrent) {})`

Emitted when a torrent is added to client.torrents. This allows attaching to torrent events that may be emitted before the client 'torrent' event is emitted. See the torrent section for more info on what methods a `torrent` has.

## `client.on('remove', function (torrent) {})`

Emitted when a torrent is removed from client.torrents. See the torrent section for more info on what methods a `torrent` has.

## `client.on('torrent', function (torrent) {})`

Emitted when a torrent is ready to be used (i.e. metadata is available and store is
ready). See the torrent section for more info on what methods a `torrent` has.

## `client.on('error', function (err) {})`

Emitted when the client encounters a fatal error. The client is automatically
destroyed and all torrents are removed and cleaned up when this occurs.

Always listen for the 'error' event.

## `await client.remove(torrentId, [opts], [function callback (err) {}])`

Remove a torrent from the client. Destroy all connections to peers and delete all saved file metadata.

If `opts.destroyStore` is specified, it will override `opts.destroyStoreOnDestroy` passed when the torrent was added.
If truthy, `store.destroy()` will be called, which will delete the torrent's files from the disk.

If `callback` is provided, it will be called when the torrent is fully destroyed,
i.e. all open sockets are closed, and the storage is either closed or destroyed.

## `client.destroy([function callback (err) {}])`

Destroy the client, including all torrents and connections to peers. If `callback` is specified, it will be called when the client has gracefully closed.

## `client.torrents[...]`

An array of all torrents in the client.

## `await client.get(torrentId)`

Returns a promise which resolves the torrent with the given `torrentId`. Convenience method. Easier than searching
through the `client.torrents` array. Returns `null` if no matching torrent found.

## `client.downloadSpeed`

Total download speed for all torrents, in bytes/sec.

## `client.uploadSpeed`

Total upload speed for all torrents, in bytes/sec.

## `client.progress`

Total download progress for all **active** torrents, from 0 to 1.

## `client.ratio`

Aggregate "seed ratio" for all torrents (uploaded / downloaded).

## `client.throttleDownload(rate)`

Sets the maximum speed at which the client downloads the torrents, in bytes/sec.

`rate` must be bigger or equal than zero, or `-1` to disable the download throttle and
use the whole bandwidth of the connection.

## `client.throttleUpload(rate)`

Sets the maximum speed at which the client uploads the torrents, in bytes/sec.

`rate` must be bigger or equal than zero, or `-1` to disable the upload throttle and
use the whole bandwidth of the connection.


## `client.createServer([opts], force)`

Create an http server to serve the contents of this torrent, dynamically fetching the needed torrent pieces to satisfy http requests. Range requests are supported.
If `opts` is specified, it can have the following properties:
```js
{
  origin: String // Allow requests from specific origin. `false` for same-origin. [default: '*']
  hostname: String // If specified, only allow requests whose `Host` header matches this hostname. Note that you should not specify the port since this is automatically determined by the server. Ex: `localhost` [default: `undefined`]. NodeJS only.
  path: String // Allows to overwrite the default `/webtorrent` base path. [default: '/webtorrent']. NodeJS only.
  controller: ServiceWorkerRegistration // Accepts an existing service worker registration [await navigator.serviceWorker.getRegistration()]. Browser only. Required!
}
```

If `force` is specified, it can force WebTorrent to use a specific implementation for enviorments which run both Node and Browser like NW.js or Electron. Allowed values:
```js
'browser' || 'node'
```

Visiting the root of the server `/` won't show anything. Visiting `/webtorrent/` will list all torrents. Access individual torrents at `/webtorrent/<infohash>` where `infohash` is the hash of the torrent. To acceess individual files, go to `/webtorrent/<infoHash>/<filepath>` where filepath is the file's path in the torrent.


Here is a usage example for Node.js:

```js
const client = new WebTorrent()
const magnetURI = 'magnet: ...'

const instance = client.createServer()
instance.server.listen(0) // start the server listening to a port
// 0 automatically finds an open port instead of forcing a potentially used one
client.add(magnetURI, torrent => {
  // create HTTP server for this torrent

  const url = torrent.files[0].streamURL
  console.log(url)
  // visit http://localhost:<port>/webtorrent/ to see a list of torrents

  // access individual torrents at http://localhost:<port>/webtorrent/<infoHash> where infoHash is the hash of the torrent
})

// later, cleanup...
instance.close()
client.destroy()
```

In browser needs either [this worker](https://github.com/webtorrent/webtorrent/blob/master/sw.min.js) to be used, or have [this functionality](https://github.com/webtorrent/webtorrent/blob/master/lib/worker.js) implemented.

Here is a user example for browser:

```js
const client = new WebTorrent()
const magnetURI = 'magnet: ...'
const player = document.querySelector('video')

const controller = await navigator.serviceWorker.register('./sw.min.js', { scope: './' })
await navigator.serviceWorker.ready
client.createServer({ controller })

client.add(magnetURI, torrent => {
  const url = torrent.files[0].streamURL
  console.log(url)
  // visit <origin>/webtorrent/ to see a list of torrents, where origin is the worker registration scope.
  // access individual torrents at /webtorrent/<infoHash> where infoHash is the hash of the torrent
})

// later, cleanup...
client._server.close()
client.destroy()
```
Needs either [this worker](https://github.com/webtorrent/webtorrent/blob/master/sw.min.js) to be used, or have [this functionality](https://github.com/webtorrent/webtorrent/blob/master/lib/worker.js) implemented.

# Torrent API

## `torrent.name`

Name of the torrent (string).

## `torrent.infoHash`

Info hash of the torrent (string).

## `torrent.magnetURI`

Magnet URI of the torrent (string).

## `torrent.torrentFile`

`.torrent` file of the torrent (Uint8Array).

## `torrent.torrentFileBlob`

`.torrent` file of the torrent (Blob). Useful for creating Blob URLs via `URL.createObjectURL(blob)`

## `torrent.announce[...]`

Array of all tracker servers. Each announce is an URL (string).

## `torrent.files[...]`

Array of all files in the torrent. See documentation for `File` below to learn what
methods/properties files have.

## `torrent.pieces[...]`

Array of all pieces in the torrent. See documentation for `Piece` below to learn what
properties pieces have. Some pieces can be null.

## `torrent.pieceLength`

Length in bytes of every piece but the last one.

## `torrent.lastPieceLength`

Length in bytes of the last piece (<= of `torrent.pieceLength`).

## `torrent.timeRemaining`

Time remaining for download to complete (in milliseconds).

## `torrent.received`

Total bytes received from peers (*including* invalid data).

## `torrent.downloaded`

Total *verified* bytes received from peers.

## `torrent.uploaded`

Total bytes uploaded to peers.

## `torrent.downloadSpeed`

Torrent download speed, in bytes/sec.

## `torrent.uploadSpeed`

Torrent upload speed, in bytes/sec.

## `torrent.progress`

Torrent download progress, from 0 to 1.

## `torrent.ratio`

Torrent "seed ratio" (uploaded / downloaded).

## `torrent.numPeers`

Number of peers in the torrent swarm.

## `torrent.maxWebConns`

Max number of simultaneous connections per web seed, as passed in the options.

## `torrent.path`

Torrent download location.

## `torrent.ready`

True when the torrent is ready to be used (i.e. metadata is available and store is
ready).

## `torrent.paused`

True when the torrent has stopped connecting to new peers. Note that this does
not pause new incoming connections, nor does it pause the streams of existing
connections or their wires.

## `torrent.done`

True when all the torrent files have been downloaded.

## `torrent.length`

Sum of the files length (in bytes).

## `torrent.created`

Date of creation of the torrent (as a [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) object).

## `torrent.createdBy`

Author of the torrent (string).

## `torrent.comment`

A comment optionnaly set by the author (string).

## `torrent.destroy([opts], [callback])`

Remove the torrent from its client. Destroy all connections to peers and delete all saved file metadata.

If `opts.destroyStore` is specified, it will override `opts.destroyStoreOnDestroy` passed when the torrent was added.
If truthy, `store.destroy()` will be called, which will delete the torrent's files from the disk.

If `callback` is provided, it will be called when the torrent is fully destroyed,
i.e. all open sockets are closed, and the storage is either closed or destroyed.

## `torrent.addPeer(peer)`

Add a peer to the torrent swarm. This is advanced functionality. Normally, you should not
need to call `torrent.addPeer()` manually. WebTorrent will automatically find peers using
the tracker servers or DHT. This is just for manually adding a peer to the client.

This method should not be called until the `infoHash` event has been emitted.

Returns `true` if peer was added, `false` if peer was blocked by the loaded blocklist.

The `peer` argument must be an address string in the format `12.34.56.78:4444` (for
normal TCP/uTP peers), or a [`simple-peer`](https://github.com/feross/simple-peer)
instance (for WebRTC peers).

## `torrent.addWebSeed(urlOrConn)`

Add a web seed to the torrent swarm. For more information on BitTorrent web seeds, see
[BEP19](http://www.bittorrent.org/beps/bep_0019.html).

In the browser, web seed servers must have proper CORS (Cross-origin resource sharing)
headers so that data can be fetched across domain.

The `urlOrConn` argument is either the web seed URL, or an object that provides a custom
web seed implementation. A custom conn object is a duplex stream that speaks the bittorrent
wire protocol and pretends to be a remote peer. It must have a `connId` property that
uniquely identifies the custom web seed.

## `torrent.removePeer(peer)`

Remove a peer from the torrent swarm. This is advanced functionality. Normally, you should
not need to call `torrent.removePeer()` manually. WebTorrent will automatically remove
peers from the torrent swarm when they're slow or don't have pieces that are needed.

The `peer` argument should be an address (i.e. "ip:port" string), a peer id (hex string),
or `simple-peer` instance.

## `torrent.select(start, end, [priority], [notify])`

Selects a range of pieces to prioritize starting with `start` and ending with `end` (both
inclusive) at the given `priority`. `notify` is an optional callback to be called when the
selection is updated with new data.

## `torrent.deselect(start, end)`

Deprioritizes a range of previously selected pieces.

## `torrent.critical(start, end)`

Marks a range of pieces as critical priority to be downloaded ASAP. From `start` to `end`
(both inclusive).


## `torrent.pause()`

Temporarily stop connecting to new peers. Note that this does not pause new incoming
connections, nor does it pause the streams of existing connections or their wires.

## `torrent.resume()`

Resume connecting to new peers.

## `torrent.rescanFiles([function callback (err) {}])`

Verify the hashes of all pieces in the store and update the bitfield for any new valid
pieces. Useful if data has been added to the store outside WebTorrent, e.g. if another
process puts a valid file in the right place. Once the scan is complete,
`callback(null)` will be called (if provided), unless the torrent was destroyed during
the scan, in which case `callback` will be called with an error.

## `torrent.on('infoHash', function () {})`

Emitted when the info hash of the torrent has been determined.

## `torrent.on('metadata', function () {})`

Emitted when the metadata of the torrent has been determined. This includes the full
contents of the .torrent file, including list of files, torrent length, piece hashes,
piece length, etc.

## `torrent.on('ready', function () {})`

Emitted when the torrent is ready to be used (i.e. metadata is available and store is
ready).

## `torrent.on('warning', function (err) {})`

Emitted when there is a warning. This is purely informational and it is not necessary to
listen to this event, but it may aid in debugging.

## `torrent.on('error', function (err) {})`

Emitted when the torrent encounters a fatal error. The torrent is automatically destroyed
and removed from the client when this occurs.

**Note:** Torrent errors are emitted at `torrent.on('error')`. If there are no
'error' event handlers on the torrent instance, then the error will be emitted at
`client.on('error')`. This prevents throwing an uncaught exception (unhandled
'error' event), but it makes it impossible to distinguish client errors versus
torrent errors. Torrent errors are not fatal, and the client is still usable
afterwards. Therefore, always listen for errors in both places
(`client.on('error')` and `torrent.on('error')`).

## `torrent.on('idle', function () {})`

Emitted when the torrent has no more active selections to download, and starts idling 
or seeding. This can happen when a file is fully downloaded, or when the desired pieces
have been downloaded.

## `torrent.on('done', function () {})`

Emitted when all the torrent files have been downloaded.

Here is a usage example:

```js
torrent.on('done', () => {
  console.log('torrent finished downloading')
  for (const file of torrent.files) { 
    // do something with file
  }
})
```

## `torrent.on('download', function (bytes) {})`

Emitted whenever data is downloaded. Useful for reporting the current torrent status, for
instance:

```js
torrent.on('download', bytes => {
  console.log('just downloaded: ' + bytes)
  console.log('total downloaded: ' + torrent.downloaded)
  console.log('download speed: ' + torrent.downloadSpeed)
  console.log('progress: ' + torrent.progress)
})
```

## `torrent.on('upload', function (bytes) {})`

Emitted whenever data is uploaded. Useful for reporting the current torrent status.

## `torrent.on('wire', function (wire) {})`

Emitted whenever a new peer is connected for this torrent. `wire` is an instance of
[`bittorrent-protocol`](https://github.com/webtorrent/bittorrent-protocol), which is a
node.js-style duplex stream to the remote peer. This event can be used to specify
[custom BitTorrent protocol extensions](https://github.com/webtorrent/bittorrent-protocol#extension-api).

Here is a usage example:

```js
import MyExtension from './my-extension'

torrent1.on('wire', (wire, addr) => {
  console.log('connected to peer with address ' + addr)
  wire.use(MyExtension)
})
```

See the `bittorrent-protocol`
[extension api docs](https://github.com/webtorrent/bittorrent-protocol#extension-api) for more
information on how to define a protocol extension.

## `torrent.on('noPeers', function (announceType) {})`

Emitted every couple of seconds when no peers have been found. `announceType` is either `'tracker'`, `'dht'`, `'lsd'`, or `'ut_pex'` depending on which announce occurred to trigger this event. Note that if you're attempting to discover peers from a tracker, a DHT, a LSD, and PEX you'll see this event separately for each.

## `torrent.on('verified', function (index) {})`

Emitted every time a piece is verified, the value of the event is the index of the verified piece.

# File API

Webtorrent Files closely mimic W3C [Files](https://developer.mozilla.org/en-US/docs/Web/API/File)/[Blobs](https://developer.mozilla.org/en-US/docs/Web/API/Blob) except for `slice` where instead you pass the offsets as objects to the arrayBuffer/stream/createReadStream functions.

## `file.name`

File name, as specified by the torrent. *Example: 'some-filename.txt'*

## `file.path`

File path, as specified by the torrent. *Example: 'some-folder/some-filename.txt'*

## `file.length` or `file.size`

File length (in bytes), as specified by the torrent. *Example: 12345*

## `file.type`

Mime type of the file, falls back to `application/octet-stream` if the type is not recognized.

## `file.downloaded`

Total *verified* bytes received from peers, for this file.

## `file.progress`

File download progress, from 0 to 1.

## `file.select([priority])`

Selects the file to be downloaded, at the given `priority`.
Useful if you know you need the file at a later stage.

## `file.deselect()`

Deselects the file's specific priority, which means it won't be downloaded unless someone creates a stream for it.

## `stream = file.createReadStream([opts])`

Create a [readable stream](https://nodejs.org/api/stream.html#stream_class_stream_readable)
to the file. Pieces needed by the stream will be prioritized highly and fetched from the
swarm first.

You can pass `opts` to stream only a slice of a file.

```js
{
  start: startByte,
  end: endByte
}
```

Both `start` and `end` are inclusive.

## `stream = file.stream(opts)`

Create a W3C [ReadableStream](https://devdocs.io/dom/readablestream)
to the file. Pieces needed by the stream will be prioritized highly and fetched from the
swarm first.

You can pass `opts` to stream only a slice of a file.

```js
{
  start: startByte,
  end: endByte
}
```

Both `start` and `end` are inclusive.

## `iterator = file[Symbol.asyncIterator]`

Create an [async iterator](https://devdocs.io/javascript/global_objects/symbol/asynciterator)
to the file. Pieces needed by the stream will be prioritized highly and fetched from the
swarm first.

You can pass `opts` to iterate only a slice of a file.

```js
{
  start: startByte,
  end: endByte
}
```

Both `start` and `end` are inclusive.

Example:

```js
for await (const chunk of file) {
  // do something with chunk
}
```

## `arrayBuffer = await file.arrayBuffer(opts)`

Get the file contents as a `ArrayBuffer`.

You can pass `opts` to get only a part of an ArrayBuffer.

```js
{
  start: startByte,
  end: endByte
}
```

```js
const data = await file.arrayBuffer()
console.log(data) // ArrayBuffer { [Uint8Contents]: <00 62 00 01>, byteLength: 4 }
```
## `blob = await file.blob(opts)`

Get a W3C `Blob` object which contains the file data.

Useful for creating Blob URLs via `URL.createObjectURL(blob)`.

You can pass `opts` to get only a part of an Blob.

```js
{
  start: startByte,
  end: endByte
}
```
## `file.streamTo(elem)` *(browser only)*

Requires `client.createServer` to be ran beforehand. Sets the element source to the file's streaming URL. Supports streaming, seeking and all browser codecs and containers.

Support table:
|Containers|Chromium|Mobile Chromium|Edge|Chrome|Firefox|
|-|:-:|:-:|:-:|:-:|:-:|
|3g2|✓|✓|✓|✓|✓|
|3gp|✓|✓|✓|✓|✘|
|avi|✘|✘|✘|✘|✘|
|m2ts|✘|✘|✓**|✘|✘|
|m4v etc.|✓*|✓*|✓*|✓*|✓*|
|mp4|✓|✓|✓|✓|✓|
|mpeg|✘|✘|✘|✘|✘|
|mov|✓|✓|✓|✓|✓|
|ogm ogv|✓|✓|✓|✓|✓|
|webm|✓|✓|✓|✓|✓|
|mkv|✓|✓|✓|✓|✘|

\* Container might be supported, but the container's codecs might not be.  
\*\* Documented as working, but can't reproduce.  

|Video Codecs|Chromium|Mobile Chromium|Edge|Chrome|Firefox|
|-|:-:|:-:|:-:|:-:|:-:|
|AV1|✓|✓|✓|✓|✓|
|H.263|✘|✘|✘|✘|✘|
|H.264|✓|✓|✓|✓|✓|
|H.265|✘|✘|✓*|✓|✘|
|MPEG-2/4|✘|✘|✘|✘|✘|
|Theora|✓|✘|✓|✓|✓|
|VP8/9|✓|✓|✓|✓|✓|

\* Requires MSStore extension which you can get by opening this link `ms-windows-store://pdp/?ProductId=9n4wgh0z6vhq` while using Edge.

|Audio Codecs|Chromium|Mobile Chromium|Edge|Chrome|Firefox|
|-|:-:|:-:|:-:|:-:|:-:|
|AAC|✓|✓|✓|✓|✓|
|AC3|✘|✘|✓|✘|✘|
|DTS|✘|✘|✘|✘|✘|
|EAC3|✘|✘|✓|✘|✘|
|FLAC|✓|✓*|✓|✓|✓|
|MP3|✓|✓|✓|✓|✓|
|Opus|✓|✓|✓|✓|✓|
|TrueHD|✘|✘|✘|✘|✘|
|Vorbis|✓|✓|✓|✓|✓*|

\* Might not work in some video containers.

Since container and codec support is browser dependent these values might change over time.
## `file.streamURL`

Requires `client.createServer` to be ran beforehand.

Returns the URL of the file which is recognized by the HTTP server.

This method is useful both for servers which run WebTorrent or client apps. A few examples:

```js
const url = file.streamURL

// create download link
if (err) throw err
const a = document.createElement('a')
a.target = "_blank"
a.href = url
a.textContent = 'Download ' + file.name
document.body.append(a)

// render an image on a canvas
const canvas = document.getElementById('canvas')
const ctx = canvas.getContext('2d')
const img = new Image()
const loaded = new Promise(resolve => img.onload = resolve)
img.src = url
await loaded
ctx.drawImage(img)

// send the file URL to another device on the network which can then display the file remotely [nodejs only]
import networkAddress from 'network-address'

const networkURL = `http://${networkAddress()}:${client._server.port}${url}`
sendRemote(networkURL)
```

## `file.on('stream', function ({ stream, file, req }, function pipeCallback) {})`

This is advanced functionality.

Emitted every time when the HTTP server creates a new read stream. For example every time the user seeks a video. This allows you to find out what parts of the file the browser is requesting, and how it's requesting them. Additionally it allows you to manipulate the data that's being streamed.

Yields an object with 3 values and a function:
- object - information about the request,
  - `stream` - a [readable stream](https://nodejs.org/api/stream.html#stream_class_stream_readable) which the user can manipulate,
  - `file` - the file object that's being streamed,
  - `req` - all the request information which the browser made when requesting the data.
- function - if you pipe the `stream`, use this function to callback the piped stream **synchronously!** Otherwise the playback is likely to break.

Example usage:
```js
file.on('stream', ({ stream, file, req }, cb) => {
  if (req.destination === 'audio' && file.name.endsWith('.dts')) {
    const transcoder = new SomeAudioTranscoder()
    cb(transcoder)
    // do other things
  }
})
```

## `file.on('iterator', function ({ stream, file, req }, function transformCallback) {})`

This is advanced functionality.

Same as with the `stream` event this is emitted by the HTTP server when it creates an async iterator for the file's data. This is used for very low-level manipulation of the incoming data and they way it's generated for example you could potentially accelerate how fast and how much data is pulled from the torrent.

Yields an object with 3 values and a function:
- object - information about the request,
  - `iterator` - an [async iterator](https://devdocs.io/javascript/global_objects/symbol/asynciterator) which the user can manipulate,
  - `file` - the file object that's being streamed,
  - `req` - all the request information which the browser made when requesting the data.
- function - if you wish to transform the `iterator`, use this function to callback the transformed iterator **synchronously!** Otherwise the playback is likely to break.

Example usage:
```js
import par from 'it-parallel'

file.on('iterator', ({ iterator, file, req }, cb) => {
  const transform = par(iterator, { concurrency: 5, ordered: true })
  cb(transform)
})
```

## `file.includes(piece)`
Check if the piece number contains this file's data.

## `file.on('done', function () {})`

Emitted when the file has been downloaded.

# Piece API

## `piece.length`

Piece length (in bytes). *Example: 12345*

## `piece.missing`

Piece missing length (in bytes). *Example: 100*

# Wire API

## `wire.peerId`

Remote peer id (hex string)

## `wire.type`

Connection type ('webrtc', 'tcpIncoming', 'tcpOutgoing', 'utpIncoming', 'utpOutgoing', 'webSeed')

## `wire.uploaded`

Total bytes uploaded to peer.

## `wire.downloaded`

Total bytes downloaded from peer.

## `wire.uploadSpeed`

Peer upload speed, in bytes/sec.

## `wire.downloadSpeed`

Peer download speed, in bytes/sec.

## `wire.remoteAddress`

Peer's remote address. Only exists for tcp/utp peers.

## `wire.remotePort`

Peer's remote port. Only exists for tcp/utp peers.

## `wire.destroy()`

Close the connection with the peer. This however doesn't prevent the peer from simply re-connecting.

````

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
    "./export": "./src/export/mod.ts",
    "./webtorrent": "./src/webtorrent/mod.ts",
    "./eventbus": "./src/eventbus/mod.ts"
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
  | "sw"
  | "webtorrent";

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
  webtorrent: {
    arquivoSaida: "snapshots/webtorrent.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/webtorrent",
    subpastasPermitidas: ["src", "public", "tests", "docs"],
    arquivosRaizPermitidos: ["deno.json", "deno.jsonc", "readme.md", "server.ts"],
    incluiVersao: false,
    instrucaoCustomizada: "O texto abaixo contém experimentos e código da área de WEBTORRENT.",
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
// deno-lint-ignore no-explicit-any
const buildWithDenoPlugin = (options: any): Promise<any> => {
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
    entryPoints: ["app.tsx"],
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
    keepNames: true,
    splitting: false,
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
    entryPoints: ["worker-opfs/opfs.worker.ts"],
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
    keepNames: true,
    splitting: false,
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
    entryPoints: ["service-worker.ts"],
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
    keepNames: true,
    splitting: false,
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
       "worker.ts", 
       "functions/ping.ts",
       "functions/publickey.ts",
       "functions/push.ts",
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
    entryPoints: ["app.tsx"],
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
    // 🔥 CORREÇÃO: outfile agora é RELATIVO ao distdir
    outfile: "app.js",
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
    entryPoints: ["main.tsx"],
    // 🔥 CORREÇÃO: outfile agora é RELATIVO ao distdir
    outfile: "main.js",
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
    const currentVer = await currentVersion(DENO_JSONC_PATH);

    if (watchTarget) {
      await startWatchMode(watchTarget, currentVer);
      return;
    }

    const finalVersion = globalNoVersion
      ? currentVer
      : await incrementVersion(currentVer, DENO_JSONC_PATH);

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

  await copyStaticFiles(config, currentVer);

  const esbuildOptions = await buildEsbuildOptions(watchTargetName, config, currentVer);
  
  esbuildOptions.plugins = [...(esbuildOptions.plugins || []), denoPlugin()];

  const ctx = await esbuild.context(esbuildOptions);
  await ctx.watch();
  
  console.log("\n✅ Watch mode ativo!");
  console.log(`📁 Monitorando: ${config.srcdir}/`);
  
  // 🔥 CORREÇÃO: Mostra o outfile resolvido (relativo ao distdir)
  const resolvedOutfile = esbuildOptions.outfile || (config.distdir ? `${config.distdir}/` : 'N/A');
  console.log(`📦 Output: ${resolvedOutfile}`);
  console.log(`📌 Versão: v${currentVer}`);
  console.log("\n💡 Pressione Ctrl+C para parar.\n");

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
    entryPoints: ["app.tsx"],
    platform: "browser",
    format: "esm",
    minify: false,
    sourcemap: "linked",
    keepNames: true,
    codeSplitting: false,
    packages: "bundle",
    inlineImports: true
  },
  worker: {
    mode: "build",
    default: true,
    srcdir: "monorepo/ui/src",
    distdir: "monorepo/server/build/dist",
    clean: ["opfs.worker.js", "opfs.worker.js.map"],
    entryPoints: ["worker-opfs/opfs.worker.ts"],
    platform: "browser",
    format: "esm",
    minify: false,
    sourcemap: "linked",
    indexHtml: false,
    keepNames: true,
    codeSplitting: false,
    packages: "bundle",
    inlineImports: true
  },
  sw: {
    mode: "build",
    default: true,
    srcdir: "monorepo/service-worker/src",
    distdir: "monorepo/server/build/dist",
    clean: ["service-worker.js", "service-worker.js.map"],
    entryPoints: ["service-worker.ts"],
    platform: "browser",
    format: "esm",
    minify: false,
    sourcemap: "linked",
    indexHtml: false,
    keepNames: true,
    codeSplitting: false,
    packages: "bundle",
    inlineImports: true
  },
  server: {
   mode: 'build',
    default: true,
    srcdir: "monorepo/server/src",
    distdir: "monorepo/server/build",
    clean: ["worker.js", "worker.js.map", "functions"],
    entryPoints: [
       "worker.ts", 
       "functions/ping.ts",
       "functions/publickey.ts",
       "functions/push.ts",
     ],
    platform: "browser",
    format: "esm",
    minify: false,
    sourcemap: "linked",
    indexHtml: false,
    keepNames: true,
    codeSplitting: false,
    packages: "bundle",
    inlineImports: true
  },
  playground: {
    mode: "build",
    default: false,
    srcdir: "monorepo/playground/src",
    distdir: "monorepo/playground/build/dist",
    publicdir: "monorepo/playground/public",
    indexHtml: true,
    clean: ["."],
    entryPoints: ["main.tsx"],
    // 🔥 CORREÇÃO: outfile agora é RELATIVO ao distdir
    outfile: "main.js",
    platform: "browser",
    format: "esm",
    minify: false,
    sourcemap: "linked",
    keepNames: true,
    codeSplitting: false,
    packages: "bundle"
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
    const currentVer = await currentVersion(DENO_JSONC_PATH);

    const finalVersion = globalNoVersion
      ? currentVer
      : await incrementVersion(currentVer, DENO_JSONC_PATH);

    for (const targetName of targets) {
      const targetConfig = CONFIG[targetName];
      if (!targetConfig) {
        console.warn(
          `⚠️ Alvo '${targetName}' não encontrado no CONFIG. Pulando.`,
        );
        continue;
      }

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

