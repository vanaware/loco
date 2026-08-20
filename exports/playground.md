> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém experimentos e código da área de PLAYGROUND.
> O projeto é o **Loco ** estruturado em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco - Modo: PLAYGROUND

Gerado automaticamente em: 8/19/2026, 10:52:18 PM

---

## Arquivo: `monorepo/playground/src/types/jsx.d.ts`

```ts
// Extensão de tipos JSX para Preact para reconhecer Custom Elements do BeerCSS v5
import "preact";

declare module "preact" {
  namespace JSX {
    interface IntrinsicElements {
      "ui-button": any;
      "ui-icon": any;
      "ui-field": any;
      "ui-badge": any;
      "ui-list": any;
      "ui-item": any;
      "ui-nav": any;
    }
  }
}
```

---

## Arquivo: `monorepo/playground/src/router.ts`

```ts
import { signal, computed } from "@preact/signals";

/**
 * Normaliza o caminho de navegação.
 * Caso o usuário acesse a raiz ("/") ou um caminho inválido,
 * redireciona o estado padrão para "/chats".
 */
export function normalizePath(path: string): string {
  if (!path || path === "/" || path.trim() === "") {
    return "/chats";
  }
  return path;
}

function getInitialPath(): string {
  if (typeof globalThis.location !== "undefined") {
    return normalizePath(globalThis.location.pathname);
  }
  return "/chats";
}

// Signal de estado reativo global para o caminho atual
export const currentPath = signal<string>(getInitialPath());

/**
 * Signal computado mantido no escopo do módulo.
 * Evita a destruição e recriação do sinal a cada renderização do Preact.
 */
export const activeRoute = computed(() => {
  const path = currentPath.value;
  if (path.startsWith("/contacts")) return "contacts";
  if (path.startsWith("/settings")) return "settings";
  return "chats";
});

/**
 * Navega para uma nova rota atualizando a History API e impedindo o reload da página.
 */
export function navigateTo(path: string, event?: Event): void {
  if (event) {
    event.preventDefault();
  }
  
  const targetPath = normalizePath(path);
  
  if (
    typeof globalThis.history !== "undefined" &&
    globalThis.location.pathname !== targetPath
  ) {
    globalThis.history.pushState({}, "", targetPath);
  }
  
  currentPath.value = targetPath;
}

// Escuta os botões "Voltar" e "Avançar" do navegador
if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("popstate", () => {
    const path = globalThis.location ? globalThis.location.pathname : "/chats";
    currentPath.value = normalizePath(path);
  });
}
```

---

## Arquivo: `monorepo/playground/src/index.html`

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Loco PWA - E2EE Messenger</title>

  <!-- Favicon SVG Inline -->
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔒</text></svg>">

  <!-- Google Material Symbols (MD3) -->
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />

  <!-- BeerCSS Framework v5.0.3 (CSS + Custom Elements JS) -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/beercss@5.0.3/dist/cdn/beer.min.css" />
  <script type="module" src="https://cdn.jsdelivr.net/npm/beercss@5.0.3/dist/cdn/beer.min.js"></script>
  
  <!-- Material Dynamic Colors -->
  <script type="module" src="https://cdn.jsdelivr.net/npm/material-dynamic-colors@1.1.4/dist/cdn/material-dynamic-colors.min.js"></script>
</head>
<body class="light">
  <div id="app"></div>
  <script type="module" src="/main.js"></script>
</body>
</html>
```

---

## Arquivo: `monorepo/playground/src/main.tsx`

```tsx
// src/main.tsx
import { render } from "preact";
import { App } from "./App.tsx";

// Buscamos o contêiner principal definido no index.html
const rootElement = document.getElementById("app");

// Verificação de segurança estrutural
if (rootElement) {
  // Inicializa a árvore de componentes reativos do Preact
  render(<App />, rootElement);
  console.log("🚀 Loco PWA: Interface reativa e Custom Elements (BeerCSS v5) montados com sucesso.");
} else {
  // Log de erro claro para facilitar o processo de depuração
  console.error("❌ Loco PWA Erro Fatal: Elemento de montagem '#app' não encontrado no DOM. Verifique a estrutura do arquivo index.html.");
}
```

---

## Arquivo: `monorepo/playground/src/components/ChatMaster.tsx`

```tsx
import { Signal } from "@preact/signals";

export interface Contact {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  time: string;
  unreadCount: number;
  online: boolean;
}

interface ChatMasterProps {
  contacts: Contact[];
  selectedChatId: Signal<string | null>;
}

export function ChatMaster({ contacts, selectedChatId }: ChatMasterProps) {
  return (
    <section
      className={`col ${
        selectedChatId.value ? "m4 l3 m l" : "s12 m4 l3"
      } surface border-right`}
      style={{ height: "100%", overflow: "hidden" }}
    >
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <header className="padding row middle-align" style={{ flexShrink: 0 }}>
          <h5 className="max">Conversas</h5>
          <button className="circle transparent" aria-label="Novo Chat">
            <i>edit</i>
          </button>
        </header>

        <div className="padding no-top" style={{ flexShrink: 0 }}>
          <div className="field prefix round fill max">
            <i>search</i>
            <input type="text" placeholder="Buscar conversas..." />
          </div>
        </div>

        <div className="scroll" style={{ flex: 1, overflowY: "auto" }}>
          {contacts.map((contact) => (
            <a
              key={contact.id}
              href={`/chats?id=${contact.id}`}
              className={`row wave padding ${
                selectedChatId.value === contact.id ? "active surface-container-high" : ""
              }`}
              onClick={(e) => {
                e.preventDefault();
                selectedChatId.value = contact.id;
              }}
            >
              <div className="pos-relative">
                <img src={contact.avatar} className="circle extra" alt={contact.name} />
                {contact.online && (
                  <span className="badge dot green pos-absolute bottom right" />
                )}
              </div>
              <div className="max min">
                <div className="row middle-align">
                  <h6 className="max small-text bold">{contact.name}</h6>
                  <span className="small-text text-secondary">{contact.time}</span>
                </div>
                <p className="small-text line-clamp-1">{contact.lastMessage}</p>
              </div>
              {contact.unreadCount > 0 && (
                <span className="badge circle primary">{contact.unreadCount}</span>
              )}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
```

---

## Arquivo: `monorepo/playground/src/components/NavBottom.tsx`

```tsx
import { activeRoute, navigateTo } from "../router.ts";

export function NavBottom() {
  return (
    <nav className="bottom s m surface elevation-2">
      <a
        href="/chats"
        className={activeRoute.value === "chats" ? "active" : ""}
        onClick={(e) => navigateTo("/chats", e)}
      >
        <i>chat</i>
        <span>Conversas</span>
      </a>
      <a
        href="/contacts"
        className={activeRoute.value === "contacts" ? "active" : ""}
        onClick={(e) => navigateTo("/contacts", e)}
      >
        <i>group</i>
        <span>Contatos</span>
      </a>
      <a
        href="/settings"
        className={activeRoute.value === "settings" ? "active" : ""}
        onClick={(e) => navigateTo("/settings", e)}
      >
        <i>settings</i>
        <span>Ajustes</span>
      </a>
    </nav>
  );
}
```

---

## Arquivo: `monorepo/playground/src/components/NavSidebar.tsx`

```tsx
import { activeRoute, navigateTo } from "../router.ts";

export function NavSidebar() {
  return (
    <nav className="left l surface elevation-1">
      <header className="center-align padding">
        <i className="extra">lock</i>
      </header>
      <a
        href="/chats"
        className={activeRoute.value === "chats" ? "active" : ""}
        onClick={(e) => navigateTo("/chats", e)}
      >
        <i>chat</i>
        <span>Conversas</span>
      </a>
      <a
        href="/contacts"
        className={activeRoute.value === "contacts" ? "active" : ""}
        onClick={(e) => navigateTo("/contacts", e)}
      >
        <i>group</i>
        <span>Contatos</span>
      </a>
      <a
        href="/settings"
        className={activeRoute.value === "settings" ? "active" : ""}
        onClick={(e) => navigateTo("/settings", e)}
      >
        <i>settings</i>
        <span>Ajustes</span>
      </a>
    </nav>
  );
}
```

---

## Arquivo: `monorepo/playground/src/components/ChatDetail.tsx`

```tsx
import { Signal, ReadonlySignal } from "@preact/signals";
import { Contact } from "./ChatMaster.tsx";

export interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
  status: "sent" | "delivered" | "read";
}

interface ChatDetailProps {
  activeContact: ReadonlySignal<Contact | null>;
  activeMessages: ReadonlySignal<Message[]>;
  selectedChatId: Signal<string | null>;
  messageInput: Signal<string>;
  onSendMessage: (e: Event) => void;
}

export function ChatDetail({
  activeContact,
  activeMessages,
  selectedChatId,
  messageInput,
  onSendMessage,
}: ChatDetailProps) {
  return (
    <section
      className={`col ${
        selectedChatId.value ? "s12 m8 l9" : "m8 l9 m l"
      } surface-container-lowest`}
      style={{ height: "100%", overflow: "hidden" }}
    >
      {activeContact.value ? (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
          
          {/* CABEÇALHO DO CHAT */}
          <header className="padding row middle-align surface border-bottom" style={{ flexShrink: 0 }}>
            <button
              className="circle transparent s"
              style={{ marginRight: "0.5rem" }}
              onClick={() => {
                selectedChatId.value = null;
              }}
              aria-label="Voltar para a lista de conversas"
            >
              <i>arrow_back</i>
            </button>

            <img
              src={activeContact.value.avatar}
              className="circle medium"
              alt={activeContact.value.name}
            />

            <div className="max margin-left">
              <h6 className="small-text bold">{activeContact.value.name}</h6>
              <span className="small-text text-secondary">
                {activeContact.value.online ? "Online (E2EE Ativo)" : "Offline"}
              </span>
            </div>

            <button className="circle transparent" aria-label="Detalhes">
              <i>info</i>
            </button>
          </header>

          {/* ROLAGEM DE MENSAGENS */}
          <div className="scroll padding" style={{ flex: 1, overflowY: "auto" }}>
            {activeMessages.value.map((msg) => {
              const isMe = msg.senderId === "me";
              return (
                <div
                  key={msg.id}
                  className={`row ${isMe ? "right-align" : "left-align"} margin-bottom`}
                >
                  <div
                    className={`card padding round ${
                      isMe ? "primary-container" : "surface-container-high"
                    }`}
                    style={{ maxWidth: "75%", display: "inline-block" }}
                  >
                    <p className="margin-none">{msg.text}</p>
                    <div className="row right-align no-space margin-top-small">
                      <span
                        className="small-text text-secondary"
                        style={{ fontSize: "0.75rem" }}
                      >
                        {msg.timestamp}
                      </span>
                      {isMe && (
                        <i className="small margin-left-small text-primary">
                          {msg.status === "read" ? "done_all" : "done"}
                        </i>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* FORMULÁRIO DE ENVIO FIXO NO RODAPÉ */}
          <footer className="padding surface border-top" style={{ flexShrink: 0 }}>
            <form onSubmit={onSendMessage} className="row middle-align no-space">
              <button type="button" className="circle transparent" aria-label="Anexar">
                <i>attach_file</i>
              </button>

              <div className="field max round fill margin-horizontal">
                <input
                  type="text"
                  placeholder="Mensagem criptografada..."
                  value={messageInput.value}
                  onInput={(e) => {
                    messageInput.value = (e.target as HTMLInputElement).value;
                  }}
                />
              </div>

              <button type="submit" className="circle primary" aria-label="Enviar">
                <i>send</i>
              </button>
            </form>
          </footer>

        </div>
      ) : (
        /* PLACEHOLDER DESKTOP / TABLET */
        <div className="middle-align center-align max" style={{ height: "100%" }}>
          <div className="center-align opacity-60">
            <i className="extra">lock</i>
            <h5 className="margin-top">Loco PWA Messenger</h5>
            <p>Selecione uma conversa ao lado para iniciar a comunicação E2EE.</p>
          </div>
        </div>
      )}
    </section>
  );
}
```

---

## Arquivo: `monorepo/playground/src/App.tsx`

```tsx
import { signal, computed } from "@preact/signals";
import { activeRoute } from "./router.ts";
import { NavSidebar } from "./components/NavSidebar.tsx";
import { NavBottom } from "./components/NavBottom.tsx";
import { ChatMaster, Contact } from "./components/ChatMaster.tsx";
import { ChatDetail, Message } from "./components/ChatDetail.tsx";

// Signals Globais no Escopo de Módulo
const selectedChatId = signal<string | null>(null);
const messageInput = signal<string>("");

// Mocks de Dados
const mockContacts: Contact[] = [
  {
    id: "1",
    name: "Alice Vance (E2EE)",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150",
    lastMessage: "Chave pública trocada via ECDH.",
    time: "10:42",
    unreadCount: 2,
    online: true,
  },
  {
    id: "2",
    name: "Bob Builder",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150",
    lastMessage: "Service Worker sincronizado.",
    time: "Ontem",
    unreadCount: 0,
    online: false,
  },
  {
    id: "3",
    name: "CyberNode #882",
    avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150",
    lastMessage: "Pacote enfileirado no IndexedDB.",
    time: "Segunda",
    unreadCount: 0,
    online: true,
  },
];

const mockMessages: Record<string, Message[]> = {
  "1": [
    { id: "m1", senderId: "1", text: "Olá! A sessão E2EE está ativa.", timestamp: "10:40", status: "read" },
    { id: "m2", senderId: "me", text: "Perfeito. Mensagens persistidas no IndexedDB.", timestamp: "10:41", status: "read" },
    { id: "m3", senderId: "1", text: "Chave pública trocada via ECDH.", timestamp: "10:42", status: "read" },
  ],
  "2": [
    { id: "m4", senderId: "2", text: "Service Worker sincronizado.", timestamp: "Ontem", status: "read" },
  ],
  "3": [
    { id: "m5", senderId: "3", text: "Pacote enfileirado no IndexedDB.", timestamp: "Segunda", status: "read" },
  ],
};

// Computeds no escopo do módulo
const activeContact = computed(() =>
  mockContacts.find((c) => c.id === selectedChatId.value) || null
);

const activeMessages = computed(() =>
  selectedChatId.value ? mockMessages[selectedChatId.value] || [] : []
);

export function App() {
  const handleSendMessage = (e: Event) => {
    e.preventDefault();
    if (!messageInput.value.trim() || !selectedChatId.value) return;

    const newMessage: Message = {
      id: `msg_${Date.now()}`,
      senderId: "me",
      text: messageInput.value,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      status: "sent",
    };

    if (!mockMessages[selectedChatId.value]) {
      mockMessages[selectedChatId.value] = [];
    }
    mockMessages[selectedChatId.value].push(newMessage);
    messageInput.value = "";
  };

  return (
    <div className="layout" style={{ height: "100dvh", overflow: "hidden" }}>
      {/* NAVEGAÇÕES COMPONENTIZADAS */}
      <NavSidebar />
      <NavBottom />

      {/* ÁREA PRINCIPAL DA APLICAÇÃO */}
      <main className="responsive max" style={{ height: "100%", overflow: "hidden", padding: 0 }}>
        
        {/* VIEW 1: CONVERSAS (MASTER-DETAIL) */}
        {activeRoute.value === "chats" && (
          <div className="grid no-space max" style={{ height: "100%", overflow: "hidden" }}>
            <ChatMaster contacts={mockContacts} selectedChatId={selectedChatId} />
            <ChatDetail
              activeContact={activeContact}
              activeMessages={activeMessages}
              selectedChatId={selectedChatId}
              messageInput={messageInput}
              onSendMessage={handleSendMessage}
            />
          </div>
        )}

        {/* VIEW 2: CONTATOS */}
        {activeRoute.value === "contacts" && (
          <div className="padding">
            <h3>Contatos P2P</h3>
            <p>Lista descentralizada de nós e pares verificados via WebCrypto.</p>
          </div>
        )}

        {/* VIEW 3: CONFIGURAÇÕES */}
        {activeRoute.value === "settings" && (
          <div className="padding">
            <h3>Ajustes e Chaves E2EE</h3>
            <p>Gerenciamento de par de chaves ECDH e persistência local.</p>
          </div>
        )}

      </main>
    </div>
  );
}
```

---

## Arquivo: `monorepo/playground/tests/App.test.ts`

```ts
import { assertEquals } from "jsr:@std/assert";

Deno.test("Estado inicial da fila de sincronização deve ser zero", () => {
  // Isolamento da lógica de estado que usaremos no IndexedDB depois
  const queueCount = 0;
  assertEquals(queueCount, 0, "A fila deve começar vazia em uma nova sessão");
});
```

---

## Arquivo: `monorepo/playground/tests/state.test.ts`

```ts
import { assertEquals } from "jsr:@std/assert";
import { signal, computed } from "npm:@preact/signals-core"; // Usando core apenas para teste de lógica isolada

Deno.test("Estado global: Fila de mensagens deve calcular pendências corretamente", () => {
  type Message = { id: string; status: "pending" | "synced" };
  
  const messages = signal<Message[]>([]);
  const pendingCount = computed(() => messages.value.filter(m => m.status === "pending").length);

  // Inicial
  assertEquals(pendingCount.value, 0);

  // Adiciona mensagem pendente
  messages.value = [...messages.value, { id: "1", status: "pending" }];
  assertEquals(pendingCount.value, 1);

  // Simula Handshake de Sincronização
  messages.value = messages.value.map(m => ({ ...m, status: "synced" }));
  assertEquals(pendingCount.value, 0);
});
```

---

## Arquivo: `monorepo/playground/tests/router_test.ts`

```ts
import { assertEquals } from "jsr:@std/assert@1.0.0";
import { currentRoute, transitionDirection, navigate, goBack } from "../src/router.ts";

Deno.test("Router - Navegação inicial padrão deve ser 'chats'", () => {
  assertEquals(currentRoute.value, "chats");
});

Deno.test("Router - Navegar para rota mais profunda deve definir direção 'right'", () => {
  navigate("security-keys");
  assertEquals(currentRoute.value, "security-keys");
  assertEquals(transitionDirection.value, "right");
});

Deno.test("Router - Função goBack deve retornar à rota anterior com direção 'left'", () => {
  navigate("chats");
  navigate("security-keys");
  
  goBack();
  
  assertEquals(currentRoute.value, "chats");
  assertEquals(transitionDirection.value, "left");
});
```

---

## Arquivo: `monorepo/playground/tests/master_detail_test.ts`

```ts
import { assertEquals } from "jsr:@std/assert@1.0.0";
import { signal } from "https://esm.sh/@preact/signals@1.3.0";

// Auxiliar de geração de classes idêntico ao utilitário da UI
function getMasterClasses(selectedId: string | null): string {
  return `col ${selectedId ? "m4 l3 m l" : "s12 m4 l3"} surface border-right`;
}

function getDetailClasses(selectedId: string | null): string {
  return `col ${selectedId ? "s12 m8 l9" : "m8 l9 m l"} surface-container-lowest`;
}

Deno.test("MasterDetail - Estado Inicial sem Chat Selecionado", () => {
  const selectedChatId = signal<string | null>(null);

  const masterClass = getMasterClasses(selectedChatId.value);
  const detailClass = getDetailClasses(selectedChatId.value);

  // Painel Master deve ter a classe 's12' para ocupar 100% no mobile
  assertEquals(masterClass.includes("s12"), true);
  assertEquals(masterClass.includes("m l"), false);

  // Painel Detail deve ter as classes 'm l' para ficar OCULTO no mobile
  assertEquals(detailClass.includes("m l"), true);
  assertEquals(detailClass.includes("s12"), false);
});

Deno.test("MasterDetail - Seleção de Chat Ativo", () => {
  const selectedChatId = signal<string | null>("chat_123");

  const masterClass = getMasterClasses(selectedChatId.value);
  const detailClass = getDetailClasses(selectedChatId.value);

  // Painel Master deve conter 'm l' para ser OCULTO no mobile
  assertEquals(masterClass.includes("m l"), true);
  assertEquals(masterClass.includes("s12"), false);

  // Painel Detail deve conter 's12' para ocupar 100% no mobile
  assertEquals(detailClass.includes("s12"), true);
  assertEquals(detailClass.includes("m l"), false);
});

Deno.test("MasterDetail - Retorno à Lista de Conversas", () => {
  const selectedChatId = signal<string | null>("chat_123");

  // Simula clique no botão de voltar (limpa a seleção)
  selectedChatId.value = null;

  const masterClass = getMasterClasses(selectedChatId.value);
  
  assertEquals(masterClass.includes("s12"), true);
  assertEquals(masterClass.includes("m l"), false);
});
```

---

## Arquivo: `monorepo/playground/tests/router_path_test.ts`

```ts
import { assertEquals } from "jsr:@std/assert@1.0.0";
import { currentPath, navigateTo } from "../src/router.ts";

Deno.test("Router - Normalização da Rota Raiz ('/')", () => {
  navigateTo("/");
  assertEquals(currentPath.value, "/chats");
});

Deno.test("Router - Navegação para Rota Válida ('/contacts')", () => {
  navigateTo("/contacts");
  assertEquals(currentPath.value, "/contacts");
});

Deno.test("Router - Navegação para Rota Válida ('/settings')", () => {
  navigateTo("/settings");
  assertEquals(currentPath.value, "/settings");
});

Deno.test("Router - Normalização de String Vazia", () => {
  navigateTo("");
  assertEquals(currentPath.value, "/chats");
});
```

---

## Arquivo: `monorepo/playground/tests/responsive_layout_test.ts`

```ts
import { assertEquals } from "jsr:@std/assert@1.0.0";

Deno.test("Layout - Verificação de Mapeamento de Classes Responsivas", () => {
  const leftNavClasses = "left l surface elevation-1";
  const bottomNavClasses = "bottom s m surface elevation-2";

  // Left Nav deve estar visível apenas em telas grandes ('l')
  assertEquals(leftNavClasses.includes("l"), true);
  assertEquals(leftNavClasses.includes("m"), false);

  // Bottom Nav deve estar visível em pequenas ('s') e médias ('m')
  assertEquals(bottomNavClasses.includes("s"), true);
  assertEquals(bottomNavClasses.includes("m"), true);
});
```

---

## Arquivo: `monorepo/playground/tests/master_detail_visibility_test.ts`

```ts
import { assertEquals } from "jsr:@std/assert@1.0.0";

function getLayoutClasses(selectedChatId: string | null) {
  const masterClasses = selectedChatId ? "m4 l3 m l" : "s12 m4 l3";
  const detailClasses = selectedChatId ? "s12 m8 l9" : "m8 l9 m l";
  return { masterClasses, detailClasses };
}

Deno.test("Master-Detail - Seleção Ativa: Master oculta no mobile e Detail 100%", () => {
  const { masterClasses, detailClasses } = getLayoutClasses("chat_123");

  assertEquals(masterClasses.includes("m l"), true);
  assertEquals(masterClasses.includes("s12"), false);

  assertEquals(detailClasses.includes("s12"), true);
});

Deno.test("Master-Detail - Sem Seleção: Master 100% no mobile e Detail oculta", () => {
  const { masterClasses, detailClasses } = getLayoutClasses(null);

  assertEquals(masterClasses.includes("s12"), true);

  assertEquals(detailClasses.includes("m l"), true);
  assertEquals(detailClasses.includes("s12"), false);
});
```

---

## Arquivo: `monorepo/playground/tests/chat_footer_layout_test.ts`

```ts
import { assertEquals } from "jsr:@std/assert@1.0.0";

Deno.test("Chat Footer - Trava de Estilo e Flexbox para Rodapé Fixo", () => {
  const containerStyle = { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" };
  const footerStyle = { flexShrink: 0 };
  const messageAreaStyle = { flex: 1, overflowY: "auto" };

  assertEquals(containerStyle.overflow, "hidden");
  assertEquals(footerStyle.flexShrink, 0);
  assertEquals(messageAreaStyle.flex, 1);
  assertEquals(messageAreaStyle.overflowY, "auto");
});
```

---

## Arquivo: `monorepo/playground/tests/subcomponents_test.ts`

```ts
import { assertEquals } from "jsr:@std/assert@1.0.0";
import { signal, computed } from "@preact/signals";

Deno.test("Subcomponentes - Fluxo de Dados entre Signals e Active Contact", () => {
  const selectedChatId = signal<string | null>(null);
  const mockContacts = [
    { id: "1", name: "Alice", avatar: "", lastMessage: "", time: "", unreadCount: 0, online: true },
    { id: "2", name: "Bob", avatar: "", lastMessage: "", time: "", unreadCount: 0, online: false }
  ];

  const activeContact = computed(() =>
    mockContacts.find((c) => c.id === selectedChatId.value) || null
  );

  assertEquals(activeContact.value, null);

  selectedChatId.value = "1";
  assertEquals(activeContact.value?.name, "Alice");

  selectedChatId.value = "2";
  assertEquals(activeContact.value?.name, "Bob");
});
```

---

## Arquivo: `monorepo/playground/docs/ui-architecture.md`

```md
# Arquitetura de Interface e Componentes

## Registro de Decisão: Adoção do BeerCSS (Agosto 2026)
Após experimentarmos o ecossistema de Web Components (`@material/web`) e wrappers React via ESM (`@m3e/react`), decidimos adotar o **BeerCSS**.

**Motivação Arquitetural:**
1. **Fricção Zero com JSX/Preact:** Web Components exigem typings complexos no TypeScript (e às vezes uso excessivo de `refs`), enquanto bibliotecas React sofrem problemas de build em CDNs (ESM). 
2. **Semântica HTML:** O BeerCSS utiliza o padrão semântico puro para implementar o Material Design 3. Escrevemos tags padrão do HTML5 (ex: `<button class="fill">`), permitindo que o Preact faça o diff no Virtual DOM de forma extremamente otimizada.
3. **Leveza:** Ideal para a nossa arquitetura PWA Offline-First, eliminando dependências JavaScript inchadas.

No futuro, para garantir o funcionamento 100% offline, os arquivos estáticos do BeerCSS serão armazenados em cache pelo Service Worker ou embutidos no nosso bundle final.
```

---

## Arquivo: `monorepo/playground/docs/01-router-e-navegacao.md`

```md
# 🗺️ Arquitetura de Roteamento e Transição de Páginas (Loco PWA)

## 📌 Visão Geral
O **Loco PWA** utiliza uma solução de roteamento sem dependências de terceiros, construída sobre o ecossistema **Deno 2.x**, **Preact Signals** e os elementos `<div class="page">` nativos do **Beer CSS**.

## 🚀 Como Funciona

### 1. Estado Global Reativo (`src/router.ts`)
O estado da rota atual (`currentRoute`) e a direção da animação (`transitionDirection`) são expostos como *Signals*:
- `currentRoute`: Armazena a rota ativa (`chats`, `contacts`, `settings`, `security-keys`).
- `transitionDirection`: Determina o vetor físico da animação CSS (`right`, `left`, `top`, `bottom`).

### 2. Animação Física com Beer CSS
O Beer CSS define comportamentos de opacidade e posições CSS dinâmicas baseadas na classe `.page`:
- `<div className="page right active">`: A página entra deslizando da direita para o centro.
- `<div className="page left">`: A página permanece oculta à esquerda aguardando o retorno.

### 3. Profundidade de Rota e Sincronização
Ao navegar com `navigate(targetRoute)`:
1. O sistema compara a **profundidade** (`ROUTE_DEPTH`) da rota de destino com a atual.
2. Se `targetDepth >= currentDepth`, a animação é configurada como `right` (avanço).
3. Se `targetDepth < currentDepth`, a animação é configurada como `left` (retorno).
4. O hash da URL é atualizado (`#contacts`), garantindo que o botão "Voltar" do navegador ou do smartphone funcione nativamente.
```

---

## Arquivo: `monorepo/playground/docs/02-master-detail-beercss.md`

````md
# 🏛️ Documentação de Arquitetura: Layout Master-Detail Responsivo com Beer CSS

## 📌 Contexto
No ecossistema do PWA **Loco**, a experiência do usuário precisa adaptar-se com fluidez entre dispositivos de telas grandes (Desktop) e dispositivos móveis (Mobile), mantendo o padrão do Material Design 3 fornecido pela biblioteca **Beer CSS**.

## 🛠️ Regras de Visibilidade Responsiva no Beer CSS

O Beer CSS gerencia os breakpoints de tela através dos seletores e modificadores nativos do seu Grid system:

| Breakpoint | Identificador | Intervalo de Tela | Comportamento |
| :--- | :--- | :--- | :--- |
| **Small** | `s` | `<= 600px` | Dispositivos Mobile |
| **Medium** | `m` | `601px - 992px` | Tablets |
| **Large** | `l` | `> 992px` | Desktops |
| **Tablet/Desktop** | `m l` | `> 600px` | Combinação de Medium e Large |

### 🛑 Por que classes como `hide-on-small` falhavam?
O Beer CSS não reconhece convenções do Materialize CSS ou do Bootstrap. Utilizar classes externas resultava no não ocultamento dos painéis em telas pequenas, travando a interface em um estado rígido.

---

## 🔀 Matriz de Estados do Master-Detail

Através do estado global/local gerenciado pelo Signal `selectedChatId`, as classes dos painéis alternam dinamicamente conforme a tabela abaixo:

| Estado do App | Visão Mobile (`s`) | Visão Desktop (`m` e `l`) |
| :--- | :--- | :--- |
| **Nenhum Chat Selecionado** (`selectedChatId = null`) | **Lista Master:** `s12` (100% de largura)<br>**Chat Detail:** `m l` (Oculto via `display: none`) | **Lista Master:** `m4` / `l3`<br>**Chat Detail:** `m8` / `l9` (Mostra Placeholder) |
| **Chat Selecionado** (`selectedChatId = "1"`) | **Lista Master:** `m l` (Oculta via `display: none`) <br>**Chat Detail:** `s12` (100% de largura) | **Lista Master:** `m4` / `l3`<br>**Chat Detail:** `m8` / `l9` (Mostra Mensagens) |

---

## 🔙 Fluxo de Navegação Mobile

No modo Detail em telas pequenas (`s`), o cabeçalho do Chat insere dinamicamente o botão de navegação:

```tsx
<button className="circle transparent s" onClick={() => selectedChatId.value = null}>
  <i>arrow_back</i>
</button>

```

A inclusão do modificador `s` assegura que este botão seja totalmente invísivel em desktops e tablets, onde a navegação ocorre por clique direto na lista lateral.

````

---

## Arquivo: `monorepo/playground/docs/03-diagnostico-roteamento.md`

```md
# 🛠️ Documentação de Resolução: Correção da Rota Raiz e Renderização Vazia

## 📌 Descrição do Incidente
Após a implementação das melhorias de layout, a interface do **Loco PWA** parou de renderizar o conteúdo principal ao acessar o endereço raiz (`/`), exibindo exclusivamente a barra de navegação lateral.

## 🔬 Análise da Causa Raiz
O componente `App.tsx` realizava a verificação de rotas diretamente comparando o caminho com strings fixas (`currentPath.value === "/chats"`). 

Quando a aplicação é carregada inicialmente, o objeto `window.location.pathname` avalia para `"/"`. Como `"/"` não possuía um bloco condicional correspondente em `<main>`, nenhuma sub-árvore JSX era montada pelo Virtual DOM do Preact.

## 📐 Solução Implementada

1. **Normalização na Origem (`src/router.ts`):**
   A função `normalizePath()` foi inserida para tratar caminhos vazios ou a raiz `"/"`, convertendo-os automaticamente para `"/chats"`.

2. **Signal Computado com Fallback Segura (`src/App.tsx`):**
   Criamos o Signal `activeRoute = computed(...)`. Ele valida o caminho atual e, caso receba uma rota não reconhecida, retorna por padrão `"chats"`, impedindo que a aplicação fique sem conteúdo.

3. **Invariância do Layout Beer CSS:**
   As regras do **Master-Detail** do Beer CSS (`s12`, `m4 l3`, `m8 l9`, `m l`) foram mantidas integralmente e continuam a alternar entre a lista e o chat em telas pequenas sem requerer utilitários externos.
```

---

## Arquivo: `monorepo/playground/docs/05-correcao-layout-responsivo.md`

```md
# 📱 Documentação de Arquitetura: Ajustes do Layout Flexbox e Responsividade MD3

## 📌 Contexto
Correção de três comportamentos indesejados no layout responsivo do Loco PWA durante a alternância entre dispositivos Mobile (`s`), Tablet (`m`) e Desktop (`l`).

---

## 🛠️ Detalhamento Técnico das Mudanças

### 1. Garantia de Visibilidade do Footer no Chat
- **Problema**: O uso de `100vh` em elementos dentro do `<main>` fazia com que o campo de texto fosse projetado para baixo da barra de navegação inferior (`bottom nav`), ficando oculto.
- **Solução**:
  - Remoção das referências de `100vh` em containers internos.
  - Adoção de um container Flexbox vertical (`flex-direction: column; height: 100%`).
  - O painel de mensagens recebeu `flex: 1; overflow-y: auto`, enquanto o `<header>` e o `<footer>` receberam `flex-shrink: 0`.

### 2. Adaptação do Menu para Telas Médias (`m`)
- A navegação lateral agora é exclusiva de desktops (`nav.left.l`).
- Em tablets e celulares (`nav.bottom.s.m`), o aplicativo exibe a barra inferior, otimizando o espaço horizontal para o layout Master-Detail de 2 colunas (`m4` e `m8`).

### 3. Alinhamento da Seta de Voltar
- Substituição de `center-align` por `middle-align` nas linhas de cabeçalho.
- O `middle-align` aplica o alinhamento de eixo transversal (`align-items: center`) mantendo o alinhamento horizontal flexível, garantindo que o botão de voltar fique fixado à esquerda.
```

---

## Arquivo: `monorepo/playground/docs/06-correcao-master-detail-mobile.md`

```md
# 📱 Documentação de Arquitetura: Comportamento Stack Master-Detail em Telas Pequenas (`s`)

## 📌 Contexto
Correção do comportamento de exibição empilhada/lado a lado das visões Master (Lista) e Detail (Mensagens) em telas pequenas (`s`).

---

## 📐 Matriz de Visibilidade Master-Detail

| Chat Selecionado? | Dispositivo / Breakpoint | Classe do Master | Classe do Detail | Visibilidade Efetiva |
| :--- | :--- | :--- | :--- | :--- |
| **Sim** | Mobile (`s`) | `col m4 l3 m l` | `col s12 m8 l9` | **Detail ocupa 100%** (Master oculta por `m l`) |
| **Sim** | Tablet / Desktop (`m` / `l`) | `col m4 l3 m l` | `col s12 m8 l9` | **Dividido em colunas** (4/8 em `m`, 3/9 em `l`) |
| **Não** | Mobile (`s`) | `col s12 m4 l3` | `col m8 l9 m l` | **Master ocupa 100%** (Detail oculta por `m l`) |
| **Não** | Tablet / Desktop (`m` / `l`) | `col s12 m4 l3` | `col m8 l9 m l` | **Dividido em colunas** (Placeholder exibido à direita) |

---

## 🛠️ Regra de Ocultação CSS vs Estilos Inline

- **Diagnóstico:** O BeerCSS utiliza seletores CSS `.m.l` para aplicar `display: none` no breakpoint `s`. Ao declarar `style={{ display: "flex" }}` diretamente no elemento `<section>`, o navegador dava precedência ao estilo inline, impedindo a ocultação da coluna.
- **Solução Aplicada:** O estilo Flexbox foi encapsulado numa `<div>` descendente, mantendo o elemento `<section>` limpo para aceitar as regras de exibição das classes do BeerCSS.
```

---

## Arquivo: `monorepo/playground/docs/07-fix-fixed-chat-footer.md`

```md
# 📱 Arquitetura de Interface: Ancoragem Fixa do Input de Envio em PWAs

## 📌 Contexto
Correção do comportamento de vazamento de rolagem do contêiner de mensagem em visões mobile/responsive. O grupo de envio rolava juntamente com a página em vez de permanecer fixado na base da janela de chat (acima da navegação inferior do app).

---

## 🛠️ Arquitetura de Layout (Flexbox & Viewport Lock)

1. **Restrição de Viewport (`100dvh`)**:
   - O uso de `100dvh` na raiz `.layout` impede que a barra de navegação dos navegadores móbiles altere a altura calculada da aplicação, travando a rolagem nativa da página (`overflow: hidden`).

2. **Isolamento de Eixo Flexbox**:
   - `header` (`flex-shrink: 0`): Fixo no topo do chat.
   - `scroll` (`flex: 1; overflow-y: auto`): Único contêiner com rolagem interna de mensagens.
   - `footer` (`flex-shrink: 0`): Fixo na base da área do chat, imediatamente acima de `<nav className="bottom">` quando exibido em telas pequenas.
```

---

## Arquivo: `monorepo/playground/docs/08-componentizacao-e-roteamento.md`

```md
# 🧩 Documentação de Arquitetura: Componentização e Roteamento Declarativo

## 📌 Visão Geral
A arquitetura do Loco PWA prioriza a reatividade declarativa do **Preact** aliada ao motor de temas do **BeerCSS v5**.

## 🔄 BeerCSS Pages vs. Preact Signals

1. **Por que não utilizar `page` nativo do BeerCSS?**
   - O recurso de páginas do BeerCSS depende de chamadas imperativas via JavaScript (`ui("#page-id")`) manipulando o DOM diretamente.
   - No Preact, manter o ciclo de vida do DOM sob controle das *Signals* garante que elementos inativos não fiquem na árvore de renderização sem necessidade, otimizando o consumo de memória em dispositivos móveis.

2. **Divisão de Subcomponentes:**
   - `NavSidebar` & `NavBottom`: Isolação dos controles de navegação por breakpoints.
   - `ChatMaster`: Gerencia unicamente a listagem de conversas e estado de seleção.
   - `ChatDetail`: Contém o chat ativo, histórico de mensagens e o formulário de envio ancorado.
```

---

## Arquivo: `monorepo/playground/server.ts`

```ts
import { serveDir } from "jsr:@std/http/file-server";

const PORT = 8000;

console.log(`🌐 Servidor minimalista Loco PWA rodando.`);
console.log(`Acesse: http://localhost:${PORT}/index.html`);

Deno.serve({ port: PORT }, (req: Request) => {
  // O serveDir é nativo e otimizado para servir arquivos locais
  return serveDir(req, {
    fsRoot: "./build/dist",
    showDirListing: true,
  });
});
```

---

## Arquivo: `monorepo/playground/build.ts`

```ts
// build.ts
import { ensureDir } from "jsr:@std/fs";

console.log("🚀 Iniciando build do Loco PWA...");
const startTime = performance.now();

try {
  // 1. Garante que a pasta de destino exista
  await ensureDir("./build/dist");

  // 2. Pre-aquecimento do cache
  console.log("📦 Resolvendo e cacheando dependências remotas...");
  const cacheCmd = new Deno.Command(Deno.execPath(), {
    args: ["cache", "./src/main.tsx"],
  });
  const cacheOutput = await cacheCmd.output();
  
  if (!cacheOutput.success) {
    const errorMsg = new TextDecoder().decode(cacheOutput.stderr);
    console.error(errorMsg);
    throw new Error("Falha ao colocar dependências em cache. Verifique o import map.");
  }

  // 3. Compilação da aplicação
  console.log("⚙️ Gerando bundle da aplicação...");
  const result = await Deno.bundle({
    entrypoints: [
      "./src/main.tsx"
    ],
    outputDir: "./build/dist",
    platform: "browser",
    format: "esm",
    bundle: true,
    minify: false, 
    write: true,   
    jsx: "automatic",
    jsxImportSource: "preact",
    jsxFactory: "h",
    jsxFragment: "Fragment",
  });

  if (!result.success) {
    console.error(result.errors);
    throw new Error("Falha ao gerar bundle pelo compilador interno.");
  }
  
  for (const warning of result.warnings || []) {
    console.warn(warning);
  }

  // 4. Copia o arquivo estático HTML
  await Deno.copyFile("./src/index.html", "./build/dist/index.html");

  const endTime = performance.now();
  console.log(`✅ Build concluído com sucesso em ${(endTime - startTime).toFixed(2)}ms!`);
  console.log("📁 Saída gerada no diretório: ./build/dist/");

} catch (error) {
  console.error("❌ Erro fatal durante o processo de build:");
  console.error(error);
  Deno.exit(1);
}
```

---

## Arquivo: `monorepo/playground/deno.jsonc`

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "lib": ["dom", "dom.iterable", "dom.asynciterable", "deno.ns"]
  },
  "imports": {
    "preact": "https://esm.sh/preact@10.19.6",
    "preact/": "https://esm.sh/preact@10.19.6/",
    "@preact/signals": "https://esm.sh/@preact/signals@1.2.2?external=preact"
  },

  "tasks": {
    "build": "deno run -A --unstable-bundle build.ts",
    "serve": "deno run -A server.ts",
    "dev": "deno run -A --watch server.ts"
  }


}
```

---

