// db-sw.ts
// ⚠️ ESTE MÓDULO É DE USO EXCLUSIVO DO SERVICE WORKER OU AMBIENTES QUE JÁ RODAM EM BACKGROUND.
// Ele executa o IndexedDB DIRETAMENTE na thread atual, não utilizando postMessage/WebWorkers.

import { 
  get, set, del, keys, clear, getMany, setMany, delMany, 
  values, entries, createStore, type UseStore
} from "idb-keyval";

import { formatDbItem, prepareForSave, gerarId, gerarIdComPrefixo, type WithId } from "./utils/id-utils.ts";
import { writeJsonToOpfs, readJsonFromOpfs, resolveOpfsFileName } from "./utils/opfs_utils.ts";
import type { DbStoreOptions } from "./mod.ts";

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
  if (prefix) {
    items = items.filter(([k]) => typeof k === "string" && k.startsWith(prefix));
  }
  return items.map(([k, v]) => formatDbItem(k, v, prefix));
}

const globalSwDbAPI = {
  get: async <T>(key: string, opts?: DbStoreOptions): Promise<WithId<T> | undefined> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix) ? `${opts.prefix}${key}` : key;
    const val = await get(rawKey, store);
    return val !== undefined ? formatDbItem(rawKey, val, opts?.prefix) : undefined;
  },
  
  set: async <T>(keyOrVal: string | T, val?: T | DbStoreOptions, opts?: DbStoreOptions): Promise<string> => {
    let keyToSave: string | undefined;
    let valToSave: any;
    let options: DbStoreOptions = opts || {};

    if (typeof keyOrVal !== "string") {
      keyToSave = undefined;
      valToSave = keyOrVal;
      if (val) options = val as DbStoreOptions;
    } else {
      keyToSave = keyOrVal;
      valToSave = val;
    }

    const store = getCustomStore(options.dbName, options.storeName);
    const { key, cleanVal } = prepareForSave(keyToSave, valToSave, options.prefix);
    await set(key, cleanVal, store);
    return key;
  },
  
  update: async <T>(key: string, updater: (val: WithId<T> | undefined) => T, opts?: DbStoreOptions): Promise<void> => {
    const currentVal = await globalSwDbAPI.get<T>(key, opts);
    const newVal = updater(currentVal);
    await globalSwDbAPI.set(key, newVal, opts);
  },

  patch: async <T extends Record<string, any>, C = any>(
    key: string, patchOrFn: Partial<T> | ((prev: WithId<T>, ctx?: C) => T | Partial<T>), context?: C, opts?: DbStoreOptions
  ): Promise<WithId<T>> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix) ? `${opts.prefix}${key}` : key;
    const current = (await get(rawKey, store)) || {};
    
    let updated: any;
    if (typeof patchOrFn === "function") {
      updated = patchOrFn(formatDbItem(rawKey, current, opts?.prefix) as WithId<T>, context);
    } else {
      updated = Object.assign({}, current, patchOrFn);
    }

    const { key: finalKey, cleanVal } = prepareForSave(rawKey, updated, opts?.prefix);
    await set(finalKey, cleanVal, store);
    return formatDbItem(finalKey, cleanVal, opts?.prefix);
  },

  delete: async (key: string, opts?: DbStoreOptions): Promise<void> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix) ? `${opts.prefix}${key}` : key;
    await del(rawKey, store);
  },

  getMany: async <T>(keysList: string[], opts?: DbStoreOptions): Promise<(WithId<T> | undefined)[]> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const fullKeys = keysList.map(k => opts?.prefix && !k.startsWith(opts.prefix) ? `${opts.prefix}${k}` : k);
    const rawValues = await getMany(fullKeys, store);
    return rawValues.map((val, idx) => val !== undefined ? formatDbItem(fullKeys[idx]!, val, opts?.prefix) : undefined);
  },

  setMany: async (entriesList: [string, any][], opts?: DbStoreOptions): Promise<void> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const entriesToSet: [string, any][] = entriesList.map(([k, v]) => {
      const { key, cleanVal } = prepareForSave(k, v, opts?.prefix);
      return [key, cleanVal];
    });
    await setMany(entriesToSet, store);
  },

  deleteMany: async (keysList: string[], opts?: DbStoreOptions): Promise<void> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const fullKeys = keysList.map(k => opts?.prefix && !k.startsWith(opts.prefix) ? `${opts.prefix}${k}` : k);
    await delMany(fullKeys, store);
  },

  keys: async (opts?: DbStoreOptions): Promise<string[]> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const allKeys = await keys(store);
    return opts?.prefix ? allKeys.filter(k => typeof k === "string" && k.startsWith(opts.prefix!)) as string[] : allKeys as string[];
  },

  values: async <T>(opts?: DbStoreOptions): Promise<T[]> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const allEntries = await entries(store);
    return formatDbEntries(allEntries, opts?.prefix) as unknown as T[];
  },

  entries: async <T>(opts?: DbStoreOptions): Promise<[string, T][]> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const allEntries = await entries(store);
    return opts?.prefix ? allEntries.filter(([k]) => typeof k === "string" && k.startsWith(opts.prefix!)) as [string, T][] : allEntries as [string, T][];
  },

  clear: async (opts?: DbStoreOptions): Promise<void> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    if (opts?.prefix) {
      const allKeys = await keys(store);
      const keysToDelete = allKeys.filter(k => typeof k === "string" && k.startsWith(opts.prefix!));
      await delMany(keysToDelete, store);
    } else {
      await clear(store);
    }
  },

  query: async <T, R, C = any>(fn: (items: WithId<T>[], ctx?: C) => R, context?: C, opts?: DbStoreOptions): Promise<R> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const rawEntries = await entries(store);
    const formattedItems = formatDbEntries(rawEntries, opts?.prefix);
    return fn(formattedItems as WithId<T>[], context);
  },

  getSome: async <T, C = any>(fn: (items: WithId<T>[], ctx?: C) => WithId<T>[], context?: C, opts?: DbStoreOptions): Promise<WithId<T>[]> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const rawEntries = await entries(store);
    const formattedItems = formatDbEntries(rawEntries, opts?.prefix);
    const selectedItems = fn(formattedItems as WithId<T>[], context);
    if (!Array.isArray(selectedItems)) throw new Error("A função injetada em GET_SOME deve retornar um Array.");
    return selectedItems;
  },

  delSome: async <T, C = any>(fn: (items: WithId<T>[], ctx?: C) => WithId<T>[], context?: C, opts?: DbStoreOptions): Promise<void> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const rawEntries = await entries(store);
    const formattedItems = formatDbEntries(rawEntries, opts?.prefix);
    const selectedItems = fn(formattedItems as WithId<T>[], context);
    
    if (!Array.isArray(selectedItems)) throw new Error("A função injetada em DEL_SOME deve retornar um Array.");
    
    const keysToDelete: string[] = selectedItems.map((item: any) => {
      if (!item || item._id === undefined) throw new Error("Os itens retornados em DEL_SOME precisam conter a propriedade '_id'.");
      return opts?.prefix && !item._id.startsWith(opts.prefix) ? `${opts.prefix}${item._id}` : item._id;
    });
    await delMany(keysToDelete, store);
  },

  setSome: async <T, C = any>(selectFn: (items: WithId<T>[], ctx?: C) => WithId<T>[], updateFn: (item: WithId<T>, ctx?: C) => WithId<T>, context?: C, opts?: DbStoreOptions): Promise<void> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const rawEntries = await entries(store);
    const formattedItems = formatDbEntries(rawEntries, opts?.prefix);
    
    const selectedItems = selectFn(formattedItems as WithId<T>[], context);
    if (!Array.isArray(selectedItems)) throw new Error("A função de seleção em SET_SOME deve retornar um Array.");
    
    const entriesToSet: [string, any][] = selectedItems.map((item: any) => {
      if (!item || item._id === undefined) throw new Error("Os itens selecionados no SET_SOME precisam conter a propriedade '_id'.");
      const updatedItem = updateFn(item, context);
      const { key, cleanVal } = prepareForSave(undefined, updatedItem, opts?.prefix);
      return [key, cleanVal];
    });
    await setMany(entriesToSet, store);
  },

  exportDB: async (opts?: DbStoreOptions): Promise<Record<string, any>> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const allEntries = await entries(store);
    const filtered = opts?.prefix ? allEntries.filter(([k]) => typeof k === "string" && k.startsWith(opts.prefix!)) : allEntries;
    return Object.fromEntries(filtered);
  },

  importDB: async (data: Record<string, any>, clearFirst = false, opts?: DbStoreOptions): Promise<void> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    if (clearFirst) await globalSwDbAPI.clear(opts);
    
    const entriesToImport: [string, any][] = Object.entries(data).map(([k, v]) => {
      const { key, cleanVal } = prepareForSave(k, v, opts?.prefix);
      return [key, cleanVal];
    });
    await setMany(entriesToImport, store);
  },

  backupToOpfs: async (fileName?: string, opts?: DbStoreOptions): Promise<string> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const allEntries = await entries(store);
    const filtered = opts?.prefix ? allEntries.filter(([k]) => typeof k === "string" && k.startsWith(opts.prefix!)) : allEntries;
    const data = Object.fromEntries(filtered);
    
    const finalName = resolveOpfsFileName("db", fileName || "backup.json", {
      dbName: opts?.dbName, storeName: opts?.storeName, prefix: opts?.prefix
    });
    return await writeJsonToOpfs(finalName, data);
  },

  restoreFromOpfs: async (fileName: string, clearFirst = false, opts?: DbStoreOptions): Promise<void> => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const data = await readJsonFromOpfs(fileName);
    if (clearFirst) await globalSwDbAPI.clear(opts);
    
    const entriesToImport: [string, any][] = Object.entries(data).map(([k, v]) => {
      const { key, cleanVal } = prepareForSave(k, v, opts?.prefix);
      return [key, cleanVal];
    });
    await setMany(entriesToImport, store);
  },
};

export function createScopedDb(dbName?: string, storeName = "keyval", prefix = "") {
  const opts: DbStoreOptions = { dbName, storeName, prefix };

  return {
    get: <T>(key: string) => globalSwDbAPI.get<T>(key, opts),
    set: <T>(keyOrVal: string | T, val?: T) => globalSwDbAPI.set<T>(keyOrVal as any, val as any, opts),
    update: <T>(key: string, updater: (val: WithId<T> | undefined) => T) => globalSwDbAPI.update<T>(key, updater, opts),
    patch: <T extends Record<string, any>, C = any>(key: string, patchOrFn: Partial<T> | ((prev: WithId<T>, ctx?: C) => T | Partial<T>), context?: C) => globalSwDbAPI.patch<T, C>(key, patchOrFn, context, opts),
    delete: (key: string) => globalSwDbAPI.delete(key, opts),
    
    getMany: <T>(keys: string[]) => globalSwDbAPI.getMany<T>(keys, opts),
    setMany: (entries: [string, any][]) => globalSwDbAPI.setMany(entries, opts),
    deleteMany: (keys: string[]) => globalSwDbAPI.deleteMany(keys, opts),
    
    keys: () => globalSwDbAPI.keys(opts),
    values: <T>() => globalSwDbAPI.values<T>(opts),
    entries: <T>() => globalSwDbAPI.entries<T>(opts),
    clear: () => globalSwDbAPI.clear(opts), 
    
    query: <T, R, C = any>(fn: (items: WithId<T>[], ctx?: C) => R, context?: C) => globalSwDbAPI.query<T, R, C>(fn, context, opts),
    getSome: <T, C = any>(fn: (items: WithId<T>[], ctx?: C) => WithId<T>[], context?: C) => globalSwDbAPI.getSome<T, C>(fn, context, opts),
    delSome: <T, C = any>(fn: (items: WithId<T>[], ctx?: C) => WithId<T>[], context?: C) => globalSwDbAPI.delSome<T, C>(fn, context, opts),
    setSome: <T, C = any>(selectFn: (items: WithId<T>[], ctx?: C) => WithId<T>[], updateFn: (item: WithId<T>, ctx?: C) => WithId<T>, context?: C) => globalSwDbAPI.setSome<T, C>(selectFn, updateFn, context, opts),
      
    exportDB: () => globalSwDbAPI.exportDB(opts),
    importDB: (data: Record<string, any>, clearFirst = false) => globalSwDbAPI.importDB(data, clearFirst, opts),

    backupToOpfs: (fileName?: string) => globalSwDbAPI.backupToOpfs(fileName, opts),
    restoreFromOpfs: (fileName: string, clearFirst = false) => globalSwDbAPI.restoreFromOpfs(fileName, clearFirst, opts),
    
    gerarId,
    gerarIdComPrefixo: () => prefix ? gerarIdComPrefixo(prefix) : gerarId()
  };
}

// A exportação principal. Importe isso no seu sw.ts!
export const db = Object.assign(
  (dbName?: string, storeName?: string, prefix?: string) => createScopedDb(dbName, storeName, prefix),
  globalSwDbAPI
);

