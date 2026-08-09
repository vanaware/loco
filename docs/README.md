# 📚 Documentação Técnica do Loco

Esta pasta contém a especificação técnica detalhada, guias de arquitetura e instruções de desenvolvimento do **Loco** — Mensageiro PWA Descentralizado e Local-First.

---

## 📖 Índice de Documentos

### 🛠️ Guia de Início e Operação
* **[execution-commands.md](./execution-commands.md):** Comandos para compilação (`build`), execução, modo de desenvolvimento e testes com Deno 2.x.

### ⚙️ Arquitetura do Sistema e Estado
* **[handshake-router.md](./handshake-router.md):** Especificação da Máquina de Estados e Roteador de Handshakes (`sw-handshakes.ts`).
* **[state-management.md](./state-management.md):** Gerenciamento de estado reativo com Preact Signals, Stores Modulares (`src/stores/`) e IndexedDB (`idb-keyval`).
* **[offline-strategy.md](./offline-strategy.md):** Estratégia de funcionamento *Local-First*, resiliência *offline* em três níveis e re-sincronização.

### 🔐 Criptografia e Transporte
* **[criptografia.md](./criptografia.md):** Modelo de Criptografia Híbrida E2E (RSA-OAEP-2048 + AES-GCM-256) e assinaturas VAPID (ECDSA P-256).
* **[webpush-architecture.md](./webpush-architecture.md):** Camada de transporte assíncrono Web Push, Proxy Cego (Deno) e blindagem por VAPID Envelope.

### 🎴 Identidade e Interface
* **[contact-sharing.md](./contact-sharing.md):** Adição de contatos via QR Code compacto (`cqr`), Web Share API (`cjwt`) e a interface `CompactContact`.
* **[ui-components.md](./ui-components.md):** Estrutura de componentes visuais (Preact + Material Design 3) e páginas dedicadas PWA.

### 💾 Armazenamento e Mídias
* **[opfs-storage.md](./opfs-storage.md):** Armazenamento local de mídias e anexos no Origin Private File System (OPFS).

### 🚀 Funcionalidades Futuras e P2P
* **[webrtc-signaling.md](./webrtc-signaling.md):** Sinalização WebRTC envelopada por Handshakes para chamadas e DataChannel.
* **[p2p-file-transfer.md](./p2p-file-transfer.md):** Transferência P2P de arquivos de grande porte via WebTorrent em Web Worker.
* **[future-roadmap.md](./future-roadmap.md):** Diagnóstico de limitações reais, pendências de integração e roadmap de desenvolvimento.
