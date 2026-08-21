# Arquitetura de Frontend: Preact + Signals no Deno

## A Stack de UI
O **Loco** utiliza uma abordagem *buildless-friendly* (isenta de empacotadores tradicionais complexos como Webpack/Vite que dependem de Node.js). 
Utilizamos **Preact** pela sua leveza e aderência aos padrões web, combinado com **@preact/signals** para reatividade fina (fine-grained reactivity).

## O Mapa de Importações (Import Maps) e o Padrão Singleton
Como não utilizamos npm, todas as dependências vêm de URLs (CDNs como `esm.sh` ou `jsr`).

**⚠️ Atenção Arquitetural Crítica:**
É estritamente necessário garantir que bibliotecas do ecossistema Preact (como Signals, Router, ou Material Web) compartilhem a **mesma instância do Preact** em memória. 

Se o `esm.sh` resolver versões diferentes, o DOM Virtual sofrerá bifurcação e a reatividade falhará silenciosamente (o estado muda, mas a tela não atualiza).

**Padrão de Configuração (`deno.jsonc`):**
Sempre utilize as *queries* de resolução do `esm.sh` (como `?external=preact` ou `?deps=preact@VERSAO`) ao importar pacotes satélites do Preact.

\`\`\`jsonc
{
  "imports": {
    "preact": "https://esm.sh/preact@10.19.6",
    "preact/": "https://esm.sh/preact@10.19.6/",
    "@preact/signals": "https://esm.sh/@preact/signals@1.2.2?external=preact"
  }
}
\`\`\`