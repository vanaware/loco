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