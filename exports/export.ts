/**
 * @file export.ts
 * @description Script de consolidação de contexto para IAs com suporte a parâmetros via CLI,
 * configuração baseada em diretório raiz (pastaBase) e filtros granulares por subpastas.
 * 
 * USO VIA DENO TASKS (EXECUTAR NA RAIZ DO REPOSITÓRIO):
 * - deno task export            -> Exporta Código Fonte principal
 * - deno task export docs       -> Exporta Documentação e licenças
 * - deno task export tests      -> Exporta Testes
 * - deno task export server     -> Exporta Server + .github/workflows
 * - deno task export playground -> Exporta a área de Playground
 */

import { walk } from "@std/fs/walk";
import { relative } from "@std/path/relative";
import { APP_VERSION } from "@loco/ui";

// 1. Definição de Tipos e Interfaces
type ModoExportacao = "ui" | "docs" | "tests" | "server" | "playground" | "workerdb" | "utils" | "router" | "sw";

interface ExportConfig {
  arquivoSaida: string;
  extensoesPermitidas: string[];
  pastaBase: string;
  subpastasPermitidas: string[];
  /**
   * NOVO: Permite incluir caminhos específicos que estão fora da pastaBase.
   * Devem ser relativos ao diretório de onde o script é executado (geralmente a raiz do repo).
   */
  caminhosAdicionaisPermitidos?: string[];
  arquivosRaizPermitidos: string[];
  incluiVersao: boolean;
  instrucaoCustomizada: string;
}

// Extensões padrão reutilizáveis
const EXTENSOES_PADRAO = [
  ".tsx", ".jsx", ".js", ".ts", ".css", ".html", ".manifest", ".map",
  ".sh", ".py", ".json", ".jsonc", ".yaml", ".yml", ".toml", ".env.example", ".md"
];

// 2. Dicionário de Configurações (Declarativo)
const CONFIGURACOES: Record<ModoExportacao, ExportConfig> = {
  ui: {
    arquivoSaida: "exports/ui.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "./monorepo/ui/",
    subpastasPermitidas: ["src", "public", "tests", "docs"],
    arquivosRaizPermitidos: ["build.ts", "deno.json", "deno.jsonc", "readme.md"],
    incluiVersao: true,
    instrucaoCustomizada: "O texto abaixo contém os arquivos de CÓDIGO FONTE principais da aplicação (UI)."
  },
  docs: {
    arquivoSaida: "exports/docs.md",
    extensoesPermitidas: [".md", ".txt"],
    pastaBase: "./",
    subpastasPermitidas: ["docs"],
    arquivosRaizPermitidos: ["readme.md", "readme", "license", "license.md", "license.txt", ".tool-versions"],
    incluiVersao: true,
    instrucaoCustomizada: "O texto abaixo contém a DOCUMENTAÇÃO e diretrizes arquiteturais do projeto."
  },
  tests: {
    arquivoSaida: "exports/tests.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "./monorepo/ui/tests",
    subpastasPermitidas: [],
    arquivosRaizPermitidos: [],
    incluiVersao: true,
    instrucaoCustomizada: "O texto abaixo contém os TESTES unitários e de integração do projeto."
  },
  server: {
    arquivoSaida: "exports/server.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/server",
    subpastasPermitidas: ["src", "tests", "docs"], // Removido "../../.github/workflows" daqui
    caminhosAdicionaisPermitidos: [".github/workflows"], // NOVO: Caminho relativo à raiz de execução
    arquivosRaizPermitidos: ["build.ts", "deno.json", "deno.jsonc", "readme.md", "minify-keys.ts", "wrangler-worker.toml", "wrangler-pages.toml", "deploy.sh"],
    incluiVersao: false,
    instrucaoCustomizada: "O texto abaixo contém os arquivos de configuração e execução do SERVIDOR @loco/server e CI/CD."
  },
  playground: {
    arquivoSaida: "exports/playground.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/playground",
    subpastasPermitidas: ["src", "public", "tests", "docs"],
    arquivosRaizPermitidos: ["build.ts", "deno.json", "deno.jsonc", "readme.md", "server.ts"],
    incluiVersao: false,
    instrucaoCustomizada: "O texto abaixo contém experimentos e código da área de PLAYGROUND."
  },
  workerdb: {
    arquivoSaida: "exports/worker-db.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/worker-db",
    subpastasPermitidas: ["src", "tests", "docs", "example"],
    arquivosRaizPermitidos: ["build.ts", "deno.json", "deno.jsonc", "readme.md"],
    incluiVersao: false,
    instrucaoCustomizada: "O texto abaixo contém experimentos e código da área de @loco/workerdb"
  },
  utils: {
    arquivoSaida: "exports/utils.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/utils",
    subpastasPermitidas: ["src", "tests", "docs"],
    arquivosRaizPermitidos: ["deno.json", "deno.jsonc", "readme.md"],
    incluiVersao: false,
    instrucaoCustomizada: "O texto abaixo contém experimentos e código da área de @loco/utils"
  },
  sw: {
    arquivoSaida: "exports/sw.md", // Corrigido nome do arquivo de saída para evitar colisão com utils.md
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/utils", // Ajuste conforme a localização real do seu service worker
    subpastasPermitidas: ["src", "tests", "docs"],
    arquivosRaizPermitidos: ["deno.json", "deno.jsonc", "readme.md"],
    incluiVersao: false,
    instrucaoCustomizada: "O texto abaixo contém experimentos e código da área de @loco/service-worker"
  },
  router: {
    arquivoSaida: "exports/router.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/router",
    subpastasPermitidas: ["src", "tests", "docs", "example"],
    arquivosRaizPermitidos: ["deno.json", "deno.jsonc", "readme.md"],
    incluiVersao: false,
    instrucaoCustomizada: "O texto abaixo contém os arquivos de configuração e execução do ROUTER @loco/router"
  }
};

// 3. Resolução do Modo via CLI
const argModo = (Deno.args[0]?.toLowerCase() || "main") as ModoExportacao;
const modo: ModoExportacao = CONFIGURACOES[argModo] ? argModo : "ui";
const config = CONFIGURACOES[modo];

/**
 * Encontra a maior sequência consecutiva de crases dentro de um texto
 * e retorna uma string de fechamento com uma crase a mais para não quebrar o Markdown.
 */
function calcularCraseWrapper(texto: string): string {
  const matches = texto.match(/`+/g);
  if (!matches) return "```";
  
  const maiorSequencia = Math.max(...matches.map(m => m.length));
  const tamanhoNecessario = Math.max(3, maiorSequencia + 1);
  return "`".repeat(tamanhoNecessario);
}

/**
 * Normaliza caminhos de diretório para garantir compatibilidade multiplataforma
 * e extração correta de prefixos.
 */
function normalizarCaminho(caminho: string): string {
  return caminho.replace(/\\/g, "/").toLowerCase();
}

/**
 * Avalia se o arquivo deve ser incluído isolando a validação dentro da pastaBase configurada,
 * com suporte a exceções explícitas via caminhosAdicionaisPermitidos.
 */
function deveIncluirArquivo(caminhoRelativo: string, config: ExportConfig): boolean {
  const caminhoNormalizado = normalizarCaminho(caminhoRelativo);
  
  // Proteção rígida contra loop de inclusão dos próprios exports
  if (caminhoNormalizado.startsWith("exports/")) {
    return false;
  }

  // 1. Verifica caminhos adicionais permitidos (permite sair da pastaBase)
  if (config.caminhosAdicionaisPermitidos && config.caminhosAdicionaisPermitidos.length > 0) {
    const correspondeAdicional = config.caminhosAdicionaisPermitidos.some(caminhoExtra => {
      const extraNormalizado = normalizarCaminho(caminhoExtra);
      // Verifica se é exatamente o arquivo ou está dentro do diretório extra
      return caminhoNormalizado === extraNormalizado || caminhoNormalizado.startsWith(extraNormalizado + "/");
    });

    if (correspondeAdicional) {
      // Ainda valida a extensão para evitar incluir binários ou arquivos de cache acidentalmente
      return config.extensoesPermitidas.some(ext =>
        caminhoNormalizado.endsWith(ext) || caminhoNormalizado === ext
      );
    }
  }

  // 2. Lógica padrão restrita à pastaBase
  const prefixoBase = (config.pastaBase === "./" || config.pastaBase === ".") 
    ? "" 
    : normalizarCaminho(config.pastaBase).replace(/\/$/, "") + "/";

  // Se o arquivo estiver fora da pastaBase configurada (e não foi pego pelo adicional), descarta
  if (prefixoBase !== "" && !caminhoNormalizado.startsWith(prefixoBase)) {
    return false;
  }

  // Extrai o caminho isolado apenas dentro do contexto da pastaBase
  const caminhoInterno = caminhoNormalizado.substring(prefixoBase.length);

  // 3. Verifica se é um arquivo raiz explícito da pastaBase
  if (config.arquivosRaizPermitidos.includes(caminhoInterno)) {
    return true;
  }

  // 4. Verifica se o arquivo pertence a alguma subpasta permitida
  let emSubpastaPermitida = false;

  if (config.subpastasPermitidas.length === 0) {
    emSubpastaPermitida = true;
  } else {
    emSubpastaPermitida = config.subpastasPermitidas.some(sub => {
      const subNormalizada = normalizarCaminho(sub) + "/";
      return caminhoInterno.startsWith(subNormalizada) || caminhoInterno === normalizarCaminho(sub);
    });
  }

  // 5. Validação final de extensão (apenas se passou nos filtros de diretório)
  if (emSubpastaPermitida) {
    if (config.extensoesPermitidas.length === 0) return true;
    
    return config.extensoesPermitidas.some(ext => 
      caminhoNormalizado.endsWith(ext) || caminhoNormalizado === ext
    );
  }

  return false;
}

// 4. Montagem do cabeçalho instrucional dinâmico
const versaoDisplay = config.incluiVersao ? `[v${APP_VERSION}] ` : "";

let conteudoFinal = `> **INSTRUÇÃO PARA A IA:** 
> ${config.instrucaoCustomizada}
> O projeto é o **Loco ${versaoDisplay}** estruturado em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: \`## Arquivo: src/main.ts\`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco ${versaoDisplay}- Modo: ${modo.toUpperCase()}

Gerado automaticamente em: ${new Date().toLocaleString()}

---

`;

console.log(`🚀 Iniciando exportação do Loco ${versaoDisplay}no modo: [${modo.toUpperCase()}] -> Gerando '${config.arquivoSaida}'`);

// 5. Varredura do diretório principal
// IMPORTANTE: Isso varre a partir de Deno.cwd(). Execute este script na raiz do repositório!
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