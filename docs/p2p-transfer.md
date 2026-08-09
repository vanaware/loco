# 📁 Transferência P2P de Arquivos — Especificação Técnica (Funcionalidade Futura)

Este documento especifica a arquitetura planejada para a **Transferência P2P de Arquivos de Grande Porte** (fotos em alta resolução, vídeos, áudios e documentos) no **Loco**, utilizando a biblioteca **WebTorrent**, processamento isolado em **Web Worker**, armazenamento no **OPFS (Origin Private File System)** e sinalização assíncrona via **Roteador de Handshakes**.

---

## 1. Visão Geral e Filosofia

Como um mensageiro *Local-First* sem servidor central de mídia, o Loco não armazena anexos de usuários na nuvem. A transferência de arquivos pesados é realizada diretamente entre os navegadores (*Peer-to-Peer*), garantindo:

1. **Privacidade Absoluta:** O arquivo trafega de nó para nó sem ser enviado a nenhum servidor intermediário.
2. **Escalabilidade Sem Custos de Servidor:** Arquivos de centenas de megabytes não consomem banda nem armazenamento no backend Deno.
3. **Isolamento de Performance:** Toda a computação pesada de *seeding*, *hashing* de blocos e montagem do BitTorrent é executada em segundo plano em um **Web Worker** (`src/worker/p2p-transfer.worker.ts`), sem travar a interface do usuário (60 FPS).
4. **Persistência Imediata:** Arquivos baixados são gravados diretamente no **OPFS**, liberando a memória RAM.

---

## 2. Arquitetura em Camadas

```text
+-----------------------------------------------------------------------------------+
|                                  THREAD PRINCIPAL                                 |
|                                                                                   |
|   +-----------------------+   Signals   +------------------------------------+   |
|   |   ChatSection.tsx     | <---------> |   src/stores/mensagensStore.ts     |   |
|   +-----------------------+             +-----------------+------------------+   |
+-----------------------------------------------------------|-----------------------+
                                                            | postMessage / Events
                                                            v
+-----------------------------------------------------------------------------------+
|                        WEB WORKER (Worker Thread)                                 |
|                        src/worker/p2p-transfer.worker.ts                          |
|                                                                                   |
|  +--------------------------------+       +------------------------------------+  |
|  |     Motor WebTorrent (P2P)     | <---> |   OPFS (Origin Private File System)|  |
|  |   (RTCDataChannel / Trackers)  |       |   chat_files/{fileHash}.bin        |  |
|  +--------------------------------+       +------------------------------------+  |
+-----------------------------------------------------------------------------------+
                                                            |
                                                            v Handshake Cifrado E2E
                                                    (sw-handshakes.ts)
```

### A. Thread Principal (UI & Stores)
* **`mensagensStore.ts` & `src/signals/state.ts`:** Gerenciam o progresso reativo da transferência (velocidade, porcentagem, peers), exibindo barras de progresso na timeline de conversas do `ChatSection.tsx`.
* **Metadados em `BrowserA` / `BrowserB` (IndexedDB):** Registrarão as referências dos arquivos (hash, MIME type, tamanho original e caminho no OPFS).

### B. Web Worker (`src/worker/p2p-transfer.worker.ts`)
* Instancia a biblioteca WebTorrent em um contexto isolado de execução.
* Comunica-se exclusivamente com a Thread Principal através de mensagens fortemente tipadas via `postMessage`.

### C. Sistema de Arquivos Privativo (OPFS)
* As operações de I/O de grande porte leem e escrevem dados síncronos através da API `FileSystemSyncAccessHandle` no OPFS.
* Os arquivos são gravados sob a estrutura `chat_files/{fileHash}.bin`.

---

## 3. Mensagens do Web Worker (`postMessage`)

A interface entre a Thread Principal e o Worker utiliza contratos tipados de dados:

| Origem | Destino | Evento (`type`) | Descrição do Payload |
| :--- | :--- | :--- | :--- |
| **App** | **Worker** | `P2P_START_SEED` | Envia referência de arquivo do OPFS/Blob para iniciar o *seeding*. |
| **Worker** | **App** | `P2P_SEED_READY` | Retorna o `infoHash` e o `magnetURI` gerados para o torrent. |
| **App** | **Worker** | `P2P_START_DOWNLOAD` | Inicia o download P2P a partir de um `magnetURI` recebido. |
| **Worker** | **App** | `P2P_PROGRESS` | Retorna progresso (`progress`, `downloadSpeed`, `numPeers`). |
| **Worker** | **App** | `P2P_DOWNLOAD_COMPLETE` | Confirma a gravação do arquivo completo no OPFS. |
| **App** | **Worker** | `P2P_CANCEL` | Interrompe a sessão de envio/recebimento e limpa recursos. |
| **Worker** | **App** | `P2P_ERROR` | Notifica exceções de rede ou falha na validação de hash. |

---

## 4. Sinalização e Transporte Cifrado via Handshakes (`hand-arquivo.ts`)

No Loco, o `magnetURI` de um arquivo **jamais trafega em texto claro na rede**. O compartilhamento de mídias utiliza o Roteador de Handshakes da aplicação (`sw-handshakes.ts`):

```typescript
// Extensão da interface HandshakeRotas em src/types/
export interface HandshakeRotas {
  profile?: any;
  mensagem?: any;
  contato?: any;
  arquivo?: HandshakeArquivoData; // Rota para arquivos e anexos P2P
}

export interface HandshakeArquivoData {
  fileHash: string;      // Hash SHA-256 do arquivo original
  fileName: string;      // Nome do arquivo (ex: "documento.pdf")
  fileSize: number;      // Tamanho total em bytes
  mimeType: string;      // Tipo MIME (ex: "application/pdf")
  magnetURI: string;     // Magnet Link de descoberta WebTorrent
}
```

### Garantias de Cifragem E2E:
1. O objeto `HandshakeArquivoData` é serializado e comprimido com GZIP (`fflate`).
2. O contêiner é cifrado via AES-GCM-256 e a chave simétrica é cifrada com a chave pública RSA do destinatário (`RSA-OAEP-2048`).
3. O envelope E2E cifrado (`ct`) é assinado via ECDSA P-256 (`alg: "ES256"`) e transportado através do Web Push Proxy (`/api/proxy-push`).

---

## 5. Fluxo de Execução Ponta a Ponta

```text
               NÓ EMISSOR                                   NÓ RECEPTOR
    +------------------------------+             +------------------------------+
    | 1. Seleciona Arquivo        |             |                              |
    | 2. Grava Cópia no OPFS       |             |                              |
    | 3. Worker executa SEED       |             |                              |
    | 4. Obtém magnetURI           |             |                              |
    +--------------+---------------+             +------------------------------+
                   |                                            |
                   | --- 5. Handshake Cifrado E2E (Web Push) -> |
                   |    (Cifrado com RSA-OAEP + AES-GCM)        |
                   |                                            v
    +--------------+---------------+             +------------------------------+
    |              |                             | 6. Service Worker decifra E2E|
    |              |                             | 7. Grava Metadados IndexedDB |
    |              |                             | 8. Worker executa DOWNLOAD   |
    |              | <====== 9. Conexão P2P =====> | 9. Grava no OPFS             |
    |              |     (WebTorrent / DataChannel)| 10. Atualiza UI via Signals  |
    +--------------+---------------+             +------------------------------+
```

### A. Fluxo de Envio (Emissor)
1. O usuário anexa um arquivo no `ChatSection.tsx`.
2. O arquivo é gravado no diretório OPFS local (`chat_files/`).
3. O app envia a mensagem `P2P_START_SEED` para o Web Worker (`p2p-transfer.worker.ts`).
4. O Worker inicia o *seeding* via WebTorrent e devolve o `magnetURI` gerado (`P2P_SEED_READY`).
5. O `mensagensStore.ts` enfileira um Handshake de arquivo (`hand-arquivo.ts`) no `Handshake_DB` (`FluxoOut`).
6. O Service Worker cifra o Handshake E2E e despacha via Proxy Web Push.

### B. Fluxo de Recebimento (Receptor)
1. O evento `push` desperta o Service Worker do receptor (`sw/push.ts`).
2. O Service Worker decifra o payload E2E e valida a assinatura do remetente.
3. Identifica a rota `rotas.arquivo` e passa para `hand-arquivo.ts`.
4. Salva a mensagem no histórico (`BrowserB_MensagensRecebidas_DB`) com estado `'download_pendente'`.
5. O aplicativo invoca o Web Worker enviando `P2P_START_DOWNLOAD` com o `magnetURI`.
6. O Worker conecta-se aos *swarms* do WebTorrent e salva o conteúdo no OPFS.
7. Ao concluir (`P2P_DOWNLOAD_COMPLETE`), o status da mensagem é atualizado para `'concluido'`, tornando a mídia disponível para visualização e download nativo.

---

## 6. Gerenciamento no OPFS e Prevenção de Evicção

* **Isolamento de Origem:** Os arquivos no OPFS são mantidos de forma 100% privada e inacessíveis por outros sites ou scripts externos.
* **Solicitação de Persistência:** A aplicação executa `navigator.storage.persist()` na inicialização do sistema para impedir que o navegador purgue mídias salvas durante escassez de disco.
* **Exportação Manual:** O usuário pode clicar em "Salvar no Dispositivo" para transferir o arquivo armazenado no OPFS para a pasta de Downloads nativa do seu sistema operacional.

---

## 7. Tabela Comparativa: Especificação Antiga vs. Arquitetura Atual

| Recurso / Aspecto | Especificação Antiga | Arquitetura Atual e Planejada |
| :--- | :--- | :--- |
| **Canal do Magnet Link** | Mensagem de texto em texto claro | **Handshake Cifrado E2E (`hand-arquivo.ts` via RSA-OAEP + AES-GCM)** |
| **Gerenciamento de Estado** | Monolítico via `store.ts` | **Stores Modulares (`mensagensStore.ts`) e Preact Signals (`state.ts`)** |
| **Processamento P2P** | Worker isolado sem tipagem clara | **`p2p-transfer.worker.ts` fortemente tipado com mensagens `postMessage`** |
| **Armazenamento de Mídia** | Lógica simplificada | **Diretório OPFS (`chat_files/{hash}.bin`) com metadados no IndexedDB** |
| **Resiliência de Rede** | Sem retentativas de envio de link | **Retenção no `Handshake_DB` com até 3 retentativas automáticas** |

---

## 8. Próximos Passos de Implementação

1. **Criar Módulo Worker (`src/worker/p2p-transfer.worker.ts`):** Implementar o contexto de execução do WebTorrent integrado à API de escrita síncrona do OPFS.
2. **Criar Processador de Rota (`src/handshakes/hand-arquivo.ts`):** Módulo do Service Worker encarregado de processar handshakes de mídias e anexos P2P.
3. **Evoluir Stores de Mensagens (`src/stores/mensagensStore.ts`):** Adicionar suporte a estados de transferência (`'seeding'`, `'downloading'`, `'concluido'`) reativos para o `ChatSection.tsx`.
