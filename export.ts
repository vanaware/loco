// export.ts
/**
 * @file export.ts
 * @description Script de consolidação de contexto para IAs com suporte a parâmetros via CLI,
 * nomes de arquivos de saída dinâmicos e sincronização automática de versão.
 * 
 * USO VIA DENO TASKS:
 * - deno task export        -> Exporta Código Fonte para EXPORT.md
 * - deno task export main   -> Exporta Código Fonte para EXPORT.md
 * - deno task export docs   -> Exporta Documentação para EXPORT-DOCS.md
 */

import { walk } from "jsr:@std/fs/walk";
import { relative } from "jsr:@std/path/relative";
import { APP_VERSION } from "./src/constants/version.ts";

type ModoExportacao = "main" | "docs";

// 1. Leitura do parâmetro via CLI nativo do Deno
const argModo = Deno.args[0]?.toLowerCase();
const modo: ModoExportacao = argModo === "docs" ? "docs" : "main";

// Nomes de arquivos de saída distintos para cada modo de operação
const ARQUIVO_SAIDA = modo === "docs" ? "EXPORT-DOCS.md" : "EXPORT.md";

// Lista de extensões válidas de texto/código
const EXTENSOES_PERMITIDAS = [
  ".tsx", ".jsx", ".js", ".ts", ".css", ".html", ".manifest", ".map",
  ".sh", ".py", ".ps1",
  ".json", ".jsonc", ".yaml", ".yml", ".toml", ".ini", ".env", ".env.example",
  ".md", ".txt", ".sql"
];

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
 * Avalia se o arquivo deve ser incluído com base no modo selecionado.
 */
function deveIncluirArquivo(caminhoRelativo: string, modo: ModoExportacao): boolean {
  // Ignora arquivos de exportação para evitar loops de leitura
  if (caminhoRelativo === "EXPORT.md" || caminhoRelativo === "EXPORT-DOCS.md") {
    return false;
  }

  const caminhoMinusculo = caminhoRelativo.toLowerCase();

  if (modo === "docs") {
    // Modo DOCUMENTAÇÃO: Pega docs/ e arquivos de licença/readme
    if (caminhoRelativo.startsWith("docs/") || caminhoRelativo.startsWith("docs\\")) {
      return EXTENSOES_PERMITIDAS.some(ext => caminhoMinusculo.endsWith(ext));
    }
    const arquivosDocsRaiz = ["readme.md", "readme", "license", "license.md", "license.txt"];
    return arquivosDocsRaiz.includes(caminhoMinusculo);
  } else {
    // Modo MAIN (Padrão): Pega arquivos da raiz e pastas src/ e public/
    const arquivosRaizPermitidos = ["main.ts", "worker.ts", "build.ts", "deno.json", "deno.jsonc", "wrangler.toml"];
    
    if (arquivosRaizPermitidos.includes(caminhoRelativo)) {
      return true;
    }

    const pastasPermitidas = ["src", "public"];
    const estaEmPastaPermitida = pastasPermitidas.some(pasta => 
      caminhoRelativo.startsWith(`${pasta}/`) || caminhoRelativo.startsWith(`${pasta}\\`)
    );

    if (estaEmPastaPermitida) {
      return EXTENSOES_PERMITIDAS.some(ext => 
        caminhoMinusculo.endsWith(ext) || caminhoMinusculo === ext
      );
    }
  }

  return false;
}

// 2. Montagem do cabeçalho instrucional dinâmico com a versão sincronizada
let conteudoFinal = `> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém múltiplos arquivos do projeto **Loco v${APP_VERSION}** (${modo === "docs" ? "DOCUMENTAÇÃO" : "CÓDIGO FONTE"}) estruturados em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: \`## Arquivo: src/main.ts\`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco [v${APP_VERSION}] - Modo: ${modo.toUpperCase()}

Gerado automaticamente em: ${new Date().toLocaleString()}

---

`;

console.log(`🚀 Iniciando exportação do Loco v${APP_VERSION} no modo: [${modo.toUpperCase()}] -> Gerando '${ARQUIVO_SAIDA}'`);

// 3. Varredura do diretório
for await (const entry of walk(".", { includeDirs: false })) {
  const caminhoRelativo = relative(".", entry.path);

  if (deveIncluirArquivo(caminhoRelativo, modo)) {
    try {
      console.log(` 📄 Incluindo: ${caminhoRelativo}`);
      const conteudoArquivo = await Deno.readTextFile(entry.path);
      
      let extensaoMarkdown = caminhoRelativo.split(".").pop() || "";
      if (extensaoMarkdown === "manifest") extensaoMarkdown = "json";
      if (extensaoMarkdown === "jsonc") extensaoMarkdown = "json";
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

await Deno.writeTextFile(ARQUIVO_SAIDA, conteudoFinal);
console.log(`\n✨ Prontinho! O arquivo ${ARQUIVO_SAIDA} (v${APP_VERSION}) foi gerado com sucesso.`);