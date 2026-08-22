import { assertEquals } from "@std/assert";

const isFake = typeof Deno !== "undefined" && Deno.env.get("USE_FAKE") === "true";
if (isFake) {
  Deno.env.set("USE_FAKE", "true");
}

import { db } from "../src/mod.ts";
import { FakeLocalStorage } from "../src/utils/fake-local-storage.ts";

// @ts-ignore: Injeção de mock de ambiente
globalThis.localStorage = new FakeLocalStorage();

db.init(new URL("../build/worker-db.js", import.meta.url));

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

    if (!isFake) {
      result = await store.get<any>("status");
      assertEquals(result?.alive, true, "Worker não conseguiu se auto-restaurar com persistência");
    } else {
      await store.set("status", { alive: true, phase: "healed" });
      result = await store.get<any>("status");
      assertEquals(result?.phase, "healed");
    }

    db.restart();
    
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
    
    db.init(new URL("../build/worker-db.js", import.meta.url));
    db.restart();
    
    await store.set("k1", { val: 1 });
    await store.set("k2", { val: 2 });
    
    const keys = await store.keys();
    assertEquals(keys.length, 2);
    
    await store.clear();
    db.terminate();
  }
});