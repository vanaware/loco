# Criptografia no Loco

## Objetivo

A criptografia no Loco tem como objetivo proteger as mensagens e dados sensíveis armazenados localmente no dispositivo do usuário. Mesmo que alguém tenha acesso físico ao dispositivo, as mensagens criptografadas não podem ser lidas sem a chave mestra.

> ⚠️ **Importante**: a criptografia atual do Loco é **local**. Isso significa que as mensagens são criptografadas antes de serem armazenadas no IndexedDB, mas não necessariamente antes de serem enviadas pela rede. Uma criptografia ponta-a-ponta (E2E) real exigiria troca segura de chaves entre os contatos.

## O que é criptografado

- Mensagens de texto quando a opção de criptografia está ativada.
- Chave mestra (`masterKey`) derivada e armazenada no IndexedDB.
- Chaves VAPID para autenticação de pushes.

## Criptografia local de mensagens

Quando um contato tem a opção `encryptMessages` ativada e a configuração global também está ativada, o Loco criptografa o texto da mensagem antes de salvar no IndexedDB.

### Algoritmo: AES-GCM

O Loco usa **AES-GCM (Galois/Counter Mode)** com:

- Chave de 256 bits.
- IV (vetor de inicialização) de 96 bits, gerado aleatoriamente para cada mensagem.
- Tag de autenticação embutida no ciphertext.

### Fluxo de criptografia

```
Texto plano
    |
    v
Gera IV aleatório (12 bytes)
    |
    v
Criptografa com AES-GCM + masterKey
    |
    v
Concatena IV + ciphertext
    |
    v
Codifica em Base64
    |
    v
Armazena no IndexedDB
```

### Fluxo de descriptografia

```
Base64 do ciphertext
    |
    v
Decodifica para Uint8Array
    |
    v
Separa IV (primeiros 12 bytes)
    |
    v
Decriptografa com AES-GCM + masterKey
    |
    v
Texto plano
```

## Geração e armazenamento da masterKey

A `masterKey` é gerada uma única vez na primeira execução ou quando a criptografia é habilitada:

1. Gera 32 bytes aleatórios.
2. Codifica em Base64.
3. Armazena no IndexedDB com a chave `masterKeyRaw`.
4. Importa a chave para o objeto `CryptoKey` do Web Crypto API.

```javascript
const keyData = crypto.getRandomValues(new Uint8Array(32));
const b64 = btoa(String.fromCharCode(...keyData));
await storageSet("masterKeyRaw", b64);

masterKey = await crypto.subtle.importKey(
  "raw",
  keyData,
  { name: "AES-GCM", length: 256 },
  false,
  ["encrypt", "decrypt"]
);
```

## Como a criptografia é ativada

A criptografia pode ser ativada de duas formas:

1. **Globalmente**: em `Settings.tsx`, ativa `encryptMessages` no app.
2. **Por contato**: cada contato pode ter a flag `encryptMessages` ativada.

Uma mensagem só é criptografada quando **ambas** as opções estão ativadas: global e do contato.

## Integração com envio de mensagens

No `store.ts`, a função `smartSendMessage` verifica se deve criptografar:

```typescript
const shouldEncrypt =
  appConfig.value.encryptMessages && contact.encryptMessages;

if (shouldEncrypt) {
  finalText = await encryptMessage(text);
  isEncrypted = true;
}
```

A mensagem é então enviada via P2P ou Web Push. O destinatário, ao receber, chama `decryptMessage` se `isEncrypted` for `true`.

## Interface do usuário

No `ChatWindow.tsx`, mensagens criptografadas são exibidas com um ícone de cadeado 🔒:

```tsx
{m.isEncrypted && <span class="encrypted-badge">🔒</span>}
```

O texto descriptografado é armazenado em um mapa local (`decryptedMsgs`) para não reprocessar a cada renderização.

## VAPID: criptografia para Web Push

As chaves VAPID são usadas para autenticar o remetente junto ao servidor de push do navegador. Elas não criptografam o conteúdo da mensagem, mas garantem que o push foi enviado por uma origem identificável.

O par de chaves VAPID é gerado automaticamente na primeira execução e armazenado no IndexedDB.

## Limitações da criptografia atual

1. **Não é E2E real**: a chave é gerada e armazenada localmente. O destinatário recebe o texto já descriptografado (ou plaintext) via P2P/Push.
2. **Sem troca de chaves**: não há acordo de chaves entre remetente e destinatário.
3. **Proteção limitada**: protege apenas contra acesso local ao dispositivo, não contra interceptação na rede.
4. **Sem forward secrecy**: se a chave for comprometida, todas as mensagens passadas podem ser lidas.

## Cenários de ataque e proteção

| Ameaça | Proteção atual | Proteção ideal |
|--------|---------------|----------------|
| Alguém pega o celular desbloqueado | ✅ Mensagens criptografadas no armazenamento | ✅✅ E2E real |
| Interceptação na rede | ❌ Texto pode viajar em plaintext | ✅✅ E2E real |
| Servidor de push malicioso | ⚠️ Payload pode ser lido | ✅✅ Criptografia de payload |
| Chave mestra vazada | ❌ Todas as mensagens comprometidas | ✅✅ Forward secrecy |

## Melhorias futuras

### Criptografia ponta-a-ponta com Signal Protocol

Para E2E real, o Loco pode implementar algo como o **Signal Protocol**:

- Cada dispositivo gera um par de chaves X3DH (X25519).
- As chaves públicas são trocadas via QR Code ou primeiro contato P2P.
- As mensagens são criptografadas com a chave pública do destinatário.
- Apenas o destinatário pode decriptografar com sua chave privada.

### Criptografia de payload Web Push

Conforme a RFC 8291, o payload de um Web Push deve ser criptografado com a chave pública do subscriber (`p256dh`). Um **relay server** pode fazer essa criptografia sem ler o conteúdo.

### Forward Secrecy

Usar chaves efêmeras para cada mensagem, de modo que a quebra de uma chave não comprometa mensagens anteriores.

### Biometria

A API Web Authentication (WebAuthn) pode ser usada para proteger a `masterKey`, exigindo autenticação biométrica antes de decriptografar mensagens.

## Resumo

A criptografia atual do Loco protege os dados em repouso usando AES-GCM e uma `masterKey` local. Isso já é uma camada importante de privacidade, especialmente contra acesso físico não autorizado. No entanto, para um aplicativo de mensagens verdadeiramente seguro, o próximo passo é implementar **criptografia ponta-a-ponta** com troca segura de chaves entre os contatos.
