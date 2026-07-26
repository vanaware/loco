import { computed, signal } from "@preact/signals";
import { toCanvas } from "qrcode";
import {
  generateVapidKeys,
  type PeerData,
  sendPushDirect,
  type VapidKeys,
} from "./crypto.ts";
import { resizeImage } from "./utils/imageProcessor.ts";
import { logCapabilities } from "./utils/capabilities.ts";
import {
  deleteFileFromOPFS,
  exportFileFromOPFS,
  loadFromIDB,
  readFileFromOPFS,
  requestPersistentStorage,
  saveFileToOPFS,
  startStorageMonitor,
  storageSet,
  type StorageStatus,
  type StoredFile,
} from "./utils/storage.ts";
import { setAppBadge } from "./utils/pwa.ts";
import { navigateWithTransition } from "./utils/pwa.ts";
import { pendingShare, processIncomingShare } from "./utils/webShareTarget.ts";
export { pendingShare };

// ============================================================
// TIPOS
// ============================================================

export interface Contact extends PeerData {
  displayName: string;
  theirDisplayName: string;
  photo?: string;
  addedAt: number;
  lastContact: number | null;
  allowLocation?: boolean;
  encryptMessages?: boolean;
  doNotDisturb?: boolean;
  firstP2PSent?: boolean;
}

export interface Message {
  id: string;
  from: string;
  to: string;
  text: string;
  timestamp: number;
  status: "sent" | "delivered" | "failed";
  channel?: "push" | "p2p";
  type?: "text" | "location" | "call_request" | "file" | "profile_update";
  location?: { lat: number; lng: number };
  isEncrypted?: boolean;
  fileId?: string;
}

export interface ChatSession {
  contactId: string;
  messages: Message[];
  unreadCount: number;
}

export interface AppConfig {
  doNotDisturb: boolean;
  globalLocationSharing: boolean;
  encryptMessages: boolean;
  profilePhoto?: string;
}

export type ViewType =
  | "list"
  | "chat"
  | "profile"
  | "settings"
  | "about"
  | "call"
  | "scanner";

export interface TransferState {
  isActive: boolean;
  role: "sender" | "receiver" | null;
  fileName: string;
  progress: number;
  speed: number;
  peers: number;
  magnetURI?: string;
  status:
    | "idle"
    | "seeding"
    | "downloading"
    | "completed"
    | "cancelled"
    | "error";
}

// ============================================================
// SIGNALS GLOBAIS
// ============================================================

export const myVapidKeys = signal<VapidKeys | null>(null);
interface PushSubscriptionJSON {
  endpoint: string;
  expirationTime?: number;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export const mySubscription = signal<PushSubscriptionJSON | null>(null);
export const myId = signal<string | null>(null);
export const myDisplayName = signal<string>("");
export const currentChatContact = signal<string | null>(null);
export const currentView = signal<ViewType>("list");
export const menuOpen = signal(false);
export const qrCodeDataUrl = signal<string | null>(null);

export const appConfig = signal<AppConfig>({
  doNotDisturb: false,
  globalLocationSharing: true,
  encryptMessages: false,
});

export const connectionStatus = signal<"push" | "p2p">("push");
export const unreadCount = signal(0);
export const hasBiometricSupport = signal(false);

export const storage = signal<StorageStatus>({
  mode: "unknown",
  persisted: false,
  quota: 0,
  usage: 0,
  percentUsed: 0,
  isLow: false,
  lastChecked: 0,
});

export const storedFiles = signal<Map<string, StoredFile>>(new Map());

export const transferState = signal<TransferState>({
  isActive: false,
  role: null,
  fileName: "",
  progress: 0,
  speed: 0,
  peers: 0,
  status: "idle",
});

// ============================================================
// ESTADO INTERNO
// ============================================================

const dataChannels: Map<string, RTCDataChannel> = new Map();
// const peerConnections: Map<string, RTCPeerConnection> = new Map(); // TODO: implementar WebRTC signaling
let p2pWorker: Worker | null = null;
let masterKey: CryptoKey | null = null;

const contactsRaw = signal<[string, Contact][]>([]);
export const contacts = computed(() => new Map(contactsRaw.value));

const chatSessionsRaw = signal<[string, ChatSession][]>([]);
export const chatSessions = computed(() => new Map(chatSessionsRaw.value));

// ============================================================
// INICIALIZAÇÃO
// ============================================================

export async function initApp() {
  logCapabilities();

  // Proteção contra evicção de storage
  const storageResult = await requestPersistentStorage();
  storage.value = storageResult;

  startStorageMonitor(60000, (status) => {
    storage.value = status;
    if (status.isLow) {
      console.warn(
        `⚠️ Armazenamento baixo (${
          (status.percentUsed * 100).toFixed(0)
        }%). Faça backup!`,
      );
    }
  });

  // Carrega dados do IndexedDB
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

  // Gera myId se não existir (primeira execução)
  if (!myId.value) {
    myId.value = `user_${Date.now()}_${crypto.randomUUID()}`;
    await storageSet("myId", myId.value);
    console.log("🆔 Novo ID gerado:", myId.value);
  }

  // Gera VAPID keys se não existirem
  if (!myVapidKeys.value) {
    try {
      myVapidKeys.value = await generateVapidKeys();
      await storageSet("myVapidKeys", myVapidKeys.value);
      console.log("🔑 VAPID keys geradas");
    } catch (e) {
      console.error("Erro ao gerar VAPID keys:", e);
    }
  }

  // Inicializa masterKey para criptografia local
  if (appConfig.value.encryptMessages) {
    await initMasterKey();
  }

  processIncomingShare();
  updateBadge();
  checkBiometricSupport();
}

// ============================================================
// PERSISTÊNCIA
// ============================================================

async function saveContacts() {
  await storageSet("contacts", contactsRaw.value);
}

async function saveSessions() {
  await storageSet("chatSessions", chatSessionsRaw.value);
}

async function saveConfig() {
  await storageSet("appConfig", appConfig.value);
}

async function saveFiles() {
  const obj = Object.fromEntries(storedFiles.value);
  await storageSet("storedFiles", obj);
}

// ============================================================
// CONTATOS
// ============================================================

export function addContact(id: string, contact: Contact) {
  const current = [...contactsRaw.value];
  const idx = current.findIndex(([cid]) => cid === id);
  if (idx !== -1) {
    current[idx] = [id, contact];
  } else {
    current.push([id, contact]);
  }
  contactsRaw.value = current;
  saveContacts();
}

export function updateContactSettings(
  contactId: string,
  updates: Partial<Contact>,
) {
  const current = [...contactsRaw.value];
  const idx = current.findIndex(([cid]) => cid === contactId);
  if (idx !== -1) {
    current[idx] = [contactId, { ...current[idx][1], ...updates }];
    contactsRaw.value = current;
    saveContacts();
  }
}

export async function deleteContact(contactId: string) {
  // Limpa arquivos OPFS das mensagens deste contato
  const session = chatSessions.value.get(contactId);
  if (session) {
    for (const msg of session.messages) {
      if (msg.fileId) {
        await deleteFile(msg.fileId);
      }
    }
  }

  contactsRaw.value = contactsRaw.value.filter(([cid]) => cid !== contactId);
  chatSessionsRaw.value = chatSessionsRaw.value.filter(
    ([cid]) => cid !== contactId,
  );
  await saveContacts();
  await saveSessions();
}

// ============================================================
// MENSAGENS
// ============================================================

export async function smartSendMessage(
  contactId: string,
  text: string,
  type: "text" | "location" = "text",
  location?: { lat: number; lng: number },
) {
  const contact = contacts.value.get(contactId);
  if (!contact || !myId.value) return;

  const shouldEncrypt = appConfig.value.encryptMessages &&
    contact.encryptMessages;
  let finalText = text;
  let isEncrypted = false;

  if (shouldEncrypt) {
    try {
      finalText = await encryptMessage(text);
      isEncrypted = true;
    } catch (e) {
      console.error("Falha ao criptografar:", e);
    }
  }

  const msg: Message = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    from: myId.value,
    to: contactId,
    text: finalText,
    timestamp: Date.now(),
    channel: "push",
    type,
    location,
    isEncrypted,
    status: "sent",
  };

  const dc = dataChannels.get(contactId);

  // Envia atualização de perfil na primeira comunicação P2P
  if (dc && dc.readyState === "open" && !contact.firstP2PSent) {
    await sendProfileUpdate(contactId, dc);
    updateContactSettings(contactId, { firstP2PSent: true });
  }

  if (dc && dc.readyState === "open") {
    try {
      dc.send(JSON.stringify(msg));
      msg.channel = "p2p";
      addMessage(contactId, { ...msg, status: "delivered" });
      return;
    } catch (e) {
      console.warn("Falha P2P, usando Push:", e);
    }
  }

  await sendMessageViaPush(contactId, msg);
  addMessage(contactId, { ...msg, status: "sent" });
}

async function sendMessageViaPush(contactId: string, msg: Message) {
  const contact = contacts.value.get(contactId);
  if (!contact || !myVapidKeys.value) return;

  const payload = JSON.stringify({
    type: msg.type === "location"
      ? "LOCATION_MESSAGE"
      : msg.type === "profile_update"
      ? "PROFILE_UPDATE"
      : "TEXT_MESSAGE",
    from: myId.value,
    text: msg.text,
    location: msg.location,
    isEncrypted: msg.isEncrypted,
    displayName: myDisplayName.value,
    timestamp: Date.now(),
  });

  try {
    await sendPushDirect(contact, payload, myVapidKeys.value);
  } catch (e) {
    console.error("Push falhou:", e);
  }
}

export function addMessage(contactId: string, message: Message) {
  const current = [...chatSessionsRaw.value];
  const idx = current.findIndex(([cid]) => cid === contactId);

  if (idx !== -1) {
    current[idx] = [
      contactId,
      {
        ...current[idx][1],
        messages: [...current[idx][1].messages, message],
        unreadCount: message.from !== myId.value
          ? current[idx][1].unreadCount + 1
          : current[idx][1].unreadCount,
      },
    ];
  } else {
    current.push([
      contactId,
      {
        contactId,
        messages: [message],
        unreadCount: message.from !== myId.value ? 1 : 0,
      },
    ]);
  }

  chatSessionsRaw.value = current;
  saveSessions();

  // Atualiza lastContact
  updateContactSettings(contactId, { lastContact: message.timestamp });

  updateBadge();
}

export function handleIncomingPushMessage(payload: {
  from?: string;
  text?: string;
  type?: string;
  location?: { lat: number; lng: number };
  isEncrypted?: boolean;
  displayName?: string;
  timestamp?: number;
}) {
  if (!payload.from || payload.from === myId.value) return;

  // Garante que o contato exista
  if (!contacts.value.has(payload.from)) {
    addContact(payload.from, {
      id: payload.from,
      displayName: payload.displayName || payload.from,
      theirDisplayName: payload.displayName || "",
      addedAt: Date.now(),
      lastContact: payload.timestamp || Date.now(),
    });
  }

  // Descriptografa mensagem se necessário (armazenamento local criptografado)
  let messageText = payload.text || "";
  if (payload.isEncrypted && appConfig.value.encryptMessages) {
    decryptMessage(messageText).then((decrypted) => {
      messageText = decrypted;
    }).catch(() => {
      console.warn("Falha ao descriptografar mensagem");
    });
  }

  const message: Message = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    from: payload.from,
    to: myId.value || "",
    text: messageText,
    timestamp: payload.timestamp || Date.now(),
    status: "delivered",
    channel: "push",
    type: payload.type === "LOCATION_MESSAGE" ? "location" : "text",
    location: payload.location,
    isEncrypted: payload.isEncrypted || false,
  };

  addMessage(payload.from, message);
}

export function clearSession(contactId: string) {
  const sessions = [...chatSessionsRaw.value];
  const idx = sessions.findIndex(([cid]) => cid === contactId);
  if (idx !== -1) {
    sessions[idx] = [contactId, {
      ...sessions[idx][1],
      messages: [],
      unreadCount: 0,
    }];
    chatSessionsRaw.value = sessions;
    saveSessions();
  }
}

// ============================================================
// PROFILE UPDATE (P2P)
// ============================================================

export function sendProfileUpdate(
  contactId: string,
  dc: RTCDataChannel,
) {
  const profileData = {
    type: "profile_update",
    displayName: myDisplayName.value,
    photo: appConfig.value.profilePhoto,
    timestamp: Date.now(),
  };

  try {
    dc.send(
      JSON.stringify({
        id: `profile_${Date.now()}`,
        from: myId.value || "",
        to: contactId,
        text: JSON.stringify(profileData),
        timestamp: Date.now(),
        status: "delivered",
        channel: "p2p",
        type: "profile_update",
      }),
    );
  } catch (e) {
    console.warn("Falha ao enviar profile update:", e);
  }
}

// ============================================================
// ARQUIVOS (OPFS)
// ============================================================

export async function handleFileReceived(
  file: File | Blob,
  messageId: string,
  contactId: string,
) {
  const fileObj = file instanceof File
    ? file
    : new File([file], `file_${messageId}`, { type: file.type });

  const stored = await saveFileToOPFS(fileObj, messageId, contactId);
  if (!stored) return;

  const current = new Map(storedFiles.value);
  current.set(messageId, stored);
  storedFiles.value = current;
  await saveFiles();

  const isImage = fileObj.type.startsWith("image/");
  addMessage(contactId, {
    id: messageId,
    from: "peer",
    to: myId.value || "",
    text: isImage ? `📷 ${fileObj.name}` : `📎 ${fileObj.name}`,
    timestamp: Date.now(),
    status: "delivered",
    type: "file",
    channel: "p2p",
    fileId: messageId,
  });
}

export async function deleteFile(messageId: string) {
  const file = storedFiles.value.get(messageId);
  if (!file) return;

  if (file.path.startsWith("opfs://")) {
    await deleteFileFromOPFS(file.path);
  }
  URL.revokeObjectURL(file.url);

  const current = new Map(storedFiles.value);
  current.delete(messageId);
  storedFiles.value = current;
  await saveFiles();

  const sessions = [...chatSessionsRaw.value].map(([contactId, session]) => {
    const msgIdx = session.messages.findIndex((m) => m.fileId === messageId);
    if (msgIdx === -1) return [contactId, session] as [string, ChatSession];
    const newMessages = [...session.messages];
    newMessages[msgIdx] = {
      ...newMessages[msgIdx],
      text: "🗑️ Arquivo excluído",
      fileId: undefined,
    };
    return [contactId, { ...session, messages: newMessages }] as [string, ChatSession];
  });
  chatSessionsRaw.value = sessions;
  saveSessions();
}

export async function downloadFile(messageId: string) {
  const file = storedFiles.value.get(messageId);
  if (!file) return;
  await exportFileFromOPFS(file.path, file.fileName);
}

// ============================================================
// P2P TRANSFER (WEB WORKER)
// ============================================================

function getP2PWorker(): Worker {
  if (!p2pWorker) {
    p2pWorker = new Worker("/worker.js", { type: "module" });
    p2pWorker.onmessage = (e) => {
      const { type, payload } = e.data;

      switch (type) {
        case "P2P_SEED_READY":
          transferState.value = {
            ...transferState.value,
            isActive: true,
            role: "sender",
            fileName: payload.fileName,
            status: "seeding",
            magnetURI: payload.magnetURI,
          };
          // Envia magnetURI para o contato ativo via P2P ou Push
          if (currentChatContact.value && payload.magnetURI) {
            smartSendMessage(
              currentChatContact.value,
              `📤 Arquivo: ${payload.fileName}\n\nmagnet:${payload.magnetURI}`,
              "text",
            );
          }
          break;

        case "P2P_PROGRESS":
          transferState.value = {
            ...transferState.value,
            progress: (payload.progress || 0) * 100,
            speed: payload.role === "sender"
              ? payload.uploadSpeed
              : payload.downloadSpeed,
            peers: payload.peers || 0,
          };
          break;

        case "P2P_DOWNLOAD_COMPLETE":
          transferState.value = {
            ...transferState.value,
            status: "completed",
            progress: 100,
          };
          if (currentChatContact.value) {
            const msgId = `file_${Date.now()}`;
            const opfsPath = `opfs://chat_files/${payload.fileName}`;
            readFileFromOPFS(opfsPath)
              .then((file) => {
                if (file && currentChatContact.value) {
                  handleFileReceived(file, msgId, currentChatContact.value);
                }
              })
              .catch(console.error);
          }
          break;

        case "P2P_SESSION_ENDED":
          transferState.value = {
            isActive: false,
            role: null,
            fileName: "",
            progress: 0,
            speed: 0,
            peers: 0,
            status: payload.reason === "COMPLETO" ? "completed" : "cancelled",
          };
          break;

        case "P2P_ERROR":
          console.error("Erro P2P:", payload.message);
          transferState.value = { ...transferState.value, status: "error" };
          break;
      }
    };
  }
  return p2pWorker;
}

export async function startFileSend(file: File) {
  const worker = await getP2PWorker();
  transferState.value = {
    ...transferState.value,
    status: "seeding",
    fileName: file.name,
  };
  worker.postMessage({ type: "P2P_START_SEED", payload: { file } });
}

export async function startFileDownload(magnetURI: string, fileName: string) {
  const worker = await getP2PWorker();
  transferState.value = {
    ...transferState.value,
    status: "downloading",
    fileName,
  };
  worker.postMessage({
    type: "P2P_START_DOWNLOAD",
    payload: { magnetURI, fileName },
  });
}

export function cancelTransfer() {
  if (p2pWorker) p2pWorker.postMessage({ type: "P2P_CANCEL" });
}

// ============================================================
// QR CODE
// ============================================================

export function getShareLink() {
  const data = {
    id: myId.value,
    displayName: myDisplayName.value,
  };
  return `${location.origin}#add=${
    btoa(
      encodeURIComponent(JSON.stringify(data)),
    )
  }`;
}

export async function generateQRCode() {
  if (typeof document === "undefined") return;
  const canvas = document.createElement("canvas");
  await toCanvas(canvas, getShareLink(), { width: 256 });
  qrCodeDataUrl.value = canvas.toDataURL("image/png");
}

// ============================================================
// FOTO DE PERFIL
// ============================================================

export async function uploadProfilePhoto(file: File) {
  const resizedDataUrl = await resizeImage(file, 200);
  appConfig.value = { ...appConfig.value, profilePhoto: resizedDataUrl };
  await saveConfig();
  return resizedDataUrl;
}

// ============================================================
// BADGE
// ============================================================

export function updateBadge() {
  let total = 0;
  for (const [, session] of chatSessions.value) {
    total += session.unreadCount;
  }
  unreadCount.value = total;
  setAppBadge(total > 0 ? total : 0);
}

// ============================================================
// LOCALIZAÇÃO
// ============================================================

export function sendMyLocation(contactId: string) {
  if (!navigator.geolocation) {
    alert("Geolocalização não suportada neste dispositivo");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      smartSendMessage(
        contactId,
        "📍 Minha localização",
        "location",
        {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        },
      );
    },
    (err) => {
      alert("Erro ao obter localização: " + err.message);
    },
  );
}

export function requestLocation(contactId: string) {
  smartSendMessage(
    contactId,
    "📍 Por favor, compartilhe sua localização",
  );
}

// ============================================================
// CHAMADAS
// ============================================================

export function checkCallAvailability(
  _contactId: string,
): boolean {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert("Chamadas não suportadas neste dispositivo");
    return false;
  }
  return true;
}

// ============================================================
// NAVEGAÇÃO
// ============================================================

export function navigateTo(view: ViewType) {
  navigateWithTransition(() => {
    currentView.value = view;
  });
}

// ============================================================
// CRIPTOGRAFIA LOCAL (AES-GCM)
// ============================================================

export function checkBiometricSupport() {
  if (typeof window !== "undefined" && globalThis.PublicKeyCredential) {
    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then((available) => (hasBiometricSupport.value = available))
      .catch(() => (hasBiometricSupport.value = false));
  }
}

async function initMasterKey(): Promise<void> {
  const rawKey = await loadFromIDB<string | null>("masterKeyRaw", null);
  let keyData: ArrayBuffer;

  if (rawKey) {
    keyData = Uint8Array.from(atob(rawKey), (c) => c.charCodeAt(0)).buffer;
  } else {
    keyData = crypto.getRandomValues(new Uint8Array(32)).buffer;
    const b64 = btoa(String.fromCharCode(...new Uint8Array(keyData)));
    await storageSet("masterKeyRaw", b64);
  }

  masterKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptMessage(text: string): Promise<string> {
  if (!masterKey) return text;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    masterKey,
    new TextEncoder().encode(text),
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptMessage(
  encryptedText: string,
): Promise<string> {
  if (!masterKey) return encryptedText;
  try {
    const combined = Uint8Array.from(
      atob(encryptedText),
      (c) => c.charCodeAt(0),
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: combined.slice(0, 12) },
      masterKey,
      combined.slice(12),
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return encryptedText;
  }
}

// ============================================================
// CONFIGURAÇÃO
// ============================================================

export function updateConfig(updates: Partial<AppConfig>) {
  appConfig.value = { ...appConfig.value, ...updates };
  saveConfig();
  if (updates.encryptMessages && !masterKey) {
    initMasterKey();
  }
}

// ============================================================
// GLOBAL WINDOW
// ============================================================

declare global {
  interface Window {
    myId: string | null;
  }
}

if (typeof window !== "undefined") {
  Object.defineProperty(window, "myId", {
    get: () => myId.value,
    configurable: true,
  });
}
