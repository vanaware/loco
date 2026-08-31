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