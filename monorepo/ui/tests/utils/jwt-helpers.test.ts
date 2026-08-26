// testes/utils/jwt-helpers.test.ts/// <reference lib="deno.ns" />
import { assert, assertEquals } from "@std/assert";
import { criarJWT, verificarJWT } from "../../src/utils/jwt-helpers.ts";
import { generateVAPIDKeys, exportKeyToJWK } from "../../src/utils/crypto-utils.ts";

Deno.test("JWT Helpers - Pipeline de Criação e Verificação E2E", async () => {
  const keys = await generateVAPIDKeys();
  const publicKeyJwk = await exportKeyToJWK(keys.publicKey);
  const privateKeyJwk = await exportKeyToJWK(keys.privateKey);

  const payload = { sub: "test", data: "offline-first-loco" };
  
  const jwt = await criarJWT(payload, privateKeyJwk, { kid: publicKeyJwk });
  assert(typeof jwt === "string" && jwt.split('.').length === 3, "JWT deve ser estruturalmente válido");
  
  const verified = await verificarJWT(jwt);
  assert(verified.valid, "A integridade do JWT precisa ser atestada matematicamente.");
  assertEquals(verified.payload.data, "offline-first-loco", "O payload não pode sofrer mutação no processo de encode/decode.");
});