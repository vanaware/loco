# 🧠 Gerenciamento de Estado no Loco PWA

O **Loco** adota uma arquitetura de gerenciamento de estado híbrida e descentralizada. Para garantir máxima performance (60fps), baixíssimo consumo de bateria no mobile e resiliência offline, nós dividimos o estado da aplicação em três camadas com responsabilidades estritas.

---

## 1. Camada de Interface (UI Reativa)
**Ferramenta:** `@preact/signals`  
**Arquivos:** `src/stores/mensagensStore.ts`, `contatosStore.ts`, `profileStore.ts`

Nesta camada, lidamos exclusivamente com **Dados de Negócio Visíveis** (o que o usuário efetivamente vê e interage na tela).

### A Estratégia: Atualizações Otimistas (Optimistic UI)
*   **O Problema:** Esperar o banco de dados (IndexedDB) responder para atualizar a tela cria "engasgos" e travamentos na Main Thread.
*   **A Solução Loco:** Quando o usuário envia uma mensagem, nós injetamos o dado *instantaneamente* na memória RAM (no Signal). A interface reage em ~1ms. Só então delegamos a gravação real para o IndexedDB rodar em background.
*   **Mutação Granular:** Ao invés de recarregar arrays inteiros (o que causa re-renderização destrutiva no DOM), nós fazemos a mutação apenas do nó específico (ex: alterando o status de `enviando` para `entregue` no array em memória).

---

## 2. Camada de Infraestrutura (Background Sync)
**Ferramenta:** `IndexedDB` (idb-keyval) + `Service Worker`  
**Arquivos:** `src/sw/sw-handshakes.ts`, `Handshake_DB`

A "Máquina de Estados de Handshakes" é a nossa tubulação invisível. Ela é responsável por garantir que dados saiam do PWA e cheguem à rede (e vice-versa), lidando com instabilidades de conexão (Offline-First).

### Por que não usamos Signals/Stores aqui? (Fronteira de Threads)
*   **Isolamento:** O Service Worker roda em uma *Background Thread* que sobrevive mesmo quando o PWA é fechado. Ele não tem acesso ao DOM nem à memória do Preact.
*   **Performance:** Se tivéssemos um `handshakesStore` na UI, cada vez que o Service Worker tentasse processar um pacote invisível de rede, ele precisaria trafegar esse dado via `postMessage` para a Main Thread. O Preact recalcularia a árvore de renderização para dados que nem estão na tela, causando extrema lentidão.
*   **O Fluxo:** O Service Worker gerencia a tabela `Handshake_DB` de forma autônoma e transacional. Ele só avisa a UI (via `postMessage`) quando uma etapa crucial é concluída (ex: *"Mensagem entregue!"* ou *"Novo contato sincronizado!"*), permitindo que os Stores da Camada 1 reajam de forma limpa.

---

## 3. Camada de Telemetria (Debug)
**Ferramenta:** `BroadcastChannel` + Local Signals  
**Arquivos:** `src/components/DebugPanel.tsx`, `src/utils/debug-utils.ts`

O sistema de debug é um *Cross-Cutting Concern* (interesse transversal). Ele precisa capturar logs tanto da Main Thread (UI) quanto da Background Thread (Service Worker).

### Por que não existe um `debugStore` global?
*   **Poluição de Estado:** O fluxo principal do aplicativo (Chat, Contatos) não deve ser reativo à chegada de um novo log de sistema. Ter um Signal global para logs forçaria a árvore do Preact a observar coisas inúteis.
*   **Colocação de Estado (State Colocation):** Os sinais de debug (`isDebugEnabled`, `debugLogs`) vivem *dentro* do componente `DebugPanel.tsx`. Apenas o painel se importa com os logs. Se o painel não estiver renderizado, a memória não é desperdiçada.
*   **Comunicação Desacoplada:** Usamos o `BroadcastChannel("loco_debug_channel")`. Qualquer arquivo, seja o Service Worker ou um Utilitário de Criptografia, pode "gritar" um erro neste canal sem precisar importar dependências de UI. O Painel de Debug, se estiver aberto, escuta o canal e renderiza o log em tempo real.

---

### 📝 Resumo da Arquitetura
1.  **Se o usuário precisa ver na tela imediatamente:** Use `@preact/signals` (`/stores`).
2.  **Se precisa de garantia de entrega em redes instáveis:** Use IndexedDB e delegue ao `Service Worker` (Handshakes).
3.  **Se precisa monitorar o funcionamento do motor:** Jogue a mensagem no `BroadcastChannel` e deixe o `DebugPanel` resolver.