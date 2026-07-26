# Armazenamento de Arquivos com OPFS no Loco

## O problema

Aplicativos web tradicionalmente usam **IndexedDB** ou **localStorage** para
guardar dados no dispositivo do usuário. Embora o IndexedDB seja excelente para
dados estruturados e binários pequenos, ele não é ideal para arquivos grandes
porque:

- As operações são baseadas em key-value.
- Ler/gravar grandes blobs pode ser lento.
- O espaço pode ser limitado e gerenciado pelo navegador de forma imprevisível.

O Loco precisa armazenar fotos, vídeos, áudios e documentos compartilhados em
conversas. Para isso, precisamos de uma solução mais adequada.

## O que é OPFS

**OPFS (Origin Private File System)** é uma API do navegador que permite criar,
ler, escrever e excluir arquivos dentro de um sistema de arquivos privativo da
aplicação. Pense nisso como um diretório no dispositivo que apenas o seu app
pode acessar.

Características principais:

- **Privativo**: cada origem (domínio) tem seu próprio espaço isolado.
- **Persistente**: arquivos permanecem disponíveis entre sessões.
- **Alta performance**: especialmente quando usado com
  `FileSystemSyncAccessHandle`.
- **Tamanho generoso**: limitado principalmente pela quota do dispositivo.

## Por que o Loco usa OPFS

No Loco, o OPFS é usado para:

- Armazenar arquivos grandes recebidos por P2P.
- Guardar fotos de perfil em alta resolução.
- Manter vídeos e documentos sem ocupar a memória RAM.
- Permitir exportar arquivos para o sistema de arquivos do usuário.

## Caminho dos arquivos

Os arquivos são organizados por conversa e mensagem:

```
opfs://chat_files/{messageId}.{ext}
```

Exemplo:

```
opfs://chat_files/file_1698901234567.jpg
opfs://chat_files/file_1698901234568.pdf
```

Esse padrão permite:

- Rastrear facilmente qual arquivo pertence a qual mensagem.
- Excluir arquivos individualmente sem apagar o histórico de texto.
- Listar todos os arquivos do app quando necessário.

## Acesso síncrono vs assíncrono

O OPFS oferece duas formas de acessar arquivos:

### Assíncrono (WritableFileStream)

Mais simples, mas um pouco mais lenta:

```javascript
const root = await navigator.storage.getDirectory();
const dir = await root.getDirectoryHandle("chat_files", { create: true });
const fileHandle = await dir.getFileHandle("arquivo.jpg", { create: true });
const writable = await fileHandle.createWritable();
await writable.write(blob);
await writable.close();
```

### Síncrono (FileSystemSyncAccessHandle)

Mais rápido e ideal para grandes volumes de dados. Usado no Web Worker para
transferências P2P:

```javascript
const root = await navigator.storage.getDirectory();
const dir = await root.getDirectoryHandle("chat_files", { create: true });
const fileHandle = await dir.getFileHandle("arquivo.bin", { create: true });
const handle = await fileHandle.createSyncAccessHandle();
handle.write(buffer);
handle.close();
```

> O Loco ainda usa a versão assíncrona em alguns pontos, mas a API síncrona é
> recomendada para melhor performance com arquivos grandes.

## Como o Loco gerencia arquivos

### Salvando um arquivo

1. Recebe o `File` ou `Blob`.
2. Define `messageId` único.
3. Escreve no OPFS em `chat_files/{messageId}.{ext}`.
4. Armazena metadados no IndexedDB (`storedFiles`).
5. Cria um `blob:` URL para exibição na interface.

### Lendo um arquivo

1. Localiza o caminho no `storedFiles` (IndexedDB).
2. Abre o arquivo no OPFS pelo nome.
3. Retorna o `File` para exibição ou download.

### Excluindo um arquivo

1. Usuário clica em "Excluir" no anexo.
2. O app remove o arquivo físico do OPFS.
3. O app atualiza a mensagem no IndexedDB para não referenciar mais o arquivo.
4. O app libera o `blob:` URL da memória.
5. A mensagem de texto permanece no chat, marcada como "🗑️ Arquivo excluído".

### Exportando um arquivo

1. O usuário clica em "Baixar".
2. O app lê o arquivo do OPFS.
3. Se o navegador suportar `showSaveFilePicker`, abre o diálogo nativo "Salvar
   como".
4. Caso contrário, usa um link `<a download>` para download tradicional.

## Fallback quando OPFS não está disponível

Nem todos os navegadores suportam OPFS. O principal exemplo é o Firefox. Nesses
casos, o Loco usa **Blob URLs temporários**:

```javascript
const url = URL.createObjectURL(file);
```

Isso funciona, mas:

- O arquivo não persiste entre sessões.
- Ocupa memória RAM.
- Não é possível excluir granularmente.

Por isso, o Loco detecta a capacidade de OPFS e exibe avisos quando necessário.

## Integração com backup

O OPFS é parte essencial do backup do Loco. Quando o usuário cria um backup
incluindo arquivos:

1. O app lista todos os arquivos em `chat_files/`.
2. Copia cada arquivo para dentro do ZIP de backup.
3. Na restauração, recria os arquivos no OPFS e atualiza o `storedFiles`.

## Proteção e privacidade

- Arquivos no OPFS são acessíveis **apenas pela origem** (seu domínio).
- Outros sites e aplicativos não conseguem acessar.
- O usuário pode exportar explicitamente quando quiser compartilhar.
- A limpeza automática do navegador pode remover os dados se o armazenamento não
  estiver marcado como persistente.

Por isso, o Loco solicita `navigator.storage.persist()` durante a inicialização
para reduzir a chance de evicção.

## Quota e monitoramento

O navegador impõe limites de armazenamento baseados no espaço disponível no
dispositivo. O Loco monitora:

- Quota total estimada.
- Espaço usado.
- Percentual de uso.

Quando o uso ultrapassa 80%, o app alerta o usuário para fazer backup ou limpar
arquivos antigos.

## Comparação com outras soluções

| Característica   | OPFS                  | IndexedDB   | localStorage | Blob URL   |
| ---------------- | --------------------- | ----------- | ------------ | ---------- |
| Persistência     | ✅ Sim                | ✅ Sim      | ✅ Sim       | ❌ Não     |
| Arquivos grandes | ✅ Excelente          | ⚠️ Limitado | ❌ Ruim      | ⚠️ Memória |
| Performance      | ✅ Alta               | ⚠️ Média    | ❌ Baixa     | ⚠️ Média   |
| Acesso privativo | ✅ Sim                | ✅ Sim      | ✅ Sim       | ✅ Sim     |
| Compartilhamento | ❌ Necessita exportar | ❌ Ruim     | ❌ Ruim      | ⚠️ Via URL |

## Resumo

OPFS é o sistema de arquivos privativo do navegador. No Loco, ele é a camada de
armazenamento ideal para arquivos de mídia e documentos, oferecendo:

- Persistência entre sessões.
- Alta performance.
- Exclusão granular.
- Exportação para o sistema do dispositivo.

Quando combinado com IndexedDB para metadados, forma uma arquitetura de
armazenamento robusta para um PWA de mensagens descentralizado.
