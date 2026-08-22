import { assertEquals, assert } from "@std/assert";

import { db, ls, listOpfsFiles } from "../src/fake-mod.ts";
import { FakeOPFSDirectory } from "../src/utils/fake-opfs.ts";

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