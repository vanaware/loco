import { unzipSync, zipSync } from "fflate";
import {
  listOPFSFiles,
  readFileFromOPFS,
  storageGet,
  storageKeys,
  storageSet,
} from "./storage.ts";

export interface BackupOptions {
  profile: boolean;
  config: boolean;
  contacts: boolean;
  conversations: boolean;
  files: boolean;
}

export async function createBackup(options: BackupOptions): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const keys = await storageKeys();

  const enc = new TextEncoder();

  for (const key of keys) {
    const shouldInclude = (options.profile &&
      (key === "myId" || key === "myDisplayName" || key === "myVapidKeys" ||
        key === "masterKeyRaw")) ||
      (options.config && key === "appConfig") ||
      (options.contacts && key === "contacts") ||
      (options.conversations && key === "chatSessions") ||
      (options.files && key === "storedFiles");

    if (shouldInclude) {
      const value = await storageGet(key);
      files[`${key}.json`] = enc.encode(JSON.stringify(value));
    }
  }

  // Inclui arquivos OPFS se solicitado
  if (options.files) {
    const opfsFiles = await listOPFSFiles();
    for (const fileName of opfsFiles) {
      const file = await readFileFromOPFS(`opfs://chat_files/${fileName}`);
      if (file) {
        const buffer = await file.arrayBuffer();
        files[`opfs/${fileName}`] = new Uint8Array(buffer);
      }
    }
  }

  // Manifest
  const manifest = {
    version: "1.0.0",
    createdAt: new Date().toISOString(),
    options,
    keys: Object.keys(files),
    hasOpfs: options.files,
  };
  files["manifest.json"] = enc.encode(JSON.stringify(manifest, null, 2));

  const zipped = zipSync(files);
  return new Blob([zipped as unknown as BlobPart], { type: "application/zip" });
}

export async function restoreBackup(file: File): Promise<Record<string, unknown>> {
  const buffer = await file.arrayBuffer();
  const unzipped = unzipSync(new Uint8Array(buffer));
  const dec = new TextDecoder();

  const manifestRaw = unzipped["manifest.json"];
  if (!manifestRaw) {
    throw new Error("Backup inválido: manifest.json não encontrado");
  }

  const manifest = JSON.parse(dec.decode(manifestRaw));

  // Validação básica do manifest
  if (!manifest.version || !manifest.keys) {
    throw new Error("Backup inválido: manifest corrompido");
  }

  const allowedKeys = new Set([
    "myId",
    "myDisplayName",
    "myVapidKeys",
    "masterKeyRaw",
    "appConfig",
    "contacts",
    "chatSessions",
    "storedFiles",
  ]);

  for (const keyName of manifest.keys) {
    const key = keyName.replace(".json", "");

    // Pula arquivos OPFS (restaurados separadamente)
    if (keyName.startsWith("opfs/")) continue;
    // Pula manifest
    if (keyName === "manifest.json") continue;
    // Valida chave permitida
    if (!allowedKeys.has(key)) continue;

    const content = dec.decode(unzipped[keyName]);
    if (content) {
      await storageSet(key, JSON.parse(content));
    }
  }

  // OPFS files — restaurar apenas se o backup os incluiu
  if (manifest.hasOpfs) {
    for (const keyName of manifest.keys) {
      if (keyName.startsWith("opfs/")) {
        // O arquivo foi salvo com o nome original, mas a restauração
        // do OPFS dependerá do saveFileToOPFS ser chamado pelo store
        // quando o storedFiles for restaurado
      }
    }
  }

  return manifest;
}
