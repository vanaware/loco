> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém experimentos e código da área de WORKER-DB.
> O projeto é o **Loco ** estruturado em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco - Modo: WORKERDB

Gerado automaticamente em: 8/22/2026, 8:17:00 AM

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

## Arquivo: `monorepo/worker-db/src/config.ts`

```ts
// config.ts
const getUseFakeDb = (): boolean => {
  try {
    // 1. Se estiver rodando no Deno (CLI / Testes), tenta ler a variável de ambiente
    if (typeof Deno !== "undefined") {
      const envVal = Deno.env.get("USE_FAKE_DB");
      if (envVal !== undefined) return envVal === "true";
    }
  } catch {
    // Caso a flag --allow-env não tenha sido passada no Deno CLI
  }

  // 2. Fallback padrão para desenvolvimento do protótipo no navegador
  return true;
};

export const APP_CONFIG = {
  USE_FAKE_DB: getUseFakeDb(),
  APP_VERSION: "1.0.0-beta",
  LOG_LEVEL: "debug",
};
```

---

## Arquivo: `monorepo/worker-db/src/main.ts`

```ts
import { APP_CONFIG } from "./config.ts";

// Inicializa FakeDB se configurado
if (APP_CONFIG.USE_FAKE_DB) {
  await import("fake-indexeddb");
}

import { 
  get, 
  set, 
  del, 
  keys, 
  clear, 
  getMany, 
  setMany, 
  delMany, 
  values, 
  entries,
  createStore,
  type UseStore
} from "idb-keyval";

// Cache de instâncias de bancos para reaproveitamento
const storeCache = new Map<string, UseStore>();

function getCustomStore(dbName?: string, storeName = "keyval"): UseStore | undefined {
  if (!dbName) return undefined; // Usa o banco e store padrão do idb-keyval
  
  const cacheKey = `${dbName}:${storeName}`;
  if (!storeCache.has(cacheKey)) {
    storeCache.set(cacheKey, createStore(dbName, storeName));
  }
  return storeCache.get(cacheKey);
}

self.onmessage = async (e: MessageEvent) => {
  const { requestId, command, args } = e.data;

  try {
    const store = getCustomStore(args.dbName, args.storeName);
    let result;

    switch (command) {
      // 🔹 Operações Unitárias
      case "GET":      result = await get(args.key, store); break;
      case "SET":      result = await set(args.key, args.val, store); break;
      case "DELETE":   result = await del(args.key, store); break;
      
      // 🔹 Operações em Lote
      case "GET_MANY": result = await getMany(args.keys, store); break;
      case "SET_MANY": result = await setMany(args.entries, store); break;
      case "DEL_MANY": result = await delMany(args.keys, store); break;
      
      // 🔹 Leitura de Coleções
      case "KEYS":     result = await keys(store); break;
      case "VALUES":   result = await values(store); break;
      case "ENTRIES":  result = await entries(store); break;
      case "CLEAR":    result = await clear(store); break;

      // 🚀 Operações Avançadas
      case "GET_BY_PREFIX": {
        const allEntries = await entries(store);
        result = allEntries
          .filter(([k]) => typeof k === "string" && k.startsWith(args.prefix))
          .map(([_, v]) => v);
        break;
      }

      case "DELETE_BY_PREFIX": {
        const allKeys = await keys(store);
        const targetKeys = allKeys.filter(
          (k) => typeof k === "string" && k.startsWith(args.prefix)
        );
        result = await delMany(targetKeys as string[], store);
        break;
      }

      case "COUNT": {
        const allKeys = await keys(store);
        result = args.prefix
          ? allKeys.filter((k) => typeof k === "string" && k.startsWith(args.prefix)).length
          : allKeys.length;
        break;
      }

      case "PAGINATE": {
        let allEntries = await entries(store);
        if (args.prefix) {
          allEntries = allEntries.filter(
            ([k]) => typeof k === "string" && k.startsWith(args.prefix)
          );
        }
        const total = allEntries.length;
        const offset = args.offset || 0;
        const limit = args.limit || 10;
        const slice = allEntries.slice(offset, offset + limit).map(([_, v]) => v);
        
        result = {
          items: slice,
          total,
          hasMore: offset + limit < total
        };
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
```

---

## Arquivo: `monorepo/worker-db/tests/main.test.ts`

```ts
import { assertEquals } from "@std/assert";

// Força a variável de ambiente antes de inicializar qualquer banco
if (typeof Deno !== "undefined") {
  Deno.env.set("USE_FAKE_DB", "true");
}

import { db } from "../src/mod.ts";

Deno.test({
  name: "Deve realizar operações de CRUD no IndexedDB via Web Worker (FakeDB)",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Garantia de estado limpo no início do teste
    await db.clear();

    // 1. SET & GET
    await db.set("user_1", { name: "Alice", role: "Dev" });
    const user = await db.get<{ name: string; role: string }>("user_1");
    assertEquals(user?.name, "Alice");

    // 2. UPDATE
    await db.update<{ name: string; role: string }>("user_1", (prev) => ({
      ...prev!,
      role: "Lead Dev",
    }));
    const updatedUser = await db.get<{ name: string; role: string }>("user_1");
    assertEquals(updatedUser?.role, "Lead Dev");

    // 3. KEYS & DELETE
    const allKeys = await db.keys();
    assertEquals(allKeys.includes("user_1"), true);

    await db.delete("user_1");
    const emptyUser = await db.get("user_1");
    assertEquals(emptyUser, undefined);

    // Encerra o Worker para fechar os recursos de teste
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
      entrypoints: ["./src/main.ts"],
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

