# 🗺️ Arquitetura de Roteamento e Transição de Páginas (Loco PWA)

## 📌 Visão Geral
O **Loco PWA** utiliza uma solução de roteamento SPA sem dependências externas, baseada na History API nativa e em **Preact Signals**[cite: 1].

## 🚀 Como Funciona

### 1. Estado Global Reativo (`src/router.ts`)
- `currentPath`: Signal contendo o caminho bruto da URL (ex: `/chats`, `/contacts`)[cite: 1].
- `activeRoute`: Signal computado que mapeia o caminho para o identificador da view (`chats`, `contacts`, `settings`)[cite: 1].
- `normalizePath()`: Trata caminhos nulos, vazios ou a raiz `/`, aplicando fallback padrão para `/chats`[cite: 1].

### 2. Navegação sem Reload
Ao chamar `navigateTo(path, event)`:
1. Interrompe o comportamento do link com `event.preventDefault()`[cite: 1].
2. Normaliza a URL de destino[cite: 1].
3. Atualiza o histórico do navegador via `window.history.pushState`[cite: 1].
4. Atualiza o Signal `currentPath`, re-renderizando dinamicamente apenas os componentes subscritos[cite: 1].