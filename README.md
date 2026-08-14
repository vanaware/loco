# 📡 Loco — Mensageiro PWA Descentralizado

O **Loco** é um Progressive Web App (PWA) de mensagens instantâneas descentralizado, focado em privacidade absoluta, criptografia ponto a ponto (E2EE) e arquitetura *offline-first*. A aplicação opera sem um banco de dados centralizado de mensagens ou contatos, utilizando comunicação híbrida (**Web Push via FCM** e **WebRTC P2P**).

---

## 1. Visão Geral e Filosofia

No Loco, **cada navegador é um nó autônomo** que mantém seu próprio histórico local e suas próprias chaves criptográficas.

* **Sem Servidor de Mensagens:** O servidor backend (Deno 2.x) atua exclusivamente como um *proxy cego* de entrega de notificações Web Push e provedor de infraestrutura de chaves temporárias para envelopes VAPID.
* **Privacidade por Design:** O servidor não armazena logs de conversas, listas de contatos, metadados ou conteúdo de mensagens.
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

### 3.2. Padrão Obrigatório de Documentação Tática

Todas as funções utilitárias em `src/utils/` e orquestradores no Service Worker devem incluir comentários em formato **JSDoc**, especificando limites de payload, precondições de segurança e propósitos arquiteturais.

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
| `email` | `em` | E-mail do contato |
| `name` | `nm` | Nome do contato |
| `vapidPublicKey` | `vp` | Chave VAPID Pública Minificada (Apenas coordenadas X e Y) |
| `e2ePublicKey` | `ep` | Chave RSA Pública E2E Minificada (Apenas módulo N) |
| `subscription.endpoint` | `se` | Endpoint Push (prefixo `1:` substitui a URL do FCM) |
| `subscription.keys.p256dh` | `sp` | Chave p256dh da subscrição Push |
| `subscription.keys.auth` | `sa` | Chave de autorização Push |
| `vapidPrivateKeyEnvelope` | `ve` | Envelope da chave VAPID cifrada |
| `subscription.proxyserver` | `ps` | Endereço estrito do Servidor Proxy |
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
| `AppConfig_DB` | `"profile"` | `ProfileConfig` | Perfil do usuário local, chaves privadas/públicas, envelope VAPID e subscrição Push. |
| `BrowserB_Contatos_DB` | Hash SHA-256 (`vapidPublicKey`) | `Contato` | Agenda de contatos, chaves E2E e estado de confiança (`me` / `trusted`). |
| `Chat_DB` | ID da Mensagem | `Chat` | Histórico de mensagens unificado (recebidas/enviadas) com indexação virtual. |
| `Handshake_DB` | ID do Handshake (`jti`) | `Handshake` | Fila assíncrona da Máquina de Estados (fluxos `in` e `out`). |

---

## 8. Mapeamento do Código Fonte

```text
loco/
├── src/
│   ├── app.tsx                 # Ponto de entrada da SPA principal.
│   ├── profile.tsx / .html     # Gerenciamento de perfil, QR Code do usuário e chaves.
│   ├── share.tsx / .html       # Leitor de QR Code via câmera e importador de convites.
│   ├── logout.tsx / .html      # Expurgo completo do IndexedDB, Caches e OPFS.
│   ├── service-worker.ts       # Orquestrador do Service Worker.
│   ├── styles.css              # Tema Material Design 3 e regras de layout responsivo.
│   ├── styles.d.ts             # Declaração de módulo para import de CSS.
│   │
│   ├── components/             # Componentes de interface (Preact)
│   │   ├── ChatSection.tsx          # Timeline unificada de conversas e caixa de mensagem.
│   │   ├── ContatosSection.tsx      # Lista de contatos na barra lateral.
│   │   ├── ContactDetailSection.tsx # Cartão do contato e diagnóstico de confiança.
│   │   ├── AdvancedSection.tsx      # Painel de diagnósticos do sistema e requisitos.
│   │   └── DebugPanel.tsx           # Terminal visual de logs de depuração em tempo real.
│   │
│   ├── signals/                # Gerenciamento de estado global
│   │   └── state.ts            # Signals da UI (visões mobile, logs, seleção de chats).
│   │
│   ├── stores/                 # Ponte de reatividade entre IndexedDB e Signals
│   │   ├── profileStore.ts     # Estado reativo do Perfil.
│   │   ├── contatosStore.ts    # Estado reativo da lista de Contatos.
│   │   ├── mensagensStore.ts   # Estado reativo de Mensagens.
│   │   └── index.ts            # Exportador unificado de stores.
│   │
│   ├── handshakes/             # Processadores de rotas de negócio (Worker Thread)
│   │   ├── hand-profile.ts     # Processamento de solicitações e respostas de perfil.
│   │   ├── hand-contato.ts     # Avaliação do ciclo de confiança ('me' e 'trusted').
│   │   └── hand-mensagem.ts    # Auto-Ack de leitura, notificações e gravações de mensagens.
│   │
│   ├── utils/                  # Utilitários puros
│   │   ├── share-utils.ts      # [NÚCLEO] Compactação e descompactação de convites.
│   │   ├── jwt-helpers.ts      # Criação, assinatura (ES256) e verificação de JWTs.
│   │   ├── push-utils.ts       # Criptografia híbrida (AES-GCM + RSA-OAEP).
│   │   ├── profile-utils.ts    # Geração de chaves VAPID/RSA e registros de Push.
│   │   ├── db-helpers.ts       # Abstração de I/O do IndexedDB via idb-keyval.
│   │   ├── crypto-utils.ts     # [NÚCLEO] Extratores/Injetores de Minificação (Static Schema Compression).
│   │   ├── id-utils.ts         # Gerador de IDs criptográficos.
│   │   ├── self-contact-utils.ts# Regras p/ auto-mensagem.
│   │   └── sw-utils.ts         # Registro e verificação do Service Worker.
│   │
│   ├── sw/                     # Submódulos do Service Worker
│   │   ├── cache.ts            # Gerenciamento de cache offline (CacheStorage API).
│   │   ├── push.ts             # Interceptador e roteador de notificações Push.
│   │   ├── click.ts            # Manipulador de cliques em notificações do SO.
│   │   └── sw-handshakes.ts    # [NÚCLEO] Processador da fila de Handshakes.
│   │
│   └── types/                  # Definições de tipos TypeScript
│       └── material-web.d.ts   # Tipagem JSX para Web Components do Material Design 3.
│
├── main.ts                     # Servidor Deno HTTP (Proxy cego CORS e WebPush FCM).
├── build.ts                    # Script de bundle, injeção de cache e geração de chaves RSA minificadas.
├── deno.json                   # Configurações do Deno 2.x, import maps e tasks.
└── README.md                   # Documentação técnica do projeto.

```

---

## 9. Comandos e Execução

Todos os comandos automatizados utilizam a interface de linha de comando (CLI) do Deno 2.x e encontram-se rigorosamente mapeados no arquivo de configuração `deno.json`:

* **Processamento de Compilação e Empacotamento de Artefatos:**
```bash
deno task build

```


*Promove-se a compilação exaustiva dos códigos-fonte em linguagens TSX e JavaScript, mediante a qual se efetua a transferência dos ativos contidos no diretório `public/` para a pasta de destino `dist/`, procedendo-se à geração das chaves criptográficas RSA do servidor — na eventualidade de sua inexistência — e à subsequente injeção da relação de recursos no âmbito do Service Worker.*
* **Execução do Servidor em Âmbito de Produção:**
```bash
deno task start

```


*Determina-se a inicialização da instância do servidor Deno, a qual passa a operar formalmente por intermédio da porta de comunicação `http://localhost:8000`.*
* **Monitoramento e Modificação Dinâmica em Tempo de Desenvolvimento:**
```bash
deno task dev

```


*Garante-se a recompilação automática do pacote de artefatos bem como a imediata reinicialização do servidor HTTP a cada alteração detectada nos arquivos-fonte da aplicação.*
* **Validação e Verificação da Integridade Funcional:**
```bash
deno task test

```


*Procede-se à execução formal dos protocolos de testes automatizados destinados à aferição da integridade e corretude do sistema.*
* **Aferição Cautelar de Tipagem e Conformidade Sintática (TypeScript):**
```bash
deno task typecheck

```


*Aplica-se a verificação rigorosa estática de tipos, visando assegurar a plena conformidade do código perante as especificações formais de tipagem do TypeScript.*
* **Expurgo e Sanitização dos Arquivos Compilados:**
```bash
deno task clean

```


*Operabiliza-se a remoção completa e definitiva de todos os artefatos previamente gerados e armazenados no diretório de distribuição.*

---

## 10. Diagnóstico e Resolução de Problemas

* **O Service Worker não atualiza as mudanças no frontend:**
* *Causa:* O navegador reteve a versão anterior no estado "Aguardando ativação".
* *Solução:* Acesse `F12 > Application > Service Workers` e clique em **Update / Skip Waiting**, ou execute a ação de Logout para purgar os caches.


* **Erro de capacidade no QR Code (`code length overflow`):**
* *Causa:* Os dados serializados excederam o limite máximo da matriz do QR Code.
* *Solução:* Certifique-se de que os objetos de perfil ou contato estejam passando pela função `extrairDadosCompactos()` em `src/utils/share-utils.ts` antes da geração da imagem. A Compressão por Esquema Estático reduz enormemente este risco.


* **Rejeição HTTP 413 no Envio de Mensagem (`Payload muito grande`):**
* *Causa:* O JWT ultrapassou o limite de 4.096 bytes imposto pelo serviço Web Push (FCM).
* *Solução:* O payload cifrado deve conter apenas os atributos compactados da interface `HandshakeRotas` e utilizar o compressor GZIP (`fflate`).


## 11. Instalação do Deno Automarizada


```sh
apt-get update && apt-get install -y unzip
curl -fsSL [https://deno.land/install.sh](https://deno.land/install.sh) | sh -s -- -y

```


## 12. Lançamento de nova versão (Exemplo de CD)


```sh
git tag -a v0.2 - m "Release v0.2: Nova esteira de CI/CD"
git push origin v0.2

```
