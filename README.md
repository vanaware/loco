
# 📡 Loco — Mensageiro PWA Descentralizado

O **Loco** é um Progressive Web App (PWA) de mensagens instantâneas descentralizado, focado em privacidade absoluta, criptografia ponto a ponto (E2EE) e arquitetura *offline-first*. A aplicação opera sem um banco de dados centralizado de mensagens ou contatos, utilizando comunicação híbrida (**Web Push via FCM** e **WebRTC P2P**).

---

## 1. Visão Geral e Filosofia

No Loco, **cada navegador é um nó autônomo** que mantém seu próprio histórico local e suas próprias chaves criptográficas.

* **Sem Servidor de Mensagens:** O servidor backend (Deno) atua exclusivamente como um *proxy cego* de entrega de notificações Web Push e provedor de infraestrutura de chaves temporárias para envelopes.
* **Privacidade por Design:** O servidor não armazena logs de conversas, lista de contatos ou conteúdo de mensagens.
* **Resistência à Evicção:** Os dados do usuário residem unicamente no dispositivo local através do IndexedDB e Origin Private File System (OPFS).

```
+------------------+         +-------------------+         +------------------+
|  Nó A (Emissor)  |         |   Servidor Proxy  |         |  Nó B (Receptor) |
|  (IndexedDB/SW)  |         |   Deno + WebPush  |         |  (IndexedDB/SW)  |
+--------+---------+         +---------+---------+         +--------+---------+
         |                             |                            |
         | --- 1. Envia JWT Cifrado -> |                            |
         |    (com VAPID Envelope)     | --- 2. Repassa via FCM ->  |
         |                             |    (Gateway WebPush)       |
         |                             |                            | --- 3. Recebe Push
         |                             |                            |     e Decifra E2E
         |                             |                            |
         | <--- 4. Handshake Recibo (sub: "hand") via Proxy -------- |

```

---

## 2. Padrões e Regras de Desenvolvimento

### 2.1. Diretrizes Principais

1. **Runtime Único (Deno 2.x):** Proibido o uso de Node.js, `npm` ou pacotes com dependências C++ nativas. Todo o código do cliente e servidor roda sobre a API Web Padrão e módulos ESM compatíveis com Deno.
2. **Zero `localStorage`:** É terminantemente proibido utilizar `localStorage` por conta de limitações de performance e bloqueios síncronos da I/O thread. Utilize a camada IndexedDB (`src/utils/db-helpers.ts`) via `idb-keyval`.
3. **Gerenciamento de Estado Reativo:** A reatividade da interface usa Preact Signals (`@preact/signals`).
4. **Isolamento de Processamento:** Tarefas computacionalmente intensivas (compressão, geração de chaves, parsing de matrizes QR) não devem bloquear a thread principal da UI.

---

### 2.2. Padrão Obrigatório de JSDoc Tático

Todas as funções utilitárias em `src/utils/` e gerenciadores no Service Worker devem incluir documentação no padrão **JSDoc**. O objetivo do JSDoc no projeto não é apenas tipar parâmetros, mas explicar **o porquê de decisões táticas**, limites de payload e precondições de segurança.

#### Exemplo de Padrão JSDoc Adotado no Projeto:

```typescript
/**
 * Empacota o perfil do usuário em um formato binário de ultra-alta densidade
 * reduzindo o tamanho final para caber confortavelmente em QR Codes (nível L).
 * 
 * @description
 * Converte o módulo RSA, chaves VAPID e envelopes para bytes brutos (Uint8Array),
 * tokeniza domínios conhecidos do FCM (`1:`) e aplica compressão GZIP via fflate.
 * 
 * @param {ProfileConfig} profile - Objeto de perfil completo do usuário contendo as chaves públicas.
 * @returns {string} String codificada em Base64Url pronta para renderização em matriz QR.
 * 
 * @throws {Error} Se a chave privada do envelope VAPID estiver ausente ou corrompida.
 */
export function gerarPayloadQrCodeCompacto(profile: ProfileConfig): string {
  // ... implementação ...
}

```

---

## 3. Arquitetura de Segurança e Criptografia

O Loco utiliza um modelo de criptografia em múltiplas camadas (Híbrida: Assimétrica + Simétrica):

```
+-------------------------------------------------------------------------+
|                        JWT PAYLOAD (Max 4096 bytes)                     |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  | Assinatura Externa: ECDSA (VAPID P-256) - Autenticidade do Emissor  |  |
|  +-------------------------------------------------------------------+  |
|  | Envelope Cifrado (ct):                                            |  |
|  |   - Dados Cifrados: AES-GCM-256 (Texto da Mensagem + GZIP)         |  |
|  |   - Chave AES Cifrada: RSA-OAEP-2048 (Chave Pública do Receptor)   |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+

```

1. **Identidade / Assinatura (VAPID):**
* Par de Chaves: **ECDSA P-256** (`vapidPublicKey` / `vapidPrivateKeyJwk`).
* Usado para assinar os tokens JWT (`alg: "ES256"`) garantindo que o remetente é autêntico.


2. **Criptografia Ponto a Ponto (E2E):**
* Par de Chaves: **RSA-OAEP-2048** (`e2ePublicKey` / `e2ePrivateKeyJwk`).
* A mensagem de texto é comprimida com GZIP (`fflate`) e cifrada via **AES-GCM-256**. A chave AES simétrica é então cifrada com a chave pública RSA do destinatário.


3. **Blindagem do Servidor Proxy (VAPID Envelope):**
* O servidor proxy possui um par RSA estático exclusivo registrado em `.env`.
* Para evitar que a chave privada VAPID do usuário transite em texto puro ao solicitar requisições Push, o cliente cifra essa chave em um envelope (`vapidPrivateKeyEnvelope`). O servidor decifra o envelope temporariamente na RAM apenas para assinar a requisição no FCM e descarta o conteúdo da memória em seguida.



---

## 4. Estrutura e Formato de Convites

Para permitir que contatos se conectem lendo telas de celulares ou links em mensagens sem dependência de um servidor central, o projeto implementa o utilitário `src/utils/share-utils.ts` com dois modos de transporte:

### A) QR Code Binário Ultra-Compacto (`cqr`)

Usado na tela de perfil para gerar a matriz visual. Para não estourar o limite de bits da Versão 40 do QR Code (23.648 bits / ~2.950 bytes), os dados do perfil passam pelas seguintes transformações:

* **Tupla Ordenada:** O objeto JSON tem suas chaves removidas e é convertido em uma array de 11 posições fixas.
* **Tokenização de Endpoints:** Substitui a URL do Google (`[https://fcm.googleapis.com/fcm/send/](https://fcm.googleapis.com/fcm/send/)`) pelo prefixo `1:`.
* **Conversão de Módulo RSA:** A string Base64Url do campo `n` da chave RSA é convertida diretamente para bytes brutos.
* **Compressão:** O payload resultante é compactado via GZIP (`fflate`).

### B) Link Web Comprimido (`cjwt`)

Usado no botão "Copiar Link de Convite" para envio em aplicativos de terceiros (WhatsApp, E-mail, Telegram).

* Gera um JWT com a claim `sub: "contact"` assinado digitalmente pelo emissor.
* Comprime o token JWT gerado via GZIP, resultando na URL curta `/share.html?cjwt=...`.

---

## 5. Armazenamento Local (IndexedDB)

Os dados são armazenados de forma isolada nos bancos de dados gerenciados por `src/utils/db-helpers.ts`:

| Nome do Banco (`DB_NAMES`) | Chave Primária | Tipo de Dado | Finalidade |
| --- | --- | --- | --- |
| `AppConfig_DB` | `"profile"` | `ProfileConfig` | Perfil do usuário local, chaves privadas/públicas e subscription. |
| `BrowserB_Contatos_DB` | Hash SHA-256 (hex) | `Contato` | Lista de contatos salvos e status de homologação. |
| `BrowserB_MensagensRecebidas_DB` | ID da Mensagem | `MensagemRecebida` | Histórico local de mensagens recebidas. |
| `BrowserA_MensagensEnviadas_DB` | ID da Mensagem | `MensagemEnviada` | Fila offline de mensagens enviadas e status de entrega. |
| `Handshake_DB` | ID do Handshake | `Handshake` | Fila e histórico de recibos de entrega automática. |

---

## 6. Mapeamento Completo de Arquivos

```
loco/
├── src/
│   ├── app.tsx                 # Ponto de entrada da SPA. Layout do chat e Modal de Debug (<md-dialog>)
│   ├── profile.tsx / .html     # Tela de edição de perfil, diagnósticos e QR Code de convite
│   ├── share.tsx / .html       # Leitor de QR Code via câmera (BarcodeDetector) e importador de links
│   ├── logout.tsx / .html      # Expurgo completo do IndexedDB, Caches, OPFS e Service Workers
│   ├── service-worker.ts       # Orquestrador do SW (importa cache, push, click e workers de fila)
│   ├── styles.css              # Tema Material Design 3 e estilização responsiva (100dvh)
│   │
│   ├── components/             # Componentes de interface do Preact
│   │   ├── ChatSection.tsx     # Timeline unificada de mensagens com formatação de datas (Hoje, Ontem, DD/MM)
│   │   ├── ContatosSection.tsx # Lista de contatos homologados com rolagem flexível
│   │   └── DebugPanel.tsx      # Painel de inspeção de logs em tempo real
│   │
│   ├── signals/                # Estado reativo global
│   │   └── state.ts            # Signals da UI (contato selecionado, logs, viewports mobile)
│   │
│   ├── stores/                 # Camada de sincronização entre IndexedDB e Signals
│   │   ├── profileStore.ts     # Carregamento e atualização do perfil do usuário
│   │   ├── contatosStore.ts    # Mapeamento e cálculo de hashes de contatos
│   │   ├── mensagensStore.ts   # Gestão reativa de filas de envio e recebimento
│   │   └── index.ts            # Exportador unificado de stores
│   │
│   ├── utils/                  # Utilitários puros do sistema
│   │   ├── share-utils.ts      # [NÚCLEO] Encurtador de QR Code (cqr), links cjwt e parser unificado
│   │   ├── jwt-helpers.ts      # Utilidades de criação/validação de JWT ES256 e conversões Base64Url
│   │   ├── push-utils.ts       # Criptografia híbrida (AES-GCM + RSA-OAEP) e requisições ao proxy
│   │   ├── profile-utils.ts    # Gerador de chaves VAPID/RSA e registros no PushManager
│   │   ├── db-helpers.ts       # Abstração de I/O no IndexedDB via idb-keyval
│   │   ├── id-utils.ts         # Gerador de IDs de 12 caracteres browser-safe (Web Crypto API)
│   │   └── sw-utils.ts         # Helper de registro e ativação de Service Workers
│   │
│   └── sw/                     # Módulos internos do Service Worker
│       ├── cache.ts            # Gerenciamento de cache offline (CacheStorage API)
│       ├── push.ts             # Roteador de notificações Push (sub: "msg" / sub: "hand")
│       ├── click.ts            # Captura de cliques em notificações do sistema
│       ├── sw-mensagens.ts     # Processador da fila offline de envio e decodificador de entrada
│       └── sw-handshakes.ts    # Emissor e processador de recibos de entrega automática
│
├── main.ts                     # Servidor HTTP Deno (proxy CORS e retransmissor Push para o FCM)
├── build.ts                    # Script de build (compilação via Deno.bundle e injeção de assets no SW)
├── deno.json                   # Configurações do Deno 2.x, import maps e tasks
└── README.md                   # Documentação técnica do projeto

```

---

## 7. Comandos e Execução

Todos os comandos de automação estão configurados no `deno.json`:

* **Gerar o Bundle de Produção:**
```bash
deno task build

```


*Executa a compilação TSX/JS, copia os arquivos HTMLs estáticos para `dist/` e injeta a lista de assets no Service Worker.*
* **Iniciar o Servidor em Produção:**
```bash
deno task start

```


*Disponibiliza a aplicação na porta `http://localhost:8000`.*
* **Modo de Desenvolvimento (Watch):**
```bash
deno task dev

```


*Recompila o projeto e reinicia o servidor automaticamente a cada alteração nos arquivos fonte.*
* **Limpar a Pasta de Saída:**
```bash
deno task clean

```



---

## 8. Diagnóstico de Problemas (Troubleshooting)

* **Erro `Error: channel closed` durante o `deno task build`:**
* *Causa:* Ocorre quando há um erro de sintaxe TypeScript/JSX em algum arquivo `.tsx` importado, fazendo com que o processo filho do bundler seja abortado.
* *Solução:* Verifique os erros de sintaxe nos componentes e certifique-se de que nenhum arquivo `.html` foi incluído no array `entrypoints` do `Deno.bundle()`.


* **Erro `code length overflow` no QR Code:**
* *Causa:* O payload original ultrapassou a capacidade máxima de bits da matriz do QR Code.
* *Solução:* Certifique-se de utilizar a função `gerarPayloadQrCodeCompacto()` contida em `src/utils/share-utils.ts`, que aplica a otimização de tupla binária e compressão GZIP.


* **Payload Excede Limite no Push (`HTTP 413` / `MAX_PAYLOAD_SIZE`):**
* *Causa:* O tamanho do JWT assinado ultrapassou os 4.096 bytes permitidos pela especificação do Web Push (FCM).
* *Solução:* Mantenha as mensagens de texto dentro do tamanho recomendado e utilize compressão GZIP nos envelopes internos.