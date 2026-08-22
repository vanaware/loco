/**
 * @file export.ts
 * @description Script de consolidação de contexto para IAs com suporte a parâmetros via CLI,
 * configuração baseada em diretório raiz (pastaBase) e filtros granulares por subpastas.
 * 
 * USO VIA DENO TASKS:
 * - deno task export            -> Exporta Código Fonte principal
 * - deno task export docs       -> Exporta Documentação e licenças
 * - deno task export tests      -> Exporta Testes
 * - deno task export playground -> Exporta a área de Playground
 */

import { walk } from "@std/fs/walk";
import { relative } from "@std/path/relative";
import { APP_VERSION } from "../src/constants/version.ts";

// 1. Definição de Tipos e Interfaces
type ModoExportacao = "main" | "docs" | "tests" | "server" | "playground" | "workerdb";

interface ExportConfig {
  arquivoSaida: string;
  extensoesPermitidas: string[];
  pastaBase: string;
  subpastasPermitidas: string[];
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
  main: {
    arquivoSaida: "exports/main.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "./",
    subpastasPermitidas: ["src", "public", "server", ".github/workflows"], // Vazio = permite tudo dentro da pastaBase
    arquivosRaizPermitidos: ["build.ts", "deno.json", "deno.jsonc", "wrangler-worker.toml", "wrangler-pages.toml", "deploy.sh"],
    incluiVersao: true,
    instrucaoCustomizada: "O texto abaixo contém os arquivos de CÓDIGO FONTE principais da aplicação."
  },
  docs: {
    arquivoSaida: "exports/docs.md",
    extensoesPermitidas: [".md", ".txt"],
    pastaBase: "./", // Base na raiz para conseguir capturar o readme e a pasta docs
    subpastasPermitidas: ["docs"],
    arquivosRaizPermitidos: ["readme.md", "readme", "license", "license.md", "license.txt"],
    incluiVersao: true,
    instrucaoCustomizada: "O texto abaixo contém a DOCUMENTAÇÃO e diretrizes arquiteturais do projeto."
  },
  tests: {
    arquivoSaida: "exports/tests.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "tests",
    subpastasPermitidas: [],
    arquivosRaizPermitidos: [],
    incluiVersao: true,
    instrucaoCustomizada: "O texto abaixo contém os TESTES unitários e de integração do projeto."
  },
  server: {
    arquivoSaida: "exports/server.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "server",
    subpastasPermitidas: [],
    arquivosRaizPermitidos: ["deno.json", "deno.jsonc"],
    incluiVersao: true,
    instrucaoCustomizada: "O texto abaixo contém os arquivos de configuração e execução do SERVIDOR minimalista."
  },
  playground: {
    arquivoSaida: "exports/playground.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/playground",
    subpastasPermitidas: ["src", "public", "tests","docs"],
    arquivosRaizPermitidos: ["build.ts", "deno.json", "deno.jsonc", "server.ts"],
    incluiVersao: false,
    instrucaoCustomizada: "O texto abaixo contém experimentos e código da área de PLAYGROUND."
  },
  workerdb: {
    arquivoSaida: "exports/worker-db.md",
    extensoesPermitidas: EXTENSOES_PADRAO,
    pastaBase: "monorepo/worker-db",
    subpastasPermitidas: ["src", "tests","docs", "example"],
    arquivosRaizPermitidos: ["build.ts", "deno.json", "deno.jsonc", "README.md", "LICENSE"],
    incluiVersao: false,
    instrucaoCustomizada: "O texto abaixo contém experimentos e código da área de WORKER-DB."
  }
};

// 3. Resolução do Modo via CLI
const argModo = (Deno.args[0]?.toLowerCase() || "main") as ModoExportacao;
const modo: ModoExportacao = CONFIGURACOES[argModo] ? argModo : "main";
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
 * Avalia se o arquivo deve ser incluído isolando a validação dentro da pastaBase configurada.
 */
function deveIncluirArquivo(caminhoRelativo: string, config: ExportConfig): boolean {
  const caminhoNormalizado = normalizarCaminho(caminhoRelativo);
  
  // Proteção rígida contra loop de inclusão dos próprios exports
  if (caminhoNormalizado.startsWith("exports/")) {
    return false;
  }

  // Define o prefixo real da pastaBase
  // Se for raiz ("./" ou "."), o prefixo é vazio.
  const prefixoBase = (config.pastaBase === "./" || config.pastaBase === ".") 
    ? "" 
    : normalizarCaminho(config.pastaBase).replace(/\/$/, "") + "/";

  // Se o arquivo estiver fora da pastaBase configurada, descarta imediatamente
  if (prefixoBase !== "" && !caminhoNormalizado.startsWith(prefixoBase)) {
    return false;
  }

  // Extrai o caminho isolado apenas dentro do contexto da pastaBase
  const caminhoInterno = caminhoNormalizado.substring(prefixoBase.length);

  // 1. Verifica se é um arquivo raiz explícito da pastaBase
  // Ex: "build.ts" (sem subpastas no caminho interno)
  if (config.arquivosRaizPermitidos.includes(caminhoInterno)) {
    return true;
  }

  // 2. Verifica se o arquivo pertence a alguma subpasta permitida
  let emSubpastaPermitida = false;

  if (config.subpastasPermitidas.length === 0) {
    // Se a lista for vazia, significa "permitir todas as subpastas e arquivos não-raiz se passarem na extensão"
    // No entanto, para evitar capturar tudo, geralmente validamos arquivos de nível raiz via arquivosRaizPermitidos.
    // Mas vamos manter a permissão global ativa caso não haja restrição de subpasta.
    emSubpastaPermitida = true;
  } else {
    emSubpastaPermitida = config.subpastasPermitidas.some(sub => {
      const subNormalizada = normalizarCaminho(sub) + "/";
      return caminhoInterno.startsWith(subNormalizada) || caminhoInterno === normalizarCaminho(sub);
    });
  }

  // 3. Validação final de extensão (apenas se passou nos filtros de diretório)
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