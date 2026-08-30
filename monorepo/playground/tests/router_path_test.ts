// Arquivo: monorepo/playground/tests/router_path_test.ts
import { assertEquals } from "@std/assert";
import { parseHash } from "../src/router.ts";

Deno.test("Router - parseHash: Hash vazio ou inválido retorna 'chats' (fallback)", () => {
  assertEquals(parseHash(""), "chats");
  assertEquals(parseHash("#"), "chats");
  assertEquals(parseHash("#invalid"), "chats");
  assertEquals(parseHash("#/unknown"), "chats");
});

Deno.test("Router - parseHash: Rotas válidas são parseadas corretamente", () => {
  assertEquals(parseHash("#contacts"), "contacts");
  assertEquals(parseHash("#settings"), "settings");
  assertEquals(parseHash("#chats"), "chats");
});

Deno.test("Router - parseHash: Rotas com barra extra são normalizadas", () => {
  assertEquals(parseHash("#/contacts"), "contacts");
  assertEquals(parseHash("#/settings"), "settings");
});