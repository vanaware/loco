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