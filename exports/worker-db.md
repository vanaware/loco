> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém experimentos e código da área de WORKER-DB.
> O projeto é o **Loco ** estruturado em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco - Modo: WORKERDB

Gerado automaticamente em: 8/22/2026, 10:19:47 AM

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
    "fake-indexeddb": "https://esm.sh/fake-indexeddb@6.2.5/auto?bundle&target=es2022",
    "@std/assert": "jsr:@std/assert",

    "@std/fs": "jsr:@std/fs"
  },
  "tasks": {
    "build": "deno run -A --unstable-bundle build.ts",
    "test": "deno task build && deno test --allow-env --allow-net --allow-read tests/",
    "check": "deno check build.ts src/**/*.ts src/**/*.tsx"
  }
}
```

---

## Arquivo: `monorepo/worker-db/src/ls.ts`

```ts
import { APP_CONFIG } from "./config.ts";
import { FakeLocalStorage } from "./utils/fake-storage.ts";

function ensureLocalStorage(): Storage {
  if (!APP_CONFIG.USE_FAKE && typeof globalThis.localStorage == "undefined") {
    console.warn(
      "localStorage is not available in this environment. Falling back to FakeLocalStorage."
    );
  }
  if (APP_CONFIG.USE_FAKE || typeof globalThis.localStorage === "undefined") {
    if (!(globalThis.localStorage instanceof FakeLocalStorage)) {
      Object.defineProperty(globalThis, "localStorage", {
        value: new FakeLocalStorage(),
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
  }
  return globalThis.localStorage;
}

export function createLsStore(prefix: string = "") {
  const formatKey = (key: string) => `${prefix}${key}`;

  return {
    get: <T>(key: string, fallback: T | null = null): T | null => {
      try {
        const item = ensureLocalStorage().getItem(formatKey(key));
        return item ? (JSON.parse(item) as T) : fallback;
      } catch {
        return fallback;
      }
    },
    set: <T>(key: string, value: T): void => {
      ensureLocalStorage().setItem(formatKey(key), JSON.stringify(value));
    },
    patch: <T extends Record<string, any>>(
      key: string,
      patchOrFn: Partial<T> | ((prev: T | null) => T | Partial<T>)
    ): T => {
      const fullKey = formatKey(key);
      const storage = ensureLocalStorage();
      const raw = storage.getItem(fullKey);
      const current = raw ? JSON.parse(raw) : null;
      let updated: T;

      if (typeof patchOrFn === "function") {
        updated = patchOrFn(current) as T;
      } else {
        updated = Object.assign({}, current || {}, patchOrFn);
      }

      storage.setItem(fullKey, JSON.stringify(updated));
      return updated;
    },
    delete: (key: string): void => {
      ensureLocalStorage().removeItem(formatKey(key));
    },
    has: (key: string): boolean => {
      return ensureLocalStorage().getItem(formatKey(key)) !== null;
    },
    keys: (): string[] => {
      const storage = ensureLocalStorage();
      const resultKeys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.startsWith(prefix)) {
          resultKeys.push(prefix ? k.slice(prefix.length) : k);
        }
      }
      return resultKeys;
    },
    clear: (): void => {
      const storage = ensureLocalStorage();
      if (!prefix) {
        storage.clear();
        return;
      }
      const toRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.startsWith(prefix)) toRemove.push(k);
      }
      toRemove.forEach((k) => storage.removeItem(k));
    }
  };
}

export const ls = Object.assign(
  (prefix: string = "") => createLsStore(prefix),
  createLsStore("")
);
```

---

## Arquivo: `monorepo/worker-db/src/utils/fake-storage.ts`

```ts
export class FakeLocalStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}
```

---

## Arquivo: `monorepo/worker-db/src/utils/id-utils.ts`

```ts
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

// Injeta dinamicamente o '_id' sem o prefixo ao LER do IndexedDB
export function formatDbItem(key: IDBValidKey, val: any, prefix = ""): any {
  if (!val || typeof val !== "object" || Array.isArray(val)) return val;
  const keyStr = String(key);
  const _id = prefix && keyStr.startsWith(prefix) ? keyStr.slice(prefix.length) : keyStr;
  return { _id, ...val };
}

// Prepara a chave final para o IndexedDB e limpa o '_id' do objeto gravado
export function prepareForSave(key: string | undefined | null, val: any, prefix = ""): { key: string; cleanVal: any } {
  let rawId = val && typeof val === "object" ? val._id : undefined;
  
  // Utiliza a função gerarId quando for "auto"
  if (rawId === "auto") {
    rawId = gerarId();
  }

  let finalKey = key || "";

  if (rawId) {
    if (prefix && rawId.startsWith(prefix)) {
      finalKey = rawId;
    } else {
      finalKey = prefix ? `${prefix}${rawId}` : rawId;
    }
  } else if (key) {
    if (prefix && key.startsWith(prefix)) {
      finalKey = key;
    } else {
      finalKey = prefix ? `${prefix}${key}` : key;
    }
  }

  if (!finalKey) {
    throw new Error("Uma chave (key) ou um atributo '_id' no objeto deve ser fornecido.");
  }

  // Remove a propriedade '_id' para manter a chave no IndexedDB como única fonte da verdade
  if (val && typeof val === "object" && !Array.isArray(val) && "_id" in val) {
    const { _id: _, ...cleanVal } = val;
    return { key: finalKey, cleanVal };
  }

  return { key: finalKey, cleanVal: val };
}
```

---

## Arquivo: `monorepo/worker-db/src/config.ts`

```ts
// config.ts
const checkEnv = (key: string): boolean | undefined => {
  try {
    if (typeof Deno !== "undefined") {
      const envVal = Deno.env.get(key);
      if (envVal !== undefined) return envVal === "true";
    }
  } catch {
    // Caso a flag --allow-env não tenha sido passada
    console.warn(`Não foi possível acessar a variável de ambiente ${key}.`);
  }
  return undefined;
};

const getUseFake = (): boolean => checkEnv("USE_FAKE") ?? false;

export const APP_CONFIG = {
  USE_FAKE: getUseFake(),
  APP_VERSION: "1.0.0-beta",
  LOG_LEVEL: "debug",
};
```

---

## Arquivo: `monorepo/worker-db/src/db.ts`

```ts
import { APP_CONFIG } from "./config.ts";

if (APP_CONFIG.USE_FAKE) {
  await import("fake-indexeddb");
}

import { 
  get, set, del, keys, clear, getMany, setMany, delMany, 
  values, entries, createStore, type UseStore
} from "idb-keyval";

import { formatDbItem, prepareForSave } from "./utils/id-utils.ts";

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

      case "KEYS":    result = await keys(store); break;
      case "VALUES":  result = await values(store); break;
      case "ENTRIES": result = await entries(store); break;
      case "CLEAR":   result = await clear(store); break;

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
        result = Object.fromEntries(allEntries);
        break;
      }

      case "IMPORT": {
        if (args.clearFirst) await clear(store);
        const entriesToImport = Object.entries(args.data);
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
import { gerarId, gerarIdComPrefixo, validarId } from "./utils/id-utils.ts";
import { ls } from "./ls.ts";

export { gerarId, gerarIdComPrefixo, validarId, ls };

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
  prefix?: string;
}

export type WithId<T> = T & { _id: string };

const globalDbAPI = {
  get: <T>(key: string, opts?: DbStoreOptions) => exec<WithId<T>>("GET", { key, ...opts }),
  
  set: <T>(keyOrVal: string | T, val?: T | DbStoreOptions, opts?: DbStoreOptions) => {
    if (typeof keyOrVal !== "string") {
      return exec<string>("SET", { key: undefined, val: keyOrVal, ...(val as DbStoreOptions) });
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

  getMany: <T>(keys: string[], opts?: DbStoreOptions) => exec<(WithId<T> | undefined)[]>("GET_MANY", { keys, ...opts }),
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

  init: () => { getWorker(); }, 
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

## Arquivo: `monorepo/worker-db/tests/main.test.ts`

```ts
import { assertEquals } from "@std/assert";

if (typeof Deno !== "undefined") {
  Deno.env.set("USE_FAKE", "true");
}

import { db } from "../src/mod.ts";

Deno.test({
  name: "Deve suportar _id e as funções em lote getSome, delSome, setSome e query",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    await db.clear();

    const loja = db("LOJA", "produtos", "PROD_");
    
    await loja.setMany([
      ["001", { nome: "Lápis", preco: 2, ativo: true }],
      ["002", { nome: "Borracha", preco: 3, ativo: false }],
      ["003", { nome: "Caderno", preco: 15, ativo: true }],
      ["004", { nome: "Mochila", preco: 150, ativo: true }],
    ]);

    // 1. QUERY
    const activeCount = await loja.query<{ preco: number, ativo: boolean }, number>(
      (items) => items.filter(i => i.ativo).length
    );
    assertEquals(activeCount, 3);

    // 2. GET_SOME (Verifica _id injetado)
    const caros = await loja.getSome<{ preco: number, nome: string }>(
      (items) => items.filter(i => i.preco > 10).toSorted((a, b) => b.preco - a.preco)
    );
    assertEquals(caros.length, 2);
    assertEquals(caros[0]?.nome, "Mochila");
    assertEquals(caros[0]?._id, "004");

    // 3. SET_SOME
    await loja.setSome<{ preco: number, ativo: boolean, nome: string }>(
      (items) => items.filter(i => i.ativo),
      (item) => ({ ...item, preco: item.preco * 1.1 })
    );
    
    const lapisAtt = await loja.get<{ preco: number }>("001");
    assertEquals(lapisAtt?.preco, 2.2);

    // 4. DEL_SOME
    await loja.delSome<{ ativo: boolean }>(
      (items) => items.filter(i => i.ativo === false)
    );

    const remainingKeys = await loja.keys();
    assertEquals(remainingKeys.length, 3);
    
    db.terminate();
  },
});
```

---

## Arquivo: `monorepo/worker-db/build.ts`

```ts
// build.ts
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

const build = async () => {
  console.log("🚀 Iniciando build do Loco PWA...");
  const startTime = performance.now();

  try {
    // 1. Garante que a pasta de destino exista
    await clean();

    // 2. Compilação do Worker da aplicação
    console.log("⚙️ Gerando bundle do Worker...");
    const result = await Deno.bundle({
      entrypoints: ["./src/db.ts"],
      outputPath: "./build/worker-db.js",
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
    console.log("📁 Saída gerada no diretório: ./build/");
  } catch (error) {
    console.error("❌ Erro fatal durante o processo de build:");
    console.error(error);
    Deno.exit(1);
  }
};

await build();
```

---

