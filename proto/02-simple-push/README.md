# 📡 Web Push Descentralizado - Browser B

## Visão Geral

Este protótipo implementa um sistema de **mensagens descentralizadas** utilizando Web Push, onde dois navegadores distintos (navegador emissor e navegador receptor) se comunicam sem a necessidade de um servidor central para armazenar ou rotear mensagens. O **mesmo código** (Browser B) é executado em ambos os navegadores, assumindo papéis de **emissor** ou **receptor** conforme a necessidade.

A comunicação ocorre diretamente do emissor para o receptor através da infraestrutura de Web Push (FCM, no caso do Chrome), utilizando um **servidor proxy mínimo** (fornecido com o protótipo) apenas para intermediar o envio do payload ao serviço de push. Não há banco de dados central, nem filas compartilhadas – cada navegador mantém seu próprio armazenamento local (IndexedDB) e gerencia seus próprios contatos e mensagens.

## Arquitetura

- **Navegador Emissor**: gera um **bundle** contendo todas as informações necessárias para enviar mensagens ao receptor (subscription, chaves públicas, chave privada VAPID cifrada). Esse bundle é transferido **fora de banda** (ex: copiar/colar) para o navegador emissor.
- **Navegador Receptor**: gera seu próprio bundle e o disponibiliza para quem desejar enviar mensagens. Quando recebe uma mensagem, extrai os dados do emissor (subscription, chaves) e os armazena localmente como um **contato**, permitindo responder no futuro sem necessidade de um novo bundle.
- **Servidor Proxy**: recebe uma requisição POST contendo o payload JWT e a subscription do destinatário, e reencaminha para o endpoint de Web Push (FCM). Ele também descriptografa a chave privada VAPID (que chega cifrada) para assinar o cabeçalho de autorização. Este servidor não armazena mensagens nem estado – é apenas um "coringa" para permitir a utilização da API Web Push sem expor chaves privadas no cliente.

## Objetivos

- **Descentralização**: não há servidor central de mensagens; cada navegador é autônomo.
- **Privacidade**: as mensagens são cifradas ponta a ponta (E2EE) e apenas o destinatário pode decifrá-las.
- **Resposta bidirecional**: o receptor de uma mensagem pode responder ao emissor, utilizando os dados de contato salvos localmente.
- **Offline first**: mensagens são enfileiradas no IndexedDB e enviadas quando a conexão for restaurada.

## Objetos Importantes

### 1. Bundle (gerado pelo receptor)

É um objeto JSON que contém todos os dados necessários para que um emissor possa enviar mensagens para aquele receptor.

**Estrutura**:

```json
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "keys": {
      "p256dh": "base64...",
      "auth": "base64..."
    }
  },
  "vapid": {
    "subject": "mailto:email@dominio.com",
    "publicKey": { ... JWK ECDSA P-256 ... },
    "privateKey": "envelope cifrado (base64)"
  },
  "isVapidEncrypted": true,
  "e2e": {
    "ownerName": "Nome do receptor",
    "ownerEmail": "email@dominio.com",
    "browserB_PublicKeyEncrypt": { ... JWK RSA-OAEP ... }
  },
  "payloadText": ""
}
```

- **`subscription`**: objeto de inscrição do Web Push, obtido via `PushManager.subscribe()`. Contém o endpoint (URL do servidor de push) e as chaves `p256dh` e `auth`, necessárias para cifrar o payload.
- **`vapid`**: chaves VAPID (ECDSA P-256) usadas para assinar o cabeçalho `Authorization` da requisição push. A chave privada é **cifrada** com uma chave simétrica (AES-GCM) protegida pela chave pública RSA do servidor proxy – somente o proxy pode decifrá-la.
- **`e2e`**: contém a chave pública RSA do receptor (para cifrar a mensagem) e os metadados do proprietário (nome/email).
- **`payloadText`**: reservado para uso futuro.

### 2. Mensagem (payload enviado via push)

É um **JWT** assinado com a chave privada VAPID do emissor (ECDSA P-256), contendo no `payload` um campo `ct` que encapsula a mensagem propriamente dita (cifrada com RSA-OAEP + AES-GCM).

**Estrutura do JWT**:

```json
Header: { "alg": "ES256" }
Payload: {
  "iss": "email@emissor",
  "sub": "email@receptor",
  "ct": "{ ... envelope ... }",
  "p": { ... publicKeyVapid do emissor ... }
}
```

- **`ct` (cipherText)**: envelope cifrado contendo a mensagem comprimida (gzip) e cifrada com chave simétrica derivada de AES-GCM, cuja chave é cifrada com RSA-OAEP usando a chave pública do receptor.
- **`p` (publicKey Vapid)**: chave pública VAPID do emissor, utilizada para verificar a assinatura do JWT (ECDSA) e para futuras respostas.

### 3. Contato (armazenado no IndexedDB do receptor)

Quando uma mensagem é recebida, o receptor extrai as informações do emissor (`subscription`, `publicKeyRSA`, `publicKeyVapid`, `vapidPrivateKey`) e as salva em uma store `CONTATOS`, indexada pela chave pública VAPID do emissor (serializada como string). Este contato permite responder ao emissor sem a necessidade de um novo bundle.

**Estrutura**:

```json
{
  "publicKeyVapid": { ... JWK ECDSA ... },
  "email": "email@emissor",
  "nome": "Nome do emissor",
  "publicKeyRSA": { ... JWK RSA ... },
  "subscription": { ... subscription do emissor ... },
  "vapidPrivateKey": "chave privada VAPID cifrada (base64)",
  "homologado": boolean,
  "createdAt": timestamp,
  "updatedAt": timestamp
}
```

### 4. Mensagem Recebida (armazenada no IndexedDB do receptor)

Após decifrar o conteúdo, o receptor salva a mensagem em uma store `MENSAGENS_RECEBIDAS_B`, contendo apenas o conteúdo, o status de leitura, a chave do contato associado e timestamps.

**Estrutura**:

```json
{
  "id": "msg_...",
  "contatoPublicKeyVapid": "serialização da chave pública VAPID do emissor",
  "conteudo": "texto da mensagem",
  "status": "nao_lida|lida|notificada",
  "recebidoEm": timestamp
}
```

## Fluxo de Funcionamento

### 1. Geração do Bundle (Receptor)

1. O navegador receptor solicita permissão para notificações e registra o Service Worker.
2. Gera um par de chaves VAPID (ECDSA P-256) e um par de chaves RSA (RSA-OAEP) para cifrar mensagens.
3. Inscreve-se no serviço de push (PushManager.subscribe) utilizando a chave pública VAPID como `applicationServerKey`.
4. Obtém a chave pública do servidor proxy (`/api/server-public-key`) e **cifra a chave privada VAPID** utilizando um envelope híbrido (AES-GCM + RSA-OAEP). Esse envelope é armazenado no bundle como `vapid.privateKey`.
5. Monta o objeto `bundle` com a subscription, chaves públicas (VAPID e RSA) e metadados.
6. O bundle é exibido em uma textarea para ser copiado e transferido ao emissor (ex: por copiar/colar, QR Code, etc).

### 2. Envio de Mensagem (Emissor)

1. O emissor obtém o **bundle do receptor** (via cópia/cola) e o insere na interface.
2. Digita a mensagem (texto).
3. O emissor **cifra a mensagem** utilizando um esquema híbrido:
   - Gera uma chave AES-GCM aleatória.
   - Cifra a mensagem (após compressão gzip) com AES-GCM.
   - Cifra a chave AES com RSA-OAEP utilizando a chave pública RSA do receptor (do bundle).
   - Monta um envelope JSON (`{ i: iv, d: dados, k: chaveAesCifrada }`).
4. O emissor **constrói um JWT**:
   - Header: `{ alg: "ES256" }`.
   - Payload: contém `iss` (email do emissor), `sub` (email do receptor), `ct` (envelope JSON) e `p` (chave pública VAPID do emissor).
   - Assina o JWT com a chave privada VAPID do emissor (ECDSA P-256).
5. O JWT é então transmitido ao Service Worker do próprio emissor, que o coloca em uma fila de envio (IndexedDB) e tenta enviá-lo ao servidor proxy imediatamente (ou quando a conexão for restaurada).

### 3. Recebimento e Processamento da Mensagem (Receptor)

1. O Service Worker do receptor recebe o evento `push` contendo o JWT.
2. Extrai o payload do JWT e verifica a assinatura usando a chave pública VAPID do emissor (campo `p`).
3. Com a chave privada RSA do receptor (armazenada localmente), decifra o envelope:
   - Descriptografa a chave AES.
   - Descriptografa os dados cifrados com AES-GCM.
   - Descomprime (gunzip) para obter o texto original.
4. Extrai os dados do emissor (`subscription`, `publicKeyRSA`, `publicKeyVapid`, `vapidPrivateKey`) do envelope da mensagem e **salva ou atualiza um contato** na store `CONTATOS` do receptor.
5. Salva a mensagem na store `MENSAGENS_RECEBIDAS_B` com status `nao_lida`.
6. Exibe uma notificação push (nativa do navegador) com o conteúdo da mensagem.
7. Quando o usuário clica na notificação, é direcionado à interface do Browser B, onde pode visualizar a mensagem, marcar como lida ou **responder**.

### 4. Resposta (Receptor → Emissor)

1. Na lista de mensagens recebidas, o receptor pode clicar em **"Responder"**.
2. O sistema localiza o contato do emissor (pela chave pública VAPID) e monta um **bundle** a partir dos dados do contato (subscription, chaves públicas, chave privada VAPID cifrada).
3. Este bundle é preenchido automaticamente no campo de destino, permitindo que o receptor envie uma mensagem de volta utilizando o mesmo fluxo de envio descrito acima.
4. A mensagem de resposta é enviada para o emissor original, que por sua vez a recebe, processa e pode responder novamente, estabelecendo uma conversa descentralizada.

## Segurança

- **Chaves privadas nunca são transmitidas em texto puro**: a chave privada VAPID viaja cifrada no bundle, e apenas o servidor proxy (que possui a chave RSA correspondente) pode decifrá-la para assinar o cabeçalho VAPID.
- **Criptografia ponta a ponta**: o conteúdo da mensagem é cifrado com RSA-OAEP + AES-GCM, garantindo que apenas o receptor possa ler.
- **Assinatura digital**: o JWT é assinado com ECDSA, garantindo autenticidade e integridade da mensagem.
- **Homologação opcional**: o receptor pode "homologar" um emissor, confiando em sua chave pública para futuras mensagens, mas mesmo sem homologação as mensagens são verificadas criptograficamente.

## Considerações Finais

- O servidor proxy não armazena dados; é um ponto de passagem necessário para utilizar a API Web Push (que exige um cabeçalho de autorização assinado). Ele poderia ser substituído por uma função serverless ou mesmo ser executado localmente.
- O fluxo de transferência do bundle (cópia/cola) é offline; em uma versão futura, poderia ser substituído por QR Codes, Bluetooth, ou um servidor de descoberta (ainda descentralizado).
- O sistema é **totalmente descentralizado**: não há uma única entidade que conheça todos os contatos ou mensagens; cada navegador mantém seu próprio universo de contatos e mensagens.

Este protótipo serve como base para aplicações de mensageria privada, onde a confiança é estabelecida diretamente entre os pares, sem intermediários.