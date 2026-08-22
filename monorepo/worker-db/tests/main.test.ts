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