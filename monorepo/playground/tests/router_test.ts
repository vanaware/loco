import { assertEquals } from "jsr:@std/assert@1.0.0";
import { currentPath, activeRoute, navigateTo, normalizePath } from "../src/router.ts";

Deno.test("Router - Normalização do caminho raiz e vazios", () => {
  assertEquals(normalizePath("/"), "/chats");
  assertEquals(normalizePath(""), "/chats");
  assertEquals(normalizePath("/contacts"), "/contacts");
});

Deno.test("Router - Navegação para rota '/contacts'", () => {
  navigateTo("/contacts");
  assertEquals(currentPath.value, "/contacts");
  assertEquals(activeRoute.value, "contacts");
});

Deno.test("Router - Navegação para rota '/settings'", () => {
  navigateTo("/settings");
  assertEquals(currentPath.value, "/settings");
  assertEquals(activeRoute.value, "settings");
});