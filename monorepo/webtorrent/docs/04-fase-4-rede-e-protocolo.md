# /loco/monorepo/webtorrent/docs/04-fase-4-rede-e-protocolo.md

# Fase 4: Rede e Protocolo (Tracker Client & Wire Protocol)

## 🎯 Objetivo da Fase
Nesta fase, construímos os módulos responsáveis pela **descoberta de peers** e pela **comunicação P2P** real. Como o navegador impõe restrições severas de segurança (sem acesso a sockets TCP/UDP brutos), precisamos adaptar o protocolo BitTorrent para funcionar exclusivamente sobre **WebRTC** (para dados) e **WebSocket/HTTP** (para trackers), mantendo a compatibilidade com a especificação oficial (BEPs).

---

## 🧠 Decisões Arquiteturais Críticas

1. **Zero Sockets TCP/UDP**: O browser não permite conexões diretas a IPs e portas de peers tradicionais. A descoberta depende 100% de Trackers (HTTP/WS) e, futuramente, de Peer Exchange (ut_pex) via WebRTC.
2. **Abstração de Transporte (`Transport`)**: O `Wire` (protocolo) não deve saber se está rodando sobre um `RTCDataChannel`, um mock de teste ou qualquer outro stream. Ele recebe uma interface simples (`send`, `onMessage`, `close`), garantindo testabilidade unitária sem levantar servidores WebRTC reais.
3. **Parser de Stream (Acumulador de Buffer)**: Dados chegam em pedaços arbitrários (chunks) pela rede, especialmente no WebRTC, que pode fragmentar mensagens. O `Wire` mantém um `buffer` interno (`Uint8Array`) e acumula os chunks até ter o tamanho completo de uma mensagem (4 bytes de prefixo de tamanho + 1 byte de ID + payload).
4. **Uso de `DataView` e Helpers Nativos**: Substituímos completamente o `Buffer` do Node.js. Usamos nossos helpers `readUInt32BE` e `writeUInt32BE` (baseados em `Uint8Array` e operações bitwise) para ler e escrever os cabeçalhos das mensagens de forma performática e nativa.

---

## 📡 1. Tracker Client (`src/network/tracker.ts`)

O Tracker é o serviço que diz "quem mais está baixando este torrent?". Implementamos suporte nativo a **HTTP/HTTPS** e **WebSocket**, ignorando UDP (inviável no browser).

### Decisões de Implementação
- **HTTP Tracker (Fetch API)**:
  - Utiliza `fetch()` nativo com `AbortController` para timeout (15s).
  - **Codificação Binária na URL**: O protocolo BitTorrent exige que `info_hash` e `peer_id` sejam enviados como bytes brutos na URL, não como strings UTF-8 codificadas. Implementamos um helper `encodeBinary` que converte `Uint8Array` para caracteres de byte único, satisfazendo a especificação sem depender de bibliotecas externas.
  - Decodifica a resposta Bencode e extrai a lista de peers no formato **compact** (6 bytes por peer: 4 de IP + 2 de porta), que é o padrão mais eficiente.
- **WebSocket Tracker**:
  - Essencial para o WebTorrent no browser, pois permite a troca de ofertas SDP (Session Description Protocol) para estabelecer conexões WebRTC diretamente através do tracker.
  - Utiliza a API nativa `WebSocket` e JSON para comunicação (diferente do HTTP, que usa Bencode).
  - Mantém um mapa de `pendingRequests` para correlacionar respostas assíncronas com as promises de `announce()`.
- **Factory Pattern**: A função `createTracker(url, opts)` retorna a instância correta (`HttpTracker` ou `WsTracker`) baseada no protocolo da URL, isolando a lógica de conexão e facilitando testes.

---

## 🔌 2. Wire Protocol (`src/core/wire.ts`)

O Wire Protocol é a "língua" que os peers falam entre si, definida na BEP 3. Ele gerencia o handshake, controle de fluxo e transferência de peças.

### Decisões de Implementação
- **Extensão de `TypedEventTarget`**: Substituímos o `EventEmitter` do Node.js por um wrapper nativo do browser (`EventTarget`) com tipagem estrita para os payloads dos eventos, garantindo segurança de tipos em todo o fluxo de dados.
- **Mensagens Suportadas (BEP 3)**:
  - **Handshake**: Troca de `infoHash` (20 bytes), `peerId` (20 bytes) e extensões (8 bytes).
  - **Controle de Fluxo**: `choke`, `unchoke`, `interested`, `not-interested`.
  - **Gerenciamento de Peças**: `have` (notificação de peça recebida), `bitfield` (mapa de todas as peças), `request` (pedido de bloco), `piece` (dados do bloco), `cancel`.
  - **Extensões (BEP 10)**: `extended` (preparado para `ut_metadata`, `ut_pex`, etc.).
- **Parser de Buffer Acumulador**:
  - O método `_onData(chunk)` acumula os dados recebidos em `this.buffer`.
  - O método `_processBuffer()` verifica continuamente se há mensagens completas no buffer.
  - Lê os 4 primeiros bytes para obter o `length` da mensagem.
  - Se `length === 0`, é um Keep-Alive.
  - Caso contrário, aguarda até que `this.buffer.length >= 4 + length`, extrai o `msgId` e o `payload`, processa a mensagem e remove os bytes processados do buffer (usando `subarray` para evitar cópias desnecessárias de memória).

---

## 🌐 APIs Nativas do Browser Utilizadas

| API Nativa | Substitui (Node.js) | Uso no Projeto | Status |
| :--- | :--- | :--- | :--- |
| `fetch()` + `AbortController` | `http`, `https`, `simple-get` | HTTP trackers, web seeds, download de .torrent | ✅ **Implementado** |
| `WebSocket` | `ws` | Conexão com trackers WebSocket (`wss://`) | ✅ **Implementado** |
| `RTCPeerConnection` | `net`, `utp` | Transporte P2P de dados (WebTorrent no browser só suporta WebRTC) | 🔜 **Próximo (Peer)** |
| `RTCSessionDescription` | N/A | Handshake WebRTC (oferta/resposta SDP) | 🔜 **Próximo (Peer)** |
| `RTCIceCandidate` | N/A | Troca de candidatos ICE para NAT traversal | 🔜 **Próximo (Peer)** |
| `RTCDataChannel` | N/A | Canal de dados confiável sobre WebRTC (onde o Wire roda) | 🔜 **Próximo (Peer)** |
| `Uint8Array` / `DataView` | `Buffer` do Node.js | Manipulação de todos os dados binários do protocolo | ✅ **Implementado** |

---

## 🧪 Testes Implementados

### `tests/tracker_test.ts`
- Valida a factory `createTracker()` para HTTP e WebSocket.
- Testa o lançamento de erro para protocolos não suportados (ex: `udp://`).

### `tests/wire_test.ts`
- **MockTransport**: Cria um par de `Wire`s conectados em memória (loopback) para testar o protocolo sem rede real. O que um envia, o outro recebe instantaneamente via `queueMicrotask`.
- **Handshake**: Valida a troca correta de `peerId` e `infoHash`.
- **Mensagens**: Testa a emissão e recepção de `choke`, `unchoke`, `request` e `piece`.
- **Fragmentação**: Simula dados chegando em pedaços minúsculos (byte a byte) para validar a robustez do parser de stream acumulador.

---

## 🚀 Próximos Passos (Fase 5: Integração e Extensões)

Com o Tracker e o Wire Protocol prontos e testados, a próxima etapa é conectar essas peças e adicionar suporte a funcionalidades avançadas:

1. **WebRTC Peer Manager (`src/network/peer.ts`)**:
   - Uma classe que pega as ofertas SDP do Tracker, cria o `RTCPeerConnection`, estabelece o `RTCDataChannel` e injeta nosso `Wire` por cima dele.
   - Gerencia o ciclo de vida da conexão (conectado, desconectado, erro) e repassa os eventos do `Wire` para o `Torrent`.

2. **Extensão `ut_metadata` (`src/extensions/ut-metadata.ts`)**:
   - Essencial para o Loco, pois os usuários compartilharão Magnet URIs, não arquivos `.torrent` completos.
   - Permite que um peer solicite o dicionário `info` (metadados) de outro peer que já possui o torrent completo, usando o canal `extended` do Wire Protocol.

3. **Integração com a Classe `Torrent`**:
   - O `Torrent` usará o `Tracker` para descobrir peers.
   - Para cada peer descoberto, instanciará um `Peer`.
   - O `Peer` estabelecerá a conexão WebRTC e, ao receber o `handshake` válido, começará a trocar mensagens de `interested`, `request` e `piece` com o `Wire`, alimentando o `ChunkStore` que validamos na Fase 3.

---

## 📚 Referências (BEPs)
- [BEP 3: The BitTorrent Protocol Specification](http://www.bittorrent.org/beps/bep_0003.html)
- [BEP 10: Extension Protocol](http://www.bittorrent.org/beps/bep_0010.html)
- [BEP 9: Extension for Peers to Send Metadata Files](http://www.bittorrent.org/beps/bep_0009.html) (`ut_metadata`)
- [WebTorrent Browser API](https://github.com/webtorrent/webtorrent/blob/master/docs/api.md#browser-usage)