# Adicionar Contatos via QR Code e PWA Share no Loco

## O problema

Em um mensageiro descentralizado sem servidor central, não há uma base de dados
centralizada com números de telefone, e-mails ou nomes de usuário. Cada
dispositivo precisa descobrir como falar com outro. O Loco resolve isso
permitindo que cada usuário compartilhe sua própria identidade de contato com
outra pessoa.

Há duas formas principais de fazer isso:

1. **QR Code**: exibe um QR Code com os dados do perfil; o outro usuário
   escaneia.
2. **PWA Share API**: compartilha um link com os dados do perfil via outro app.

Ambas as abordagens transferem a mesma informação: quem é o usuário e como
alcançá-lo.

## O que é um contato no Loco

Um contato no Loco não é apenas um nome. Ele precisa de dados técnicos para
comunicação:

```typescript
interface Contact {
  id: string; // identificador único do usuário
  endpoint: string; // URL do serviço de push do destinatário
  keys: { p256dh: string; auth: string }; // chaves para criptografia do push
  vapidPublicKey: string; // chave pública VAPID do remetente
  displayName: string; // nome exibido localmente
  theirDisplayName: string; // nome que o contato escolheu para si
  photo?: string; // foto de perfil (opcional)
}
```

Sem essas informações, o Loco não consegue enviar mensagens ou push para o outro
dispositivo.

## Por que QR Code?

O QR Code é ideal para encontros presenciais:

- **Rápido**: apontar a câmera e pronto.
- **Não precisa de internet no momento**: o QR Code contém todos os dados; a
  conexão só é necessária depois para enviar mensagens.
- **Seguro em ambiente controlado**: funciona bem quando as duas pessoas estão
  perto uma da outra.
- **Sem compartilhamento com terceiros**: os dados não passam por nenhum
  servidor intermediário.

### Como funciona no Loco

1. Usuário A abre a tela de **Perfil**.
2. O app gera um link especial:

```
https://loco.app/#add={dados_codificados}
```

3. Os dados são codificados em Base64 e incluem:
   - `id`
   - `endpoint`
   - `keys`
   - `vapidPublicKey`
   - `displayName`

4. O app transforma esse link em um QR Code usando a biblioteca `@libs/qrcode`.
5. Usuário B abre a tela de **Escanear QR Code** (`QRScanner`).
6. A câmera detecta o QR Code.
7. O app decodifica o conteúdo e chama `addContact(...)`.
8. O novo contato aparece na lista de conversas.

### Exemplo de fluxo

```
Usuário A abre Perfil
    |
    v
Gera shareLink com #add=...
    |
    v
Renderiza QR Code
    |
    v
Usuário B escaneia
    |
    v
Decodifica Base64 e JSON
    |
    v
Adiciona contato automaticamente
```

## Por que PWA Share API?

O PWA Share API é ideal quando as pessoas não estão perto uma da outra:

- **Compartilhamento remoto**: enviar por WhatsApp, e-mail, SMS ou qualquer app.
- **Conveniente**: o usuário já conhece o fluxo de compartilhamento do celular.
- **Não depende de câmera**: funciona em dispositivos sem câmera ou quando não é
  possível escanear.
- **Integração nativa**: abre o menu de compartilhamento do sistema operacional.

### Como funciona no Loco

1. Usuário A abre a tela de **Perfil**.
2. Clica em **Compartilhar Link**.
3. O app gera o mesmo `shareLink` usado no QR Code.
4. O navegador abre o diálogo nativo de compartilhamento.
5. Usuário A escolhe o app (WhatsApp, e-mail, etc.).
6. Usuário B recebe o link e clica.
7. O navegador abre o Loco com `#add=...`.
8. O app processa o hash e adiciona o contato.

### Exemplo de código

```typescript
const handleShare = () => {
  if (navigator.share) {
    navigator.share({
      title: "Meu ID P2P",
      url: getShareLink(),
    });
  } else {
    navigator.clipboard.writeText(getShareLink());
    alert("Link copiado!");
  }
};
```

## Por que não usar apenas um campo de busca?

Em apps tradicionais como WhatsApp ou Telegram, você busca um número de telefone
ou @username. Isso funciona porque há um servidor central que sabe onde cada
usuário está.

No Loco, não há servidor central. Cada usuário é responsável por publicar seu
próprio "endereço" (push subscription + VAPID). Por isso, o compartilhamento
direto via QR Code ou Share API é a forma mais natural e sem servidor de
adicionar contatos.

## Segurança e privacidade

### O que é compartilhado

- `id`: identificador público do usuário.
- `endpoint`: URL do serviço de push. Sem ele, não é possível enviar push.
- `keys.p256dh` e `keys.auth`: chaves públicas para criptografia do payload Web
  Push.
- `vapidPublicKey`: chave pública do remetente para autenticação.
- `displayName`: nome escolhido pelo usuário.

### O que não é compartilhado

- `privateKey` VAPID (permanece no dispositivo).
- `masterKey` de criptografia local.
- Histórico de mensagens.
- Arquivos.

### Considerações

- O `endpoint` do Web Push é uma URL que pode revelar qual serviço de push o
  destinatário usa (ex: FCM para Chrome).
- Qualquer pessoa com o link pode adicionar o usuário. Não há convites
  pendentes.
- No futuro, pode-se adicionar **links temporários** ou **com senha** para maior
  privacidade.

## Formato do link

```
https://loco.app/#add=<base64url>
```

Onde `<base64url>` é:

```typescript
const data = {
  endpoint: mySubscription.value?.endpoint,
  keys: mySubscription.value?.keys,
  vapidPublicKey: myVapidKeys.value?.publicKey,
  id: myId.value,
  displayName: myDisplayName.value,
};

const encoded = btoa(encodeURIComponent(JSON.stringify(data)));
```

## Fluxo completo de adição

```
Usuário A deseja adicionar Usuário B
    |
    v
Perfil aberto no Loco
    |
    v
Gera shareLink com dados do perfil
    |
    v
Compartilha via QR Code ou Share API
    |
    v
Usuário B recebe o link/escaneia
    |
    v
Loco abre e detecta #add=...
    |
    v
Decodifica e valida os dados
    |
    v
addContact(data.id, { ...dados, addedAt: Date.now() })
    |
    v
Contato aparece na lista
```

## Implementação no código

### Geração do link (`store.ts`)

```typescript
export function getShareLink() {
  const data = {
    endpoint: mySubscription.value?.endpoint,
    keys: mySubscription.value?.keys,
    vapidPublicKey: myVapidKeys.value?.publicKey,
    id: myId.value,
    displayName: myDisplayName.value,
  };
  return `${location.origin}#add=${
    btoa(encodeURIComponent(JSON.stringify(data)))
  }`;
}
```

### Geração do QR Code (`Profile.tsx`)

```typescript
export async function generateQRCode() {
  if (typeof document === "undefined") return;
  const canvas = document.createElement("canvas");
  await toCanvas(canvas, getShareLink(), { width: 256 });
  qrCodeDataUrl.value = canvas.toDataURL("image/png");
}
```

### Leitura do QR Code (`QRScanner.tsx`)

```typescript
const handleResult = (value: string) => {
  if (value.includes("#add=")) {
    const encoded = value.split("#add=")[1];
    const data = JSON.parse(decodeURIComponent(atob(encoded)));
    addContact(data.id, {
      ...data,
      displayName: data.displayName || "Novo Contato",
      theirDisplayName: data.displayName || "",
      addedAt: Date.now(),
      lastContact: null,
    });
  }
};
```

### Processamento do hash na inicialização (`App.tsx`)

```typescript
if (location.hash.startsWith("#add=")) {
  const encoded = location.hash.split("#add=")[1];
  const data = JSON.parse(decodeURIComponent(atob(encoded)));
  addContact(data.id, {
    ...data,
    displayName: data.displayName || "Novo Contato",
    theirDisplayName: data.displayName || "",
    addedAt: Date.now(),
    lastContact: null,
  });
  history.replaceState(null, "", "/");
}
```

## Quando usar cada abordagem

| Situação               | QR Code        | Share API                             |
| ---------------------- | -------------- | ------------------------------------- |
| Pessoalmente           | ✅ Ideal       | ⚠️ Possível                           |
| Remotamente            | ❌ Não prático | ✅ Ideal                              |
| Dispositivo sem câmera | ❌             | ✅                                    |
| Compartilhar em grupo  | ⚠️ Difícil     | ✅ Fácil                              |
| Ambiente sem internet  | ✅ Funciona    | ⚠️ Precisa de rede para enviar o link |

## Problemas comuns

### QR Code não é detectado

- Navegador não suporta `BarcodeDetector`.
- Câmera sem permissão.
- QR Code muito pequeno ou fora de foco.

### Link de compartilhamento não abre

- Navegador não tem o Loco instalado como PWA.
- Outro app abre o link em um webview que não processa o hash.
- Dados do link corrompidos ou incompletos.

### Contato não recebe pushes

- `endpoint` pode ter expirado.
- Permissão de notificações negada.
- Serviço de push do destinatário indisponível.

## Melhorias futuras

- **Links temporários**: gerar links que expiram após um tempo.
- **Links com senha**: exigir uma palavra-passe para adicionar.
- **QR Code com design**: permitir customização visual do QR Code.
- **Deep links**: usar `web+loco:` para abrir o app nativamente em vez de hash.
- **Verificação de contato**: mostrar fingerprint da chave para evitar MITM.

## Resumo

- **QR Code** é rápido e seguro para encontros presenciais.
- **PWA Share API** é conveniente para compartilhamento remoto.
- Ambos transferem os mesmos dados técnicos necessários para comunicação P2P e
  Web Push.
- A adição de contatos no Loco reflete a filosofia do app: **descentralizado,
  sem servidor e sob controle do usuário**.
