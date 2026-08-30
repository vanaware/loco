/// <reference lib="deno.ns" />

/**
 * @file export.ts
 * @description Script de consolidação de contexto para IAs com suporte a parâmetros via CLI.
 * Contém as configurações específicas do projeto Loco e a lógica de execução.
 * A lógica pura reutilizável está em @loco/utils/export.
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
  | "tests"
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
    caminhosAdicionaisPermitidos: ["deno.json", "deno.jsonc"],
    arquivosRaizPermitidos: ["build.ts", "deno.json", "deno.jsonc", "readme.md"],
    incluiVersao: true,
    instrucaoCustomizada: "O texto abaixo contém os arquivos de CÓDIGO FONTE principais da aplicação (UI).",
  },
  docs: {
    arquivoSaida: "snapshots/docs.md",
    extensoesPermitidas: [".md", ".txt"],
    pastaBase: "./",
    subpastasPermitidas: ["docs"],
    arquivosRaizPermitidos: ["readme.md", "readme", "license", "license.md", "license.txt", ".tool-versions"],
    incluiVersao: true,
    instrucaoCustomizada: "O texto abaixo contém a DOCUMENTAÇÃO e diretrizes arquiteturais do projeto.",
  },
  tests: {
    arquivoSaida: "snapshots/tests.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "./monorepo/ui/tests",
    subpastasPermitidas: [],
    caminhosAdicionaisPermitidos: ["deno.json", "deno.jsonc", "./monorepo/ui/deno.jsonc", "./monorepo/ui/deno.jsonc"],
    arquivosRaizPermitidos: [],
    incluiVersao: true,
    instrucaoCustomizada: "O texto abaixo contém os TESTES unitários e de integração do projeto.",
  },
  server: {
    arquivoSaida: "snapshots/server.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/server",
    subpastasPermitidas: ["src", "tests", "docs"],
    caminhosAdicionaisPermitidos: [".github/workflows", "deno.json", "deno.jsonc"],
    arquivosRaizPermitidos: [
      "build.ts", "deno.json", "deno.jsonc", "readme.md",
      "minify-keys.ts", "wrangler-worker.toml", "wrangler-pages.toml", "deploy.sh"
    ],
    incluiVersao: false,
    instrucaoCustomizada: "O texto abaixo contém os arquivos de configuração e execução do SERVIDOR @loco/server e CI/CD.",
  },
  playground: {
    arquivoSaida: "snapshots/playground.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/playground",
    subpastasPermitidas: ["src", "public", "tests", "docs"],
    caminhosAdicionaisPermitidos: ["deno.json", "deno.jsonc"],
    arquivosRaizPermitidos: ["build.ts", "deno.json", "deno.jsonc", "readme.md", "server.ts"],
    incluiVersao: false,
    instrucaoCustomizada: "O texto abaixo contém experimentos e código da área de PLAYGROUND.",
  },
  workerdb: {
    arquivoSaida: "snapshots/worker-db.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/worker-db",
    subpastasPermitidas: ["src", "tests", "docs", "example"],
    caminhosAdicionaisPermitidos: ["deno.json", "deno.jsonc"],
    arquivosRaizPermitidos: ["build.ts", "deno.json", "deno.jsonc", "readme.md"],
    incluiVersao: false,
    instrucaoCustomizada: "O texto abaixo contém experimentos e código da área de @loco/workerdb",
  },
  utils: {
    arquivoSaida: "snapshots/utils.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/utils",
    subpastasPermitidas: ["src", "tests", "docs"],
    caminhosAdicionaisPermitidos: ["export.ts", "esbuild.ts", "deno.json", "deno.jsonc"],
    arquivosRaizPermitidos: ["deno.json", "deno.jsonc", "readme.md"],
    incluiVersao: false,
    instrucaoCustomizada: "O texto abaixo contém experimentos e código da área de @loco/utils",
  },
  sw: {
    arquivoSaida: "snapshots/sw.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/utils",
    subpastasPermitidas: ["src", "tests", "docs"],
    caminhosAdicionaisPermitidos: ["deno.json", "deno.jsonc"],
    arquivosRaizPermitidos: ["deno.json", "deno.jsonc", "readme.md"],
    incluiVersao: false,
    instrucaoCustomizada: "O texto abaixo contém experimentos e código da área de @loco/service-worker",
  },
  router: {
    arquivoSaida: "snapshots/router.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/router",
    subpastasPermitidas: ["src", "tests", "docs", "example"],
    caminhosAdicionaisPermitidos: ["deno.json", "deno.jsonc"],
    arquivosRaizPermitidos: ["deno.json", "deno.jsonc", "readme.md"],
    incluiVersao: false,
    instrucaoCustomizada: "O texto abaixo contém os arquivos de configuração e execução do ROUTER @loco/router",
  },
};

// ============================================================================
// 🎯 PARSE DE ARGUMENTOS CLI
// ============================================================================

const argModo = (Deno.args[0]?.toLowerCase() || "ui") as ModoExportacao;
const modo: ModoExportacao = CONFIGURACOES[argModo] ? argModo : "ui";
const config = CONFIGURACOES[modo];

// ============================================================================
// 🚀 EXECUÇÃO PRINCIPAL
// ============================================================================

if (import.meta.main) {
  const versaoDisplay = config.incluiVersao ? `[v${APP_VERSION}] ` : "";

  console.log(
    `🚀 Iniciando exportação do Loco ${versaoDisplay}no modo: [${modo.toUpperCase()}] -> Gerando '${config.arquivoSaida}'`
  );

  // Gera o cabeçalho do snapshot
  let conteudoFinal = gerarCabecalho(config, modo, APP_VERSION);

  // Varre o diretório atual e filtra os arquivos
  for await (const entry of walk(".", { includeDirs: false })) {
    const caminhoRelativo = relative(".", entry.path);

    if (deveIncluirArquivo(caminhoRelativo, config)) {
      try {
        console.log(` 📄 Incluindo: ${caminhoRelativo}`);
        const conteudoArquivo = await Deno.readTextFile(entry.path);
        conteudoFinal += formatarArquivoMarkdown(caminhoRelativo, conteudoArquivo);
      } catch (erro) {
        if (erro instanceof Error) {
          console.error(`❌ Erro ao ler ${caminhoRelativo}:`, erro.message);
        }
      }
    }
  }

  // Escreve o arquivo final
  await Deno.writeTextFile(config.arquivoSaida, conteudoFinal);
  console.log(`\n✨ Prontinho! O arquivo ${config.arquivoSaida} foi gerado com sucesso.`);
}