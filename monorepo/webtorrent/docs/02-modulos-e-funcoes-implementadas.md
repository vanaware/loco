# /loco/monorepo/webtorrent/docs/02-modulos-e-funcoes-implementadas.md

# Módulos e Funções Implementadas (Fase 1 e 2)

Este documento cataloga todas as funções, classes e tipos que foram implementados, refatorados e validados por testes unitários no pacote `@loco/webtorrent`.

---

## 🛠️ 1. Utilitários Básicos (`src/utils/`)

### `buffer.ts`
Helpers para manipulação de `Uint8Array`, substituindo o `Buffer` do Node.js com foco em performance e compatibilidade com o protocolo BitTorrent.
- `alloc(size: number): Uint8Array` - Cria um array preenchido com zeros.
- `from(input, encoding): Uint8Array` - Cria um array a partir de string (hex/utf8), array ou ArrayBuffer.
- `concat(arrays, totalLength?): Uint8Array` - Concatena múltiplos arrays de forma eficiente (calculando o tamanho total antes da alocação).
- `toString(buf, encoding, start, end): string` - Converte fatias do buffer para string hex ou utf8.
- `equals(a, b): boolean` - Comparação byte a byte de dois buffers.
- `readUInt32BE(buf, offset): number` - Leitura de inteiro sem sinal de 32 bits (Big-Endian), essencial para o Wire Protocol.
- `writeUInt32BE(buf, value, offset): void` - Escrita de inteiro sem sinal de 32 bits (Big-Endian).

### `event-target.ts`
Substituto tipado para o `EventEmitter` do Node.js, utilizando a API nativa `EventTarget` do browser.
- `class TypedEventTarget<Events>` - Classe base genérica.
  - `on(type, listener)` - Registra um listener.
  - `once(type, listener)` - Registra um listener que se remove após a primeira execução.
  - `off(type, listener)` - Remove um listener.
  - `emit(type, detail?)` - Dispara um evento com dados tipados.

---

## 🔐 2. Criptografia (`src/crypto/`)

### `hasher.ts`
Wrapper para a API nativa `crypto.subtle` do browser/Deno.
- `sha1(data: Uint8Array): Promise<string>` - Calcula o hash SHA-1 (usado para verificação de peças e infoHash v1). *Nota: Utiliza `.slice()` no buffer para satisfazer a tipagem estrita de `ArrayBuffer` do Deno.*
- `sha256(data: Uint8Array): Promise<string>` - Calcula o hash SHA-256 (para infoHash v2 e extensões futuras).
- `sha1Sync(data: Uint8Array): string` - Lança erro intencionalmente, pois WebCrypto é assíncrono no browser.

### `random.ts`
Geração de números aleatórios criptograficamente seguros.
- `randomBytes(size: number): Uint8Array` - Gera um array de bytes aleatórios.
- `generateId(): string` - Gera um ID de 40 caracteres hexadecimais (usado para `peerId` ou `nodeId`).

---

## 📦 3. Protocolo e Parsing (`src/utils/`)

### `bencode.ts`
Implementação pura de Bencode (Encoder/Decoder) com suporte a tipos recursivos e BigInt.
- **Tipos:** `BencodeValue` (string | number | bigint | Uint8Array | BencodeList | BencodeDict).
- `decode(data: Uint8Array): BencodeValue` - Parser de descida recursiva (Zero-Copy via `subarray`). Inclui heurística para retornar `string` (se for UTF-8 válido) ou `Uint8Array` (se contiver bytes binários como hashes).
- `encode(data: BencodeValue): Uint8Array` - Codificador que **garante a ordenação lexicográfica das chaves dos dicionários**, requisito crítico para que o `info_hash` do torrent seja consistente.

### `magnet.ts`
Parser e codificador de URIs Magnéticas.
- `parseMagnet(uri: string): ParsedMagnet` - Extrai `infoHash` (hex e buffer), `trackers`, `webSeeds`, `name`, etc. Suporta decodificação nativa de Base32 para Hex sem dependências externas.
- `encodeMagnet(parsed: Omit<ParsedMagnet, "magnetUri">): string` - Reconstrói a URI magnética a partir de um objeto.

### `parse-torrent.ts`
Parser unificado que aceita múltiplos formatos de entrada e retorna uma estrutura padronizada.
- `parseTorrent(torrentId: string | Uint8Array | ParsedTorrent): Promise<ParsedTorrent>`
  - Se for `string` (Magnet ou InfoHash): Retorna metadados básicos (arquivos desconhecidos até o handshake).
  - Se for `Uint8Array` (Arquivo .torrent): Decodifica o Bencode, calcula o `infoHash` via SHA-1 do dicionário `info`, e extrai a lista de arquivos, tamanhos, offsets e trackers.

---

## 💾 4. Armazenamento (Chunk Stores) (`src/storage/`)

Implementam a interface compatível com `abstract-chunk-store`, permitindo troca transparente entre memória e disco.

### `memory-chunk-store.ts`
Fallback em memória para ambientes onde o OPFS não está disponível ou para testes.
- `class MemoryChunkStore`
  - `get(index, opts?, cb?)` - Recupera um chunk. Suporta `offset` e `length` para fatiamento.
  - `put(index, buf, cb?)` - Armazena um chunk, validando o tamanho esperado.
  - `close(cb?)` / `destroy(cb?)` - Limpa o mapa de chunks da memória.

### `opfs-chunk-store.ts`
Armazenamento persistente utilizando o **Origin Private File System (OPFS)** do navegador.
- `class OPFSChunkStore`
  - Construtor aceita `rootDir: FileSystemDirectoryHandle` para isolamento por `infoHash`.
  - `get(index, opts?, cb?)` - Lê o arquivo `<index>.chunk` do OPFS. Se o arquivo não existir, retorna erro com propriedade `notFound: true`.
  - `put(index, buf, cb?)` - Escreve o chunk no OPFS usando `FileSystemWritableFileStream`. *Nota: Utiliza `.slice()` no buffer para garantir compatibilidade com `ArrayBuffer` estrito.*
  - `close(cb?)` - Fecha a referência ao diretório (não deleta arquivos).
  - `destroy(cb?)` - Itera e deleta todos os arquivos `.chunk` dentro do diretório do torrent, limpando o armazenamento.

---

## ✅ Status dos Testes
Todos os módulos acima possuem suítes de testes correspondentes na pasta `/tests/` (`utils_test.ts`, `bencode_test.ts`, `magnet_test.ts`, `parse-torrent_test.ts`, `chunk-store_test.ts`), validando:
- Codificação/Decodificação roundtrip.
- Manipulação correta de tipos (especialmente a distinção entre string e Uint8Array no Bencode).
- Validação de tamanhos de chunks e tratamento de erros (ex: chunk não encontrado, armazenamento fechado).
- Conformidade com o type-checking rigoroso do Deno 2.x.