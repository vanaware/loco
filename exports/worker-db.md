> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém experimentos e código da área de WORKER-DB.
> O projeto é o **Loco ** estruturado em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco - Modo: WORKERDB

Gerado automaticamente em: 8/22/2026, 9:49:52 PM

---

## Arquivo: `monorepo/worker-db/src/ls.ts`

```ts
import { formatDbItem, prepareForSave, gerarId, gerarIdComPrefixo } from "./utils/id-utils.ts";
import { writeJsonToOpfs, readJsonFromOpfs, resolveOpfsFileName } from "./utils/opfs_utils.ts";
import type { WithId } from "./mod.ts";

export interface LsStoreOptions {
  prefix?: string;
}

function getAllPrefixedEntries(prefix = ""): [string, any][] {
  const entries: [string, any][] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (!prefix || key.startsWith(prefix))) {
      const rawVal = localStorage.getItem(key);
      if (rawVal !== null) {
        try {
          entries.push([key, JSON.parse(rawVal)]);
        } catch {
          // Ignora itens que não sejam JSON válido
        }
      }
    }
  }
  return entries;
}

function getFormattedItems<T>(prefix = ""): WithId<T>[] {
  const rawEntries = getAllPrefixedEntries(prefix);
  return rawEntries.map(([k, v]) => formatDbItem(k, v, prefix));
}

function resolveKey(key: string, prefix = ""): string {
  return prefix && !key.startsWith(prefix) ? `${prefix}${key}` : key;
}

function createScopedLs(prefix = "") {
  return {
    get: <T>(key: string): WithId<T> | undefined => {
      const fullKey = resolveKey(key, prefix);
      const raw = localStorage.getItem(fullKey);
      if (raw === null) return undefined;
      try {
        return formatDbItem(fullKey, JSON.parse(raw), prefix);
      } catch {
        return undefined;
      }
    },

    set: <T>(keyOrVal: string | T, val?: T): string => {
      let key: string | undefined;
      let targetVal: any;

      if (typeof keyOrVal === "string") {
        key = keyOrVal;
        targetVal = val;
      } else {
        key = undefined;
        targetVal = keyOrVal;
      }

      const { key: finalKey, cleanVal } = prepareForSave(key, targetVal, prefix);
      localStorage.setItem(finalKey, JSON.stringify(cleanVal));
      return finalKey;
    },

    patch: <T extends Record<string, any>, C = any>(
      key: string, 
      patchOrFn: Partial<T> | ((prev: WithId<T>, ctx?: C) => T | Partial<T>), 
      context?: C
    ): WithId<T> => {
      const current = createScopedLs(prefix).get<T>(key) || ({} as WithId<T>);
      let updated: any;

      if (typeof patchOrFn === "function") {
        updated = patchOrFn(current, context);
      } else {
        updated = Object.assign({}, current, patchOrFn);
      }

      const { key: finalKey, cleanVal } = prepareForSave(key, updated, prefix);
      localStorage.setItem(finalKey, JSON.stringify(cleanVal));
      return formatDbItem(finalKey, cleanVal, prefix);
    },

    delete: (key: string): void => {
      localStorage.removeItem(resolveKey(key, prefix));
    },

    getMany: <T>(keys: string[]): (WithId<T> | undefined)[] => {
      const api = createScopedLs(prefix);
      return keys.map((k) => api.get<T>(k));
    },

    setMany: (entries: [string, any][]): void => {
      const api = createScopedLs(prefix);
      entries.forEach(([k, v]) => api.set(k, v));
    },

    deleteMany: (keys: string[]): void => {
      const api = createScopedLs(prefix);
      keys.forEach((k) => api.delete(k));
    },

    keys: (): string[] => {
      const keysList: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (!prefix || k.startsWith(prefix))) {
          keysList.push(k);
        }
      }
      return keysList;
    },

    values: <T>(): T[] => {
      return getFormattedItems<T>(prefix) as unknown as T[];
    },

    entries: <T>(): [string, T][] => {
      return getAllPrefixedEntries(prefix);
    },

    clear: (): void => {
      if (!prefix) {
        localStorage.clear();
        return;
      }
      const keysToRemove = createScopedLs(prefix).keys();
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    },

    query: <T, R, C = any>(fn: (items: WithId<T>[], ctx?: C) => R, context?: C): R => {
      const items = getFormattedItems<T>(prefix);
      return fn(items, context);
    },

    getSome: <T, C = any>(fn: (items: WithId<T>[], ctx?: C) => WithId<T>[], context?: C): WithId<T>[] => {
      const items = getFormattedItems<T>(prefix);
      const selected = fn(items, context);
      if (!Array.isArray(selected)) {
        throw new Error("A função em getSome deve retornar um Array.");
      }
      return selected;
    },

    delSome: <T, C = any>(fn: (items: WithId<T>[], ctx?: C) => WithId<T>[], context?: C): void => {
      const items = getFormattedItems<T>(prefix);
      const selected = fn(items, context);
      if (!Array.isArray(selected)) {
        throw new Error("A função em delSome deve retornar um Array.");
      }
      selected.forEach((item) => {
        if (!item || item._id === undefined) {
          throw new Error("Os itens retornados em delSome precisam conter a propriedade '_id'.");
        }
        const rawKey = prefix && !item._id.startsWith(prefix) ? `${prefix}${item._id}` : item._id;
        localStorage.removeItem(rawKey);
      });
    },

    setSome: <T, C = any>(
      selectFn: (items: WithId<T>[], ctx?: C) => WithId<T>[],
      updateFn: (item: WithId<T>, ctx?: C) => WithId<T>,
      context?: C
    ): void => {
      const items = getFormattedItems<T>(prefix);
      const selected = selectFn(items, context);
      if (!Array.isArray(selected)) {
        throw new Error("A função de seleção em setSome deve retornar um Array.");
      }
      selected.forEach((item) => {
        if (!item || item._id === undefined) {
          throw new Error("Os itens selecionados em setSome precisam conter a propriedade '_id'.");
        }
        const updatedItem = updateFn(item, context);
        const { key: finalKey, cleanVal } = prepareForSave(undefined, updatedItem, prefix);
        localStorage.setItem(finalKey, JSON.stringify(cleanVal));
      });
    },

    // --- MÉTODOS DE EXPORTAÇÃO / IMPORTAÇÃO ---

    exportLS: (): Record<string, any> => {
      const allEntries = getAllPrefixedEntries(prefix);
      return Object.fromEntries(allEntries);
    },

    importLS: (data: Record<string, any>, clearFirst = false): void => {
      const api = createScopedLs(prefix);
      if (clearFirst) api.clear();
      Object.entries(data).forEach(([k, v]) => api.set(k, v));
    },

    backupToOpfs: async (fileName = "backup.json"): Promise<string> => {
      const data = Object.fromEntries(getAllPrefixedEntries(prefix));
      const finalName = resolveOpfsFileName("ls", fileName, { prefix });
      return await writeJsonToOpfs(finalName, data);
    },

    restoreFromOpfs: async (fileName: string, clearFirst = false): Promise<void> => {
      const data = await readJsonFromOpfs(fileName);
      const api = createScopedLs(prefix);
      if (clearFirst) api.clear();
      Object.entries(data).forEach(([k, v]) => api.set(k, v));
    },

    gerarId,
    gerarIdComPrefixo: () => (prefix ? gerarIdComPrefixo(prefix) : gerarId()),
  };
}

export const ls = Object.assign(
  (prefix = "") => createScopedLs(prefix),
  createScopedLs()
);
```

---

## Arquivo: `monorepo/worker-db/src/db.ts`

```ts
// db.ts
import { 
  get, set, del, keys, clear, getMany, setMany, delMany, 
  values, entries, createStore, type UseStore
} from "idb-keyval";

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
  if (prefix) {
    items = items.filter(([k]) => typeof k === "string" && k.startsWith(prefix));
  }
  return items.map(([k, v]) => formatDbItem(k, v, prefix));
}

self.onmessage = async (e: MessageEvent) => {
  const { requestId, command, args } = e.data;

  try {
    const store = getCustomStore(args.dbName, args.storeName);
    let result;

    switch (command) {
      case "GET": {
        const rawKey = args.key ? (args.prefix && !args.key.startsWith(args.prefix) ? `${args.prefix}${args.key}` : args.key) : args.key;
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
        const rawKey = args.prefix && !args.key.startsWith(args.prefix) ? `${args.prefix}${args.key}` : args.key;
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
        const formattedItems = formatDbEntries(allEntries, args.prefix);
        result = formattedItems; 
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
        const rawKey = args.prefix && !args.key.startsWith(args.prefix) ? `${args.prefix}${args.key}` : args.key;
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
        
        if (!Array.isArray(selectedItems)) {
          throw new Error("A função injetada em GET_SOME deve retornar um Array.");
        }
        
        result = selectedItems;
        break;
      }

      case "DEL_SOME": {
        const rawEntries = await entries(store);
        const formattedItems = formatDbEntries(rawEntries, args.prefix);
        const runner = new Function("items", "ctx", `return (${args.fnStr})(items, ctx);`);
        const selectedItems = runner(formattedItems, args.context);
        
        if (!Array.isArray(selectedItems)) {
          throw new Error("A função injetada em DEL_SOME deve retornar um Array.");
        }
        
        const keysToDelete: string[] = selectedItems.map((item: any) => {
          if (!item || item._id === undefined) {
            throw new Error("Os itens retornados em DEL_SOME precisam conter a propriedade '_id'.");
          }
          return args.prefix && !item._id.startsWith(args.prefix) ? `${args.prefix}${item._id}` : item._id;
        });
          
        result = await delMany(keysToDelete, store);
        break;
      }

      case "SET_SOME": {
        const rawEntries = await entries(store);
        const formattedItems = formatDbEntries(rawEntries, args.prefix);
        
        const selectRunner = new Function("items", "ctx", `return (${args.selectFnStr})(items, ctx);`);
        const updateRunner = new Function("item", "ctx", `return (${args.updateFnStr})(item, ctx);`);
        
        const selectedItems = selectRunner(formattedItems, args.context);
        
        if (!Array.isArray(selectedItems)) {
          throw new Error("A função de seleção em SET_SOME deve retornar um Array.");
        }
        
        const entriesToSet: [string, any][] = selectedItems.map((item: any) => {
          if (!item || item._id === undefined) {
             throw new Error("Os itens selecionados no SET_SOME precisam conter a propriedade '_id'.");
          }
          
          const updatedItem = updateRunner(item, args.context);
          const { key, cleanVal } = prepareForSave(undefined, updatedItem, args.prefix);
          return [key, cleanVal];
        });
        
        result = await setMany(entriesToSet, store);
        break;
      }

      case "EXPORT": {
        const allEntries = await entries(store);
        const filtered = args.prefix 
          ? allEntries.filter(([k]) => typeof k === "string" && k.startsWith(args.prefix)) 
          : allEntries;
        result = Object.fromEntries(filtered);
        break;
      }

      case "IMPORT": {
        if (args.clearFirst) {
          if (args.prefix) {
            const allKeys = await keys(store);
            const keysToDelete = allKeys.filter((k) => typeof k === "string" && k.startsWith(args.prefix));
            await delMany(keysToDelete, store);
          } else {
            await clear(store);
          }
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
        const filtered = args.prefix 
          ? allEntries.filter(([k]) => typeof k === "string" && k.startsWith(args.prefix)) 
          : allEntries;
        const data = Object.fromEntries(filtered);
        
        const fileName = resolveOpfsFileName("db", args.fileName || "backup.json", {
          dbName: args.dbName,
          storeName: args.storeName,
          prefix: args.prefix
        });
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
          } else {
            await clear(store);
          }
        }
        
        const entriesToImport: [string, any][] = Object.entries(data).map(([k, v]) => {
          const { key, cleanVal } = prepareForSave(k, v, args.prefix);
          return [key, cleanVal];
        });
        result = await setMany(entriesToImport, store);
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
```

---

## Arquivo: `monorepo/worker-db/src/mod.ts`

```ts
// mod.ts
import { gerarId, gerarIdComPrefixo, validarId, type WithId } from "./utils/id-utils.ts";
import { downloadOpfsFile, listOpfsFiles, deleteFromOpfs, getFileFromOpfs } from "./utils/opfs_utils.ts";
import { ls } from "./ls.ts";

// Exportando os utilitários de OPFS para uso fácil na Main Thread
export { gerarId, gerarIdComPrefixo, validarId, ls, downloadOpfsFile, listOpfsFiles, deleteFromOpfs, getFileFromOpfs, type WithId };

let workerInstance: Worker | null = null;
let currentWorkerPath: string | URL = "./worker-db.js";
const pendingRequests = new Map<string, { resolve: Function; reject: Function }>();

function getWorker(workerPath?: string | URL): Worker {
  if (workerPath) {
    currentWorkerPath = workerPath;
  }
  
  if (!workerInstance) {
    const workerUrl = typeof currentWorkerPath === "string" 
      ? new URL(currentWorkerPath, import.meta.url) 
      : currentWorkerPath;

    workerInstance = new Worker(workerUrl, { type: "module" });

    workerInstance.onmessage = (e: MessageEvent) => {
      const { requestId, success, result, error } = e.data;
      const promise = pendingRequests.get(requestId);
      
      if (promise) {
        if (success) promise.resolve(result);
        else promise.reject(new Error(error));
        pendingRequests.delete(requestId);
      }
    };

    workerInstance.onerror = (event) => {
      console.error("⚠️ Falha crítica no Web Worker:", event.message);
      pendingRequests.forEach(({ reject }) => reject(new Error("Worker crashed")));
      pendingRequests.clear();
      restartWorker();
    };
  }
  return workerInstance;
}

function restartWorker() {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
  }
  pendingRequests.forEach(({ reject }) => reject(new Error("Worker foi reiniciado")));
  pendingRequests.clear();
  getWorker(); 
}

function terminateWorker() {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
  }
}

function exec<T>(command: string, args: Record<string, any> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = gerarId();
    pendingRequests.set(requestId, { resolve, reject });
    
    try {
      getWorker().postMessage({ requestId, command, args });
    } catch (err) {
      pendingRequests.delete(requestId);
      reject(err);
    }
  });
}

export interface DbStoreOptions {
  dbName?: string;
  storeName?: string;
  prefix?: string;
}

const globalDbAPI = {
  get: <T>(key: string, opts?: DbStoreOptions) => exec<WithId<T>>("GET", { key, ...opts }),
  
  set: <T>(keyOrVal: string | T, val?: T | DbStoreOptions, opts?: DbStoreOptions) => {
    if (typeof keyOrVal !== "string") {
      const options = opts || (val as DbStoreOptions) || {};
      return exec<string>("SET", { key: undefined, val: keyOrVal, ...options });
    }
    return exec<string>("SET", { key: keyOrVal, val, ...opts });
  },
  
  update: async <T>(key: string, updater: (val: WithId<T> | undefined) => T, opts?: DbStoreOptions): Promise<void> => {
    const currentVal = await exec<WithId<T> | undefined>("GET", { key, ...opts });
    const newVal = updater(currentVal);
    await exec<void>("SET", { key, val: newVal, ...opts });
  },

  patch: <T extends Record<string, any>, C = any>(
    key: string, patchOrFn: Partial<T> | ((prev: WithId<T>, ctx: C) => T | Partial<T>), context?: C, opts?: DbStoreOptions
  ): Promise<WithId<T>> => {
    const isFn = typeof patchOrFn === "function";
    return exec<WithId<T>>("PATCH", { key, patch: isFn ? undefined : patchOrFn, fnStr: isFn ? patchOrFn.toString() : undefined, context, ...opts });
  },

  delete: (key: string, opts?: DbStoreOptions) => exec<void>("DELETE", { key, ...opts }),

  getMany: <T>(keys: string[], opts?: DbStoreOptions) => exec<(WithId<T> | undefined)[]> ("GET_MANY", { keys, ...opts }),
  setMany: (entries: [string, any][], opts?: DbStoreOptions) => exec<void>("SET_MANY", { entries, ...opts }),
  deleteMany: (keys: string[], opts?: DbStoreOptions) => exec<void>("DEL_MANY", { keys, ...opts }),

  keys: (opts?: DbStoreOptions) => exec<string[]>("KEYS", { ...opts }),
  values: <T>(opts?: DbStoreOptions) => exec<T[]>("VALUES", { ...opts }),
  entries: <T>(opts?: DbStoreOptions) => exec<[string, T][]>("ENTRIES", { ...opts }),
  clear: (opts?: DbStoreOptions) => exec<void>("CLEAR", { ...opts }),

  query: <T, R, C = any>(fn: (items: WithId<T>[], ctx: C) => R, context?: C, opts?: DbStoreOptions): Promise<R> => 
    exec<R>("QUERY", { fnStr: fn.toString(), context, ...opts }),

  getSome: <T, C = any>(fn: (items: WithId<T>[], ctx: C) => WithId<T>[], context?: C, opts?: DbStoreOptions): Promise<WithId<T>[]> => 
    exec<WithId<T>[]>("GET_SOME", { fnStr: fn.toString(), context, ...opts }),

  delSome: <T, C = any>(fn: (items: WithId<T>[], ctx: C) => WithId<T>[], context?: C, opts?: DbStoreOptions): Promise<void> => 
    exec<void>("DEL_SOME", { fnStr: fn.toString(), context, ...opts }),

  setSome: <T, C = any>(
    selectFn: (items: WithId<T>[], ctx: C) => WithId<T>[], 
    updateFn: (item: WithId<T>, ctx: C) => WithId<T>, 
    context?: C, 
    opts?: DbStoreOptions
  ): Promise<void> => exec<void>("SET_SOME", { 
    selectFnStr: selectFn.toString(), 
    updateFnStr: updateFn.toString(), 
    context, 
    ...opts 
  }),

  exportDB: (opts?: DbStoreOptions) => exec<Record<string, any>>("EXPORT", { ...opts }),
  importDB: (data: Record<string, any>, clearFirst = false, opts?: DbStoreOptions) => exec<void>("IMPORT", { data, clearFirst, ...opts }),

  backupToOpfs: (fileName?: string, opts?: DbStoreOptions) => exec<string>("BACKUP_OPFS", { fileName, ...opts }),
  restoreFromOpfs: (fileName: string, clearFirst = false, opts?: DbStoreOptions) => exec<void>("RESTORE_OPFS", { fileName, clearFirst, ...opts }),

  init: (workerPath?: string | URL) => { getWorker(workerPath); }, 
  restart: () => restartWorker(),
  terminate: () => terminateWorker(),
};

function createScopedDb(dbName?: string, storeName = "keyval", prefix = "") {
  const opts: DbStoreOptions = { dbName, storeName, prefix };

  return {
    get: <T>(key: string) => globalDbAPI.get<T>(key, opts),
    set: <T>(keyOrVal: string | T, val?: T) => globalDbAPI.set<T>(keyOrVal as any, val as any, opts),
    update: <T>(key: string, updater: (val: WithId<T> | undefined) => T) => globalDbAPI.update<T>(key, updater, opts),
    patch: <T extends Record<string, any>, C = any>(key: string, patchOrFn: Partial<T> | ((prev: WithId<T>, ctx: C) => T | Partial<T>), context?: C) => globalDbAPI.patch<T, C>(key, patchOrFn, context, opts),
    delete: (key: string) => globalDbAPI.delete(key, opts),
    
    getMany: <T>(keys: string[]) => globalDbAPI.getMany<T>(keys, opts),
    setMany: (entries: [string, any][]) => globalDbAPI.setMany(entries, opts),
    deleteMany: (keys: string[]) => globalDbAPI.deleteMany(keys, opts),
    
    keys: () => globalDbAPI.keys(opts),
    values: <T>() => globalDbAPI.values<T>(opts),
    entries: <T>() => globalDbAPI.entries<T>(opts),
    clear: () => globalDbAPI.clear(opts), 
    
    query: <T, R, C = any>(fn: (items: WithId<T>[], ctx: C) => R, context?: C) => globalDbAPI.query<T, R, C>(fn, context, opts),
    getSome: <T, C = any>(fn: (items: WithId<T>[], ctx: C) => WithId<T>[], context?: C) => globalDbAPI.getSome<T, C>(fn, context, opts),
    delSome: <T, C = any>(fn: (items: WithId<T>[], ctx: C) => WithId<T>[], context?: C) => globalDbAPI.delSome<T, C>(fn, context, opts),
    setSome: <T, C = any>(selectFn: (items: WithId<T>[], ctx: C) => WithId<T>[], updateFn: (item: WithId<T>, ctx: C) => WithId<T>, context?: C) => globalDbAPI.setSome<T, C>(selectFn, updateFn, context, opts),
      
    exportDB: () => globalDbAPI.exportDB(opts),
    importDB: (data: Record<string, any>, clearFirst = false) => globalDbAPI.importDB(data, clearFirst, opts),

    backupToOpfs: (fileName?: string) => globalDbAPI.backupToOpfs(fileName, opts),
    restoreFromOpfs: (fileName: string, clearFirst = false) => globalDbAPI.restoreFromOpfs(fileName, clearFirst, opts),
    
    gerarId,
    gerarIdComPrefixo: () => prefix ? gerarIdComPrefixo(prefix) : gerarId()
  };
}

export const db = Object.assign(
  (dbName?: string, storeName?: string, prefix?: string) => createScopedDb(dbName, storeName, prefix),
  globalDbAPI
);
```

---

## Arquivo: `monorepo/worker-db/src/fake/fake-local-storage.ts`

```ts
export class FakeLocalStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}
```

---

## Arquivo: `monorepo/worker-db/src/fake/fake-opfs.ts`

```ts
export class FakeOPFSFileHandle {
  public kind: "file" | "directory" = "file";

  constructor(
    private fullPath: string,
    private storage: Map<string, string>
  ) {}

  async createWritable() {
    const self = this;
    let content = "";
    return {
      async write(data: string) {
        content = data;
      },
      async close() {
        self.storage.set(self.fullPath, content);
      }
    };
  }

  async getFile() {
    const content = this.storage.get(this.fullPath);
    if (content === undefined) {
      throw new Error(`File ${this.fullPath} not found in Fake OPFS`);
    }
    return {
      async text() {
        return content;
      }
    };
  }
}

export class FakeOPFSDirectory {
  private static sharedStorage = new Map<string, string>();

  constructor(private path: string = "") {}

  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    // Simula a criação/retorno de um subdiretório
    return new FakeOPFSDirectory(this.path ? `${this.path}/${name}` : name);
  }

  async getFileHandle(name: string, options?: { create?: boolean }) {
    const fullPath = this.path ? `${this.path}/${name}` : name;
    if (!options?.create && !FakeOPFSDirectory.sharedStorage.has(fullPath)) {
      throw new Error(`File ${fullPath} not found in Fake OPFS`);
    }
    return new FakeOPFSFileHandle(fullPath, FakeOPFSDirectory.sharedStorage);
  }

  async removeEntry(name: string) {
    const fullPath = this.path ? `${this.path}/${name}` : name;
    FakeOPFSDirectory.sharedStorage.delete(fullPath);
  }

  async *keys() {
    for (const key of FakeOPFSDirectory.sharedStorage.keys()) {
      if (this.path && key.startsWith(`${this.path}/`)) {
         const localName = key.slice(this.path.length + 1);
         if (!localName.includes("/")) yield localName;
      } else if (!this.path && !key.includes("/")) {
         yield key;
      }
    }
  }

  async *entries() {
    for (const key of FakeOPFSDirectory.sharedStorage.keys()) {
      if (this.path && key.startsWith(`${this.path}/`)) {
         const localName = key.slice(this.path.length + 1);
         if (!localName.includes("/")) yield [localName, new FakeOPFSFileHandle(key, FakeOPFSDirectory.sharedStorage)] as const;
      } else if (!this.path && !key.includes("/")) {
         yield [key, new FakeOPFSFileHandle(key, FakeOPFSDirectory.sharedStorage)] as const;
      }
    }
  }

  async *values() {
    for (const key of FakeOPFSDirectory.sharedStorage.keys()) {
      if (this.path && key.startsWith(`${this.path}/`)) {
         const localName = key.slice(this.path.length + 1);
         if (!localName.includes("/")) yield new FakeOPFSFileHandle(key, FakeOPFSDirectory.sharedStorage);
      } else if (!this.path && !key.includes("/")) {
         yield new FakeOPFSFileHandle(key, FakeOPFSDirectory.sharedStorage);
      }
    }
  }

  static clear() {
    FakeOPFSDirectory.sharedStorage.clear();
  }
}
```

---

## Arquivo: `monorepo/worker-db/src/fake/fake-db.ts`

```ts
// monorepo/worker-db/src/fake/fake-db.ts

// 1. Injeta o IndexedDB Fake no escopo global (self) do Worker
import "fake-indexeddb/auto";

import { FakeOPFSDirectory } from "./fake-opfs.ts";

const _self = self as any;

// 2. Injeta OPFS Fake no escopo do Worker
if (!_self.navigator) _self.navigator = {};
if (!_self.navigator.storage) _self.navigator.storage = {};
if (!_self.navigator.storage.getDirectory) {
  _self.navigator.storage.getDirectory = async () => new FakeOPFSDirectory();
}

// 3. Agora que o ambiente do Worker está perfeitamente simulado,
// importamos a lógica real do banco de dados. O db.ts vai rodar
// achando que está em um browser de verdade!
import "../db.ts";
```

---

## Arquivo: `monorepo/worker-db/src/fake/fake-mod.ts`

```ts
// monorepo/worker-db/src/fake/fake-mod.ts

// 1. Injeta o IndexedDB Fake globalmente (Main Thread)
import "fake-indexeddb/auto";

import { FakeOPFSDirectory } from "./fake-opfs.ts";
import { FakeLocalStorage } from "./fake-local-storage.ts";

const _global = globalThis as any;

// 2. Injeta OPFS Fake (Main Thread)
if (!_global.navigator) _global.navigator = {};
if (!_global.navigator.storage) _global.navigator.storage = {};
if (!_global.navigator.storage.getDirectory) {
  _global.navigator.storage.getDirectory = async () => new FakeOPFSDirectory();
}

// 3. Injeta LocalStorage Fake (Main Thread)
if (!_global.localStorage || _global.localStorage.constructor.name !== "FakeLocalStorage") {
  try {
    Object.defineProperty(_global, "localStorage", {
      value: new FakeLocalStorage(),
      writable: true,
      configurable: true
    });
  } catch {
    _global.localStorage = new FakeLocalStorage();
  }
}

// 4. Exportamos tudo do módulo principal para que o demo.ts consuma
export * from "../mod.ts";

// 5. O PULO DO GATO: Forçamos a inicialização do módulo para usar o Worker Fake.
// O Deno resolve arquivos .ts nativamente em Workers usando import.meta.url
import { db } from "../mod.ts";
const fakeWorkerUrl = new URL("./fake-db.ts", import.meta.url);
db.init(fakeWorkerUrl);
```

---

## Arquivo: `monorepo/worker-db/src/utils/id-utils.ts`

```ts
export type WithId<T> = T & { _id: string };

export function gerarId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

export function gerarIdComPrefixo(prefix: string): string {
  return `${prefix}${gerarId()}`;
}

export function validarId(id: string): boolean {
  return typeof id === "string" && id.length > 0;
}

// Injeta dinamicamente o '_id' sem o prefixo ao LER do banco/localStorage
export function formatDbItem(key: IDBValidKey, val: any, prefix = ""): any {
  if (!val || typeof val !== "object" || Array.isArray(val)) return val;
  const keyStr = String(key);
  const _id = prefix && keyStr.startsWith(prefix) ? keyStr.slice(prefix.length) : keyStr;
  return { _id, ...val };
}

// Prepara a chave final e limpa o '_id' do objeto gravado
export function prepareForSave(key: string | undefined | null, val: any, prefix = ""): { key: string; cleanVal: any } {
  let rawId = val && typeof val === "object" ? val._id : undefined;
  
  if (rawId === "auto") {
    rawId = gerarId();
  }

  // Intercepta a chave informada como "auto" via parâmetro direto ou tupla do setMany
  let processKey = key === "auto" ? gerarId() : key;

  let finalKey = processKey || "";

  if (rawId) {
    if (prefix && rawId.startsWith(prefix)) {
      finalKey = rawId;
    } else {
      finalKey = prefix ? `${prefix}${rawId}` : rawId;
    }
  } else if (processKey) {
    if (prefix && processKey.startsWith(prefix)) {
      finalKey = processKey;
    } else {
      finalKey = prefix ? `${prefix}${processKey}` : processKey;
    }
  }

  if (!finalKey) {
    throw new Error("Uma chave (key) ou um atributo '_id' no objeto deve ser fornecido.");
  }

  if (val && typeof val === "object" && !Array.isArray(val) && "_id" in val) {
    const { _id: _, ...cleanVal } = val;
    return { key: finalKey, cleanVal };
  }

  return { key: finalKey, cleanVal: val };
}
```

---

## Arquivo: `monorepo/worker-db/src/utils/opfs_utils.ts`

```ts
export interface OpfsResolveOptions {
  dbName?: string;
  storeName?: string;
  prefix?: string;
}

// Resolve o nome do arquivo dinamicamente
export function resolveOpfsFileName(type: "db" | "ls", fileName: string, opts?: OpfsResolveOptions): string {
  const parts: string[] = [type]; 
  if (type === "db") {
    if (opts?.dbName) parts.push(opts.dbName);
    if (opts?.storeName) parts.push(opts.storeName);
  }
  if (opts?.prefix) parts.push(opts.prefix);
  
  parts.push(fileName);
  return parts.join("_");
}

// Utilitário interno para garantir que sempre operemos na pasta 'backup'
async function getBackupDir() {
  const root = await navigator.storage.getDirectory();
  return await root.getDirectoryHandle("backup", { create: true });
}

export async function writeJsonToOpfs(fileName: string, data: any): Promise<string> {
  const backupDir = await getBackupDir();
  const fileHandle = await backupDir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data));
  await writable.close();
  return fileName;
}

export async function readJsonFromOpfs(fileName: string): Promise<any> {
  const backupDir = await getBackupDir();
  const fileHandle = await backupDir.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  const text = await file.text();
  return JSON.parse(text);
}

export async function deleteFromOpfs(fileName: string): Promise<void> {
  const backupDir = await getBackupDir();
  await backupDir.removeEntry(fileName);
}

export async function getFileFromOpfs(fileName: string): Promise<File> {
  const backupDir = await getBackupDir();
  const fileHandle = await backupDir.getFileHandle(fileName);
  return await fileHandle.getFile();
}

export async function listOpfsFiles(): Promise<string[]> {
  const backupDir = await getBackupDir();
  const files: string[] = [];
  // @ts-ignore: async iterator support
  for await (const [name, handle] of backupDir.entries()) {
    if (handle.kind === "file") files.push(name);
  }
  return files;
}

export async function downloadOpfsFile(fileName: string): Promise<void> {
  if (typeof document === "undefined") {
    throw new Error("downloadOpfsFile só pode ser executado na Main Thread (onde 'document' existe).");
  }
  const file = await getFileFromOpfs(fileName);
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

---

## Arquivo: `monorepo/worker-db/src/db-sw.ts`

```ts
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


```

---

## Arquivo: `monorepo/worker-db/tests/db_simple_test.ts`

```ts
import { assertEquals, assert, assertNotEquals } from "@std/assert";

import { db } from "../src/fake/fake-mod.ts";

Deno.test({
  name: "DB Simple - Tratamento de _id ('auto', '0990', com prefixo)",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // CORREÇÃO: Utilizando um nome de banco isolado para o teste para evitar choque de instâncias no IndexedDB fake
    const store = db("LOJA_TEST_1", "clientes", "CLI_");
    await store.clear();

    // 1. _id: "auto"
    const keyAuto = await store.set({ _id: "auto", name: "Alice", level: 1 });
    assert(keyAuto.startsWith("CLI_"));
    const itemAuto = await store.get<any>(keyAuto);
    assert(itemAuto !== undefined);
    assertNotEquals(itemAuto?._id, "auto");
    assertEquals(itemAuto?.name, "Alice");

    // 2. _id: "0990"
    const key0990 = await store.set({ _id: "0990", name: "Bob", level: 2 });
    assertEquals(key0990, "CLI_0990");
    const item0990 = await store.get<any>("0990");
    assertEquals(item0990?._id, "0990");
    assertEquals(item0990?.name, "Bob");

    // 3. _id: "CLI_0990" (com prefixo pré-existente)
    const keyPref = await store.set({ _id: "CLI_0990", name: "Bob Atualizado", level: 3 });
    assertEquals(keyPref, "CLI_0990");
    const itemPref = await store.get<any>("0990");
    assertEquals(itemPref?.name, "Bob Atualizado");
  },
});

Deno.test({
  name: "DB Simple - CRUD, Patch e Métodos de Coleção",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // CORREÇÃO: Isolando o banco para não colidir com o teste anterior
    const store = db("LOJA_TEST_2", "produtos", "PROD_");
    await store.clear();

    await store.set("p1", { name: "Notebook", price: 3000 });
    const p1 = await store.get<any>("p1");
    assertEquals(p1?.name, "Notebook");

    const patched = await store.patch<any>("p1", { price: 3200 });
    assertEquals(patched.price, 3200);

    await store.setMany([
      ["p2", { name: "Mouse", price: 80 }],
      ["p3", { name: "Teclado", price: 200 }],
    ]);

    const items = await store.getMany<any>(["p1", "p2", "p3"]);
    assertEquals(items.length, 3);

    const keys = await store.keys();
    assert(keys.includes("PROD_p1"));

    await store.delete("p1");
    assertEquals(await store.get("p1"), undefined);

    await store.deleteMany(["p2", "p3"]);
    assertEquals((await store.keys()).length, 0);
  },
});

Deno.test({
  name: "DB Simple - ImportDB e ExportDB com Respeito ao Escopo/Prefixo",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // CORREÇÃO: Isolando o banco de dados
    const store = db("LOJA_TEST_3", "estoque", "EST_");
    await store.clear();

    const mockData = {
      EST_e1: { item: "Parafuso", qty: 100 },
      EST_e2: { item: "Porca", qty: 200 },
    };

    await store.importDB(mockData, true);

    const exported = await store.exportDB();
    assertEquals(exported, mockData);

    const values = await store.values<any>();
    assertEquals(values.length, 2);
  },
});
```

---

## Arquivo: `monorepo/worker-db/tests/db_advanced_test.ts`

```ts
import { assertEquals, assert, assertRejects, assertNotEquals } from "@std/assert";

import { db } from "../src/fake/fake-mod.ts";

Deno.test({
  name: "DB Advanced - Execução de Métodos de Array no Worker (query, getSome)",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const store = db("FINANCAS", "faturas", "FAT_");
    await store.clear();

    await store.importDB({
      FAT_f1: { tag: "work", amount: 150, status: "paid", code: "x" },
      FAT_f2: { tag: "personal", amount: 300, status: "pending", code: "y" },
      FAT_f3: { tag: "work", amount: 500, status: "paid", code: "z" },
      FAT_f4: { tag: "home", amount: 80, status: "pending", code: "w" },
      FAT_f5: { tag: "work", amount: 200, status: "paid", code: "k" },
    });

    // Valida execução de funções avançadas dentro do Worker de Banco de Dados
    const result = await store.query((items: any[]) => {
      return {
        count: items.length, // length
        total: items.reduce((acc: number, i: any) => acc + i.amount, 0), // reduce
        firstWork: items.find((i: any) => i.tag === "work"), // find
        lastWork: items.findLast((i: any) => i.tag === "work"), // findLast
        lastItem: items.at(-1), // at
        hasPending: items.some((i: any) => i.status === "pending"), // some
        allPositive: items.every((i: any) => i.amount > 0), // every
        tagsHaveHome: items.map((i: any) => i.tag).includes("home"), // map e includes
        idxPersonal: items.findIndex((i: any) => i.tag === "personal"), // findIndex
        lastIdxWork: items.findLastIndex((i: any) => i.tag === "work"), // findLastIndex
        indexOfZ: items.map((i: any) => i.code).indexOf("z"), // indexOf
        paidItems: items.filter((i: any) => i.status === "paid"), // filter
        sliced: items.slice(1, 4), // slice
        sortedByAmount: items.toSorted((a: any, b: any) => a.amount - b.amount), // toSorted
        reversed: items.toReversed(), // toReversed
        spliced: items.toSpliced(0, 2), // toSpliced
      };
    });

    assertEquals(result.count, 5);
    assertEquals(result.total, 1230);
    assertEquals((result.firstWork as any).amount, 150);
    assertEquals((result.lastWork as any).amount, 200);
    assertEquals((result.lastItem as any).code, "k");
    assert(result.hasPending);
    assert(result.allPositive);
    assert(result.tagsHaveHome);
    assertEquals(result.idxPersonal, 1);
    assertEquals(result.lastIdxWork, 4);
    assertEquals(result.indexOfZ, 2);
    assertEquals(result.paidItems.length, 3);
    assertEquals(result.sliced.length, 3);
    assertEquals((result.sortedByAmount[0] as any).amount, 80);
    assertEquals((result.reversed[0] as any).code, "k");
    assertEquals(result.spliced.length, 3);
  },
});

Deno.test({
  name: "DB Advanced - Erros em tempo de execução no Worker (Retornos Inválidos)",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const store = db("ERROS_WORKER", "testes", "ERR_");
    await store.clear();
    await store.set("1", { valid: true });

    // AssertRejects captura os throw Exceptions disparados lá no switch(command) do worker
    await assertRejects(
      async () => await store.getSome(() => ({ obj: "invalid" } as any)),
      Error,
      "A função injetada em GET_SOME deve retornar um Array."
    );

    await assertRejects(
      async () => await store.delSome(() => false as any),
      Error,
      "A função injetada em DEL_SOME deve retornar um Array."
    );

    await assertRejects(
      async () => await store.setSome(() => "string" as any, (i: any) => i),
      Error,
      "A função de seleção em SET_SOME deve retornar um Array."
    );
  }
});

Deno.test({
  name: "DB Advanced - Transformações de Tipo, UPPERCASE e Exclusão Segura no Worker",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const store = db("EMPRESA", "funcionarios", "EMP_");
    await store.clear();

    await store.importDB({
      EMP_e10: { name: "joão silva", department: "tecnologia", level: 2, active: true },
      EMP_e20: { name: "maria souza", department: "rh", level: 3, active: true },
      EMP_e30: { name: "pedro alves", department: "vendas", level: 1, active: false },
    });

    // Atualiza nome para UPPERCASE e converte 'level' (number) para string
    await store.setSome(
      (items: any[]) => items.filter((item: any) => item.active === true),
      (item: any) => ({
        ...item,
        name: item.name.toUpperCase(),
        department: item.department.toUpperCase(),
        level: String(item.level) // Mutação de tipo!
      })
    );

    const e10 = await store.get<any>("e10");
    assertEquals(e10?.name, "JOÃO SILVA");
    assertEquals(e10?.department, "TECNOLOGIA");
    assertEquals(typeof e10?.level, "string");
    assertEquals(e10?.level, "2");

    const e30 = await store.get<any>("e30");
    assertEquals(e30?.department, "vendas"); // Permanece em lowercase
    assertEquals(typeof e30?.level, "number"); // Permanece tipo número

    // Exclui funcionários inativos via delSome
    await store.delSome((items: any[]) => items.filter((i: any) => i.active === false));
    
    // Checa deleção correta
    assertEquals(await store.get("e30"), undefined);
    const remainingKeys = await store.keys();
    assertEquals(remainingKeys.length, 2);
    
    // Assegura integridade dos que ficaram
    const remaining = await store.values<any>();
    assertNotEquals(remaining[0].name, "pedro alves");
  },
});
```

---

## Arquivo: `monorepo/worker-db/tests/ls_advanced_test.ts`

```ts
import { assertEquals, assert, assertThrows, assertNotEquals } from "@std/assert";
import { ls } from "../src/fake/fake-mod.ts";

Deno.test({
  name: "LS Advanced - Execução de Métodos Modernos de Array JS (query, getSome)",
  fn() {
    const store = ls("LS_FINANCAS_");
    store.clear();

    store.importLS({
      LS_FINANCAS_f1: { tag: "work", amount: 150, status: "paid", code: "x" },
      LS_FINANCAS_f2: { tag: "personal", amount: 300, status: "pending", code: "y" },
      LS_FINANCAS_f3: { tag: "work", amount: 500, status: "paid", code: "z" },
      LS_FINANCAS_f4: { tag: "home", amount: 80, status: "pending", code: "w" },
      LS_FINANCAS_f5: { tag: "work", amount: 200, status: "paid", code: "k" },
    });

    // Valida execução de funções avançadas síncronas de Array
    const result = store.query((items: any[]) => {
      return {
        count: items.length, // length
        total: items.reduce((acc: number, i: any) => acc + i.amount, 0), // reduce
        firstWork: items.find((i: any) => i.tag === "work"), // find
        lastWork: items.findLast((i: any) => i.tag === "work"), // findLast
        lastItem: items.at(-1), // at
        hasPending: items.some((i: any) => i.status === "pending"), // some
        allPositive: items.every((i: any) => i.amount > 0), // every
        tagsHaveHome: items.map((i: any) => i.tag).includes("home"), // map e includes
        idxPersonal: items.findIndex((i: any) => i.tag === "personal"), // findIndex
        lastIdxWork: items.findLastIndex((i: any) => i.tag === "work"), // findLastIndex
        indexOfZ: items.map((i: any) => i.code).indexOf("z"), // indexOf
        paidItems: items.filter((i: any) => i.status === "paid"), // filter
        sliced: items.slice(1, 4), // slice
        sortedByAmount: items.toSorted((a: any, b: any) => a.amount - b.amount), // toSorted
        reversed: items.toReversed(), // toReversed
        spliced: items.toSpliced(0, 2), // toSpliced
      };
    });

    assertEquals(result.count, 5);
    assertEquals(result.total, 1230);
    assertEquals((result.firstWork as any).amount, 150);
    assertEquals((result.lastWork as any).amount, 200);
    assertEquals((result.lastItem as any).code, "k");
    assert(result.hasPending);
    assert(result.allPositive);
    assert(result.tagsHaveHome);
    assertEquals(result.idxPersonal, 1);
    assertEquals(result.lastIdxWork, 4);
    assertEquals(result.indexOfZ, 2);
    assertEquals(result.paidItems.length, 3);
    assertEquals(result.sliced.length, 3);
    assertEquals((result.sortedByAmount[0] as any).amount, 80);
    assertEquals((result.reversed[0] as any).code, "k");
    assertEquals(result.spliced.length, 3);

    store.clear();
  }
});

Deno.test({
  name: "LS Advanced - Erros de Tipagem Síncronos (Retornos Inválidos)",
  fn() {
    const store = ls("LS_ERROS_");
    store.clear();
    store.set("1", { valid: true });

    // AssertThrows captura as exceções síncronas disparadas pelo wrapper ls()
    assertThrows(
      () => store.getSome(() => ({ obj: "invalid" } as any)),
      Error,
      "A função em getSome deve retornar um Array."
    );

    assertThrows(
      () => store.delSome(() => false as any),
      Error,
      "A função em delSome deve retornar um Array."
    );

    assertThrows(
      () => store.setSome(() => "string" as any, (i: any) => i),
      Error,
      "A função de seleção em setSome deve retornar um Array."
    );

    store.clear();
  }
});

Deno.test({
  name: "LS Advanced - Transformações de Tipo, Mutação em Massa e Exclusão Segura",
  fn() {
    const store = ls("LS_EMPRESA_");
    store.clear();

    store.importLS({
      LS_EMPRESA_e10: { name: "joão silva", department: "tecnologia", level: 2, active: true },
      LS_EMPRESA_e20: { name: "maria souza", department: "rh", level: 3, active: true },
      LS_EMPRESA_e30: { name: "pedro alves", department: "vendas", level: 1, active: false },
    });

    // Atualiza nome para UPPERCASE e converte 'level' (number) para string
    store.setSome(
      (items: any[]) => items.filter((item: any) => item.active === true),
      (item: any) => ({
        ...item,
        name: item.name.toUpperCase(),
        department: item.department.toUpperCase(),
        level: String(item.level) // Mutação de tipo explícita!
      })
    );

    const e10 = store.get<any>("e10");
    assertEquals(e10?.name, "JOÃO SILVA");
    assertEquals(e10?.department, "TECNOLOGIA");
    assertEquals(typeof e10?.level, "string");
    assertEquals(e10?.level, "2");

    const e30 = store.get<any>("e30");
    assertEquals(e30?.department, "vendas"); // Permanece em lowercase pois active=false
    assertEquals(typeof e30?.level, "number"); // Permanece tipo número

    // Exclui funcionários inativos via delSome
    store.delSome((items: any[]) => items.filter((i: any) => i.active === false));
    
    // Checa deleção correta
    assertEquals(store.get("e30"), undefined);
    const remainingKeys = store.keys();
    assertEquals(remainingKeys.length, 2);
    
    // Assegura integridade dos que ficaram
    const remaining = store.values<any>();
    assertNotEquals(remaining[0].name, "pedro alves");

    store.clear();
  }
});
```

---

## Arquivo: `monorepo/worker-db/tests/ls_simple_test.ts`

```ts
import { assertEquals, assert, assertNotEquals } from "@std/assert";
import { ls } from "../src/fake/fake-mod.ts";

Deno.test({
  name: "LS Simple - Gestão de _id ('auto', '0990', com prefixo)",
  fn() {
    const store = ls("LS_PRE_");
    store.clear();

    // 1. Geração automática com _id: "auto"
    const autoKey = store.set({ _id: "auto", name: "Item Auto", type: "system" });
    assert(autoKey.startsWith("LS_PRE_"), "A chave gerada automaticamente deve conter o prefixo do banco");

    // O _id retornado no objeto deve ter o prefixo removido pelo formatDbItem
    const fetchedAuto = store.get<any>(autoKey);
    assert(fetchedAuto !== undefined);
    assertNotEquals(fetchedAuto._id, "auto", "O _id 'auto' deve ter sido substituído por um UUID ou Hash");
    assertEquals(autoKey, `LS_PRE_${fetchedAuto._id}`);
    assertEquals(fetchedAuto.name, "Item Auto");

    // 2. Definindo chave customizada via parâmetro direto
    const customKey = store.set("0990", { name: "Item Fixo", type: "user" });
    assertEquals(customKey, "LS_PRE_0990");

    // A busca aceita tanto a chave simples quanto a formatada (resolveKey cuida disso)
    const fetchedCustom = store.get<any>("0990");
    assertEquals(fetchedCustom._id, "0990");
    assertEquals(fetchedCustom.name, "Item Fixo");

    // 3. Salvando passando um objeto que já possui o prefixo no _id
    const keyPref = store.set({ _id: "LS_PRE_0991", name: "Item Fixo 2", type: "user" });
    assertEquals(keyPref, "LS_PRE_0991");
    const fetchedPref = store.get<any>("0991");
    assertEquals(fetchedPref.name, "Item Fixo 2");

    store.clear();
  }
});

Deno.test({
  name: "LS Simple - CRUD Básico, Patch e Iteradores (keys, values, entries)",
  fn() {
    const store = ls("LS_CRUD_");
    store.clear();

    // Create / Read
    store.set("user1", { name: "Carlos", age: 30 });
    let user = store.get<any>("user1");
    assertEquals(user.name, "Carlos");

    // Update Parcial (Patch)
    const patchedUser = store.patch("user1", { age: 31 });
    assertEquals(patchedUser.age, 31);
    
    user = store.get<any>("user1");
    assertEquals(user.age, 31);

    // Operações em Lote (setMany, getMany)
    store.setMany([
      ["user2", { name: "Ana" }],
      ["user3", { name: "Beatriz" }]
    ]);

    const users = store.getMany<any>(["user1", "user2", "user3"]);
    assertEquals(users.length, 3);
    assertEquals(users[1]?.name, "Ana");

    // Testando Iteradores (keys, values, entries)
    const allKeys = store.keys();
    assertEquals(allKeys.length, 3);
    assert(allKeys.includes("LS_CRUD_user1"));

    const allValues = store.values<any>();
    assertEquals(allValues.length, 3);
    assert(allValues.some((v: any) => v._id === "user2" && v.name === "Ana")); // Valida se formatDbItem agiu nos values

    const allEntries = store.entries<any>();
    assertEquals(allEntries.length, 3);
    const firstEntry = allEntries.find(([k]: [string, any]) => k === "LS_CRUD_user3");
    assert(firstEntry !== undefined);
    assertEquals(firstEntry[1].name, "Beatriz");

    // Delete
    store.delete("user1");
    assertEquals(store.get("user1"), undefined);
    assertEquals(store.keys().length, 2);

    store.deleteMany(["user2", "user3"]);
    assertEquals(store.keys().length, 0);

    store.clear();
  }
});

Deno.test({
  name: "LS Simple - Import e Export com Respeito ao Escopo/Prefixo",
  fn() {
    const store = ls("LS_EXP_");
    store.clear();

    const mockData = {
      LS_EXP_k1: { v: 1, label: "A" },
      LS_EXP_k2: { v: 2, label: "B" },
    };

    store.importLS(mockData, true);

    const exported = store.exportLS();
    assertEquals(exported, mockData);

    const values = store.values<any>();
    assertEquals(values.length, 2);
    assertEquals(values.find((i: any) => i._id === "k1")?.v, 1);

    store.clear();
  }
});
```

---

## Arquivo: `monorepo/worker-db/tests/opfs_and_isolation_test.ts`

```ts
import { assertEquals, assert } from "@std/assert";

import { db, ls } from "../src/fake/fake-mod.ts";
import { FakeOPFSDirectory } from "../src/fake/fake-opfs.ts";

Deno.test({
  name: "ISOLATION - LS: Garantir que instâncias com prefixos diferentes não colidam",
  sanitizeOps: false,
  sanitizeResources: false,
  fn() {
    const storeA = ls("APP_A_");
    const storeB = ls("APP_B_");
    
    storeA.clear();
    storeB.clear();

    storeA.set("1", { data: "from A" });
    storeB.set("1", { data: "from B" });

    assertEquals(storeA.get<any>("1")?.data, "from A");
    assertEquals(storeB.get<any>("1")?.data, "from B");

    storeA.clear();
    assertEquals(storeA.keys().length, 0);
    assertEquals(storeB.keys().length, 1);
    assertEquals(storeB.get<any>("1")?.data, "from B");
  }
});

db.init(new URL("../build/worker-db.js", import.meta.url));

Deno.test({
  name: "ISOLATION - DB: Garantir que instâncias no mesmo Store, com prefixos diferentes, são isoladas",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const dbApp1 = db("SHARED_DB", "keyval", "APP_1_");
    const dbApp2 = db("SHARED_DB", "keyval", "APP_2_");

    await dbApp1.clear();
    await dbApp2.clear();

    await dbApp1.set("config", { theme: "dark" });
    await dbApp2.set("config", { theme: "light" });

    const app1Vals = await dbApp1.values<any>();
    assertEquals(app1Vals.length, 1);
    assertEquals(app1Vals[0].theme, "dark");

    const exportApp2 = await dbApp2.exportDB();
    assert(Object.keys(exportApp2).includes("APP_2_config"));
    assert(!Object.keys(exportApp2).includes("APP_1_config"));

    await dbApp1.clear();
    assertEquals((await dbApp1.keys()).length, 0);
    
    const app2Keys = await dbApp2.keys();
    assertEquals(app2Keys.length, 1);
    assertEquals(app2Keys[0], "APP_2_config");
  }
});

Deno.test({
  name: "OPFS - Fluxo completo de Backup e Restore (DB e LS)",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    FakeOPFSDirectory.clear();
    const store = db("OPFS_DB", "test", "BACKUP_");
    await store.clear();

    await store.set("k1", { text: "Hello OPFS" });
    await store.set("k2", { text: "Loco PWA" });

    const fileName = await store.backupToOpfs("meu_backup.json");
    assert(fileName.includes("BACKUP_")); 
    assert(fileName.includes("meu_backup.json"));

    await store.clear();
    assertEquals((await store.keys()).length, 0);

    await store.restoreFromOpfs(fileName);
    const restored = await store.values<any>();
    assertEquals(restored.length, 2);
    
    const k1 = await store.get<any>("k1");
    assertEquals(k1?.text, "Hello OPFS");
    
    FakeOPFSDirectory.clear();
  }
});
```

---

## Arquivo: `monorepo/worker-db/tests/main.test.ts`

```ts
import { assertEquals, assert } from "@std/assert";
import { gerarId, validarId } from "../src/utils/id-utils.ts";
import { db, ls } from "../src/fake/fake-mod.ts";

Deno.test("MAIN - Validação de Utilitários de ID e Integração Global", () => {
  const id = gerarId();
  assert(id.length > 0);

  const isValid = validarId(id);
  assertEquals(isValid, true);

  const dbInstance = db("MAIN_DB", "main");
  assert(dbInstance !== undefined);

  const lsInstance = ls("MAIN_LS_");
  assert(lsInstance !== undefined);
});
```

---

## Arquivo: `monorepo/worker-db/tests/worker_lifecycle_test.ts`

```ts
import { assertEquals } from "@std/assert";
import { db } from "../src/fake/fake-mod.ts";

const isFake = true;

Deno.test({
  name: "LIFECYCLE - Inicialização, Terminação, Restart e Persistência do Worker",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const store = db("WORKER_LIFECYCLE_DB", "state", "LC_");
    await store.clear();

    await store.set("status", { alive: true, phase: "init" });
    let result = await store.get<any>("status");
    assertEquals(result?.alive, true);

    db.terminate();

    await store.set("status", { alive: true, phase: "healed" });
    result = await store.get<any>("status");
    assertEquals(result?.phase, "healed");

    // O restart vai recriar o Worker utilizando o último caminho válido 
    // (que é o fake-db.ts garantido pelo nosso fake-mod.ts)
    db.restart();
    
    if (!isFake) {
       // Lógica isolada para cenários não-falsos, caso necessário
    }
    
    await store.patch<any>("status", { phase: "restarted" });
    result = await store.get<any>("status");
    assertEquals(result?.phase, "restarted", "Worker recriado pelo restart() falhou");

    db.terminate();
  }
});

Deno.test({
  name: "LIFECYCLE - Comportamento com requisições disparadas imediatamente após restart",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const store = db("WORKER_LIFECYCLE_DB", "stress", "STRESS_");
    
    db.restart();
    
    await store.set("k1", { val: 1 });
    await store.set("k2", { val: 2 });
    
    const keys = await store.keys();
    assertEquals(keys.length, 2);
    
    await store.clear();
    db.terminate();
  }
});
```

---

## Arquivo: `monorepo/worker-db/example/demo.ts`

```ts
import { db, ls } from "../src/fake/fake-mod.ts";

// Tipagem dos modelos de domínio do Loco PWA
interface LocoMessage {
  _id?: string;
  senderId: string;
  recipientId: string;
  content: string;
  status: "pending" | "sent" | "delivered";
  timestamp: number;
}

async function runLocoDbDemo() {
  console.log("🚀 [Loco PWA] Iniciando demonstração do WORKER-DB...\n");

  // Garante que o ambiente inicie limpo para a demonstração
  ls().clear();

  // -------------------------------------------------------------
  // 1. LOCALSTORAGE: Geração Automática de IDs (_id: "auto")
  // -------------------------------------------------------------
  console.log("📦 1. LocalStorage - Criando itens com _id 'auto'...");
  const prefStore = ls("LOCO_PREF_");

  const autoKey1 = prefStore.set({ _id: "auto", theme: "dark", notifications: true });
  const autoKey2 = prefStore.set({ _id: "auto", theme: "light", notifications: false });

  console.log(`   --> Item 1 gerado: Chave = ${autoKey1}`);
  console.log(`   --> Recuperando Item 1 (notem que '_id' volta limpo):`, prefStore.get(autoKey1));
  console.log(`   --> Recuperando Item 2:`, prefStore.get(autoKey2));


  // -------------------------------------------------------------
  // 2. LOCALSTORAGE: Isolamento de Escopos por Prefixo
  // -------------------------------------------------------------
  console.log("\n🔒 2. LocalStorage - Testando Isolamento de Prefixos...");
  const authStore = ls("LOCO_AUTH_");
  
  // Gravando uma chave fixa (ex: sessão)
  authStore.set("session_token", { token: "abc-123", active: true });
  
  console.log(`   --> Total de itens em LOCO_PREF_ (Preferências): ${prefStore.keys().length}`);
  console.log(`   --> Total de itens em LOCO_AUTH_ (Autenticação): ${authStore.keys().length}`);


  // -------------------------------------------------------------
  // 3. LOCALSTORAGE: Consulta Global (Prefixo nulo)
  // -------------------------------------------------------------
  console.log("\n🌍 3. LocalStorage - Visão Global (Sem prefixo)...");
  
  // Instanciando o `ls` sem parâmetros nos dá acesso a TODO o localStorage
  const globalStore = ls(); 
  const allKeys = globalStore.keys();
  
  console.log(`   --> Total de itens armazenados em TODA a aplicação: ${allKeys.length}`);
  console.log(`   --> Chaves globais detectadas:`, allKeys);
  console.log(`   --> Realizando leitura global do token:`, globalStore.get("LOCO_AUTH_session_token"));


  // -------------------------------------------------------------
  // 4. WORKER DB: Fila de Mensagens Offline com Geração de ID
  // -------------------------------------------------------------
  console.log("\n💬 4. IndexedDB Worker - Enfileirando Mensagens Offline...");
  
  // Lembrete: O DB() roda em background assíncrono (Web Worker)
  const msgStore = db("LOCO_DATA", "messages", "MSG_");
  await msgStore.clear();

  const msgId1 = await msgStore.set<LocoMessage>({
    _id: "auto",
    senderId: "user_alice",
    recipientId: "user_bob",
    content: "Olá! Esta mensagem foi enfileirada offline.",
    status: "pending",
    timestamp: Date.now(),
  });

  const msgId2 = await msgStore.set<LocoMessage>({
    _id: "auto",
    senderId: "user_alice",
    recipientId: "user_bob",
    content: "Esperando o Handshake com o servidor...",
    status: "pending",
    timestamp: Date.now() + 1000,
  });

  console.log(`   --> Mensagens injetadas no IndexedDB. Keys geradas: ${msgId1}, ${msgId2}`);


  // -------------------------------------------------------------
  // 5. WORKER DB: Consultas Avançadas (Background Processing)
  // -------------------------------------------------------------
  console.log("\n⚙️ 5. IndexedDB Worker - Mutações Assíncronas...");

  // Contagem feita DIRETAMENTE na thread do Worker, sem trafegar o array gigante para a Main Thread
  const pendingCount = await msgStore.query<LocoMessage, number>((items) => {
    return items.filter((m) => m.status === "pending").length;
  });
  console.log(`   --> Total pendente (calculado remotamente): ${pendingCount}`);

  // Atualização em massa: simula o Service Worker alterando tudo após conectar na rede
  await msgStore.setSome<LocoMessage>(
    (items) => items.filter((m) => m.status === "pending"),
    (item) => ({ ...item, status: "sent" })
  );

  const updatedMessages = await msgStore.values<LocoMessage>();
  console.log("   --> Estado das mensagens após envio simulado:", updatedMessages);

  // Limpa o ambiente antes de fechar para garantir finalização limpa do processo Deno
  db.terminate();
  console.log("\n✅ Demonstração finalizada. Worker encerrado.");
}

// Executar
runLocoDbDemo();
```

---

## Arquivo: `monorepo/worker-db/example/index.html`

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Loco PWA - WorkerDB Demo</title>
  
  <!-- Favicon gerado nativamente via SVG in-line (zero requisições ao servidor) -->
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%239edeb6'/><text x='50' y='68' font-size='50' font-family='system-ui, sans-serif' font-weight='bold' text-anchor='middle' fill='%231a1c19'>L</text></svg>">

  <style>
    :root {
      --md-sys-color-background: #1a1c19;
      --md-sys-color-on-background: #e2e3dd;
      --md-sys-color-primary: #9edeb6;
      --md-sys-color-surface: #2d312d;
    }
    
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background-color: var(--md-sys-color-background);
      color: var(--md-sys-color-on-background);
      margin: 0;
      padding: 24px;
      line-height: 1.6;
    }

    h1 { color: var(--md-sys-color-primary); }
    
    #app { max-width: 800px; margin: 0 auto; }

    .console-card {
      background-color: var(--md-sys-color-surface);
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
      overflow-x: auto;
    }

    pre {
      font-family: 'Courier New', Courier, monospace;
      font-size: 14px;
      color: #b5e8b0;
      margin: 0;
      white-space: pre-wrap;
    }
  </style>
</head>
<body class="dark">
  <div id="app">
    <h1>Loco PWA - Testes Reais (IndexedDB)</h1>
    <p>Os testes abaixo comprovam a integração <strong>Offline-First</strong> executada assincronamente através de um Web Worker. Sem bloquear a UI!</p>
    
    <div class="console-card">
      <pre id="log-output">Aguardando execução do main.ts...</pre>
    </div>
  </div>
  
  <!-- Arquivo gerado pelo deno bundle no nosso server.ts -->
  <script type="module" src="./main.js"></script>
</body>
</html>
```

---

## Arquivo: `monorepo/worker-db/example/sw.ts`

```ts
/// <reference lib="webworker" />

// ⚠️ IMPORTANTE: Importamos exclusivamente de db-sw.ts para não invocar Web Workers secundários!
import { db } from "../src/db-sw.ts";
import { listOpfsFiles } from "../src/utils/opfs_utils.ts";

const sw = self as unknown as ServiceWorkerGlobalScope;

// Força a instalação imediata do SW
sw.addEventListener("install", (event) => {
  sw.skipWaiting();
});

// Assume o controle de todas as páginas abertas imediatamente
sw.addEventListener("activate", (event) => {
  event.waitUntil(sw.clients.claim());
});

// Escuta comandos vindos da Main Thread (main.ts)
sw.addEventListener("message", async (event) => {
  if (event.data && event.data.type === "RUN_SW_DEMO") {
    try {
      // 1. Instancia o banco diretamente na thread do SW
      const msgStore = db("LOCO_DATA", "messages", "MSG_");

      // 2. Insere um dado no IndexedDB
      const insertedId = await msgStore.set("auto", {
        senderId: "system_sw",
        recipientId: "all",
        content: "Mensagem gravada diretamente pelo Service Worker!",
        status: "delivered",
        priority: 99,
        timestamp: Date.now()
      });

      // 3. Realiza a contagem dos dados
      const allMessages = await msgStore.values();

      // 4. Executa um Backup OPFS na pasta /backup
      const backupName = await msgStore.backupToOpfs("sw_auto_backup.json");
      const opfsFiles = await listOpfsFiles();

      // 5. Devolve a resposta para a Main Thread via MessageChannel
      event.ports[0]?.postMessage({
        success: true,
        payload: {
          insertedId,
          totalMessages: allMessages.length,
          backupName,
          opfsFiles
        }
      });
    } catch (error) {
      event.ports[0]?.postMessage({
        success: false,
        error: (error as Error).message
      });
    }
  }
});
```

---

## Arquivo: `monorepo/worker-db/example/server.ts`

```ts
import { serveDir } from "@std/http/file-server";
import { ensureDir } from "@std/fs";

const clean = async () => {
  try {
    await Deno.remove("./build", { recursive: true });
    console.log("📁 Arquivos anteriores excluídos");
  } catch {
    // diretório não existe, ok
  }
  await ensureDir("./build");
};

async function prepareAndBuild() {
  const startTime = performance.now();
  
  console.log("🔨 [DEV SERVER] Preparando ambiente...");
  await clean();

  // 1. Faz o bundle do index.html (Main Thread)
  console.log("📦 [DEV SERVER] Fazendo bundle do index.html...");
  // @ts-ignore: A tipagem de Deno.bundle não está presente nas definições padrão, mas funciona no runtime.
  const result_html = await Deno.bundle({
    entrypoints: ["./example/index.html"],
    outputDir: "./build",
    platform: "browser",
    format: "esm",
    packages: "external",
    keepnames: true,
    inlineImports: true,
    codeSplitting: false,
    minify: false,
    sourcemap: "linked",
    write: true,
  });

  if (!result_html.success) throw new Error("Falha ao gerar bundle do HTML.");

  // 2. Compilação do Worker da aplicação (Web Worker)
  console.log("⚙️ Gerando bundle do Worker DB...");
  // @ts-ignore
  const result_worker = await Deno.bundle({
    entrypoints: ["./src/db.ts"],
    outputPath: "./build/worker-db.js",
    platform: "browser",
    format: "esm", 
    packages: "external",
    keepnames: true,
    inlineImports: true,
    codeSplitting: false,
    minify: false,
    sourcemap: "linked",
    write: true,
  });

  if (!result_worker.success) throw new Error("Falha ao gerar bundle do Worker.");

  // 3. Compilação do Service Worker (Sincronização / Background)
  console.log("🔄 Gerando bundle do Service Worker...");
  // @ts-ignore
  const result_sw = await Deno.bundle({
    entrypoints: ["./example/sw.ts"],
    outputPath: "./build/sw.js", // Fica na raiz do servidor para controlar todas as rotas
    platform: "browser",
    format: "esm", 
    packages: "external",
    keepnames: true,
    inlineImports: true,
    codeSplitting: false,
    minify: false,
    sourcemap: "linked",
    write: true,
  });

  if (!result_sw.success) throw new Error("Falha ao gerar bundle do Service Worker.");

  const endTime = performance.now();
  console.log(`✅ [DEV SERVER] Build concluído com sucesso em ${(endTime - startTime).toFixed(2)}ms!`);
}

await prepareAndBuild();

console.log(`\n🚀 Servidor estático rodando em: http://localhost:9000`);
console.log("   Disponibilizando o diretório: ./build/");

Deno.serve({ port: 9000 }, (req) => {
  return serveDir(req, {
    fsRoot: "./build/",
    showDirListing: true,
    enableCors: true,
  });
});
```

---

## Arquivo: `monorepo/worker-db/example/main.ts`

```ts
import { db, ls, listOpfsFiles, deleteFromOpfs, getFileFromOpfs } from "../src/mod.ts";

interface LocoMessage {
  _id?: string;
  senderId: string;
  recipientId: string;
  content: string;
  status: "pending" | "sent" | "delivered" | "read";
  priority: number;
  timestamp: number;
}

interface UserPreferences {
  _id?: string; 
  theme: "dark" | "light";
  notificationsEnabled: boolean;
  activeChatId: string | null;
}

const appElement = document.getElementById("app");
const logElement = document.getElementById("log-output");

function log(msg: string, data?: any) {
  const dataStr = data ? `\n  ↳ ${JSON.stringify(data, null, 2)}` : "";
  const fullText = `${msg}${dataStr}\n`;
  
  if (logElement) {
    if (logElement.innerText.includes("Aguardando execução")) {
      logElement.innerText = "";
    }
    logElement.innerText += fullText;
  }
  console.log(msg, data || ""); 
}

async function runRealWorldTests() {
  log("🚀 INICIANDO DEMONSTRAÇÃO AVANÇADA DO LOCO PWA (AMBIENTE REAL)\n");
  
  ls().clear();
  db.init();

  log("📦 1. LocalStorage - Escopos e Prefixos...");
  const prefStore = ls("LOCO_PREF_");
  prefStore.set<UserPreferences>({ _id: "auto", theme: "dark", notificationsEnabled: true, activeChatId: "chat_1" });
  log(`   --> Total de chaves isoladas de Preferências: ${prefStore.keys().length}`);

  log("\n💬 2. IndexedDB Worker - Populando Fila de Mensagens...");
  const msgStore = db("LOCO_DATA", "messages", "MSG_");
  await msgStore.clear();

  const now = Date.now();
  await msgStore.setMany([
    ["auto", { senderId: "alice", recipientId: "bob", content: "Oi!", status: "delivered", priority: 1, timestamp: now - 5000 }],
    ["auto", { senderId: "alice", recipientId: "bob", content: "Tudo bem?", status: "pending", priority: 1, timestamp: now - 4000 }],
  ]);
  log(`   --> Total de mensagens injetadas com UUIDs gerados com sucesso: ${(await msgStore.keys()).length}`);

  log("\n📊 3. IndexedDB Worker - Análises e Agregações Remotas (query)...");
  const stats = await msgStore.query<LocoMessage, any>((items) => ({
    totalPending: items.filter(i => i.status === "pending").length,
  }));
  log(`   --> Estatísticas processadas no Worker:`, stats);

  log("\n💾 4. Origin Private File System (OPFS) - Backup Nativo e Resgate...");
  const oldFiles = await listOpfsFiles();
  for (const f of oldFiles) await deleteFromOpfs(f);
  await msgStore.backupToOpfs("mensagens_v1.json");
  const storedFiles = await listOpfsFiles();
  log(`   --> Backups gerados com sucesso na pasta interna '/backup'.`);

  // -------------------------------------------------------------
  // 5. SERVICE WORKER: Comunicação e Uso do db-sw.ts
  // -------------------------------------------------------------
  log("\n🤖 5. Service Worker - Interação em Background (db-sw.ts)...");
  
  if ("serviceWorker" in navigator) {
    try {
      // Registra o SW na raiz
      await navigator.serviceWorker.register("/sw.js", { type: "module" });
      
      // Checa se o SW já assumiu o controle da página
      if (!navigator.serviceWorker.controller) {
        log(`   --> ⚠️ O Service Worker foi instalado. Pressione F5 (recarregar) para que ele assuma o controle da página.`);
      } else {
        log(`   --> Service Worker ativo e controlando a página! Solicitando operação remota...`);
        
        // Promessa para encapsular a resposta do Service Worker via MessageChannel
        const runSwTask = () => new Promise((resolve, reject) => {
          const channel = new MessageChannel();
          channel.port1.onmessage = (e) => {
            if (e.data.success) resolve(e.data.payload);
            else reject(new Error(e.data.error));
          };
          navigator.serviceWorker.controller!.postMessage({ type: "RUN_SW_DEMO" }, [channel.port2]);
        });

        const swResult = await runSwTask();
        log(`   --> ✅ Resultado retornado pelo Service Worker:`, swResult);
      }
    } catch (err) {
      log(`   ❌ Falha ao registrar o Service Worker:`, err);
    }
  }

  // Cria Links de Download na UI para OPFS
  const finalStoredFiles = await listOpfsFiles();
  if (appElement && finalStoredFiles.length > 0) {
    const downloadContainer = document.createElement("div");
    downloadContainer.style.marginTop = "24px";
    downloadContainer.style.padding = "16px";
    downloadContainer.style.backgroundColor = "var(--md-sys-color-surface)";
    downloadContainer.style.borderRadius = "12px";

    let linksHTML = `<h3 style="margin-top: 0; color: var(--md-sys-color-primary);">🗂️ Arquivos OPFS (Inclui backups do SW)</h3>`;
    linksHTML += `<div style="display: flex; flex-direction: column; gap: 12px;">`;
    
    for (const fileName of finalStoredFiles) {
      const fileBlob = await getFileFromOpfs(fileName);
      const objectUrl = URL.createObjectURL(fileBlob);
      linksHTML += `<a href="${objectUrl}" download="${fileName}" style="color: #1a1c19; background: #9edeb6; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-weight: bold; width: fit-content; font-size: 14px;">📥 Baixar: ${fileName}</a>`;
    }
    
    downloadContainer.innerHTML = linksHTML + `</div>`;
    appElement.appendChild(downloadContainer);
  }

  db.terminate();
  log("\n✅ Demonstração Completa Finalizada!");
}

runRealWorldTests().catch((err) => {
  log("❌ OCORREU UM ERRO FATAL:", err.message);
});
```

---

## Arquivo: `monorepo/worker-db/deno.jsonc`

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "dom.asynciterable",  "esnext", "deno.ns"],
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true
  },
  "imports": {
    "idb-keyval": "https://esm.sh/idb-keyval@6.2.1",
    "fake-indexeddb": "https://esm.sh/fake-indexeddb@6.2.5?bundle&target=es2022",
    "fake-indexeddb/auto": "https://esm.sh/fake-indexeddb@6.2.5/auto?bundle&target=es2022",

    "@std/assert": "jsr:@std/assert",
    "@std/fs": "jsr:@std/fs",
    "@std/http": "jsr:@std/http",
    "@std/path": "jsr:@std/path"
  },
  "tasks": {
    "build": "deno run -A --unstable-bundle build.ts",
    "test": "deno test --allow-env --allow-net --allow-read tests/",
    "check": "deno check build.ts src/**/*.ts src/**/*.tsx example/**/*.ts tests/**/*.ts",
    "tests": "deno task check && deno task test",
    "demo": "deno run --allow-env --allow-read --allow-net ./example/demo.ts",
    "example": "deno run -A --unstable-bundle ./example/server.ts"
  }
}
```

---

## Arquivo: `monorepo/worker-db/build.ts`

```ts
// build.ts
import { ensureDir } from "@std/fs";

const clean = async () => {
  try {
    await Promise.all([
      Deno.remove("../server/build/dist/worker-db.js"),
      Deno.remove("../server/build/dist/worker-db.js.map")
    ]);
    console.log("📁 Arquivo anterior excluído");
  } catch {
    // diretório não existe, ok
  }
  await ensureDir("../server/build/dist");
};

const build = async () => {
  console.log("🚀 Iniciando build do Worker DB ...");
  const startTime = performance.now();

  try {
    // 1. Garante que a pasta de destino exista
    await clean();

    // 2. Compilação do Worker da aplicação
    console.log("⚙️ Gerando bundle do Worker...");
    // @ts-ignore: A tipagem de Deno.bundle não está presente nas definições padrão, mas funciona no runtime deste projeto.
    const result = await Deno.bundle({
      entrypoints: ["./src/db.ts"],
      outputPath: "../server/build/dist/worker-db.js",
      platform: "browser",
      format: "esm", // Alterado para ESM para suportar { type: "module" } no Worker
      packages: "external",
      keepnames: true,
      inlineImports: true,
      codeSplitting: false,
      minify: false,
      sourcemap: "linked",
      write: true,
    });

    if (!result.success) {
      console.error(result.errors);
      throw new Error("Falha ao gerar bundle pelo compilador interno.");
    }

    for (const warning of result.warnings || []) {
      console.warn(warning);
    }

    const endTime = performance.now();
    console.log(`✅ Build concluído com sucesso em ${(endTime - startTime).toFixed(2)}ms!`);
    console.log("📁 Saída gerada no diretório: ../server/build/dist/");
  } catch (error) {
    console.error("❌ Erro fatal durante o processo de build:");
    console.error(error);
    Deno.exit(1);
  }
};

await build();
```

---

