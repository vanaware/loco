# 📂 Armazenamento Local de Mídias via OPFS — Especificação Técnica

Este documento descreve a especificação técnica do uso do **Origin Private File System (OPFS)** como sistema de arquivos local no **Loco**, detalhando a segregação em relação ao **IndexedDB**, os padrões de escrita (Síncrona vs. Assíncrona), o gerenciamento de mídias pesadas e as políticas de retenção/evicção.

---

## 1. Visão Geral e Necessidade Arquitetural

Aplicações web tradicionais utilizam `IndexedDB` ou `localStorage` para guardar dados no dispositivo do usuário. No entanto, o armazenamento de arquivos pesados (fotos em alta resolução, vídeos, mensagens de voz e documentos) diretamente no IndexedDB apresenta limitações críticas:

* **Overhead de Serialização:** A leitura e gravação de grandes `Blob`s ou `Uint8Array`s no IndexedDB causam gargalos de serialização Structured Clone.
* **Bloqueio da Thread Principal:** Leituras frequentes de arquivos grandes no IndexedDB aumentam o tempo de renderização da UI.
* **Incompatibilidade com I/O Síncrono:** Módulos que processam arquivos em pedaços (*chunks*), como o motor WebTorrent no Web Worker (`p2p-transfer.worker.ts`), exigem operações de leitura/escrita de baixa latência e alta vazão.

O **OPFS (Origin Private File System)** resolve esses problemas fornecendo um sistema de arquivos privativo, persistente e de alta performance no navegador.

---

## 2. Divisão de Responsabilidades: IndexedDB vs. OPFS

No **Loco**, a persistência é dividida rigorosamente conforme a natureza dos dados:

```text
                               +----------------------------+
                               |     Recursos de Dados      |
                               +--------------+-------------+
                                              |
                       +----------------------+----------------------+
                       |                                             |
            (Dados Estruturados)                              (Arquivos Grandes)
                       |                                             |
                       v                                             v
        +------------------------------+              +------------------------------+
        |          IndexedDB           |              |             OPFS             |
        |      (via idb-keyval)        |              | (Origin Private File System) |
        +------------------------------+              +------------------------------+
        | - AppConfig_DB               |              | - Imagens originais em alta  |
        | - BrowserB_Contatos_DB       |              | - Mensagens de áudio/voz     |
        | - BrowserB_MensagensRecebidas|              | - Vídeos e Anexos P2P        |
        | - BrowserA_MensagensEnviadas |              | - Arquivos do WebTorrent     |
        | - Handshake_DB               |              |   (salvos em chat_files/)    |
        +------------------------------+              +------------------------------+
```

---

## 3. Diretório e Padrão de Nomenclatura

Todos os anexos de conversas e mídias recebidas ou enviadas são organizados em um diretório privativo raiz:

```text
opfs://chat_files/{fileHash}.bin
```

### Padrão de Identificação (`fileHash`):

Em vez de utilizar apenas o `messageId`, os arquivos são salvos e indexados pelo seu **Hash SHA-256 (`fileHash`)**:

1. **Deduplicação Nativa:** Se a mesma imagem ou documento for compartilhado em múltiplas conversas, o arquivo físico é gravado uma única vez no OPFS.
2. **Validação de Integridade:** Permite ao Web Worker verificar se os pedaços (*pieces*) recebidos via WebTorrent correspondem exatamente ao hash do arquivo esperado.

---

## 4. Modos de Acesso ao OPFS

### A. Acesso Assíncrono (`Main Thread` / UI)

Utilizado em `src/components/ChatSection.tsx` e `src/stores/mensagensStore.ts` para carregar mídias leves ou salvar anexos selecionados pelo usuário:

```typescript
// Exemplo de gravação assíncrona na Main Thread
const root = await navigator.storage.getDirectory();
const chatDir = await root.getDirectoryHandle("chat_files", { create: true });
const fileHandle = await chatDir.getFileHandle(`${fileHash}.bin`, { create: true });

const writable = await fileHandle.createWritable();
await writable.write(blobData);
await writable.close();
```

### B. Acesso Síncrono (`Web Worker Thread` - `p2p-transfer.worker.ts`)

Utilizado exclusivamente no contexto do Web Worker para streaming de mídias e *seeding/download* P2P de alta performance via `FileSystemSyncAccessHandle`:

```typescript
// Exemplo de gravação síncrona dentro do Web Worker
const root = await navigator.storage.getDirectory();
const chatDir = await root.getDirectoryHandle("chat_files", { create: true });
const fileHandle = await chatDir.getFileHandle(`${fileHash}.bin`, { create: true });

// Acesso síncrono de altíssima velocidade (apenas em Workers)
const syncHandle = await fileHandle.createSyncAccessHandle();
syncHandle.write(bufferChunk, { at: offset });
syncHandle.flush();
syncHandle.close();
```

---

## 5. Ciclo de Vida do Arquivo no OPFS

```text
   [ Seleção/Download do Arquivo ]
                 |
                 v
   Gravação Física no OPFS (chat_files/{hash}.bin)
                 |
                 v
   Registro de Metadados no IndexedDB
   (Nome, MimeType, Tamanho e Hash)
                 |
                 +-----------------------+-----------------------+
                 |                                               |
                 v                                               v
     Visualização na Timeline                          Exportação / Exclusão
     - Leitura como Blob                               - Salvar no dispositivo
     - URL.createObjectURL()                           - Exclusão física no OPFS
     - Descarte do URL no unmount                      - Atualização do status na UI
```

1. **Gravação:** Ao anexar ou concluir o download P2P de um arquivo, o binário é gravado no OPFS e os metadados (nome original, tipo MIME, tamanho e `fileHash`) são registrados nos bancos `BrowserA_MensagensEnviadas_DB` ou `BrowserB_MensagensRecebidas_DB`.
2. **Visualização na UI:** A aplicação obtém a referência `File` do OPFS, cria um `blob:` URL efêmero (`URL.createObjectURL(file)`) para renderização no elemento `<img />` ou `<video />`, e revoga a URL (`URL.revokeObjectURL`) ao desmontar o componente para evitar vazamento de memória RAM.
3. **Exclusão Granular:** Quando o usuário clica em "Excluir Mídia", o arquivo físico é removido do OPFS (`chatDir.removeEntry(fileHash)`). O texto da mensagem permanece gravado no IndexedDB, atualizando seu estado visual para *"⚠️ Arquivo local removido"*.
4. **Exportação Nativa:** Ao clicar em "Salvar no Dispositivo", o app tenta utilizar a API `window.showSaveFilePicker()`. Se não houver suporte, realiza o download tradicional via elemento `<a download>`.

---

## 6. Proteção Contra Evicção e Monitoramento de Quota

### A. Armazenamento Persistente (`navigator.storage.persist()`)

Para evitar que o sistema operacional expurgue silenciosamente as mídias salvas em situações de pouco espaço em disco, o Loco solicita permissão de Armazenamento Persistente na inicialização (`src/app.tsx`):

```typescript
if (navigator.storage && navigator.storage.persist) {
  const isPersisted = await navigator.storage.persist();
  console.log(`[Storage] Armazenamento Persistente: ${isPersisted ? 'Ativo' : 'Indefinido'}`);
}
```

### B. Monitoramento de Quota (`AdvancedSection.tsx`)

O painel avançado monitora o consumo do armazenamento local consultando a API `navigator.storage.estimate()`:

* Exibe o total consumido (IndexedDB + OPFS) e a quota limite concedida pelo navegador.
* Quando o uso ultrapassa **80% da capacidade**, a interface exibe um aviso orientando o usuário a remover arquivos antigos ou realizar um export de segurança.

---

## 7. Tabela Comparativa: Rascunho Antigo vs. Arquitetura Atual

| Recurso / Aspecto | Especificação Antiga | Arquitetura Atual e Planejada |
| :--- | :--- | :--- |
| **Identificação do Arquivo** | `chat_files/{messageId}.ext` | **Indexação por SHA-256 (`chat_files/{fileHash}.bin`)** |
| **Metadados** | Chave genérica `storedFiles` | **Bancos isolados (`BrowserA` e `BrowserB` no IndexedDB)** |
| **I/O Síncrono** | Menção genérica sem integração | **Integração total via Worker Thread (`p2p-transfer.worker.ts`)** |
| **Gestão de Estado** | Funções soltas em `store.ts` | **Stores Modulares (`mensagensStore.ts`) e Signals (`state.ts`)** |
| **Limpeza de Memória** | Sem controle explícito de Blobs | **Revogação ativa de `blob:` URLs ao desmontar componentes** |

---

## 8. Próximos Passos de Implementação

1. **Criar Utilitário `src/utils/opfs-utils.ts`:** Abstração reutilizável para operações de I/O de arquivos (`saveToOPFS`, `readFromOPFS`, `removeFromOPFS`).
2. **Integrar ao Worker `p2p-transfer.worker.ts`:** Conectar a escrita síncrona `FileSystemSyncAccessHandle` ao recebimento de blocos via WebTorrent.
3. **Aprimorar Componente `ChatSection.tsx`:** Adicionar renderização de previews diretos a partir do OPFS com descarte automático de Blob URLs.
