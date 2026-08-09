
# 📡 Loco — Mensageiro PWA Descentralizado

O **Loco** é um Progressive Web App (PWA) de mensagens instantâneas descentralizado, focado em privacidade absoluta, criptografia ponto a ponto (E2EE) e arquitetura *offline-first*. A aplicação opera sem um banco de dados centralizado de mensagens ou contatos, utilizando comunicação híbrida (**Web Push via FCM** e **WebRTC P2P**).

---

## 1. Visão Geral e Filosofia

No Loco, **cada navegador é um nó autônomo** que mantém seu próprio histórico local e suas próprias chaves criptográficas.

* **Sem Servidor de Mensagens:** O servidor backend (Deno) atua exclusivamente como um *proxy cego* de entrega de notificações Web Push e provedor de infraestrutura de chaves temporárias para envelopes.
* **Privacidade por Design:** O servidor não armazena logs de conversas, lista de contatos ou conteúdo de mensagens.
* **Resistência à Evicção:** Os dados do usuário residem unicamente no dispositivo local através do IndexedDB e Origin Private File System (OPFS).

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
         |                             |                            |     e Decifra E2E
         |                             |                            |
         | <--- 4. Handshake de Resposta (Auto-Ack) via Proxy ----- |

```

---

## 2. A Máquina de Estados (O Roteador de Handshakes)

Na nova arquitetura, **toda e qualquer comunicação na rede é um Handshake** de sincronização de estados. Não existem fluxos separados para "mensagens" ou "comandos".

O Roteador (`sw-handshakes.ts`) funciona como uma "Máquina de Estados" assíncrona baseada na arquitetura *Offline-First*, operando via IndexedDB (`Handshake_DB`):

* **`FluxoIn` (Entrada):** O que o dispositivo recebeu, descriptografou e precisa processar localmente (via módulos especializados).
* **`FluxoOut` (Saída):** O que o dispositivo preparou e precisa criptografar e enviar para a rede (com sistema de tentativas).

### 2.1. Módulos Especializados (As Rotas)

O Roteador distribui o trabalho para módulos em `src/handshakes/`:

* 💬 **Rota Mensagem (`hand-mensagem.ts`):** Tráfego bidirecional de mensagens e recibos de leitura (Auto-Ack instantâneo com os "dois tiques ✓✓").
* 👤 **Rota Profile (`hand-profile.ts`):** Exibição genérica de dados passivos sob demanda.
* 🛡️ **Rota Contato (`hand-contato.ts`):** Núcleo de gestão de saúde criptográfica e confiança mútua.

### 2.2. Injeção de Carona (Piggybacking)

Para garantir que as mensagens nunca se percam se as rotas estiverem dessincronizadas, o Roteador usa *Piggybacking*. Se você enviar um texto para um contato que não tem seus dados (ou tem dados antigos), o Roteador **injeta silenciosamente o seu Cartão de Visitas no mesmo pacote da mensagem**. O celular receptor autoconserta a base de dados antes mesmo de exibir a mensagem na tela.

---

## 3. Padrões e Regras de Desenvolvimento

### 3.1. Diretrizes Principais

1. **Runtime Único (Deno 2.x):** Proibido o uso de Node.js, `npm` ou pacotes com dependências C++ nativas.
2. **Zero `localStorage`:** É terminantemente proibido utilizar `localStorage` por conta de limitações de performance e bloqueios síncronos da I/O thread. Utilize a camada IndexedDB (`src/utils/db-helpers.ts`) via `idb-keyval`.
3. **Isolamento de Processamento:** Tarefas computacionalmente intensivas (compressão, geração de chaves, parsing de matrizes QR) não devem bloquear a thread principal da UI.

### 3.2. Padrão Obrigatório de JSDoc Tático

Todas as funções utilitárias em `src/utils/` e gerenciadores no Service Worker devem incluir documentação no padrão **JSDoc**, explicando **o porquê de decisões táticas**, limites de payload e precondições de segurança.

---

## 4. Arquitetura de Segurança e Criptografia

O Loco utiliza um modelo de criptografia Híbrida (Assimétrica + Simétrica) em múltiplas camadas:

```text
+-------------------------------------------------------------------------+
|                        JWT PAYLOAD (Max 4096 bytes)                     |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  | Assinatura Externa: ECDSA (VAPID P-256) - Autenticidade do Emissor  |  |
|  +-------------------------------------------------------------------+  |
|  | Envelope Cifrado (ct):                                            |  |
|  |   - Dados Cifrados: AES-GCM-256 (Rotas + Mensagem + GZIP)          |  |
|  |   - Chave AES Cifrada: RSA-OAEP-2048 (Chave Pública do Receptor)   |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+

```

1. **Identidade / Assinatura (VAPID):** (ECDSA P-256) Usado para assinar os tokens JWT (`alg: "ES256"`) garantindo que o remetente é autêntico.
2. **Criptografia Ponto a Ponto (E2E):** (RSA-OAEP-2048 + AES-GCM-256) A mensagem é comprimida com GZIP (`fflate`) e cifrada via AES. A chave AES é cifrada com a chave RSA do destinatário.
3. **Blindagem do Servidor Proxy (VAPID Envelope):** O servidor proxy possui um par RSA estático. O cliente cifra sua própria chave VAPID Privada em um envelope, garantindo que o servidor proxy apenas a decifre na RAM por milissegundos para assinar a requisição de Push, descartando-a logo em seguida.

---

## 5. Estrutura e Formato de Convites (Sincronização Compacta)

Para não estourar o limite de 4.096 bytes do Web Push e das matrizes de QR Code (Versão 40), o Loco usa a interface `CompactContact` (`src/utils/share-utils.ts`).
Ela converte objetos JWK extensos em siglas de 2 letras (Ex: `tr`: Trusted, `vx`: Vapid X, `en`: E2E N Modulus) e tokeniza endpoints do Google FCM (`1:`), derrubando o payload de ~2.5KB para menos de **750 bytes**.

* **QR Code Binário Ultra-Compacto (`cqr`):** Matriz visual gerada na tela de perfil.
* **Link Web Comprimido (`cjwt`):** Link seguro para WhatsApp/Telegram (`/share.html?cjwt=...`).

---

## 6. Armazenamento Local (IndexedDB)

Os dados são armazenados de forma isolada nos bancos de dados:

| Nome do Banco (`DB_NAMES`) | Chave Primária | Tipo de Dado | Finalidade |
| --- | --- | --- | --- |
| `AppConfig_DB` | `"profile"` | `ProfileConfig` | Perfil do usuário local, chaves privadas/públicas e subscription. |
| `BrowserB_Contatos_DB` | Hash SHA-256 | `Contato` | Lista de contatos, chaves E2E deles e status do ciclo de confiança (`me`). |
| `BrowserB_MensagensRecebidas_DB` | ID da Mensagem | `MensagemRecebida` | Histórico local de mensagens recebidas e status de leitura. |
| `BrowserA_MensagensEnviadas_DB` | ID da Mensagem | `MensagemEnviada` | Histórico e fila de mensagens enviadas (status: pendente/enviada/entregue). |
| `Handshake_DB` | ID do Handshake | `Handshake` | Fila assíncrona (A Máquina de Estados) de sincronização PUSH/PULL. |

---

## 7. Mapeamento Completo de Arquivos

```text
loco/
├── src/
│   ├── app.tsx                 # Ponto de entrada da SPA. Layout do chat e Header.
│   ├── profile.tsx / .html     # Tela de edição de perfil, diagnósticos e QR Code.
│   ├── share.tsx / .html       # Leitor de QR Code via câmera e parser de links.
│   ├── logout.tsx / .html      # Expurgo completo do IndexedDB, Caches e OPFS.
│   ├── service-worker.ts       # Orquestrador do SW.
│   ├── styles.css              # Tema Material Design 3 e estilização responsiva.
│   │
│   ├── components/             # Componentes de interface do Preact
│   │   ├── ChatSection.tsx     # Timeline unificada de mensagens e campo de input.
│   │   ├── ContatosSection.tsx # Lista de contatos na Sidebar.
│   │   ├── ContactDetailSection.tsx # Cartão do contato e Painel de Confiança Mútua.
│   │   └── DebugPanel.tsx      # Painel de inspeção de logs em tempo real.
│   │
│   ├── signals/                # Estado reativo global
│   │   └── state.ts            # Signals da UI (contatos, logs, viewports mobile).
│   │
│   ├── stores/                 # Sincronização entre IndexedDB e Signals
│   │   ├── profileStore.ts     
│   │   ├── contatosStore.ts    
│   │   ├── mensagensStore.ts   
│   │   └── index.ts            
│   │
│   ├── handshakes/             # Módulos Roteadores de Negócio (Worker)
│   │   ├── hand-profile.ts     # Processador de requisições de perfil.
│   │   ├── hand-contato.ts     # Avaliador do ciclo de confiança ('me' e 'trusted').
│   │   └── hand-mensagem.ts    # Auto-Ack de leitura e injeção de mensagens no banco.
│   │
│   ├── utils/                  # Utilitários puros do sistema
│   │   ├── share-utils.ts      # [NÚCLEO] Compressor CompactContact (cqr / cjwt).
│   │   ├── jwt-helpers.ts      # Criação/validação de JWT ES256 e conversões Base64Url.
│   │   ├── push-utils.ts       # Criptografia híbrida (AES-GCM + RSA-OAEP).
│   │   ├── profile-utils.ts    # Gerador de chaves VAPID/RSA e registros PushManager.
│   │   ├── db-helpers.ts       # Abstração de I/O no IndexedDB via idb-keyval.
│   │   ├── id-utils.ts         # Gerador de IDs criptográficos seguros.
│   │   └── sw-utils.ts         # Helper de registro e ativação de Service Workers.
│   │
│   └── sw/                     # Módulos internos do Service Worker
│       ├── cache.ts            # Gerenciamento de cache offline (CacheStorage API).
│       ├── push.ts             # Interceptador principal de notificações Push.
│       ├── click.ts            # Captura de cliques em notificações do SO.
│       └── sw-handshakes.ts    # [NÚCLEO] A Máquina de Estados e Filas de Sincronia.
│
├── main.ts                     # Servidor HTTP Deno (Proxy cego CORS e WebPush).
├── build.ts                    # Script de compilação, injeção de cache e bundler.
├── deno.json                   # Configurações do Deno 2.x, import maps e tasks.
└── README.md                   # Documentação técnica do projeto.

```

---

## 8. Comandos e Execução

Todos os comandos de automação estão configurados no `deno.json`:

* **Gerar o Bundle de Produção:**

```bash
deno task build

```

*Executa a compilação TSX/JS, copia arquivos estáticos para `dist/` e injeta a lista de assets no Service Worker.*

* **Iniciar o Servidor em Produção:**

```bash
deno task start

```

*Disponibiliza a aplicação na porta `http://localhost:8000`.*

* **Modo de Desenvolvimento (Watch):**

```bash
deno task dev

```

*Recompila o projeto e reinicia o servidor automaticamente a cada alteração.*

* **Limpar a Pasta de Saída:**

```bash
deno task clean

```

---

## 9. Diagnóstico de Problemas (Troubleshooting)

* **O SW não processa novos comandos após um update:**
* *Causa:* O navegador prendeu o Service Worker antigo no cache ("Waiting to activate").
* *Solução:* Feche todas as abas do Loco, reabra e aperte `CTRL + F5`. Ou vá em F12 > Application > Service Workers e clique em "Update / Skip Waiting".


* **Erro `code length overflow` no QR Code:**
* *Causa:* O payload original ultrapassou a capacidade máxima de bits da matriz.
* *Solução:* Certifique-se de que os dados estão passando pela interface `CompactContact` na função `extrairDadosCompactos()` em `src/utils/share-utils.ts`.


* **Payload Excede Limite no Push (`HTTP 413` / `MAX_PAYLOAD_SIZE`):**
* *Causa:* O tamanho do JWT assinado ultrapassou os 4.096 bytes permitidos pela especificação do Web Push (FCM).
* *Solução:* Isso geralmente ocorre se chaves JWK inteiras forem enviadas. Utilize as rotas compactadas (`vx`, `en`, `se`, etc.).


