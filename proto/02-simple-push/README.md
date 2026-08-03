
# 📡 Web Push Descentralizado – Protótipo Detalhado

## 1. Objetivo Geral

Este protótipo implementa um sistema de mensagens **descentralizado** utilizando a API **Web Push** (especificamente via FCM no Chrome) como transporte. O objetivo é permitir que dois navegadores (ou mais) troquem mensagens diretamente, sem a necessidade de um servidor central para armazenar mensagens ou gerenciar contatos.

Cada navegador atua como um **ponto autônomo**:
- **Emissor**: envia mensagens para outro usuário.
- **Receptor**: recebe mensagens e pode responder.

A infraestrutura mínima necessária é um **servidor proxy** (fornecido neste projeto em Deno) que:
- Fornece uma chave pública RSA usada para cifrar a chave privada VAPID durante a troca de perfis.
- Reencaminha as requisições push ao serviço de push (FCM), após descriptografar a chave privada VAPID para assinar o cabeçalho de autorização.

Não há banco de dados central, nem filas compartilhadas: cada navegador mantém seu próprio **IndexedDB** com contatos, histórico de mensagens e o perfil do usuário.

---

## 2. Conceitos Fundamentais

### 2.1. Perfil (Profile)
Um **perfil** é um objeto JSON público gerado por cada usuário. Ele contém todas as informações necessárias para que outros possam enviar-lhe mensagens push. O perfil deve ser transferido fora de banda (por exemplo, copiando e colando) do receptor para o emissor.

**Estrutura do Perfil Público (compartilhado):**
```json
{
  "iss": "email@exemplo.com",       // Identificador único (e-mail do dono)
  "nm": "Nome do Usuário",           // Nome legível (exibido nas mensagens)
  "kid": { ... },                    // Chave pública VAPID (ECDSA P-256) em JWK
  "s": {                             // Subscription do Web Push
    "endpoint": "https://fcm.googleapis.com/...",
    "keys": {
      "p256dh": "base64...",
      "auth": "base64..."
    }
  },
  "p": { ... },                      // Chave pública RSA (RSA-OAEP-256) em JWK
  "k": "base64..."                   // Chave privada VAPID cifrada (envelope RSA-AES)
}
```

**Campos explicados:**
- `iss`: E-mail ou identificador único do dono do perfil.
- `nm`: Nome legível para exibição na interface e nas notificações.
- `kid`: Chave pública VAPID. Usada para verificar a assinatura do JWT recebido e para identificar o contato.
- `s`: Subscription obtida via `PushManager.subscribe()`. Contém o endpoint do serviço de push e as chaves `p256dh`/`auth`, necessárias para cifrar o payload.
- `p`: Chave pública RSA. Usada pelo emissor para cifrar a chave AES que, por sua vez, cifra a mensagem.
- `k`: Chave privada VAPID cifrada com um envelope híbrido: AES-GCM + RSA-OAEP usando a chave pública RSA do servidor proxy. Apenas o servidor proxy pode decifrá-la, garantindo que a chave privada VAPID nunca seja transmitida em texto puro.

### 2.2. Contato (Contact)
Quando um usuário recebe uma mensagem (ou adiciona manualmente um perfil), o emissor é salvo localmente como um **contato**. O contato armazena a subscription e as chaves públicas do emissor, permitindo que o receptor responda no futuro sem a necessidade de um novo perfil.

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
  status: 'pendente' | 'enviando' | 'enviada' | 'falha';
  tentativas: number;              // Número de tentativas de envio
  createdAt: number;
  updatedAt: number;
  erro?: string;                   // Mensagem de erro, se houver
}
```
**Constante:** `MAX_TENTATIVAS = 3` (número máximo de tentativas antes de marcar como falha).

---

## 3. Armazenamento IndexedDB – Detalhamento

O sistema utiliza as seguintes stores (bancos) no IndexedDB, gerenciadas pela biblioteca `idb-keyval`:

| Nome da Store (`DB_NAMES`) | Chave | Valor | Finalidade |
| :--- | :--- | :--- | :--- |
| `AppConfig_DB` | `"profile"` | `ProfileConfig` | **Store unificada** – contém todos os dados do perfil do usuário: nome, e-mail, chaves VAPID (pública e privada em JWK), envelope da chave privada VAPID, chaves RSA (pública e privada em JWK) e subscription. |
| `BrowserB_Contatos_DB` | **Hash SHA-256** (hex) da chave VAPID pública | `Contato` | Armazena todos os contatos conhecidos. A chave é um hash para evitar problemas de capitalização e inconsistências de serialização. |
| `BrowserB_MensagensRecebidas_DB` | `msg_<timestamp>_<random>` | `MensagemRecebida` | Armazena mensagens recebidas. O campo `contatoPublicKeyVapid` referencia a chave hash do contato correspondente. |
| `BrowserA_MensagensEnviadas_DB` | `msg_<timestamp>_<random>` | `MensagemEnviada` | Fila de mensagens aguardando envio (offline-first). O status e o contador de tentativas permitem gerenciar o fluxo de envio. |

**Observações importantes:**
- **A store `AppConfig_DB` substitui as antigas stores `BrowserA_Identidade_DB`, `BrowserB_E2E_Chaves_DB`, `BrowserB_Vapid_DB` e `BrowserB_Subscription_DB`**, eliminando a duplicação de dados e centralizando todas as informações do perfil.
- **Todas as chaves privadas** (VAPID e RSA) são persistidas como **JWK** dentro do `ProfileConfig`. Isso garante que, ao recarregar a página, o usuário não perca suas chaves, mantendo a capacidade de assinar e decifrar mensagens.
- **O envelope da chave privada VAPID** (`vapidPrivateKeyEnvelope`) é armazenado no perfil para que o Service Worker possa incluí-lo no payload da mensagem sem precisar cifrá-lo novamente a cada envio.
- **A store `BrowserA_Bundles_DB` foi removida** – o bundle do emissor é construído dinamicamente a partir do perfil unificado e do contato sempre que necessário.
- **A store `BrowserA_MensagensEnvio_DB` foi renomeada para `BrowserA_MensagensEnviadas_DB`** e sua estrutura foi simplificada para armazenar apenas os dados essenciais da mensagem, transferindo a lógica de cifragem e envio para o Service Worker.

**Geração do Hash do Contato:**
Para evitar diferenças de capitalização (ex: `"EC"` vs `"ec"`, `"P-256"` vs `"p-256"`), a chave primária da store de contatos é um **hash SHA-256** da string normalizada em minúsculo: `${kty}|${crv}|${x}|${y}` (extraídos da chave pública VAPID). Isso garante que a mesma chave pública gere sempre o mesmo hash, independentemente de como foi serializada.

---

## 4. Fluxos Detalhados

### 4.1. Geração do Perfil
**Função:** `gerarProfile()` em `src/app.tsx`

1. **Verificação de permissões**: Checa se a permissão de notificação está concedida; caso contrário, solicita.
2. **Registro do Service Worker**: Registra ou obtém a instância do Service Worker.
3. **Geração/obtenção de chaves VAPID**: Tenta carregar do perfil existente; caso não existam, gera um novo par ECDSA P-256 (`extractable: true`).
4. **Geração/obtenção de chaves RSA**: Tenta carregar do perfil existente; caso não existam, gera um novo par RSA-OAEP-256 (`extractable: true`).
5. **Obtenção da subscription**: Obtém a subscription do `PushManager` do navegador, usando a chave pública VAPID como `applicationServerKey`; reutiliza a subscription existente se ainda for válida.
6. **Busca da chave pública do servidor**: Faz uma requisição GET para `/api/server-public-key` para obter a chave pública RSA do servidor proxy.
7. **Cifragem da chave privada VAPID**: A chave privada VAPID (em JWK) é cifrada com AES-GCM, e a chave simétrica é cifrada com RSA-OAEP usando a chave pública do servidor. O envelope resultante é colocado no campo `k` do perfil público e também salvo no campo `vapidPrivateKeyEnvelope` do `ProfileConfig`.
8. **Montagem do perfil público**: Combina `iss` (email), `nm` (nome), `kid` (chave pública VAPID), `s` (subscription), `p` (chave pública RSA), e `k` (chave privada VAPID cifrada).
9. **Persistência do perfil unificado**: Salva todos os dados (nome, email, chaves VAPID e RSA em JWK, envelope VAPID, subscription) na store `AppConfig_DB` com a chave `"profile"`.
10. **Exibição**: O perfil público é mostrado em uma área de texto para o usuário copiar.

### 4.2. Adição de Contato
**Função:** `adicionarContato()` em `src/app.tsx`

1. O usuário cola um perfil JSON em uma textarea e clica em "Adicionar Contato".
2. Valida a estrutura do perfil (verifica campos obrigatórios).
3. **Importa a chave pública VAPID** (campo `kid`) para validar o formato.
4. Cria um objeto `Contato` com os dados do perfil (`homologado: false`).
5. **Gera o hash** da chave pública VAPID utilizando a função `serializarPublicKeyVapid`.
6. Salva o contato na store `BrowserB_Contatos_DB` usando o hash como chave.
7. Atualiza a interface: lista de contatos e dropdown de seleção.

### 4.3. Envio de Mensagem – App
**Função:** `enviarMensagemB()` em `src/app.tsx`

1. O usuário seleciona um contato no dropdown e digita a mensagem.
2. Recupera o contato completo do IndexedDB usando o hash selecionado.
3. **Salva a mensagem na fila de envio** (`BrowserA_MensagensEnviadas_DB`) com:
   - `contatoHash`: hash do contato
   - `conteudo`: texto original
   - `status: 'pendente'`
   - `tentativas: 0`
4. **Notifica o Service Worker** via `postMessage` com o tipo `PROCESSAR_FILA_ENVIO`.
5. O Service Worker processará a mensagem em background (offline-first).

### 4.4. Processamento do Envio – Service Worker
**Função:** `processarFilaEnvio()` em `src/sw/sw-mensagens.js`

1. O Service Worker recebe a mensagem da página via `postMessage` ou é ativado por eventos de sincronização (`sync`) ou conexão online.
2. Busca todas as mensagens com status `'pendente'` ou `'enviando'` com `updatedAt` há mais de 30 segundos.
3. Para cada mensagem:
   - Atualiza status para `'enviando'`.
   - Busca o contato pelo `contatoHash` e o perfil (store `AppConfig_DB`).
   - **Validações:**
     - Perfil: `e2ePublicKey`, `vapidPublicKey`, `vapidPrivateKeyJwk`, `vapidPrivateKeyEnvelope`, `subscription` → senão, erro "Usuário não logado (sem Chaves)" ou "Mensagens Web Push não configurada (sem Subscription)".
     - Contato: `publicKeyRSA`, `publicKeyVapid`, `vapidPrivateKey`, `subscription` → senão, erro "Contato sem Chaves" ou "Contato sem Subscription".
   - **Monta o payloadObj:**
     ```js
     {
       c: msg.conteudo,
       e: {
         s: {
           e: profile.subscription.endpoint,
           k: profile.subscription.keys,
           v: profile.vapidPrivateKeyEnvelope // envelope cifrado para o proxy
         },
         p: profile.e2ePublicKey
       }
     }
     ```
   - **Cifra o payloadObj:**
     - Serializa e compacta com Gzip.
     - Gera chave AES-GCM e IV.
     - Cifra os dados comprimidos com AES-GCM.
     - Cifra a chave AES com a chave pública RSA do contato.
     - Monta envelope: `{ i: base64IV, d: base64Dados, k: base64ChaveAES }`.
   - **Constrói o JWT:**
     - Header: `{ alg: "ES256" }`.
     - Payload: `{ iss: profile.email, sub: contato.email, ct: envelopeJSON, p: profile.vapidPublicKey, nm: profile.name }`.
     - Assina com a chave privada VAPID do emissor (importada de `profile.vapidPrivateKeyJwk`).
   - **Envia para o servidor proxy**: POST para `/api/proxy-push` com:
     ```json
     {
       "subscription": contato.subscription,
       "payloadText": jwt,
       "vapid": {
         "subject": `mailto:${contato.email}`,
         "publicKey": contato.publicKeyVapid,
         "privateKey": contato.vapidPrivateKey // envelope cifrado
       }
     }
     ```
   - **Atualiza status:**
     - Sucesso: `'enviada'`.
     - Falha: incrementa `tentativas`. Se `tentativas >= MAX_TENTATIVAS` (3), marca como `'falha'`; caso contrário, volta para `'pendente'`.

### 4.5. Recebimento da Mensagem – Service Worker (`push.js`)
1. O Service Worker recebe o evento `push` contendo o JWT no `event.data.text()`.
2. Divide o JWT em header, payload e signature.
3. **Verifica a assinatura** usando a chave pública VAPID do emissor (campo `p` do payload) e o algoritmo ECDSA P-256.
4. Se a assinatura for inválida, descarta a mensagem e exibe notificação de erro.
5. **Decifra o envelope**:
   - Obtém a chave privada RSA do receptor a partir do perfil unificado (`ProfileConfig.e2ePrivateKeyJwk`), importando-a como CryptoKey.
   - Decodifica `iv`, `dados` e `k` do envelope.
   - Descriptografa a chave AES usando RSA-OAEP.
   - Descriptografa os dados com AES-GCM.
   - Descomprime (gunzip) o resultado, obtendo o objeto JSON original (agora com estrutura simplificada `{ c, e }`).
6. **Salva/Atualiza o Contato**:
   - Extrai `subscription`, `publicKeyRSA` e `vapidPrivateKey` do objeto decifrado (agora `e.s`).
   - Gera o hash da chave pública VAPID do emissor (do campo `p` do JWT).
   - Busca um contato existente pelo hash.
   - Se não existir, cria um novo contato com os dados extraídos e o nome vindo de `nm` (ou fallback para o email). Se já existir, atualiza o nome e outros dados se necessário.
   - Salva o contato na store `BrowserB_Contatos_DB`.
7. **Salva a Mensagem**:
   - Gera um ID único.
   - Cria um objeto `MensagemRecebida` com o hash do contato, conteúdo decifrado (`c` do objeto), status `'nao_lida'` e timestamp.
   - Salva na store `BrowserB_MensagensRecebidas_DB`.
8. **Exibe notificação nativa** com o nome do remetente (buscado do contato) e o conteúdo.
9. **Notifica as páginas abertas** via `postMessage` com tipo `PUSH_RECEIVED`, para que a UI seja atualizada em tempo real.

### 4.6. Resposta (Responder)
1. Na interface de mensagens recebidas, cada mensagem tem um botão "Responder".
2. Ao clicar, o sistema obtém o hash do contato a partir da mensagem (campo `contatoPublicKeyVapid`).
3. Busca o contato completo no IndexedDB.
4. Preenche o dropdown de seleção de contatos com esse contato (via `select.value`) e navega para a aba de envio.
5. O usuário digita a mensagem e o fluxo de envio (4.3 e 4.4) é executado, enviando a mensagem de volta para o emissor original.

---

## 5. Segurança e Criptografia

| Etapa | Algoritmo/Esquema | Detalhe |
| :--- | :--- | :--- |
| **Assinatura do JWT** | ECDSA P-256 (`ES256`) | Garante que a mensagem não foi adulterada e autentica o emissor. |
| **Cifragem do envelope** | AES-GCM (256 bits) | Cifra o conteúdo da mensagem, garantindo confidencialidade. |
| **Cifragem da chave AES** | RSA-OAEP-256 | A chave AES é cifrada com a chave pública RSA do receptor, permitindo que apenas o receptor (com a chave privada) possa decifrá-la. |
| **Compressão** | Gzip | Reduz o tamanho do payload (necessário devido ao limite de 4096 bytes do Web Push). |
| **Chave privada VAPID** | Envelope RSA-AES (servidor) | A chave privada VAPID do emissor viaja cifrada no perfil. Apenas o servidor proxy (que possui a chave privada RSA correspondente) pode decifrá-la, evitando exposição no cliente. |
| **Persistência de chaves** | IndexedDB (local) | As chaves privadas (VAPID e RSA) são armazenadas em JWK no IndexedDB. Embora não sejam cifradas adicionalmente, o acesso é restrito ao domínio e ao navegador, sendo adequado para protótipos. |

**Observações sobre o limite de 4096 bytes:** O Web Push impõe um limite de 4096 bytes para o payload. Para respeitar esse limite, o sistema utiliza compressão gzip, campos curtos (`ct`, `p`, `nm`) e estrutura compacta do envelope. O tamanho típico do JWT fica em torno de 3700-3800 bytes.

---

## 6. Estrutura do Projeto (Arquivos Relevantes)

| Arquivo | Responsabilidade |
| :--- | :--- |
| `src/app.tsx` | Interface principal (UI) e lógica de negócio (geração de perfil, adição de contato, criação de mensagens na fila). |
| `src/sw/sw-mensagens.js` | Gerencia filas de envio offline. Processa mensagens pendentes: monta payloadObj, cifra, constrói JWT e envia ao servidor proxy. Gerencia tentativas e status. |
| `src/sw/push.js` | Lida com o evento `push`. Verifica assinatura, decifra envelope, salva contato e mensagem no IndexedDB, exibe notificação. |
| `src/sw/cache.js` | Gerencia cache offline para os assets estáticos (HTML, CSS, JS). |
| `src/sw/click.js` | Lida com o evento `notificationclick` – redireciona para a página principal. |
| `src/constants/db.ts` | Define nomes das stores, constantes (`MAX_TENTATIVAS`) e interfaces TypeScript para `ProfileConfig`, `MensagemEnviada`, `MensagemRecebida` e `Contato`. |
| `src/utils/db-helpers.ts` | Funções auxiliares para operações IndexedDB: salvar/buscar perfil, contatos, mensagens enviadas/recebidas, serialização de chaves. |
| `main.ts` | Servidor Deno (proxy). Endpoints: `/api/server-public-key` (retorna chave pública RSA) e `/api/proxy-push` (recebe JSON com subscription e payload, descriptografa a chave privada VAPID, assina e encaminha para o endpoint de push). |
| `build.ts` | Script de build usando `Deno.bundle` com entrypoints HTML. Compila `index.html` (que referencia `app.tsx`), gera bundle JS e atualiza o HTML. Também compila o Service Worker separadamente e injeta lista de assets e hash de versão. |

---

## 7. Build e Execução

### Build
O projeto utiliza **Deno** com `build.ts` para bundling:
- O arquivo `src/index.html` é usado como entrypoint. O Deno bundler detecta a tag `<script src="./app.tsx" type="module">` e compila o código, gerando um arquivo JS com hash e atualizando o HTML.
- O Service Worker é compilado separadamente em modo IIFE e tem seu conteúdo pós-processado para substituir `VERSION_HASH` e `__GENERATED_ASSETS__` pela lista de assets a cachear.

**Observação sobre o CSS:**  
O arquivo `src/styles.css` é importado no `app.tsx` via `import "./styles.css"`. Para que o TypeScript não reclame, criamos um arquivo de declaração (`src/styles.d.ts`) que declara o módulo `.css`. O `Deno.bundle`, ao processar o HTML, reconhece a tag `<link rel="stylesheet" href="./styles.css">` e copia o arquivo CSS para a pasta `dist/`, garantindo que o estilo seja carregado corretamente. A importação no código é mantida para compatibilidade com ferramentas de build futuras e para que o CSS seja tratado como dependência do módulo.

Comando:
```bash
deno task build
```

### Execução do Servidor
O servidor proxy é iniciado com:
```bash
deno task start
```
Ele roda na porta 8000 e serve os arquivos estáticos da pasta `dist/`. Também fornece os endpoints `/api/server-public-key` (GET) e `/api/proxy-push` (POST).

---

## 8. Estado Atual e Pontos de Atenção

- **Perfil unificado**: Todas as informações do usuário (nome, e-mail, chaves VAPID e RSA completas, subscription) são armazenadas em uma única store (`AppConfig_DB`), eliminando duplicação e inconsistências.
- **Persistência de chaves privadas**: Tanto a chave privada VAPID quanto a chave privada RSA são armazenadas como JWK no perfil, garantindo que permaneçam disponíveis após recarregar a página. O envelope da chave privada VAPID (`vapidPrivateKeyEnvelope`) também é persistido, evitando recifragem a cada envio.
- **Fila de envio simplificada**: As mensagens enviadas são armazenadas com status e contador de tentativas, e o Service Worker é responsável por todo o processo de cifragem, montagem do JWT e envio. Isso torna o app mais leve e resiliente.
- **Chave de Contato**: A migração para o hash SHA-256 está completa. Todos os contatos são armazenados com chave hash. As mensagens recebidas salvam o hash do contato (`contatoPublicKeyVapid`).
- **Identificação do Emissor**: O campo `nm` (nome) é incluído no payload do JWT. O Service Worker extrai esse campo para salvar ou atualizar o nome do contato, garantindo que as mensagens exibam o nome correto.
- **Limitação de Payload**: O JWT total deve ser inferior a 4096 bytes. O sistema utiliza compressão gzip, campos curtos (`ct`, `p`, `nm`) e estrutura compacta do envelope.
- **Homologação**: A homologação é um campo booleano no contato, utilizado apenas para fins de interface (ex: exibir "Homologado" ou "Não homologado"). Não bloqueia o recebimento de mensagens.
- **Service Worker**: Durante o desenvolvimento, é necessário desregistrar o Service Worker manualmente (Application → Service Workers → Unregister) e recarregar a página para que a nova versão seja carregada, devido ao cache agressivo.
- **Remoção do Bundle**: A store `BrowserA_Bundles_DB` foi removida. O bundle do emissor é construído dinamicamente a partir do perfil unificado e do contato sempre que necessário.

---

## 9. Próximos Passos

- **Consistência de chaves**: Verificar se todas as operações de contato e mensagem usam corretamente o hash SHA-256, e se não há divergências entre os campos de referência.
- **Atualização de contatos**: Garantir que, ao receber uma nova mensagem de um contato existente, o nome e outros dados sejam atualizados corretamente.
- **Otimização de performance**: Avaliar consultas ao IndexedDB e possíveis índices.
- **Validação do fluxo de resposta**: Testar exaustivamente a resposta, assegurando que a chave privada VAPID cifrada seja corretamente utilizada.
- **Segurança adicional**: Avaliar a possibilidade de cifrar as chaves privadas armazenadas no IndexedDB com uma senha ou chave derivada.

---

## 10. Glossário de Termos

| Termo | Significado |
| :--- | :--- |
| **VAPID** | Voluntary Application Server Identification – mecanismo para identificar o servidor de aplicação ao serviço de push. Utiliza chaves ECDSA. |
| **JWK** | JSON Web Key – formato para representar chaves criptográficas. |
| **JWT** | JSON Web Token – token assinado usado para transportar informações entre partes. |
| **FCM** | Firebase Cloud Messaging – serviço de push da Google (utilizado no Chrome). |
| **APNs** | Apple Push Notification service – serviço de push da Apple. |
| **E2EE** | End-to-End Encryption – criptografia de ponta a ponta. |
| **Subscription** | Objeto que representa a inscrição de um navegador no serviço de push, contendo endpoint e chaves de cifragem. |
| **Proxy Server** | Servidor intermediário que encaminha requisições, neste caso, para o FCM, após assiná-las com a chave privada VAPID. |
| **Envelope** | Estrutura contendo `iv`, `dadosCifrados` e `chaveAesCifrada`, usada para transportar a mensagem cifrada. |
| **MAX_TENTATIVAS** | Constante que define o número máximo de tentativas de envio antes de marcar uma mensagem como falha (padrão 3). |


---

## ✅ Resumo das Atualizações no README

- **Seção 2.3**: Adicionada estrutura de `MensagemEnviada` e constante `MAX_TENTATIVAS`.
- **Seção 3**: Atualizada a tabela de stores com os novos nomes e descrições, incluindo `AppConfig_DB` e `BrowserA_MensagensEnviadas_DB`. Destacada a remoção de `BrowserA_Bundles_DB`.
- **Seção 4.3 e 4.4**: Dividido o fluxo de envio em duas partes: App (criação da mensagem na fila) e Service Worker (processamento completo), detalhando o novo `payloadObj`, as validações e a cifragem.
- **Seção 4.5**: Atualizada a estrutura do objeto decifrado no push para `{ c, e }` e o campo `vapidPrivateKey` agora em `e.s.v`.
- **Seção 6**: Atualizada a tabela de arquivos para refletir as novas responsabilidades.
- **Seção 8**: Atualizado o estado atual com as novas características (perfil unificado, persistência de chaves, fila simplificada).