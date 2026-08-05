# 📡 Web Push Descentralizado – Protótipo Detalhado

## 1. Objetivo Geral

Este protótipo implementa um sistema de mensagens **descentralizado** utilizando a API **Web Push** (especificamente via FCM no Chrome) como transporte. O objetivo é permitir que dois navegadores (ou mais) troquem mensagens diretamente, sem a necessidade de um servidor central para armazenar mensagens ou gerenciar contatos.

Cada navegador atua como um **ponto autônomo**:
- **Emissor**: envia mensagens para outro usuário.
- **Receptor**: recebe mensagens e pode responder.

A infraestrutura mínima necessária é um **servidor proxy** (fornecido neste projeto em Deno) que:
- Fornece uma chave pública RSA usada para cifrar a chave privada VAPID durante a troca de perfis.
- Reencaminha as requisições push ao serviço de push (FCM), após descriptografar a chave privada VAPID para assinar o cabeçalho de autorização.

Não há banco de dados central, nem filas compartilhadas: cada navegador mantém seu próprio **IndexedDB** com contatos, histórico de mensagens, handshakes e o perfil do usuário.

---

## 2. Conceitos Fundamentais

### 2.1. Perfil (Profile)
Um **perfil** é a identidade de um usuário no sistema. Ele é armazenado localmente no IndexedDB (`AppConfig_DB`) e pode ser compartilhado através de um **JWT** (JSON Web Token) para que outros usuários possam adicioná-lo como contato.

**Estrutura do Perfil Público (JWT com `sub: "contact"`):**
```json
{
  "iss": "email@exemplo.com",       // Identificador único (e-mail do dono)
  "sub": "contact",                 // Tipo de token (contato)
  "nm": "Nome do Usuário",           // Nome legível (exibido nas mensagens)
  "kid": { ... },                    // Chave pública VAPID (ECDSA P-256) em JWK
  "p": { ... },                      // Chave pública RSA (RSA-OAEP-256) em JWK
  "s": {                             // Subscription do Web Push
    "endpoint": "https://fcm.googleapis.com/...",
    "keys": {
      "p256dh": "base64...",
      "auth": "base64..."
    },
    "k": "base64..."                 // Chave privada VAPID cifrada (envelope RSA-AES)
  },
  "iat": 1738765432                  // Timestamp de emissão
}
```

**Campos explicados:**
- `iss`: E-mail ou identificador único do dono do perfil.
- `nm`: Nome legível para exibição na interface e nas notificações.
- `kid`: Chave pública VAPID. Usada para verificar a assinatura do JWT recebido e para identificar o contato.
- `p`: Chave pública RSA. Usada pelo emissor para cifrar a chave AES que, por sua vez, cifra a mensagem.
- `s`: Subscription obtida via `PushManager.subscribe()`. Contém o endpoint do serviço de push e as chaves `p256dh`/`auth`, necessárias para cifrar o payload. Inclui `k` (chave privada VAPID cifrada).
- `k` (dentro de `s`): Chave privada VAPID cifrada com um envelope híbrido: AES-GCM + RSA-OAEP usando a chave pública RSA do servidor proxy. Apenas o servidor proxy pode decifrá-la, garantindo que a chave privada VAPID nunca seja transmitida em texto puro.

**Importante:** Ao compartilhar o perfil, o sistema **recria automaticamente** o envelope da chave VAPID usando a chave pública atual do servidor, garantindo que o perfil compartilhado seja sempre compatível com as chaves do servidor.

### 2.2. Contato (Contact)
Quando um usuário recebe uma mensagem (ou adiciona manualmente um perfil via JWT), o emissor é salvo localmente como um **contato**. O contato armazena a subscription e as chaves públicas do emissor, permitindo que o receptor responda no futuro sem a necessidade de um novo perfil.

**Estrutura do Contato (IndexedDB):**
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
  vapidPrivateKey: string;         // Chave privada VAPID cifrada (para o proxy)
  homologado: boolean;             // Se o contato é confiável (lista branca)
  createdAt: number;
  updatedAt: number;
}
```

**Homologação:** Contatos importados via JWT já são considerados **homologados** (`homologado: true`). A homologação pode ser gerenciada na lista de contatos, onde o usuário pode homologar individualmente ou em massa.

### 2.3. Mensagem (Message)
A mensagem propriamente dita é transportada dentro de um **JWT** assinado. O conteúdo da mensagem é cifrado e comprimido para reduzir o tamanho (limite de 4096 bytes no Web Push).

**Estrutura da mensagem recebida (IndexedDB):**
```typescript
interface MensagemRecebida {
  id: string;                       // msg_<timestamp>_<random>
  contatoPublicKeyVapid: string;   // Hash SHA-256 da chave VAPID do emissor (referência ao contato)
  conteudo: string;                 // Texto decifrado
  status: 'nao_lida' | 'lida' | 'notificada';
  recebidoEm: number;
}
```

**Estrutura da mensagem enviada (IndexedDB) – fila de envio:**
```typescript
interface MensagemEnviada {
  id: string;                      // msg_<timestamp>_<random>
  contatoHash: string;             // Hash SHA-256 da chave pública VAPID do contato
  conteudo: string;                // Texto original da mensagem
  status: 'pendente' | 'enviando' | 'enviada' | 'falha' | 'entregue';
  tentativas: number;              // Número de tentativas de envio
  createdAt: number;
  updatedAt: number;
  erro?: string;                   // Mensagem de erro, se houver
}
```
**Constante:** `MAX_TENTATIVAS = 3` (número máximo de tentativas antes de marcar como falha).

### 2.4. Handshake (Confirmação de Entrega)
O handshake é um mecanismo para que o **receptor** de uma mensagem notifique o **emissor** sobre o status da entrega. Atualmente, o único tipo de handshake é `confirmacao_entrega`, que indica que a mensagem foi recebida com sucesso.

**Estrutura do Handshake (IndexedDB):**
```typescript
interface Handshake {
  id: string;                     // NanoID (12 caracteres) – identificador único
  mensagemId: string;            // ID da mensagem original que está sendo confirmada
  tipo: 'confirmacao_entrega';   // Futuramente: 'recebimento', 'leitura', etc.
  direcao: 'out' | 'in';         // 'out' = enviado, 'in' = recebido
  status: 'pendente' | 'enviado' | 'falha' | 'entregue';
  tentativas: number;            // Tentativas de envio (para handshakes out)
  payload: any;                  // Dados adicionais específicos do tipo
  createdAt: number;
  updatedAt: number;
  erro?: string;
}
```

**Fluxo do Handshake:**
1. O **receptor** recebe uma mensagem (`sub: "msg"`) e a processa.
2. O receptor **cria automaticamente** um handshake do tipo `confirmacao_entrega` no banco `Handshake_DB`, com direção `'out'` e status `'pendente'`.
3. O Service Worker do receptor processa a fila de handshakes e envia um **JWT com `sub: "hand"`** para o emissor original, contendo no `aud` o ID da mensagem original e no envelope cifrado apenas o `htype`.
4. O **emissor** recebe o JWT com `sub: "hand"`, decifra o envelope, valida o `aud` e **atualiza o status da mensagem enviada** para `'entregue'`, além de notificar a interface (se aberta).

O handshake é feito em background, sem exibir notificações visíveis, garantindo que o emissor saiba que a mensagem foi entregue.

---

## 3. Armazenamento IndexedDB – Detalhamento

O sistema utiliza as seguintes stores (bancos) no IndexedDB, gerenciadas pela biblioteca `idb-keyval`:

| Nome da Store (`DB_NAMES`) | Chave | Valor | Finalidade |
| :--- | :--- | :--- | :--- |
| `AppConfig_DB` | `"profile"` | `ProfileConfig` | **Store unificada** – contém todos os dados do perfil do usuário: nome, e-mail, chaves VAPID (pública e privada em JWK), envelope da chave privada VAPID, chaves RSA (pública e privada em JWK) e subscription. |
| `BrowserB_Contatos_DB` | **Hash SHA-256** (hex) da chave VAPID pública | `Contato` | Armazena todos os contatos conhecidos. A chave é um hash para evitar problemas de capitalização e inconsistências de serialização. |
| `BrowserB_MensagensRecebidas_DB` | ID da mensagem | `MensagemRecebida` | Armazena mensagens recebidas. O campo `contatoPublicKeyVapid` referencia a chave hash do contato correspondente. |
| `BrowserA_MensagensEnviadas_DB` | ID da mensagem | `MensagemEnviada` | Fila de mensagens aguardando envio (offline-first). O status e o contador de tentativas permitem gerenciar o fluxo de envio. |
| `Handshake_DB` | ID do handshake | `Handshake` | **Nova store** – armazena handshakes enviados e recebidos, permitindo rastrear a confirmação de entrega e outros futuros handshakes. |

**Observações importantes:**
- **A store `AppConfig_DB` substitui as antigas stores** – todas as informações do perfil ficam em um único lugar.
- **Chaves privadas** são persistidas como JWK dentro do `ProfileConfig`, garantindo persistência entre recarregamentos.
- **O envelope da chave privada VAPID** (`vapidPrivateKeyEnvelope`) é armazenado para evitar recifragem a cada envio.
- **A store `BrowserA_Bundles_DB` foi removida** – o bundle do emissor é construído dinamicamente.
- **A store de mensagens enviadas agora inclui o status `'entregue'`**, atualizado quando um handshake de confirmação é recebido.

**Geração do Hash do Contato:**
Para evitar diferenças de capitalização, a chave primária da store de contatos é um **hash SHA-256** da string normalizada: `${kty}|${crv}|${x}|${y}`.

---

## 4. Fluxos Detalhados

### 4.1. Geração do Perfil
O processo de criação do perfil é dividido em duas ações no front-end:

**Ação 1: "Gerar/Atualizar Perfil"** (`gerarProfile()` em `src/app.tsx`)
1. **Verificação de permissões**: Checa se a permissão de notificação está concedida; caso contrário, solicita.
2. **Registro do Service Worker**: Registra ou obtém a instância do Service Worker.
3. **Geração/obtenção de chaves VAPID**: Tenta carregar do perfil existente; caso não existam, gera um novo par ECDSA P-256 (`extractable: true`).
4. **Geração/obtenção de chaves RSA**: Tenta carregar do perfil existente; caso não existam, gera um novo par RSA-OAEP-256 (`extractable: true`).
5. **Obtenção da subscription**: Obtém a subscription do `PushManager` do navegador, usando a chave pública VAPID como `applicationServerKey`; reutiliza a subscription existente se ainda for válida.
6. **Busca da chave pública do servidor**: Faz uma requisição GET para `/api/server-public-key` para obter a chave pública RSA do servidor proxy.
7. **Cifragem da chave privada VAPID**: A chave privada VAPID (em JWK) é cifrada com AES-GCM, e a chave simétrica é cifrada com RSA-OAEP usando a chave pública do servidor. O envelope resultante é salvo no campo `vapidPrivateKeyEnvelope` do `ProfileConfig`.
8. **Persistência do perfil unificado**: Salva todos os dados na store `AppConfig_DB` com a chave `"profile"`.

**Ação 2: "Compartilhar Perfil (JWT)"** (`compartilharProfile()` em `src/app.tsx`)
1. **Validação**: Verifica se todos os campos obrigatórios estão presentes no perfil.
2. **Recriação do envelope**: Busca a chave pública atual do servidor e recria o envelope da chave VAPID, salvando-o no perfil.
3. **Montagem do payload**: Constrói o payload do JWT com `iss`, `sub: "contact"`, `nm`, `p`, `s` (com `k` = envelope recém-criado), e `iat`.
4. **Criação do JWT**: Gera o JWT assinado com a chave privada VAPID do emissor, colocando a chave pública VAPID no header (`kid`).
5. **Exibição**: O JWT é exibido e copiado para a área de transferência.

### 4.2. Adição de Contato
**Função:** `adicionarContato()` em `src/app.tsx`

1. Usuário cola um JWT (gerado pela outra pessoa) no campo de texto.
2. **Validação do formato**, **verificação da assinatura** e **validação de campos obrigatórios** (`kid`, `p`, `s`, `s.k`, `sub: "contact"`).
3. **Criação do contato**: Com os dados extraídos, cria um objeto `Contato` com `homologado: true` e o salva no IndexedDB (`BrowserB_Contatos_DB`), usando o hash da chave pública VAPID como chave primária.
4. **Atualização da interface**: A lista de contatos e o dropdown são recarregados.

### 4.3. Envio de Mensagem – App
**Função:** `enviarMensagemB()` em `src/app.tsx`

1. Usuário seleciona um contato e digita a mensagem.
2. Recupera o contato completo do IndexedDB.
3. **Salva a mensagem na fila de envio** (`BrowserA_MensagensEnviadas_DB`) com status `'pendente'`.
4. **Notifica o Service Worker** via `postMessage` com o tipo `PROCESSAR_FILA_ENVIO`.
5. O Service Worker processará a mensagem em background (offline-first).

### 4.4. Processamento do Envio – Service Worker
**Função:** `processarFilaEnvio()` em `src/sw/sw-mensagens.ts`

1. Busca mensagens com status `'pendente'` ou `'enviando'` travados.
2. Para cada mensagem:
   - Atualiza status para `'enviando'`.
   - Busca contato e perfil.
   - **Validações** (chaves, subscription, etc.).
   - **Monta o payloadObj** com o envelope do emissor, subscription, e chave pública RSA.
   - **Cifra o payloadObj** com AES-GCM + RSA-OAEP.
   - **Constrói o JWT de mensagem** (`sub: "msg"`) assinado com a chave privada VAPID do emissor.
   - **Envia para o servidor proxy** (`/api/proxy-push`) com a subscription do contato e o envelope da chave VAPID do contato.
   - Atualiza status para `'enviada'` em caso de sucesso, ou incrementa tentativas/status `'falha'` em caso de erro.

### 4.5. Recebimento da Mensagem – Service Worker
**Função:** `processarMensagemRecebida()` em `src/sw/sw-mensagens.ts` (chamada via router)

1. O router (`push.ts`) recebe o evento `push`, verifica `sub: "msg"` e chama o processador.
2. **Validação da assinatura**, `aud` (email do receptor).
3. **Decifra o envelope** com a chave privada RSA do receptor.
4. **Salva/Atualiza o contato** com os dados do emissor.
5. **Salva a mensagem recebida** no IndexedDB (`BrowserB_MensagensRecebidas_DB`).
6. **Dispara a criação de um handshake de confirmação de entrega** (chama `criarHandshakeConfirmacaoEntrega`).
7. **Exibe notificação** e notifica clientes abertos via `postMessage`.

### 4.6. Handshake de Confirmação de Entrega (Envio pelo Receptor)
**Função:** `criarHandshakeConfirmacaoEntrega()` em `src/sw/sw-mensagens.ts`

1. Verifica se já existe um handshake para essa mensagem (evita duplicatas).
2. **Salva um handshake no banco `Handshake_DB`** com status `'pendente'`, direção `'out'`.
3. **Dispara o processamento da fila de handshakes** (`self.processarFilaHandshake()`), que:
   - Busca handshakes pendentes.
   - Para cada handshake, busca o contato (pela mensagem original), valida chaves, **cifra um payload com `{ htype }`**, monta o JWT com `sub: "hand"`, `aud = mensagemId`, e envia ao proxy.
   - Atualiza status para `'enviado'` ou `'falha'`.

### 4.7. Recebimento do Handshake – Emissor
**Função:** `processarHandshakeRecebido()` em `src/sw/sw-handshakes.ts` (chamada via router)

1. O router (`push.ts`) recebe o evento `push`, verifica `sub: "hand"` e chama o processador.
2. **Validação**: verifica `jti`, `aud` (mensagemId), `ct`.
3. **Decifra o envelope** (obtém `{ htype }`).
4. **Salva o handshake recebido** no banco `Handshake_DB` com direção `'in'` e status `'entregue'`.
5. Se `htype === 'confirmacao_entrega'`, **atualiza a mensagem enviada correspondente** (com ID = `aud`) para status `'entregue'` e notifica a UI via `MENSAGEM_ENTREGUE`.

### 4.8. Resposta (Responder)
1. Na interface de mensagens recebidas, cada mensagem tem um botão "Responder".
2. Ao clicar, o sistema obtém o hash do contato a partir da mensagem, preenche o dropdown de seleção de contatos e navega para a aba de envio.
3. O usuário digita a mensagem e o fluxo de envio (4.3 e 4.4) é executado.

---

## 5. Estrutura do Projeto (Arquivos Relevantes)

| Arquivo | Responsabilidade |
| :--- | :--- |
| `src/app.tsx` | Interface principal (UI) e lógica de negócio (geração de perfil, adição de contato, criação de mensagens na fila). |
| `src/service-worker.ts` | Orquestrador que importa os módulos do Service Worker. |
| `src/sw/push.ts` | Router – recebe eventos `push`, verifica `sub` e delega para `sw-mensagens.ts` ou `sw-handshakes.ts`. |
| `src/sw/sw-mensagens.ts` | Processa mensagens recebidas (`sub: "msg"`) e cria handshakes. |
| `src/sw/sw-handshakes.ts` | Processa handshakes recebidos (`sub: "hand"`) e gerencia a fila de envio de handshakes. |
| `src/sw/push-common.ts` | Funções comuns de acesso ao IndexedDB (perfil, contatos, mensagens). |
| `src/utils/push-utils.ts` | Funções de criptografia (cifrar payload, cifrar chave VAPID) e envio ao proxy. |
| `src/utils/jwt-helpers.ts` | Criação, verificação e decodificação de JWTs. |
| `src/utils/db-helpers.ts` | Funções genéricas e específicas para operações IndexedDB. |
| `src/constants/db.ts` | Definição dos nomes das stores, interfaces (`ProfileConfig`, `MensagemEnviada`, `MensagemRecebida`, `Contato`, `Handshake`). |
| `main.ts` | Servidor Deno (proxy). Endpoints: `/api/server-public-key` e `/api/proxy-push`. |
| `build.ts` | Script de build usando `Deno.bundle` com entrypoints HTML. |

---

## 6. Build e Execução

### Build
```bash
deno task build
```
- Compila `src/index.html` (entrypoint), gerando bundle JS e atualizando o HTML.
- Compila o Service Worker separadamente (`src/service-worker.ts`) e injeta lista de assets e hash de versão.
- Gera as chaves RSA do servidor (`.env`) se não existirem.

### Execução do Servidor
```bash
deno task start
```
- Roda na porta 8000, serve os arquivos da pasta `dist/` e fornece os endpoints `/api/server-public-key` (GET) e `/api/proxy-push` (POST).

---

## 7. Estado Atual e Pontos de Atenção

- **Perfil unificado**: todas as informações do usuário em uma única store (`AppConfig_DB`).
- **Persistência de chaves privadas**: armazenadas como JWK, garantindo disponibilidade após recarregar.
- **Fila de envio simplificada**: mensagens enviadas são armazenadas com status e tentativas; o SW é responsável pelo envio.
- **Chave de Contato**: baseada em hash SHA-256 da chave pública VAPID.
- **Limitação de Payload**: o JWT deve ser inferior a 4096 bytes; compressão gzip e campos curtos são usados.
- **Homologação**: campo booleano em contato, gerenciado manualmente.
- **Handshake de confirmação de entrega**: implementado com banco `Handshake_DB`, fila de envio separada e roteamento no SW.
- **Service Worker**: modularizado, com router e processadores dedicados para mensagens e handshakes.
- **Service Worker**: durante o desenvolvimento, é necessário desregistrar manualmente (Application → Service Workers → Unregister) e recarregar a página para atualizar.

---

## 8. Próximos Passos

- **Consistência de chaves**: verificar se todas as operações usam corretamente o hash SHA-256.
- **Atualização de contatos**: garantir que, ao receber uma nova mensagem, o nome e dados do contato sejam atualizados.
- **Otimização de performance**: avaliar consultas ao IndexedDB e possíveis índices.
- **Fluxo de resposta**: testes exaustivos da resposta com handshake.
- **Segurança adicional**: possibilidade de cifrar chaves privadas no IndexedDB com senha.

---

## 9. Glossário de Termos

| Termo | Significado |
| :--- | :--- |
| **VAPID** | Voluntary Application Server Identification – identificação do servidor de aplicação; usa chaves ECDSA. |
| **JWK** | JSON Web Key – formato para representar chaves criptográficas. |
| **JWT** | JSON Web Token – token assinado para transporte de informações. |
| **FCM** | Firebase Cloud Messaging – serviço de push da Google. |
| **Handshake** | Mensagem de confirmação enviada pelo receptor ao emissor. |
| **E2EE** | End-to-End Encryption – criptografia de ponta a ponta. |
| **Subscription** | Inscrição do navegador no serviço de push, contendo endpoint e chaves. |
| **Envelope** | Estrutura com `iv`, `dadosCifrados`, `chaveAesCifrada`. |
| **MAX_TENTATIVAS** | Número máximo de tentativas de envio (padrão 3). |

---

## ✅ Resumo das Atualizações no README

- **Seção 2.1**: Destacada a recriação automática do envelope no compartilhamento do perfil.
- **Seção 2.4 (nova)**: Adicionado o conceito de Handshake, com estrutura e fluxo.
- **Seção 3**: Atualizada para incluir a store `Handshake_DB`.
- **Seção 4.6 e 4.7 (novas)**: Detalhamento do envio e recebimento de handshake.
- **Seção 5**: Atualizada a lista de arquivos com os novos módulos (`push.ts`, `push-common.ts`, `push-utils.ts`, `sw-handshakes.ts`).
- **Seção 7**: Acrescentado item sobre a implementação do handshake.
- **Glossário**: Adicionado termo "Handshake".

