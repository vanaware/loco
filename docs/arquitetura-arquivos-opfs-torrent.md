# Arquitetura de Arquivos P2P (OPFS + WebTorrent) - Criptografia em Streaming

Este documento detalha o subsistema de armazenamento e compartilhamento de mídia do **Loco**, transformando o PWA em um nó de uma rede de arquivos distribuída (Swarm), garantindo criptografia E2EE sem estourar a memória RAM e mantendo o funcionamento Offline-First.

---

## 1. A Topologia de Armazenamento Duplo

Os navegadores possuem limites estritos para o uso de IndexedDB (lento para arquivos grandes e aloca em RAM). Para garantir performance sem travar a interface do PWA, o Loco divide as responsabilidades:

### 1.1 OPFS (Origin Private File System) - "O Cofre de Binários"
* **Acesso:** Exclusivo pelo Web Worker Dedicado através de acesso síncrono (`FileSystemSyncAccessHandle`).
* **Função:** Armazena os blocos binários crus (`Uint8Array`) dos arquivos que o usuário está baixando (leeching) ou compartilhando (seeding).
* **Segurança:** Isolado por origem pelo navegador. Gravação de arquivos por blocos (*chunks*) sem alocação massiva de RAM.

### 1.2 IndexedDB (IDB) Auxiliar - "O Tabelionato e Indexador"
* **Acesso:** Main Thread e Web Worker.
* **Função:** Armazena metadados, permissões, estado do torrent e histórico de transferências.
* **Schema dos Metadados do Arquivo:**
  ```typescript
  export interface LocoFileMetadata {
    fileId: string;             // UUID interno do Loco
    infoHash: string;           // ID do BitTorrent (Magnet)
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    chunkSize: number;          // Tamanho de cada pedaço (ex: 524288 bytes / 512KB)
    
    // Níveis de Acesso
    visibility: "private" | "shared" | "public";
    sharedWith: string[];       // Array de IDs de contatos autorizados
    
    // Status
    status: "downloading" | "seeding" | "paused";
    completedChunks: number[]; // Lista de índices de blocos já baixados
  }

```

---

## 2. Criptografia Híbrida em Streaming (Chunk-Level E2EE)

Para permitir a transferência de arquivos gigantes (ex: +1GB) em dispositivos com pouca memória RAM (Smartphones), **o arquivo NUNCA é criptografado por inteiro de uma só vez**.

Reutilizamos as **chaves E2EE de contato já existentes** no Loco.

```
[Arquivo Original] -> Fatiado em Blocos (512KB) 
                             ↓
              [Criptografa Bloco N (AES-GCM)] (RAM < 10MB)
                             ↓
             [Envia via WebRTC / WebTorrent]
                             ↓
             [Descriptografa Bloco N no Destino]
                             ↓
             [Grava Bloco N no OPFS do Destinatário]

```

### 2.1 Processo de Envio e Criptografia

1. A chave simétrica negociada com o contato (via ECDH/E2EE) é utilizada como Chave Mestra para a sessão de arquivo.
2. Cada bloco de 512KB recebe um **IV (Vector de Inicialização) derivado do Índice do Bloco** (`iv = Hash(ChaveContato + ChunkIndex)`). Isso garante que o mesmo pedaço repetido não gere o mesmo ciphertext (prevenindo ataques de padrão), sem precisar transmitir IVs adicionais.
3. O Web Worker lê do OPFS apenas os 512KB do bloco requisitado pelo peer, criptografa o bloco na memória (ocupando insignificantes ~1MB de RAM) e despacha via `RTCDataChannel`.

### 2.2 Processo de Recebimento

1. O destinatário recebe o pacote do bloco de 512KB.
2. Utiliza a sua chave local do contato + o índice do bloco para descriptografar os 512KB em memória.
3. Grava o bloco descriptografado de 512KB na posição exata do seu arquivo no OPFS (`accessHandle.write(buffer, { at: chunkIndex * chunkSize })`).
4. **Streaming Instantâneo:** Assim que os primeiros blocos sequenciais são gravados, a interface do Preact já pode renderizar uma tag `<video>` ou `<audio>` consumindo o arquivo direto do OPFS enquanto o resto é baixado!

---

## 3. Matriz de Permissões e Compartilhamento

| Visibilidade | Criptografia por Bloco | Acesso ao InfoHash | Como o Destinatário Descobre |
| --- | --- | --- | --- |
| **Privado** | Criptografado com Chave Própria | Apenas o próprio usuário | Salvo localmente, não anunciado no P2P. |
| **Compartilhado** | Criptografado com Chave do Contato | Apenas contatos em `sharedWith` | Recebe mensagem de chat contendo o `infoHash`. |
| **Público** | Sem Criptografia (Texto Claro) | Qualquer nó da rede | Requisitado via `directory_request` no chat. |

---

## 4. Benefícios Arquiteturais da Solução

1. **Uso de Memória RAM Constante:** Suporta arquivos de qualquer tamanho (10MB ou 100GB) com pegada de RAM < 10MB.
2. **Sem Redundância de Chaves:** Zera a necessidade de criar ou trocar novas chaves de criptografia; reutiliza o ecossistema E2EE de contatos já estabelecido.
3. **Resiliência e Interrupção:** Se a conexão cair no bloco 450, ao reconectar, o download é retomado exatamente a partir do bloco 450.
