// monorepo/worker-db/src/fake-mod.ts

// 1. Injeta o IndexedDB Fake globalmente (Main Thread)
import "fake-indexeddb/auto";

import { FakeOPFSDirectory } from "./utils/fake-opfs.ts";
import { FakeLocalStorage } from "./utils/fake-local-storage.ts";

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
export * from "./mod.ts";

// 5. O PULO DO GATO: Forçamos a inicialização do módulo para usar o Worker Fake.
// O Deno resolve arquivos .ts nativamente em Workers usando import.meta.url
import { db } from "./mod.ts";
const fakeWorkerUrl = new URL("./fake-db.ts", import.meta.url);
db.init(fakeWorkerUrl);