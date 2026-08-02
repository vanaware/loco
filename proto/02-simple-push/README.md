# 📡 Web Push Descentralizado – Protótipo Detalhado

## 1. Objetivo Geral

Este protótipo implementa um sistema de mensagens **descentralizado** utilizando a API **Web Push** (especificamente via FCM no Chrome) como transporte. O objetivo é permitir que dois navegadores (ou mais) troquem mensagens diretamente, sem a necessidade de um servidor central para armazenar mensagens ou gerenciar contatos.

Cada navegador atua como um **ponto autônomo**:
- **Emissor**: envia mensagens para outro usuário.
- **Receptor**: recebe mensagens e pode responder.

A infraestrutura mínima necessária é um **servidor proxy** (fornecido neste projeto em Deno) que:
- Fornece uma chave pública RSA usada para cifrar a chave privada VAPID durante a troca de perfis.
- Reencaminha as requisições push ao serviço de push (FCM), após descriptografar a chave privada VAPID para assinar o cabeçalho de autorização.

Não há banco de dados central, nem filas compartilhadas: cada navegador mantém seu próprio **IndexedDB** com contatos e histórico de mensagens.

---

## 2. Conceitos Fundamentais

### 2.1. Perfil (Profile)
Um **perfil** é um objeto JSON público gerado por cada usuário. Ele contém todas as informações necessárias para que outros possam enviar-lhe mensagens push. O perfil deve ser transferido fora de banda (por exemplo, copiando e colando) do receptor para o emissor.

**Estrutura do Perfil:**
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

---

## 3. Armazenamento IndexedDB – Detalhamento

O sistema utiliza as seguintes stores (bancos) no IndexedDB, gerenciadas pela biblioteca `idb-keyval`:

| Nome da Store (`DB_NAMES`) | Chave | Valor | Finalidade |
| :--- | :--- | :--- | :--- |
| `BrowserB_Contatos_DB` | **Hash SHA-256** (hex) da chave VAPID pública serializada | `Contato` | Armazena todos os contatos conhecidos. A chave é um hash para evitar problemas de capitalização (case-insensitive) e inconsistências de serialização. |
| `BrowserB_MensagensRecebidas_DB` | `msg_<timestamp>_<random>` | `MensagemRecebida` | Armazena mensagens recebidas. O campo `contatoPublicKeyVapid` referencia a chave hash do contato correspondente. |
| `BrowserA_Identidade_DB` | `identidade_a` | `IdentidadeA` | Armazena a chave privada VAPID do usuário local (como `CryptoKey`), usada para assinar JWT. |
| `BrowserA_MensagensEnvio_DB` | `msg_<timestamp>_<random>` | `MensagemEnvio` | Fila de mensagens aguardando envio (offline-first). |
| `BrowserB_Subscription_DB` | `subscription_b` | `SubscriptionData` | Armazena a subscription atual do usuário. |
| `BrowserA_Bundles_DB` | `bundle_ativo`, `bundle_historico` | `BundleData` | Armazena o perfil/bundle atual do usuário e histórico (para referência). |

**Geração do Hash do Contato:**
Para evitar diferenças de capitalização (ex: `"EC"` vs `"ec"`, `"P-256"` vs `"p-256"`), a chave primária da store de contatos é um **hash SHA-256** da string normalizada em minúsculo: `${kty}|${crv}|${x}|${y}` (extraídos da chave pública VAPID). Isso garante que a mesma chave pública gere sempre o mesmo hash, independentemente de como foi serializada.

---

## 4. Fluxos Detalhados

### 4.1. Geração do Perfil
**Função:** `gerarProfile()` em `src/app.tsx`

1. **Verificação de permissões**: Checa se a permissão de notificação está concedida; caso contrário, solicita.
2. **Registro do Service Worker**: Registra ou obtém a instância do Service Worker.
3. **Geração de chaves VAPID**: Gera um par de chaves ECDSA P-256 (`vapidKeyPair`).
4. **Geração de chaves RSA**: Gera um par de chaves RSA-OAEP-256 (`encryptionKeyPair`).
5. **Obtenção da subscription**: Obtém a subscription do `PushManager` do navegador, usando a chave pública VAPID como `applicationServerKey`.
6. **Busca da chave pública do servidor**: Faz uma requisição GET para `/api/server-public-key` para obter a chave pública RSA do servidor proxy.
7. **Cifragem da chave privada VAPID**:
   - A chave privada VAPID (em JWK) é cifrada com AES-GCM usando uma chave simétrica gerada aleatoriamente.
   - A chave simétrica é cifrada com RSA-OAEP usando a chave pública do servidor.
   - O resultado é um envelope JSON com `iv`, `dadosCifrados` e `chaveAesCifrada`, codificado em Base64. Esse envelope é colocado no campo `k` do perfil.
8. **Montagem do perfil**: Combina `iss` (email), `nm` (nome), `kid` (chave pública VAPID), `s` (subscription), `p` (chave pública RSA), e `k` (chave privada VAPID cifrada).
9. **Persistência**: Salva o perfil no IndexedDB (`bundle_ativo`) e também em histórico.
10. **Exibição**: O perfil é mostrado em uma área de texto para o usuário copiar.

### 4.2. Adição de Contato
**Função:** `adicionarContato()` em `src/app.tsx`

1. O usuário cola um perfil JSON em uma textarea e clica em "Adicionar Contato".
2. Valida a estrutura do perfil (verifica campos obrigatórios).
3. **Importa a chave pública VAPID** (campo `kid`) usando `crypto.subtle.importKey` com algoritmo `ECDSA` e `namedCurve: "P-256"` para validar o formato. Se falhar, o perfil é rejeitado.
4. Cria um objeto `Contato` com os dados do perfil (`homologado: false`).
5. **Gera o hash** da chave pública VAPID utilizando a função `serializarPublicKeyVapid` (que normaliza e aplica SHA-256).
6. Salva o contato no IndexedDB (`BrowserB_Contatos_DB`) usando o hash como chave.
7. Atualiza a interface: lista de contatos e dropdown de seleção.

### 4.3. Envio de Mensagem
**Função:** `enviarMensagemB()` em `src/app.tsx`

1. O usuário seleciona um contato no dropdown (populado com os hashes) e digita a mensagem.
2. Recupera o contato completo do IndexedDB usando o hash selecionado.
3. **Prepara o objeto da mensagem**:
   ```javascript
   const mensagemObj = {
     m: { c: conteudo },           // m = message, c = content (curto)
     e: {
       s: {                         // subscription do emissor (para resposta)
         e: subscription.endpoint,
         k: subscription.keys
       },
       p: publicKeyEncrypt,         // chave pública RSA do emissor
       v: { k: vapidPrivateCifrada } // chave privada VAPID cifrada do emissor
     }
   };
   ```
4. **Comprime** o JSON com Gzip.
5. **Gera uma chave AES-GCM** e IV aleatório.
6. **Cifra os dados comprimidos** com AES-GCM.
7. **Cifra a chave AES** com a chave pública RSA do contato (usando RSA-OAEP).
8. Monta o envelope:
   ```json
   { "i": iv_base64, "d": dados_cifrados_base64, "k": chave_aes_cifrada_base64 }
   ```
9. **Constrói o JWT**:
   - Header: `{ "alg": "ES256" }`
   - Payload: 
     ```json
     {
       "iss": email_do_emissor,
       "sub": email_do_receptor,
       "ct": envelope_json_string,
       "p": publicKeyVapid_do_emissor,
       "nm": nome_do_emissor
     }
     ```
10. **Assina o JWT** usando a chave privada VAPID do emissor (ECDSA) – obtida da store `IdentidadeA`.
11. **Salva a mensagem** na store de envio (`BrowserA_MensagensEnvio_DB`) com status `'pendente'`.
12. **Envia uma mensagem ao Service Worker** via `postMessage` com tipo `ENVIAR_MENSAGEM`, contendo o bundle e o JWT.
13. O Service Worker tentará enviar imediatamente ou mais tarde (offline).

### 4.4. Processamento do Envio (Service Worker – `sw-mensagens.js`)
1. O Service Worker recebe a mensagem da página via `postMessage`.
2. Salva a mensagem na store `BrowserA_MensagensEnvio_DB` (se ainda não foi salva).
3. Dispara a função `processarFilaEnvio()`.
4. Para cada mensagem pendente (status `'pendente'` ou `'enviando'` há mais de 30 segundos):
   - Atualiza status para `'enviando'`.
   - Chama `enviarMensagemParaServidor(mensagem)`, que faz uma requisição HTTP POST para `/api/proxy-push` no servidor Deno, com os campos: `subscription`, `payloadText` (JWT), `vapid` (objeto com chaves), e `isVapidEncrypted: true`.
   - Se a resposta for bem-sucedida, atualiza status para `'enviada'`. Em caso de erro, incrementa tentativas e, se exceder o máximo, marca como `'falha'`.
5. A sincronização em segundo plano (`sync` event) também pode disparar esse processo quando a conexão for restaurada.

### 4.5. Recebimento da Mensagem (Service Worker – `push.js`)
1. O Service Worker recebe o evento `push` contendo o JWT no `event.data.text()`.
2. Divide o JWT em header, payload e signature.
3. **Verifica a assinatura**:
   - Extrai o payload (Base64Url decodificado) e obtém `iss` (email), `nm` (nome), `p` (chave pública VAPID do emissor), `ct` (envelope).
   - Verifica se `p` é uma chave válida e importa-a como `CryptoKey` para `ECDSA`.
   - Decodifica a assinatura e verifica a integridade do JWT.
4. Se a assinatura for inválida, descarta a mensagem e exibe notificação de erro.
5. **Decifra o envelope**:
   - Obtém a chave privada RSA do receptor (armazenada em `storeChavesE2E`).
   - Decodifica `iv`, `dados` e `k` do envelope.
   - Descriptografa a chave AES usando RSA-OAEP.
   - Descriptografa os dados com AES-GCM.
   - Descomprime (gunzip) o resultado, obtendo o objeto JSON original.
6. **Salva/Atualiza o Contato**:
   - Extrai `subscription`, `publicKeyRSA` e `vapidPrivateKey` do objeto decifrado.
   - Gera o hash da chave pública VAPID do emissor (do campo `p` do JWT).
   - Busca um contato existente pelo hash.
   - Se não existir, cria um novo contato com os dados extraídos e o nome vindo de `nm` (ou fallback para o email). Se já existir, atualiza o nome e outros dados se necessário.
   - Salva o contato na store `BrowserB_Contatos_DB`.
7. **Salva a Mensagem**:
   - Gera um ID único.
   - Cria um objeto `MensagemRecebida` com o hash do contato, conteúdo decifrado, status `'nao_lida'` e timestamp.
   - Salva na store `BrowserB_MensagensRecebidas_DB`.
8. **Exibe notificação nativa** com o nome do remetente e o conteúdo.
9. **Notifica as páginas abertas** via `postMessage` com tipo `PUSH_RECEIVED`, para que a UI seja atualizada em tempo real.

### 4.6. Resposta (Responder)
1. Na interface de mensagens recebidas, cada mensagem tem um botão "Responder".
2. Ao clicar, o sistema obtém o hash do contato a partir da mensagem (campo `contatoPublicKeyVapid`).
3. Busca o contato completo no IndexedDB.
4. Preenche o dropdown de seleção de contatos com esse contato (via `select.value`) e navega para a aba de envio.
5. O usuário digita a mensagem e o fluxo de envio (4.3) é executado, enviando a mensagem de volta para o emissor original.

---

## 5. Segurança e Criptografia

| Etapa | Algoritmo/Esquema | Detalhe |
| :--- | :--- | :--- |
| **Assinatura do JWT** | ECDSA P-256 (`ES256`) | Garante que a mensagem não foi adulterada e autentica o emissor. |
| **Cifragem do envelope** | AES-GCM (256 bits) | Cifra o conteúdo da mensagem, garantindo confidencialidade. |
| **Cifragem da chave AES** | RSA-OAEP-256 | A chave AES é cifrada com a chave pública RSA do receptor, permitindo que apenas o receptor (com a chave privada) possa decifrá-la. |
| **Compressão** | Gzip | Reduz o tamanho do payload (necessário devido ao limite de 4096 bytes do Web Push). |
| **Chave privada VAPID** | Envelope RSA-AES (servidor) | A chave privada VAPID do emissor viaja cifrada no perfil. Apenas o servidor proxy (que possui a chave privada RSA correspondente) pode decifrá-la, evitando exposição no cliente. |

**Observações sobre o limite de 4096 bytes:** O Web Push impõe um limite de 4096 bytes para o payload. Para respeitar esse limite, o sistema utiliza compressão gzip, campos curtos (ex: `ct`, `p`, `nm`) e estrutura compacta do envelope. O tamanho típico do JWT fica em torno de 3700-3800 bytes.

---

## 6. Estrutura do Projeto (Arquivos Relevantes)

| Arquivo | Responsabilidade |
| :--- | :--- |
| `src/app.tsx` | Interface principal (UI) e lógica de negócio (geração de perfil, envio, recebimento via SW). Usa `preact` para componentes, mas é um arquivo único. |
| `src/sw/push.js` | Lida com o evento `push`. Verifica assinatura, decifra envelope, salva contato e mensagem no IndexedDB, exibe notificação. |
| `src/sw/sw-mensagens.js` | Gerencia filas de envio offline. Escuta mensagens da página (`postMessage`) e envia ao servidor proxy. |
| `src/sw/cache.js` | Gerencia cache offline para os assets estáticos (HTML, CSS, JS). |
| `src/sw/click.js` | Lida com o evento `notificationclick` – redireciona para a página principal. |
| `src/constants/db.ts` | Define nomes das stores e interfaces TypeScript para contato, mensagem, etc. |
| `src/utils/db-helpers.ts` | Funções auxiliares para operações IndexedDB: `salvarContato`, `buscarContatoPorChave`, `serializarPublicKeyVapid` (hash SHA-256). |
| `main.ts` | Servidor Deno (proxy). Endpoints: `/api/server-public-key` (retorna chave pública RSA) e `/api/proxy-push` (recebe JSON com subscription e payload, descriptografa a chave privada VAPID, assina e encaminha para o endpoint de push). |
| `build.ts` | Script de build usando `Deno.bundle` com entrypoints HTML. Compila `index.html` (que referencia `app.tsx`), gera bundle JS e atualiza o HTML. Também compila o Service Worker separadamente e injeta lista de assets e hash de versão. |

---

## 7. Build e Execução

### Build
O projeto utiliza **Deno** com `build.ts` para bundling:
- O arquivo `src/index.html` é usado como entrypoint. O Deno bundler detecta a tag `<script src="./app.tsx" type="module">` e compila o código, gerando um arquivo JS com hash e atualizando o HTML.
- O Service Worker é compilado separadamente em modo IIFE e tem seu conteúdo pós-processado para substituir `VERSION_HASH` e `__GENERATED_ASSETS__` pela lista de assets a cachear.

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

- **Chave de Contato**: A migração para o hash SHA-256 está completa. Todos os contatos são armazenados com chave hash. As mensagens recebidas salvam o hash do contato (`contatoPublicKeyVapid`).
- **Identificação do Emissor**: O campo `nm` (nome) é incluído no payload do JWT. O Service Worker extrai esse campo para salvar ou atualizar o nome do contato, garantindo que as mensagens exibam o nome correto.
- **Limitação de Payload**: O JWT total deve ser inferior a 4096 bytes. O sistema utiliza compressão gzip, campos curtos (`ct`, `p`, `nm`) e estrutura compacta do envelope.
- **Homologação**: A homologação é um campo booleano no contato, utilizado apenas para fins de interface (ex: exibir "Homologado" ou "Não homologado"). Não bloqueia o recebimento de mensagens.
- **Service Worker**: Durante o desenvolvimento, é necessário desregistrar o Service Worker manualmente (Application → Service Workers → Unregister) e recarregar a página para que a nova versão seja carregada, devido ao cache agressivo.

---

## 9. Próximos Passos (Contexto para a Próxima IA)

A próxima iteração deverá focar na **revisão da estrutura de dados no IndexedDB**, incluindo:
1. **Consistência de chaves**: Verificar se todas as operações de contato e mensagem usam corretamente o hash SHA-256, e se não há divergências entre os campos de referência.
2. **Atualização de contatos**: Garantir que, ao receber uma nova mensagem de um contato existente, o nome e outros dados sejam atualizados corretamente.
3. **Limpeza de dados obsoletos**: Avaliar a possibilidade de remover stores ou campos que não são mais usados (ex: `BrowserB_ListaBranca_DB` ou campos antigos de mensagens).
4. **Otimização de performance**: Verificar se as consultas ao IndexedDB são eficientes e se há índices que poderiam ser criados.
5. **Validação do fluxo de resposta**: Testar exaustivamente o fluxo de resposta, assegurando que a chave privada VAPID cifrada (`vapidPrivateKey`) seja corretamente utilizada para montar o bundle de resposta.

Além disso, considere a **documentação de testes manuais** e, se possível, a criação de um conjunto básico de testes unitários para as funções críticas (ex: serialização de chave, cifragem/decifragem).

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
