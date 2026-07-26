# Transferência P2P de Arquivos no Loco

## Visão geral

O Loco permite enviar arquivos (fotos, vídeos, documentos) diretamente entre
dois dispositivos, sem passar por servidor central. Para isso, usamos uma
combinação de tecnologias:

- **WebTorrent**: biblioteca P2P que usa WebRTC para transferir arquivos via
  protocolo BitTorrent.
- **Web Worker**: thread separada que executa toda a lógica do WebTorrent, sem
  bloquear a interface.
- **OPFS (Origin Private File System)**: sistema de arquivos privativo do
  navegador, usado para armazenar arquivos grandes.
- **IndexedDB**: metadados dos arquivos e mensagens.

## Por que WebTorrent?

WebTorrent é ideal para este cenário porque:

- Permite compartilhar um arquivo gerando apenas um **magnet link**.
- O magnet link pode ser enviado por mensagem de texto (via Push ou
  DataChannel).
- O receptor inicia o download diretamente a partir do remetente.
- Não precisa de tracker próprio: pode usar trackers públicos para descobrir
  peers.

## Arquitetura isolada: Web Worker

Todo o processamento do WebTorrent roda dentro do arquivo
`src/worker/p2p-transfer.worker.js`. Isso é importante porque:

- Evita travamentos na thread principal.
- Permite transferir arquivos grandes sem congelar a UI.
- A comunicação com o app acontece via `postMessage`.

### Tipos de mensagem trocadas

| Origem | Destino | Evento                  | Propósito                            |
| ------ | ------- | ----------------------- | ------------------------------------ |
| App    | Worker  | `P2P_START_SEED`        | Inicia o envio de um arquivo         |
| Worker | App     | `P2P_SEED_READY`        | Magnet link pronto para compartilhar |
| App    | Worker  | `P2P_START_DOWNLOAD`    | Inicia o download de um magnet link  |
| Worker | App     | `P2P_PROGRESS`          | Progresso em tempo real              |
| Worker | App     | `P2P_DOWNLOAD_COMPLETE` | Download finalizado e salvo no OPFS  |
| App    | Worker  | `P2P_CANCEL`            | Cancela transferência                |
| Worker | App     | `P2P_SESSION_ENDED`     | Sessão encerrada                     |
| Worker | App     | `P2P_ERROR`             | Erro na transferência                |

## Fluxo de envio de arquivo

```
Usuário seleciona arquivo
        |
        v
App envia File para o Worker
        |
        v
Worker cria seed com WebTorrent
        |
        v
Worker retorna magnetURI
        |
        v
App envia magnetURI como mensagem de texto
        |
        v
Contato recebe mensagem e inicia download
```

Detalhado:

1. Usuário seleciona um arquivo no `ChatWindow`.
2. `startFileSend(file)` é chamado no `store.ts`.
3. O Worker recebe `P2P_START_SEED`, cria o torrent e começa a seedar.
4. Quando o torrent está pronto, o Worker envia `P2P_SEED_READY` com o
   `magnetURI`.
5. O `store.ts` detecta o magnet link e envia como mensagem de texto para o
   contato.
6. O remetente continua seedando até que todos os peers desconectem.

## Fluxo de recebimento de arquivo

```
Mensagem com magnet link recebida
        |
        v
App extrai o magnetURI
        |
        v
App envia P2P_START_DOWNLOAD para o Worker
        |
        v
Worker conecta no swarm e baixa o arquivo
        |
        v
Worker salva o arquivo no OPFS
        |
        v
Worker envia P2P_DOWNLOAD_COMPLETE
        |
        v
App registra o arquivo no IndexedDB e mostra no chat
```

## Armazenamento dos arquivos

### OPFS (Origin Private File System)

Arquivos grandes não são armazenados no IndexedDB. Eles vão para o OPFS, que
oferece:

- Melhor performance para leitura/escrita.
- Limite de armazenamento maior que IndexedDB.
- Acesso privativo à origem (apenas o app pode acessar).

Cada arquivo é salvo com o nome `chat_files/{messageId}.{ext}`.

### Metadados no IndexedDB

Informações sobre o arquivo (nome, tipo MIME, tamanho, caminho no OPFS) são
armazenadas no IndexedDB na chave `storedFiles`.

## Widget de transferência: TransferDock

O `TransferDock.tsx` mostra o progresso em tempo real:

- Nome do arquivo.
- Porcentagem de progresso.
- Velocidade de transferência.
- Número de peers conectados.
- Botão para cancelar.

O dock aparece automaticamente quando uma transferência está ativa e desaparece
quando concluída.

## Cancelamento de transferência

Quando o usuário clica em cancelar:

1. App envia `P2P_CANCEL` para o Worker.
2. Worker destrói o torrent e o cliente.
3. Worker notifica `P2P_SESSION_ENDED`.
4. UI atualiza o estado para `cancelled`.

## Auto-terminação do seed

Após o envio completo e a desconexão de todos os peers, o seed é encerrado
automaticamente. Isso economiza bateria e banda do dispositivo remetente.

## Limitações e considerações

| Aspecto                      | Situação                                              |
| ---------------------------- | ----------------------------------------------------- |
| WebTorrent precisa de WebRTC | Funciona na maioria dos navegadores modernos          |
| NAT restritivo               | Pode bloquear conexões; TURN ajudaria                 |
| Trackers públicos            | Podem ser bloqueados por firewalls corporativos       |
| OPFS                         | Disponível em Chrome/Edge/Safari; Firefox não suporta |
| Arquivos grandes             | Funcionam bem, mas podem consumir bateria             |

## Resumo do fluxo de dados

```
┌─────────────┐     postMessage      ┌──────────────────┐
│  Main Thread│ <------------------> │  Web Worker      │
│  (store.ts) │                      │  (WebTorrent)    │
└─────────────┘                      └──────────────────┘
        |                                      |
        | IndexedDB                            | OPFS
        v                                      v
   storedFiles                           chat_files/
   (metadados)                           (arquivos)
```

## Próximos aprimoramentos

- Suporte a TURN para redes restritas.
- Compressão de arquivos antes do envio.
- Criptografia end-to-end dos arquivos.
- Preview de arquivos enquanto baixam.
- Sincronização de estado de transferência entre dispositivos do mesmo usuário.
