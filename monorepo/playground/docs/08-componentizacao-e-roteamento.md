# 🧩 Documentação de Arquitetura: Componentização e Roteamento Declarativo

## 📌 Visão Geral
A arquitetura do Loco PWA prioriza a reatividade declarativa do **Preact** aliada ao motor de temas do **BeerCSS v5**.

## 🔄 BeerCSS Pages vs. Preact Signals

1. **Por que não utilizar `page` nativo do BeerCSS?**
   - O recurso de páginas do BeerCSS depende de chamadas imperativas via JavaScript (`ui("#page-id")`) manipulando o DOM diretamente.
   - No Preact, manter o ciclo de vida do DOM sob controle das *Signals* garante que elementos inativos não fiquem na árvore de renderização sem necessidade, otimizando o consumo de memória em dispositivos móveis.

2. **Divisão de Subcomponentes:**
   - `NavSidebar` & `NavBottom`: Isolação dos controles de navegação por breakpoints.
   - `ChatMaster`: Gerencia unicamente a listagem de conversas e estado de seleção.
   - `ChatDetail`: Contém o chat ativo, histórico de mensagens e o formulário de envio ancorado.