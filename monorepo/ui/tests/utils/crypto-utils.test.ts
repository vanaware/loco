// tests/crypto-utils.test.ts
import { assertEquals, assert } from "@std/assert";
import { 
  minifyVapidPublic, expandVapidPublic,
  minifyRsaPublic, expandRsaPublic
} from "../../src/utils/crypto-utils.ts";

Deno.test("Crypto Utils - Minificação e Expansão de VAPID Public (ECDSA P-256)", () => {
  const mockJwkOriginal: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: "base64Url_String_X_Aqui_Ficticia",
    y: "base64Url_String_Y_Aqui_Ficticia",
    ext: true,
    key_ops: ["verify"]
  };

  // Minifica: Deve sobrar apenas X e Y
  const minified = minifyVapidPublic(mockJwkOriginal);
  assert(minified.x === mockJwkOriginal.x, "Deve conter a coordenada X");
  assert(minified.y === mockJwkOriginal.y, "Deve conter a coordenada Y");
  assert(minified.kty === undefined, "Não deve conter o kty");
  assert(minified.crv === undefined, "Não deve conter a curva");

  // Expande: Deve reconstruir a chave perfeitamente
  const expanded = expandVapidPublic(minified);
  assertEquals(expanded.kty, "EC");
  assertEquals(expanded.crv, "P-256");
  assertEquals(expanded.x, mockJwkOriginal.x);
  assertEquals(expanded.y, mockJwkOriginal.y);
  assertEquals(expanded.ext, true);
  assertEquals(expanded.key_ops, ["verify"]);
});

Deno.test("Crypto Utils - Minificação e Expansão de RSA Public", () => {
  const mockRsaOriginal: JsonWebKey = {
    kty: "RSA",
    alg: "RSA-OAEP-256",
    e: "AQAB",
    n: "modulo_matematico_gigante_aqui",
    ext: true,
    key_ops: ["encrypt"]
  };

  // Minifica: Só o módulo 'n' importa em chaves RSA-OAEP padronizadas
  const minified = minifyRsaPublic(mockRsaOriginal);
  assert(minified.n === mockRsaOriginal.n, "Deve reter o módulo N");
  assert(minified.kty === undefined, "Deve omitir a tipagem kty");

  // Expande: Reconstrói o esquema
  const expanded = expandRsaPublic(minified);
  assertEquals(expanded.kty, "RSA");
  assertEquals(expanded.alg, "RSA-OAEP-256");
  assertEquals(expanded.e, "AQAB");
  assertEquals(expanded.n, mockRsaOriginal.n);
});

Deno.test("Crypto Utils - Expansão de chave já expandida (Idempotência)", () => {
  const jwk: JsonWebKey = { kty: "RSA", n: "123", e: "AQAB" };
  const expanded = expandRsaPublic(jwk);
  
  // Se eu passar algo que já tem 'kty', ele não deve tentar reconstruir o que não precisa
  assertEquals(expanded, jwk, "A função de expansão deve ser idempotente se a chave não estiver minificada");
});