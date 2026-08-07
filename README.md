
# 📡 Loco – Mensageiro PWA Descentralizado

## 1. Visão Geral

O Loco é um PWA (Progressive Web App) de mensagens descentralizado com interface Material Design 3, comunicação híbrida (Web Push + WebRTC) e arquitetura de armazenamento robusta offline-first. O app prioriza a privacidade, o controle granular de dados pelo usuário e a resistência à evicção automática pelo navegador.

O núcleo da aplicação implementa a comunicação utilizando a API **Web Push** (especificamente via FCM) como transporte. Dois ou mais navegadores trocam mensagens diretamente, sem um banco de dados central para armazenar mensagens ou gerenciar contatos.

Cada navegador atua como um **ponto autônomo**:

* **Emissor**: envia mensagens criptografadas para outro usuário.
* **Receptor**: recebe mensagens, emite recibos de entrega (handshakes) e pode responder.

A infraestrutura mínima é um **servidor proxy** (Deno) que fornece uma chave pública RSA usada para cifrar a chave privada VAPID durante a troca de perfis e reencaminha as requisições push ao serviço (FCM).

---

## 2. Regras de Desenvolvimento (Para Devs e Agentes IA)

Para manter a sanidade da base de código e garantir a performance, siga estas regras rigorosamente:

* **Runtime e Ecossistema:** Obrigatório o uso do Deno 2.x. Nunca usar Node, npm ou dependências que exijam Node nativo. O build é feito de forma customizada em `build.ts` usando `Deno.bundle()`.
* **Zero `localStorage`:** É estritamente proibido o uso de `localStorage`. Todo e qualquer dado deve passar pelo IndexedDB via `src/utils/db-helpers.ts` (`idb-keyval`) ou OPFS.
* **Gerenciamento de Estado:** Os Signals devem ser importados exclusivamente de `@preact/signals`. Nunca instancie signals em nível de módulo global se eles forem exclusivos de um componente; crie-os dentro do escopo adequado.
* **Documentação JSDoc Tática:** Toda função utilitária complexa (criptografia, empacotamento binário, JWT, manipulação de banco) deve conter bloco JSDoc explicando **o porquê** da abordagem, precondições de chamadas e formato de retorno.
* **Isolamento Assíncrono:** Todas as operações de leitura/escrita de dados devem ser `async/await`. Processamentos pesados (WebTorrent, I/O de arquivos, criptografia massiva) devem rodar em Web Workers (`p2p-transfer.worker.js`).
* **Degradação Graciosa (Fallback):** O sistema deve tentar conexões P2P (`RTCDataChannel`) primeiro. O Web Push atua como fallback silencioso e garantido.

---

## 3. Conceitos Fundamentais

### 3.1. Perfil (ProfileConfig)

A identidade de um usuário, armazenada no IndexedDB (`AppConfig_DB`). Pode ser compartilhada através de um **JWT** (JSON Web Token) com a claim `sub: "contact"` ou via **QR Code Binário**.

```json
{
  "iss": "email@exemplo.com",       // Identificador único do dono
  "sub": "contact",                  // Tipo de token
  "nm": "Nome do Usuário",          // Nome legível
  "kid": { ... },                   // Chave pública VAPID (ECDSA P-256) em JWK
  "p": { ... },                     // Chave pública RSA (RSA-OAEP-256) em JWK
  "s": {                            // Subscription do Web Push
    "endpoint": "[https://fcm.googleapis.com/](https://fcm.googleapis.com/)...",
    "keys": {
      "p256dh": "base64...",
      "auth": "base64..."
    },
    "k": "base64..."                // Chave privada VAPID cifrada (envelope)
  },
  "iat": 1738765432                 // Timestamp de emissão
}

```

**Segurança VAPID:** O campo `k` contém a chave privada VAPID cifrada (AES-GCM + RSA-OAEP) com a chave pública do servidor proxy. Apenas o servidor pode decifrá-la para disparar o push, garantindo que ela nunca vaze em texto puro. Ao compartilhar o perfil, o sistema recria automaticamente esse envelope.

### 3.2. Contato (Contact)

Quando um usuário recebe uma mensagem ou importa um perfil via QR Code ou link, o emissor é salvo localmente no banco `BrowserB_Contatos_DB`. Contatos importados via link/QR Code recebem a flag `homologado: true`.

```typescript
interface Contato {
  publicKeyVapid: JsonWebKey;      // Chave pública VAPID (ECDSA)
  email: string;
  nome: string;
  publicKeyRSA: JsonWebKey;        // Chave pública RSA (para cifrar a resposta)
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  vapidPrivateKey: string;         // Chave privada VAPID cifrada
  homologado: boolean;              // Controle de lista branca
  createdAt: number;
  updatedAt: number;
}

```

### 3.3. Empacotamento de Convites (QR Code Binário vs Link Web)

Para viabilizar a exibição de convites em QR Codes sem estourar o limite de bits da matriz (máximo de 2.953 bytes em nível L), o Loco implementa dois formatos complementares gerenciados por `share-utils.ts`:

1. **QR Code Binário (`gerarPayloadQrCodeCompacto` / `cqr`):**
* Elimina chaves do JSON usando uma tupla ordenada de 11 posições.
* Compacta o módulo RSA (`n`) e envelopes Hex em bytes/Base64Url diretos.
* Substitui prefixos longos de endpoint do Google (`https://fcm.googleapis.com/fcm/send/`) por tokens curtos (`1:`).
* Aplica compressão **GZIP (`fflate`)** antes de gerar a matriz.
* *Resultado:* Redução de ~3.000 caracteres para menos de 650 bytes.


2. **Link Copiado para Web/WhatsApp (`gerarLinkConviteWeb` / `cjwt`):**
* Cria um JWT assinado com a chave VAPID ECDSA do usuário.
* Compacta o JWT completo via GZIP para encurtar a URL gerada (`/share.html?cjwt=...`).



### 3.4. Mensagens e Filas

As mensagens transitam dentro de um JWT assinado e comprimido para respeitar o limite de 4.096 bytes do Web Push.

* **Mensagem Recebida:** Possui `id`, `contatoPublicKeyVapid` (Hash SHA-256 da chave VAPID), `conteudo`, `status` (`'nao_lida'`, `'lida'`, `'notificada'`) e timestamp.
* **Mensagem Enviada (Fila):** Mantida offline-first com os campos `contatoHash`, `conteudo`, `status` (`'pendente'`, `'enviando'`, `'enviada'`, `'falha'`, `'entregue'`), e limite de `MAX_TENTATIVAS = 3`.

### 3.5. Handshake (Confirmação de Entrega)

O receptor de uma mensagem (`sub: "msg"`) notifica o emissor invisivelmente usando um JWT do tipo `sub: "hand"`.

```typescript
interface Handshake {
  id: string;                     // ID de 12 caracteres (Web Crypto API)
  mensagemId: string;             // ID da mensagem confirmada
  tipo: 'confirmacao_entrega';   // Expansível para leitura, etc.
  direcao: 'out' | 'in';          // Fluxo de saída ou entrada
  status: 'pendente' | 'enviado' | 'falha' | 'entregue';
  tentativas: number;
  payload: any;
  createdAt: number;
  updatedAt: number;
}

```

---

## 4. Armazenamento: IndexedDB e OPFS

A aplicação usa uma arquitetura de dados híbrida para resistir a limitações do navegador.

### Bancos de Dados (`idb-keyval`)

| Store (`DB_NAMES`) | Chave Primária | Entidade | Descrição |
| --- | --- | --- | --- |
| `AppConfig_DB` | `"profile"` | `ProfileConfig` | Store unificada com perfil, chaves e subscriptions. |
| `BrowserB_Contatos_DB` | Hash SHA-256 (hex) | `Contato` | Contatos. Chave é hash para evitar erros de serialização. |
| `BrowserB_MensagensRecebidas_DB` | ID da Mensagem | `MensagemRecebida` | Histórico local de entrada. |
| `BrowserA_MensagensEnviadas_DB` | ID da Mensagem | `MensagemEnviada` | Fila local de saída. |
| `Handshake_DB` | ID do Handshake | `Handshake` | Rastreamento de confirmações e recibos. |

### Origin Private File System (OPFS) - *Em Implementação*

Destinado a arquivos binários grandes (fotos, vídeos, PDF) recebidos ou enviados via WebTorrent/WebRTC. Arquivos serão nomeados como `{messageId}.{ext}` e o usuário poderá excluí-los granularmente sem afetar o histórico de texto no IndexedDB.

---

## 5. Fluxos Detalhados (Engenharia)

**1. Geração do Perfil (`gerarProfileCompleto`)**
Solicita permissão de notificação -> Registra Service Worker -> Gera pares ECDSA (VAPID) e RSA-OAEP (E2E) -> Obtém Subscription no PushManager -> Busca chave pública do Proxy -> Cifra chave VAPID privada (Envelope) -> Salva no IndexedDB.

**2. Leitura e Adição de Contato (`processarQualquerConvite`)**
Lê parâmetro da URL ou câmera (`cqr`, `cjwt` ou `jwt`) -> Descomprime payload GZIP -> Identifica se é tupla binária de QR Code ou JWT -> Reconstrói chaves JWK e envelope VAPID -> Exibe preview do contato -> Salva no IndexedDB com `homologado: true`.

**3. Envio de Mensagem (`processarFilaEnvio` no SW)**
Interface salva na fila como `'pendente'` e avisa o SW -> SW acorda e filtra fila -> Monta payload e cifra com AES-GCM + RSA-OAEP -> Constrói JWT (`sub: "msg"`) -> Envia payload, subscription e envelope VAPID para `/api/proxy-push` -> Atualiza status local para `'enviada'`.

**4. Recebimento e Handshake (`processarMensagemRecebida`)**
Evento push acorda o SW -> Valida JWT e `aud` -> Decifra envelope -> Atualiza ou cria contato -> Salva mensagem recebida -> Cria registro `'pendente'` no `Handshake_DB` -> Aciona `processarFilaHandshake()` para enviar recibo ao emissor original via `/api/proxy-push` (`sub: "hand"`).

**5. Confirmação de Entrega (Recepção do Handshake)**
Evento push acorda o emissor original -> SW valida JWT (`sub: "hand"`) -> Atualiza `Handshake_DB` para `'entregue'` -> Encontra a mensagem original e altera status final para `'entregue'` -> Manda `postMessage` atualizando a UI caso o usuário esteja online.

---

## 6. Estrutura do Projeto

| Caminho / Arquivo | Responsabilidade Principal |
| --- | --- |
| `src/app.tsx` | Ponto de entrada SPA. Renderiza sidebar, timeline de chat e o Modal de Debug (`<md-dialog>`). |
| `src/profile.tsx` / `.html` | Página isolada de criação, atualização de perfil e exibição do QR Code de convite. |
| `src/share.tsx` / `.html` | Leitor de QR Code (câmera via `BarcodeDetector`) e importador de convites. |
| `src/logout.tsx` / `.html` | Página de expurgo de dados, destruição de chaves e limpeza de Web Storage/Service Worker. |
| `src/components/ChatSection.tsx` | Timeline unificada de mensagens enviadas e recebidas com formatador de datas/horas. |
| `src/components/ContatosSection.tsx` | Lista de contatos homologados com rolagem flexível e ações de exclusão. |
| `src/components/DebugPanel.tsx` | Painel de visualização de logs em tempo real (renderizado em modal na SPA). |
| `src/stores/` | Gerenciamento de estado reativo via Preact Signals (`profileStore`, `contatosStore`, `mensagensStore`). |
| `src/utils/share-utils.ts` | **Núcleo de Convites:** Empacotador binário de QR Code (`cqr`), gerador de links (`cjwt`) e parser unificado. |
| `src/utils/jwt-helpers.ts` | Criação, verificação e decodificação de JWTs ES256 (ECDSA) e helpers de Base64Url. |
| `src/utils/id-utils.ts` | Gerador de IDs de 12 caracteres browser-safe utilizando a Web Crypto API nativa. |
| `src/utils/db-helpers.ts` | Camada de persistência IndexedDB via `idb-keyval` para perfis, contatos e mensagens. |
| `src/utils/push-utils.ts` | Criptografia híbrida (AES-GCM + RSA-OAEP) e transporte via proxy `/api/proxy-push`. |
| `src/utils/profile-utils.ts` | Orquestrador de geração de chaves VAPID/RSA e registro de Web Push Subscription. |
| `src/service-worker.ts` | Orquestrador do SW. Importa e ativa os módulos de cache, push e filas. |
| `src/sw/push.ts` | Router do SW. Faz a triagem do push pela claim `sub` do JWT (`msg` ou `hand`). |
| `src/sw/sw-mensagens.ts` | Descriptografa mensagens de entrada e processa a fila de envio de saída. |
| `src/sw/sw-handshakes.ts` | Processa e envia confirmações de entrega automáticas. |
| `main.ts` | Servidor Deno HTTP. Serve arquivos estáticos da `dist/` e atua como proxy push/CORS. |
| `build.ts` | Bundler do projeto. Copia estáticos/HTMLs, executa o `Deno.bundle()` nos TSX e injeta assets no SW. |

---

## 7. Build e Execução

Use os comandos integrados definidos no `deno.json`.

**Gerar o Bundle de Produção (HTMLs, JS Client e Service Worker):**

```bash
deno task build

```

**Iniciar Servidor Local:**

```bash
deno task start

```

*Disponível em `http://localhost:8000`. Testes de push exigem duas abas/navegadores em instâncias separadas.*

**Rodar em Modo de Desenvolvimento (Watch):**

```bash
deno task dev

```

---

## 8. Roadmap & Integrações Planejadas

A aplicação está transicionando de um protótipo estrito de Web Push para um mensageiro moderno abrangente:

* **P2P First (WebRTC & WebTorrent):** Implementação de `RTCDataChannel` para envio de texto direto, deixando o push apenas para acordar o Worker. Criação do `p2p-transfer.worker.js` para tráfego pesado focado diretamente no disco virtual (OPFS).
* **Media & APIs PWA:** Picture-in-Picture nativo para chamadas (`CallScreen.tsx`) e `Screen Wake Lock` durante uploads ativos.
* **Proteção de Evicção:** Automação de solicitações `navigator.storage.persist()` para assegurar os dados do usuário.
* **Web Share Target:** Permitir que o Loco receba conteúdos diretos do Android share sheet.
* **Backup (fflate):** Exportação completa do estado (IDB + OPFS) criptografada em um arquivo ZIP.

---

## 9. Glossário e Troubleshooting

* **Evicção:** Processo em que o sistema operacional apaga o IndexedDB para liberar espaço em disco. Evitado via `navigator.storage.persist()`.
* **VAPID:** *Voluntary Application Server Identification*. Assegura ao provedor (FCM) quem está emitindo o push.
* **Rate Limiting:** Falhas `HTTP 429` do FCM ao sobrecarregar a fila de Push. Resolvido alternando para WebRTC quando a aba estiver ativa.
* **`channel closed` no build:** Ocorre se um arquivo tsx tiver erro de sintaze, o `Deno.bundle()` no `build.ts` nao tem erros, funciona perfeitamente.

