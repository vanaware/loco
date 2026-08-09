# 🎨 Componentes e Fluxos da Interface do Loco

## 1. Visão Geral e Filosofia de UI

A interface do **Loco** é construída com **Preact** e componentes visuais do **Material Design 3** via biblioteca oficial `@material/web`. O gerenciamento de estado da interface é 100% reativo e baseado em **Preact Signals** (`@preact/signals`).

O design é **mobile-first**, responsivo e adaptativo:
* **Em telas grandes (Desktop):** Funciona como um painel multi-colunas unificado (lista de contatos, timeline de mensagens e detalhes do contato lado a lado).
* **Em telas pequenas (Mobile):** Alterna dinamicamente entre as visões de Lista, Chat e Detalhes através do sinal reativo `mobileView`.

---

## 2. Estrutura de Componentes Principais (`src/components/`)

### A. Shell e Roteador Principal (`src/app.tsx` & `src/index.html`)
Ponto de entrada da Single Page Application (SPA). Responsável por:
* Inicializar os stores do sistema (`initStores()`).
* Registrar e auditar a saúde do Service Worker (`sw-utils.ts`).
* Renderizar a estrutura de navegação Material 3 (`md-navigation-drawer`, `md-top-app-bar`).
* Alternar dinamicamente a seção ativa com base no signal `currentSection.value`.

### B. `ChatSection.tsx` — Conversas e Timeline
Área central de interação com o contato selecionado (`selectedContactHash`). Contém:
* **Header da Conversa:** Apresenta o nome do contato, avatar com foto/inicial, e botões de ação (diagnóstico do contato, atalho para detalhes).
* **Timeline de Mensagens:** Exibe o histórico de mensagens enviadas e recebidas recuperadas do IndexedDB.
* **Indicadores de Status:** Selos de entrega e leitura (`✓` enviado, `✓✓` entregue/lido) e identificador visual de mensagem cifrada E2E.
* **Barra de Entrada de Mensagem:** Input de texto com suporte a envio por tecla `Enter`, seletor para anexo de imagens e compressão prévia.

### C. `ContatosSection.tsx` — Agenda Reativa
Painel lateral de navegação e busca de contatos.
* **Busca e Filtragem:** Campo de pesquisa por nome ou e-mail em tempo real.
* **Ordenação Dinâmica:** Contatos ordenados pela data da última interação/mensagem.
* **Badges de Estado de Confiança:** Indicadores visuais do ciclo de confiança mútua (`me` e `trusted`):
  * `✓✓ Confiável` (Verde): Par de chaves auditado e confirmado mutualmente.
  * `⏳ Pendente` (Laranja): Contato salvo localmente, mas aguardando homologação do receptor.
  * `⚠️ Desatualizado` (Vermelho): Divergência de chaves detectada na auditoria E2E.

### D. `ContactDetailSection.tsx` — Diagnóstico e Perfil do Contato
Exibe as métricas de segurança do contato selecionado:
* Detalhes das Chaves Públicas (`VAPID ECDSA` e `E2E RSA-OAEP`).
* Status da subscrição Web Push (`endpoint` e chaves `p256dh`/`auth`).
* Ações de auditoria: Homologar contato como confiável (`trusted`), solicitar re-sincronização de perfil via handshake ou remover contato.

### E. `ProfileSection.tsx` — Cartão de Visitas Local
Gerenciamento de perfil e compartilhamento da própria identidade:
* Edição do nome e e-mail local.
* Upload e redimensionamento da foto de perfil.
* Exibição do **QR Code Binário Compacto (`cqr`)** gerado localmente para escaneamento presencial.
* Geração do **Link Comprimido Web (`cjwt`)** para compartilhamento remoto via Web Share API.

### F. `AdvancedSection.tsx` — Painel de Diagnóstico do Sistema
Painel técnico para inspeção do nó PWA:
* **Armazenamento:** Métricas de cota utilizada/disponível no IndexedDB e status da permissão `navigator.storage.persist()`.
* **Service Worker:** Estado da fila do roteador de handshakes (`FluxoIn` / `FluxoOut`).
* **Cache e PWA:** Status dos ativos armazenados no CacheStorage e opção de re-sincronização forçada.

### G. `DebugPanel.tsx` — Terminal de Logs em Tempo Real
Console visual embutido na interface que captura logs do sistema (`signals/state.ts` -> `logs`). Permite filtrar registros por categoria (SW, E2E, Push, DB) para depuração em dispositivos móveis sem necessidade de ferramentas de desenvolvedor do navegador.

---

## 3. Páginas de Suporte Autônomas (PWA Entrypoints)

Além do `index.html` principal, a aplicação conta com pontos de entrada leves e dedicados para fluxos específicos:

* 📷 **`share.html` / `share.tsx`:** Interface de escaneamento de QR Code via câmera do dispositivo e importador de convites recepcionados via parâmetro URL (`cjwt` ou `cqr`).
* 👤 **`profile.html` / `profile.tsx`:** Exibição em tela cheia do QR Code do usuário para facilidade de apresentação presencial.
* 🚪 **`logout.html` / `logout.tsx`:** Executa o expurgo completo e irreversível dos bancos IndexedDB, caches do Service Worker e diretórios do OPFS.

---

## 4. Gerenciamento de Estado Reativo (`src/signals/state.ts`)

A UI reage imediatamente a alterações nos seguintes Signals globais:

| Signal | Tipo | Descrição / Função |
| :--- | :--- | :--- |
| `currentSection` | `'chat' \| 'contatos' \| 'contato-detalhe' \| 'profile' \| 'advanced'` | Define a seção principal visível na interface. |
| `selectedContactHash` | `string \| null` | Hash SHA-256 da chave do contato com quem a conversa está aberta. |
| `mobileView` | `'list' \| 'chat' \| 'detail'` | Alternador de tela para dispositivos móveis. |
| `logs` | `LogEntry[]` | Array reativo consumido pelo `DebugPanel.tsx`. |

---

## 5. Fluxos e Onboarding Contextual

```text
       [ Primeira Abertura do Loco ]
                     |
                     v
  Inicialização Automática do Nó (initApp)
  - Gera chaves VAPID (ECDSA P-256) e E2E (RSA-OAEP-2048)
  - Solicita Armazenamento Persistente
                     |
                     v
         [ ContatosSection ]
                     |
       +-------------+-------------+
       |                           |
 (Sem Contatos)              (Com Contatos)
       |                           |
       v                           v
Exibe Empty State          Exibe Lista Ordenada por
com botão "Criar          última interação com
Perfil / QR Code"          badges de confiança
```

### Adição de Contatos
1. **Presencial:** O Usuário A exibe seu QR Code em `ProfileSection.tsx`. O Usuário B abre `share.html` e escaneia pela câmera.
2. **Remoto:** O Usuário A envia seu link `cjwt`. O Usuário B clica no link, que abre a aplicação importando e validando automaticamente a assinatura do convite.

---

## 6. Tabela Comparativa: Especificação Antiga vs. Implementação Atual

| Recurso / Componente | Documentação Legada | Implementação Atual |
| :--- | :--- | :--- |
| **Gerenciamento de Views** | Roteamento baseado em `App.tsx` monolítico | **Seções especializadas (`src/components/`) e Signals** |
| **Seção de Conversas** | `ChatWindow.tsx` | **`ChatSection.tsx` (Preact + Material 3)** |
| **Scanner de QR Code** | `QRScanner.tsx` modal | **Página dedicada `share.html` / `share.tsx`** |
| **Layout Responsivo** | Transições CSS genéricas | **Signal `mobileView` com suporte a multi-coluna** |
| **Depuração** | Ausente | **`DebugPanel.tsx` integrado com captura de logs** |
