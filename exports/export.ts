/**
 * @file export.ts
 * @description Script de consolidação de contexto para IAs com suporte a parâmetros via CLI,
 * configuração baseada em diretório raiz (pastaBase) e filtros granulares por subpastas.
 */

import { walk } from "@std/fs/walk";
import { relative } from "@std/path/relative";
import { APP_VERSION } from "@loco/utils/config";

// 1. Definição de Tipos e Interfaces
export type ModoExportacao = "ui" | "docs" | "tests" | "server" | "playground" | "workerdb" | "utils" | "router" | "sw";

export interface ExportConfig {
  arquivoSaida: string;
  extensoesPermitidas: string[];
  pastaBase: string;
  subpastasPermitidas: string[];
  caminhosAdicionaisPermitidos?: string[];
  arquivosRaizPermitidos: string[];
  incluiVersao: boolean;
  instrucaoCustomizada: string;
}

// Extensões padrão reutilizáveis
export const EXTENSOES_PADRAO = [
  ".tsx", ".jsx", ".js", ".ts", ".css", ".html", ".manifest", ".map",
  ".sh", ".py", ".json", ".jsonc", ".yaml", ".yml", ".toml", ".env.example", ".md"
];

// 2. Dicionário de Configurações (Declarativo)
export const CONFIGURACOES: Record<ModoExportacao, ExportConfig> = {
  ui: {
    arquivoSaida: "snapshots/ui.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "./monorepo/ui/",
    subpastasPermitidas: ["src", "public", "tests", "docs"],
    arquivosRaizPermitidos: ["build.ts", "deno.json", "deno.jsonc", "readme.md"],
    incluiVersao: true,
    instrucaoCustomizada: "O texto abaixo contém os arquivos de CÓDIGO FONTE principais da aplicação (UI)."
  },
  docs: {
    arquivoSaida: "snapshots/docs.md",
    extensoesPermitidas: [".md", ".txt"],
    pastaBase: "./",
    subpastasPermitidas: ["docs"],
    arquivosRaizPermitidos: ["readme.md", "readme", "license", "license.md", "license.txt", ".tool-versions"],
    incluiVersao: true,
    instrucaoCustomizada: "O texto abaixo contém a DOCUMENTAÇÃO e diretrizes arquiteturais do projeto."
  },
  tests: {
    arquivoSaida: "snapshots/tests.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "./monorepo/ui/tests",
    subpastasPermitidas: [],
    arquivosRaizPermitidos: [],
    incluiVersao: true,
    instrucaoCustomizada: "O texto abaixo contém os TESTES unitários e de integração do projeto."
  },
  server: {
    arquivoSaida: "snapshots/server.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/server",
    subpastasPermitidas: ["src", "tests", "docs"],
    caminhosAdicionaisPermitidos: [".github/workflows"],
    arquivosRaizPermitidos: ["build.ts", "deno.json", "deno.jsonc", "readme.md", "minify-keys.ts", "wrangler-worker.toml", "wrangler-pages.toml", "deploy.sh"],
    incluiVersao: false,
    instrucaoCustomizada: "O texto abaixo contém os arquivos de configuração e execução do SERVIDOR @loco/server e CI/CD."
  },
  playground: {
    arquivoSaida: "snapshots/playground.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/playground",
    subpastasPermitidas: ["src", "public", "tests", "docs"],
    arquivosRaizPermitidos: ["build.ts", "deno.json", "deno.jsonc", "readme.md", "server.ts"],
    incluiVersao: false,
    instrucaoCustomizada: "O texto abaixo contém experimentos e código da área de PLAYGROUND."
  },
  workerdb: {
    arquivoSaida: "snapshots/worker-db.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/worker-db",
    subpastasPermitidas: ["src", "tests", "docs", "example"],
    arquivosRaizPermitidos: ["build.ts", "deno.json", "deno.jsonc", "readme.md"],
    incluiVersao: false,
    instrucaoCustomizada: "O texto abaixo contém experimentos e código da área de @loco/workerdb"
  },
  utils: {
    arquivoSaida: "snapshots/utils.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/utils",
    subpastasPermitidas: ["src", "tests", "docs"],
    arquivosRaizPermitidos: ["deno.json", "deno.jsonc", "readme.md"],
    incluiVersao: false,
    instrucaoCustomizada: "O texto abaixo contém experimentos e código da área de @loco/utils"
  },
  sw: {
    arquivoSaida: "snapshots/sw.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/utils",
    subpastasPermitidas: ["src", "tests", "docs"],
    arquivosRaizPermitidos: ["deno.json", "deno.jsonc", "readme.md"],
    incluiVersao: false,
    instrucaoCustomizada: "O texto abaixo contém experimentos e código da área de @loco/service-worker"
  },
  router: {
    arquivoSaida: "snapshots/router.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/router",
    subpastasPermitidas: ["src", "tests", "docs", "example"],
    arquivosRaizPermitidos: ["deno.json", "deno.jsonc", "readme.md"],
    incluiVersao: false,
    instrucaoCustomizada: "O texto abaixo contém os arquivos de configuração e execução do ROUTER @loco/router"
  }
};

function calcularCraseWrapper(texto: string): string {
  const matches = texto.match(/`+/g);
  if (!matches) return "```";
  const maiorSequencia = Math.max(...matches.map(m => m.length));
  const tamanhoNecessario = Math.max(3, maiorSequencia + 1);
  return "`".repeat(tamanhoNecessario);
}

function normalizarCaminho(caminho: string): string {
  return caminho.replace(/\\/g, "/").toLowerCase();
}

export function deveIncluirArquivo(caminhoRelativo: string, config: ExportConfig): boolean {
  const caminhoNormalizado = normalizarCaminho(caminhoRelativo);
  
  if (caminhoNormalizado.startsWith("exports/")) {
    return false;
  }

  if (config.caminhosAdicionaisPermitidos && config.caminhosAdicionaisPermitidos.length > 0) {
    const correspondeAdicional = config.caminhosAdicionaisPermitidos.some(caminhoExtra => {
      const extraNormalizado = normalizarCaminho(caminhoExtra);
      return caminhoNormalizado === extraNormalizado || caminhoNormalizado.startsWith(extraNormalizado + "/");
    });

    if (correspondeAdicional) {
      return config.extensoesPermitidas.some(ext =>
        caminhoNormalizado.endsWith(ext) || caminhoNormalizado === ext
      );
    }
  }

  const prefixoBase = (config.pastaBase === "./" || config.pastaBase === ".") 
    ? "" 
    : normalizarCaminho(config.pastaBase).replace(/\/$/, "") + "/";

  if (prefixoBase !== "" && !caminhoNormalizado.startsWith(prefixoBase)) {
    return false;
  }

  const caminhoInterno = caminhoNormalizado.substring(prefixoBase.length);

  if (config.arquivosRaizPermitidos.includes(caminhoInterno)) {
    return true;
  }

  let emSubpastaPermitida = false;

  if (config.subpastasPermitidas.length === 0) {
    emSubpastaPermitida = true;
  } else {
    emSubpastaPermitida = config.subpastasPermitidas.some(sub => {
      const subNormalizada = normalizarCaminho(sub) + "/";
      return caminhoInterno.startsWith(subNormalizada) || caminhoInterno === normalizarCaminho(sub);
    });
  }

  if (emSubpastaPermitida) {
    if (config.extensoesPermitidas.length === 0) return true;
    return config.extensoesPermitidas.some(ext => 
      caminhoNormalizado.endsWith(ext) || caminhoNormalizado === ext
    );
  }

  return false;
}

const argModo = (Deno.args[0]?.toLowerCase() || "ui") as ModoExportacao;
const modo: ModoExportacao = CONFIGURACOES[argModo] ? argModo : "ui";
const config = CONFIGURACOES[modo];
const versaoDisplay = config.incluiVersao ? `[v${APP_VERSION}] ` : "";
const conteudoInicial = `> **INSTRUÇÃO PARA A IA:** 
> ${config.instrucaoCustomizada}
> O projeto é o **Loco ${versaoDisplay}** estruturado em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: \`## Arquivo: src/main.ts\`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco ${versaoDisplay}- Modo: ${modo.toUpperCase()}

Gerado automaticamente em: ${new Date().toLocaleString()}

---

`;

// 5. Varredura do diretório principal (APENAS se executado diretamente)
if (import.meta.main) {
  console.log(`🚀 Iniciando exportação do Loco ${versaoDisplay}no modo: [${modo.toUpperCase()}] -> Gerando '${config.arquivoSaida}'`);
  let conteudoFinal = conteudoInicial;
  for await (const entry of walk(".", { includeDirs: false })) {
    const caminhoRelativo = relative(".", entry.path);
    if (deveIncluirArquivo(caminhoRelativo, config)) {
      try {
        console.log(` 📄 Incluindo: ${caminhoRelativo}`);
        const conteudoArquivo = await Deno.readTextFile(entry.path);
        
        let extensaoMarkdown = caminhoRelativo.split(".").pop() || "";
        if (extensaoMarkdown === "manifest") extensaoMarkdown = "json";
        if (extensaoMarkdown === "jsonc") extensaoMarkdown = "json";
        if (extensaoMarkdown === "yml") extensaoMarkdown = "yaml";
        if (extensaoMarkdown === "sh") extensaoMarkdown = "bash";
        if (caminhoRelativo.includes(".env")) extensaoMarkdown = "properties";

        const wrapperCrasis = calcularCraseWrapper(conteudoArquivo);

        conteudoFinal += `## Arquivo: \`${caminhoRelativo}\`\n\n`;
        conteudoFinal += `${wrapperCrasis}${extensaoMarkdown}\n`;
        conteudoFinal += conteudoArquivo;
        conteudoFinal += `\n${wrapperCrasis}\n\n---\n\n`;
      } catch (erro) {
        if (erro instanceof Error) {
          console.error(`❌ Erro ao ler ${caminhoRelativo}:`, erro.message);
        }
      }
    }
  }

  await Deno.writeTextFile(config.arquivoSaida, conteudoFinal);
  console.log(`\n✨ Prontinho! O arquivo ${config.arquivoSaida} foi gerado com sucesso.`);
}