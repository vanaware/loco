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