// Arquivo: monorepo/playground/tests/router_test.ts
import { assertEquals, assertExists } from "jsr:@std/assert@1.0.0";
import { ROUTES, activeRoute } from "../src/router.ts";

Deno.test("Router - ROUTES deve conter as 3 views principais", () => {
  assertEquals(ROUTES.length, 3);
  const ids = ROUTES.map((r) => r.id);
  assertEquals(ids.includes("chats"), true);
  assertEquals(ids.includes("contacts"), true);
  assertEquals(ids.includes("settings"), true);
});

Deno.test("Router - activeRoute deve iniciar com um valor válido em ambiente de teste", () => {
  // Em ambiente de teste Deno puro, location.hash é vazio ou indefinido, 
  // então o fallback "chats" deve ser acionado automaticamente.
  assertExists(activeRoute.value);
  assertEquals(typeof activeRoute.value, "string");
});

Deno.test("Router - Cada RouteConfig deve ter os metadados de UI necessários", () => {
  for (const route of ROUTES) {
    assertExists(route.label);
    assertExists(route.icon);
    assertExists(route.title);
  }
});