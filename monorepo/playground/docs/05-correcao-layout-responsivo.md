# 📱 Documentação de Arquitetura: Ajustes do Layout Flexbox e Responsividade MD3

## 📌 Contexto
Correção de três comportamentos indesejados no layout responsivo do Loco PWA durante a alternância entre dispositivos Mobile (`s`), Tablet (`m`) e Desktop (`l`).

---

## 🛠️ Detalhamento Técnico das Mudanças

### 1. Garantia de Visibilidade do Footer no Chat
- **Problema**: O uso de `100vh` em elementos dentro do `<main>` fazia com que o campo de texto fosse projetado para baixo da barra de navegação inferior (`bottom nav`), ficando oculto.
- **Solução**:
  - Remoção das referências de `100vh` em containers internos.
  - Adoção de um container Flexbox vertical (`flex-direction: column; height: 100%`).
  - O painel de mensagens recebeu `flex: 1; overflow-y: auto`, enquanto o `<header>` e o `<footer>` receberam `flex-shrink: 0`.

### 2. Adaptação do Menu para Telas Médias (`m`)
- A navegação lateral agora é exclusiva de desktops (`nav.left.l`).
- Em tablets e celulares (`nav.bottom.s.m`), o aplicativo exibe a barra inferior, otimizando o espaço horizontal para o layout Master-Detail de 2 colunas (`m4` e `m8`).

### 3. Alinhamento da Seta de Voltar
- Substituição de `center-align` por `middle-align` nas linhas de cabeçalho.
- O `middle-align` aplica o alinhamento de eixo transversal (`align-items: center`) mantendo o alinhamento horizontal flexível, garantindo que o botão de voltar fique fixado à esquerda.