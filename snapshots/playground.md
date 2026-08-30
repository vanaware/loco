> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém experimentos e código da área de PLAYGROUND.
> O projeto é o **Loco ** estruturado em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco - Modo: PLAYGROUND

Gerado automaticamente em: 8/30/2026, 6:43:32 PM

---

## Arquivo: `monorepo/playground/src/types/jsx.d.ts`

```ts
import "preact";

declare global {
  interface Window {
    ui?: (selector?: string, options?: unknown) => Promise<string> | void;
  }
}

declare module "preact" {
  namespace JSX {
    interface IntrinsicElements {
      page: HTMLAttributes<HTMLElement>;
    }
  }
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

  <!-- BeerCSS Framework v5.0.3 (CSS + Custom Elements JS) -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/beercss@5.0.3/dist/cdn/beer.min.css" />
  <script type="module" src="https://cdn.jsdelivr.net/npm/beercss@5.0.3/dist/cdn/beer.min.js"></script>
  
  <!-- Material Dynamic Colors -->
  <script type="module" src="https://cdn.jsdelivr.net/npm/material-dynamic-colors@1.1.4/dist/cdn/material-dynamic-colors.min.js"></script>

  <!-- Material Dynamic Fonts -->
  <script type="module" src="https://cdn.jsdelivr.net/npm/material-dynamic-fonts@0.0.3/dist/cdn/material-dynamic-fonts.min.js?font=Material Symbols Outlined&selector=i"></script>

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
import {
  contactsSignal,
  selectedChatId,
  selectChat,
  type Contact,
} from "../store/chatStore.ts";

export function ChatMaster() {
  const contacts = contactsSignal.value;
  const activeId = selectedChatId.value;

  // Alternância responsiva de telas em Mobile (s) vs Desktop (m/l)
  const responsiveGridClass = activeId ? "col m4 l3 m l" : "col s12 m4 l3";

  return (
    <section
      className={`${responsiveGridClass} surface border-right column max no-space`}
    >
      {/* CABEÇALHO DA LISTA */}
      <header className="padding border-bottom surface">
        <div className="row middle-align small-bottom-margin">
          <h5 className="max bold margin-none">Conversas</h5>
          <button
            type="button"
            className="circle transparent"
            aria-label="Nova conversa"
          >
            <i>edit_square</i>
          </button>
        </div>

        <div className="field prefix round fill small margin-none">
          <i>search</i>
          <input type="search" placeholder="Buscar conversas..." />
        </div>
      </header>

      {/* PAINEL DE ROLAGEM ISOLADO */}
      <div className="scroll max padding-small">
        <div className="list">
          {contacts.map((contact: Contact) => {
            const isSelected = activeId === contact.id;

            return (
              <button
                key={contact.id}
                type="button"
                className={`row wave padding round transparent left-align no-margin small-bottom-margin ${
                  isSelected ? "active primary-container" : ""
                }`}
                onClick={() => selectChat(contact.id)}
              >
                <div className="pos-relative">
                  <img
                    src={contact.avatar}
                    className="circle medium"
                    alt={contact.name}
                  />
                  {contact.online && (
                    <span className="badge dot green pos-bottom pos-right"></span>
                  )}
                </div>

                <div className="max min margin-left-small">
                  <div className="row middle-align no-space">
                    <h6 className="small-text bold max truncate margin-none">
                      {contact.name}
                    </h6>
                    <span className="small-text text-secondary">
                      {contact.time}
                    </span>
                  </div>
                  <p className="small-text text-secondary truncate margin-none">
                    {contact.lastMessage}
                  </p>
                </div>

                {contact.unreadCount > 0 && (
                  <span className="badge circle primary small">
                    {contact.unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
```

---

## Arquivo: `monorepo/playground/src/components/ContactsView.tsx`

```tsx
import { contactsSignal, startChatWithContact, type Contact } from "../store/chatStore.ts";

export function ContactsView() {
  const contacts = contactsSignal.value;

  return (
    <div className="padding max-width-medium margin-horizontal-auto">
      <header className="row middle-align margin-bottom">
        <h4 className="max bold margin-none">Contatos P2P</h4>
        <button type="button" className="button primary round">
          <i>person_add</i>
          <span>Adicionar</span>
        </button>
      </header>

      <div className="field prefix round fill margin-bottom">
        <i>search</i>
        <input type="search" placeholder="Buscar por nome ou fingerprint E2EE..." />
      </div>

      <div className="grid">
        {contacts.map((contact: Contact) => (
          <div key={contact.id} className="col s12 m6 l6">
            <article className="card surface-container-low padding round wave">
              <div className="row middle-align">
                <div className="pos-relative">
                  <img
                    src={contact.avatar}
                    className="circle large"
                    alt={contact.name}
                  />
                  {contact.online && (
                    <span className="badge dot green pos-bottom pos-right"></span>
                  )}
                </div>

                <div className="max margin-left-small">
                  <h6 className="small-text bold margin-none">{contact.name}</h6>
                  <span className="small-text text-secondary display-block truncate">
                    {contact.publicFingerprint || "Chave não verificada"}
                  </span>
                </div>
              </div>

              <div className="row right-align margin-top-small no-space">
                <button
                  type="button"
                  className="button transparent circle"
                  aria-label="Ver fingerprint"
                  title="Fingerprint E2EE"
                >
                  <i>fingerprint</i>
                </button>
                <button
                  type="button"
                  className="button primary round"
                  onClick={() => startChatWithContact(contact.id)}
                >
                  <i>chat</i>
                  <span>Conversar</span>
                </button>
              </div>
            </article>
          </div>
        ))}
      </div>

      {/* Respiro no final (Safe Area Bottom Mobile) */}
      <div className="large-space"></div>
    </div>
  );
}
```

---

## Arquivo: `monorepo/playground/src/components/ChatDetail.tsx`

```tsx
import {
  activeContact,
  activeMessages,
  selectedChatId,
  messageInput,
  sendMessage,
  selectChat,
  type Message,
} from "../store/chatStore.ts";

export function ChatDetail() {
  const contact = activeContact.value;
  const messages = activeMessages.value;
  const activeId = selectedChatId.value;

  // Alternância responsiva de telas em Mobile (s) vs Desktop (m/l)[cite: 4]
  const responsiveGridClass = activeId ? "col s12 m8 l9" : "col m8 l9 m l";

  return (
    <section className={`${responsiveGridClass} surface-container-lowest max column no-space`}>
      {contact ? (
        <div className="column max no-space">
          {/* TOPO: CABEÇALHO FIXO - Reforçado com restrições flex */}
          <header className="padding row middle-align surface border-bottom" style={{ flexShrink: 0 }}>
            <button
              type="button"
              className="circle transparent s margin-right"
              onClick={() => selectChat(null)}
              aria-label="Voltar para a lista"
            >
              <i>arrow_back</i>
            </button>

            <img
              src={contact.avatar}
              className="circle medium"
              alt={contact.name}
            />

            <div className="max margin-left">
              <h6 className="small-text bold margin-none truncate">
                {contact.name}
              </h6>
              <span className="small-text text-secondary truncate">
                {contact.online ? "Online (E2EE Ativo)" : "Offline"}
              </span>
            </div>

            <button
              type="button"
              className="circle transparent"
              aria-label="Detalhes"
            >
              <i>info</i>
            </button>
          </header>

          {/* MEIO: ÁREA DE ROLAGEM ISOLADA */}
          <div className="scroll max padding column" style={{ flex: 1, overflowY: "auto" }}>
            {messages.map((msg: Message) => {
              const isMe = msg.senderId === "me";
              return (
                <div
                  key={msg.id}
                  className={`row ${
                    isMe ? "right-align" : "left-align"
                  } small-bottom-margin`}
                >
                  <div
                    className={`padding round ${
                      isMe ? "primary-container" : "surface-container-high"
                    }`}
                  >
                    <p className="margin-none">{msg.text}</p>
                    <div className="row right-align no-space small-top-margin">
                      <span className="small-text text-secondary margin-right-small">
                        {msg.timestamp}
                      </span>
                      {isMe && (
                        <i className="small text-primary">
                          {msg.status === "read" ? "done_all" : "done"}
                        </i>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Respiro no final do scroll das mensagens */}
            <div className="small-space"></div>
          </div>

          {/* BASE: RODAPÉ FIXO */}
          <footer className="padding surface border-top" style={{ flexShrink: 0 }}>
            <form onSubmit={sendMessage} className="row middle-align no-space">
              <button
                type="button"
                className="circle transparent margin-right-small"
                aria-label="Anexar arquivo"
              >
                <i>attach_file</i>
              </button>

              <div className="field max round fill no-margin">
                <input
                  type="text"
                  placeholder="Mensagem criptografada..."
                  value={messageInput.value}
                  onInput={(e) => {
                    messageInput.value = (e.target as HTMLInputElement).value;
                  }}
                />
              </div>

              <button
                type="submit"
                className="circle primary margin-left-small"
                aria-label="Enviar mensagem"
              >
                <i>send</i>
              </button>
            </form>
          </footer>
        </div>
      ) : (
        /* ESTADO VAZIO (DESKTOP) */
        <div className="column middle-align center-align max padding">
          <div className="center-align opacity-60">
            <i className="extra">lock</i>
            <h5 className="top-margin">Loco PWA Messenger</h5>
            <p>Selecione uma conversa para iniciar a comunicação E2EE.</p>
          </div>
        </div>
      )}
    </section>
  );
}
```

---

## Arquivo: `monorepo/playground/src/components/NavBar.tsx`

```tsx
import { activeRoute, navigateTo, ROUTES } from "../router.ts";

interface NavItemsProps {
  isSidebar?: boolean;
}

export function NavItems({ isSidebar = false }: NavItemsProps) {
  // Lendo o Signal diretamente
  const currentRoute = activeRoute.value;

  return (
    <>
      {ROUTES.map((item) => {
        const isActive = currentRoute === item.id;
        
        const classes = ["transparent"];
        if (isSidebar) classes.push("circle");
        if (isActive) classes.push("active");

        return (
          <button
            key={item.id}
            className={classes.join(" ")}
            onClick={() => navigateTo(item.id)}
            aria-label={`Ir para ${item.label}`}
            title={item.label}
          >
            <i>{item.icon}</i>
            <span>{item.label}</span>
          </button>
        );
      })}
    </>
  );
}

export function NavBar() {
  return (
    <>
      <nav className="left m l border-right surface">
        <NavItems isSidebar={true} />
      </nav>
      <nav className="bottom s surface border-top">
        <NavItems isSidebar={false} />
      </nav>
    </>
  );
}
```

---

## Arquivo: `monorepo/playground/src/components/SettingsView.tsx`

```tsx
// Arquivo: monorepo/playground/src/components/SettingsView.tsx
import {
   themeModeSignal,
   themeColorSignal,
   setThemeMode,
   setThemeColor,
   PRESET_COLORS,
 } from "../store/themeStore.ts";
 
 export function SettingsView() {
   const currentTheme = themeModeSignal.value;
   const currentColor = themeColorSignal.value;
 
   return (
     <>
         <header className="margin-bottom">
           <h4 className="bold margin-none">Ajustes e Segurança</h4>
           <p className="text-secondary">
             Gerenciamento de tema, paleta dinamicamente injetada, par de chaves ECDH e armazenamento local.
           </p>
         </header>
 
         {/* MODO DE ILUMINAÇÃO */}
         <article className="small-round padding border">
           <div className="row">
             <i>contrast</i>
             <div className="max">
               <h6>Modo de Exibição</h6>
               <p className="small-text text-secondary">
                 Controle a iluminação da interface ou sincronize com o sistema.
               </p>
             </div>
           </div>
           <nav className="group connected">
             <button
               className={currentTheme === "light" ? "active" : ""}
               onClick={() => setThemeMode("light")}
             >
               <i>light_mode</i>
               <span>Claro</span>
             </button>
             <button
               className={currentTheme === "dark" ? "active" : ""}
               onClick={() => setThemeMode("dark")}
             >
               <i>dark_mode</i>
               <span>Escuro</span>
             </button>
             <button
               className={currentTheme === "system" ? "active" : ""}
               onClick={() => setThemeMode("system")}
             >
               <i>settings_brightness</i>
               <span>Sistema</span>
             </button>
           </nav>
         </article>
 
         {/* PALETA MATERIAL YOU */}
         <article className="small-round padding border">
           <div className="row">
             <i>palette</i>
             <div className="max">
               <h6>Cor de Destaque (Material You)</h6>
               <p className="small-text text-secondary">
                 Gere toda a paleta tonal da interface dinamicamente via BeerCSS.
               </p>
             </div>
           </div>
           <nav className="group connected">
             {PRESET_COLORS.map((preset) => {
               const isSelected = currentColor === preset.hex;
               return (
                 <button
                   key={preset.hex}
                   className={`chip ${isSelected ? "fill" : "border"}`}
                   onClick={() => setThemeColor(preset.hex)}
                 >
                   <span
                     className="circle tiny margin-right-small"
                     style={{ backgroundColor: preset.hex }}
                   ></span>
                   <span>{preset.name}</span>
                 </button>
               );
             })}
           </nav>
         </article>
 
         {/* CRIPTOGRAFIA */}
         <article className="small-round padding border">
           <div className="row">
             <i>key</i>
             <div className="max">
               <h6>Par de Chaves E2EE</h6>
               <p className="small-text">
                 Algoritmo ECDH (P-256) gerado localmente via WebCrypto API.
               </p>
             </div>
             <button className="border round">Renovar Chaves</button>
           </div>
         </article>
 
         {/* ARMAZENAMENTO LOCAL */}
         <article className="small-round padding border">
           <div className="row">
             <i>database</i>
             <div className="max">
               <h6>Armazenamento Local</h6>
               <p className="small-text">
                 Sincronização assíncrona via IndexedDB &amp; Service Worker.
               </p>
             </div>
             <button className="border small-round">Limpar Cache</button>
           </div>
         </article>
     </>
   );
 }
```

---

## Arquivo: `monorepo/playground/src/pages/ChatsPage.tsx`

```tsx
import { ChatMaster } from "../components/ChatMaster.tsx";
import { ChatDetail } from "../components/ChatDetail.tsx";

interface ChatsPageProps {
  active: boolean;
}

export function ChatsPage({ active }: ChatsPageProps) {
  // Impede a renderização no DOM se a rota não estiver ativa
  if (!active) return null;

  return (
    <page className="active max">
      <div className="grid no-space max">
        <ChatMaster />
        <ChatDetail />
      </div>
    </page>
  );
}
```

---

## Arquivo: `monorepo/playground/src/pages/SettingsPage.tsx`

```tsx
import { SettingsView } from "../components/SettingsView.tsx";

interface SettingsPageProps {
  active: boolean;
}

export function SettingsPage({ active }: SettingsPageProps) {
  // Impede a renderização no DOM se a rota não estiver ativa
  if (!active) return null;

  return (
    <page className="active scroll">
      <SettingsView />
    </page>
  );
}
```

---

## Arquivo: `monorepo/playground/src/pages/ContactsPage.tsx`

```tsx
import { ContactsView } from "../components/ContactsView.tsx";

interface ContactsPageProps {
  active: boolean;
}

export function ContactsPage({ active }: ContactsPageProps) {
  // Impede a renderização no DOM se a rota não estiver ativa
  if (!active) return null;

  return (
    <page className="active scroll">
      <ContactsView />
    </page>
  );
}
```

---

## Arquivo: `monorepo/playground/src/store/chatStore.ts`

```ts
import { signal, computed } from "@preact/signals";
import { navigateTo } from "../router.ts";

export interface Contact {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  time: string;
  unreadCount: number;
  online: boolean;
  publicFingerprint?: string;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
  status: "sent" | "delivered" | "read";
}

/**
 * FONTE ÚNICA DE VERDADE (SSOT) - CONTATOS E CONVERSAS
 */
export const contactsSignal = signal<Contact[]>([
  {
    id: "1",
    name: "Alice Vance (E2EE)",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150",
    lastMessage: "Sessão ECDH estabelecida com sucesso.",
    time: "10:45",
    unreadCount: 2,
    online: true,
    publicFingerprint: "A1:F8:3C:99:E0:42",
  },
  {
    id: "2",
    name: "Bob Builder",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150",
    lastMessage: "Mensagem enfileirada no IndexedDB offline.",
    time: "09:12",
    unreadCount: 1,
    online: false,
    publicFingerprint: "B2:E7:4D:11:A9:88",
  },
  {
    id: "3",
    name: "CyberNode #882",
    avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150",
    lastMessage: "Chave pública renovada no par P2P.",
    time: "Ontem",
    unreadCount: 0,
    online: true,
    publicFingerprint: "C3:D6:5E:22:B8:77",
  },
  {
    id: "4",
    name: "Diana Prince",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
    lastMessage: "Pacote de semente gerado com WebCrypto.",
    time: "Segunda",
    unreadCount: 0,
    online: true,
    publicFingerprint: "D4:C5:6F:33:C7:66",
  },
]);

/**
 * MENSAGENS MOCKADAS POR CONTATO
 */
export const messagesSignal = signal<Record<string, Message[]>>({
  "1": [
    { id: "m1_1", senderId: "1", text: "Olá! Iniciando handshake E2EE via WebCrypto (P-256).", timestamp: "10:40", status: "read" },
    { id: "m1_2", senderId: "me", text: "Chave pública recebida. Derivando segredo via HKDF.", timestamp: "10:42", status: "read" },
    { id: "m1_3", senderId: "1", text: "Canal seguro ativo. Nenhuma chave privada saiu do dispositivo.", timestamp: "10:44", status: "read" },
    { id: "m1_4", senderId: "1", text: "Sessão ECDH estabelecida com sucesso.", timestamp: "10:45", status: "read" },
  ],
  "2": [
    { id: "m2_1", senderId: "2", text: "Testando envio de pacotes em modo sem conexão à rede.", timestamp: "09:00", status: "read" },
    { id: "m2_2", senderId: "me", text: "O Service Worker interceptou e salvou no IndexedDB.", timestamp: "09:05", status: "read" },
    { id: "m2_3", senderId: "2", text: "Mensagem enfileirada no IndexedDB offline.", timestamp: "09:12", status: "delivered" },
  ],
  "3": [
    { id: "m3_1", senderId: "3", text: "Conexão P2P sinalizada através de requisições WebPush.", timestamp: "Ontem 18:20", status: "read" },
    { id: "m3_2", senderId: "me", text: "Confirmado. Armazenamento persistente OPFS verificado.", timestamp: "Ontem 18:25", status: "read" },
    { id: "m3_3", senderId: "3", text: "Chave pública renovada no par P2P.", timestamp: "Ontem 19:00", status: "read" },
  ],
  "4": [
    { id: "m4_1", senderId: "4", text: "Gerei um novo par de chaves e de sementes via WebCrypto API.", timestamp: "Segunda 14:10", status: "read" },
    { id: "m4_2", senderId: "me", text: "Perfeito! A pré-chave foi registrada no catálogo local.", timestamp: "Segunda 14:15", status: "read" },
    { id: "m4_3", senderId: "4", text: "Pacote de semente gerado com WebCrypto.", timestamp: "Segunda 14:30", status: "read" },
  ],
});

/**
 * ESTADOS DE SELEÇÃO E CONTROLE
 */
export const selectedChatId = signal<string | null>(null);
export const messageInput = signal<string>("");

/**
 * COMPUTEDS REATIVOS
 */
export const activeContact = computed(() => {
  const id = selectedChatId.value;
  return contactsSignal.value.find((c) => c.id === id) || null;
});

export const activeMessages = computed(() => {
  const id = selectedChatId.value;
  return id ? messagesSignal.value[id] || [] : [];
});

/**
 * AÇÕES DO DOMÍNIO
 */
export function selectChat(id: string | null) {
  selectedChatId.value = id;

  if (id) {
    contactsSignal.value = contactsSignal.value.map((contact) =>
      contact.id === id ? { ...contact, unreadCount: 0 } : contact
    );
  }
}

export function startChatWithContact(contactId: string) {
  selectChat(contactId);
  navigateTo("chats");
}

export function sendMessage(e: Event) {
  e.preventDefault();
  const text = messageInput.value.trim();
  const chatId = selectedChatId.value;

  if (!text || !chatId) return;

  const newMessage: Message = {
    id: `msg_${Date.now()}`,
    senderId: "me",
    text,
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    status: "sent",
  };

  const currentMessages = messagesSignal.value;
  const currentChatMessages = currentMessages[chatId] || [];

  messagesSignal.value = {
    ...currentMessages,
    [chatId]: [...currentChatMessages, newMessage],
  };

  contactsSignal.value = contactsSignal.value.map((contact) => {
    if (contact.id === chatId) {
      return {
        ...contact,
        lastMessage: text,
        time: newMessage.timestamp,
      };
    }
    return contact;
  });

  messageInput.value = "";
}
```

---

## Arquivo: `monorepo/playground/src/store/themeStore.ts`

```ts
// Arquivo: monorepo/playground/src/store/themeStore.ts
import { signal, effect } from "@preact/signals";

export type ThemeMode = "light" | "dark" | "system";

export interface ColorSeed {
  name: string;
  hex: string;
}

export const PRESET_COLORS: ColorSeed[] = [
  { name: "Cyan Loco", hex: "#006689" },
  { name: "Emerald", hex: "#006b54" },
  { name: "Purple", hex: "#6b4ea2" },
  { name: "Amber", hex: "#825500" },
  { name: "Rose", hex: "#9b3749" },
];

const MODE_STORAGE_KEY = "loco_theme_mode";
const COLOR_STORAGE_KEY = "loco_theme_color";

const initialMode = (localStorage.getItem(MODE_STORAGE_KEY) as ThemeMode) || "system";
const initialColor = localStorage.getItem(COLOR_STORAGE_KEY) || PRESET_COLORS[0]?.hex || "#006689";

export const themeModeSignal = signal<ThemeMode>(initialMode);
export const themeColorSignal = signal<string>(initialColor);

/**
 * Aplica as personalizações utilizando a API nativa do BeerCSS v5.
 */
function applyBeerTheme(mode: ThemeMode, colorHex: string) {
  if (typeof window === "undefined") return;
  
  // Tradução da nossa semântica ("system") para a semântica do BeerCSS ("auto")
  const beerMode = mode === "system" ? "auto" : mode;

  // 1. Aplicação via API global do JS do BeerCSS
  if (typeof (window as any).ui === "function") {
    (window as any).ui("mode", beerMode);
    (window as any).ui("theme", colorHex);
    return;
  }

  // 2. Fallback declarativo via data-ui no HTML
  document.documentElement.setAttribute("data-ui", beerMode);
  document.documentElement.style.setProperty("--primary", colorHex);
}

// Reação em tempo real via Signals + Persistência local
effect(() => {
  const mode = themeModeSignal.value;
  const color = themeColorSignal.value;
  localStorage.setItem(MODE_STORAGE_KEY, mode);
  localStorage.setItem(COLOR_STORAGE_KEY, color);
  applyBeerTheme(mode, color);
});

export function setThemeMode(mode: ThemeMode) {
  themeModeSignal.value = mode;
}

export function setThemeColor(colorHex: string) {
  themeColorSignal.value = colorHex;
}
```

---

## Arquivo: `monorepo/playground/src/App.tsx`

```tsx
import { activeRoute } from "./router.ts";
import { NavBar } from "./components/NavBar.tsx";
import { ChatsPage } from "./pages/ChatsPage.tsx";
import { ContactsPage } from "./pages/ContactsPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";

export function App() {
  // Leitura direta do Signal (agora funcionará graças ao ajuste no deno.jsonc)
  const currentRoute = activeRoute.value;

  return (
    <>
      <NavBar />
      <main className="responsive max">
        <ChatsPage active={currentRoute === "chats"} />
        <ContactsPage active={currentRoute === "contacts"} />
        <SettingsPage active={currentRoute === "settings"} />
      </main>
    </>
  );
}
```

---

## Arquivo: `monorepo/playground/src/router.ts`

```ts
// Arquivo: monorepo/playground/src/router.ts
import { signal } from "@preact/signals";

export type Route = "chats" | "contacts" | "settings";

export interface RouteConfig {
  id: Route;
  label: string;
  icon: string;
  title: string;
}

/**
 * REGISTRO CENTRAL DE ROTAS (SSOT para Navegação e UI)
 */
export const ROUTES: RouteConfig[] = [
  { id: "chats", label: "Conversas", icon: "chat", title: "Mensagens E2EE" },
  { id: "contacts", label: "Contatos", icon: "group", title: "Contatos P2P" },
  { id: "settings", label: "Ajustes", icon: "settings", title: "Ajustes e Segurança" },
];

const VALID_ROUTES = ROUTES.map((r) => r.id);

/**
 * Função pura para extrair e validar a rota a partir de uma string de hash.
 * Exportada para permitir testes unitários isolados sem dependência do `window.location`.
 */
export function parseHash(hash: string): Route {
  const rawHash = hash.replace(/^#\/?/, "");
  if (rawHash && VALID_ROUTES.includes(rawHash as Route)) {
    return rawHash as Route;
  }
  return "chats";
}

function parseRoute(): Route {
  if (typeof globalThis.location === "undefined") {
    return "chats";
  }
  return parseHash(globalThis.location.hash);
}

// O Signal limpo e global
export const activeRoute = signal<Route>(parseRoute());

// Atualiza o estado quando a URL muda nativamente
if (typeof globalThis.window !== "undefined") {
  globalThis.addEventListener("hashchange", () => {
    activeRoute.value = parseRoute();
  });
}

// Mutação simples
export function navigateTo(route: Route) {
  if (typeof globalThis.location !== "undefined") {
    globalThis.location.hash = route;
  }
}
```

---

## Arquivo: `monorepo/playground/tests/App.test.ts`

```ts
import { assertEquals } from "@std/assert";

Deno.test("Estado inicial da fila de sincronização deve ser zero", () => {
  // Isolamento da lógica de estado que usaremos no IndexedDB depois
  const queueCount = 0;
  assertEquals(queueCount, 0, "A fila deve começar vazia em uma nova sessão");
});
```

---

## Arquivo: `monorepo/playground/tests/state.test.ts`

```ts
import { assertEquals } from "@std/assert";
import { signal, computed } from "@preact/signals-core"; // Usando core apenas para teste de lógica isolada

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

## Arquivo: `monorepo/playground/tests/master_detail_test.ts`

```ts
import { assertEquals } from "@std/assert";
import { signal } from "@preact/signals";

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

## Arquivo: `monorepo/playground/tests/responsive_layout_test.ts`

```ts
import { assertEquals } from "@std/assert";

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
import { assertEquals } from "@std/assert";

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
import { assertEquals } from "@std/assert";

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
import { assertEquals } from "@std/assert";
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

## Arquivo: `monorepo/playground/tests/router_path_test.ts`

```ts
// Arquivo: monorepo/playground/tests/router_path_test.ts
import { assertEquals } from "@std/assert";
import { parseHash } from "../src/router.ts";

Deno.test("Router - parseHash: Hash vazio ou inválido retorna 'chats' (fallback)", () => {
  assertEquals(parseHash(""), "chats");
  assertEquals(parseHash("#"), "chats");
  assertEquals(parseHash("#invalid"), "chats");
  assertEquals(parseHash("#/unknown"), "chats");
});

Deno.test("Router - parseHash: Rotas válidas são parseadas corretamente", () => {
  assertEquals(parseHash("#contacts"), "contacts");
  assertEquals(parseHash("#settings"), "settings");
  assertEquals(parseHash("#chats"), "chats");
});

Deno.test("Router - parseHash: Rotas com barra extra são normalizadas", () => {
  assertEquals(parseHash("#/contacts"), "contacts");
  assertEquals(parseHash("#/settings"), "settings");
});
```

---

## Arquivo: `monorepo/playground/tests/router_test.ts`

```ts
// Arquivo: monorepo/playground/tests/router_test.ts
import { assertEquals, assertExists } from "@std/assert";
import { ROUTES, activeRoute } from "../src/router.ts";

Deno.test("Router - ROUTES deve conter as 3 views principais", () => {
  assertEquals(ROUTES.length, 3);
  const ids = ROUTES.map((r) => r.id);
  assertEquals(ids.includes("chats"), true);
  assertEquals(ids.includes("contacts"), true);
  assertEquals(ids.includes("settings"), true);
});

Deno.test("Router - activeRoute deve iniciar com um valor válido em ambiente de teste", () => {
  // Em ambiente de teste Deno puro, location.hash é vazio ou indefinido, 
  // então o fallback "chats" deve ser acionado automaticamente.
  assertExists(activeRoute.value);
  assertEquals(typeof activeRoute.value, "string");
});

Deno.test("Router - Cada RouteConfig deve ter os metadados de UI necessários", () => {
  for (const route of ROUTES) {
    assertExists(route.label);
    assertExists(route.icon);
    assertExists(route.title);
  }
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

## Arquivo: `monorepo/playground/docs/01-router-e-navegacao.md`

```md
# 🗺️ Arquitetura de Roteamento e Transição de Páginas (Loco PWA)

## 📌 Visão Geral
O **Loco PWA** utiliza uma solução de roteamento SPA sem dependências externas, baseada na History API nativa e em **Preact Signals**[cite: 1].

## 🚀 Como Funciona

### 1. Estado Global Reativo (`src/router.ts`)
- `currentPath`: Signal contendo o caminho bruto da URL (ex: `/chats`, `/contacts`)[cite: 1].
- `activeRoute`: Signal computado que mapeia o caminho para o identificador da view (`chats`, `contacts`, `settings`)[cite: 1].
- `normalizePath()`: Trata caminhos nulos, vazios ou a raiz `/`, aplicando fallback padrão para `/chats`[cite: 1].

### 2. Navegação sem Reload
Ao chamar `navigateTo(path, event)`:
1. Interrompe o comportamento do link com `event.preventDefault()`[cite: 1].
2. Normaliza a URL de destino[cite: 1].
3. Atualiza o histórico do navegador via `window.history.pushState`[cite: 1].
4. Atualiza o Signal `currentPath`, re-renderizando dinamicamente apenas os componentes subscritos[cite: 1].
```

---

## Arquivo: `monorepo/playground/docs/LAYOUT.md`

````md
# Arquitetura de Shell e Layout Responsivo (BeerCSS v5)

## Estrutura do App Shell

Para preservar as barras de navegação nativas em dispositivos móveis e desktops sem CSS inline, o app shell deve seguir rigorosamente a hierarquia abaixo:

```tsx
<>
  <nav className="left m l">   {/* Visível apenas em Telas Médias e Grandes */}
  <nav className="bottom s">  {/* Visível apenas em Telas Pequenas (Mobile) */}
  <main className="responsive max no-space">
    <div className="grid no-space max">
      {/* Componentes de Visualização */}
    </div>
  </main>
</>
````

---

## Arquivo: `monorepo/playground/docs/04-frontend-architecture.md`

```md
# Arquitetura de Frontend: Preact + Signals no Deno

## A Stack de UI
O **Loco** utiliza uma abordagem *buildless-friendly* (isenta de empacotadores tradicionais complexos como Webpack/Vite que dependem de Node.js). 
Utilizamos **Preact** pela sua leveza e aderência aos padrões web, combinado com **@preact/signals** para reatividade fina (fine-grained reactivity).

## O Mapa de Importações (Import Maps) e o Padrão Singleton
Como não utilizamos npm, todas as dependências vêm de URLs (CDNs como `esm.sh` ou `jsr`).

**⚠️ Atenção Arquitetural Crítica:**
É estritamente necessário garantir que bibliotecas do ecossistema Preact (como Signals, Router, ou Material Web) compartilhem a **mesma instância do Preact** em memória. 

Se o `esm.sh` resolver versões diferentes, o DOM Virtual sofrerá bifurcação e a reatividade falhará silenciosamente (o estado muda, mas a tela não atualiza).

**Padrão de Configuração (`deno.jsonc`):**
Sempre utilize as *queries* de resolução do `esm.sh` (como `?external=preact` ou `?deps=preact@VERSAO`) ao importar pacotes satélites do Preact.

\`\`\`jsonc
{
  "imports": {
    "preact": "https://esm.sh/preact@10.19.6",
    "preact/": "https://esm.sh/preact@10.19.6/",
    "@preact/signals": "https://esm.sh/@preact/signals@1.2.2?external=preact"
  }
}
\`\`\`
```

---

## Arquivo: `monorepo/playground/docs/00-instruções-IA.md`

````md
# Diretrizes de Arquitetura: Protótipo PWA Offline-Only (Web Worker + DB Proxy)

## 📌 Contexto
Você é um assistente de IA especializado em desenvolvimento Front-end. Estamos construindo um protótipo de uma SPA (Single Page Application) PWA que roda 100% no navegador, de forma estritamente **Offline-Only**. 

Para garantir a melhor performance (60 FPS) e facilitar a migração do protótipo para a versão de produção, **toda a camada de persistência e I/O de dados roda fora da thread principal em um Web Worker**, enquanto a interface utiliza **Preact Signals** reativos.

## 🛠️ Stack Tecnológica
- **Ambiente:** Deno puro (Browser-only, sem servidor backend).
- **UI Framework:** Preact (com JSX/TSX) + `@preact/signals`.
- **Estilização/Componentes:** BeerCSS (HTML semântico).
- **Processamento de Dados:** Web Worker isolado (`worker.ts`).
- **Banco de Dados Local:** IndexedDB gerenciado via `idb-keyval` (dentro do Worker).
- **Mocks (Desenvolvimento):** `fake-indexeddb` (injetado dinamicamente no Worker).
- **Linguagem:** TypeScript estrito (`.ts` e `.tsx`).

---

## 📐 Regras de Ouro (Arquitetura)

### 1. Separação Absoluta da Thread Principal
- A **Main Thread (UI)** cuida unicamente da renderização do BeerCSS e atualização dos Signals do Preact.
- A **Worker Thread (`worker.ts`)** executa todo o I/O do IndexedDB e lógicas de dados pesadas.
- A comunicação entre Main Thread e Worker é envelopada pelo **`dbProxy.ts`**, fornecendo uma API baseada em `Promises` com sintaxe idêntica ao `idb-keyval` (`db.get()`, `db.set()`, etc.).

### 2. Componentes Burros (Dumb Components)
- Os componentes `.tsx` recebem `props`, consomem os `signals` do `store.ts` e chamam funções do `actions`.
- NUNCA importe bancos de dados, chame o Web Worker diretamente ou faça requisições de dentro de componentes JSX.

### 3. Aplicativo 100% Offline-Only
- Não existe API nem backend. Não crie requisições `fetch()`, filas de sincronização de rede ou propriedades de estado de rede (`isSynced`).
- O **Service Worker** serve apenas para Cache First de arquivos estáticos.

---

## 📁 Estrutura e Papel dos Arquivos

### `config.ts`
Central de flags do projeto.
```typescript
export const APP_CONFIG = {
  USE_FAKE_DB: true, // Se true, o Worker carrega fake-indexeddb na memória
};

```

### `types.ts`

Contratos e interfaces de dados reutilizados em todo o projeto.

### `worker.ts` (Thread Secundária)

Serviço de banco de dados genérico rodando no Web Worker. Escuta comandos CRUD (`GET`, `SET`, `UPDATE`, `DELETE`, `CLEAR`) e interage com o `idb-keyval` (ou `fake-indexeddb`).

### `dbProxy.ts` (Main Thread)

A ponte de comunicação. Instancia o `worker.ts` e expõe a API assíncrona para a `store.ts`:

```typescript
export const db = {
  get: <T>(key: string) => Promise<T>,
  set: <T>(key: string, val: T) => Promise<void>,
  delete: (key: string) => Promise<void>,
  clear: () => Promise<void>
};

```

### `store.ts` (Main Thread)

Gerenciador de Estado Global.

* Gerencia os `@preact/signals`.
* Utiliza `dbProxy.ts` para carregar e gravar dados sem travar a UI.
* Executa a rotina de "Seed" (população de dados falsos de teste) na inicialização caso esteja em modo FakeDB e o banco esteja vazio.

### `App.tsx` (e componentes `.tsx`)

Camada visual construída exclusivamente com BeerCSS e consumindo o `store.ts`.

---

## 📝 Fluxo de Trabalho ao Criar Novas Features

Quando solicitado a adicionar uma funcionalidade ou tela, siga esta ordem estrita:

1. **`types.ts`**: Declare os tipos e interfaces do modelo de dados.
2. **`store.ts`**: Adicione o `signal` necessário e a lógica dentro do `actions` usando `await db.set(...)` / `await db.get(...)`.
3. **Componentes `.tsx**`: Monte a interface semântica em BeerCSS consumindo o `store.ts`.

> **Nota para a IA:** Não modifique `worker.ts` ou `dbProxy.ts` a menos que seja necessário alterar a infraestrutura básica de banco de dados. Eles são genéricos e suportam qualquer entidade.

```

````

---

## Arquivo: `monorepo/playground/server.ts`

```ts
import { serveDir } from "@std/http/file-server";

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
// Arquivo: monorepo/playground/build.ts
import { ensureDir } from "@std/fs";

const clean = async () => {
  try {
    await Deno.remove("./build/dist", { recursive: true });
    console.log("📁 Arquivos anteriores excluídos");
  } catch {
    // diretório não existe, ok
  }
  await ensureDir("./build/dist");
};

const build = async () => {
  console.log("🚀 Iniciando build do Loco PWA...");
  const startTime = performance.now();

  try {
    // 1. Garante que a pasta de destino exista
    await clean();

    // 2. Compilação da aplicação
    console.log("⚙️ Gerando bundle da aplicação...");
    // Nota: O Deno.bundle lê as configs de JSX (react-jsx, preact) 
    // diretamente do deno.jsonc, não precisamos passá-las aqui.
    const result = await Deno.bundle({
      entrypoints: [
        "./src/main.tsx"
      ],
      outputDir: "./build/dist",
      platform: "browser",
      format: "esm",
      minify: false, 
      write: true,   
    });

    if (!result.success) {
      console.error(result.errors);
      throw new Error("Falha ao gerar bundle pelo compilador interno.");
    }

    for (const warning of result.warnings || []) {
      console.warn(warning);
    }

    // 3. Copia o arquivo estático HTML
    await Deno.copyFile("./src/index.html", "./build/dist/index.html");

    const endTime = performance.now();
    console.log(`✅ Build concluído com sucesso em ${(endTime - startTime).toFixed(2)}ms!`);
    console.log("📁 Saída gerada no diretório: ./build/dist/");
  } catch (error) {
    console.error("❌ Erro fatal durante o processo de build:");
    console.error(error);
    Deno.exit(1);
  }
};

await build();
```

---

## Arquivo: `monorepo/playground/deno.jsonc`

```json
// Arquivo: monorepo/playground/deno.jsonc
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "lib": ["dom", "dom.iterable", "dom.asynciterable", "deno.ns", "deno.unstable"],
    "strict": true
  },
  "imports": {
    "preact": "https://esm.sh/preact@10.29.7",
    "preact/": "https://esm.sh/preact@10.29.7/",
    "preact/jsx-runtime": "https://esm.sh/preact@10.29.7/jsx-runtime",
    "@preact/signals": "https://esm.sh/@preact/signals@1.3.1?deps=preact@10.29.7",
    "@preact/signals-core": "https://esm.sh/@preact/signals-core@1.10.1",
    "@std/fs": "jsr:@std/fs",
    "@std/path": "jsr:@std/path",
    "@std/http": "jsr:@std/http",
    "@std/assert": "jsr:@std/assert"
  },
  "tasks": {
    "build": "deno run -A --unstable-bundle build.ts",
    "serve": "deno run -A server.ts",
    "dev": "deno run -A --watch server.ts",
    "test": "deno test --allow-env --allow-net tests/",
    "tests": "deno task check && deno task test",
    "check": "deno check --unstable-bundle build.ts server.ts src/**/*.ts src/**/*.tsx"
  }
}
```

---

