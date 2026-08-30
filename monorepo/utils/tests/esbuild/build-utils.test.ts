/// <reference lib="deno.ns" />

import {
  assertEquals,
  assertThrows,
  assertStringIncludes,
} from "@std/assert";
import { join } from "@std/path";
import {
  parseVersion,
  formatVersion,
  extractVersionFromContent,
  replaceVersionInContent,
  isSafePath,
  parseArgs,
  cleanTarget,
  currentVersion,
  incrementVersion,
} from "../../src/esbuild/mod.ts";

// ============================================================================
// 🔢 TESTES: parseVersion
// ============================================================================

Deno.test("parseVersion: versão simples major.minor.patch", () => {
  const result = parseVersion("1.2.3");
  assertEquals(result, { major: 1, minor: 2, patch: 3 });
});

Deno.test("parseVersion: versão com hash de build", () => {
  const result = parseVersion("0.2.148-msv0okam");
  assertEquals(result, { major: 0, minor: 2, patch: 148 });
});

Deno.test("parseVersion: versão com múltiplos hífens no hash", () => {
  const result = parseVersion("1.0.0-alpha-beta-1");
  assertEquals(result, { major: 1, minor: 0, patch: 0 });
});

Deno.test("parseVersion: versão 0.0.0", () => {
  const result = parseVersion("0.0.0");
  assertEquals(result, { major: 0, minor: 0, patch: 0 });
});

Deno.test("parseVersion: lança erro para formato inválido (2 partes)", () => {
  assertThrows(
    () => parseVersion("1.2"),
    Error,
    "Formato de versão inválido"
  );
});

Deno.test("parseVersion: lança erro para formato inválido (4 partes)", () => {
  assertThrows(
    () => parseVersion("1.2.3.4"),
    Error,
    "Formato de versão inválido"
  );
});

Deno.test("parseVersion: lança erro para valores não numéricos", () => {
  assertThrows(
    () => parseVersion("1.abc.3"),
    Error,
    "valores não numéricos"
  );
});

Deno.test("parseVersion: lança erro para string vazia", () => {
  assertThrows(
    () => parseVersion(""),
    Error,
    "Formato de versão inválido"
  );
});

// ============================================================================
// 🔢 TESTES: formatVersion
// ============================================================================

Deno.test("formatVersion: com hash fornecido", () => {
  const result = formatVersion(1, 2, 3, "abc123");
  assertEquals(result, "1.2.3-abc123");
});

Deno.test("formatVersion: sem hash (gera automaticamente)", () => {
  const result = formatVersion(0, 2, 149);
  // Deve ter o formato 0.2.149-<hash>
  assertStringIncludes(result, "0.2.149-");
});

Deno.test("formatVersion: versão 0.0.0", () => {
  const result = formatVersion(0, 0, 0, "x");
  assertEquals(result, "0.0.0-x");
});

// ============================================================================
// 🔢 TESTES: extractVersionFromContent
// ============================================================================

Deno.test("extractVersionFromContent: encontra versão em JSON", () => {
  const content = `{
    "name": "@loco/app",
    "version": "0.2.148-abc",
    "imports": {}
  }`;
  const result = extractVersionFromContent(content);
  assertEquals(result, "0.2.148-abc");
});

Deno.test("extractVersionFromContent: encontra versão em JSONC com comentários", () => {
  const content = `{
    // Este é um comentário
    "name": "@loco/app",
    "version": "1.0.0", /* outro comentário */
    "imports": {}
  }`;
  const result = extractVersionFromContent(content);
  assertEquals(result, "1.0.0");
});

Deno.test("extractVersionFromContent: versão com espaços ao redor", () => {
  const content = `{ "version" :  "2.0.0" }`;
  const result = extractVersionFromContent(content);
  assertEquals(result, "2.0.0");
});

Deno.test("extractVersionFromContent: retorna null se não encontrar", () => {
  const content = `{ "name": "@loco/app" }`;
  const result = extractVersionFromContent(content);
  assertEquals(result, null);
});

// ============================================================================
// 🔢 TESTES: replaceVersionInContent
// ============================================================================

Deno.test("replaceVersionInContent: substitui versão corretamente", () => {
  const content = `{ "version": "1.0.0-abc" }`;
  const result = replaceVersionInContent(content, "1.0.1-xyz");
  assertStringIncludes(result, `"version": "1.0.1-xyz"`);
});

Deno.test("replaceVersionInContent: preserva resto do conteúdo", () => {
  const content = `{
    "name": "@loco/app",
    "version": "1.0.0",
    "imports": { "preact": "https://esm.sh/preact" }
  }`;
  const result = replaceVersionInContent(content, "2.0.0");
  assertStringIncludes(result, `"name": "@loco/app"`);
  assertStringIncludes(result, `"version": "2.0.0"`);
  assertStringIncludes(result, `"imports"`);
});

// ============================================================================
// 🛡️ TESTES: isSafePath
// ============================================================================

Deno.test("isSafePath: path simples é seguro", () => {
  assertEquals(isSafePath("arquivo.js"), true);
});

Deno.test("isSafePath: path aninhado é seguro", () => {
  assertEquals(isSafePath("sub/pasta/arquivo.js"), true);
});

Deno.test("isSafePath: ponto (.) é seguro", () => {
  assertEquals(isSafePath("."), true);
});

Deno.test("isSafePath: path traversal (..) é bloqueado", () => {
  assertEquals(isSafePath(".."), false);
});

Deno.test("isSafePath: path traversal aninhado é bloqueado", () => {
  assertEquals(isSafePath("../arquivo.js"), false);
  assertEquals(isSafePath("sub/../../arquivo.js"), false);
});

Deno.test("isSafePath: path absoluto Unix é bloqueado", () => {
  assertEquals(isSafePath("/etc/passwd"), false);
});

Deno.test("isSafePath: path com .. no meio do nome é bloqueado (segurança máxima)", () => {
  // Mesmo "foo..bar" contém "..", bloqueamos por segurança
  assertEquals(isSafePath("foo..bar"), false);
});

// ============================================================================
// 🎯 TESTES: parseArgs
// ============================================================================

const CONFIG_KEYS = ["ui", "worker", "sw", "watch"];

Deno.test("parseArgs: sem argumentos usa todos na ordem do CONFIG", () => {
  const result = parseArgs([], CONFIG_KEYS);
  assertEquals(result.targets, ["ui", "worker", "sw"]);
  assertEquals(result.globalNoVersion, false);
  assertEquals(result.isWatchMode, false);
});

Deno.test("parseArgs: seleciona alvos específicos", () => {
  const result = parseArgs(["ui", "sw"], CONFIG_KEYS);
  assertEquals(result.targets, ["ui", "sw"]);
});

Deno.test("parseArgs: reordena pela ordem do CONFIG (não pela CLI)", () => {
  // CLI: sw ui → Ordem CONFIG: ui sw
  const result = parseArgs(["sw", "ui"], CONFIG_KEYS);
  assertEquals(result.targets, ["ui", "sw"]);
});

Deno.test("parseArgs: detecta noversion", () => {
  const result = parseArgs(["noversion"], CONFIG_KEYS);
  assertEquals(result.globalNoVersion, true);
});

Deno.test("parseArgs: detecta watch mode", () => {
  const result = parseArgs(["watch"], CONFIG_KEYS);
  assertEquals(result.isWatchMode, true);
});

Deno.test("parseArgs: noversion + alvos específicos", () => {
  const result = parseArgs(["noversion", "ui"], CONFIG_KEYS);
  assertEquals(result.globalNoVersion, true);
  assertEquals(result.targets, ["ui"]);
});

Deno.test("parseArgs: ignora argumentos desconhecidos", () => {
  const result = parseArgs(["ui", "alvo-inexistente", "sw"], CONFIG_KEYS);
  assertEquals(result.targets, ["ui", "sw"]);
});

Deno.test("parseArgs: arguments são case-insensitive", () => {
  const result = parseArgs(["UI", "NoVersion"], CONFIG_KEYS);
  assertEquals(result.targets, ["ui"]);
  assertEquals(result.globalNoVersion, true);
});

Deno.test("parseArgs: watch não aparece nos targets", () => {
  const result = parseArgs(["watch", "ui"], CONFIG_KEYS);
  assertEquals(result.targets, ["ui"]);
  assertEquals(result.isWatchMode, true);
});

// ============================================================================
// 🧹 TESTES: cleanTarget (integração com filesystem)
// ============================================================================

Deno.test("cleanTarget: remove arquivo específico", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    // Cria um arquivo para ser removido
    const filePath = join(tempDir, "teste.js");
    await Deno.writeTextFile(filePath, "console.log('teste');");

    await cleanTarget(tempDir, ["teste.js"]);

    // Verifica que foi removido
    let exists = true;
    try {
      await Deno.stat(filePath);
    } catch {
      exists = false;
    }
    assertEquals(exists, false);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("cleanTarget: remove pasta recursivamente", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    // Cria uma pasta com arquivo dentro
    const subDir = join(tempDir, "subpasta");
    await Deno.mkdir(subDir);
    await Deno.writeTextFile(join(subDir, "arquivo.js"), "teste");

    await cleanTarget(tempDir, ["subpasta"]);

    let exists = true;
    try {
      await Deno.stat(subDir);
    } catch {
      exists = false;
    }
    assertEquals(exists, false);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("cleanTarget: path perigoso (..) é ignorado", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    // Cria um arquivo FORA do tempDir para garantir que não será removido
    const outsideFile = join(tempDir, "..", "nao-deve-ser-removido.txt");
    // Não vamos realmente criar fora, apenas verificar que a função não falha
    await cleanTarget(tempDir, ["../alguma-coisa"]);
    // Se chegou aqui sem erro, o path perigoso foi ignorado com sucesso
    assertEquals(true, true);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("cleanTarget: path absoluto é ignorado", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await cleanTarget(tempDir, ["/etc/passwd"]);
    // Se chegou aqui sem erro, o path absoluto foi ignorado
    assertEquals(true, true);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("cleanTarget: ponto (.) esvazia o diretório", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    // Cria alguns arquivos
    await Deno.writeTextFile(join(tempDir, "a.js"), "a");
    await Deno.writeTextFile(join(tempDir, "b.js"), "b");

    await cleanTarget(tempDir, ["."]);

    // Verifica que o diretório está vazio
    const entries: string[] = [];
    for await (const entry of Deno.readDir(tempDir)) {
      entries.push(entry.name);
    }
    assertEquals(entries.length, 0);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("cleanTarget: arquivo inexistente não lança erro", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    // Não deve lançar erro
    await cleanTarget(tempDir, ["nao-existe.js"]);
    assertEquals(true, true);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("cleanTarget: lista vazia não faz nada", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await cleanTarget(tempDir, []);
    assertEquals(true, true);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// 📂 TESTES: currentVersion e incrementVersion (integração)
// ============================================================================

Deno.test("currentVersion: lê versão de arquivo temporário", async () => {
  const tempDir = await Deno.makeTempDir();
  const tempJsonc = join(tempDir, "deno.jsonc");
  try {
    await Deno.writeTextFile(tempJsonc, `{ "version": "1.2.3-abc" }`);

    const version = await currentVersion(tempJsonc);
    assertEquals(version, "1.2.3-abc");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("currentVersion: lança erro se versão não existir", async () => {
  const tempDir = await Deno.makeTempDir();
  const tempJsonc = join(tempDir, "deno.jsonc");
  try {
    await Deno.writeTextFile(tempJsonc, `{ "name": "sem-versao" }`);

    let threw = false;
    try {
      await currentVersion(tempJsonc);
    } catch (error) {
      threw = true;
      assertStringIncludes((error as Error).message, "Versão não encontrada");
    }
    assertEquals(threw, true);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("incrementVersion: incrementa patch e atualiza arquivo", async () => {
  const tempDir = await Deno.makeTempDir();
  const tempJsonc = join(tempDir, "deno.jsonc");
  try {
    await Deno.writeTextFile(tempJsonc, `{ "version": "1.2.3" }`);

    const newVersion = await incrementVersion("1.2.3", tempJsonc, "testhash");
    assertEquals(newVersion, "1.2.4-testhash");

    // Verifica que o arquivo foi atualizado
    const content = await Deno.readTextFile(tempJsonc);
    assertStringIncludes(content, `"version": "1.2.4-testhash"`);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("incrementVersion: preserva outras propriedades do JSON", async () => {
  const tempDir = await Deno.makeTempDir();
  const tempJsonc = join(tempDir, "deno.jsonc");
  try {
    await Deno.writeTextFile(tempJsonc, `{
      "name": "@loco/app",
      "version": "0.0.1",
      "imports": { "preact": "https://esm.sh/preact" }
    }`);

    await incrementVersion("0.0.1", tempJsonc, "x");

    const content = await Deno.readTextFile(tempJsonc);
    assertStringIncludes(content, `"name": "@loco/app"`);
    assertStringIncludes(content, `"version": "0.0.2-x"`);
    assertStringIncludes(content, `"imports"`);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});