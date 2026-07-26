# Gerenciamento de Estado no Loco

## Visão geral

O Loco usa uma arquitetura de estado reativa baseada em **signals** do Preact. O
estado centralizado vive no arquivo `src/store.ts` e é consumido pelos
componentes da interface.

A principal vantagem dessa abordagem:

- Estado global simples e previsível.
- Componentes reagem automaticamente a mudanças.
- Fácil persistir e restaurar dados do dispositivo.
- Separação clara entre estado, UI e persistência.

## O que são signals

Signals são unidades reativas de estado. No Preact, um signal é uma referência a
um valor que, quando alterada, notifica automaticamente quem está usando esse
valor.

```typescript
import { signal } from "@preact/signals";

const count = signal(0);

// Leitura
console.log(count.value); // 0

// Atualização
count.value = 1;
```

Quando `count.value` muda, qualquer componente que leu `count.value` é
re-renderizado automaticamente.

## Por que Preact Signals?

- **Leve**: o Preact é pequeno e rápido.
- **Familiar**: sintaxe semelhante ao React.
- **Reatividade fina**: apenas o componente que usa o signal atualiza, não toda
  a árvore.
- **Sem boilerplate**: não precisa de reducers, actions ou providers complexos.

## Estado centralizado no `store.ts`

Todo o estado significativo do app está em `src/store.ts`:

```typescript
// Identidade
export const myId = signal<string | null>(null);
export const myDisplayName = signal<string>("");
export const myVapidKeys = signal<VapidKeys | null>(null);

// Configurações
export const appConfig = signal<AppConfig>({ ... });

// Contatos e conversas
export const contacts = computed(() => new Map(contactsRaw.value));
export const chatSessions = computed(() => new Map(chatSessionsRaw.value));

// Navegação e UI
export const currentView = signal<ViewType>("list");
export const currentChatContact = signal<string | null>(null);
export const menuOpen = signal(false);

// Transferências e storage
export const transferState = signal<TransferState>({ ... });
export const storage = signal<StorageStatus>({ ... });
```

### Signals vs computed

- **Signals**: armazenam o estado mutável.
- **Computed**: derivam estado a partir de outros signals sem armazená-lo
  duplicado.

```typescript
const contactsRaw = signal<[string, Contact][]>([]);
export const contacts = computed(() => new Map(contactsRaw.value));
```

`contacts` é uma visualização em `Map` dos dados crus. Sempre que
`contactsRaw.value` muda, `contacts.value` é recalculado.

## Como os componentes usam o estado

```tsx
import { contacts, currentChatContact } from "../store.ts";

export function ChatWindow() {
  const id = currentChatContact.value;
  const contact = id ? contacts.value.get(id) : null;

  return (
    <div>
      <h1>{contact?.displayName}</h1>
    </div>
  );
}
```

Quando `currentChatContact.value` muda, o `ChatWindow` re-renderiza
automaticamente.

## Mutabilidade controlada

O Loco evita mutar arrays e objetos diretamente. Sempre que precisa atualizar,
cria uma cópia:

```typescript
export function addContact(id: string, contact: Contact) {
  const current = [...contactsRaw.value];
  const idx = current.findIndex(([cid]) => cid === id);
  if (idx !== -1) {
    current[idx] = [id, contact];
  } else {
    current.push([id, contact]);
  }
  contactsRaw.value = current; // dispara reatividade
  saveContacts(); // persiste
}
```

Isso garante que o Preact detecte a mudança e re-renderize os componentes.

## Persistência no IndexedDB

A função `initApp()` no `store.ts` carrega todos os dados do IndexedDB na
inicialização:

```typescript
export async function initApp() {
  myVapidKeys.value = await loadFromIDB("myVapidKeys", null);
  mySubscription.value = await loadFromIDB("mySubscription", null);
  myId.value = await loadFromIDB("myId", null);
  myDisplayName.value = await loadFromIDB("myDisplayName", "");
  appConfig.value = await loadFromIDB("appConfig", appConfig.value);
  contactsRaw.value = await loadFromIDB("contacts", []);
  chatSessionsRaw.value = await loadFromIDB("chatSessions", []);

  const filesMeta = await loadFromIDB<Record<string, StoredFile>>(
    "storedFiles",
    {},
  );
  storedFiles.value = new Map(Object.entries(filesMeta));
}
```

### O que é persistido

| Chave            | Tipo de dado | Onde é usado                 |
| ---------------- | ------------ | ---------------------------- |
| `myId`           | string       | Identidade do usuário        |
| `myDisplayName`  | string       | Nome do perfil               |
| `myVapidKeys`    | objeto       | Chaves VAPID para push       |
| `mySubscription` | objeto       | Inscrição no serviço de push |
| `appConfig`      | objeto       | Configurações gerais         |
| `contacts`       | array        | Lista de contatos            |
| `chatSessions`   | array        | Mensagens por contato        |
| `storedFiles`    | objeto       | Metadados de arquivos        |
| `masterKeyRaw`   | string       | Chave mestra de criptografia |

### O que não é persistido

- Estado transitório da UI (menu aberto, view atual).
- Dados de transferência P2P em andamento.
- Streams de chamada WebRTC.
- Cache de assets (gerenciado pela Cache API).

## Quando usar IndexedDB vs OPFS

### IndexedDB

Usado para dados estruturados e pequenos binários:

- Textos de mensagens.
- Configurações.
- Metadados de contatos e arquivos.
- Fotos de perfil (reduzidas a 200x200px).

### OPFS

Usado para arquivos grandes:

- Fotos originais.
- Vídeos.
- Áudios.
- Documentos PDF, DOC, etc.
- Qualquer arquivo recebido por P2P.

### Por que separar?

| Característica               | IndexedDB          | OPFS                   |
| ---------------------------- | ------------------ | ---------------------- |
| Ideal para                   | Dados estruturados | Arquivos grandes       |
| Performance de grandes blobs | Média              | Alta                   |
| Limite de tamanho            | Menor              | Maior                  |
| API                          | Key-value          | Sistema de arquivos    |
| Acesso síncrono              | Não                | Sim (SyncAccessHandle) |

## Sincronização entre signals e armazenamento

Quando o estado muda, o Loco persiste automaticamente:

```typescript
export function addContact(id: string, contact: Contact) {
  const current = [...contactsRaw.value];
  // ...atualiza
  contactsRaw.value = current;
  saveContacts(); // salva no IndexedDB
}

async function saveContacts() {
  await storageSet("contacts", contactsRaw.value);
}
```

Esse padrão é repetido para contatos, mensagens, configurações e metadados de
arquivos.

## Estado de transferências P2P

Transferências de arquivo são gerenciadas por um Web Worker, mas o estado é
refletido em signals:

```typescript
export const transferState = signal<TransferState>({
  isActive: false,
  role: null,
  fileName: "",
  progress: 0,
  speed: 0,
  peers: 0,
  status: "idle",
});
```

O Worker envia mensagens de progresso e o `store.ts` atualiza o signal. O
`TransferDock.tsx` lê esse signal para mostrar o progresso na UI.

## Estado de navegação

A navegação entre telas é simples:

```typescript
export function navigateTo(view: ViewType) {
  navigateWithTransition(() => {
    currentView.value = view;
  });
}
```

O componente `App.tsx` lê `currentView.value` e renderiza o componente correto.
Transições de view são aplicadas via View Transitions API quando disponível.

## Estado de notificações e badge

```typescript
export const unreadCount = signal(0);
```

Quando uma nova mensagem chega:

1. A mensagem é adicionada à sessão do contato.
2. `unreadCount` é atualizado.
3. `setAppBadge(unreadCount)` atualiza o badge do app.

## Estado de armazenamento

```typescript
export const storage = signal<StorageStatus>({ ... });
```

Esse signal reflete:

- Se o armazenamento está persistido.
- Quota total e usada.
- Se o armazenamento está baixo (>80%).

Um monitor periodicamente atualiza esse valor a cada 60 segundos.

## Anti-padrões a evitar

1. **Mutar signals diretamente**:

```typescript
// Ruim
contactsRaw.value.push([id, contact]);

// Bom
contactsRaw.value = [...contactsRaw.value, [id, contact]];
```

2. **Ler signals dentro de efeitos sem dependências corretas**:

```typescript
// Ruim
useEffect(() => {
  console.log(currentView.value);
}, []);

// Bom
useEffect(() => {
  console.log(currentView.value);
}, [currentView.value]);
```

3. **Armazenar derivados em signals**:

```typescript
// Ruim
const totalContacts = signal(contacts.value.size);

// Bom
const totalContacts = computed(() => contacts.value.size);
```

## Resumo

- O estado do Loco é gerenciado por **Preact Signals** no `store.ts`.
- Signals são reativos e causam re-renderização automática.
- `computed` é usado para derivar estado sem duplicação.
- Dados estruturados são persistidos no **IndexedDB**.
- Arquivos grandes são armazenados no **OPFS**.
- Sempre que um signal muda, o app salva a mudança no armazenamento persistente.
- A separação entre IndexedDB e OPFS otimiza performance e capacidade.

Essa arquitetura torna o Loco rápido, reativo e capaz de funcionar offline com
todos os dados essenciais disponíveis localmente.
