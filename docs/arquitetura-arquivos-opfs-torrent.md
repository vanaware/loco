### 1. A Mudança de Paradigma: De "Push" para "Pull"

No envio de arquivos tradicional (como o WhatsApp), o cliente A "empurra" (Push) o arquivo para o servidor, e o servidor "empurra" para B.
No WebTorrent, o fluxo é estritamente **Pull (Puxar)**.

Quando a Alice escolhe um arquivo no chat para o Bob:

1. Alice salva o arquivo no seu OPFS.
2. O Web Worker da Alice gera o Torrent (fatia em pedaços e gera o `infohash` - a "impressão digital" do arquivo).
3. Alice **não** envia o arquivo. Ela envia uma **Mensagem de Texto** (Cenário A ou B) criptografada E2EE contendo o `infohash` (Magnet Link) e a *Chave Simétrica* para descriptografar.
4. O app do Bob recebe a mensagem. O Web Worker do Bob usa o WebRTC DataChannel para dizer à Alice: *"Ei, me mande o pedaço 1 do arquivo com este infohash"*.

**Conclusão no Transporte:** O nosso Roteador Dinâmico continua igual. O que muda é que a *intenção* `file_transfer` agora carrega apenas metadados leves. O peso bruto sempre vai pelo `RTCDataChannel` (Web Worker).

### 2. Criptografia no WebTorrent (O Desafio E2EE)

O protocolo BitTorrent compartilha arquivos baseado no hash de seus pedaços originais.
Se a Alice compartilha uma foto privada com o Bob (usando WebTorrent) e envia a foto em texto claro para a rede P2P, qualquer peer que descobrir o infohash pode baixar a foto.

**Como o Loco resolve isso (A Arquitetura de Permissões):**

* **Arquivos Privados / Compartilhados no Chat:** Antes do arquivo ir para a engine do WebTorrent no OPFS, ele é **criptografado simetricamente** (AES-GCM). O WebTorrent da Alice "semeia" (seeds) o arquivo em formato ininteligível. A chave AES nunca vai para o Tracker ou para a rede P2P, ela vai *apenas* por dentro da mensagem de chat E2EE da Alice para o Bob.
* **Arquivos Públicos:** Podem ser semeados sem criptografia (ou com uma chave pública do diretório da Alice, se quisermos evitar censura/rastreio direto pelo hash comum).

### 3. A Mágica da Sementeira Múltipla (Swarm P2P)

A parte mais fantástica da sua ideia ("o usuário B salva no OPFS e marca como compartilhado") é que isso cria um **Swarm (Enxame)** real.

Se a Alice manda um arquivo de 1GB no grupo para o Bob e o Carlos:

1. Bob baixa os primeiros 100MB da Alice.
2. Carlos entra online. Carlos não precisa baixar apenas da Alice. Ele vai baixar partes da Alice e partes do Bob simultaneamente!
3. Se a Alice ficar offline (fechar o PWA), o Carlos continua baixando do Bob.

Isso exige que nosso IndexedDB auxiliar rastreie o status de `seeding` (semeando) de cada arquivo no OPFS.

### 4. A Funcionalidade de Diretório Público

Para o cenário onde B pede para listar os arquivos públicos de A, precisaremos adicionar novas intenções (Intents) no nosso `HandshakeEnvelope`:

* `directory_request`: B manda um push silenciado para A perguntando "Quais seus arquivos públicos?".
* `directory_response`: A responde com um JSON contendo uma lista de `{ fileName, size, infohash, type }`.
* *(Nota arquitetural)*: Essa requisição de diretório é o cenário perfeito para o nosso **Roteamento Dinâmico (Upgrade Oportunista)**. B tenta mandar a requisição pelo WebRTC ativo primeiro, listando instantaneamente se A estiver online.

---

### Documentação da Nova Camada de Arquivos

Preparei um novo Canvas/Documento em Markdown focando exclusivamente no subsistema de armazenamento (OPFS + IDB) e na mecânica do WebTorrent dentro do Loco.

Você pode salvar este arquivo como **`docs/arquitetura-arquivos-opfs-torrent.md`**:

```markdown
# Arquitetura de Arquivos P2P (OPFS + WebTorrent)

Este documento detalha o subsistema de armazenamento e compartilhamento de mídia do **Loco**, transformando o PWA em um nó de uma rede de arquivos distribuída (Swarm), garantindo criptografia E2EE e funcionamento Offline-First.

## 1. A Topologia de Armazenamento Duplo

Os navegadores possuem limites para o IndexedDB (lento para arquivos grandes e usa muita memória RAM) e restrições de persistência. Para contornar isso, o Loco divide as responsabilidades:

### 1.1 OPFS (Origin Private File System) - "O Cofre de Binários"
* **Acesso:** Exclusivo pelo Web Worker Dedicado (via API síncrona `FileSystemSyncAccessHandle` para máxima performance).
* **Função:** Armazena os blocos binários crus (`Uint8Array`) dos arquivos que o usuário está baixando (leeching) ou compartilhando (seeding).
* **Segurança:** O próprio sistema de arquivos do sistema operacional não consegue ler os arquivos de forma fácil (são ofuscados pelo browser). Os arquivos privados/chats são gravados **já criptografados** com AES-GCM.

### 1.2 IndexedDB (IDB) Auxiliar - "O Tabelionato e Indexador"
* **Acesso:** Main Thread e Web Worker.
* **Função:** Armazena apenas os metadados, permissões e status do Torrent. Relaciona a interface gráfica com os binários no OPFS.
* **Tabela de Arquivos (Schema Conceitual):**
  ```typescript
  interface LocoFileMetadata {
    fileId: string;             // UUID interno do Loco
    infoHash: string;           // ID do BitTorrent (Magnet)
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    encryptionKey?: string;     // Chave AES exportada (Nulo se público limpo)
    
    // Níveis de Acesso
    visibility: "private" | "shared" | "public";
    sharedWith: string[];       // Array de IDs de contatos (se 'shared')
    
    // Status do WebTorrent
    status: "downloading" | "seeding" | "paused";
    progress: number;           // 0.0 a 1.0
  }

```

## 2. Fluxos de Compartilhamento

O envio de arquivos no Loco baseia-se no modelo **Pull (Requisitar)** do BitTorrent, nunca no Push (Empurrar).

### Fluxo A: Envio no Chat Privado (E2EE)

1. Alice seleciona um vídeo no chat com Bob.
2. O Worker da Alice **criptografa** o vídeo (AES-GCM com chave única).
3. O vídeo criptografado é salvo no OPFS.
4. O WebTorrent indexa o arquivo ofuscado e gera um `infoHash`.
5. O Loco salva no IDB da Alice: `visibility: "shared", sharedWith: [Bob]`.
6. **Sinalização (Chat):** Alice envia uma mensagem de texto E2EE para Bob contendo: `[infoHash + AES_Key]`.
7. O chat de Alice mostra "Enviado".
8. Bob recebe a mensagem. O PWA do Bob inicia o WebTorrent pedindo o `infoHash` para a Alice (via WebRTC DataChannel).
9. Conforme Bob baixa as peças, o Worker dele descriptografa em RAM (usando a AES_Key recebida) para mostrar na tela, mas salva criptografado no seu OPFS.

### Fluxo B: Diretório Público (Descoberta P2P)

Usuários podem marcar arquivos como "Públicos" (ex: músicas criadas por eles, manuais).

1. Bob acessa o perfil de Alice e clica em "Ver Arquivos Públicos".
2. **Requisição:** O PWA do Bob envia um Handshake do tipo `directory_request` para Alice.
* *Oportunismo:* Tenta via WebRTC; se falhar, manda via Push Silencioso.


3. O PWA da Alice responde com a lista do seu IDB onde `visibility === "public"`.
4. Bob visualiza a lista (ainda não baixou nada, salvou as referências em seu IDB).
5. Bob clica em baixar "Manual.pdf".
6. O processo do WebTorrent inicia. Se Carlos também tem esse arquivo semeando, Bob pode baixar da Alice e do Carlos ao mesmo tempo!

## 3. Resiliência e Economia de Espaço

* **Pausas e Retomadas:** O WebTorrent divide o arquivo em `pieces` (ex: 256KB). Se a Alice fechar o app aos 50% de um vídeo de 1GB, o IDB salva o estado. Quando ela abrir, o download continua exatamente do pedaço 50%, sem corromper.
* **Geração de Magnet Links Internos:** Ao invés de usar Trackers WebTorrent públicos (que exporiam metadados), o Loco passa os dados de roteamento (quem está semeando o quê) estritamente pelos túneis WebRTC autenticados entre os amigos.
