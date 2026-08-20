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