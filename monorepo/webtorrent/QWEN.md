# Regras de conduta — @loco/webtorrent

> Contexto obrigatório para qualquer IA (Qwen Code) que analise, adapte ou
> modifique este pacote. Leia este arquivo antes de propor mudanças.

## 1. Missão do pacote

- `src/` é a implementação oficial do **Loco**, um cliente BitTorrent
  **browser-first** (PWA). Tudo em `src/` deve funcionar no navegador.
- `deno-torrent/` é a **fonte de referência de protocolo** (implementação
  rigorosa, orientada a Deno). Ela informa *o que* implementar e *quais
  validações* existem — não é copiada cegamente.
- Direção do trabalho: incorporar capacidades do `deno-torrent/` ao `src/`
  **sem perder nenhuma funcionalidade existente**.

## 2. Regras de ouro (não negociáveis)

1. **Zero regressão de funcionalidade.** Ao incorporar algo novo, adaptar —
   nunca reescrever do zero removendo comportamento existente. APIs públicas
   (`mod.ts` exports, eventos emitidos, assinaturas) só mudam com pedido
   explícito do usuário.
2. **Browser-first.** Em `src/` são permitidas apenas APIs web padrão:
   `TextEncoder/TextDecoder`, `DataView`, `crypto.subtle`, `setTimeout`,
   `AbortSignal`, `EventTarget`, `navigator.storage` (OPFS). **Proibido** em
   código de produção de `src/`: `Deno.*`, `node:*`, `process.*`, `require`.
   Exceção: arquivos de teste (`tests/`) podem usar `Deno.test`.
3. **A fachada é orientada a eventos.** `Wire`, `Torrent`, `Swarm`, `Peer` e
   as extensões emitem eventos via `TypedEventTarget` (`src/utils/`). Essa
   fachada é estável e consumida pelo restante do Loco. A máquina de estados
   do `deno-torrent` pode ser adotada como *internals*, mas os eventos
   públicos devem continuar existindo.
4. **Utils locais, não imports do deno-torrent.** O bundle do browser não
   deve importar `@deno-torrent/toolkit` nem `@deno-torrent/bencode`. Portar
   para `src/utils/` apenas o necessário, e somente código puro (sem APIs
   Deno). Funções Deno-only como `NetUtil.getMacAddr()` e `MultiFileReader`
   **nunca** devem entrar em `src/`.
5. **Validações do deno-torrent são segurança, não perfumaria.** Limites
   (`maxMessageLength`, `maxPendingRequests`, `maxQueuedWriteBytes`),
   timeouts, validação de spare bits de bitfield, verificação de infoHash e
   rejeição de peers inesperados protegem o PWA contra peers maliciosos. Ao
   adaptar uma função, preservar (ou justificar a remoção de) cada validação.
6. **Tudo que entra precisa de teste.** Nova capacidade incorporada → teste
   em `monorepo/webtorrent/tests/` seguindo o padrão existente
   (`wire_test.ts`, `ut-pex_test.ts`).
7. **Documentar a paridade.** Ao concluir uma incorporação, atualizar a
   matriz de paridade na seção 5 deste arquivo e, se relevante,
   `snapshots/webtorrent.md`.

## 3. Checklist obrigatório para analisar um módulo do deno-torrent

Antes de propor qualquer adaptação de um módulo (ex.: `deno-torrent/magnet`,
`deno-torrent/metainfo`, ...), executar e relatar:

1. **Inventário**: listar todos os exports do módulo (funções, classes,
   constantes, tipos) e o arquivo correspondente em `src/`, se houver.
2. **Classificação por função**: `🟢 já existe` / `🟡 parcial` / `🔴 ausente`.
3. **Dependências**: quais imports o módulo usa (`toolkit`, `bencode`, etc.)
   e se cada um é puro ou depende de API Deno.
4. **Viabilidade browser**: veredito final (`alta`/`média`/`baixa`) com os
   pontos bloqueantes listados.
5. **Plano de incorporação incremental**: ordem das entregas, o que vira
   utils puros, o que vira internals, o que muda na fachada (idealmente nada).
6. **Mapa de validações**: lista das validações/limits do módulo original que
   devem sobreviver à adaptação.

## 4. Avaliação global de todos os submódulos deno-torrent (2026-09-04)

### Resumo executivo

| Submódulo | Linhas | Browser-viável | Prioridade | Bloqueantes |
|---|---|---|---|---|
| **toolkit/** | ~1.543 | Parcial (6/8 arquivos) | 🔴 Fundação | `@std/encoding/*` (substituível) |
| **bencode/** | ~300 | ✅ Sim | 🔴 Fundação | Nenhum |
| **peerwire/** | ~3.300 | ✅ Sim | 🔴 Crítico | Nenhum |
| **magnet/** | ~610 | ✅ Sim (c/ adaptação) | 🟡 Importante | `@std/encoding/base32+hex` |
| **metainfo/** | ~1.369 | Parcial (4/6 arquivos) | 🟡 Importante | generator/utils = Deno-only |
| **peerid/** | ~778 | ✅ Sim | 🟢 Baixo | Nenhum |
| **torrent-parser/** | ~348 | ✅ Sim (c/ Uint8Array) | 🟡 Importante | `@deno-torrent/bencode` import |
| **torrent-tracker/** | ~809 | ✅ Sim | 🔴 Crítico | Nenhum — `fetch`-based! |
| **torrent-generator/** | ~788 | ❌ Não | ⛔ Excluir | `Deno.stat`, `Deno.FsFile`, `@std/fs` |
| **torrent-dht/** | ~3.433 | ❌ Não (UDP) | 🔮 Futuro | `Deno.listenDatagram`, `Deno.Addr` |
| **utp/** | ~3.629 | ❌ Não (UDP) | 🔮 Futuro | `Deno.NetAddr`, raw UDP |

### Detalhe por submódulo

#### toolkit/ (8 sub-pastas)

| Arquivo | Linhas | Browser? | Valor para src/ | Adaptação necessária |
|---|---|---|---|---|
| `bytes/bytes_util.ts` | 251 | ⚠️ `@std/encoding/hex` | `xor`, `compare`, `bigint`, `chunkBytes` | Inlinear hex (5 linhas) |
| `bytes/bit_array.ts` | 382 | ✅ | `BitArray` com `BitOrder` (msb0/lsb0), `xor`, `diff`, `fromBigInt` | Substituir import `BytesUtil.hex` |
| `encoding/encode_util.ts` | 90 | ⚠️ `@std/encoding/*` | Validadores `isBase32/Hex/Sha1`, `encodeBase32/64/Hex` | Inlinear ou usar `atob`/`btoa` |
| `hash/hash_util.ts` | 438 | ✅ | **SHA-1 incremental**, `md5`, `sha512`, `toHex` | Nenhuma — já usa `crypto.subtle` |
| `io/io_util.ts` | 193 | ✅ | `ByteReader/Writer`, `readExactly`, `writeAll`, `InvalidByteCountError` | Nenhuma |
| `io/simple_buffer.ts` | 158 | ✅ | Buffer growable com cursor de leitura/escrita | Nenhuma |
| `io/multi_file_reader.ts` | 246 | ❌ | — | **Não portar** (Deno filesystem) |
| `net/net_util.ts` | 172 | ⚠️ 1 função | `isNetPort`, `isIPv4Str/Bytes`, compact peer format (BEP 23) | Remover `getMacAddr()`; inlinear |

#### bencode/ (4 arquivos, ~300 linhas)

| Arquivo | Linhas | Browser? | vs src/utils/bencode.ts |
|---|---|---|---|
| `decode.ts` | ~269 | ✅ | Retorna `Map` (correto p/ bencode), tem `maxBytes/maxDepth`, `BencodeDecodeError`. src/ retorna `Record` (pode perder chaves binárias) |
| `encode.ts` | ~148 | ✅ | Suporta `Map` e `Record`. src/ só `Record`. Ordenação por byte raw (correta), detecção de ciclo via `WeakSet` |
| `types.ts` | ~57 | ✅ | `BencodeValue = Map \| Uint8Array \| number \| string \| BencodeValue[]`. src/ usa `BencodeDict = Record` |
| `mod.ts` | ~29 | ✅ | Re-exports |

**Decisão:** Adaptar para src/ mantendo compatibilidade com `BencodeDict` existente, mas adicionando `maxBytes/maxDepth` limits e `BencodeDecodeError`.

#### magnet/ (2 arquivos, ~610 linhas)

| Arquivo | Linhas | Browser? | vs src/utils/magnet.ts (97 linhas) |
|---|---|---|---|
| `magnet.ts` | 587 | ⚠️ `@std/encoding/*` | Suporta **v2** (`urn:btmh`), `buildV2()`, validação robusta, `MagnetParseOptions` (limites), separa `infoHashV1/V2/handshakeHash`. src/ não suporta v2. |

#### metainfo/ (7 arquivos, ~1.369 linhas)

| Arquivo | Linhas | Browser? | Valor |
|---|---|---|---|
| `identity.ts` | 231 | ✅ (Uint8Array path) | **Preserva bytes exatos do info dict** (hash fiel), `calculateInfoHashV2`, `wrapInfoBytes` (BEP 9). src/ faz `sha1(encode(info))` que pode divergir |
| `parser.ts` | 354 | ✅ (Uint8Array path) | Validação completa (BEP 3/12/19/47/52), `TorrentParseError`. src/ é minimalista |
| `types.ts` | 262 | ✅ | Tipos v2/hybrid (`TorrentV2Info`, `TorrentFileTree`, `PieceSizeEnum`). src/ não tem |
| `path.ts` | 21 | ✅ | `isSafePathComponent` (rejeita `.`/`..`/NUL). src/ não valida |
| `v2.ts` | 223 | ✅ | `flattenV2Files`, `validateV2PieceLayers`, `validateHybridLayout`. src/ não tem v2 |
| `generator.ts` | 210 | ❌ Deno FS | **Não portar** |
| `utils.ts` | 255 | ❌ Deno FS | **Não portar** (mas `calcPieceSize` é pura) |

#### peerid/ (6 arquivos, ~778 linhas)

| Arquivo | Linhas | Browser? | vs src/utils/peerid.ts |
|---|---|---|---|
| `peerid.ts` | 204 | ✅ | `encode()`, `encodeAzStyle()`, `encodeShadowStyle()` — src/ só gera Loco hardcoded |
| `util.ts` | 362 | ✅ | 16+ funções (validators, version converters, `randomStr`). src/ tem 4 funções simplificadas |
| `enum.ts` | 121 | ✅ | `enum AZStyleClient`/`ShadowStyleClient`. src/ usa `Record`. **Nota:** src/ tem `"LO": "Loco"`, deno-torrent não |
| `type.ts` | 11 | ✅ | `type Client`. src/ tem `ClientInfo` com campo `style` a mais |
| `constant.ts` | 46 | ✅ | Char arrays para encoding |

#### torrent-parser/ (2 arquivos, ~348 linhas)

| Arquivo | Linhas | Browser? | vs src/utils/parse-torrent.ts |
|---|---|---|---|
| `parser.ts` | 347 | ✅ (Uint8Array) | Mais rigoroso (validação campo a campo, `maxBytes`, `TorrentParseError`). src/ é mais rico em output (infoHash, magnet, files+offsets) |

#### torrent-tracker/ (7 arquivos, ~809 linhas)

| Arquivo | Linhas | Browser? | Valor |
|---|---|---|---|
| `http.ts` | 451 | ✅ fetch-based! | **Cliente HTTP tracker completo**: `HttpTrackerClient`, `buildAnnounceUrl` (percent-encoding correto byte-a-byte), `parseHttpTrackerResponse`. Substitui `HttpTracker` do src/ (que usa `String.fromCharCode` — incorreto p/ bytes >0x7F) |
| `compact.ts` | 68 | ✅ | `parseCompactIpv4Peers`, `parseCompactIpv6Peers`, `deduplicatePeers`. src/ não tem |
| `types.ts` | 86 | ✅ | `PeerEndpoint`, `TrackerAnnounceRequest/Response`, `AnnounceClient`, `TrackerError` |
| `request.ts` | 79 | ✅ | Constantes de limite (`MAX_NUM_WANT=2000`, `MAX_TRACKER_URL_LENGTH=8192`) + `validateAnnounceRequest` |
| `client.ts` | 125 | ✅ | `TrackerClient` unificado (delega p/ HTTP ou futuro UDP) |
| `udp.ts` | 294 | ❌ | `Deno.listenDatagram` — **não portar** |

## 5. Matrizes de paridade (2026-09-04, atualizado após Fase 0)

### peerwire → src/core/ + src/extensions/

| Capacidade | deno-torrent | src/ | Estado |
|---|---|---|---|
| Mensagens BEP 3 (choke..cancel) | ✅ | ✅ | 🟢 |
| `port` (BEP 5) | ✅ | ✅ | 🟢 |
| BEP 6 Fast | ✅ | ✅ | 🟢 |
| BEP 52 v2 hashes | ✅ | ✅ | 🟢 |
| Mensagem `unknown` | ✅ | ✅ | 🟢 |
| Reserved bits nomeados | ✅ | ✅ | 🟢 |
| Negociação gating | ✅ | ✅ | 🟢 |
| Validação `expectedPeerId` | ✅ | ✅ | 🟢 |
| Correlação de requests (Promise) | ✅ | parcial | 🟡 |
| Timeouts (todos) | ✅ | ✅ | 🟢 |
| Keepalive | ✅ | ✅ | 🟢 |
| Backpressure escrita | ✅ | ✅ | 🟢 |
| Limites configuráveis | ✅ | ✅ | 🟢 |
| ExtensionHost BEP 10 completo | ✅ | ✅ | 🟢 |
| ut_metadata c/ hash verify | ✅ | parcial | 🟡 |
| ut_pex | ✅ | ✅ | 🟢 |
| Bitfield spare-bit validation | ✅ | parcial | 🟡 |
| Taxonomia de erros | ✅ | ✅ | 🟢 |
| Ordem de disponibilidade | ✅ | ✅ | 🟢 |

### toolkit → src/crypto/ + src/utils/

| Capacidade | deno-torrent | src/ | Estado |
|---|---|---|---|
| SHA-1 incremental (streaming) | ✅ `createSha1()` | ✅ | 🟢 |
| SHA-512 | ✅ | ✅ | 🟢 |
| MD5 | ✅ puro-TS | ✅ | 🟢 |
| `toHex` helper | ✅ | ✅ | 🟢 |
| `BitArray` (msb0/lsb0, xor, diff) | ✅ | ✅ | 🟢 |
| `BytesUtil.xor/compare/bigint` | ✅ | ✅ | 🟢 |
| `EncodeUtil` validadores | ✅ | ✅ | 🟢 |
| `SimpleBuffer` (cursor R/W) | ✅ | ✅ | 🟢 |
| `ByteReader/Writer` + `readExactly` | ✅ | ✅ | 🟢 |
| `NetUtil` IP/porta/compact | ✅ | ✅ | 🟢 |

### bencode → src/utils/bencode.ts

| Capacidade | deno-torrent | src/ | Estado |
|---|---|---|---|
| decode c/ `maxBytes/maxDepth` | ✅ | ✅ | 🟢 |
| `BencodeDecodeError` | ✅ | ✅ | 🟢 |
| Suporte a `Map` (chaves binárias) | ✅ | ✅ (opt-in) | 🟢 |
| encode c/ `Map` | ✅ | ✅ | 🟢 |
| Ordenação por byte raw | ✅ | ✅ | 🟢 |
| Detecção de ciclo | ✅ `WeakSet` | ✅ | 🟢 |

### magnet → src/utils/magnet.ts

| Capacidade | deno-torrent | src/ | Estado |
|---|---|---|---|
| v2 (`urn:btmh`) | ✅ | ❌ | 🔴 |
| `buildV2()` | ✅ | ❌ | 🔴 |
| `isValid()` validação formal | ✅ | ❌ | 🔴 |
| Limites de recursos | ✅ | ❌ | 🟡 |
| `infoHashV1/V2/handshakeHash` | ✅ | ❌ | 🔴 |

### metainfo → src/utils/parse-torrent.ts

| Capacidade | deno-torrent | src/ | Estado |
|---|---|---|---|
| Preservar bytes exatos do info dict | ✅ | ❌ (re-encode) | 🔴 |
| Info hash v2/hybrid | ✅ | ❌ | 🔴 |
| Validação BEP 3/12/19/47/52 | ✅ | ❌ | 🔴 |
| `TorrentParseError` tipado | ✅ | ❌ | 🔴 |
| Tipos v2 (`TorrentV2Info`, file tree) | ✅ | ❌ | 🔴 |
| `isSafePathComponent` | ✅ | ❌ | 🟡 |
| `wrapInfoBytes` (BEP 9) | ✅ | ❌ | 🟡 |

### torrent-tracker → src/network/tracker.ts

| Capacidade | deno-torrent | src/ | Estado |
|---|---|---|---|
| HTTP tracker (byte-a-byte encoding) | ✅ | ✅ (com bug) | 🔴 |
| Compact peers IPv4 | ✅ | parcial (inline) | 🔴 |
| Compact peers IPv6 | ✅ | ❌ | 🔴 |
| `deduplicatePeers` | ✅ | ❌ | 🟡 |
| Tipos formais de request/response | ✅ | ❌ | 🟡 |
| Constantes de limite | ✅ | parcial | 🟡 |
| `validateAnnounceRequest` | ✅ | ❌ | 🟡 |

### webtorrent.min.js API → src/ (funcionalidades browser)

> A API pública do upstream WebTorrent (bundle `webtorrent.min.js` e
> `docs/webtorrent-api.md`) define funcionalidades browser-first que
> o Loco precisa expor. Esta matriz identifica os gaps.

| Capacidade | webtorrent.min.js | src/ | Estado |
|---|---|---|---|
| **File class** com streaming | ✅ `createReadStream`, `stream()`, `streamTo()`, `streamURL`, `arrayBuffer()`, `blob()`, `getBlobURL()`, `[Symbol.asyncIterator]` | ❌ só `ParsedTorrentFile` (dados, sem métodos) | 🔴 |
| **createServer** / SW integration | ✅ `client.createServer({ controller })` | ❌ SW existe em `service-worker/` mas não integrado ao pkg | 🔴 |
| **torrent.select/deselect/critical** | ✅ Piece selection API | ❌ | 🟡 |
| **torrent.pause/resume** | ✅ | ❌ (só no Swarm) | 🟡 |
| **torrent.addPeer/addWebSeed/removePeer** | ✅ | ❌ | 🟡 |
| **torrent.magnetURI** | ✅ | ❌ | 🟡 |
| **torrent.downloadSpeed/uploadSpeed** | ✅ per-torrent | ❌ | 🟡 |
| **torrent.numPeers** | ✅ | ❌ | 🟡 |
| **torrent.timeRemaining** | ✅ | ❌ | 🟡 |
| **torrent.ratio** | ✅ | ❌ | 🟡 |
| **torrent.torrentFile / torrentFileBlob** | ✅ | ❌ | 🟡 |
| **client.downloadSpeed/uploadSpeed** | ✅ aggregate | ❌ | 🟡 |
| **client.progress/ratio** | ✅ aggregate | ❌ | 🟡 |
| **client.throttleDownload/throttleUpload** | ✅ | ❌ | 🟡 |
| **WEBRTC_SUPPORT** static | ✅ | ❌ | 🟡 |
| **Web Seeds (BEP 19)** | ✅ | ❌ | 🟡 |
| Torrent events: `infoHash`, `warning`, `noPeers`, `idle`, `wire` | ✅ | parcial | 🟡 |
| File events: `stream`, `iterator`, `done` | ✅ | ❌ | 🟡 |
| File: `select`, `deselect`, `includes(piece)` | ✅ | ❌ | 🟡 |
| Piece: `length`, `missing` | ✅ | ❌ | 🟡 |

## 6. Plano de ação por fases

### Fase 0 — Fundação ✅ CONCLUÍDA

Ordem: bencode → crypto → bytes/bitfield → io → net → errors

| # | Tarefa | Status | Arquivo |
|---|---|---|---|
| 0.1 | Bencode: `maxBytes/maxDepth`, `BencodeDecodeError`, suporte `Map`, byte-raw sort, ciclo | ✅ | `src/utils/bencode.ts` |
| 0.2 | Crypto: SHA-1 incremental (`createSha1`), `md5`, `toHex`, `sha512` | ✅ | `src/crypto/hasher.ts` |
| 0.3 | `BitArray` com `BitOrder` + `xor`/`diff`/`fromBigInt` | ✅ | `src/utils/bit-array.ts` |
| 0.4 | `ByteReader/Writer` + `readExactly`/`writeAll` + erros | ✅ | `src/utils/byte-io.ts` |
| 0.5 | `BytesUtil.xor/compare/bigint/chunkBytes` | ✅ | `src/utils/buffer.ts` |
| 0.6 | `EncodeUtil` validadores + encode/decode base32/64/hex | ✅ | `src/utils/encoding.ts` |
| 0.7 | `SimpleBuffer` (cursor R/W, compactação) | ✅ | `src/utils/simple-buffer.ts` |
| 0.8 | `NetUtil` IP/porta/compact peer (sem `getMacAddr`) | ✅ | `src/utils/net.ts` |
| 0.9 | Taxonomia de erros `PeerWireError`/`Protocol`/`Eof`/`Timeout`/`RequestRejected` | ✅ | `src/utils/errors.ts` |

### Fase 1 — Core Protocol (peerwire) ✅ CONCLUÍDA

Depende de: Fase 0 (bencode, ByteReader/Writer, BitArray, errors)

| # | Tarefa | Origem | Destino | Impacto |
|---|---|---|---|---|
| 1.1 | Codec completo de mensagens (20 tipos + `unknown`) | `peerwire/message.ts` + `constants.ts` | `src/core/message.ts` | Base para tudo |
| 1.2 | Handshake com reserved bits nomeados + encode/decode | `peerwire/handshake.ts` + `constants.ts` | `src/core/handshake.ts` | Gating por capability |
| 1.3 | Wire internals: máquina de estados, timeouts, limites, keepalive | `peerwire/peer_wire.ts` | Internals de `src/core/wire.ts` | Proteção contra peers maliciosos |
| 1.4 | Validação de ordem de disponibilidade + `expectedPeerId` | `peerwire/peer_wire.ts` | Internals de `src/core/wire.ts` | Conformidade de protocolo |
| 1.5 | Backpressure de escrita + `maxQueuedWriteBytes` | `peerwire/peer_wire.ts` | Internals de `src/core/wire.ts` | Estabilidade |
| 1.6 | `ExtensionHost` BEP 10 completo (IDs direcionais, re-handshake, `waitForPeerHandshake`) | `peerwire/extension.ts` | `src/core/extension.ts` | Base robusta p/ extensões |

### Fase 2 — Metadata & Discovery

Depende de: Fase 0 + Fase 1

| # | Tarefa | Origem | Destino | Impacto |
|---|---|---|---|---|
| 2.1 | Magnet v2 (`urn:btmh`, `buildV2`, validação, `infoHashV1/V2`) | `magnet/magnet.ts` | `src/utils/magnet.ts` | BitTorrent v2 |
| 2.2 | Metainfo identity: preservar bytes exatos, `calculateInfoHashV2`, `wrapInfoBytes` | `metainfo/identity.ts` | `src/utils/parse-torrent.ts` | Hash fiel, v2/hybrid |
| 2.3 | Metainfo parser: validação rigorosa (BEP 3/12/19/47/52) + `TorrentParseError` | `metainfo/parser.ts` + `torrent-parser/` | `src/utils/parse-torrent.ts` | Robustez |
| 2.4 | Tipos v2 (`TorrentV2Info`, `TorrentFileTree`, `PieceSizeEnum`) | `metainfo/types.ts` | `src/utils/torrent-types.ts` | v2 type safety |
| 2.5 | HTTP tracker correto (byte-a-byte percent-encoding, compact IPv4+IPv6, dedupe) | `torrent-tracker/http.ts` + `compact.ts` | `src/network/tracker.ts` | Fix bug, IPv6, limits |
| 2.6 | Tipos formais de tracker + validação de request | `torrent-tracker/types.ts` + `request.ts` | `src/network/tracker.ts` | Type safety |

### Fase 3 — Advanced Protocol

Depende de: Fase 1 + Fase 2

| # | Tarefa | Origem | Destino | Impacto |
|---|---|---|---|---|
| 3.1 | BEP 6 Fast: `suggestPiece/haveAll/haveNone/rejectRequest/allowedFast` | `peerwire/message.ts` + `peer_wire.ts` | `src/core/wire.ts` + `message.ts` | Fast peers |
| 3.2 | BEP 52 v2: `hashRequest/hashes/hashReject` | `peerwire/message.ts` + `peer_wire.ts` | `src/core/wire.ts` + `message.ts` | BitTorrent v2 |
| 3.3 | `ut_metadata` melhorado: verificação SHA-1/256, pipelining, per-block timeout | `peerwire/ut_metadata.ts` | `src/extensions/ut-metadata.ts` | Integridade + performance |
| 3.4 | `peerid` melhorado: `encode()` genérico, validators, version converters | `peerid/peerid.ts` + `util.ts` | `src/utils/peerid.ts` | Flexibilidade (manter `"LO": "Loco"`) |
| 3.5 | `Bitfield` com spare-bit validation (manter `grow`) | `peerwire/bitfield.ts` + `BitArray` | `src/core/bitfield.ts` | Conformidade |

### Fase 4 — Browser API (funcionalidades da webtorrent.min.js)

> Funcionalidades da API pública do upstream WebTorrent que faltam no Loco.
> Referência: `docs/webtorrent-api.md` + análise do bundle `webtorrent.min.js`.

Depende de: Fase 1 + Fase 2

| # | Tarefa | Descrição | Destino | Impacto |
|---|---|---|---|---|
| 4.1 | **File class** com `createReadStream`, `stream()` (W3C ReadableStream), `arrayBuffer()`, `blob()`, `[Symbol.asyncIterator]` | Substituir `ParsedTorrentFile` por classe viva que acessa o store | `src/core/file.ts` | 🔴 Crítico — streaming de mídia no browser |
| 4.2 | **File.streamTo(elem)** + **File.streamURL** | Expor URL de stream para `<video>`/`<audio>` via SW; depende de createServer | `src/core/file.ts` | 🔴 Crítico — playback no browser |
| 4.3 | **File.select/deselect/includes(piece)** | Piece selection por arquivo | `src/core/file.ts` | 🟡 Importante |
| 4.4 | **File events**: `stream`, `iterator`, `done` | Eventos no ciclo de vida do stream | `src/core/file.ts` | 🟡 Importante |
| 4.5 | **createServer / SW integration** | Integrar `service-worker/src/sw/webtorrent.ts` ao pkg; `client.createServer({ controller })` | `src/core/server.ts` | 🔴 Crítico — serve URLs para o browser |
| 4.6 | **Torrent.select/deselect/critical** | Priorização de pieces no Torrent | `src/core/torrent.ts` | 🟡 Importante |
| 4.7 | **Torrent.pause/resume** | Pausar retomar download | `src/core/torrent.ts` | 🟡 Importante |
| 4.8 | **Torrent.addPeer/addWebSeed/removePeer** | Gerenciamento manual de peers | `src/core/torrent.ts` + `src/network/` | 🟡 Importante |
| 4.9 | **Torrent properties**: `magnetURI`, `downloadSpeed`, `uploadSpeed`, `numPeers`, `timeRemaining`, `ratio`, `torrentFile`, `torrentFileBlob` | Getters computados + exposed state | `src/core/torrent.ts` | 🟡 Importante |
| 4.10 | **Torrent events**: `infoHash`, `warning`, `noPeers`, `idle`, `wire` | Eventos faltantes | `src/core/torrent.ts` | 🟡 Importante |
| 4.11 | **Client properties**: `downloadSpeed`, `uploadSpeed`, `progress`, `ratio` (agregados) | Soma de todos os torrents ativos | `src/mod.ts` | 🟡 Importante |
| 4.12 | **Client.throttleDownload/throttleUpload** | Limitar velocidade global | `src/mod.ts` | 🟢 Baixo |
| 4.13 | **WEBRTC_SUPPORT** static | Detectar suporte a WebRTC no browser | `src/mod.ts` | 🟢 Baixo |
| 4.14 | **Web Seeds (BEP 19)** | Fetch de dados via HTTP como peer alternativo | `src/network/web-seed.ts` (novo) | 🟡 Importante |
| 4.15 | **Piece class** com `length`, `missing` | Objeto Piece exposto na API | `src/core/piece.ts` (novo) | 🟢 Baixo |

### Fase 5 — Futuro (bloqueados, requer decisão arquitetural)

| # | Tarefa | Bloqueante | Alternativa browser |
|---|---|---|---|
| 5.1 | DHT (Kademlia) | UDP sockets (`Deno.listenDatagram`) | WebRTC DataChannel ou WebTransport p/ relay |
| 5.2 | uTP | Raw UDP (`Deno.NetAddr`) | WebTransport datagrams (Chrome 120+) |
| 5.3 | Torrent generator | Filesystem (`Deno.stat`, `Deno.open`) | File API / OPFS + streaming hasher |

## 7. Decisões arquiteturais vigentes

- **`src/core/wire.ts` segue como fachada de eventos.** A robustez do
  `peer_wire.ts` (estados, timeouts, correlação) entra como internals,
  preservando os eventos `handshake/choke/unchoke/have/bitfield/request/
  piece/cancel/extended/error`.
- **BEPs alvo de incorporação**: 5 (port), 6 (Fast), 10 (ExtensionHost
  completo), 52 (v2 hashes). BEP 9/11 já existem e serão endurecidos.
- **Sem novas dependências npm** em `src/` sem aprovação explícita.
- **torrent-generator**: não portar (Deno-only, não necessário para PWA).
- **torrent-dht + utp**: bloqueados por UDP. A lógica Kademlia (Bucket,
  RoutingTable, etc.) é browser-pura, mas o transporte não. Requer decisão
  sobre relay via WebRTC/WebTransport para viabilizar no browser.
- **File class é a prioridade browser.** O upstream WebTorrent expõe uma
  classe `File` viva com streaming (ReadableStream, streamTo, streamURL,
  arrayBuffer, blob, async iterator). `ParsedTorrentFile` é apenas dados —
  a transição para `src/core/file.ts` com acesso ao ChunkStore é essencial
  para media playback no browser.
- **createServer via Service Worker.** O Loco já possui
  `service-worker/src/sw/webtorrent.ts` com a ponte MessageChannel para
  streaming sob demanda. A integração com o pkg webtorrent será via
  `client.createServer({ controller: ServiceWorkerRegistration })`, que
  inicializa a ponte e habilita `file.streamURL` e `file.streamTo()`.
- Comentários de documentação seguem o idioma já presente no arquivo (o
  pacote mistura PT-BR e EN; não reescrever comentários existentes só por
  idioma).

## 8. Proibições rápidas

- ❌ Copiar arquivos inteiros de `deno-torrent/` sem adaptar imports e APIs.
- ❌ Importar `@deno-torrent/*` em qualquer arquivo de `src/`.
- ❌ Remover eventos, exports ou opções públicas existentes.
- ❌ Introduzir `Deno.*`/`node:*`/`process.*` fora de `tests/`.
- ❌ "Simplificar" removendo validações de protocolo sem justificativa.
- ❌ Portar `MultiFileReader`, `getMacAddr()`, `torrent-generator/`.
- ❌ Portar `torrent-dht/` ou `utp/` sem resolver o bloqueio de transporte UDP.
