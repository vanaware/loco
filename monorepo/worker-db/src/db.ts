// db.ts
import { 
  get, set, del, keys, clear, getMany, setMany, delMany, 
  values, entries, createStore, type UseStore
} from "idb-keyval";
import { zipSync, unzipSync } from "fflate"; 

import { formatDbItem, prepareForSave } from "./utils/id-utils.ts";
import { writeJsonToOpfs, readJsonFromOpfs, resolveOpfsFileName } from "./utils/opfs_utils.ts";

const storeCache = new Map<string, UseStore>();

function getCustomStore(dbName?: string, storeName = "keyval"): UseStore | undefined {
  if (!dbName) return undefined; 
  const cacheKey = `${dbName}:${storeName}`;
  if (!storeCache.has(cacheKey)) {
    storeCache.set(cacheKey, createStore(dbName, storeName));
  }
  return storeCache.get(cacheKey);
}

function formatDbEntries(rawEntries: [IDBValidKey, any][], prefix?: string) {
  let items = rawEntries;
  if (prefix) items = items.filter(([k]) => typeof k === "string" && k.startsWith(prefix));
  return items.map(([k, v]) => formatDbItem(k, v, prefix));
}

async function getRecordDir(basePath = "", rawKey: string, create = false): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const fullPath = basePath ? `${basePath}/${rawKey}` : rawKey;
  const parts = fullPath.split('/').filter(Boolean);
  let curr = root;
  for (const p of parts) {
    curr = await curr.getDirectoryHandle(p, { create });
  }
  return curr;
}

self.onmessage = async (e: MessageEvent) => {
  const { requestId, command, args } = e.data;

  try {
    const store = getCustomStore(args.dbName, args.storeName);
    const rawKey = args.key && args.prefix && !args.key.startsWith(args.prefix) ? `${args.prefix}${args.key}` : args.key;
    let result;

    switch (command) {
      case "GET": {
        const val = await get(rawKey, store);
        result = val !== undefined ? formatDbItem(rawKey, val, args.prefix) : undefined;
        break;
      }
      case "SET": {
        const { key, cleanVal } = prepareForSave(args.key, args.val, args.prefix);
        await set(key, cleanVal, store);
        result = key;
        break;
      }
      case "DELETE": {
        result = await del(rawKey, store);
        break;
      }
      case "GET_MANY": {
        const fullKeys = args.keys.map((k: string) => args.prefix && !k.startsWith(args.prefix) ? `${args.prefix}${k}` : k);
        const rawValues = await getMany(fullKeys, store);
        result = rawValues.map((val, idx) => val !== undefined ? formatDbItem(fullKeys[idx]!, val, args.prefix) : undefined);
        break;
      }
      case "SET_MANY": {
        const entriesToSet: [string, any][] = args.entries.map(([k, v]: [string, any]) => {
          const { key, cleanVal } = prepareForSave(k, v, args.prefix);
          return [key, cleanVal];
        });
        result = await setMany(entriesToSet, store);
        break;
      }
      case "DEL_MANY": {
        const fullKeys = args.keys.map((k: string) => args.prefix && !k.startsWith(args.prefix) ? `${args.prefix}${k}` : k);
        result = await delMany(fullKeys, store);
        break;
      }
      case "KEYS": {
        const allKeys = await keys(store);
        result = args.prefix ? allKeys.filter(k => typeof k === "string" && k.startsWith(args.prefix)) : allKeys;
        break;
      }
      case "VALUES": {
        const allEntries = await entries(store);
        result = formatDbEntries(allEntries, args.prefix); 
        break;
      }
      case "ENTRIES": {
        const allEntries = await entries(store);
        result = args.prefix ? allEntries.filter(([k]) => typeof k === "string" && k.startsWith(args.prefix)) : allEntries;
        break;
      }
      case "CLEAR": {
        if (args.prefix) {
          const allKeys = await keys(store);
          const keysToDelete = allKeys.filter((k) => typeof k === "string" && k.startsWith(args.prefix));
          await delMany(keysToDelete, store);
        } else {
          await clear(store);
        }
        break;
      }
      case "PATCH": {
        const current = (await get(rawKey, store)) || {};
        let updated: any;
        if (args.fnStr) {
          const runner = new Function("prev", "ctx", `return (${args.fnStr})(prev, ctx);`);
          updated = runner(formatDbItem(rawKey, current, args.prefix), args.context);
        } else {
          updated = Object.assign({}, current, args.patch);
        }
        const { key, cleanVal } = prepareForSave(rawKey, updated, args.prefix);
        await set(key, cleanVal, store);
        result = formatDbItem(key, cleanVal, args.prefix);
        break;
      }
      case "QUERY": {
        const rawEntries = await entries(store);
        const formattedItems = formatDbEntries(rawEntries, args.prefix);
        const runner = new Function("items", "ctx", `return (${args.fnStr})(items, ctx);`);
        result = runner(formattedItems, args.context);
        break;
      }
      case "GET_SOME": {
        const rawEntries = await entries(store);
        const formattedItems = formatDbEntries(rawEntries, args.prefix);
        const runner = new Function("items", "ctx", `return (${args.fnStr})(items, ctx);`);
        const selectedItems = runner(formattedItems, args.context);
        if (!Array.isArray(selectedItems)) throw new Error("A função injetada em GET_SOME deve retornar um Array.");
        result = selectedItems;
        break;
      }
      case "DEL_SOME": {
        const rawEntries = await entries(store);
        const formattedItems = formatDbEntries(rawEntries, args.prefix);
        const runner = new Function("items", "ctx", `return (${args.fnStr})(items, ctx);`);
        const selectedItems = runner(formattedItems, args.context);
        if (!Array.isArray(selectedItems)) throw new Error("A função injetada em DEL_SOME deve retornar um Array.");
        const keysToDelete: string[] = selectedItems.map((item: any) => args.prefix && !item._id.startsWith(args.prefix) ? `${args.prefix}${item._id}` : item._id);
        result = await delMany(keysToDelete, store);
        break;
      }
      case "SET_SOME": {
        const rawEntries = await entries(store);
        const formattedItems = formatDbEntries(rawEntries, args.prefix);
        const selectRunner = new Function("items", "ctx", `return (${args.selectFnStr})(items, ctx);`);
        const updateRunner = new Function("item", "ctx", `return (${args.updateFnStr})(item, ctx);`);
        const selectedItems = selectRunner(formattedItems, args.context);
        if (!Array.isArray(selectedItems)) throw new Error("A função de seleção em SET_SOME deve retornar um Array.");
        const entriesToSet: [string, any][] = selectedItems.map((item: any) => {
          const updatedItem = updateRunner(item, args.context);
          const { key, cleanVal } = prepareForSave(undefined, updatedItem, args.prefix);
          return [key, cleanVal];
        });
        result = await setMany(entriesToSet, store);
        break;
      }
      case "EXPORT": {
        const allEntries = await entries(store);
        const filtered = args.prefix ? allEntries.filter(([k]) => typeof k === "string" && k.startsWith(args.prefix)) : allEntries;
        result = Object.fromEntries(filtered);
        break;
      }
      case "IMPORT": {
        if (args.clearFirst) {
          if (args.prefix) {
            const allKeys = await keys(store);
            const keysToDelete = allKeys.filter((k) => typeof k === "string" && k.startsWith(args.prefix));
            await delMany(keysToDelete, store);
          } else await clear(store);
        }
        const entriesToImport: [string, any][] = Object.entries(args.data).map(([k, v]) => {
          const { key, cleanVal } = prepareForSave(k, v, args.prefix);
          return [key, cleanVal];
        });
        result = await setMany(entriesToImport, store);
        break;
      }
      case "BACKUP_OPFS": {
        const allEntries = await entries(store);
        const filtered = args.prefix ? allEntries.filter(([k]) => typeof k === "string" && k.startsWith(args.prefix)) : allEntries;
        const data = Object.fromEntries(filtered);
        const fileName = resolveOpfsFileName("db", args.fileName || "backup.json", { dbName: args.dbName, storeName: args.storeName, prefix: args.prefix });
        result = await writeJsonToOpfs(fileName, data);
        break;
      }
      case "RESTORE_OPFS": {
        const data = await readJsonFromOpfs(args.fileName);
        if (args.clearFirst) {
          if (args.prefix) {
            const allKeys = await keys(store);
            const keysToDelete = allKeys.filter((k) => typeof k === "string" && k.startsWith(args.prefix));
            await delMany(keysToDelete, store);
          } else await clear(store);
        }
        const entriesToImport: [string, any][] = Object.entries(data).map(([k, v]) => {
          const { key, cleanVal } = prepareForSave(k, v, args.prefix);
          return [key, cleanVal];
        });
        result = await setMany(entriesToImport, store);
        break;
      }

      // ==== OPFS EXTENSION ====
      case "OPFS_LIST": {
        const dir = await getRecordDir(args.basePath, rawKey, true);
        const filesList = [];
        // @ts-ignore
        for await (const [name, handle] of dir.entries()) {
          if (handle.kind === "file") {
            const file = await handle.getFile();
            filesList.push({ name, size: file.size, type: file.type, lastModified: file.lastModified, file });
          }
        }
        result = filesList;
        break;
      }
      case "OPFS_ADD": {
        const dir = await getRecordDir(args.basePath, rawKey, true);
        const fh = await dir.getFileHandle(args.fileName, { create: true });
        const w = await fh.createWritable();
        const buffer = await (args.file as Blob).arrayBuffer();
        await w.write(new Blob([buffer]));
        await w.close();
        break;
      }
      case "OPFS_DEL": {
        const dir = await getRecordDir(args.basePath, rawKey, false);
        await dir.removeEntry(args.fileName);
        break;
      }
      case "OPFS_REN": {
        const dir = await getRecordDir(args.basePath, rawKey, false);
        const oldFile = await dir.getFileHandle(args.oldName);
        const fileData = await oldFile.getFile();
        const newFile = await dir.getFileHandle(args.newName, { create: true });
        const w = await newFile.createWritable();
        await w.write(new Blob([await fileData.arrayBuffer()]));
        await w.close();
        await dir.removeEntry(args.oldName);
        break;
      }
      case "OPFS_MV": {
        const dir = await getRecordDir(args.basePath, rawKey, false);
        const fileHandle = await dir.getFileHandle(args.fileName);
        const fileData = await fileHandle.getFile();
        
        const rawNewKey = args.prefix && !args.newKey.startsWith(args.prefix) ? `${args.prefix}${args.newKey}` : args.newKey;
        const targetDir = await getRecordDir(args.basePath, rawNewKey, true);
        
        const newFile = await targetDir.getFileHandle(args.fileName, { create: true });
        const w = await newFile.createWritable();
        await w.write(new Blob([await fileData.arrayBuffer()]));
        await w.close();
        await dir.removeEntry(args.fileName);
        break;
      }
      case "OPFS_ZIP": {
        const dir = await getRecordDir(args.basePath, rawKey, false);
        const filesToZip: Record<string, Uint8Array> = {};
        
        // @ts-ignore
        for await (const [name, handle] of dir.entries()) {
          if (handle.kind === "file" && (!args.filesToZip || args.filesToZip.includes(name))) {
            const f = await handle.getFile();
            filesToZip[name] = new Uint8Array(await f.arrayBuffer());
          }
        }

        const zippedData = zipSync(filesToZip);
        const zipFileHandle = await dir.getFileHandle(args.zipName, { create: true });
        const w = await zipFileHandle.createWritable();
        await w.write(new Blob([zippedData as any]));
        await w.close();

        if (args.deleteOriginals) {
          for (const name of Object.keys(filesToZip)) await dir.removeEntry(name);
        }
        break;
      }
      case "OPFS_UNZIP": {
        const dir = await getRecordDir(args.basePath, rawKey, false);
        const zipFileHandle = await dir.getFileHandle(args.zipName);
        const zipFile = await zipFileHandle.getFile();
        const zipBuffer = new Uint8Array(await zipFile.arrayBuffer());
        
        const unzipped = unzipSync(zipBuffer);
        for (const [name, data] of Object.entries(unzipped)) {
          if (!name.includes('/')) {
            const fh = await dir.getFileHandle(name, { create: true });
            const w = await fh.createWritable();
            await w.write(new Blob([data as any])); 
            await w.close();
          }
        }

        if (args.deleteZip) await dir.removeEntry(args.zipName);
        break;
      }
      case "OPFS_ADDZIP": {
        const dir = await getRecordDir(args.basePath, rawKey, false);
        const zipFileHandle = await dir.getFileHandle(args.zipName);
        const zipBuffer = new Uint8Array(await (await zipFileHandle.getFile()).arrayBuffer());
        const currentZipData = unzipSync(zipBuffer);
        
        currentZipData[args.fileName] = new Uint8Array(await (args.file as Blob).arrayBuffer());
        
        const newZippedData = zipSync(currentZipData);
        const w = await zipFileHandle.createWritable();
        await w.write(new Blob([newZippedData as any]));
        await w.close();
        break;
      }
      case "OPFS_DELZIP": {
        const dir = await getRecordDir(args.basePath, rawKey, false);
        const zipFileHandle = await dir.getFileHandle(args.zipName);
        const zipBuffer = new Uint8Array(await (await zipFileHandle.getFile()).arrayBuffer());
        const currentZipData = unzipSync(zipBuffer);
        
        delete currentZipData[args.fileName]; 
        
        const newZippedData = zipSync(currentZipData);
        const w = await zipFileHandle.createWritable();
        await w.write(new Blob([newZippedData as any]));
        await w.close();
        break;
      }
      
      default: 
        throw new Error(`Comando desconhecido: ${command}`);
    }
    
    self.postMessage({ requestId, success: true, result });
  } catch (error) {
    self.postMessage({ requestId, success: false, error: (error as Error).message });
  }
};