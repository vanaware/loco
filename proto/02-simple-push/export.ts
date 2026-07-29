import { walk } from "jsr:@std/fs/walk";
import { relative } from "jsr:@std/path/relative";

const ARQUIVO_SAIDA = "EXPORT.md";

// Arquivos específicos permitidos na raiz do projeto
const ARQUIVOS_RAIZ_PERMITIDOS = ["main.ts", "build.ts", "deno.json"];

// Pastas permitidas para varredura completa
const PASTAS_PERMITIDAS = ["src", "public"];

// Extensões de arquivos de texto aceitas dentro das pastas permitidas
const EXTENSOES_PERMITIDAS = [
  ".tsx", ".jsx", ".js", ".ts", ".css", 
  ".html", ".manifest", ".md", ".json"
];

let conteudoFinal = "# Código Fonte Selecionado do Projeto\n\n";
conteudoFinal += `Gerado automaticamente em: ${new Date().toLocaleString()}\n\n`;

for await (const entry of walk(".", { includeDirs: false })) {
  const caminhoRelativo = relative(".", entry.path);
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
      // Verifica se o arquivo tem uma extensão de texto válida (ignora case)
      const caminhoMinusculo = caminhoRelativo.toLowerCase();
      deveIncluir = EXTENSOES_PERMITIDAS.some(ext => 
        caminhoMinusculo.endsWith(ext.toLowerCase())
      );
    }
  }

  // Se passou nos filtros, lê e adiciona ao arquivo final
  if (deveIncluir) {
    try {
      console.log(`Incluindo: ${caminhoRelativo}`);
      const conteudoArquivo = await Deno.readTextFile(entry.path);
      
      // Define a sintaxe correta para o bloco de código Markdown
      let extensaoMarkdown = caminhoRelativo.split(".").pop() || "";
      if (extensaoMarkdown === "manifest") extensaoMarkdown = "json"; // Melhora o highlight no chat

      conteudoFinal += `## Arquivo: \`${caminhoRelativo}\`\n\n`;
      conteudoFinal += `\`\`\`${extensaoMarkdown}\n`;
      conteudoFinal += conteudoArquivo;
      conteudoFinal += "\n\`\`\`\n\n---\n\n";
    } catch (erro) {
      console.error(`Erro ao ler ${caminhoRelativo}:`, erro.message);
    }
  }
}

await Deno.writeTextFile(ARQUIVO_SAIDA, conteudoFinal);
console.log(`\n Prontinho! O arquivo ${ARQUIVO_SAIDA} foi atualizado apenas com o escopo solicitado.`);
