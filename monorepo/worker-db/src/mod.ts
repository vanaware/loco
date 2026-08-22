// worker-db/mod.ts
import { gerarId, gerarIdComPrefixo, validarId } from "./utils/id-utils.ts";

export { gerarId, gerarIdComPrefixo, validarId };

let workerInstance: Worker | null = null;
const pendingRequests = new Map<string, { resolve: Function; reject: Function }>();

function getWorker(): Worker {
  if (!workerInstance) {
    const workerUrl = new URL("../build/worker-db.js", import.meta.url);
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
    const requestId = crypto.randomUUID();
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
}

export interface PaginateOptions extends DbStoreOptions {
  prefix?: string;
  offset?: number;
  limit?: number;
}

export interface PaginateResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

// Métodos Globais aceitando DbStoreOptions
export const db = {
  // Unitários
  get: <T>(key: string, opts?: DbStoreOptions) => exec<T>("GET", { key, ...opts }),
  set: <T>(key: string, val: T, opts?: DbStoreOptions) => exec<void>("SET", { key, val, ...opts }),
  
  update: async <T>(
    key: string, 
    updater: (val: T | undefined) => T, 
    opts?: DbStoreOptions
  ): Promise<void> => {
    const currentVal = await exec<T | undefined>("GET", { key, ...opts });
    const newVal = updater(currentVal);
    await exec<void>("SET", { key, val: newVal, ...opts });
  },

  delete: (key: string, opts?: DbStoreOptions) => exec<void>("DELETE", { key, ...opts }),

  // Em Lote
  getMany: <T>(keys: string[], opts?: DbStoreOptions) => exec<T[]>("GET_MANY", { keys, ...opts }),
  setMany: (entries: [string, any][], opts?: DbStoreOptions) => exec<void>("SET_MANY", { entries, ...opts }),
  deleteMany: (keys: string[], opts?: DbStoreOptions) => exec<void>("DEL_MANY", { keys, ...opts }),

  // Coleções
  keys: (opts?: DbStoreOptions) => exec<string[]>("KEYS", { ...opts }),
  values: <T>(opts?: DbStoreOptions) => exec<T[]>("VALUES", { ...opts }),
  entries: <T>(opts?: DbStoreOptions) => exec<[string, T][]>("ENTRIES", { ...opts }),
  clear: (opts?: DbStoreOptions) => exec<void>("CLEAR", { ...opts }),

  // Avançados
  getByPrefix: <T>(prefix: string, opts?: DbStoreOptions) => exec<T[]>("GET_BY_PREFIX", { prefix, ...opts }),
  deleteByPrefix: (prefix: string, opts?: DbStoreOptions) => exec<void>("DELETE_BY_PREFIX", { prefix, ...opts }),
  count: (prefix?: string, opts?: DbStoreOptions) => exec<number>("COUNT", { prefix, ...opts }),
  
  paginate: <T>(options: PaginateOptions = {}) => exec<PaginateResult<T>>("PAGINATE", options),

  exportDB: (opts?: DbStoreOptions) => exec<Record<string, any>>("EXPORT", { ...opts }),
  importDB: (data: Record<string, any>, clearFirst = false, opts?: DbStoreOptions) => 
    exec<void>("IMPORT", { data, clearFirst, ...opts }),

  // Lifecycle
  init: () => { getWorker(); }, 
  restart: () => restartWorker(),
  terminate: () => terminateWorker(),

  // 🎯 Fábrica para uso focado em um banco específico
  forDB: (dbName: string, storeName = "keyval") => {
    const opts: DbStoreOptions = { dbName, storeName };
    return {
      get: <T>(key: string) => db.get<T>(key, opts),
      set: <T>(key: string, val: T) => db.set<T>(key, val, opts),
      update: <T>(key: string, updater: (val: T | undefined) => T) => db.update<T>(key, updater, opts),
      delete: (key: string) => db.delete(key, opts),
      getMany: <T>(keys: string[]) => db.getMany<T>(keys, opts),
      setMany: (entries: [string, any][]) => db.setMany(entries, opts),
      deleteMany: (keys: string[]) => db.deleteMany(keys, opts),
      keys: () => db.keys(opts),
      values: <T>() => db.values<T>(opts),
      entries: <T>() => db.entries<T>(opts),
      clear: () => db.clear(opts),
      getByPrefix: <T>(prefix: string) => db.getByPrefix<T>(prefix, opts),
      deleteByPrefix: (prefix: string) => db.deleteByPrefix(prefix, opts),
      count: (prefix?: string) => db.count(prefix, opts),
      paginate: <T>(pOpts?: Omit<PaginateOptions, "dbName" | "storeName">) => 
        db.paginate<T>({ ...pOpts, ...opts }),
      exportDB: () => db.exportDB(opts),
      importDB: (data: Record<string, any>, clearFirst = false) => db.importDB(data, clearFirst, opts),
      gerarId,
      gerarIdComPrefixo
    };
  }
};