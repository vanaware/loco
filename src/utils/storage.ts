/**
 * Camada unificada de armazenamento:
 * - IndexedDB (via idb-keyval): textos, configurações, fotos pequenas
 * - OPFS: arquivos grandes (fotos/vídeos recebidos/enviados)
 * - Cache API: assets estáticos do app (offline)
 */

import { get, set, del, clear, keys as idbKeys, createStore } from "idb-keyval";

// ===== Storage Persistence =====
export type StorageMode = "best-effort" | "persistent" | "unknown";

export interface StorageStatus {
  mode: StorageMode;
  persisted: boolean;
  quota: number;
  usage: number;
  percentUsed: number;
  isLow: boolean;
  lastChecked: number;
}

export async function requestPersistentStorage(): Promise<StorageStatus> {
  const status: StorageStatus = {
    mode: "unknown",
    persisted: false,
    quota: 0,
    usage: 0,
    percentUsed: 0,
    isLow: false,
    lastChecked: Date.now(),
  };

  if (!navigator.storage) return status;

  try {
    let persisted = await navigator.storage.persisted();
    if (!persisted && navigator.storage.persist) {
      persisted = await navigator.storage.persist();
    }

    const estimate = await navigator.storage.estimate();
    const quota = estimate.quota || 0;
    const usage = estimate.usage || 0;
    const percentUsed = quota > 0 ? usage / quota : 0;

    return {
      mode: persisted ? "persistent" : "best-effort",
      persisted,
      quota,
      usage,
      percentUsed,
      isLow: percentUsed > 0.8,
      lastChecked: Date.now(),
    };
  } catch (e) {
    console.error("Erro ao solicitar persistência:", e);
    return status;
  }
}

export async function refreshStorageStatus(): Promise<StorageStatus> {
  const base = await requestPersistentStorage();
  return base;
}

export function startStorageMonitor(
  intervalMs: number = 60000,
  onLowStorage?: (status: StorageStatus) => void
): () => void {
  const timer = setInterval(async () => {
    const status = await refreshStorageStatus();
    if (status.isLow && onLowStorage) onLowStorage(status);
  }, intervalMs);

  return () => clearInterval(timer);
}

// ===== IndexedDB (substitui localStorage) =====
const DB_NAME = "loco-store";
const STORE_NAME = "data";
const customStore = typeof globalThis.indexedDB !== "undefined" ? createStore(DB_NAME, STORE_NAME) : null as any;

export async function storageGet<T>(key: string): Promise<T | null> {
  try {
    const value = await get(key, customStore);
    return value ?? null;
  } catch (e) {
    console.warn(`storageGet(${key}) falhou:`, e);
    return null;
  }
}

export async function storageSet(key: string, value: any): Promise<void> {
  try {
    await set(key, value, customStore);
  } catch (e) {
    console.error(`storageSet(${key}) falhou:`, e);
  }
}

export async function storageDel(key: string): Promise<void> {
  try {
    await del(key, customStore);
  } catch (e) {
    console.warn(`storageDel(${key}) falhou:`, e);
  }
}

export async function storageClear(): Promise<void> {
  try {
    await clear(customStore);
  } catch (e) {
    console.error("storageClear falhou:", e);
  }
}

export async function storageKeys(): Promise<string[]> {
  try {
    return await idbKeys(customStore);
  } catch {
    return [];
  }
}

export async function loadFromIDB<T>(key: string, defaultValue: T): Promise<T> {
  const value = await storageGet<T>(key);
  return value ?? defaultValue;
}

// ===== OPFS (Origin Private File System) =====
const FILES_DIR = "chat_files";

async function getFilesDir(): Promise<FileSystemDirectoryHandle | null> {
  if (!navigator.storage?.getDirectory) return null;
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(FILES_DIR, { create: true });
  } catch (e) {
    console.warn("OPFS indisponível:", e);
    return null;
  }
}

export interface StoredFile {
  path: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  messageId: string;
  contactId: string;
}

export async function saveFileToOPFS(
  file: File,
  messageId: string,
  contactId: string
): Promise<StoredFile | null> {
  const dir = await getFilesDir();
  
  if (!dir) {
    const url = URL.createObjectURL(file);
    return {
      path: `blob:${messageId}`,
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      url,
      messageId,
      contactId,
    };
  }

  try {
    const ext = file.name.split(".").pop() || "bin";
    const fileName = `${messageId}.${ext}`;
    const fileHandle = await dir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(file);
    await writable.close();

    const fileObj = await fileHandle.getFile();
    const url = URL.createObjectURL(fileObj);

    return {
      path: `opfs://${FILES_DIR}/${fileName}`,
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      url,
      messageId,
      contactId,
    };
  } catch (e) {
    console.error("Erro ao salvar no OPFS:", e);
    return null;
  }
}

export async function readFileFromOPFS(path: string): Promise<File | null> {
  if (!path.startsWith("opfs://")) return null;
  try {
    const dir = await getFilesDir();
    if (!dir) return null;
    const fileName = path.split("/").pop();
    if (!fileName) return null;
    const fileHandle = await dir.getFileHandle(fileName);
    return await fileHandle.getFile();
  } catch (e) {
    console.warn("Erro ao ler arquivo:", e);
    return null;
  }
}

export async function deleteFileFromOPFS(path: string): Promise<boolean> {
  if (!path.startsWith("opfs://")) return false;
  try {
    const dir = await getFilesDir();
    if (!dir) return false;
    const fileName = path.split("/").pop();
    if (!fileName) return false;
    await dir.removeEntry(fileName);
    return true;
  } catch (e) {
    console.warn("Erro ao excluir arquivo:", e);
    return false;
  }
}

export async function exportFileFromOPFS(path: string, suggestedName: string): Promise<void> {
  const file = await readFileFromOPFS(path);
  if (!file) return;

  if ("showSaveFilePicker" in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName,
        types: [{ description: file.type, accept: { [file.type]: [] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(file);
      await writable.close();
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
}

export async function listOPFSFiles(): Promise<string[]> {
  const dir = await getFilesDir();
  if (!dir) return [];
  const files: string[] = [];
  for await (const name of dir.keys()) files.push(name);
  return files;
}

export async function getOPFSUsage(): Promise<number> {
  const dir = await getFilesDir();
  if (!dir) return 0;
  let total = 0;
  for await (const name of dir.keys()) {
    try {
      const handle = await dir.getFileHandle(name);
      const file = await handle.getFile();
      total += file.size;
    } catch {}
  }
  return total;
}

// ===== Cache API =====
const CACHE_NAME = "loco-assets-v1";

export async function cacheAsset(url: string, response: Response): Promise<void> {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(url, response);
  } catch (e) {
    console.warn("Cache asset falhou:", e);
  }
}

export async function clearOldCaches(): Promise<void> {
  const keys = await caches.keys();
  for (const key of keys) {
    if (key !== CACHE_NAME) await caches.delete(key);
  }
}

// ===== Helpers =====
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
