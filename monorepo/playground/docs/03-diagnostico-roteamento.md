# 🛠️ Documentação de Resolução: Correção da Rota Raiz e Renderização Vazia

## 📌 Descrição do Incidente
Após a implementação das melhorias de layout, a interface do **Loco PWA** parou de renderizar o conteúdo principal ao acessar o endereço raiz (`/`), exibindo exclusivamente a barra de navegação lateral.

## 🔬 Análise da Causa Raiz
O componente `App.tsx` realizava a verificação de rotas diretamente comparando o caminho com strings fixas (`currentPath.value === "/chats"`). 

Quando a aplicação é carregada inicialmente, o objeto `window.location.pathname` avalia para `"/"`. Como `"/"` não possuía um bloco condicional correspondente em `<main>`, nenhuma sub-árvore JSX era montada pelo Virtual DOM do Preact.

## 📐 Solução Implementada

1. **Normalização na Origem (`src/router.ts`):**
   A função `normalizePath()` foi inserida para tratar caminhos vazios ou a raiz `"/"`, convertendo-os automaticamente para `"/chats"`.

2. **Signal Computado com Fallback Segura (`src/App.tsx`):**
   Criamos o Signal `activeRoute = computed(...)`. Ele valida o caminho atual e, caso receba uma rota não reconhecida, retorna por padrão `"chats"`, impedindo que a aplicação fique sem conteúdo.

3. **Invariância do Layout Beer CSS:**
   As regras do **Master-Detail** do Beer CSS (`s12`, `m4 l3`, `m8 l9`, `m l`) foram mantidas integralmente e continuam a alternar entre a lista e o chat em telas pequenas sem requerer utilitários externos.