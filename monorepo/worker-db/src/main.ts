import { get, set, update, del, keys, clear } from "npm:idb-keyval";
import { APP_CONFIG } from "./config.ts";

// Inicializa FakeDB se configurado
if (APP_CONFIG.USE_FAKE_DB) {
  await import("npm:fake-indexeddb/auto");
}

self.onmessage = async (e: MessageEvent) => {
  const { requestId, command, args } = e.data;

  try {
    let result;
    switch (command) {
      case "GET":    result = await get(args.key); break;
      case "SET":    result = await set(args.key, args.val); break;
      case "UPDATE": result = await update(args.key, args.updater); break;
      case "DELETE": result = await del(args.key); break;
      case "KEYS":   result = await keys(); break;
      case "CLEAR":  result = await clear(); break;
      default: throw new Error(`Comando desconhecido: ${command}`);
    }
    
    self.postMessage({ requestId, success: true, result });
  } catch (error) {
    self.postMessage({ requestId, success: false, error: (error as Error).message });
  }
};