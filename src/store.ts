import { signal, computed } from "@preact/signals";
import { toCanvas } from "@libs/qrcode";
import { sendPushDirect, type VapidKeys, type PeerData } from "./crypto.ts";
import { resizeImage } from "./utils/imageProcessor.ts";
import { detectCapabilities, logCapabilities } from "./utils/capabilities.ts";
import {
  storageGet, storageSet, storageDel, loadFromIDB,
  saveFileToOPFS, deleteFileFromOPFS, exportFileFromOPFS,
  type StoredFile,
  requestPersistentStorage, refreshStorageStatus, startStorageMonitor,
  type StorageStatus
} from "./utils/storage.ts";
import { setAppBadge } from "./utils/pwa.ts";
import { navigateWithTransition } from "./utils/pwa.ts";
import { pendingShare, processIncomingShare } from "./utils/webShareTarget.ts";

// --- Tipos ---
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

// --- Estado Global ---
export const myVapidKeys = signal<VapidKeys | null>(null);
export const mySubscription = signal<any | null>(null);
export const myId = signal<string | null>(null);
export const myDisplayName = signal<string>("");
export const currentChatContact = signal<string | null>(null);
export const currentView = signal<"list" | "chat" | "profile" | "settings" | "about">("list");
export const menuOpen = signal(false);
export const qrCodeDataUrl = signal<string | null>(null);
export const appConfig = signal<AppConfig>({
  doNotDisturb: false,
  globalLocationSharing: true,
  encryptMessages: false,
});
export const connectionStatus = signal<"push" | "p2p">("push");
export const unreadCount = signal(0);
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
export const hasBiometricSupport = signal(false);

// Transfer state
export interface TransferState {
  isActive: boolean;
  role: "sender" | "receiver" | null;
  fileName: string;
  progress: number;
  speed: number;
  peers: number;
  magnetURI?: string;
  status: "idle" | "seeding" | "downloading" | "completed" | "cancelled" | "error";
}
export const transferState = signal<TransferState>({
  isActive: false,
  role: null,
  fileName: "",
  progress: 0,
  speed: 0,
  peers: 0,
  status: "idle",
});

let dataChannels: Map<string, RTCDataChannel> = new Map();
let peerConnections: Map<string, RTCPeerConnection> = new Map();
let p2pWorker: Worker | null = null;

const contactsRaw = signal<[string, Contact][]>([]);
export const contacts = computed(() => new Map(contactsRaw.value));

const chatSessionsRaw = signal<[string, ChatSession][]>([]);
export const chatSessions = computed(() => new Map(chatSessionsRaw.value));

// --- Inicialização ---
export async function initApp() {
  logCapabilities();
  
  // Proteção contra evicção
  const storageResult = await requestPersistentStorage();
  storage.value = storageResult;
  
  startStorageMonitor(60000, (status) => {
    storage.value = status;
    if (status.isLow) {
      console.warn("⚠️ Armazenamento baixo. Faça backup!");
    }
  });

  // Carrega dados do IDB
  myVapidKeys.value = await loadFromIDB("myVapidKeys", null);
  mySubscription.value = await loadFromIDB("mySubscription", null);
  myId.value = await loadFromIDB("myId", null);
  myDisplayName.value = await loadFromIDB("myDisplayName", "");
  appConfig.value = await loadFromIDB("appConfig", appConfig.value);
  contactsRaw.value = await loadFromIDB("contacts", []);
  chatSessionsRaw.value = await loadFromIDB("chatSessions", []);
  
  const filesMeta = await loadFromIDB<Record<string, StoredFile>>("storedFiles", {});
  storedFiles.value = new Map(Object.entries(filesMeta));

  processIncomingShare();
  updateBadge();
  checkBiometricSupport();
}

// --- Persistência ---
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

// --- Contatos ---
export function addContact(id: string, contact: Contact) {
  const current = [...contactsRaw.value];
  current.push([id, contact]);
  contactsRaw.value = current;
  saveContacts();
}

export function updateContactSettings(contactId: string, updates: Partial<Contact>) {
  const current = [...contactsRaw.value];
  const idx = current.findIndex(([cid]) => cid === contactId);
  if (idx !== -1) {
    current[idx] = [contactId, { ...current[idx][1], ...updates }];
    contactsRaw.value = current;
    saveContacts();
  }
}

// --- Mensagens ---
export async function smartSendMessage(
  contactId: string,
  text: string,
  type: "text" | "location" = "text",
  location?: { lat: number; lng: number }
) {
  const contact = contacts.value.get(contactId);
  if (!contact || !myId.value) return;

  const shouldEncrypt = appConfig.value.encryptMessages && contact.encryptMessages;
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
  if (dc && dc.readyState === "open") {
    try {
      dc.send(JSON.stringify(msg));
      msg.channel = "p2p";
      addMessage(contactId, { ...msg, status: "delivered" });
      return;
    } catch (e) {
      console.warn("Falha P2P, usando Push");
    }
  }

  await sendMessageViaPush(contactId, msg);
  addMessage(contactId, { ...msg, status: "delivered" });
}

async function sendMessageViaPush(contactId: string, msg: Message) {
  const contact = contacts.value.get(contactId);
  if (!contact || !myVapidKeys.value) return;
  const payload = JSON.stringify({
    type: msg.type === "location" ? "LOCATION_MESSAGE" : "TEXT_MESSAGE",
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
    console.error(e);
  }
}

export function addMessage(contactId: string, message: Message) {
  const current = [...chatSessionsRaw.value];
  const idx = current.findIndex(([cid]) => cid === contactId);
  if (idx !== -1) {
    current[idx] = [
      contactId,
      { ...current[idx][1], messages: [...current[idx][1].messages, message] },
    ];
  } else {
    current.push([contactId, { contactId, messages: [message], unreadCount: 0 }]);
  }
  chatSessionsRaw.value = current;
  saveSessions();
  updateBadge();
}

// --- Arquivos ---
export async function handleFileReceived(
  file: File | Blob,
  messageId: string,
  contactId: string
) {
  const fileObj = file instanceof File ? file : new File([file], `file_${messageId}`, { type: file.type });
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

  const sessions = [...chatSessionsRaw.value];
  let changed = false;
  for (const [cid, session] of sessions) {
    const msgIdx = session.messages.findIndex((m) => m.fileId === messageId);
    if (msgIdx !== -1) {
      session.messages[msgIdx] = {
        ...session.messages[msgIdx],
        text: "🗑️ Arquivo excluído",
        fileId: undefined,
      };
      changed = true;
    }
  }
  if (changed) {
    chatSessionsRaw.value = sessions;
    saveSessions();
  }
}

export async function downloadFile(messageId: string) {
  const file = storedFiles.value.get(messageId);
  if (!file) return;
  await exportFileFromOPFS(file.path, file.fileName);
}

// --- P2P Transfer (Worker) ---
function getP2PWorker(): Worker {
  if (!p2pWorker) {
    p2pWorker = new Worker("/p2p-transfer.worker.js", { type: "module" });
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
          break;
        case "P2P_PROGRESS":
          transferState.value = {
            ...transferState.value,
            progress: (payload.progress || 0) * 100,
            speed: payload.role === "sender" ? payload.uploadSpeed : payload.downloadSpeed,
            peers: payload.peers || 0,
          };
          break;
        case "P2P_DOWNLOAD_COMPLETE":
          transferState.value = { ...transferState.value, status: "completed", progress: 100 };
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

export function startFileSend(file: File) {
  const worker = getP2PWorker();
  transferState.value = { ...transferState.value, status: "seeding", fileName: file.name };
  worker.postMessage({ type: "P2P_START_SEED", payload: { file } });
}

export function startFileDownload(magnetURI: string, fileName: string) {
  const worker = getP2PWorker();
  transferState.value = { ...transferState.value, status: "downloading", fileName };
  worker.postMessage({ type: "P2P_START_DOWNLOAD", payload: { magnetURI, fileName } });
}

export function cancelTransfer() {
  if (p2pWorker) p2pWorker.postMessage({ type: "P2P_CANCEL" });
}

// --- QR Code ---
export function getShareLink() {
  const data = {
    endpoint: mySubscription.value?.endpoint,
    keys: mySubscription.value?.keys,
    vapidPublicKey: myVapidKeys.value?.publicKey,
    id: myId.value,
    displayName: myDisplayName.value,
  };
  return `${location.origin}#add=${btoa(encodeURIComponent(JSON.stringify(data)))}`;
}

export async function generateQRCode() {
  if (typeof document === "undefined") return;
  const canvas = document.createElement("canvas");
  await toCanvas(canvas, getShareLink(), { width: 256 });
  qrCodeDataUrl.value = canvas.toDataURL("image/png");
}

// --- Upload Foto ---
export async function uploadProfilePhoto(file: File) {
  const resizedDataUrl = await resizeImage(file, 200);
  appConfig.value = { ...appConfig.value, profilePhoto: resizedDataUrl };
  await saveConfig();
  return resizedDataUrl;
}

// --- Badge ---
export function updateBadge() {
  let total = 0;
  for (const [, session] of chatSessions.value) total += session.unreadCount;
  unreadCount.value = total;
  setAppBadge(total > 0 ? total : 0);
}

// --- Location ---
export function sendMyLocation(contactId: string) {
  if (!navigator.geolocation) {
    alert("Geolocalização não suportada");
    return;
  }
  navigator.geolocation.getCurrentPosition((pos) => {
    smartSendMessage(contactId, "📍 Minha localização", "location", {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
    });
  });
}

export function requestLocation(contactId: string) {
  smartSendMessage(contactId, "📍 Por favor, compartilhe sua localização");
}

// --- Calls ---
export async function checkCallAvailability(_contactId: string): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert("Chamadas não suportadas neste dispositivo");
    return false;
  }
  return true;
}

// --- Navegação ---
export function navigateTo(view: typeof currentView.value) {
  navigateWithTransition(() => {
    currentView.value = view;
  });
}

// --- Criptografia ---
let masterKey: CryptoKey | null = null;

export function checkBiometricSupport() {
  if (window.PublicKeyCredential) {
    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then((available) => (hasBiometricSupport.value = available))
      .catch(() => (hasBiometricSupport.value = false));
  }
}

export async function encryptMessage(text: string): Promise<string> {
  if (!masterKey) return text;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    masterKey,
    new TextEncoder().encode(text)
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptMessage(encryptedText: string): Promise<string> {
  if (!masterKey) return encryptedText;
  try {
    const combined = Uint8Array.from(atob(encryptedText), (c) => c.charCodeAt(0));
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: combined.slice(0, 12) },
      masterKey,
      combined.slice(12)
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return encryptedText;
  }
}

export function updateConfig(updates: Partial<AppConfig>) {
  appConfig.value = { ...appConfig.value, ...updates };
  saveConfig();
}

// Expose para worker global
declare global {
  interface Window {
    myId: string | null;
  }
}
if (typeof window !== "undefined") {
  Object.defineProperty(window, "myId", {
    get: () => myId.value,
  });
}
