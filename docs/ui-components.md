# Componentes e Fluxos da Interface do Loco

## Visão geral

A interface do Loco é construída com **Preact** e **Material Design 3** via
biblioteca `@material/web`. A navegação é baseada em uma única página (SPA) onde
o componente raiz `App.tsx` gerencia qual view está sendo exibida.

O design é **mobile-first**, responsivo e segue os princípios do Material You
com suporte a temas, transições e componentes acessíveis.

## Componentes principais

### `App.tsx`

Componente raiz. Responsável por:

- Inicializar o app (`initApp`).
- Registrar o Service Worker.
- Gerenciar a navegação entre views.
- Processar hash `#add=` para adicionar contatos.
- Processar hash `#action=` para app shortcuts.
- Renderizar drawer de navegação e top bar.
- Exibir o `TransferDock` de transferências ativas.

### `ContactList`

Tela inicial. Exibe a lista de contatos/conversas ordenados por `lastContact`.
Quando vazia, mostra um empty state com CTA para adicionar contato.

### `ChatWindow.tsx`

Tela de conversa com um contato específico. Contém:

- Header com foto/nome do contato e status.
- Lista de mensagens.
- Área de input com botões para localização e anexo.
- Modal de edição de contato.
- Banner de conteúdo compartilhado (Share Target).

### `Profile.tsx`

Tela de perfil do usuário. Permite:

- Editar nome.
- Alterar foto de perfil.
- Ver e compartilhar QR Code.
- Compartilhar link via PWA Share API.

### `QRScanner.tsx`

Tela em tela cheia para escanear QR Code. Usa a câmera e a Barcode Detection
API. Quando detecta um link `#add=`, adiciona o contato automaticamente.

### `Settings.tsx`

Tela de configurações com:

- Status de armazenamento.
- Configurações gerais (DND, localização, criptografia).
- Lista de capacidades PWA.
- Backup e restauração.
- Configurações por contato.

### `CallScreen.tsx`

Tela de chamada de voz/vídeo. Exibe vídeo local e remoto e controles de chamada.

### `TransferDock.tsx`

Widget flutuante no rodapé que mostra progresso de transferências P2P ativas.

## Telas ao iniciar o aplicativo

Quando o usuário abre o Loco, o fluxo é:

```
Splash/Loading (implícito na inicialização)
    |
    v
ContactList
    |
    +--> Se não há contatos: empty state com CTA
    +--> Se há contatos: lista de conversas
```

### Tela de carregamento

Não existe uma tela de splash dedicada, mas a inicialização é rápida. O
`initApp()` carrega os dados do IndexedDB e o app renderiza imediatamente.

### Empty state

Se `contacts.value.size === 0`, a `ContactList` exibe:

- Ícone de caixa de entrada vazia (📭).
- Texto "Nenhuma conversa".
- Botão "Adicionar Contato" que leva à tela de Perfil.

Isso é importante para o primeiro uso, pois orienta o usuário a criar seu perfil
e adicionar contatos.

### Lista de conversas

Com contatos, a tela mostra:

- Avatar com foto ou inicial do nome.
- Nome do contato.
- Última mensagem ou tipo de mídia.
- Badge de não lidas, se houver.

A lista é ordenada por `lastContact`, com os mais recentes no topo.

## Onboarding

O Loco não tem um fluxo de onboarding tradicional com vários passos. Em vez
disso, o onboarding acontece de forma contextual:

### Primeira abertura

1. Usuário abre o app.
2. App gera automaticamente `myId` e `myVapidKeys` (primeira execução).
3. Tela `ContactList` aparece com empty state.
4. Usuário é convidado a ir ao Perfil.

### Criando o perfil

1. Usuário navega para `Profile`.
2. Insere o nome.
3. Opcional: faz upload de foto de perfil.
4. App gera QR Code e link de compartilhamento.

### Adicionando o primeiro contato

1. Usuário compartilha seu QR Code ou link.
2. Outro usuário escaneia ou clica no link.
3. Ambos aparecem na lista de contatos um do outro.

### Permissões solicitadas sob demanda

- **Câmera**: apenas ao abrir o QR Scanner.
- **Localização**: apenas ao clicar em enviar localização.
- **Notificações**: implicitamente quando o browser solicita para push.
- **Microfone/câmera**: apenas ao iniciar uma chamada.

Essa abordagem evita assustar o usuário com muitas permissões logo no início.

## PWA Share Target: abrir para enviar direto

### O que é

O Loco implementa **Web Share Target**, permitindo que outros apps (navegador,
galeria, etc.) compartilhem conteúdo diretamente com o Loco.

### Manifesto do Share Target

No `public/manifest.json`:

```json
"share_target": {
  "action": "/share-target",
  "method": "POST",
  "enctype": "multipart/form-data",
  "params": {
    "title": "title",
    "text": "text",
    "url": "url",
    "files": [
      {
        "name": "media",
        "accept": ["image/*", "video/*", "audio/*"]
      }
    ]
  }
}
```

### Fluxo de compartilhamento

```
Usuário está em outro app (ex: navegador)
    |
    v
Clica em "Compartilhar"
    |
    v
Seleciona "Loco"
    |
    v
Service Worker intercepta POST /share-target
    |
    v
Redireciona para /?shared_title=...&shared_text=...
    |
    v
App abre e detecta pendingShare
    |
    v
Usuário escolhe contato
    |
    v
Mensagem é enviada
```

### Interface de Share no Loco

Quando o app recebe um compartilhamento, exibe um banner na parte superior:

```
┌─────────────────────────────────────┐
│ 📤 Conteúdo recebido                │
│ Título do conteúdo compartilhado... │
│ [Selecionar contato]                │
└─────────────────────────────────────┘
```

Atualmente, o fluxo mostra o banner e permite que o usuário selecione um contato
na lista.

### Fluxo ideal planejado

O objetivo é que, ao abrir via Share Target, o app já apresente uma tela de
seleção de contato:

```
Compartilhamento recebido
    |
    v
Mostra tela "Enviar para..."
    |
    v
Lista de contatos com busca
    |
    v
Usuário seleciona contato
    |
    v
Abre ChatWindow com o conteúdo pré-preenchido
    |
    v
Usuário clica em "Enviar"
```

### Componente de seleção rápida de contato

Um componente futuro poderia ser:

```typescript
function ShareTargetContactPicker() {
  const contactsList = [...contacts.value.entries()];

  return (
    <div class="share-picker">
      <h3>Enviar para...</h3>
      <md-list>
        {contactsList.map(([id, c]) => (
          <md-list-item onClick={() => openChatWithShare(id)}>
            {c.displayName}
          </md-list-item>
        ))}
      </md-list>
    </div>
  );
}
```

### Tratamento do conteúdo compartilhado

O `processIncomingShare()` em `webShareTarget.ts` lê os parâmetros da URL:

```typescript
export function processIncomingShare() {
  const params = new URLSearchParams(location.search);
  const sharedTitle = params.get("shared_title");
  const sharedText = params.get("shared_text");
  const sharedUrl = params.get("shared_url");

  if (sharedTitle || sharedText || sharedUrl) {
    pendingShare.value = {
      title: sharedTitle,
      text: sharedText,
      url: sharedUrl,
    };
    history.replaceState(null, "", location.pathname);
  }
}
```

Esse conteúdo é armazenado no signal `pendingShare` e consumido pelo `App.tsx` e
`ChatWindow.tsx`.

### Banner no ChatWindow

Dentro do `ChatWindow.tsx`, quando `pendingShare.value` existe e há um contato
selecionado, mostra:

```tsx
{
  pendingShare.value && (
    <div class="share-banner">
      <span>Enviar conteúdo compartilhado?</span>
      <md-filled-tonal-button onClick={handleSendPendingShare}>
        Enviar
      </md-filled-tonal-button>
      <md-icon-button onClick={() => (pendingShare.value = null)}>
        <md-icon>close</md-icon>
      </md-icon-button>
    </div>
  );
}
```

### Compartilhamento de arquivos

Além de texto/URL, o manifesto aceita compartilhamento de arquivos. O fluxo
ideal seria:

1. Recebe arquivos via Share Target.
2. Armazena em `pendingFiles`.
3. Usuário seleciona contato.
4. Inicia transferência P2P do arquivo.
5. Envia mensagem com magnet link para o contato.

Esse fluxo ainda não está completamente implementado, mas a estrutura básica já
existe.

## Navegação e transições

A navegação usa uma função simples:

```typescript
export function navigateTo(view: ViewType) {
  navigateWithTransition(() => {
    currentView.value = view;
  });
}
```

A `navigateWithTransition` usa a View Transitions API quando disponível para
criar transições suaves entre telas.

## Componentes de feedback visual

O Loco usa consistentemente:

- **Badges**: não lidas, status de criptografia.
- **Snackbar/toast**: não implementado ainda, mas recomendado.
- **Loading states**: `md-circular-progress` enquanto QR Code ou dados carregam.
- **Empty states**: mensagens amigáveis quando não há dados.
- **Confirm dialogs**: `confirm()` nativo para ações destrutivas.

## Acessibilidade

A interface considera:

- Uso de componentes semânticos do Material Web.
- Atributos ARIA em componentes customizados.
- Contraste de cores do tema Material 3.
- Tamanhos de toque adequados para mobile.

## Próximos componentes planejados

- **`ShareTargetPicker`**: seleção rápida de contato ao receber share.
- **`ImageViewer`**: visualização em tela cheia de imagens.
- **`AudioRecorder`**: gravação de mensagens de voz.
- **`MessageSearch`**: busca no histórico.
- **`ConversationArchive`**: arquivar conversas antigas.

## Resumo

- O Loco usa uma SPA com navegação baseada em signals.
- O onboarding é contextual e minimalista.
- Share Target permite receber conteúdo de outros apps.
- O fluxo ideal de share envolve seleção rápida de contato e envio direto.
- A UI prioriza mobile, Material Design 3 e feedback visual claro.

A interface é projetada para ser simples, direta e alinhada com a filosofia do
app: comunicação direta, sem servidor e sob controle do usuário.
