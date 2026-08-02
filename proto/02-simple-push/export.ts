/**
 * @file exportar.ts
 * @description CONTEXTO PARA OUTRAS IAs: Este script automatiza a consolidação do código-fonte 
 * deste projeto em um único arquivo Markdown (EXPORT.md). Ele foi desenhado para otimizar o 
 * envio manual de contexto para chats de IA, garantindo que o modelo receptor entenda a 
 * árvore de arquivos e as dependências sem estourar o limite de tokens com arquivos inúteis.
 * 
 * @rules REGRAS DE ESCOPO E FILTROS (NÃO ALTERAR SEM COMANDO EXPRESSO):
 * 1. Raiz do Projeto: Permite estritamente os arquivos ["main.ts", "build.ts", "deno.json", "deno.jsonc"].
 * 2. Diretores Permitidos: Faz varredura recursiva apenas dentro das pastas ["src", "public"].
 * 3. Extensões Válidas: Filtra apenas arquivos de texto/código clássicos listados na constante EXTENSOES_PERMITIDAS.
 * 4. Auto-Exclusão: Nunca deve ler o próprio arquivo de saída ("EXPORT.md") para evitar loops de escrita.
 * 
 * @logic LÓGICA DE FORMATAÇÃO DO OUTPUT:
 * - Adiciona um prompt de comando fixo no topo do EXPORT.md instruindo a IA receptora sobre como responder.
 * - Identifica cada arquivo com seu caminho relativo exato (`## Arquivo: src/caminho/arquivo.ext`).
 * - Usa a função calcularCraseWrapper para analisar o conteúdo do arquivo e envelopá-lo com um número 
 *   seguro de crases (ex: se o código tiver 3 crases, abre o bloco com 4; se tiver 4, abre com 5), 
 *   impedindo de forma matemática que strings literais ou blocos internos quebrem o Markdown final.
 */


import { walk } from "jsr:@std/fs/walk";
import { relative } from "jsr:@std/path/relative";

const ARQUIVO_SAIDA = "EXPORT.md";

// Arquivos específicos permitidos na raiz do projeto
const ARQUIVOS_RAIZ_PERMITIDOS = ["main.ts", "build.ts", "deno.json", "deno.jsonc", "README.md", "LICENSE.md"];

// Pastas permitidas para varredura completa
const PASTAS_PERMITIDAS = ["src", "public"];

// Lista expandida com .jsonc e outras extensões clássicas
const EXTENSOES_PERMITIDAS = [
  // Web & Frontend
  ".tsx", ".jsx", ".js", ".ts", ".css", ".html", ".manifest", ".map",
  // Scripts & Automação
  ".sh", ".py", ".ps1",
  // Configuração & Dados (incluindo JSONC)
  ".json", ".jsonc", ".yaml", ".yml", ".toml", ".ini", ".env", ".env.example",
  // Documentação & Outros
  ".md", ".txt", ".sql"
];

/**
 * Encontra a maior sequência consecutiva de crases dentro de um texto
 * e retorna uma string de fechamento com uma crase a mais.
 */
function calcularCraseWrapper(texto: string): string {
  const matches = texto.match(/`+/g);
  if (!matches) return "```";
  
  const maiorSequencia = Math.max(...matches.map(m => m.length));
  const tamanhoNecessario = Math.max(3, maiorSequencia + 1);
  return "`".repeat(tamanhoNecessario);
}

// Mensagem estruturada para guiar o comportamento da IA no chat
let conteudoFinal = `> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém múltiplos arquivos do meu projeto estruturados em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: \`## Arquivo: src/main.ts\`).
> Analise a estrutura de pastas, as dependências e o código fornecido para indicar as mudanças necessárias para a implementação das novas funcionalidades discutidas.
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo e não somente as partes que devem ser modificadas.

---

# Código Fonte Selecionado do Projeto

Gerado automaticamente em: ${new Date().toLocaleString()}

---

`;

for await (const entry of walk(".", { includeDirs: false })) {
  const caminhoRelativo = relative(".", entry.path);
  
  // Ignora o próprio arquivo de saída
  if (caminhoRelativo === ARQUIVO_SAIDA) continue;

  let deveIncluir = false;

  // Verifica se é um dos arquivos específicos da raiz
  if (ARQUIVOS_RAIZ_PERMITIDOS.includes(caminhoRelativo)) {
    deveIncluir = true;
  } else {
    // Verifica se o arquivo está dentro de src/ ou public/
    const estaEmPastaPermitida = PASTAS_PERMITIDAS.some(pasta => 
      caminhoRelativo.startsWith(`${pasta}/`) || caminhoRelativo.startsWith(`${pasta}\\`)
    );

    if (estaEmPastaPermitida) {
      const caminhoMinusculo = caminhoRelativo.toLowerCase();
      
      // Validação inteligente para extensões ou arquivos .env
      deveIncluir = EXTENSOES_PERMITIDAS.some(ext => 
        caminhoMinusculo.endsWith(ext.toLowerCase()) || caminhoMinusculo === ext.toLowerCase()
      );
    }
  }

  // Se passou nos filtros, lê e adiciona ao arquivo final
  if (deveIncluir) {
    try {
      console.log(`Incluindo: ${caminhoRelativo}`);
      const conteudoArquivo = await Deno.readTextFile(entry.path);
      
      // Ajustes de codificação visual para o Markdown do chat da IA
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
        console.error(`Erro ao ler ${caminhoRelativo}:`, erro.message);
      }
    }
  }
}

await Deno.writeTextFile(ARQUIVO_SAIDA, conteudoFinal);
console.log(`\n Prontinho! O arquivo ${ARQUIVO_SAIDA} foi gerado com as instruções.`);
