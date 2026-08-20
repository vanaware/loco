import { assertEquals } from "jsr:@std/assert@1.0.0";
import { currentPath, navigateTo } from "../src/router.ts";

Deno.test("Router - Normalização da Rota Raiz ('/')", () => {
  navigateTo("/");
  assertEquals(currentPath.value, "/chats");
});

Deno.test("Router - Navegação para Rota Válida ('/contacts')", () => {
  navigateTo("/contacts");
  assertEquals(currentPath.value, "/contacts");
});

Deno.test("Router - Navegação para Rota Válida ('/settings')", () => {
  navigateTo("/settings");
  assertEquals(currentPath.value, "/settings");
});

Deno.test("Router - Normalização de String Vazia", () => {
  navigateTo("");
  assertEquals(currentPath.value, "/chats");
});