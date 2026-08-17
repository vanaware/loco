> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém múltiplos arquivos do projeto **Loco v0.3.1-msxtm7mu** (DOCUMENTAÇÃO) estruturados em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco [v0.3.1-msxtm7mu] - Modo: DOCS

Gerado automaticamente em: 8/17/2026, 7:44:35 PM

---

## Arquivo: `LICENSE`

```LICENSE
MIT License

Copyright (c) 2026 Vanaware

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

```

---

## Arquivo: `docs/webrtc-signaling.md`

````md
# 🌐 WebRTC e Sinalização P2P — Especificação Técnica (Funcionalidade Futura)

Este documento especifica o modelo arquitetural planejado para a integração de **WebRTC** (troca de áudio/vídeo em tempo real e canais diretos de dados via `RTCDataChannel`) ao ecossistema do **Loco**, detalhando o mecanismo de sinalização através da **Máquina de Estados de Handshakes**.

---

## 1. Visão Geral e Filosofia P2P

O **Loco** adota o paradigma *Local-First* e *Peer-to-Peer*. Atualmente, o Web Push atua como meio primário de transporte assíncrono. A evolução para **WebRTC** visa proporcionar:

1. **Latência Ultra-Baixa:** Comunicação direta ponto a ponto entre navegadores sem intermediários para mensagens em tempo real quando ambos os nós estão online.
2. **Chamadas de Voz e Vídeo:** Streaming de mídia bidirecional via `RTCPeerConnection`.
3. **Transferência de Arquivos de Alta Velocidade:** Envio direto de mídias pesadas gravadas no **OPFS** utilizando `RTCDataChannel`.

---

## 2. O Desafio da Sinalização e a Solução do Loco

O protocolo WebRTC não especifica como as propostas de conexão (**SDP Offers**, **SDP Answers**) e os candidatos de rede (**ICE Candidates**) devem ser trocados entre dois navegadores.

### A Solução: Sinalização Envelopada pelo Roteador de Handshakes
Em vez de criar um servidor WebSocket centralizado ou um sinalizador inseguro, a sinalização do WebRTC no Loco **será 100% realizada através da Máquina de Estados de Handshakes (`sw-handshakes.ts`)**:

```text
+-------------------+                                               +-------------------+
|   Nó A (Emissor)  |                                               |  Nó B (Receptor)  |
| (RTCPeerConnection|                                               |(RTCPeerConnection)|
+---------+---------+                                               +---------+---------+
          |                                                                   |
          | --- 1. Gera SDP Offer ----------------------------------------->  |
          |    (Enfileira em Handshake_DB -> FluxoOut)                       |
          |    (Cifrado E2E: RSA-OAEP + AES-GCM + GZIP)                      |
          |    (Transportado via /api/proxy-push -> Web Push FCM)            |
          |                                                                   |
          |                                                                   | --- 2. Acorda SW,
          |                                                                   |      Decifra E2E,
          |                                                                   |      Processa Offer
          |                                                                   |
          | <--- 3. Gera e Devolve SDP Answer ------------------------------  |
          |    (Enfileira em Handshake_DB -> FluxoOut)                        |
          |    (Transportado via /api/proxy-push -> Web Push FCM)             |
          |                                                                   |
          +=================== 4. CONEXÃO WEBRTC ATIVA =======================+
          |                     (DataChannel / MediaStream)                   |
```

---

## 3. Estrutura do Handshake de Sinalização (`hand-webrtc.ts`)

Será criado o módulo dedicado `src/handshakes/hand-webrtc.ts` e estendida a interface `HandshakeRotas`:

```typescript
// Extensão da interface HandshakeRotas em src/types/
export interface HandshakeRotas {
  profile?: any;
  mensagem?: any;
  contato?: any;
  webrtc?: WebRTCSignalingData; // Nova Rota de Sinalização P2P
}

export interface WebRTCSignalingData {
  type: 'offer' | 'answer' | 'candidate' | 'close';
  sessionId: string;            // Identificador da sessão de chamada/canal
  sdp?: string;                 // Session Description Protocol (comprimido)
  candidate?: RTCIceCandidateInit; // Candidato ICE para descoberta de rota
  media?: 'data' | 'audio' | 'video'; // Tipo de mídia negociada
}
```

### Garantia de Cifragem E2E
Assim como todos os handshakes do Loco, o sinal WebRTC (`sdp` e `candidates`) viaja **totalmente cifrado** (RSA-OAEP-2048 + AES-GCM-256) e comprimido via `fflate`. Nem o Proxy Deno nem o Google FCM conseguem inspecionar os metadados da chamada ou IP local trocado.

---

## 4. Estrutura Compacta (`CompactSignaling`)

Os pacotes SDP padrão podem ultrapassar 2.000 bytes. Para assegurar que o token JWT assinado não exceda o limite de **4.096 bytes** da RFC 8291 (FCM), os dados de sinalização passarão por minificação de atributos e remoção de linhas SDP redundantes via `src/utils/share-utils.ts`:

| Atributo Original | Atributo Compactado | Descrição |
| :--- | :--- | :--- |
| `type` | `tp` | Tipo da mensagem (`o`: offer, `a`: answer, `c`: candidate). |
| `sessionId` | `sid` | UUID de correlação do handshake de chamada. |
| `sdp` | `s` | String SDP minificada e comprimida via GZIP (`fflate`). |
| `candidate` | `cd` | Candidato ICE serializado. |

---

## 5. Fluxo de Execução de uma Chamada P2P

### 1. Início da Chamada (Nó A)
1. O usuário aciona "Iniciar Chamada" no componente `CallScreen.tsx`.
2. A UI requisita permissões de mídia (`navigator.mediaDevices.getUserMedia`) e cria o objeto `RTCPeerConnection`.
3. Invoca `pc.createOffer()`, define `pc.setLocalDescription(offer)`.
4. Enfileira a oferta no `Handshake_DB` (`out.rotas.webrtc = { type: 'offer', ... }`).
5. O Service Worker (`sw-handshakes.ts`) cifra e despacha o envelope via Web Push Proxy.

### 2. Atendimento da Chamada (Nó B)
1. O evento `push` desperta o Service Worker do Nó B.
2. O Service Worker decifra o payload E2E e identifica `rotas.webrtc.type === 'offer'`.
3. Dispara a notificação de chamada recebida no sistema operacional e atualiza os Signals de UI (`src/signals/state.ts`).
4. Ao atender, o Nó B aceita a chamada, instancia sua `RTCPeerConnection`, registra a oferta como `remoteDescription` e gera uma `answer`.
5. Enfileira a `answer` no `Handshake_DB` (`FluxoOut`), enviando de volta ao Nó A via Web Push Proxy.

### 3. Estabelecimento e Troca de ICE Candidates
1. Ambas as partes registram os `ICE Candidates` locais e os transmitem assincronamente como Handshakes do tipo `candidate`.
2. Quando uma rota válida (Host, STUN ou TURN) é confirmada, o canal direto P2P é aberto (`iceConnectionState === 'connected'`).
3. O áudio/vídeo passa a fluir diretamente entre as duas pontas sem consumir servidores externos.

---

## 6. Travessia de NAT: STUN e TURN

Para garantir que a conexão P2P funcione em redes corporativas, roteadores móveis (4G/5G) e firewalls restritivos:

* **Servidores STUN (Standard):** Utilizados por padrão para descobrir o endereço IP público refletido (`stun:stun.l.google.com:19302`). Funciona para a maioria das redes residenciais e móveis simples.
* **Servidores TURN (Relay de Emergência):** Se ambos os nós estiverem sob NATs simétricos restritivos, o tráfego P2P direto é bloqueado. O Loco permitirá a configuração opcional de credenciais TURN efêmeras para retransmissão de mídia cifrada.

---

## 7. Tabela Comparativa: Rascunho Antigo vs. Arquitetura Atual

| Recurso / Aspecto | Especificação Antiga | Arquitetura Atual e Planejada |
| :--- | :--- | :--- |
| **Canal de Sinalização** | Métodos avulsos/indefinidos no `store.ts` | **Máquina de Estados de Handshakes (`sw-handshakes.ts`)** |
| **Segurança da Sinalização** | SDP em texto claro ou indefinido | **Cifragem E2E Obrigatória (RSA-OAEP-2048 + AES-GCM)** |
| **Limitação de Payload** | Risco de estouro de tamanho no Push | **Minificação + Compressão GZIP (`fflate`) em `share-utils.ts`** |
| **Gerenciamento de Estado** | Funções soltas em `CallScreen.tsx` | **Stores reativos (`src/stores/`) e Preact Signals (`state.ts`)** |
| **Persistência de Fila** | Perda de chamadas em falha de rede | **Retenção no `Handshake_DB` com retentativas automáticas** |

---

## 8. Próximos Passos de Implementação

1. **Criar Módulo `src/handshakes/hand-webrtc.ts`:** Processador de rotas especializado em tratar mensagens de sinalização `offer`, `answer` e `candidate`.
2. **Implementar Utilitário de Compactação de SDP:** Adicionar suporte a minificação de SDP no arquivo `src/utils/share-utils.ts`.
3. **Evoluir Componente `CallScreen.tsx`:** Conectar a UI reativa de chamadas aos Stores da aplicação, gerenciando o ciclo de vida da `RTCPeerConnection` via Signals de estado.

````

---

## Arquivo: `docs/opfs-storage.md`

````md
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

````

---

## Arquivo: `docs/crypto.md`

````md
# 🔒 Criptografia no Loco — Especificação Técnica

O **Loco** adota um modelo de **Criptografia Híbrida Ponto a Ponto (End-to-End Encryption - E2E)** combinada com assinaturas digitais de identidade. Todo o tráfego de mensagens, dados de perfil e atualizações de contato é cifrado antes de sair do dispositivo do emissor e só pode ser decifrado pelo destinatário pretendido.

O servidor backend (Deno) atua estritamente como um **proxy cego**, sem capacidade técnica de ler os conteúdos das mensagens ou armazenar histórico de conversas.

## 1. Modelo de Chaves e Identidade

Cada dispositivo (nó) gera localmente dois pares de chaves assimétricas via Web Crypto API na primeira inicialização:

### A. Par de Chaves de Identidade VAPID (`ECDSA P-256`)
* **Finalidade:** Assinatura digital dos pacotes JWT (`alg: "ES256"`), garantindo a autenticidade do remetente e autorização do serviço Web Push (FCM).
* **Chave Pública (`vapidPublicKey`):** Compartilhada via convite. Serve como identificador de nó e chave de verificação de assinatura (`kid`).
* **Chave Privada (`vapidPrivateKeyJwk`):** Armazenada de forma persistente e isolada no IndexedDB local (`AppConfig_DB`).

### B. Par de Chaves Criptográficas E2E (`RSA-OAEP-2048`)
* **Finalidade:** Cifragem/Decifragem assimétrica da chave simétrica temporária (AES) embutida no envelope E2E.
* **Chave Pública (`e2ePublicKey`):** Módulo N e Expoente E compartilhados no cartão de visitas (`CompactContact`).
* **Chave Privada (`e2ePrivateKeyJwk`):** Mantida estritamente no dispositivo local para decifrar os pacotes P2P recebidos.

## 2. Compressão por Esquema Estático (Static Schema Compression)

Para garantir máxima eficiência no armazenamento de banco de dados (IndexedDB) e respeitar o rigoroso limite de 4.096 bytes de payload do Google FCM (Web Push), o Loco implementa o conceito de **Compressão por Esquema Estático**.

As chaves criptográficas geradas pela WebCrypto API no formato JWK possuem redundância estrutural fixa (`kty`, `alg`, `ext`, `key_ops`, `e`). O Loco remove essas redundâncias nas fronteiras de I/O (Disco e Rede) e as injeta de volta de forma defensiva ("reidratação") apenas no momento da execução na memória RAM.

| Tipo de Chave | O que é Armazenado/Enviado (Minificado) | O que é Removido (Estático) |
| --- | --- | --- |
| **VAPID Pública** | Coordenadas `x` e `y` | `kty`, `crv`, `ext`, `key_ops` |
| **VAPID Privada** | Escalar privado `d` | `kty`, `crv`, `ext`, `key_ops`, `x`, `y` |
| **E2E Pública** | Módulo `n` | `kty`, `alg`, `ext`, `key_ops`, `e` ("AQAB") |
| **E2E Privada** | Fatores primos (`d`, `p`, `q`, `dp`, `dq`, `qi`) | `kty`, `alg`, `ext`, `key_ops`, `e`, `n` |

## 3. Estrutura do Envelope Cifrado e JWT

Todas as comunicações na rede viajam envelopadas em um token JWT assinado contendo um payload cifrado (`ct`):

```text
+-------------------------------------------------------------------------+
|                        JWT PAYLOAD (Max 4096 bytes)                     |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  | Assinatura Externa: ECDSA (VAPID P-256) - Autenticidade do Emissor   |  |
|  +-------------------------------------------------------------------+  |
|  | Envelope Cifrado (ct):                                            |  |
|  |   - i: Vetor de Inicialização (IV AES-GCM 12 bytes - Base64)       |  |
|  |   - d: Dados Cifrados (Rotas/Mensagem + GZIP via fflate - Base64)  |  |
|  |   - k: Chave AES Cifrada com RSA-OAEP do Destinatário (Base64)    |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+

```

## 4. Blindagem do Servidor Proxy (`vapidPrivateKeyEnvelope`)

Para enviar notificações Push sem expor a chave privada VAPID do usuário no servidor backend nem necessitar de um servidor de banco de dados centralizado:

1. O servidor Deno possui um par de chaves RSA de infraestrutura estático.
2. O cliente cifra a versão minificada de sua `vapidPrivateKeyJwk` com a chave pública do servidor Deno, criando um `vapidPrivateKeyEnvelope`.
3. Ao solicitar a entrega de um Push (`/api/proxy-push`), o cliente envia o envelope cifrado.
4. O servidor Deno decifra o envelope **exclusivamente na memória RAM**, assina o protocolo HTTP Web Push para o Google FCM, e **descarta a chave imediatamente**.

### 4.1 Invalidação Criptográfica de Cache (Server Key)

Para maximizar a performance (Offline-First), o PWA armazena a `SERVER_PUBLIC_KEY` no IndexedDB. Contudo, se a URL de Proxy (rota do servidor) for modificada, o cache é **invalidado agressivamente e deletado**. Isso garante que o app jamais crie um envelope VAPID usando uma chave RSA antiga que o novo servidor Edge da Cloudflare seria incapaz de decifrar.

## 5. Proteção contra Ameaças

| Cenário de Ameaça | Proteção Implementada | Mecanismo |
| --- | --- | --- |
| **Interceptação na Rede (MITM)** | ✅ **Protegido** | Criptografia E2E obrigatória (RSA-OAEP-2048 + AES-GCM-256). |
| **Servidor Proxy Malicioso** | ✅ **Protegido** | O payload E2E (`ct`) não compartilha a chave AES e o servidor não possui a chave RSA privada do receptor. |
| **Acesso Físico ao Dispositivo** | ✅ **Protegido** | Dados isolados no IndexedDB e OPFS, destruídos em cascata no Logout. |
| **Injeção de Caracteres (Base64)** | ✅ **Protegido** | Sanitização agressiva via Expressões Regulares (`/[^A-Za-z0-9\+\/]/g`) no interpretador JWT para mitigar falhas fatais do algoritmo `atob` durante copia/cola. |

````

---

## Arquivo: `docs/qr-code-contacts.md`

````md
# Estratégia de Funcionamento Offline do Loco

## A filosofia

O Loco é um PWA de mensagens **sem servidor central**. Isso significa que o app
deve continuar funcionando mesmo quando:

- O dispositivo está sem internet.
- A internet é intermitente.
- O servidor de push do navegador está indisponível.
- O contato está offline no momento.

A estratégia de offline do Loco é simples: **tudo que é essencial para o usuário
deve estar no dispositivo dele**. Comunicação online acontece apenas quando
possível, e sempre priorizando canais P2P.

## Princípios fundamentais

1. **Local-first**: os dados do usuário moram no dispositivo.
2. **P2P primeiro**: sempre tentar comunicação direta entre os navegadores.
3. **Push como fallback**: usar Web Push apenas quando o destinatário não está
   online.
4. **PWA como plataforma**: Service Worker, Cache API e armazenamento
   persistente tornam o app resilientes.
5. **Graceful degradation**: cada funcionalidade tem um fallback funcional.

## O que funciona 100% offline

Mesmo sem nenhuma conexão, o usuário pode:

- Ver todo o histórico de mensagens salvo no IndexedDB.
- Ver arquivos armazenados no OPFS.
- Ver informações de perfil e contatos.
- Criar mensagens (que serão enviadas quando houver conexão).
- Tirar fotos e selecionar arquivos locais para envio futuro.
- Editar configurações, contatos e perfil.

Tudo isso porque os dados estão armazenados localmente.

## O que não funciona offline

- Enviar mensagens para um contato.
- Fazer chamadas de voz/vídeo.
- Transferir arquivos via WebTorrent.
- Receber notificações de push.
- Adicionar contatos via link/QR Code (não há como entregar os dados).

Essas operações dependem de conectividade, mas o app deve continuar funcional e
sincronizar quando possível.

## Arquitetura de armazenamento local

### IndexedDB

Guarda dados estruturados:

- Perfil do usuário (`myId`, `myDisplayName`, `myVapidKeys`).
- Contatos.
- Conversas e mensagens.
- Configurações (`appConfig`).
- Metadados de arquivos (`storedFiles`).

### OPFS (Origin Private File System)

Guarda binários:

- Fotos, vídeos, documentos.
- Arquivos de mídia de chamadas (futuro).

### Cache API

Guarda recursos do app:

- HTML, CSS, JavaScript.
- Ícones, fontes, manifesto.
- Recursos do Material Web.

## Ciclo de vida de uma mensagem

```
Usuário digita mensagem
        |
        v
Mensagem é salva localmente (IndexedDB)
        |
        v
Tentativa P2P (DataChannel)
        |
        |-- sucesso --> mensagem entregue, status "delivered"
        |
        falha
        |
        v
Tentativa Web Push
        |
        |-- sucesso --> mensagem enviada, status "sent"
        |
        falha
        |
        v
Mensagem ficar├а pendente para retry
```

O app nunca bloqueia o usuário. A mensagem é salva imediatamente e o envio
tentado em background.

## Comunicação P2P como prioridade

### Por que P2P primeiro?

- **Privacidade**: os dados não passam por servidores.
- **Velocidade**: conexão direta é mais rápida, especialmente na mesma rede.
- **Independência**: não depende de serviços de push de terceiros.
- **Funciona offline em LAN**: dois dispositivos na mesma rede podem se
  comunicar via P2P mesmo sem internet.

### Como o P2P é estabelecido

1. Dois dispositivos trocam ofertas/answers WebRTC.
2. A conexão pode passar por STUN para encontrar rotas públicas.
3. Se estiverem na mesma LAN, o WebRTC usa a rota local automaticamente.
4. Um `RTCDataChannel` é aberto sobre a conexão.
5. As mensagens trafegam por esse canal.

### Retry P2P

O app tenta reconectar P2P automaticamente quando:

- O contato volta a ficar online.
- O app retorna de segundo plano.
- A rede muda (Wi-Fi para 4G, por exemplo).

Se após várias tentativas o P2P não for possível, o app usa Web Push.

## Web Push como fallback

Quando o P2P não funciona, o Web Push é usado para acordar o dispositivo do
destinatário. Ele é considerado fallback porque:

- Depende de servidores de push de terceiros.
- Pode ter latência variável.
- Pode ser bloqueado por firewalls.
- Requer permissões do usuário.

Mesmo assim, é essencial porque permite alcançar contatos que estão com o
navegador fechado ou com o dispositivo inativo.

## Service Worker e cache

O Service Worker (`src/sw/sw.ts`) é responsável por:

- Cachear assets estáticos do app.
- Servir o app offline.
- Receber e exibir notificações push.
- Interceptar requisições e responder do cache quando offline.

### Estratégias de cache

- **Cache First**: scripts, estilos, imagens e fontes são servidos do cache se
  disponíveis.
- **Network First**: HTML sempre tenta a versão mais recente.
- **Background Sync**: marca atualizações pendentes para sincronizar quando
  online.

## Sincronização quando volta a ficar online

Quando o dispositivo volta a ficar online:

1. O evento `online` do navegador é disparado.
2. O app tenta reconectar P2P com todos os contatos.
3. Mensagens pendentes são reenviadas.
4. O app verifica se há atualizações de perfil para enviar/receber.
5. Background Sync pode ser usado para sincronizar dados.

## Exclusão granular e gestão de armazenamento

Para garantir que o app continue funcionando offline sem ocupar todo o espaço:

- O usuário pode excluir arquivos individuais do OPFS sem apagar o histórico.
- O app monitora o uso de armazenamento e alerta quando passa de 80%.
- Dados antigos podem ser arquivados via backup e removidos localmente.
- `navigator.storage.persist()` é solicitado para reduzir risco de evicção.

## Cenários de uso

### Cenário 1: Avião

- Usuário abre o Loco durante um voo.
- Histórico de mensagens e arquivos estão disponíveis offline.
- Ele escreve uma mensagem para um contato.
- A mensagem é salva localmente e enviada automaticamente quando o avião pousar
  e houver conexão.

### Cenário 2: Festa sem internet

- Duas pessoas na mesma LAN de um evento sem internet.
- Ambos abrem o Loco.
- WebRTC encontra a rota local e estabelece conexão P2P.
- Mensagens e transferências funcionam sem sair da rede local.

### Cenário 3: Contato offline

- Usuário envia mensagem para contato que está offline.
- P2P falha.
- Web Push acorda o dispositivo do contato quando possível.
- Contato recebe e responde.
- Próximas mensagens podem já ir por P2P se ambos estiverem online.

## Limitações e desafios

| Desafio                                  | Impacto                       | Mitigação                                |
| ---------------------------------------- | ----------------------------- | ---------------------------------------- |
| Navegador pode limpar dados              | Perda de histórico e arquivos | `storage.persist()` e backups            |
| OPFS não suportado no Firefox            | Arquivos não persistem        | Fallback para Blob URLs temporários      |
| WebRTC pode falhar em NATs restritivos   | P2P não funciona              | Fallback para Web Push e futuro TURN     |
| Dispositivo sem internet por muito tempo | Mensagens pendentes acumulam  | Retry automático e feedback de status    |
| Dispositivo sem permissão de push        | Não recebe pushes             | Indicar status e permitir reenvio manual |

## Resumo

A estratégia offline do Loco segue a premissa de que o app é **independente e
resiliente**:

- Todos os dados essenciais estão no dispositivo.
- P2P é sempre a primeira escolha de comunicação.
- Web Push existe apenas como fallback para alcançar contatos offline.
- Service Worker (empacotado via Deno.bundle()) e Cache API garantem que o app funcione sem internet.
- Sincronização automática acontece quando a conectividade retorna.

Esse design coloca o máximo de controle possível nas mãos do usuário, sem
depender de infraestrutura central.

````

---

## Arquivo: `docs/ui-components.md`

````md
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

````

---

## Arquivo: `docs/p2p-transfer.md`

````md
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

````

---

## Arquivo: `docs/offline-strategy.md`

````md
# 📴 Estratégia de Funcionamento Offline e Resiliência no Loco

Este documento especifica a arquitetura **Local-First / Offline-First** do **Loco**, detalhando o comportamento da aplicação em cenários de desconexão, a retenção de dados no dispositivo e os mecanismos automáticos de ressincronização.

---

## 1. Filosofia e Princípios Fundamentais

O **Loco** opera sob a premissa de que **cada navegador é um nó autônomo**. O aplicativo não depende de um banco de dados centralizado para ler ou escrever informações.

1. **Local-First Absoluto:** Todo o histórico de mensagens, dados de perfil e mídias residem primariamente no dispositivo local. Nenhuma ação de interface (digitar mensagem, alterar perfil, adicionar contato) é bloqueada por ausência de rede.
2. **Sincronização Assíncrona via Handshakes:** Operações externas são tratadas como intenções registradas em uma fila local no IndexedDB (`Handshake_DB`), processadas assincronamente pelo Service Worker (`sw-handshakes.ts`).
3. **Resiliência em Três Níveis (Graceful Degradation):** A entrega de dados prioriza conexões diretas P2P, recorre ao Web Push como despertador e utiliza uma fila de retenção (*Polling Autenticado*) caso a infraestrutura de Push falhe.

---

## 2. Fast-Boot e Auto-Discovery Inteligente

Para que o PWA mantenha uma experiência ultrafluída de 60fps, o Loco aplica a estratégia de **Fast-Boot**.

* **No Primeiro Acesso (Onboarding):** A aplicação executa uma rotina de *Auto-Discovery* (`loadAllConfigs()` em `config-store.ts`). Ela envia pequenos Heartbeats (método `POST` para furar caches HTTP do navegador/servidor) para a rota atual e para a rota de `Fallback` da Cloudflare, definindo dinamicamente e com segurança o melhor caminho para transitar os envelopes de Push. Se o dispositivo estiver no "Modo Avião", a UI não trava aguardando *timeouts* da rede, inferindo automaticamente as configurações otimizadas para seguir no processo de criação offline.
* **Em Acessos Subsequentes:** Ao reabrir o App, as configurações do `ProxyPath` são lidas do IndexedDB local de maneira praticamente instantânea (~2ms). O app ignora qualquer Ping de validação externo, despachando o spinner de *Loading* de forma imediata e garantindo acesso instantâneo ao histórico de conversas E2E.

---

## 3. Divisão de Armazenamento Local

A persistência no dispositivo é estritamente setorizada por tipo de recurso para evitar gargalos na thread principal do navegador:

```text
                               +----------------------------+
                               |     Recursos de Dados      |
                               +--------------+-------------+
                                              |
       +--------------------------------------+--------------------------------------+
       |                                      |                                      |
(Dados Estruturados)                   (Arquivos Grandes)                   (Ativos PWA)
       |                                      |                                      |
       v                                      v                                      v
+------------------------------+       +------------------------------+       +------------------------------+
|          IndexedDB           |       |              OPFS            |       |         Cache Storage        |
|      (via idb-keyval)        |       | (Origin Private File System) |       |         (sw/cache.ts)        |
+------------------------------+       +------------------------------+       +------------------------------+
| - AppConfig_DB               |       | - Fotos originais em alta    |       | - HTMLs (index, share, etc.) |
| - BrowserB_Contatos_DB       |       | - Áudios e Mensagens de Voz  |       | - JS / TSX empacotados       |
| - Chat_DB                    |       | - Vídeos e Documentos P2P    |       | - Estilos CSS (Material 3)   |
| - Handshake_DB               |       | - Anexos da Timeline         |       | - Ícones e Fontes da PWA     |
+------------------------------+       +------------------------------+       +------------------------------+

```

---

## 4. O Ciclo de Vida do Handshake Offline (`Handshake_DB`)

Na arquitetura do Loco, **todas as mensagens e ações de rede são Handshakes** submetidos à Máquina de Estados operada pelo Service Worker:

```text
               [ Usuário envia uma mensagem ]
                             |
                             v
          Gravação Imediata na UI e Store Local
         (Status: 'pendente' / Exibido na Timeline)
                             |
                             v
           Enfileiramento em Handshake_DB (FluxoOut)
                             |
                             v
                   [ Há Conexão de Rede? ]
                   /                     \
             (SIM)                         (NÃO)
               /                             \
              v                               v
Processa Envio E2E                    Permanece Retido em FluxoOut
- Tenta Proxy FCM                     - Aguarda evento 'online'
- Tenta P2P (Se Online)               - Retentativas em background

```

---

## 5. Matriz de Capacidades Offline

| Funcionalidade do Loco | Modo Offline (Sem Rede) | Com Conectividade (Online) |
| --- | --- | --- |
| **Leitura do Histórico de Conversas** | ✅ **100% Funcional** (Leitura do IndexedDB) | ✅ **100% Funcional** |
| **Visualização de Anexos/Mídia** | ✅ **100% Funcional** (Carregado do OPFS) | ✅ **100% Funcional** |
| **Composição e Envio de Mensagens** | ⏳ **Enfileirado em `FluxoOut**` (Status `pendente`) | ⚡ **Disparo Imediato via E2E** |
| **Gestão de Perfil e QR Code** | ✅ **100% Funcional** (Geração local do `cqr`) | ✅ **100% Funcional** |
| **Adição Presencial de Contatos** | ✅ **100% Funcional** (Escaneamento câmera `cqr`) | ✅ **100% Funcional** |

---

## 6. Recuperação de Conexão e Ressincronização Automatizada

Quando a conectividade é restabelecida no dispositivo (disparo do evento `online` do navegador ou ativação do Background Sync):

1. **Descongelamento do Roteador:** O Service Worker executa a varredura da tabela `Handshake_DB` buscando registros com `out.status === 'pendente'` ou `'enviando'` (interrompidos por falha de rede).
2. **Re-execução de Tentativas:** O Roteador aplica uma política de até **3 retentativas** por pacote, limitando requisições fantasmas.
3. **Atualização da Interface:** As alterações nos bancos do IndexedDB notificam os stores reativos, atualizando as marcas de entrega (`✓` enviada, `✓✓` entregue/lida) sem recarregar a tela (Mutação DOM O(1)).


````

---

## Arquivo: `docs/howto.md`

````md
# 🚀 Comandos para Execução e Desenvolvimento do Loco

Este documento reúne os comandos necessários para clonar, instalar, compilar, executar e testar o **Loco** em ambiente local, utilizando o runtime **Deno 2.x**.

---

## 1. Instalação do Ambiente e Pré-requisitos

### A. Clonar o Repositório
```bash
git clone https://github.com/vanaware/loco.git
cd loco
```

### B. Instalar o Deno 2.x (se necessário)
* **Linux / macOS:**
  ```bash
  curl -fsSL https://deno.land/install.sh | sh
  ```
* **Windows (PowerShell):**
  ```powershell
  irm https://deno.land/install.ps1 | iex
  ```

---

## 2. Comandos Principais (`deno.json`)

Todas as tarefas de automação utilizam a CLI do **Deno 2.x** e estão declaradas no arquivo de configuração `deno.json`:

### A. Processamento de Build (Compilação e Artefatos)
```bash
deno task build
```
> Executa o script `build.ts`, compilando os arquivos TypeScript/TSX, copiando ativos estáticos para `dist/`, gerando as chaves RSA do servidor e injetando a relação de recursos no Service Worker.

### B. Executar o Servidor em Produção
```bash
deno task start
```
> Inicializa o servidor HTTP Deno Proxy disponibilizando a aplicação em `http://localhost:8000`.

### C. Modo de Desenvolvimento (Watch)
```bash
deno task dev
```
> Monitora alterações nos arquivos-fonte, recompilando os artefatos e reiniciando o servidor automaticamente a cada mudança.

---

## 3. Comandos de Manutenção e Qualidade

### A. Execução dos Testes Automatizados
```bash
deno task test
```

### B. Aferição Estática de Tipagem (TypeScript)
```bash
deno task typecheck
```

### C. Limpeza dos Arquivos Compilados
```bash
deno task clean
```
> Remove completamente o diretório de distribuição `dist/`.

---

## 4. Acesso à Aplicação

Após rodar `deno task start` ou `deno task dev`, abra o navegador em:

👉 **`http://localhost:8000`**

````

---

## Arquivo: `docs/README.md`

```md
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

```

---

## Arquivo: `docs/known-issues.md`

```md
# 🔮 Limitações Técnicas, Pendências e Roadmap do Loco

Este documento consolida o estado atual das limitações técnicas, pendências de integração e o plano de desenvolvimento futuro (*Roadmap*) para o **Loco**, alinhado com a arquitetura atual baseada no **Roteador de Handshakes (`sw-handshakes.ts`)**, **Stores Modulares (`src/stores/`)**, **Preact Signals** e **Servidor Proxy Deno**.

---

## 1. O que JÁ FOI IMPLEMENTADO (Evolução da Arquitetura)

Para referência técnica, os seguintes itens listados em rascunhos anteriores **já foram totalmente implementados e corrigidos** na base de código atual:

* ✅ **Criptografia E2E em Web Push (RFC 8291 / Híbrida):** Todas as mensagens trafegam cifradas via AES-GCM-256 + RSA-OAEP-2048 e comprimidas via GZIP (`fflate`). O Proxy Deno e o FCM recebem apenas o payload `ct` totalmente ilegível.
* ✅ **Persistência no Service Worker com App Fechado:** Quando um push chega e a aba está fechada, o Service Worker (`sw/push.ts` e `sw-handshakes.ts`) decifra a mensagem E2E, grava no IndexedDB (`BrowserB_MensagensRecebidas_DB`), emite o Auto-Ack e dispara a notificação nativa do SO.
* ✅ **Atualização Automática de Endpoints (*Piggybacking*):** Quando um contacto atualizou a sua subscrição ou foi adicionado, o Roteador de Handshakes detecta a divergência e injeta automaticamente o Cartão de Visitas (`hand-profile.ts`) no mesmo pacote da mensagem.
* ✅ **Gargalo do Limite de 4KB do FCM:** Resolvido com a interface `CompactContact` (`vx`, `vy`, `en`, `se`, `sp`, `sa`, `ve`), tokenização de endpoints FCM e compressão GZIP universal (`fflate`).
* ✅ **Arquitetura Reativa e Modular:** Substituição do antigo ficheiro monolítico `store.ts` por stores especializados em `src/stores/`, Signals de UI em `src/signals/state.ts` e bancos isolados no IndexedDB (`idb-keyval`).

---

## 2. Pendências de Integração de Módulos Futuros

### A. Sinalização WebRTC para Chamadas e DataChannel (`CallScreen.tsx`)
* **Estado Atual:** O componente `CallScreen.tsx` instancia a `RTCPeerConnection` e captura a mídia local, mas as funções de troca de SDP (`offer` e `answer`) e `ICE Candidates` ainda não estão conectadas ao Roteador de Handshakes.
* **Ação Necessária:** Criar o módulo especialista `src/handshakes/hand-webrtc.ts` para transportar o payload de sinalização `CompactSignaling` cifrado E2E via Web Push Proxy.

### B. Transferência P2P de Arquivos Pesados (WebTorrent + OPFS)
* **Estado Atual:** O gerenciamento de mídias leves já utiliza o OPFS. No entanto, o motor WebTorrent em Web Worker (`src/worker/p2p-transfer.worker.ts`) e o handshake especialista (`src/handshakes/hand-arquivo.ts`) estão especificados, mas aguardam integração final.
* **Ação Necessária:** Conectar o Worker à API síncrona `FileSystemSyncAccessHandle` do OPFS para gravação e leitura de blocos em alta velocidade durante *seeding/download*.

### C. Servidor TURN de Emergência para NATs Restritivos
* **Estado Atual:** A resolução de rotas P2P utiliza o servidor público STUN da Google (`stun:stun.l.google.com:19302`).
* **Ação Necessária:** Adicionar suporte à configuração opcional de credenciais de servidor TURN para retransmissão de mídia cifrada quando ambos os nós estiverem sob firewalls ou NATs simétricos restritivos.

---

## 3. Roadmap de Funcionalidades Futuras

### 💬 Funcionalidades de Mensageria e Interface
1. **Mensagens de Áudio / Voz:** Gravação nativa no navegador via `MediaRecorder API`, compressão e armazenamento no OPFS.
2. **Reações com Emojis:** Módulo handshake leve (`hand-reacao.ts`) para anexar reações a mensagens existentes.
3. **Edição e Remoção Remota:** Handshake de retratação/substituição de mensagens enviadas.
4. **Busca no Histórico e Paginação:** Indexação local de texto e virtualização de lista no `ChatSection.tsx` para suporte a conversas longas sem perda de quadros (60 FPS).
5. **Indicadores de Presença ("Online" e "A escrever..."):** Sinalização de eventos efêmeros exclusivamente através do canal direto P2P ativo (`RTCDataChannel`) quando ambos os utilizadores estão online, sem recorrer ao Web Push (evitando desperdício de bateria, limites de quota e notificações indevidas no SO).
6. **Seleção Rápida no Share Target (`ShareTargetPicker`):** Ao abrir o app via Web Share API de outro aplicativo, apresentar lista de contactos com busca para envio direto.

### 🛡️ Melhorias de Segurança e Criptografia
1. **Forward Secrecy (Double Ratchet / Signal Protocol):** Evolução do handshake para renovação de chaves efêmeras a cada mensagem, garantindo que a quebra de uma chave não comprometa o histórico passado.
2. **Bloqueio Biométrico (WebAuthn):** Exigir autenticação por biometria facial/digital antes de renderizar os sinais da UI e decifrar chaves do IndexedDB.
3. **Verificação Presencial de Fingerprint:** Exibição do hash visual das chaves públicas para comparação mútua entre contactos, prevenindo ataques do tipo Man-in-the-Middle (MITM).

### 🎴 Melhorias em QR Code e Contactos
1. **Convites Temporários e Protegidos:** Links `cjwt` com data de expiração e senha opcional para decodificação dos dados de contacto.
2. **Deep Links Nativos:** Suporte ao esquema `web+loco:` para abertura automática da PWA ao clicar em convites na web.

---

## 4. Limitações Conhecidas de Navegadores e Mitigações

| Recurso do PWA | Comportamento no Navegador | Mitigação Implementada / Planejada |
| :--- | :--- | :--- |
| **OPFS (FileSystem API)** | Suportado no Chrome, Edge e Safari. Suporte parcial ou desativado em algumas versões do Firefox. | Fallback para carregamento e persistência temporária em Blob URLs. |
| **`BarcodeDetector API`** | Funciona nativamente no Chrome Android. Indisponível ou limitado no Safari iOS. | Fallback de captura continuada de quadros de imagem com biblioteca JS local em `share.html`. |
| **`Web Share Target`** | Funcionamento pleno quando instalado como PWA no Android/Desktop. | Captura via parâmetros de busca URL (`?shared_title=...`) em `share.html`. |
| **`View Transitions API`** | Animações fluidas entre seções no Chrome/Edge. Indisponível no Safari. | Transições suaves via fallback CSS em `src/styles.css`. |
| **Armazenamento Persistente** | Sujeito a evicção pelo SO se o espaço em disco estiver crítico. | Chamada explícita de `navigator.storage.persist()` e alertas no `AdvancedSection.tsx` ao atingir 80% da quota. |

---

## 5. Matriz de Cenários e Resiliência

* **Contacto sem Internet / Offline por Longos Períodos:** As mensagens compostas ficam retidas no `Handshake_DB` com status `'pendente'`. O Roteador executa retentativas automáticas ao restabelecer a rede (`online`) e sincroniza a fila retida no Deno Proxy (`POST /api/fallback-pull`).
* **Incompatibilidade de Subscrição Push (HTTP 410 Gone):** Quando o gateway da Google/Apple rejeita um endpoint expirado, a mensagem é direcionada à Fila de Fallback Retida no Deno. Assim que o contacto reconecta, o *Piggybacking* re-alinha as chaves e restabelece o canal.

```

---

## Arquivo: `docs/Handshake.md`

````md
# 🤝 Arquitetura do Roteador de Handshakes (Loco)

Este documento descreve a especificação técnica do **Roteador Genérico de Handshakes** do **Loco**, detalhando o funcionamento da máquina de estados assíncrona *Offline-First*, os módulos especializados de rotas, o mecanismo de injeção de carona (*Piggybacking*) e a auditoria de confiança mútua.

---

## 1. Visão Geral e Filosofia

No **Loco**, não existem fluxos de rede isolados para mensagens de texto, imagens ou comandos de sistema. **Toda e qualquer comunicação na rede é um Handshake de sincronização de estados.**

O Roteador (`src/sw/sw-handshakes.ts`) opera dentro do Service Worker como uma **Máquina de Estados assíncrona** responsável por coordenar a persistência local e o transporte criptográfico E2E.

A arquitetura organiza o ciclo de vida de cada interação em duas vias principais dentro da tabela `Handshake_DB`:

* **`FluxoIn` (Entrada):** Pacotes recebidos da rede, descriptografados pelo Service Worker e enfileirados para processamento local por módulos especialistas.
* **`FluxoOut` (Saída):** Pacotes preparados pela UI ou Service Worker, enfileirados, comprimidos e cifrados para envio assíncrono.

---

## 2. Estrutura de Dados no IndexedDB (`Handshake_DB`)

Todas as interações criam ou atualizam registros na tabela `Handshake_DB` (gerenciada via `src/utils/db-helpers.ts` e `idb-keyval`):

```typescript
export interface Handshake { 
  id: string;          // ID único do handshake (jti / UUID)
  aud: string;         // Hash SHA-256 do contato destinatário/remetente (vapidPublicKey)
  in?: FluxoIn;        // Dados e estado do fluxo de recepção
  out?: FluxoOut;      // Dados e estado do fluxo de emissão
  createdAt: number;   // Timestamp de criação
  updatedAt: number;   // Timestamp da última alteração de estado
}

export interface FluxoIn {
  status: 'recebido' | 'processando' | 'processado' | 'falha';
  rotas: HandshakeRotas; // Payload descriptografado e descompactado
  tentativas: number;    // Contador de execuções
  erro?: string;         // Descrição detalhada da falha, se houver
}

export interface FluxoOut {
  status: 'pendente' | 'enviando' | 'enviado' | 'falha' | 'entregue';
  rotas: HandshakeRotas; // Payload original a ser comprimido e cifrado
  tentativas: number;    // Contador de retentativas
  erro?: string;
}

// Contêiner central de payloads roteáveis
export interface HandshakeRotas { 
  profile?: any;   // Dados de perfil e cartão de visitas (hand-profile.ts)
  mensagem?: any;  // Mensagens de texto e recibos de leitura (hand-mensagem.ts)
  contato?: any;   // Sincronização compacta de confiança (hand-contato.ts)
}
```

---

## 3. O Roteador Central (`src/sw/sw-handshakes.ts`)

O Service Worker principal atua como um orquestrador logístico e criptográfico neutro, desacoplado das regras visuais da interface:

```text
               +-----------------------------------+
               |     Ações do Usuário / PUSH       |
               +-----------------+-----------------+
                                 |
                                 v
               +-----------------+-----------------+
               |     IndexedDB: Handshake_DB       |
               +--------+-----------------+--------+
                        |                 |
             +----------+                 +----------+
             |                                       |
             v                                       v
   +-------------------+                   +-------------------+
   |   FluxoIn (IN)    |                   |   FluxoOut (OUT)  |
   | Status: recebido  |                   | Status: pendente  |
   |   -> processado   |                   |   -> enviado      |
   +---------+---------+                   +---------+---------+
             |                                       |
             v                                       v
   +-------------------+                   +-------------------+
   | Módulos Handshake |                   |  Proxy Web Push   |
   | (mensagem,        |                   |  (AES-GCM +       |
   |  contato,         |                   |   RSA + JWT)      |
   |  profile)         |                   +-------------------+
   +-------------------+
```

### A. Fluxo de Saída (Envio para a Rede)
1. **Varredura:** O Service Worker consulta a tabela `Handshake_DB` buscando registros com `out.status === 'pendente'` ou `'enviando'`.
2. **Atualização de Estado:** Transiciona o status para `'enviando'`.
3. **Injeção de Carona (*Piggybacking*):**
   * O Roteador inspeciona a agenda local (`BrowserB_Contatos_DB`) verificando o estado `me` do destinatário.
   * Se o contato alvo estiver classificado como `me: 'none'` (ainda não possui nossos dados) ou `me: 'wrong'` (dados locais desatualizados), o Roteador **injeta automaticamente o Cartão de Visitas local (`rotas.profile`) no mesmo pacote da mensagem**.
4. **Compressão e Cifragem E2E:**
   * O objeto `handshake.out.rotas` é serializado em JSON e comprimido com GZIP (`fflate`).
   * Cifra-se o bloco comprimido via AES-GCM-256 e a chave AES simétrica via RSA-OAEP-2048 (`e2ePublicKey` do receptor).
5. **Assinatura e Despacho:**
   * O envelope cifrado (`ct`) é empacotado em um token JWT (`sub: "hand"`), assinado via ECDSA P-256 (`alg: "ES256"`) com a chave VAPID privada local e despachado ao Proxy Deno (`/api/proxy-push`).

### B. Fluxo de Entrada (Recepção da Rede)
1. O evento `push` é capturado em `src/sw/push.ts`.
2. Valida-se a assinatura do JWT (`kid`) com a `vapidPublicKey` do emissor.
3. Decifra-se o envelope `ct` com a `e2ePrivateKey` (RSA-OAEP) local e desfaz-se a compressão GZIP (`fflate`).
4. Grava-se o registro em `Handshake_DB` com `in = { rotas: payloadObj, status: 'recebido', tentativas: 0 }`.
5. Invoca-se o Despachante Interno.

### C. O Despachante Interno (Processador de Fila)
* O Processador varre as entradas com `in.status === 'recebido'`, altera o status para `'processando'` e aciona em paralelo os **Módulos Especializados** em `src/handshakes/`.
* Como a execução é modular, um pacote que utilizou *Piggybacking* processa `rotas.profile` e `rotas.mensagem` no mesmo ciclo.

---

## 4. Módulos Especializados de Rotas (`src/handshakes/`)

Cada módulo especialista implementa a função `processarHandshake({ in, out })`:

### 💬 Rota Mensagem (`src/handshakes/hand-mensagem.ts`)
Gerencia o fluxo bidirecional de mensagens e recibos de confirmação:
* **Nova Mensagem Recebida (`data.enviada`):**
  1. Salva a mensagem no banco local `BrowserB_MensagensRecebidas_DB`.
  2. Aciona a notificação nativa do sistema operacional (`self.registration.showNotification`).
  3. **Auto-Ack Instantâneo:** Gera imediatamente um `FluxoOut` de resposta acusando a entrega da mensagem (`data.recebida`).
* **Recibo de Entrega Recebido (`data.recebida`):**
  * Atualiza o registro correspondente em `BrowserA_MensagensEnviadas_DB` para o status `'entregue'`, desenhando os "dois tiques" (`✓✓`) na interface do emissor.

### 👤 Rota Profile (`src/handshakes/hand-profile.ts`)
Trata a troca e atualização sob demanda de atributos de perfil (nome, foto e e-mail). Permite solicitar apenas campos específicos (ex: `['name', 'email']`), otimizando o consumo de dados.

### 🛡️ Rota Contato e Sincronização Compacta (`src/handshakes/hand-contato.ts` & `src/utils/share-utils.ts`)
Sincroniza a saúde criptográfica da relação entre dois nós.

Para respeitar o limite de **4.096 bytes** da RFC 8291 (FCM), os contatos utilizam a interface **`CompactContact`** (atributos de 2 letras como `vx`, `vy`, `en`, `se`, `sp`, `sa`, `ve`, `tr`), reduzindo o payload de ~2.5 KB para menos de **750 bytes**.

#### Auditoria do Ciclo de Confiança Mútua (`me`):
O módulo avalia o estado `me` do contato local comparando as credenciais recebidas:
* **`none`:** O dispositivo do parceiro retornou endpoint/chaves vazias (não possui nossos dados salvos).
* **`trusted`:** O parceiro possui nosso perfil salvo e homologou a relação (`tr: true`).
* **`saved`:** O parceiro possui nosso perfil salvo, mas ainda não realizou a verificação explícita.
* **`wrong` (Auditoria Paranoica):** O Roteador compara byte a byte as chaves VAPID, RSA e o Envelope recebido com o perfil local. Se **qualquer byte diferir**, sinaliza `wrong` e bloqueia a comunicação E2E até o re-alinhamento das chaves.

---

## 5. Vantagens Arquiteturais

1. **Garantia de Enquadramento no Limite de 4KB:** Graças à padronização `CompactContact` e compressão GZIP (`fflate`), mesmo pacotes complexos utilizam menos de 20% do limite da rede FCM.
2. **Autocura de Conexões por Piggybacking:** Se um contato atualizou sua subscrição Web Push, o envio de uma mensagem simples transporta o perfil atualizado em carona, reparando a base de dados do receptor antes da exibição da conversa.
3. **Extensibilidade Sem Boilerplate:** A criação de novas funcionalidades (ex: apagar mensagens, reações, sinalizador de digitação) exige apenas a adição de um novo arquivo em `src/handshakes/hand-*.ts`, reaproveitando toda a infraestrutura de criptografia, filas e retentativas.
4. **Resiliência Local-First:** Alterações realizadas sem conexão de rede ficam retidas com status `'pendente'` no `Handshake_DB` e são processadas automaticamente assim que o evento `online` for disparado.


---

# handshake

## Como é hoje

### Handshake de confirmação entrega mensagem

Descrição básica do funcionamento atual:
1. Mensagem é recebida contendo um JWT com id em jti e identificação do remetente em kid
    1. Mensagem recebida passa a utilizar este JTI como mensagemId
    2. O kid identifica o contato por contatoKey que é um hash da chave vapid publica do remetente
2. Um handshake é criado com um id novo = handshakeId (função de criar id unico novo de 12 caracteres)
    Explicação do que é salvo no indexdb
    ```js
    {
    "id": handshakeId,              // ID do handshake gerado agora no Receptor da mensagem
    "mensagemId": jti,              // ID (jti) da mensagem original recebida
    "tipo": "confirmacao_entrega",  // Identificador da ação
    "direcao": "out",                // Indica que é um handshake a ser enviado
    "status": "pendente",           // Aguardando envio na fila
    "tentativas": 0,
    "payload": { 
        "recebidoEm": 1788770000000    // Timestamp do momento do recebimento da mensagem
    },
    "createdAt": 1788770000000,
    "updatedAt": 1788770000000
    }
    ``` 
3. A rotina de processar a fila de handshake vai mandar um handshake contendo um JWT assim
    Durante o processamento de cada item da fila seu status é alterado para "enviando"
    1. Header 
        ```js
        { 
        "alg": "ES256",
        "kid": vapid public do profile do navegador remetente do handshake
        }
        ```
    2. Payload
        ```js
        {
        "sub": "hand",
        "aud": mensagemId,        // ID da mensagem original confirmada
        "jti": handshakeId,        // ID único deste handshake
        "ct": "..." // envelope cifrado explicado abaixo
        }
        ```
    3. Envelope serializado, comprimido e Cifrado com a chave publica de contatoKey da mensagemID, contendo
        ```js
        {
        "tipo": tipo,  // "confirmacao_entrega",
        "recebidoEm": payload.recebidoEm // 1788770000000
        }
        ```
    4. Signature
        Assinatura ECDSA P-256 usando header.kid de HEADER+PAYLOAD
4. Um payload é enviado ao servidor Proxy (/api/proxy-push) e status do handshake anterado para "enviado"
    ```js
    {
    "subscription": {
        "endpoint": "https://fcm.googleapis.com/fcm/send/endpoint_do_destinatario...",
        "keys": {
            "p256dh": "base64...",
            "auth": "base64..."
            }
        },
    "payloadText": "eyJhbGciOiJFUzI1NiIs... (JWT de saída em string)",
    "vapid": {
        "subject": "mailto:"+ email de contatoKey da mensagemID (destinatario),
        "publicKey": vapid publico de contatoKey da mensagemID (destinatario),
        "privateKey": envelope_cifrado_vapid_privada de contatoKey da mensagemID (destinatario)
        }
    }
    ```
5. Remetente do Handshake recebe do handshake (sub === "hand"), valida assinatura do JWT
    1. Cria payloadObj =  payload.ct decifrado e descompactado
    2. Um handshake é salvo em indexdb como direcao "in"
        ```js
        {
        "id": payload.jti,           // ID do handshake gerado pelo remetente (payload.jti)
        "mensagemId": payload.aud,   // ID da mensagem confirmada (payload.aud)
        "tipo": payloadObj.tipo,  // Extraído de payloadObj.tipo
        "direcao": "in",                 // Indica que é um recibo recebido
        "status": "entregue",           // Processado com sucesso
        "tentativas": 0,
        "payload": {                  // payloadObj
            "tipo": "confirmacao_entrega",
            "recebidoEm": 1788770000000
        },
        "createdAt": 1788770055000,
        "updatedAt": 1788770055000
        }
        ```
6. Atualização da mensagem enviada
    1. payload.aud é o mensagemId que vai ter o status alterado
    2. a mensagem tem status alterado de "enviada" (ou "enviando") para "entregue"
    3. SW notifica UI com postMessage({ type: 'MENSAGEM_ENTREGUE', payload: { mensagemId: "V1StGXR8_Z5jd" } })


### Handshake de solicitação de dados

Descrição básica do funcionamento atual:
1. Nó A - Solicitante de dados dispara gatilho de solicitação de dados
    1. manualmente no botão "Atualizar informações do contato" na UI de cartão do contato, enviando ao Service Worker.: { type: 'SOLICITAR_DADOS_CONTATO', payload: { contatoPublicKeyVapid: hash } }
    2. Service Worker a primeira mensagem de um novo contato ou de um contato cujos campos nome e email estejam em branco no IndexedDB
2. Nó A - Ambos gatilhos chamam a função criarHandshakeSolicitarDados(contatoKey)
    1. contatoKey: Hash SHA-256 da chave VAPID do contato
    2. handshakeId: novo criado com a função de criar id unico novo de 12 caracteres
    3. Indexdb handshake_db é salvo com :
        ```js
        {
        "id": handshakeId,             // ID único da solicitação
        "mensagemId": contatoKey,   // Hash SHA-256 do contato alvo (Nó B)
        "tipo": "solicitar_dados",       // Tipo de handshake
        "direcao": "out",                // Fluxo de saída
        "status": "pendente",            // Aguardando processamento da fila
        "tentativas": 0,
        "payload": {
            "campos": ["iss", "nm"]         // Campos solicitados ao Nó B
        },
        "createdAt": 1788770100000,
        "updatedAt": 1788770100000
        }        
        ```
        OBS: Hoje a lista de campos solicitados está fixa aqui na geração do registro em indexdb
3. Nó A - A rotina de processar a fila de handshake vai mandar um handshake contendo um JWT assim
    Durante o processamento de cada item da fila seu status é alterado para "enviando"
    1. Header 
        ```js
        { 
        "alg": "ES256",
        "kid": vapid public do profile do navegador remetente do handshake (nó A)
        }
        ```
    2. Payload
        ```js
        {
        "sub": "hand",
        "aud": "hash_contato",         // Hash do destinatário contatoKey em handshake.mensagemId
        "jti": handshakeId,        // ID único deste handshake
        "ct": "..." // envelope cifrado explicado abaixo
        }
        ```
    3. Envelope serializado, comprimido e Cifrado com a chave publica de contatoKey da handshake.mensagemID, contendo
            ```js
            {
            "tipo": "solicitar_dados",
            "campos": ["iss", "nm"]
            }                   
            ```
    4. Signature
        Assinatura ECDSA P-256 usando header.kid de HEADER+PAYLOAD
4. Nó A - Um payload é enviado ao servidor Proxy (/api/proxy-push) e status do handshake anterado para "enviado"
    ```js
    {
    "subscription": {
        "endpoint": "https://fcm.googleapis.com/fcm/send/endpoint_do_destinatario...",
        "keys": {
            "p256dh": "base64...",
            "auth": "base64..."
            }
        },
    "payloadText": "eyJhbGciOiJFUzI1NiIs... (JWT de saída em string)",
    "vapid": {
        "subject": "mailto:"+ email de contatoKey da mensagemID (destinatario),
        "publicKey": vapid publico de contatoKey da mensagemID (destinatario),
        "privateKey": envelope_cifrado_vapid_privada de contatoKey da mensagemID (destinatario)
        }
    }
    ```
5. Nó B - Remetente do Handshake recebe do handshake (sub === "hand"), valida assinatura do JWT
    1. Cria payloadObj =  payload.ct decifrado e descompactado
    2. Um handshake é salvo em indexdb como direcao "in"
        ```js
        {
        "id": payload.jti,           // ID do handshake gerado pelo remetente (payload.jti)
        "mensagemId": payload.aud,   // ID do contato Alvo do pedido (payload.aud)
        "tipo": payloadObj.tipo,  // Extraído de payloadObj.tipo
        "direcao": "in",                 // Indica que é um recibo recebido
        "status": "entregue",           // Processado com sucesso
        "tentativas": 0,
        "payload": {                  // payloadObj
            "tipo": "solicitar_dados",
            "campos": ["iss", "nm"]
        },
        "createdAt": 1788770055000,
        "updatedAt": 1788770055000
        }
        ```
6. Nó B - Resposta automática é criada quando payloadObj.tipo === 'solicitar_dados' (aqui alteraremos para passar pela fila de processamento no novo fluxo)
    Handshake é criado no indexdb com id unico respostaHandshakeId - novo criado com a função de criar id unico novo de 12 caracteres:
    ```js
    {
    "id": respostaHandshakeId,             // ID do handshake de resposta
    "mensagemId": hash de header.kid,   // Hash SHA-256 do Nó A (senderHash)
    "tipo": "resposta_dados",        // Tipo de handshake
    "direcao": "out",                // Resposta a ser enviada
    "status": "pendente",            // Aguardando envio na fila
    "tentativas": 0,
    "payload": {
        "iss": profile.email,     // E-mail do perfil do Nó B
        "nm": profile.nome             // Nome do perfil do Nó B
    },
    "createdAt": 1788770106000,
    "updatedAt": 1788770106000
    }
    ```
7. Nó B - Função de Processar fila é acionada imediatamente
8. Nó B - A rotina de processar a fila de handshake vai mandar um handshake contendo um JWT assim
    Durante o processamento de cada item da fila seu status é alterado para "enviando"
    1. Header 
        ```js
        { 
        "alg": "ES256",
        "kid": vapid public do profile do navegador remetente do handshake (nó B)
        }
        ```
    2. Payload
        ```js
        {
        "sub": "hand",
        "aud": "hash_contato",         // Hash do destinatário contatoKey em handshake.mensagemId
        "jti": handshakeId,        // ID único deste handshake de resposta
        "ct": "..." // envelope cifrado explicado abaixo
        }
        ```
    3. Envelope serializado, comprimido e Cifrado com a chave publica de contatoKey da handshake.mensagemID, contendo
            ```js
            {
            "tipo": "resposta_dados",
            "iss": "alice@exemplo.com",
            "nm": "Alice Silva"
            }                  
            ```
    4. Signature
        Assinatura ECDSA P-256 usando header.kid de HEADER+PAYLOAD
9. Nó B - Um payload é enviado ao servidor Proxy (/api/proxy-push) e status do handshake anterado para "enviado"
    ```js
    {
    "subscription": {
        "endpoint": "https://fcm.googleapis.com/fcm/send/endpoint_do_destinatario...",
        "keys": {
            "p256dh": "base64...",
            "auth": "base64..."
            }
        },
    "payloadText": "eyJhbGciOiJFUzI1NiIs... (JWT de saída em string)",
    "vapid": {
        "subject": "mailto:"+ email de contatoKey da mensagemID (destinatario),
        "publicKey": vapid publico de contatoKey da mensagemID (destinatario),
        "privateKey": envelope_cifrado_vapid_privada de contatoKey da mensagemID (destinatario)
        }
    }
    ```
10. Nó A - Remetente do Handshake de resposta analisa handshake (sub === "hand"), valida assinatura do JWT
    1. Cria payloadObj =  payload.ct decifrado e descompactado
    2. Um handshake é salvo em indexdb como direcao "in"
        ```js
        {
        "id": payload.jti,           // ID do handshake gerado pelo remetente (payload.jti)
        "mensagemId": payload.aud,   // ID do contato Alvo do pedido (payload.aud)
        "tipo": payloadObj.tipo,  // Extraído de payloadObj.tipo
        "direcao": "in",                 // Indica que é um recibo recebido
        "status": "entregue",           // Processado com sucesso
        "tentativas": 0,
        "payload": {                  // payloadObj
            "tipo": "resposta_dados",
            "iss": "alice@exemplo.com",
            "nm": "Alice Silva"
        },
        "createdAt": 1788770055000,
        "updatedAt": 1788770055000
        }
        ```
11. Nó A - Atualização dos dados do contato da resposta recebida
    1. Contato localizado usando senderHash ("hash_contato_b") =  hash de header.kid
    2. Salva dados para o contato
        ```js
        {
        "email": "alice@exemplo.com",      // Atualizado com o valor de payloadObj.iss
        "nome": "Alice Silva",             // Atualizado com o valor de payloadObj.nm
        "updatedAt": 1788770110000
        }
        ```
12. Nó A - Envio de Atualização da UI pelo Service Worker
    SW notifica UI com postMessage para todas as janelas abertas
    ```js
    clients.forEach(client => {
        client.postMessage({ type: 'CONTATO_ATUALIZADO', payload: { contatoHash: 'hash_contato_b' } });
    });
    ```
13. Nó A - Atualização da UI
    O ouvinte global em contatosStore.ts captura a mensagem, recarrega a lista do IndexedDB e a interface atualiza o nome e o e-mail na barra lateral e no cartão de contato instantaneamente, sem necessidade de atualizar a página.

----

## Proposta de Refatoração

### Alterações Preliminares

Antes de mudar o handshake vamos atualizar alguns itens diversos:
1. Renomear o conceito de contato homologado para contato confiável. no indexdb do contato mudar o nome do campo homologado, para trusted: boolean e o campo "nome" para "name", o campo "publicKeyVapid" para "vapidPublicKey", o campo "vapidPrivateKey" para "vapidPrivateKeyEnvelope", o campo "publicKeyRSA" para "e2ePublicKey"
2. Ajustar o que é salvo em contatos para:
    ```js
    {
    "vapidPublicKey": { // a VAPID publica do contato
        "kty": "EC",
        "crv": "P-256",
        "x": "Base64Url_X...",
        "y": "Base64Url_Y...",
        "ext": true
    },
    "id": hash // Um hash SHA-256 gerado a partir da chave pública VAPID (vapidPublicKey) do contato
    "email": ... , // o email do contato
    "name": ... , // o nome do contato
    "e2ePublicKey": { // A chave pública de criptografia do contato
        "kty": "RSA",
        "e": "AQAB",
        "n": "Base64Url_Modulo_N...",
        "alg": "RSA-OAEP-256",
        "ext": true
    },
    "subscription": { // "endereço completo" para enviar notificações do contato
        "endpoint": "https://fcm.googleapis.com/fcm/send/eXamPle-Token...",
        "keys": {
            "p256dh": "Base64_P256dh...",
            "auth": "Base64_Auth_Secret..."
        }
    },
    "vapidPrivateKeyEnvelope": "eyJpdiI6Ii... (Envelope Cifrado do Servidor)", // chave privada VAPID do contato, mas cifrada e envelopada pelo servidor Proxy
    "trusted": true, // Se for true, significa que você escaneou o QR code dele ou clicou manualmente em "Confiável" (verificou a identidade). Se for false, é um contato estranho ou desconhecido
    "me": "trusted" ou "none" ou "wrong" ou "saved", 
        // trusted: Informará se o contato confia em mim (se ele tem um contato com meu public vapid hash marcado como trust:true)
        // none: valor default ao criar contato, significa que o contato não tem meus dados para retorno de mensagem (sem contato com hash de meu vapid publico)
        // wrong: ele tem neus dados para retorno de mensagem salvo em contato mas estão errados (subscription, vapid privado envelopado ou public RSA errados)
        // saved: ele tem neus dados para retorno de mensagem salvo e corretos (quando recebermos algum handshake ou mensagem do contato marco que ele tem meus dados se ele estava como none ou wrong) - 
    "createdAt": 1788770000000,
    "updatedAt": 1788770110000
    }
    ```
3. Renomear as funções abaixo de id-utils.ts e ajustar suas ocorrencias e chamadas eno app todo
    1. gerarIdMensagem renomear para gerarId
    2. validarIdMensagem renomear para validarId
    3. gerarIdFallback manter nome gerarIdFallback

### Novo Handshake
A proposta consiste em criar um fluxo de handshake genérico de transferencia de dados de um Nó para outro e vice versa
O handshake unico será o mesmo para processar dados de contato e informações de confirmação de entrega e no roadmap outras informações.
No detalhamento abaixo usarei estes dois casos como exemplo
Teremos um Roteador de handshake que atuará especificamente em cada caso de acordo com o obeto json recebido.
Este roteador para facilitar manutenção dele tera para cada tipo de objeto um conjunto de funções salvas em arquivo específico src/handshakes/<objeto>.ts
Vamos iniciar com alguns roteadores:
* src/handshakes/hand-profile.ts - responsável por criar handshake que envolve dados do profile
* src/handshakes/hand-mensagem.ts - responsável por criar handshake que envolve dados de mensagem
* src/handshakes/hand-contato.ts - responsável por criar handshake que envolve dados de contato

Primeiro vou descrever o fluxo do novo handshake e depois detalho como será o roteamento dos diferentes tipos acima.

### Indexdb do novo handshake
O novo handshake terá a seguinte estrutura salva no indexdb:
```js
export interface HandshakeRotas { 
  profile?: any; 
  mensagem?: any; 
  contato?: any; 
}

export type StatusIn = 'recebido' | 'processando' | 'processado' | 'falha';

export type StatusOut = 'pendente' | 'enviando' | 'enviado' | 'falha' | 'entregue';

export interface FluxoIn {
  status: StatusIn;
  rotas: HandshakeRotas & Record<string, any>;
  tentativas: number; 
  erro?: string;
}

export interface FluxoOut {
  status: StatusOut;
  rotas: HandshakeRotas & Record<string, any>;
  tentativas: number; 
  erro?: string;
}

// 5. Interface Principal do handshake
export interface Handshake { 
  id: string; // criado por gerarId() ou payload.jti de handshake recebido
  aud: string; // contato.id = hash da chave publica vapid do contato
  in?: FluxoIn; 
  out?: FluxoOut; 
  createdAt: number; // Timestamp do momento da criação do handshake
  updatedAt: number; // Timestamp do momento da alteração do handshake
}

```
### Registro criado no Indexdb  de Handshake

A partir da criação de um handshake com FluxoOut, executa a função de processamento de fila de handshake

A função de processamento de fila de handshake fará o seguinte:

#### Nó-A - Handshake com "out.status" 'pendente' ou 'enviando' antigo (updatedAt antes de 1 minuto) e out.tentativas <= max_tentativas
Durante o processamento de cada item da fila seu out.status é alterado para "enviando" e out.tentativas=+1

Prepara o JWT para envio com os seguintes dados:
1. Header 
    ```js
    { 
    "alg": "ES256",
    "kid": ... //vapid public do profile do navegador remetente do handshake
    }
    ```
2. Payload
    ```js
    {
    "sub": "hand",
    "aud": handshake.aud,        // hash do contato = contato.id = ID do contato que receberá o handshake
    "jti": handshake.id,        // ID único deste handshake
    "ct": "..." // envelope cifrado explicado abaixo
    }
    ```
3. Envelope serializado, comprimido e Cifrado com a chave publica (contato.publicKeyRSA) do contato.id = handshake.aud, contendo
    ```js
    {...} = handshake.out.rotas
    ```
4. Signature
    Assinatura ECDSA P-256 usando header.kid de HEADER+PAYLOAD


Depois um payload é enviado ao servidor Proxy (/api/proxy-push) e out.status do handshake alterado para "enviado"
```js
{
"subscription": {     // pelo hash do contato em handshake.aud, info em contato.subscription 
    "endpoint": "https://fcm.googleapis.com/fcm/send/endpoint_do_destinatario...", 
    "keys": {
        "p256dh": "base64...",
        "auth": "base64..."
        }
    },
"payloadText": "eyJhbGciOiJFUzI1NiIs... (JWT de saída em string)", 
"vapid": {
    "subject": "mailto:"+ // pelo hash do contato em handshake.aud, info em contato.email ,
    "publicKey": // pelo hash do contato em handshake.aud, info em contato.vapidPublicKey
    "privateKey": // pelo hash do contato em handshake.aud, info em contato.vapidPrivateKeyEnvelope
    }
}
```

#### Nó-B recebe o handshake
Remetente do Handshake recebe do handshake (sub === "hand"), valida assinatura do JWT
1. Cria payloadObj =  payload.ct decifrado e descompactado
2. Um handshake é salvo ou atualizado em indexdb com FluxoIn
    ```js
    {
    "id": payload.jti,           // ID do handshake gerado pelo remetente (payload.jti)
    "aud": hash(payload.kid),   // ID do contato que mandou a mensagem confirmada = hash(payload.kid)
    "createdAt": 1788770055000, // se handshake já existia mantem valor anterior
    "updatedAt": 1788770055000,
    "in": {                     // se já existia "in" teremos in.erro="Handshake Sobrescrito"
        "status": "recebido",
        "tentativas": 0,
        "rotas": payloadObj // conjunto de requisições de rotas enviadas no handshake
        "erro"?: "FluxoIn do Handshake Sobrescrito" // somente se "in" já existia ao atualizar 
    },
    // mantem "out" se ele já existia
    }
    ```
    Executa a função de processamento de fila de handshake
3. Processador de Fila de Handshake com "in.status" 'recebido' ou 'processando' antigo (updatedAt antes de 1 minuto) e in.tentativas <= max_tentativas
    1. Altera in.status = "processando" e atualiza o "updatedAt"
    2. Chama a função handshakeRota(in:handshake.id) - ver detalhamento abaixo
    3. in.status = "processado" se não tiver erros

### Processador de Fila de Handshake

Precisa monitorar os registros em indexdb do handshake analisando os status dentro do FluxoOut e FluxoIn
1. FluxoIn
    1. Procura periodicamente por in.status='recebido' ou 'processando' antigo (updatedAt antes de 1 minuto) e in.tentativas <= max_tentativas
    2. Altera in.status = "processando" e atualiza o "updatedAt"
    3. Chama a função handshakeRota(in:handshake.id) - ver detalhamento abaixo
    4. in.status = "processado" se não tiver erros
    5. in.status = "falha" se tiver erros e in.erro = string do erro

2. FluxoOut
    1. Se estiver online (offline não faz nada), procura periodicamente por out.status='pendente' ou 'enviando' antigo (updatedAt antes de 1 minuto) e out.tentativas <= max_tentativas
    2. Altera out.status = "enviando", atualiza o "updatedAt" e out.tentativas=+1
    3. Chama a função handshakeRota({out:handshake.id}) - ver detalhamento abaixo
    4. out.status = "enviado" se não tiver erros
    5. out.status = "falha" se tiver erros e in.erro = string do erro

### Definição de HandShakeRota
Função dentro de sw-handshakes.ts    
Aceita como parametro FluxoIn e FluxoOut:
1. FluxoOut = handshakeRota({out:handshake.id})
    Chama a função de preparar JWT e enviar ao servidor Proxy (./api/proxy-push)

2. FluxoIn = handshakeRota({in:handshake.id})
    Realiza a Rota de Entrada de acordo com o conteúdo de in.rotas do handshake
    * profile? - executa função Processar({in:handshake.id}) em hand-profile.ts e depois atualiza UI
    * contato? - executa função Processar({in:handshake.id}) em hand-contato.ts e depois atualiza UI
    * mensagem? - executa função Processar({in:handshake.id}) em hand-mensagem.ts e depois atualiza UI
    * outras conforme roadmap do app

Exemplo de atualização de UI para contato:
* SW notifica UI com postMessage para todas as janelas abertas
    ```js
    clients.forEach(client => {
        client.postMessage({ type: 'CONTATO_ATUALIZADO', payload: { contatoHash: 'hash_contato_b' } });
    });
    ```
* O ouvinte global em contatosStore.ts captura a mensagem, recarrega a lista do IndexedDB e a interface atualiza o nome e o e-mail na barra lateral e no cartão de contato instantaneamente, sem necessidade de atualizar a página.

### Definição Rota Profile
Terá função Processar({in?:handshake.id, out?:any})
1. FluxoIn
    Espera como parametro "in" o id do handshake a ser processado    
    1. se conteúdo em handshake.in.rotas.profile for array campos contendo os campos que deseja informações    
        Ex:
        ```js
        handshake.in.rotas.profile.campos: ["email", "name", "subscription" ...]
        ```
        Campos permitidos:
        * name
        * email
        * vapidPublicKey
        * vapidPrivateKeyEnvelope
        * e2ePublicKey
        * subscription
        Esta função cria ou atualiza um FluxoOut no handshake com handshake.id contendo:
        ```js
        handshake.out = {
            rotas.profile.data = {
                id = hash(AppConfig_DB.profile.vapidPublicKey), // o mesmo hash usado em contatos
                name = AppConfig_DB.profile.name, // somente se solicitado em handshake.in.rotas.profile.campos
                email = AppConfig_DB.profile.email, // somente se solicitado em handshake.in.rotas.profile.campos
                vapidPublicKey = AppConfig_DB.profile.vapidPublicKey, // somente se solicitado em handshake.in.rotas.profile.campos
                vapidPrivateKeyEnvelope = AppConfig_DB.profile.vapidPrivateKeyEnvelope, // somente se solicitado em handshake.in.rotas.profile.campos
                e2ePublicKey = AppConfig_DB.profile.e2ePublicKey, // somente se solicitado em handshake.in.rotas.profile.campos
                subscription = AppConfig_DB.profile.subscription // somente se solicitado em handshake.in.rotas.profile.campos
            }
            status = "pendente"
            tentativas = 0
        }
        ```
        Retorna para o processamento de rotas 
    2. se conteúdo em handshake.in.rotas.profile for objeto data com rotas.profile.data.id
        Atualiza o contato no indexdb para o contato de id hash = handshake.in.rotas.profile.data.id, com as informações em handshake.in.rotas.profile.data recebidas.    
        Retorna para o processamento de rotas 
2. FluxoOut
    Espera como parametro "out" objeto contendo nome de função interna e parametros a serem enviadas para ela.
    Ex: 
    ```js
    { "out": {
            "function" = "solicitarPerfil", // nome da função em hand-profile.ts 
            "contato"=  contato.id,  // hash do contato que solicita informações de perfil
            "campos" = ["email", "name", "subscription" ... ]
        }
    }
    ```

    A função "solicitarPerfil" tem como parametros:
    * contato = hash do id do contato que deseja informações
    * campos = lista de campos solicitados informações

    Esta função apenas cria um novo registro handshake da seguinte forma:
        ```js
        {
        "id": payload.jti,           // ID do handshake gerado pela função gerarId
        "aud": contato // hash do id do contato que deseja informações = parametro função
        "createdAt": 1788770055000,
        "updatedAt": 1788770055000,
        "out": {
            "status": "pendente",
            "tentativas": 0,
            "rotas": {
                "profile": {
                    "campos": ["email", "name", "subscription" ... ] // lista de campos solicitados informações = parametro função
                }
            }
        }
        }
        ```
        Outras funções definiremos pelo Roadmap do app

### Definição Rota Mensagem
Terá função Processar({in?:handshake.id, out?:any})
1. FluxoIn
    Espera como parametro "in" com o id do handshake a ser processado    
    1. se conteúdo em handshake.in.rotas.mensagem for array campos contendo os campos que deseja informações e 'recebida' da mensagem recebida    
        Ex:
        ```js
        handshake.in.rotas.mensagem: {
            "recebida": id da mensagem,
            "campos": ["status", "conteudo", "recebidoEm" ...]
        }
        ```
        Campos permitidos em mensagem recebidas:
        * status
        * conteudo
        * recebidoEm
        * lidaEm
        * notificadaEm
        Será restritos as mensagens recebida onde handshake.aud = mensagem.contatoPublicKeyVapid (hash id do contato)    
        Esta função cria ou atualiza um FluxoOut no handshake com handshake.id contendo:
        ```js
        handshake.out = {
            rotas.mensagem.data = {
                recebida = mensagem.id, // de mensagens recebidas
                status = mensagem.status, // somente se solicitado em handshake.in.rotas.mensagem.campos
                conteudo = mensagem.conteudo, // somente se solicitado em handshake.in.rotas.mensagem.campos
                recebidoEm = mensagem.recebidoEm, // somente se solicitado em handshake.in.rotas.mensagem.campos
                lidaEm = mensagem.lidaEm, // somente se solicitado em handshake.in.rotas.mensagem.campos
                notificadaEm = mensagem.notificadaEm, // somente se solicitado em handshake.in.rotas.mensagem.campos
            }
            status = "pendente"
            tentativas = 0
        }
        ```
        Retorna para o processamento de rotas 
    2. se conteúdo em handshake.in.rotas.mensagem for objeto data com rotas.mensagem.data.recebida e retornou campo status = 'nao_lida', 'lida' ou 'notificada' ou seja não vazio    
        Atualiza a mensagem enviada no indexdb para a mensagem enviada de id = handshake.in.rotas.mensagem.data.recebida, para o status = "entregue" .    
        Para os demais campos não temos ação por enquanto (reservado para próximos roadmaps)
        Retorna para o processamento de rotas 
    3. se conteúdo em handshake.in.rotas.mensagem for objeto data com rotas.mensagem.data.enviada informado
        Cria uma nova mensagem recebida ou atualiza uma mensagem recebida, com id = rotas.mensagem.data.enviada
        ```js
        MensagemRecebida = {
            id: handshake.in.rotas.mensagem.data.enviada,
            contatoPublicKeyVapid: handshake.aud,
            conteudo: handshake.in.rotas.mensagem.data.conteudo,
            status: 'nao_lida',
            recebidoEm: 1788770055000
        }
        ```
        Cria novo handshake para informar mensagem recebida
        ```js
        handshake = {
            id = gerarId(),
            aud = handshake.aud,
            "createdAt": 1788770055000,
            "updatedAt": 1788770055000,
            out = {
                rotas.mensagem.data = {
                recebida = handshake.in.rotas.mensagem.data.enviada,
                status = 'nao_lida'
                }
                status = "pendente",
                tentativas = 0
            }
        }
        ```
        Retorna para o processamento de rotas 

2. FluxoOut
    Espera como parametro "out" objeto contendo nome de função interna e parametros a serem enviadas para ela.
    Ex: 
    ```js
    { "out": {
            "function" = "confirmarEntrega", // nome da função em hand-mensagem.ts 
            "contato"=  contato.id,  // hash do contato que solicita informações de mensagens
            "mensagem"=  mensagem.id,  // id da mensagem recebida que solicita informações de recebimento
            "campos" = ["status"]
        }
    }
    ```

    A função "confirmarEntrega" tem como parametros:
    * contato = hash do id do contato que deseja informações
    * mensagem = id da mensagem recebida que deseja informações
    * campos = lista de campos solicitados informações

    Esta função apenas cria um novo registro handshake da seguinte forma:
        ```js
        {
        "id": payload.jti,           // ID do handshake gerado pela função gerarId
        "aud": contato // hash do id do contato que deseja informações = parametro função
        "createdAt": 1788770055000,
        "updatedAt": 1788770055000,
        "out": {
            "status": "pendente",
            "tentativas": 0,
            "rotas": {
                "mensagem": {
                    "recebida": mensagem.id // id da mensagem recebida que deseja informações = parametro função
                    "campos": ["status", "conteudo", "recebidoEm" ... ] // lista de campos solicitados informações = parametro função
                }
            }
        }
        }
        ```

    A função "enviarMensagem" tem como parametros:
    * contato = hash do id do contato que deseja enviar mensagem
    * conteudo = conteudo da mensagem

    Primeiro gera um mensagemId = gerarId

    Esta função apenas cria um novo registro handshake da seguinte forma:
    ```js
    {
    "id": payload.jti,           // ID do handshake gerado pela função gerarId
    "aud": contato // hash do id do contato que vai receber mensagem = parametro função
    "createdAt": 1788770055000,
    "updatedAt": 1788770055000,
    "out": {
        "status": "pendente",
        "tentativas": 0,
        "rotas": {
            "mensagem": {
                "enviada": mensagemId // id de mensagem gerado
                "conteúdo": conteúdo // conteúdo da mensagem a ser enviada = parametro função
            }
        }
    }
    }
    ```
    E depois um novo registro mensagem enviada da seguinte forma:
    ```js
    {
    "id": mensagemId // id de mensagem gerado,
    "contatoHash":  // hash do id do contato que vai receber mensagem = parametro função
    "conteudo": conteúdo // conteúdo da mensagem a ser enviada = parametro função
    "status": "pendente",
    "tentativas": 0,
    "createdAt": 1788801000000,
    "updatedAt": 1788801005000
    }
    ```
    Outras funções definiremos pelo Roadmap do app

### Definição Rota Contato
Terá função Processar({in?:handshake.id, out?:any})
1. FluxoIn
    Espera como parametro "in" com o id do handshake a ser processado    
    1. se conteúdo em handshake.in.rotas.contato for array campos contendo os campos que deseja informações e 'id' do contato   
        Ex:
        ```js
        handshake.in.rotas.contato: {
            "id": id do contato (hash),
            "campos": ["vapidPublicKey", "email", "name" ...]
        }
        ```
        Campos permitidos em contatos:
        * vapidPublicKey
        * email
        * name
        * e2ePublicKey
        * subscription
        * vapidPrivateKeyEnvelope
        * trusted
        * me
        Será restrito ao contato onde handshake.aud = contato.id (hash id do contato)    
        Esta função cria ou atualiza um FluxoOut no handshake com handshake.id contendo:
        ```js
        handshake.out = {
            rotas.contato.data = {
                id = contato.id, // de contato pesquisado
                vapidPublicKey = contato.vapidPublicKey, // somente se solicitado em handshake.in.rotas.contato.campos
                email = contato.email, // somente se solicitado em handshake.in.rotas.contato.campos
                name = contato.name, // somente se solicitado em handshake.in.rotas.contato.campos
                e2ePublicKey = contato.e2ePublicKey, // somente se solicitado em handshake.in.rotas.contato.campos
                subscription = contato.subscription, // somente se solicitado em handshake.in.rotas.contato.campos
                vapidPrivateKeyEnvelope = contato.vapidPrivateKeyEnvelope, // somente se solicitado em handshake.in.rotas.contato.campos
                trusted = contato.trusted, // somente se solicitado em handshake.in.rotas.contato.campos
                me = contato.me, // somente se solicitado em handshake.in.rotas.contato.campos
            }
            status = "pendente"
            tentativas = 0
        }
        ```
        Retorna para o processamento de rotas 
    2. se conteúdo em handshake.in.rotas.contato for objeto data com rotas.contato.data.id 
        Se handshake.in.rotas.contato.data.id não existe atualize no indexdb de contatos para o contato.id = handshake.aud , contato.me = "none"
        
        Se handshake.in.rotas.contato.data contenha trusted e handshake.in.rotas.contato.data.trusted=true, atualize no indexdb de contatos para o contato.id = handshake.aud , contato.me = "trusted"

        Se handshake.in.rotas.contato.data contenha trusted e handshake.in.rotas.contato.data.trusted=false, atualize no indexdb de contatos para o contato.id = handshake.aud , contato.me = "saved"
        
        atualize no indexdb de contatos para o contato.id = handshake.aud , contato.me = "wrong" caso: 
        * Alteração caso handshake.in.rotas.contato.data contenha subscription e handshake.in.rotas.contato.data.subscription != AppConfig_DB.profile.subscription ou
        * Alteração caso handshake.in.rotas.contato.data contenha vapidPublicKey e handshake.in.rotas.contato.data.vapidPublicKey != AppConfig_DB.profile.vapidPublicKey ou
        * Alteração caso handshake.in.rotas.contato.data contenha vapidPrivateKeyEnvelope e handshake.in.rotas.contato.data.vapidPrivateKeyEnvelope != AppConfig_DB.profile.vapidPrivateKeyEnvelope ou
        * Alteração caso handshake.in.rotas.contato.data contenha e2ePublicKey e handshake.in.rotas.contato.data.e2ePublicKey != AppConfig_DB.profile.e2ePublicKey, 
        
        Para os demais campos não temos ação por enquanto (reservado para próximos roadmaps)
        Retorna para o processamento de rotas 
2. FluxoOut
    Espera como parametro "out" objeto contendo nome de função interna e parametros a serem enviadas para ela.
    Ex: 
    ```js
    { "out": {
            "function" = "confirmarSubscription", // nome da função em hand-mensagem.ts 
            "contato"=  contato.id,  // hash do contato que solicita informações de subscription de retorno
            "campos" = ["trusted", "subscription", "vapidPublicKey", "vapidPrivateKeyEnvelope", "e2ePublicKey"]
        }
    }
    ```

    A função "confirmarSubscription" tem como parametros:

    Esta função apenas cria um novo registro handshake da seguinte forma:
        ```js
        {
        "id": payload.jti,           // ID do handshake gerado pela função gerarId
        "aud": contato // hash do id do contato que deseja informações = parametro função
        "createdAt": 1788770055000,
        "updatedAt": 1788770055000,
        "out": {
            "status": "pendente",
            "tentativas": 0,
            "rotas": {
                "contato": {
                    "id": hash(AppConfig_DB.profile.vapidPublicKey), // o mesmo hash usado em contatos
                    "campos": ["trusted", "subscription", "vapidPublicKey", "vapidPrivateKeyEnvelope", "e2ePublicKey"]
                }
            }
        }
        }
        ```

-------


# Arquitetura de Handshakes (Máquina de Estados Offline-First)

O Loco PWA foi idealizado para funcionar perfeitamente sem conectividade de rede instantânea. Para garantir a imutabilidade, resiliência e entrega das mensagens (E2EE) mesmo em túneis ou viagens, implementamos o conceito de **Handshakes Assíncronos**.

## 1. Princípio de Desacoplamento (UI vs Trabalhadores)
A Interface de Usuário (Preact/Signals) **nunca** faz disparos `fetch` diretamente para enviar dados aos contatos. 
A UI tem apenas 2 responsabilidades durante a emissão:
- Salvar a "intenção" no Banco de Dados (IndexedDB) de forma otimista.
- Disparar um evento via `postMessage` (Thread local) sinalizando o Service Worker.

## 2. A Fila de Saída (OUT)
Quando o Service Worker detecta que há dados para enviar (um novo contato gerado, um status lido `ack`, ou uma mensagem), ele instila um pacote na Fila `OUT`.
- O payload é comprimido em GZIP (`fflate`).
- É blindado na camada híbrida (AES-256-GCM envelopado com a RSA-OAEP Pública do recebedor).
- Só então é transformado num JWT assinado e disparado via rede celular/Wi-Fi (Web Push FCM).
- Se a rede cair no processo, o `status` do handshake permanece `pendente` e tentará automaticamente reconectar na próxima janela de rede nativa (`sync` event ou `online`).

## 3. A Fila de Entrada (IN)
O processo inverso. Quando o dispositivo "acorda" com um Push recebido pelo Sistema Operacional:
- O Service Worker decodifica com sua Chave Privada RSA.
- O Handshake é gerado na Fila `IN`.
- A máquina de estados (`Processar()`) decide se injeta no DB de mensagens ou se atualiza os metadados do contato. 
- Somente no final do processamento um aviso nativo (BroadcastChannel ou Notification) é enviado para a UI.

**Segurança Garantida:** O Servidor de Proxy que fica no meio do caminho atua estritamente como um "Roteador Cego" lidando apenas com pacotes em Base64 criptografados e chaves VAPID (para o Google FCM).
````

---

## Arquivo: `docs/web-push.md`

````md
Instruções para ajustar o prototipo 01 para que a funcionalidade dele tenha o desejado para o projeto principal

---

# Arquitetura Web Push Descentralizada (Client-Side VAPID + CORS Proxy)

## 1. Visão Geral da Arquitetura
O objetivo é implementar um sistema de Web Push Notifications para um site estático sem armazenar uma chave VAPID global ou centralizada no servidor. 

Cada cliente gera seu próprio par de chaves VAPID (Pública/Privada) no navegador. O servidor atua estritamente como um servidor de arquivos estáticos e um **Proxy CORS cego**, sem conhecimento das chaves privadas ou do conteúdo das mensagens.

[Cliente Remetente]│▼ (Gera JWT com a Chave Privada do Destinatário)[Requisição de Push] ──> [/proxy/ URL do Push Service] (Servidor Deno)│▼ (Repassa sem restrição de CORS)[Push Service da BigTech] (Google/Apple/Mozilla)│▼ (Entrega a Notificação)[Cliente Destinatário]



---

## 2. Fluxo de Dados e Troca de Chaves
Para que o **Cliente A** envie uma notificação para o **Cliente B**, os dados devem ser trafegados por um canal externo (QR Code, WebRTC, P2P, etc.) seguindo a estrutura abaixo:

1. **Cliente B (Destinatário):**
   - Gera um par de chaves VAPID locais via Web Crypto API.
   - Usa a sua *Chave Pública VAPID* para se inscrever no `pushManager`.
   - Obtém o objeto `Subscription` (contendo o endpoint da Google/Apple/Mozilla e as chaves de criptografia `p256dh` e `auth`).
2. **Exportação/Divulgação:**
   - O **Cliente B** exporta e envia para o **Cliente A** três informações críticas:
     1. O JSON completo da `Subscription`.
     2. A sua **Chave Pública VAPID** (em formato JWK ou String Base64).
     3. A sua **Chave Privada VAPID** (em formato JWK ou String Base64).
3. **Cliente A (Remetente):**
   - Importa os dados do Cliente B.
   - Criptografa o payload da mensagem usando as chaves `p256dh` e `auth` da Subscription do Cliente B.
   - Cria e assina o token JWT usando a **Chave Privada VAPID** do Cliente B.
   - Dispara o envio através do caminho relativo `/proxy/` do servidor Deno.

---

## 3. Implementação: Geração de Chaves no Cliente (Browser)
O código abaixo usa exclusivamente a **Web Crypto API** nativa do navegador para criar as chaves VAPID compatíveis com a curva `P-256` exigida pelo protocolo de Web Push.

```javascript
// Função para gerar o par de chaves VAPID locais
async function gerarChavesVapidLocais() {
  const parDeChaves = await window.crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    true, // Permite exportar as chaves
    ["sign", "verify"]
  );

  // Exporta no formato JWK (JSON Web Key) para fácil transporte/armazenamento
  const chavePublicaJwk = await window.crypto.subtle.exportKey("jwk", parDeChaves.publicKey);
  const chavePrivadaJwk = await window.crypto.subtle.exportKey("jwk", parDeChaves.privateKey);

  return {
    publicJwk: chavePublicaJwk,
    privateJwk: chavePrivadaJwk
  };
}
```

---

## 4. Implementação: Criação do Token JWT VAPID (Browser)
Ao enviar a mensagem, o remetente precisa gerar um token JWT assinado pela chave privada VAPID do destinatário para provar a autenticidade ao servidor de push.

```javascript
// Utilitário para codificar em Base64URL de forma segura
function tokenBase64Url(stringOuBuffer) {
  const base64 = typeof stringOuBuffer === "string" 
    ? btoa(unescape(encodeURIComponent(stringOuBuffer)))
    : btoa(String.fromCharCode.apply(null, new Uint8Array(stringOuBuffer)));
  return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function criarTokenJwtVapid(privateJwk, endpointPushService) {
  const urlObj = new URL(endpointPushService);
  const origemPushService = `${urlObj.protocol}//${urlObj.host}`;

  // Importa a chave privada JWK recebida do destinatário
  const chavePrivada = await window.crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const cabecalho = { alg: "ES256", typ: "JWT" };
  const payload = {
    aud: origemPushService,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, // 12 horas de validade
    sub: "mailto:descentralizado@exemplo.com" // String obrigatória exigida pelo protocolo
  };

  const cabecalhoCodificado = tokenBase64Url(JSON.stringify(cabecalho));
  const payloadCodificado = tokenBase64Url(JSON.stringify(payload));
  const dadosParaAssinar = new TextEncoder().encode(`${cabecalhoCodificado}.${payloadCodificado}`);

  // Assina o JWT usando o algoritmo ECDSA P-256
  const assinaturaBuffer = await window.crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    chavePrivada,
    dadosParaAssinar
  );

  const assinaturaCodificada = tokenBase64Url(assinaturaBuffer);
  return `${cabecalhoCodificado}.${payloadCodificado}.${assinaturaCodificada}`;
}
```

---

## 5. Implementação: Disparando o Envio via Proxy CORS (Browser)
Como os navegadores bloqueiam requisições diretas do front-end para os endpoints de push (devido às políticas de CORS restritas das Big Techs), a requisição é envelopada através do endpoint local `/proxy/`.

```javascript
async function enviarNotificacaoP2P(subscriptionDestinatario, privateJwkDestinatario, publicJwkDestinatario, payloadTexto) {
  const endpointOriginal = subscriptionDestinatario.endpoint;
  
  // 1. Gera o Token JWT assinado localmente com a chave do destinatário
  const jwtToken = await criarTokenJwtVapid(privateJwkDestinatario, endpointOriginal);
  
  // 2. Extrai a chave pública do formato JWK para String Base64Url (Exigência do cabeçalho Crypto-Key)
  const chavePublicaString = tokenBase64Url(
    await window.crypto.subtle.exportKey(
      "raw", 
      await window.crypto.subtle.importKey("jwk", publicJwkDestinatario, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"])
    )
  );

  // Nota: O payloadTexto precisa ser criptografado seguindo a especificação ECE (Encrypted Content Encoding - RFC 8188)
  // Para simplificar o fluxo P2P sem dependências robustas, use bibliotecas client-side compatíveis se enviar payload.
  const payloadCriptografado = new TextEncoder().encode(payloadTexto); 

  // 3. Rota relativa do Proxy configurado no Deno
  const urlDoProxy = `/proxy/${endpointOriginal}`;

  const resposta = await fetch(urlDoProxy, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "TTL": "60", // Tempo de vida da notificação em segundos
      "Authorization": `WebPush ${jwtToken}`,
      "Crypto-Key": `p256ecdsa=${chavePublicaString}`
    },
    body: payloadCriptografado
  });

  if (resposta.ok) {
    console.log("Notificação enviada com sucesso via túnel Proxy!");
  } else {
    console.error("Erro ao enviar push:", await resposta.text());
  }
}
```

---

## 6. O Servidor Proxy (Deno Puro)
O código abaixo gerencia as páginas estáticas e funciona como o túnel cego que remove a restrição de CORS das requisições de saída.

```typescript
import { serveDir } from "https://deno.land";

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Configuração padrão de CORS para comunicação local
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Crypto-Key, TTL",
  };

  // Trata requisições OPTIONS prévias do navegador
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Captura e gerencia a rota do Proxy
  if (url.pathname.startsWith("/proxy/")) {
    const targetUrl = url.pathname.replace("/proxy/", "") + url.search;

    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      return new Response("URL inválida", { status: 400, headers: corsHeaders });
    }

    try {
      const headers = new Headers(req.headers);
      headers.delete("host"); // Previne falhas de validação de host no destino

      // O Deno faz a requisição direta livre de bloqueios de CORS do navegador
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: headers,
        body: req.body,
      });

      // Replica os cabeçalhos de resposta injetando permissões CORS do site estático
      const proxyResponseHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        proxyResponseHeaders.set(key, value);
      });

      return new Response(response.body, {
        status: response.status,
        headers: proxyResponseHeaders,
      });

    } catch (error) {
      return new Response(`Erro no Proxy: ${error.message}`, { status: 500, headers: corsHeaders });
    }
  }

  // Rota Padrão: Serve a pasta de arquivos estáticos front-end
  return serveDir(req, {
    fsRoot: "public",
    showDirListing: false,
    quiet: true,
  });
});
```

------------------------------

Perfeito. Com a inscrição manual, o destinatário irá copiar um bloco de texto gerado pelo seu navegador (contendo a Subscription + o par de chaves VAPID) e colará no dispositivo do remetente.
Abaixo está o código JavaScript completo e unificado para o cliente. Ele cobre três etapas fundamentais:

   1. Geração das chaves VAPID e Registro do Push (Destinatário).
   2. Criptografia do Payload (RFC 8188 / AES-128-GCM) exigida pelo protocolo Web Push (Remetente).
   3. Assinatura JWT e Envio via Proxy Deno (Remetente).

Este script utiliza apenas a Web Crypto API nativa do navegador, eliminando a necessidade de bibliotecas externas.
## Script do Cliente (main.js)

// ==========================================// 1. UTILITÁRIOS DE CONVERSÃO E BASE64URL// ==========================================function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function base64UrlToBuffer(base64Url) {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
// ==========================================// 2. CONFIGURAÇÃO E GERAÇÃO (DESTINATÁRIO)// ==========================================async function gerarPacoteInscricaoManual() {
  // 1. Registra o Service Worker obrigatoriamente
  const registro = await navigator.serviceWorker.register("sw.js");
  await navigator.serviceWorker.ready;

  // 2. Gera o par de chaves VAPID locais no navegador
  const parDeChavesVapid = await window.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );

  const publicJwk = await window.crypto.subtle.exportKey("jwk", parDeChavesVapid.publicKey);
  const privateJwk = await window.crypto.subtle.exportKey("jwk", parDeChavesVapid.privateKey);

  // 3. Converte a chave pública para Uint8Array para registrar no PushManager
  const rawPublic = await window.crypto.subtle.exportKey("raw", parDeChavesVapid.publicKey);
  
  // 4. Inscreve o navegador no Push Service da BigTech usando a própria chave pública
  const subscription = await registro.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: new Uint8Array(rawPublic)
  });

  // 5. Monta o bloco de texto para cópia manual
  const pacoteCompleto = {
    subscription: subscription.toJSON(),
    vapidPublicKeyJwk: publicJwk,
    vapidPrivateKeyJwk: privateJwk
  };

  const stringParaCopiar = btoa(JSON.stringify(pacoteCompleto));
  console.log("Copie este código e envie ao remetente:", stringParaCopiar);
  return stringParaCopiar;
}
// ==========================================// 3. CRIPTOGRAFIA DO PAYLOAD (RFC 8188)// ==========================================async function criptografarPayloadWebPush(textoMensagem, keysDestinatario) {
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(textoMensagem);

  // Importa as chaves de criptografia da Subscription do Destinatário
  const p256dhBuffer = base64UrlToBuffer(keysDestinatario.p256dh);
  const authBuffer = base64UrlToBuffer(keysDestinatario.auth);

  const receiverPublic = await window.crypto.subtle.importKey(
    "raw", p256dhBuffer, { name: "ECDH", namedCurve: "P-256" }, false, []
  );

  // Gera par de chaves efêmeras para o segredo de Diffie-Hellman
  const localEphemeral = await window.crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]
  );
  const localEphemeralPublicRaw = await window.crypto.subtle.exportKey("raw", localEphemeral.publicKey);

  // Computa o segredo compartilhado (IKM)
  const sharedSecret = await window.crypto.subtle.deriveBits(
    { name: "ECDH", public: receiverPublic }, localEphemeral.privateKey, 256
  );

  // Derivação de chaves simplificada baseada na RFC 8188 (AES-128-GCM)
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  
  const infoKey = encoder.encode("WebPush: info\0");
  const ikmKey = await window.crypto.subtle.importKey("raw", authBuffer, { name: "HKDF" }, false, ["deriveKey"]);
  const prkKey = await window.crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: sharedSecret, info: infoKey },
    ikmKey, { name: "AES-GCM", length: 128 }, false, ["encrypt"]
  );

  // Criação do vetor de inicialização (IV) de 12 bytes
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  // Criptografa usando AES-GCM
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    prkKey,
    plaintext
  );

  // Montagem do bloco final concatenando os metadados necessários para o Service Worker descriptografar
  const resultadoFinal = new Uint8Array(salt.length + 4 + localEphemeralPublicRaw.byteLength + ciphertext.byteLength);
  resultadoFinal.set(salt, 0);
  // Tamanho do registro padrão da RFC 8188 (4096 bytes codificado em 4 bytes em dedução Big-Endian)
  resultadoFinal.set([0, 0, 16, 0], salt.length); 
  resultadoFinal.set(new Uint8Array(localEphemeralPublicRaw), salt.length + 4);
  resultadoFinal.set(new Uint8Array(ciphertext), salt.length + 4 + localEphemeralPublicRaw.byteLength);

  return resultadoFinal;
}
// ==========================================// 4. ASSINATURA JWT VAPID E DISPARO (REMETENTE)// ==========================================async function criarTokenJwtVapid(privateJwk, endpoint) {
  const urlObj = new URL(endpoint);
  const origemPushService = `${urlObj.protocol}//${urlObj.host}`;

  const chavePrivada = await window.crypto.subtle.importKey(
    "jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]
  );

  const cabecalho = { alg: "ES256", typ: "JWT" };
  const payload = {
    aud: origemPushService,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: "mailto:p2p-manual@exemplo.com"
  };

  const cabecalhoCodificado = bufferToBase64Url(new TextEncoder().encode(JSON.stringify(cabecalho)));
  const payloadCodificado = bufferToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const dadosParaAssinar = new TextEncoder().encode(`${cabecalhoCodificado}.${payloadCodificado}`);

  const assinaturaBuffer = await window.crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    chavePrivada,
    dadosParaAssinar
  );

  return `${cabecalhoCodificado}.${payloadCodificado}.${bufferToBase64Url(assinaturaBuffer)}`;
}
async function enviarMensagemManual(stringPacoteDestinatario, textoMensagem) {
  // Desembrulha a string colada manualmente pelo remetente
  const dadosDestinatario = JSON.parse(atob(stringPacoteDestinatario));
  const { subscription, vapidPrivateKeyJwk, vapidPublicKeyJwk } = dadosDestinatario;

  // 1. Assina o token JWT usando a chave privada recebida
  const jwtToken = await criarTokenJwtVapid(vapidPrivateKeyJwk, subscription.endpoint);

  // 2. Extrai e converte a chave pública para String do cabeçalho Crypto-Key
  const rawPublic = await window.crypto.subtle.exportKey(
    "raw", 
    await window.crypto.subtle.importKey("jwk", vapidPublicKeyJwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"])
  );
  const chavePublicaString = bufferToBase64Url(rawPublic);

  // 3. Criptografa o corpo do texto de forma estrita de ponta a ponta
  const payloadCriptografado = await criptografarPayloadWebPush(textoMensagem, subscription.keys);

  // 4. Encaminha via Rota de Proxy local do Deno
  const urlDoProxy = `/proxy/${subscription.endpoint}`;

  const resposta = await fetch(urlDoProxy, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm", // Define a codificação RFC 8188 para o Push Service
      "TTL": "86400",
      "Authorization": `WebPush ${jwtToken}`,
      "Crypto-Key": `p256ecdsa=${chavePublicaString}`
    },
    body: payloadCriptografado
  });

  if (resposta.ok) {
    console.log("Mensagem enviada com sucesso!");
  } else {
    console.error("Erro ao enviar:", await resposta.text());
  }
}

## Código Obrigatório do Service Worker (sw.js)
Coloque este arquivo na mesma pasta raiz dos arquivos estáticos para receber e ler o payload.

self.addEventListener("push", function (event) {
  let titulo = "Nova Mensagem P2P";
  let opções = { body: "Conteúdo criptografado ou ilegível." };

  if (event.data) {
    // O próprio navegador cuida da descriptografia automática usando as chaves
    // internas associadas à Subscription e joga o texto limpo aqui.
    opções.body = event.data.text();
  }

  event.waitUntil(self.registration.showNotification(titulo, opções));
});

Se desejar, o que você gostaria de ajustar em seguida? Podemos estruturar a interface visual simples para copiar e colar essas chaves, ou refinar as permissões no servidor Deno.

------------------------------

como temos testes a fazer durante o desenvolvimento teremos um deno que simula o recebimento e envio dos payloads aos clientes mas seria um fallback caso o web push esteja indisponível. somente aproveitar que estamos de fato num servidor deno.

a sequência seria:
veja se o push web está disponível, se estiver tente mandar sem o proxy do deno, se não der certo envie pelo proxy.
web push indisponível use o deno como fallback com mensagem por ele

neste caso o fallback é dentro do  proprio deno. no proxy ele percebe que o processo de web push não foi entregue por algum motivo ou foi negado. então ele valida se o payload esta devidamente assinado e formatado segundo as regras do pwa push, caso esteja bem formatado supõe que o problema são nos servidores externos então ele fará uma outra forma de entregar a mensagem para quando o cliente destinatário ficar online (desenvolvimento futuro)

------------------------------
ATenção:

se o fallback envolver pooling no servidor, precisamos garantir que somente quem tem a chave privada vapid é que pode acessar o endereço de pooling e receber as mensagens pendentes. 
sem esta garantia qualquer um poderia puxar as mensagens pendentes.

como para enviar mensagens o remetente sabe tambem qual é o private vapid pois ele assina a mensagem no push web tradicional, precisamos garantir tambem que somente o destinatário real é que consegue puxar as mensagens pending em um fallback de pooling.  então além da chave privada, vamos precisar de um ID secreto ou outra chave privada que sirva de identificação do cliente pwa realmente , estou imaginando que precisamos ter duas chaves privadas
Uma que identifica o destinatário de push web , pois esta logica reversa que criamos
outra chave privada que identifique o pwa que criou a chave privada acima (que deixará de ser secreta pois será divulgada para os contatos enviar mensagem)


# Como o Web Push funciona no Loco

## O que é Web Push

Web Push é um protocolo que permite que um **servidor de aplicação** envie
mensagens para um **navegador**, mesmo quando o site não está aberto. No Loco,
usamos Web Push como camada de fallback quando a comunicação P2P
(WebRTC/DataChannel) não está disponível.

## Por que ele é importante

O Loco é um PWA sem servidor central. Quando você envia uma mensagem:

1. Primeiro, o app tenta enviar diretamente via **P2P/WebRTC** (canal direto).
2. Se o contato não está online no momento, o app usa **Web Push** para acordar
   o navegador do destinatário.

Isso significa que:

- O destinatário pode estar com o navegador fechado ou em segundo plano.
- O sistema operacional recebe o push e acorda o Service Worker do app.
- O Service Worker processa a notificação e, quando possível, entrega a
  mensagem.

## Como o navegador "dorme" e acorda

Um PWA instalado continua com o **Service Worker** registrado no sistema
operacional, mesmo que:

- A aba do navegador esteja fechada.
- O dispositivo esteja ocioso.
- O app não esteja ativo na tela.

Quando um push chega, o SO executa o Service Worker em background. Esse processo
é chamado de **wake-up**: o navegador "acorda" o app para processar a mensagem.

## Fluxo de envio no Loco

```
Usuário A -> Digita mensagem
     |
     v
Tentativa P2P (DataChannel/WebRTC)
     |
     |-- sucesso --> mensagem entregue diretamente
     |
     falha
     |
     v
Envio via Web Push
     |
     v
Serviço de Push do destinatário (ex: FCM, Mozilla, etc.)
     |
     v
Navegador do destinatário acorda o Service Worker
     |
     v
Notificação exibida + mensagem processada
```

## VAPID: identidade do remetente

Para enviar um push, o remetente precisa de chaves **VAPID**:

- **Chave pública**: compartilhada com o contato para validar quem enviou.
- **Chave privada**: usada para assinar a requisição de push.

No Loco, as chaves VAPID são geradas automaticamente na primeira execução e
armazenadas no IndexedDB.

## Limitações importantes

- **Não é garantido**: o destinatário pode ter negado notificações ou o serviço
  de push pode estar indisponível.
- **Criptografia do payload**: o protocolo Web Push exige criptografia do
  conteúdo com as chaves do subscriber. A implementação atual do Loco envia JSON
  simplificado; em produção, um **relay server** é recomendado para fazer a
  criptografia correta.
- **Navegadores**: cada navegador usa seu próprio servidor push (Chrome=FCM,
  Firefox=Autopush, Safari=APNs via Safari Push).

## O futuro: relay server

Para suportar Web Push robusto sem servidor central, o Loco pode usar um **relay
server opcional** que apenas encaminha pushes assinados, sem armazenar
mensagens. Isso resolve:

- Criptografia de payload (RFC 8291).
- Rate limits e retries.
- Compatibilidade entre diferentes browsers.

## Resumo

Web Push é o mecanismo que permite o Loco alcançar contatos offline. Combinado
com P2P quando ambos estão online, o app consegue entregar mensagens em
praticamente qualquer situação em que o dispositivo tenha internet e
notificações habilitadas.

````

---

## Arquivo: `docs/state-management.md`

```md
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
```

---

## Arquivo: `docs/roteamento-spa.md`

````md

# Arquitetura SPA e Roteamento Reativo (Signals)

**Data de Atualização:** Agosto de 2026
**Módulo:** UI / Navegação
**Tecnologias:** Preact, `@preact/signals`, HTML5 History API (Hash)

## 1. O Problema e a Motivação
Nas versões iniciais, o Loco utilizava múltiplas páginas HTML (`index.html`, `profile.html`, `share.html`, `logout.html`) servidas pelo backend. Essa abordagem tradicional gerava alguns gargalos críticos para um **PWA Offline-First**:

1. **Perda de Estado em Memória:** A cada navegação, o navegador destruía o contexto do JavaScript, forçando a recarga massiva de chaves criptográficas, contatos e histórico do IndexedDB.
2. **Fricção Visual (Flickering):** Recarregamentos de página (mesmo cacheados pelo Service Worker) causam uma tela em branco momentânea, quebrando a sensação de "Aplicativo Nativo".
3. **Complexidade no Build:** O script de compilação do Deno precisava mapear e injetar dependências em múltiplos pontos de entrada.

## 2. A Solução: Single Page Application (SPA) Reativa
Para resolver isso sem adicionar dependências externas pesadas (como `react-router`), o Loco adota um roteador customizado, minimalista e 100% integrado ao `@preact/signals`.

A arquitetura baseia-se em **três pilares**:
1. **A URL como Fonte da Verdade (Single Source of Truth):** Utilizamos o `hash` da URL (`#chat=123`, `#profile`) para ditar o estado da tela, garantindo que o botão "Voltar" do celular funcione nativamente.
2. **Reatividade Nível-Zero:** Escutamos o evento nativo `hashchange` e refletimos isso instantaneamente em um Signal.
3. **Dicionário de Rotas (O(1)):** Em vez de usar árvores de renderização ou condicionais estruturais (`if/else`), usamos um Mapa de Componentes para busca instantânea.

## 3. Fluxo de Funcionamento

O ciclo de vida de uma navegação no Loco ocorre da seguinte forma:

1. **Gatilho de Navegação:**
   O usuário clica em um botão, que executa a função utilitária `navigate('#profile')` (ou o usuário clica fisicamente no botão de "Voltar" do smartphone).
   
2. **Intercepção Global:**
   O *Listener* nativo do navegador em `src/utils/router.ts` detecta a mudança:
   ```typescript
   globalThis.addEventListener("hashchange", () => {
     currentHash.value = globalThis.location.hash;
   });

3. **Efeito Cascata (Signals):**
    O `effect()` no roteador observa a mudança de `currentHash.value` e atualiza todos os signals de estado de negócio correspondentes (ex: `currentMobileView`, `contatoSelecionado`). Ele também extrai parâmetros da URL, como o hash do contato.
4. **Tradução de Rota (Selector):**
    O Signal computado (`computed`) chamado `activeView` simplifica a URL complexa em uma chave string direta:
    `#chat=abc123hash` ➔ `'chat'`
5. **Renderização Condicional (O(1)):**
    No `app.tsx`, o componente raiz apenas acessa a chave mapeada e renderiza o componente associado de forma performática:
    ```tsx
    const ViewMap: Record<string, ComponentType<any>> = {
    'chat': ChatSection,
    'profile': ProfileSection,
    // ...
    };

    // ... dentro do App()
    const RouteComponent = ViewMap[activeView.value] || ViewMap['home'];
    return <RouteComponent/>;

    ```

## 4. Vantagens desta Abordagem

* **Zero Dependências:** Nenhuma biblioteca de terceiros de milhares de linhas é necessária para simplesmente ler uma string da barra de endereços.
* **Guarda de Rotas (Route Guards) Simplificada:** Se o usuário não possui perfil configurado, o próprio `app.tsx` intercepta a view e força a renderização do `ProfileSection`, mantendo a segurança estrita do app.
* **Economia de Bateria e CPU:** Como o `app.tsx` nunca é desmontado, todas as chaves RSA/ECDSA e as conexões ativas permanecem intactas na RAM do dispositivo.
* **Desacoplamento UI/Lógica:** Componentes (ex: `ContactDetailSection`) não precisam saber *como* a navegação funciona, eles apenas chamam a função desacoplada `navigate()`.




````

---

## Arquivo: `docs/changes.md`

````md
Uma análise aprofundada e estendida do código-fonte do **Loco v0.2.20-msmk6qjq** revela pontos específicos de melhoria, pequenas divergências lógicas e comportamentos não harmoniosos que podem causar *bugs* sutis de concorrência, perda de sincronia visual ou *memory leaks*.

---

### 1. Concorrência Crítica e *Race Condition* no Carregamento de Mensagens (`src/stores/mensagensStore.ts`)

* **O Problema:** A função `carregarMaisMensagens` valida o `activeChatHash` no início e logo após o `await listarChatPaginado`. Contudo, o ponteiro global `currentOffset` e o *signal* reativo `mensagensAtivas.value` sofrem mutação sem trava atômica. Se o usuário rolar a tela rapidamente para o topo (disparando múltiplos eventos de scroll simultâneos), chamadas concorrentes a `carregarMaisMensagens` podem ler o mesmo `currentOffset`, duplicando fatias ou corrompendo a ordem temporal das mensagens após o `.sort()`.
* **Solução Proposta:** Proteger a função de lazy loader com uma variável de guarda de paginação específica para o chat ativo ou bloquear o gatilho de scroll enquanto uma requisição de paginação estiver pendente.

---

### 2. Vazamento de Ouve-Eventos (Listeners) de Service Worker no Mount do Chat (`src/components/ChatSection.tsx`)

* **O Problema:** No componente `ChatSection`, o `useEffect` adiciona um listener global de `message` ao `navigator.serviceWorker` toda vez que o sinal `contatoSelecionado.value` muda:
```tsx
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', handleMessage);
}

```


Embora exista a função de limpeza (`removeEventListener`), se o componente sofrer re-renderizações rápidas com trocas de contato, o listener pode ser anexado múltiplas vezes de forma redundante antes que a desmontagem ocorra, duplicando o processamento de atualizações (`CHAT_ATUALIZADO`).
* **Solução Proposta:** Isolar a inicialização do listener de mensagens do Service Worker em um ganho de ciclo de vida único (montagem global do app ou em uma store dedicada, similar ao que já é feito em `contatosStore.ts`).

---

### 3. Falta de Tratamento de Erro e Bloqueio Visual na Injeção de Perfis (`src/handshakes/hand-profile.ts`)

* **O Problema:** Na rota de entrada de perfil (`hand-profile.ts`), quando um pacote de dados chega e o contato é atualizado no banco local:
```ts
const contato = await buscarContatoPorChave(contatoId);
if (contato) {
  // ... mutações e salvamento ...
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach(client => {
    client.postMessage({ type: 'CONTATO_ATUALIZADO', payload: { contatoHash: contatoId } });
  });
}

```


Se a operação de escrita no IndexedDB (`salvarContato`) falhar por estouro de cota ou concorrência de transação, a interface enviará o sinal `CONTATO_ATUALIZADO` via `postMessage` informando um estado que nunca foi gravado em disco com sucesso.
* **Solução Proposta:** Envolver a mutação de dados e o despacho do `postMessage` em blocos de salvamento transacional rigorosos, garantindo que a UI só seja notificada após a persistência física ser confirmada.

---

### 4. Coerência de Tipagem e Incompatibilidade no Payload do Cache do Service Worker (`src/sw/cache.ts`)

* **O Problema:** No arquivo `src/sw/cache.ts`, a linha de injeção automática de assets do build (`build.ts`) substitui a tag `__GENERATED_ASSETS__` por uma string JSON:
```ts
const ASSETS_TO_CACHE = [__GENERATED_ASSETS__];

```


No entanto, em `build.ts`, o array gerado é injetado diretamente sem os colchetes externos se a formatação do script não alinhar perfeitamente com os colchetes literais do arquivo `.ts` original, o que pode gerar erros de sintaxe silenciosos na execução em background do Service Worker caso o array fique malformado (`[, , ]`).
* **Solução Proposta:** Garantir que o array gerado no script de build substitua a declaração inteira da constante `ASSETS_TO_CACHE` em vez de depender de interpolação parcial de strings.

---

### 5. Inconsistência no Estado de Erro de Rede do Push Proxy (`main.ts`)

* **O Problema:** No servidor Deno (`main.ts`), quando o envio de uma mensagem via webpush falha com um erro que não é uma instância de `PushMessageError`, o bloco `catch` genérico formata a resposta:
```ts
return new Response(
  JSON.stringify({ success: false, error: errorMessage, type: "InternalError" }),
  { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
);

```


Retornar um status HTTP `400 (Bad Request)` para falhas internas genéricas ou de rede do servidor de push mascara erros reais de infraestrutura (como falhas de DNS ou indisponibilidade do FCM), que deveriam retornar `500 (Internal Server Error)` ou `503`.
* **Solução Proposta:** Mapear os códigos de erro do Deno/Fetch adequadamente para evitar falsos positivos de requisição malformada no cliente.


------

Desacoplar proxy das páginas estaticas
configgurar proxy enxuto com uma rota apenas GET e POST
analisar de precisa do logout ou se pode ser get com parametros
gerar uma versão para cloudflare worker

contato precisa informar o proxy que deve ser usado para enviar as chaves privadas envelopadas para o proxy correto


-------

# Compatibilidade com cloudflare workers

Análise de Arquitetura: Compatibilidade Híbrida Deno + Cloudflare WorkersSim, o padrão de estruturar o código no formato padrão de **Module Workers** da Cloudflare (`export default { fetch(request, env, ctx) }`) e prover um adaptador local com `Deno.serve` é uma prática amplamente utilizada e altamente recomendada no ecossistema de arquiteturas Serverless e Edge.

## 🔍 Como funciona e por que é amplamente adotado

Grandes frameworks edge-native e desenvolvedores independentes utilizam essa mesma estratégia para alcançar **Write Once, Run Anywhere (WORA)** entre provedores como:

* **Cloudflare Workers** (runtime oficial `workerd`)

* **Deno Deploy** (que também suporta nativamente o padrão `export default { fetch }`)

* **Ambiente Local Deno** (via adaptador com `Deno.serve`)

### Referências e Padrões da Indústria

* A própria documentação oficial do Deno e ferramentas de ecossistema encorajam o uso de Module Workers padronizados baseados no padrão Web Standard para unificar o código fonte em plataformas distribuídas.

* O runtime subjacente da Cloudflare (`workerd`) e o runtime do Deno compartilham a adesão estrita aos padrões Web API (`Request`, `Response`, `CryptoKey`, `fetch`), tornando a manipulação de criptografia e requests totalmente fluida.

## 💡 Dicas Adicionais e Boas Práticas

1. **Gerenciamento de Bindings e Variáveis de Ambiente (`env` vs `Deno.env`):**

   * Na Cloudflare, segredos e chaves de infraestrutura chegam exclusivamente através do argumento `env`.

   * Localmente no Deno, usamos `Deno.env.get()`. O padrão adotado no nosso `main.ts` de mesclar essas origens garante que o código funcione em ambos os mundos sem quebras.

2. **Simulação Real com Wrangler:**

   * Embora você possa rodar o arquivo diretamente com o Deno, a Cloudflare disponibiliza o **Wrangler** (`npx wrangler dev`), que roda o simulador oficial local (`miniflare`). Se quiser testar o comportamento exato da nuvem da Cloudflare antes do deploy, você pode configurar o Wrangler apontando para este mesmo arquivo.

3. **Tratamento do `ctx.waitUntil()`:**

   * Em ambientes Edge, tarefas assíncronas de background devem ser enfileiradas usando `ctx.waitUntil(promise)`. No adaptador Deno local, mockar esse comportamento garante que o fluxo assíncrono não cause encerramentos prematuros da thread ou erros não tratados.

--------

## Ativar o Gemini Nano no Chrome
chrome://flags/#optimization-guide-on-device-model
  Na opção Enables optimization guide on device, mude o status de Default para Enabled BypassPerfRequirement (isso força a ativação mesmo se o Chrome achar seu hardware modesto).

chrome://flags/#prompt-api-for-gemini-nano
  Na opção Prompt API for Gemini Nano, mude para Enabled

chrome://components
  Procure pela linha Optimization Guide On Device Mode. Se a versão estiver 0.0.0.0 ou o status indicar que precisa de atualização, clique no botão Check for update

## Interagindo com o Gemini Nano (Pelo Console)
Interagindo com o Gemini Nano (Pelo Console)
```js
ai.languageModel.capabilities();
ai.languageModel.create();
resposta = await sessao.prompt("Explique o que é um PWA em uma frase curta.");
console.log(resposta);
```

````

---

## Arquivo: `docs/federation-protocol.md`

```md
# Protocolo de Federação e Envelopes VAPID — Loco PWA

## Visão Geral
O servidor do Loco opera como um **Proxy Cego Federado**. Ele tenta descriptografar envelopes de notificações WebPush com sua chave privada. Se o envelope pertencer a outro servidor na rede de nós, o pacote é reencaminhado de forma transparente.

## Fluxo de Processamento de Push
1. **Inspeção do Payload:** Verifica a validade do JSON e o limite do payload (máx. 8192 bytes).
2. **Decodificação JWT:** Extrai as claims públicas do payload para identificar o servidor de destino (`proxyserver`).
3. **Prova de Posse (Proof of Ownership):** Tenta abrir o envelope criptografado usando `decryptWithServerKey`.
   * **Sucesso:** O envelope é destinado a este nó. Envia a notificação diretamente via WebPush/FCM.
   * **Falha (Descriptografia):** O envelope pertence a outro nó federado.
4. **Relé de Federação (Proxying):** Compara o `hostname` de destino com o nó local. Se for um nó remoto, realiza um `POST /push` transparente com um timeout de 10 segundos.
```

---

## Arquivo: `README.md`

````md
# 📡 Loco — Mensageiro PWA Descentralizado

O **Loco** é um Progressive Web App (PWA) de mensagens instantâneas descentralizado, focado em privacidade absoluta, criptografia ponto a ponto (E2EE) e arquitetura *offline-first*. A aplicação opera sem um banco de dados centralizado de mensagens ou contatos, utilizando comunicação híbrida (**Web Push via FCM** e **WebRTC P2P**).

---

## 1. Visão Geral e Filosofia

No Loco, **cada navegador é um nó autônomo** que mantém seu próprio histórico local e suas próprias chaves criptográficas.

* **Sem Servidor de Mensagens:** O servidor backend (Deno 2.x) atua exclusivamente como um *proxy cego* de entrega de notificações Web Push e provedor de infraestrutura de chaves temporárias para envelopes VAPID.
* **Privacidade e Anonimato por Design:** A criação do perfil exige apenas um Nome ou pseudônimo (o E-mail é estritamente opcional). O servidor não armazena logs de conversas, listas de contatos, metadados ou conteúdo de mensagens.
* **Resistência à Evicção:** Os dados do usuário residem unicamente no dispositivo local através do IndexedDB e Origin Private File System (OPFS), protegidos por solicitações de Armazenamento Persistente.

```text
+------------------+         +-------------------+         +------------------+
|  Nó A (Emissor)  |         |   Servidor Proxy  |         |  Nó B (Receptor) |
|  (IndexedDB/SW)  |         |   Deno + WebPush  |         |  (IndexedDB/SW)  |
+--------+---------+         +---------+---------+         +--------+---------+
         |                             |                            |
         | --- 1. Envia JWT Cifrado -> |                            |
         |    (com VAPID Envelope)     | --- 2. Repassa via FCM ->  |
         |    (sub: "hand")            |    (Gateway WebPush)       |
         |                             |                            | --- 3. Recebe Push
         |                             |                            |      e Decifra E2E
         |                             |                            |
         | <--- 4. Handshake de Resposta (Auto-Ack) via Proxy ----- |

```

---

## 2. A Máquina de Estados (O Roteador de Handshakes)

Na arquitetura do Loco, **toda e qualquer comunicação na rede é um Handshake** de sincronização de estados. Não existem fluxos isolados para mensagens de texto ou comandos de sistema.

O Roteador (`sw-handshakes.ts`) funciona como uma "Máquina de Estados" assíncrona baseada na arquitetura *Offline-First*, operando via IndexedDB (`Handshake_DB`):

* **`FluxoIn` (Entrada):** Pacotes recebidos, descriptografados pelo Service Worker e enfileirados para processamento local por módulos especializados.
* **`FluxoOut` (Saída):** Pacotes preparados pela UI/SW, enfileirados, comprimidos e cifrados para envio à rede (com controle de até 3 tentativas e fallback em restabelecimento de conexão).

### 2.1. Módulos Especializados (As Rotas)

O Roteador distribui os payloads descodificados para módulos especialistas localizados em `src/handshakes/`:

* 💬 **Rota Mensagem (`hand-mensagem.ts`):** Tráfego bidirecional de mensagens e recibos de entrega (Auto-Ack instantâneo sinalizando status de entrega `✓✓` e notificações do SO).
* 👤 **Rota Profile (`hand-profile.ts`):** Troca sob demanda de atributos de perfil (nome, e-mail, chaves públicas e endpoint de subscrição).
* 🛡️ **Rota Contato (`hand-contato.ts`):** Gestão de saúde criptográfica e ciclo de confiança mútua (`me` e `trusted`).

### 2.2. Injeção de Carona (Piggybacking)

Para garantir resiliência extrema em redes instáveis ou quando contatos atualizam suas subscrições Push, o Roteador utiliza *Piggybacking*. Se um nó tenta enviar uma mensagem para um destinatário que não possui seu perfil atualizado (status `me: 'none'` ou `me: 'wrong'`), o Roteador **injeta automaticamente seu Cartão de Visitas no mesmo pacote da mensagem**. O dispositivo receptor ajusta a chave e o endpoint antes mesmo de exibir o balão da conversa.

---

## 3. Padrões e Regras de Desenvolvimento

### 3.1. Diretrizes Principais

1. **Runtime Único (Deno 2.x):** Proibido o uso de Node.js, `npm` tradicional ou pacotes com dependências C++ nativas.
2. **Zero `localStorage`:** É terminantemente proibido utilizar `localStorage` devido a bloqueios síncronos da I/O thread do navegador. Todo o estado persistente utiliza a camada IndexedDB (`src/utils/db-helpers.ts`) via `idb-keyval`.
3. **Isolamento de Processamento:** Operações síncronas pesadas (compressão GZIP com `fflate`, geração de chaves RSA/ECDSA com WebCrypto, parsing de QR Code, Minificação de Chaves) são executadas em segundo plano ou no Service Worker para manter a UI fluída em 60 FPS.
4. **Interface Reativa:** Construída com **Preact**, gerenciamento de estado via **Signals** (`@preact/signals`) e componentes visuais do **Material Design 3** (`@material/web`).

---

## 4. Arquitetura de Segurança e Criptografia

O Loco utiliza um modelo de criptografia Híbrida (Assimétrica + Simétrica) em múltiplas camadas:

```text
+-------------------------------------------------------------------------+
|                        JWT PAYLOAD (Max 4096 bytes)                     |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  | Assinatura Externa: ECDSA (VAPID P-256) - Autenticidade do Emissor   |  |
|  +-------------------------------------------------------------------+  |
|  | Envelope Cifrado (ct):                                            |  |
|  |   - Dados Cifrados: AES-GCM-256 (Rotas + Payload + GZIP)           |  |
|  |   - Chave AES Cifrada: RSA-OAEP-2048 (Chave Pública do Receptor)   |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+

```

1. **Identidade / Assinatura (VAPID):** (ECDSA P-256) Usado para assinar os tokens JWT (`alg: "ES256"`), identificando o remetente através da chave pública (`kid`).
2. **Criptografia Ponto a Ponto (E2E):** (RSA-OAEP-2048 + AES-GCM-256) O conteúdo do handshake é comprimido com GZIP (`fflate`) e cifrado com uma chave AES gerada no momento. Essa chave AES é então cifrada com a chave pública RSA do destinatário.
3. **Blindagem do Servidor Proxy (VAPID Envelope):** O servidor proxy possui um par de chaves RSA estático. O cliente cifra a versão minificada de sua chave privada VAPID em um envelope criptográfico. O servidor proxy abre esse envelope temporariamente na memória RAM apenas para assinar o cabeçalho HTTP VAPID exigido pelo gateway do Web Push (FCM), descartando-a imediatamente após o envio.

---

## 5. Estrutura de Convites e Sincronização Compacta (Static Schema Compression)

Para respeitar o limite rigoroso de **4.096 bytes** impostos pelos provedores Push (FCM) e manter o QR Code legível pela câmera em matrizes compactas, o Loco implementa a interface `CompactContact` (`src/utils/share-utils.ts`) e o conceito de *Static Schema Compression* nas chaves.

Objetos JWK extensos são reduzidos, eliminando a redundância da WebCrypto API, e mapeados em atributos compactos de duas letras. Endpoints de servidores de push são tokenizados:

| **Atributo Original** | **Atributo Compacto (CompactContact)** | **Descrição** |
| --- | --- | --- |
| `email` | `em` | E-mail do contato (Opcional) |
| `name` | `nm` | Nome do contato |
| `vapidPublicKey` | `vp` | Chave VAPID Pública Minificada (Apenas coordenadas X e Y) |
| `e2ePublicKey` | `ep` | Chave RSA Pública E2E Minificada (Apenas módulo N) |
| `subscription.endpoint` | `se` | Endpoint Push (prefixo `1:` substitui a URL do FCM) |
| `subscription.keys.p256dh` | `sp` | Chave p256dh da subscrição Push |
| `subscription.keys.auth` | `sa` | Chave de autorização Push |
| `vapidPrivateKeyEnvelope` | `ve` | Envelope da chave VAPID cifrada |
| `subscription.proxyserver` | `ps` | Endereço estrito do Servidor Proxy (Auto-Discovery) |
| `trusted` | `tr` | Indicador de contato confiável |
| `request` | `req` | Flag de solicitação de resposta |

Formatos de transporte suportados:

* **QR Code Binário Compacto (`cqr`):** String Base64Url contendo o JSON comprimido via GZIP.
* **Link Web Comprimido (`cjwt`):** URL para compartilhamento em redes externas (`/share.html?cjwt=...`).

---

## 6. Ciclo de Confiança Mútua dos Contatos

Cada contato armazenado possui dois indicadores de estado que descrevem a saúde da relação criptográfica:

1. **`trusted` (boolean):** Definido localmente pelo usuário ao escanear o QR Code ou homologar manualmente o contato.
2. **`me` (MeStatus):** Indica como o dispositivo do contato enxerga o seu perfil local:
* `'trusted'`: O contato confirmou que você é um contato confiável no dispositivo dele.
* `'saved'`: O contato tem o seu perfil salvo, mas ainda não o marcou como confiável.
* `'wrong'`: Os dados do seu perfil no dispositivo do contato estão desatualizados (ex: alteração de subscrição Push).
* `'none'`: O contato ainda não possui seus dados salvos.



---

## 7. Armazenamento Local (IndexedDB)

Os dados são divididos em bancos de dados isolados utilizando a biblioteca `idb-keyval`:

| **Nome do Banco (DB_NAMES)** | **Chave Primária** | **Tipo de Dado** | **Finalidade** |
| --- | --- | --- | --- |
| `AppConfig_DB` | `"profile"` | `ProfileConfig` | Perfil do usuário local, chaves, configurações de rede, envelope VAPID e subscrição Push. |
| `BrowserB_Contatos_DB` | Hash SHA-256 (`vapidPublicKey`) | `Contato` | Agenda de contatos, chaves E2E e estado de confiança (`me` / `trusted`). |
| `Chat_DB` | ID da Mensagem | `Chat` | Histórico de mensagens unificado (recebidas/enviadas) com indexação virtual. |
| `Handshake_DB` | ID do Handshake (`jti`) | `Handshake` | Fila assíncrona da Máquina de Estados (fluxos `in` e `out`). |

---

## 8. Diagnóstico e Resolução de Problemas

* **Erro "The string to be decoded is not correctly encoded" ao importar contato:**
* *Causa:* Quebras de linha ou espaços invisíveis ao colar a string do token.
* *Solução (Já Implementada):* A camada `jwt-helpers.ts` possui sanitização defensiva via Expressão Regular (`/[^A-Za-z0-9\+\/]/g`) que expurga formatações corrompidas de *copy/paste* antes da decodificação Base64.


* **Rejeição HTTP 413 no Envio de Mensagem (`Payload muito grande`):**
* *Causa:* O JWT ultrapassou o limite de 4.096 bytes imposto pelo serviço Web Push (FCM).
* *Solução:* O payload cifrado utiliza *Static Schema Compression* e o compressor GZIP (`fflate`).


* **Erro de Rota de Push Proxy e Falha de CORS:**
* *Solução:* Acesse as "Configurações" do App e clique em "Auto-Discovery". O sistema remapeará a sua rota estática (como GitHub Pages) para o Worker público de *fallback* ativo.



````

---

