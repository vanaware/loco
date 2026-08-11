# 🤝 Arquitetura do Roteador de Handshakes (Loco)

Este documento descreve a especificação técnica do **Roteador Genérico de Handshakes** do **Loco**, detalhando o funcionamento da máquina de estados assíncrona *Offline-First*, os módulos especializados de rotas, o mecanismo de injeção de carona (*Piggybacking*) e a auditoria de confiança mútua.

---

## 1. Visão Geral e Filosofia

No **Loco**, não existem fluxos de rede isolados para mensagens de texto, imagens ou comandos de sistema. **Toda e qualquer comunicação na rede é um Handshake de sincronização de estados.**

O Roteador (`src/sw/sw-handshakes.ts`) opera dentro do Service Worker como uma **Máquina de Estados assíncrona** responsável por coordenar a persistência local e o transporte criptográfico E2E.

A arquitetura organiza o ciclo de vida de cada interação em duas vias principais dentro da tabela `Handshake_DB`:

* **`FluxoIn` (Entrada):** Pacotes recebidos da rede, descriptografados pelo Service Worker e enfileirados para processamento local por módulos especialistas.
* **`FluxoOut` (Saída):** Pacotes preparados pela UI ou Service Worker, enfileirados, comprimidos e cifrados para envio assíncrono.

---

## 2. Estrutura de Dados no IndexedDB (`Handshake_DB`)

Todas as interações criam ou atualizam registros na tabela `Handshake_DB` (gerenciada via `src/utils/db-helpers.ts` e `idb-keyval`):

```typescript
export interface Handshake { 
  id: string;          // ID único do handshake (jti / UUID)
  aud: string;         // Hash SHA-256 do contato destinatário/remetente (vapidPublicKey)
  in?: FluxoIn;        // Dados e estado do fluxo de recepção
  out?: FluxoOut;      // Dados e estado do fluxo de emissão
  createdAt: number;   // Timestamp de criação
  updatedAt: number;   // Timestamp da última alteração de estado
}

export interface FluxoIn {
  status: 'recebido' | 'processando' | 'processado' | 'falha';
  rotas: HandshakeRotas; // Payload descriptografado e descompactado
  tentativas: number;    // Contador de execuções
  erro?: string;         // Descrição detalhada da falha, se houver
}

export interface FluxoOut {
  status: 'pendente' | 'enviando' | 'enviado' | 'falha' | 'entregue';
  rotas: HandshakeRotas; // Payload original a ser comprimido e cifrado
  tentativas: number;    // Contador de retentativas
  erro?: string;
}

// Contêiner central de payloads roteáveis
export interface HandshakeRotas { 
  profile?: any;   // Dados de perfil e cartão de visitas (hand-profile.ts)
  mensagem?: any;  // Mensagens de texto e recibos de leitura (hand-mensagem.ts)
  contato?: any;   // Sincronização compacta de confiança (hand-contato.ts)
}
```

---

## 3. O Roteador Central (`src/sw/sw-handshakes.ts`)

O Service Worker principal atua como um orquestrador logístico e criptográfico neutro, desacoplado das regras visuais da interface:

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

### A. Fluxo de Saída (Envio para a Rede)
1. **Varredura:** O Service Worker consulta a tabela `Handshake_DB` buscando registros com `out.status === 'pendente'` ou `'enviando'`.
2. **Atualização de Estado:** Transiciona o status para `'enviando'`.
3. **Injeção de Carona (*Piggybacking*):**
   * O Roteador inspeciona a agenda local (`BrowserB_Contatos_DB`) verificando o estado `me` do destinatário.
   * Se o contato alvo estiver classificado como `me: 'none'` (ainda não possui nossos dados) ou `me: 'wrong'` (dados locais desatualizados), o Roteador **injeta automaticamente o Cartão de Visitas local (`rotas.profile`) no mesmo pacote da mensagem**.
4. **Compressão e Cifragem E2E:**
   * O objeto `handshake.out.rotas` é serializado em JSON e comprimido com GZIP (`fflate`).
   * Cifra-se o bloco comprimido via AES-GCM-256 e a chave AES simétrica via RSA-OAEP-2048 (`e2ePublicKey` do receptor).
5. **Assinatura e Despacho:**
   * O envelope cifrado (`ct`) é empacotado em um token JWT (`sub: "hand"`), assinado via ECDSA P-256 (`alg: "ES256"`) com a chave VAPID privada local e despachado ao Proxy Deno (`/api/proxy-push`).

### B. Fluxo de Entrada (Recepção da Rede)
1. O evento `push` é capturado em `src/sw/push.ts`.
2. Valida-se a assinatura do JWT (`kid`) com a `vapidPublicKey` do emissor.
3. Decifra-se o envelope `ct` com a `e2ePrivateKey` (RSA-OAEP) local e desfaz-se a compressão GZIP (`fflate`).
4. Grava-se o registro em `Handshake_DB` com `in = { rotas: payloadObj, status: 'recebido', tentativas: 0 }`.
5. Invoca-se o Despachante Interno.

### C. O Despachante Interno (Processador de Fila)
* O Processador varre as entradas com `in.status === 'recebido'`, altera o status para `'processando'` e aciona em paralelo os **Módulos Especializados** em `src/handshakes/`.
* Como a execução é modular, um pacote que utilizou *Piggybacking* processa `rotas.profile` e `rotas.mensagem` no mesmo ciclo.

---

## 4. Módulos Especializados de Rotas (`src/handshakes/`)

Cada módulo especialista implementa a função `processarHandshake({ in, out })`:

### 💬 Rota Mensagem (`src/handshakes/hand-mensagem.ts`)
Gerencia o fluxo bidirecional de mensagens e recibos de confirmação:
* **Nova Mensagem Recebida (`data.enviada`):**
  1. Salva a mensagem no banco local `BrowserB_MensagensRecebidas_DB`.
  2. Aciona a notificação nativa do sistema operacional (`self.registration.showNotification`).
  3. **Auto-Ack Instantâneo:** Gera imediatamente um `FluxoOut` de resposta acusando a entrega da mensagem (`data.recebida`).
* **Recibo de Entrega Recebido (`data.recebida`):**
  * Atualiza o registro correspondente em `BrowserA_MensagensEnviadas_DB` para o status `'entregue'`, desenhando os "dois tiques" (`✓✓`) na interface do emissor.

### 👤 Rota Profile (`src/handshakes/hand-profile.ts`)
Trata a troca e atualização sob demanda de atributos de perfil (nome, foto e e-mail). Permite solicitar apenas campos específicos (ex: `['name', 'email']`), otimizando o consumo de dados.

### 🛡️ Rota Contato e Sincronização Compacta (`src/handshakes/hand-contato.ts` & `src/utils/share-utils.ts`)
Sincroniza a saúde criptográfica da relação entre dois nós.

Para respeitar o limite de **4.096 bytes** da RFC 8291 (FCM), os contatos utilizam a interface **`CompactContact`** (atributos de 2 letras como `vx`, `vy`, `en`, `se`, `sp`, `sa`, `ve`, `tr`), reduzindo o payload de ~2.5 KB para menos de **750 bytes**.

#### Auditoria do Ciclo de Confiança Mútua (`me`):
O módulo avalia o estado `me` do contato local comparando as credenciais recebidas:
* **`none`:** O dispositivo do parceiro retornou endpoint/chaves vazias (não possui nossos dados salvos).
* **`trusted`:** O parceiro possui nosso perfil salvo e homologou a relação (`tr: true`).
* **`saved`:** O parceiro possui nosso perfil salvo, mas ainda não realizou a verificação explícita.
* **`wrong` (Auditoria Paranoica):** O Roteador compara byte a byte as chaves VAPID, RSA e o Envelope recebido com o perfil local. Se **qualquer byte diferir**, sinaliza `wrong` e bloqueia a comunicação E2E até o re-alinhamento das chaves.

---

## 5. Vantagens Arquiteturais

1. **Garantia de Enquadramento no Limite de 4KB:** Graças à padronização `CompactContact` e compressão GZIP (`fflate`), mesmo pacotes complexos utilizam menos de 20% do limite da rede FCM.
2. **Autocura de Conexões por Piggybacking:** Se um contato atualizou sua subscrição Web Push, o envio de uma mensagem simples transporta o perfil atualizado em carona, reparando a base de dados do receptor antes da exibição da conversa.
3. **Extensibilidade Sem Boilerplate:** A criação de novas funcionalidades (ex: apagar mensagens, reações, sinalizador de digitação) exige apenas a adição de um novo arquivo em `src/handshakes/hand-*.ts`, reaproveitando toda a infraestrutura de criptografia, filas e retentativas.
4. **Resiliência Local-First:** Alterações realizadas sem conexão de rede ficam retidas com status `'pendente'` no `Handshake_DB` e são processadas automaticamente assim que o evento `online` for disparado.


---

# handshake

## Como é hoje

### Handshake de confirmação entrega mensagem

Descrição básica do funcionamento atual:
1. Mensagem é recebida contendo um JWT com id em jti e identificação do remetente em kid
    1. Mensagem recebida passa a utilizar este JTI como mensagemId
    2. O kid identifica o contato por contatoKey que é um hash da chave vapid publica do remetente
2. Um handshake é criado com um id novo = handshakeId (função de criar id unico novo de 12 caracteres)
    Explicação do que é salvo no indexdb
    ```js
    {
    "id": handshakeId,              // ID do handshake gerado agora no Receptor da mensagem
    "mensagemId": jti,              // ID (jti) da mensagem original recebida
    "tipo": "confirmacao_entrega",  // Identificador da ação
    "direcao": "out",                // Indica que é um handshake a ser enviado
    "status": "pendente",           // Aguardando envio na fila
    "tentativas": 0,
    "payload": { 
        "recebidoEm": 1788770000000    // Timestamp do momento do recebimento da mensagem
    },
    "createdAt": 1788770000000,
    "updatedAt": 1788770000000
    }
    ``` 
3. A rotina de processar a fila de handshake vai mandar um handshake contendo um JWT assim
    Durante o processamento de cada item da fila seu status é alterado para "enviando"
    1. Header 
        ```js
        { 
        "alg": "ES256",
        "kid": vapid public do profile do navegador remetente do handshake
        }
        ```
    2. Payload
        ```js
        {
        "sub": "hand",
        "aud": mensagemId,        // ID da mensagem original confirmada
        "jti": handshakeId,        // ID único deste handshake
        "ct": "..." // envelope cifrado explicado abaixo
        }
        ```
    3. Envelope serializado, comprimido e Cifrado com a chave publica de contatoKey da mensagemID, contendo
        ```js
        {
        "tipo": tipo,  // "confirmacao_entrega",
        "recebidoEm": payload.recebidoEm // 1788770000000
        }
        ```
    4. Signature
        Assinatura ECDSA P-256 usando header.kid de HEADER+PAYLOAD
4. Um payload é enviado ao servidor Proxy (/api/proxy-push) e status do handshake anterado para "enviado"
    ```js
    {
    "subscription": {
        "endpoint": "https://fcm.googleapis.com/fcm/send/endpoint_do_destinatario...",
        "keys": {
            "p256dh": "base64...",
            "auth": "base64..."
            }
        },
    "payloadText": "eyJhbGciOiJFUzI1NiIs... (JWT de saída em string)",
    "vapid": {
        "subject": "mailto:"+ email de contatoKey da mensagemID (destinatario),
        "publicKey": vapid publico de contatoKey da mensagemID (destinatario),
        "privateKey": envelope_cifrado_vapid_privada de contatoKey da mensagemID (destinatario)
        }
    }
    ```
5. Remetente do Handshake recebe do handshake (sub === "hand"), valida assinatura do JWT
    1. Cria payloadObj =  payload.ct decifrado e descompactado
    2. Um handshake é salvo em indexdb como direcao "in"
        ```js
        {
        "id": payload.jti,           // ID do handshake gerado pelo remetente (payload.jti)
        "mensagemId": payload.aud,   // ID da mensagem confirmada (payload.aud)
        "tipo": payloadObj.tipo,  // Extraído de payloadObj.tipo
        "direcao": "in",                 // Indica que é um recibo recebido
        "status": "entregue",           // Processado com sucesso
        "tentativas": 0,
        "payload": {                  // payloadObj
            "tipo": "confirmacao_entrega",
            "recebidoEm": 1788770000000
        },
        "createdAt": 1788770055000,
        "updatedAt": 1788770055000
        }
        ```
6. Atualização da mensagem enviada
    1. payload.aud é o mensagemId que vai ter o status alterado
    2. a mensagem tem status alterado de "enviada" (ou "enviando") para "entregue"
    3. SW notifica UI com postMessage({ type: 'MENSAGEM_ENTREGUE', payload: { mensagemId: "V1StGXR8_Z5jd" } })


### Handshake de solicitação de dados

Descrição básica do funcionamento atual:
1. Nó A - Solicitante de dados dispara gatilho de solicitação de dados
    1. manualmente no botão "Atualizar informações do contato" na UI de cartão do contato, enviando ao Service Worker.: { type: 'SOLICITAR_DADOS_CONTATO', payload: { contatoPublicKeyVapid: hash } }
    2. Service Worker a primeira mensagem de um novo contato ou de um contato cujos campos nome e email estejam em branco no IndexedDB
2. Nó A - Ambos gatilhos chamam a função criarHandshakeSolicitarDados(contatoKey)
    1. contatoKey: Hash SHA-256 da chave VAPID do contato
    2. handshakeId: novo criado com a função de criar id unico novo de 12 caracteres
    3. Indexdb handshake_db é salvo com :
        ```js
        {
        "id": handshakeId,             // ID único da solicitação
        "mensagemId": contatoKey,   // Hash SHA-256 do contato alvo (Nó B)
        "tipo": "solicitar_dados",       // Tipo de handshake
        "direcao": "out",                // Fluxo de saída
        "status": "pendente",            // Aguardando processamento da fila
        "tentativas": 0,
        "payload": {
            "campos": ["iss", "nm"]         // Campos solicitados ao Nó B
        },
        "createdAt": 1788770100000,
        "updatedAt": 1788770100000
        }        
        ```
        OBS: Hoje a lista de campos solicitados está fixa aqui na geração do registro em indexdb
3. Nó A - A rotina de processar a fila de handshake vai mandar um handshake contendo um JWT assim
    Durante o processamento de cada item da fila seu status é alterado para "enviando"
    1. Header 
        ```js
        { 
        "alg": "ES256",
        "kid": vapid public do profile do navegador remetente do handshake (nó A)
        }
        ```
    2. Payload
        ```js
        {
        "sub": "hand",
        "aud": "hash_contato",         // Hash do destinatário contatoKey em handshake.mensagemId
        "jti": handshakeId,        // ID único deste handshake
        "ct": "..." // envelope cifrado explicado abaixo
        }
        ```
    3. Envelope serializado, comprimido e Cifrado com a chave publica de contatoKey da handshake.mensagemID, contendo
            ```js
            {
            "tipo": "solicitar_dados",
            "campos": ["iss", "nm"]
            }                   
            ```
    4. Signature
        Assinatura ECDSA P-256 usando header.kid de HEADER+PAYLOAD
4. Nó A - Um payload é enviado ao servidor Proxy (/api/proxy-push) e status do handshake anterado para "enviado"
    ```js
    {
    "subscription": {
        "endpoint": "https://fcm.googleapis.com/fcm/send/endpoint_do_destinatario...",
        "keys": {
            "p256dh": "base64...",
            "auth": "base64..."
            }
        },
    "payloadText": "eyJhbGciOiJFUzI1NiIs... (JWT de saída em string)",
    "vapid": {
        "subject": "mailto:"+ email de contatoKey da mensagemID (destinatario),
        "publicKey": vapid publico de contatoKey da mensagemID (destinatario),
        "privateKey": envelope_cifrado_vapid_privada de contatoKey da mensagemID (destinatario)
        }
    }
    ```
5. Nó B - Remetente do Handshake recebe do handshake (sub === "hand"), valida assinatura do JWT
    1. Cria payloadObj =  payload.ct decifrado e descompactado
    2. Um handshake é salvo em indexdb como direcao "in"
        ```js
        {
        "id": payload.jti,           // ID do handshake gerado pelo remetente (payload.jti)
        "mensagemId": payload.aud,   // ID do contato Alvo do pedido (payload.aud)
        "tipo": payloadObj.tipo,  // Extraído de payloadObj.tipo
        "direcao": "in",                 // Indica que é um recibo recebido
        "status": "entregue",           // Processado com sucesso
        "tentativas": 0,
        "payload": {                  // payloadObj
            "tipo": "solicitar_dados",
            "campos": ["iss", "nm"]
        },
        "createdAt": 1788770055000,
        "updatedAt": 1788770055000
        }
        ```
6. Nó B - Resposta automática é criada quando payloadObj.tipo === 'solicitar_dados' (aqui alteraremos para passar pela fila de processamento no novo fluxo)
    Handshake é criado no indexdb com id unico respostaHandshakeId - novo criado com a função de criar id unico novo de 12 caracteres:
    ```js
    {
    "id": respostaHandshakeId,             // ID do handshake de resposta
    "mensagemId": hash de header.kid,   // Hash SHA-256 do Nó A (senderHash)
    "tipo": "resposta_dados",        // Tipo de handshake
    "direcao": "out",                // Resposta a ser enviada
    "status": "pendente",            // Aguardando envio na fila
    "tentativas": 0,
    "payload": {
        "iss": profile.email,     // E-mail do perfil do Nó B
        "nm": profile.nome             // Nome do perfil do Nó B
    },
    "createdAt": 1788770106000,
    "updatedAt": 1788770106000
    }
    ```
7. Nó B - Função de Processar fila é acionada imediatamente
8. Nó B - A rotina de processar a fila de handshake vai mandar um handshake contendo um JWT assim
    Durante o processamento de cada item da fila seu status é alterado para "enviando"
    1. Header 
        ```js
        { 
        "alg": "ES256",
        "kid": vapid public do profile do navegador remetente do handshake (nó B)
        }
        ```
    2. Payload
        ```js
        {
        "sub": "hand",
        "aud": "hash_contato",         // Hash do destinatário contatoKey em handshake.mensagemId
        "jti": handshakeId,        // ID único deste handshake de resposta
        "ct": "..." // envelope cifrado explicado abaixo
        }
        ```
    3. Envelope serializado, comprimido e Cifrado com a chave publica de contatoKey da handshake.mensagemID, contendo
            ```js
            {
            "tipo": "resposta_dados",
            "iss": "alice@exemplo.com",
            "nm": "Alice Silva"
            }                  
            ```
    4. Signature
        Assinatura ECDSA P-256 usando header.kid de HEADER+PAYLOAD
9. Nó B - Um payload é enviado ao servidor Proxy (/api/proxy-push) e status do handshake anterado para "enviado"
    ```js
    {
    "subscription": {
        "endpoint": "https://fcm.googleapis.com/fcm/send/endpoint_do_destinatario...",
        "keys": {
            "p256dh": "base64...",
            "auth": "base64..."
            }
        },
    "payloadText": "eyJhbGciOiJFUzI1NiIs... (JWT de saída em string)",
    "vapid": {
        "subject": "mailto:"+ email de contatoKey da mensagemID (destinatario),
        "publicKey": vapid publico de contatoKey da mensagemID (destinatario),
        "privateKey": envelope_cifrado_vapid_privada de contatoKey da mensagemID (destinatario)
        }
    }
    ```
10. Nó A - Remetente do Handshake de resposta analisa handshake (sub === "hand"), valida assinatura do JWT
    1. Cria payloadObj =  payload.ct decifrado e descompactado
    2. Um handshake é salvo em indexdb como direcao "in"
        ```js
        {
        "id": payload.jti,           // ID do handshake gerado pelo remetente (payload.jti)
        "mensagemId": payload.aud,   // ID do contato Alvo do pedido (payload.aud)
        "tipo": payloadObj.tipo,  // Extraído de payloadObj.tipo
        "direcao": "in",                 // Indica que é um recibo recebido
        "status": "entregue",           // Processado com sucesso
        "tentativas": 0,
        "payload": {                  // payloadObj
            "tipo": "resposta_dados",
            "iss": "alice@exemplo.com",
            "nm": "Alice Silva"
        },
        "createdAt": 1788770055000,
        "updatedAt": 1788770055000
        }
        ```
11. Nó A - Atualização dos dados do contato da resposta recebida
    1. Contato localizado usando senderHash ("hash_contato_b") =  hash de header.kid
    2. Salva dados para o contato
        ```js
        {
        "email": "alice@exemplo.com",      // Atualizado com o valor de payloadObj.iss
        "nome": "Alice Silva",             // Atualizado com o valor de payloadObj.nm
        "updatedAt": 1788770110000
        }
        ```
12. Nó A - Envio de Atualização da UI pelo Service Worker
    SW notifica UI com postMessage para todas as janelas abertas
    ```js
    clients.forEach(client => {
        client.postMessage({ type: 'CONTATO_ATUALIZADO', payload: { contatoHash: 'hash_contato_b' } });
    });
    ```
13. Nó A - Atualização da UI
    O ouvinte global em contatosStore.ts captura a mensagem, recarrega a lista do IndexedDB e a interface atualiza o nome e o e-mail na barra lateral e no cartão de contato instantaneamente, sem necessidade de atualizar a página.

----

## Proposta de Refatoração

### Alterações Preliminares

Antes de mudar o handshake vamos atualizar alguns itens diversos:
1. Renomear o conceito de contato homologado para contato confiável. no indexdb do contato mudar o nome do campo homologado, para trusted: boolean e o campo "nome" para "name", o campo "publicKeyVapid" para "vapidPublicKey", o campo "vapidPrivateKey" para "vapidPrivateKeyEnvelope", o campo "publicKeyRSA" para "e2ePublicKey"
2. Ajustar o que é salvo em contatos para:
    ```js
    {
    "vapidPublicKey": { // a VAPID publica do contato
        "kty": "EC",
        "crv": "P-256",
        "x": "Base64Url_X...",
        "y": "Base64Url_Y...",
        "ext": true
    },
    "id": hash // Um hash SHA-256 gerado a partir da chave pública VAPID (vapidPublicKey) do contato
    "email": ... , // o email do contato
    "name": ... , // o nome do contato
    "e2ePublicKey": { // A chave pública de criptografia do contato
        "kty": "RSA",
        "e": "AQAB",
        "n": "Base64Url_Modulo_N...",
        "alg": "RSA-OAEP-256",
        "ext": true
    },
    "subscription": { // "endereço completo" para enviar notificações do contato
        "endpoint": "https://fcm.googleapis.com/fcm/send/eXamPle-Token...",
        "keys": {
            "p256dh": "Base64_P256dh...",
            "auth": "Base64_Auth_Secret..."
        }
    },
    "vapidPrivateKeyEnvelope": "eyJpdiI6Ii... (Envelope Cifrado do Servidor)", // chave privada VAPID do contato, mas cifrada e envelopada pelo servidor Proxy
    "trusted": true, // Se for true, significa que você escaneou o QR code dele ou clicou manualmente em "Confiável" (verificou a identidade). Se for false, é um contato estranho ou desconhecido
    "me": "trusted" ou "none" ou "wrong" ou "saved", 
        // trusted: Informará se o contato confia em mim (se ele tem um contato com meu public vapid hash marcado como trust:true)
        // none: valor default ao criar contato, significa que o contato não tem meus dados para retorno de mensagem (sem contato com hash de meu vapid publico)
        // wrong: ele tem neus dados para retorno de mensagem salvo em contato mas estão errados (subscription, vapid privado envelopado ou public RSA errados)
        // saved: ele tem neus dados para retorno de mensagem salvo e corretos (quando recebermos algum handshake ou mensagem do contato marco que ele tem meus dados se ele estava como none ou wrong) - 
    "createdAt": 1788770000000,
    "updatedAt": 1788770110000
    }
    ```
3. Renomear as funções abaixo de id-utils.ts e ajustar suas ocorrencias e chamadas eno app todo
    1. gerarIdMensagem renomear para gerarId
    2. validarIdMensagem renomear para validarId
    3. gerarIdFallback manter nome gerarIdFallback

### Novo Handshake
A proposta consiste em criar um fluxo de handshake genérico de transferencia de dados de um Nó para outro e vice versa
O handshake unico será o mesmo para processar dados de contato e informações de confirmação de entrega e no roadmap outras informações.
No detalhamento abaixo usarei estes dois casos como exemplo
Teremos um Roteador de handshake que atuará especificamente em cada caso de acordo com o obeto json recebido.
Este roteador para facilitar manutenção dele tera para cada tipo de objeto um conjunto de funções salvas em arquivo específico src/handshakes/<objeto>.ts
Vamos iniciar com alguns roteadores:
* src/handshakes/hand-profile.ts - responsável por criar handshake que envolve dados do profile
* src/handshakes/hand-mensagem.ts - responsável por criar handshake que envolve dados de mensagem
* src/handshakes/hand-contato.ts - responsável por criar handshake que envolve dados de contato

Primeiro vou descrever o fluxo do novo handshake e depois detalho como será o roteamento dos diferentes tipos acima.

### Indexdb do novo handshake
O novo handshake terá a seguinte estrutura salva no indexdb:
```js
export interface HandshakeRotas { 
  profile?: any; 
  mensagem?: any; 
  contato?: any; 
}

export type StatusIn = 'recebido' | 'processando' | 'processado' | 'falha';

export type StatusOut = 'pendente' | 'enviando' | 'enviado' | 'falha' | 'entregue';

export interface FluxoIn {
  status: StatusIn;
  rotas: HandshakeRotas & Record<string, any>;
  tentativas: number; 
  erro?: string;
}

export interface FluxoOut {
  status: StatusOut;
  rotas: HandshakeRotas & Record<string, any>;
  tentativas: number; 
  erro?: string;
}

// 5. Interface Principal do handshake
export interface Handshake { 
  id: string; // criado por gerarId() ou payload.jti de handshake recebido
  aud: string; // contato.id = hash da chave publica vapid do contato
  in?: FluxoIn; 
  out?: FluxoOut; 
  createdAt: number; // Timestamp do momento da criação do handshake
  updatedAt: number; // Timestamp do momento da alteração do handshake
}

```
### Registro criado no Indexdb  de Handshake

A partir da criação de um handshake com FluxoOut, executa a função de processamento de fila de handshake

A função de processamento de fila de handshake fará o seguinte:

#### Nó-A - Handshake com "out.status" 'pendente' ou 'enviando' antigo (updatedAt antes de 1 minuto) e out.tentativas <= max_tentativas
Durante o processamento de cada item da fila seu out.status é alterado para "enviando" e out.tentativas=+1

Prepara o JWT para envio com os seguintes dados:
1. Header 
    ```js
    { 
    "alg": "ES256",
    "kid": ... //vapid public do profile do navegador remetente do handshake
    }
    ```
2. Payload
    ```js
    {
    "sub": "hand",
    "aud": handshake.aud,        // hash do contato = contato.id = ID do contato que receberá o handshake
    "jti": handshake.id,        // ID único deste handshake
    "ct": "..." // envelope cifrado explicado abaixo
    }
    ```
3. Envelope serializado, comprimido e Cifrado com a chave publica (contato.publicKeyRSA) do contato.id = handshake.aud, contendo
    ```js
    {...} = handshake.out.rotas
    ```
4. Signature
    Assinatura ECDSA P-256 usando header.kid de HEADER+PAYLOAD


Depois um payload é enviado ao servidor Proxy (/api/proxy-push) e out.status do handshake alterado para "enviado"
```js
{
"subscription": {     // pelo hash do contato em handshake.aud, info em contato.subscription 
    "endpoint": "https://fcm.googleapis.com/fcm/send/endpoint_do_destinatario...", 
    "keys": {
        "p256dh": "base64...",
        "auth": "base64..."
        }
    },
"payloadText": "eyJhbGciOiJFUzI1NiIs... (JWT de saída em string)", 
"vapid": {
    "subject": "mailto:"+ // pelo hash do contato em handshake.aud, info em contato.email ,
    "publicKey": // pelo hash do contato em handshake.aud, info em contato.vapidPublicKey
    "privateKey": // pelo hash do contato em handshake.aud, info em contato.vapidPrivateKeyEnvelope
    }
}
```

#### Nó-B recebe o handshake
Remetente do Handshake recebe do handshake (sub === "hand"), valida assinatura do JWT
1. Cria payloadObj =  payload.ct decifrado e descompactado
2. Um handshake é salvo ou atualizado em indexdb com FluxoIn
    ```js
    {
    "id": payload.jti,           // ID do handshake gerado pelo remetente (payload.jti)
    "aud": hash(payload.kid),   // ID do contato que mandou a mensagem confirmada = hash(payload.kid)
    "createdAt": 1788770055000, // se handshake já existia mantem valor anterior
    "updatedAt": 1788770055000,
    "in": {                     // se já existia "in" teremos in.erro="Handshake Sobrescrito"
        "status": "recebido",
        "tentativas": 0,
        "rotas": payloadObj // conjunto de requisições de rotas enviadas no handshake
        "erro"?: "FluxoIn do Handshake Sobrescrito" // somente se "in" já existia ao atualizar 
    },
    // mantem "out" se ele já existia
    }
    ```
    Executa a função de processamento de fila de handshake
3. Processador de Fila de Handshake com "in.status" 'recebido' ou 'processando' antigo (updatedAt antes de 1 minuto) e in.tentativas <= max_tentativas
    1. Altera in.status = "processando" e atualiza o "updatedAt"
    2. Chama a função handshakeRota(in:handshake.id) - ver detalhamento abaixo
    3. in.status = "processado" se não tiver erros

### Processador de Fila de Handshake

Precisa monitorar os registros em indexdb do handshake analisando os status dentro do FluxoOut e FluxoIn
1. FluxoIn
    1. Procura periodicamente por in.status='recebido' ou 'processando' antigo (updatedAt antes de 1 minuto) e in.tentativas <= max_tentativas
    2. Altera in.status = "processando" e atualiza o "updatedAt"
    3. Chama a função handshakeRota(in:handshake.id) - ver detalhamento abaixo
    4. in.status = "processado" se não tiver erros
    5. in.status = "falha" se tiver erros e in.erro = string do erro

2. FluxoOut
    1. Se estiver online (offline não faz nada), procura periodicamente por out.status='pendente' ou 'enviando' antigo (updatedAt antes de 1 minuto) e out.tentativas <= max_tentativas
    2. Altera out.status = "enviando", atualiza o "updatedAt" e out.tentativas=+1
    3. Chama a função handshakeRota({out:handshake.id}) - ver detalhamento abaixo
    4. out.status = "enviado" se não tiver erros
    5. out.status = "falha" se tiver erros e in.erro = string do erro

### Definição de HandShakeRota
Função dentro de sw-handshakes.ts    
Aceita como parametro FluxoIn e FluxoOut:
1. FluxoOut = handshakeRota({out:handshake.id})
    Chama a função de preparar JWT e enviar ao servidor Proxy (./api/proxy-push)

2. FluxoIn = handshakeRota({in:handshake.id})
    Realiza a Rota de Entrada de acordo com o conteúdo de in.rotas do handshake
    * profile? - executa função Processar({in:handshake.id}) em hand-profile.ts e depois atualiza UI
    * contato? - executa função Processar({in:handshake.id}) em hand-contato.ts e depois atualiza UI
    * mensagem? - executa função Processar({in:handshake.id}) em hand-mensagem.ts e depois atualiza UI
    * outras conforme roadmap do app

Exemplo de atualização de UI para contato:
* SW notifica UI com postMessage para todas as janelas abertas
    ```js
    clients.forEach(client => {
        client.postMessage({ type: 'CONTATO_ATUALIZADO', payload: { contatoHash: 'hash_contato_b' } });
    });
    ```
* O ouvinte global em contatosStore.ts captura a mensagem, recarrega a lista do IndexedDB e a interface atualiza o nome e o e-mail na barra lateral e no cartão de contato instantaneamente, sem necessidade de atualizar a página.

### Definição Rota Profile
Terá função Processar({in?:handshake.id, out?:any})
1. FluxoIn
    Espera como parametro "in" o id do handshake a ser processado    
    1. se conteúdo em handshake.in.rotas.profile for array campos contendo os campos que deseja informações    
        Ex:
        ```js
        handshake.in.rotas.profile.campos: ["email", "name", "subscription" ...]
        ```
        Campos permitidos:
        * name
        * email
        * vapidPublicKey
        * vapidPrivateKeyEnvelope
        * e2ePublicKey
        * subscription
        Esta função cria ou atualiza um FluxoOut no handshake com handshake.id contendo:
        ```js
        handshake.out = {
            rotas.profile.data = {
                id = hash(AppConfig_DB.profile.vapidPublicKey), // o mesmo hash usado em contatos
                name = AppConfig_DB.profile.name, // somente se solicitado em handshake.in.rotas.profile.campos
                email = AppConfig_DB.profile.email, // somente se solicitado em handshake.in.rotas.profile.campos
                vapidPublicKey = AppConfig_DB.profile.vapidPublicKey, // somente se solicitado em handshake.in.rotas.profile.campos
                vapidPrivateKeyEnvelope = AppConfig_DB.profile.vapidPrivateKeyEnvelope, // somente se solicitado em handshake.in.rotas.profile.campos
                e2ePublicKey = AppConfig_DB.profile.e2ePublicKey, // somente se solicitado em handshake.in.rotas.profile.campos
                subscription = AppConfig_DB.profile.subscription // somente se solicitado em handshake.in.rotas.profile.campos
            }
            status = "pendente"
            tentativas = 0
        }
        ```
        Retorna para o processamento de rotas 
    2. se conteúdo em handshake.in.rotas.profile for objeto data com rotas.profile.data.id
        Atualiza o contato no indexdb para o contato de id hash = handshake.in.rotas.profile.data.id, com as informações em handshake.in.rotas.profile.data recebidas.    
        Retorna para o processamento de rotas 
2. FluxoOut
    Espera como parametro "out" objeto contendo nome de função interna e parametros a serem enviadas para ela.
    Ex: 
    ```js
    { "out": {
            "function" = "solicitarPerfil", // nome da função em hand-profile.ts 
            "contato"=  contato.id,  // hash do contato que solicita informações de perfil
            "campos" = ["email", "name", "subscription" ... ]
        }
    }
    ```

    A função "solicitarPerfil" tem como parametros:
    * contato = hash do id do contato que deseja informações
    * campos = lista de campos solicitados informações

    Esta função apenas cria um novo registro handshake da seguinte forma:
        ```js
        {
        "id": payload.jti,           // ID do handshake gerado pela função gerarId
        "aud": contato // hash do id do contato que deseja informações = parametro função
        "createdAt": 1788770055000,
        "updatedAt": 1788770055000,
        "out": {
            "status": "pendente",
            "tentativas": 0,
            "rotas": {
                "profile": {
                    "campos": ["email", "name", "subscription" ... ] // lista de campos solicitados informações = parametro função
                }
            }
        }
        }
        ```
        Outras funções definiremos pelo Roadmap do app

### Definição Rota Mensagem
Terá função Processar({in?:handshake.id, out?:any})
1. FluxoIn
    Espera como parametro "in" com o id do handshake a ser processado    
    1. se conteúdo em handshake.in.rotas.mensagem for array campos contendo os campos que deseja informações e 'recebida' da mensagem recebida    
        Ex:
        ```js
        handshake.in.rotas.mensagem: {
            "recebida": id da mensagem,
            "campos": ["status", "conteudo", "recebidoEm" ...]
        }
        ```
        Campos permitidos em mensagem recebidas:
        * status
        * conteudo
        * recebidoEm
        * lidaEm
        * notificadaEm
        Será restritos as mensagens recebida onde handshake.aud = mensagem.contatoPublicKeyVapid (hash id do contato)    
        Esta função cria ou atualiza um FluxoOut no handshake com handshake.id contendo:
        ```js
        handshake.out = {
            rotas.mensagem.data = {
                recebida = mensagem.id, // de mensagens recebidas
                status = mensagem.status, // somente se solicitado em handshake.in.rotas.mensagem.campos
                conteudo = mensagem.conteudo, // somente se solicitado em handshake.in.rotas.mensagem.campos
                recebidoEm = mensagem.recebidoEm, // somente se solicitado em handshake.in.rotas.mensagem.campos
                lidaEm = mensagem.lidaEm, // somente se solicitado em handshake.in.rotas.mensagem.campos
                notificadaEm = mensagem.notificadaEm, // somente se solicitado em handshake.in.rotas.mensagem.campos
            }
            status = "pendente"
            tentativas = 0
        }
        ```
        Retorna para o processamento de rotas 
    2. se conteúdo em handshake.in.rotas.mensagem for objeto data com rotas.mensagem.data.recebida e retornou campo status = 'nao_lida', 'lida' ou 'notificada' ou seja não vazio    
        Atualiza a mensagem enviada no indexdb para a mensagem enviada de id = handshake.in.rotas.mensagem.data.recebida, para o status = "entregue" .    
        Para os demais campos não temos ação por enquanto (reservado para próximos roadmaps)
        Retorna para o processamento de rotas 
    3. se conteúdo em handshake.in.rotas.mensagem for objeto data com rotas.mensagem.data.enviada informado
        Cria uma nova mensagem recebida ou atualiza uma mensagem recebida, com id = rotas.mensagem.data.enviada
        ```js
        MensagemRecebida = {
            id: handshake.in.rotas.mensagem.data.enviada,
            contatoPublicKeyVapid: handshake.aud,
            conteudo: handshake.in.rotas.mensagem.data.conteudo,
            status: 'nao_lida',
            recebidoEm: 1788770055000
        }
        ```
        Cria novo handshake para informar mensagem recebida
        ```js
        handshake = {
            id = gerarId(),
            aud = handshake.aud,
            "createdAt": 1788770055000,
            "updatedAt": 1788770055000,
            out = {
                rotas.mensagem.data = {
                recebida = handshake.in.rotas.mensagem.data.enviada,
                status = 'nao_lida'
                }
                status = "pendente",
                tentativas = 0
            }
        }
        ```
        Retorna para o processamento de rotas 

2. FluxoOut
    Espera como parametro "out" objeto contendo nome de função interna e parametros a serem enviadas para ela.
    Ex: 
    ```js
    { "out": {
            "function" = "confirmarEntrega", // nome da função em hand-mensagem.ts 
            "contato"=  contato.id,  // hash do contato que solicita informações de mensagens
            "mensagem"=  mensagem.id,  // id da mensagem recebida que solicita informações de recebimento
            "campos" = ["status"]
        }
    }
    ```

    A função "confirmarEntrega" tem como parametros:
    * contato = hash do id do contato que deseja informações
    * mensagem = id da mensagem recebida que deseja informações
    * campos = lista de campos solicitados informações

    Esta função apenas cria um novo registro handshake da seguinte forma:
        ```js
        {
        "id": payload.jti,           // ID do handshake gerado pela função gerarId
        "aud": contato // hash do id do contato que deseja informações = parametro função
        "createdAt": 1788770055000,
        "updatedAt": 1788770055000,
        "out": {
            "status": "pendente",
            "tentativas": 0,
            "rotas": {
                "mensagem": {
                    "recebida": mensagem.id // id da mensagem recebida que deseja informações = parametro função
                    "campos": ["status", "conteudo", "recebidoEm" ... ] // lista de campos solicitados informações = parametro função
                }
            }
        }
        }
        ```

    A função "enviarMensagem" tem como parametros:
    * contato = hash do id do contato que deseja enviar mensagem
    * conteudo = conteudo da mensagem

    Primeiro gera um mensagemId = gerarId

    Esta função apenas cria um novo registro handshake da seguinte forma:
    ```js
    {
    "id": payload.jti,           // ID do handshake gerado pela função gerarId
    "aud": contato // hash do id do contato que vai receber mensagem = parametro função
    "createdAt": 1788770055000,
    "updatedAt": 1788770055000,
    "out": {
        "status": "pendente",
        "tentativas": 0,
        "rotas": {
            "mensagem": {
                "enviada": mensagemId // id de mensagem gerado
                "conteúdo": conteúdo // conteúdo da mensagem a ser enviada = parametro função
            }
        }
    }
    }
    ```
    E depois um novo registro mensagem enviada da seguinte forma:
    ```js
    {
    "id": mensagemId // id de mensagem gerado,
    "contatoHash":  // hash do id do contato que vai receber mensagem = parametro função
    "conteudo": conteúdo // conteúdo da mensagem a ser enviada = parametro função
    "status": "pendente",
    "tentativas": 0,
    "createdAt": 1788801000000,
    "updatedAt": 1788801005000
    }
    ```
    Outras funções definiremos pelo Roadmap do app

### Definição Rota Contato
Terá função Processar({in?:handshake.id, out?:any})
1. FluxoIn
    Espera como parametro "in" com o id do handshake a ser processado    
    1. se conteúdo em handshake.in.rotas.contato for array campos contendo os campos que deseja informações e 'id' do contato   
        Ex:
        ```js
        handshake.in.rotas.contato: {
            "id": id do contato (hash),
            "campos": ["vapidPublicKey", "email", "name" ...]
        }
        ```
        Campos permitidos em contatos:
        * vapidPublicKey
        * email
        * name
        * e2ePublicKey
        * subscription
        * vapidPrivateKeyEnvelope
        * trusted
        * me
        Será restrito ao contato onde handshake.aud = contato.id (hash id do contato)    
        Esta função cria ou atualiza um FluxoOut no handshake com handshake.id contendo:
        ```js
        handshake.out = {
            rotas.contato.data = {
                id = contato.id, // de contato pesquisado
                vapidPublicKey = contato.vapidPublicKey, // somente se solicitado em handshake.in.rotas.contato.campos
                email = contato.email, // somente se solicitado em handshake.in.rotas.contato.campos
                name = contato.name, // somente se solicitado em handshake.in.rotas.contato.campos
                e2ePublicKey = contato.e2ePublicKey, // somente se solicitado em handshake.in.rotas.contato.campos
                subscription = contato.subscription, // somente se solicitado em handshake.in.rotas.contato.campos
                vapidPrivateKeyEnvelope = contato.vapidPrivateKeyEnvelope, // somente se solicitado em handshake.in.rotas.contato.campos
                trusted = contato.trusted, // somente se solicitado em handshake.in.rotas.contato.campos
                me = contato.me, // somente se solicitado em handshake.in.rotas.contato.campos
            }
            status = "pendente"
            tentativas = 0
        }
        ```
        Retorna para o processamento de rotas 
    2. se conteúdo em handshake.in.rotas.contato for objeto data com rotas.contato.data.id 
        Se handshake.in.rotas.contato.data.id não existe atualize no indexdb de contatos para o contato.id = handshake.aud , contato.me = "none"
        
        Se handshake.in.rotas.contato.data contenha trusted e handshake.in.rotas.contato.data.trusted=true, atualize no indexdb de contatos para o contato.id = handshake.aud , contato.me = "trusted"

        Se handshake.in.rotas.contato.data contenha trusted e handshake.in.rotas.contato.data.trusted=false, atualize no indexdb de contatos para o contato.id = handshake.aud , contato.me = "saved"
        
        atualize no indexdb de contatos para o contato.id = handshake.aud , contato.me = "wrong" caso: 
        * Alteração caso handshake.in.rotas.contato.data contenha subscription e handshake.in.rotas.contato.data.subscription != AppConfig_DB.profile.subscription ou
        * Alteração caso handshake.in.rotas.contato.data contenha vapidPublicKey e handshake.in.rotas.contato.data.vapidPublicKey != AppConfig_DB.profile.vapidPublicKey ou
        * Alteração caso handshake.in.rotas.contato.data contenha vapidPrivateKeyEnvelope e handshake.in.rotas.contato.data.vapidPrivateKeyEnvelope != AppConfig_DB.profile.vapidPrivateKeyEnvelope ou
        * Alteração caso handshake.in.rotas.contato.data contenha e2ePublicKey e handshake.in.rotas.contato.data.e2ePublicKey != AppConfig_DB.profile.e2ePublicKey, 
        
        Para os demais campos não temos ação por enquanto (reservado para próximos roadmaps)
        Retorna para o processamento de rotas 
2. FluxoOut
    Espera como parametro "out" objeto contendo nome de função interna e parametros a serem enviadas para ela.
    Ex: 
    ```js
    { "out": {
            "function" = "confirmarSubscription", // nome da função em hand-mensagem.ts 
            "contato"=  contato.id,  // hash do contato que solicita informações de subscription de retorno
            "campos" = ["trusted", "subscription", "vapidPublicKey", "vapidPrivateKeyEnvelope", "e2ePublicKey"]
        }
    }
    ```

    A função "confirmarSubscription" tem como parametros:

    Esta função apenas cria um novo registro handshake da seguinte forma:
        ```js
        {
        "id": payload.jti,           // ID do handshake gerado pela função gerarId
        "aud": contato // hash do id do contato que deseja informações = parametro função
        "createdAt": 1788770055000,
        "updatedAt": 1788770055000,
        "out": {
            "status": "pendente",
            "tentativas": 0,
            "rotas": {
                "contato": {
                    "id": hash(AppConfig_DB.profile.vapidPublicKey), // o mesmo hash usado em contatos
                    "campos": ["trusted", "subscription", "vapidPublicKey", "vapidPrivateKeyEnvelope", "e2ePublicKey"]
                }
            }
        }
        }
        ```

-------


# Arquitetura de Handshakes (Máquina de Estados Offline-First)

O Loco PWA foi idealizado para funcionar perfeitamente sem conectividade de rede instantânea. Para garantir a imutabilidade, resiliência e entrega das mensagens (E2EE) mesmo em túneis ou viagens, implementamos o conceito de **Handshakes Assíncronos**.

## 1. Princípio de Desacoplamento (UI vs Trabalhadores)
A Interface de Usuário (Preact/Signals) **nunca** faz disparos `fetch` diretamente para enviar dados aos contatos. 
A UI tem apenas 2 responsabilidades durante a emissão:
- Salvar a "intenção" no Banco de Dados (IndexedDB) de forma otimista.
- Disparar um evento via `postMessage` (Thread local) sinalizando o Service Worker.

## 2. A Fila de Saída (OUT)
Quando o Service Worker detecta que há dados para enviar (um novo contato gerado, um status lido `ack`, ou uma mensagem), ele instila um pacote na Fila `OUT`.
- O payload é comprimido em GZIP (`fflate`).
- É blindado na camada híbrida (AES-256-GCM envelopado com a RSA-OAEP Pública do recebedor).
- Só então é transformado num JWT assinado e disparado via rede celular/Wi-Fi (Web Push FCM).
- Se a rede cair no processo, o `status` do handshake permanece `pendente` e tentará automaticamente reconectar na próxima janela de rede nativa (`sync` event ou `online`).

## 3. A Fila de Entrada (IN)
O processo inverso. Quando o dispositivo "acorda" com um Push recebido pelo Sistema Operacional:
- O Service Worker decodifica com sua Chave Privada RSA.
- O Handshake é gerado na Fila `IN`.
- A máquina de estados (`Processar()`) decide se injeta no DB de mensagens ou se atualiza os metadados do contato. 
- Somente no final do processamento um aviso nativo (BroadcastChannel ou Notification) é enviado para a UI.

**Segurança Garantida:** O Servidor de Proxy que fica no meio do caminho atua estritamente como um "Roteador Cego" lidando apenas com pacotes em Base64 criptografados e chaves VAPID (para o Google FCM).