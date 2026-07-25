# AGENTS.md - Regras e Contexto do Projeto Push P2P Chat

## 1. Visão Geral
O **Push P2P Chat** é um PWA de mensagens descentralizado com interface Material Design 3,
comunicação híbrida (Web Push + WebRTC) e arquitetura de armazenamento robusta e escalável.
Prioriza privacidade, controle granular de dados pelo usuário e resistência à evicção automática.

## 2. Premissas Fundamentais
*   **Zero Servidor:** Toda comunicação é P2P ou via Web Push.
*   **Armazenamento Híbrido:** 
    *   **IndexedDB (`idb-keyval`):** Textos, configurações, metadados e fotos pequenas.
    *   **OPFS:** Arquivos grandes (fotos, vídeos, documentos) recebidos/enviados.
    *   **Cache API:** Assets estáticos do app para funcionamento offline.
*   **Proteção contra Evicção:** `navigator.storage.persist()` para evitar limpeza automática.
*   **Feature Detection:** Toda API moderna é detectada antes do uso.
*   **Progressive Enhancement:** Funciona em qualquer browser moderno, mas oferece recursos extras onde suportado.

## 3. Stack Tecnológica
*   **Runtime:** Deno / Deno Deploy.
*   **Frontend:** Preact + @preact/signals + @material/web (Web Components).
*   **Bibliotecas:**
    *   `@material/web` (ESM): Material Design 3.
    *   `@libs/qrcode` (JSR): Geração de QR Codes.
    *   `fflate` (ESM): Compressão ZIP para backups.
    *   `idb-keyval` (ESM): Wrapper leve para IndexedDB (~500 bytes).
    *   `webtorrent` (CDN): Transferência P2P de arquivos.

## 4. Arquitetura de Armazenamento

### 4.1. IndexedDB (via `idb-keyval`)
*   **Uso:** Dados estruturados e binários leves (< 1MB).
*   **Conteúdo:** Chaves VAPID, lista de contatos, histórico de mensagens, configurações, fotos de perfil redimensionadas.
*   **Vantagem:** Assíncrono, sem limite rígido de 5MB do localStorage.

### 4.2. OPFS (Origin Private File System)
*   **Uso:** Arquivos binários grandes.
*   **Gerenciamento:** 
    *   Cada arquivo tem ID único vinculado à mensagem.
    *   O usuário pode **excluir individualmente** arquivos.
    *   O usuário pode **baixar** arquivos do OPFS para o sistema de arquivos do dispositivo.
*   **Fallback:** Blob URL temporário se OPFS não for suportado.

### 4.3. Cache API
*   **Uso:** Recursos estáticos para funcionamento offline.
*   **Estratégia:** Cache First para assets, Network First para HTML.

### 4.4. Proteção de Persistência
*   **API:** `navigator.storage.persist()`.
*   **Monitoramento:** Verificação periódica da quota.

## 5. Módulo de Transferência P2P (Worker + OPFS)

### 5.1. Arquitetura Isolada
*   **Web Worker (`p2p-transfer.worker.js`):** Toda a lógica do WebTorrent e I/O de disco roda em thread separada.
*   **Comunicação:** Via `postMessage` com eventos tipados.
*   **OPFS:** Utilizado para escrita de alta performance.

### 5.2. Fluxo de Dados
1.  **Envio:** Main Thread envia `File` → Worker cria Seed → Retorna `magnetURI`.
2.  **Recebimento:** Main Thread envia `magnetURI` → Worker baixa para OPFS → Notifica conclusão.
3.  **Cancelamento:** Botão dispara `P2P_CANCEL` → Worker destrói torrent.

### 5.3. Interface de Usuário
*   **TransferDock:** Widget flutuante no rodapé com progresso em tempo real.

## 6. APIs Modernas Integradas

| API | Uso | Fallback |
|-----|-----|----------|
| OPFS | Salva arquivos WebTorrent | Blob URL |
| Share Target | Recebe shares de outros apps | — |
| Contact Picker | Importa da agenda | Digitar manualmente |
| BarcodeDetector | Lê QR Codes | Compartilhamento por link |
| App Badging | Badge de não lidas | Badge na UI |
| Wake Lock | Tela ligada em chamadas | — |
| View Transitions | Navegação fluida | Troca instantânea |
| WebCodecs | Codec otimizado | MediaStream |
| PiP | Chamada flutuante | Tela cheia |
| App Shortcuts | Atalhos no ícone | Menu interno |
| Virtual Keyboard | Layout do teclado | Resize viewport |
| Background Sync | Sync periódico | Verificar ao abrir |
| Window Controls | UI imersiva desktop | Barra padrão |
| Storage Persist | Proteção contra evicção | Backup manual |

## 7. Regras de Desenvolvimento
1.  **Nunca usar `localStorage`:** Usar exclusivamente `src/utils/storage.ts`.
2.  **Feature Detection OBRIGATÓRIO:** Nunca assumir que uma API existe.
3.  **Material Design:** Usar @material/web para todos os componentes.
4.  **Assincronicidade:** Todas as operações de storage são `async/await`.
5.  **Wake Lock em Chamadas:** Sempre ativar ao iniciar, liberar ao encerrar.
6.  **View Transitions:** Usar `navigateWithTransition()` para trocar views.
7.  **Limpeza:** Ao excluir conversa, remover arquivos do OPFS primeiro.

## 8. Estrutura de Arquivos

lilo/
├── AGENTS.md
├── deno.json
├── build.ts
├── main.ts
├── public/
│   └── p2p-transfer.worker.js
├── src/
│   ├── index.html
│   ├── sw.ts
│   ├── store.ts
│   ├── crypto.ts
│   ├── types/
│   │   └── material-web.d.ts
│   ├── utils/
│   │   ├── storage.ts
│   │   ├── capabilities.ts
│   │   ├── pwa.ts
│   │   ├── backup.ts
│   │   ├── imageProcessor.ts
│   │   └── webShareTarget.ts
│   └── components/
│       ├── App.tsx
│       ├── ChatWindow.tsx
│       ├── Profile.tsx
│       ├── Settings.tsx
│       ├── About.tsx
│       └── TransferDock.tsx
└── tests/
    ├── storage.test.ts
    └── crypto.test.ts




## 9. Limitações Conhecidas
*   **OPFS:** Suporte limitado em navegadores muito antigos.
*   **Persistência:** Não garante 100% de proteção (usuário pode limpar manualmente).
*   **Web Share Target:** Apenas Chrome/Android.
*   **Contact Picker:** Apenas Chrome Android 80+.
*   **BarcodeDetector:** Safari não suporta.
