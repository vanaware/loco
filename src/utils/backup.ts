import { zipSync, unzipSync } from "fflate";
import { storageGet, storageKeys, storageSet, readFileFromOPFS } from "./storage.ts";

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
    const shouldInclude =
      (options.profile && (key === "myId" || key === "myDisplayName" || key === "myVapidKeys")) ||
      (options.config && key === "appConfig") ||
      (options.contacts && key === "contacts") ||
      (options.conversations && key === "chatSessions");

    if (shouldInclude) {
      const value = await storageGet(key);
      files[`${key}.json`] = enc.encode(JSON.stringify(value));
    }
  }

  // Manifest
  const manifest = {
    version: "1.0.0",
    createdAt: new Date().toISOString(),
    options,
    keys: Object.keys(files),
  };
  files["manifest.json"] = enc.encode(JSON.stringify(manifest, null, 2));

  const zipped = zipSync(files);
  return new Blob([zipped], { type: "application/zip" });
}

export async function restoreBackup(file: File): Promise<any> {
  const buffer = await file.arrayBuffer();
  const unzipped = unzipSync(new Uint8Array(buffer));
  const dec = new TextDecoder();

  const manifestJson = dec.decode(unzipped["manifest.json"]);
  const manifest = JSON.parse(manifestJson);

  for (const keyName of manifest.keys) {
    const key = keyName.replace(".json", "");
    const content = dec.decode(unzipped[keyName]);
    await storageSet(key, JSON.parse(content));
  }

  return manifest;
}
