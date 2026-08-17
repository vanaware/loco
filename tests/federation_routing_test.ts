// testes/federation_routing_test.ts

import { assertEquals } from "@std/assert";
import { handlePing } from "../server/functions/ping.ts";
import { handlePush } from "../server/functions/push.ts";

Deno.test("Server - Handler /ping deve retornar HTTP 200 com status OK", async () => {
  const req = new Request("https://proxy.vanaware.com/ping", {
    method: "POST"});
  const res = await handlePing(req);

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.success, true);
  assertEquals(data.service, "loco-proxy");
});

Deno.test("Server - Handler /push deve rejeitar payload vazio com HTTP 400", async () => {
  const req = new Request("https://proxy.vanaware.com/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "invalid-json",
  });

  const res = await handlePush(req);
  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.error, "Corpo não é JSON válido.");
});