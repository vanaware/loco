// tests/utils/crypto-aes.test.ts
/// <reference lib="deno.ns" />
import { assertEquals, assert, assertRejects } from "@std/assert";
import { encryptTextAES, decryptTextAES } from "../../src/utils/crypto-utils.ts";

Deno.test("Crypto AES - Criptografar e Descriptografar texto puro (Roundtrip)", async () => {
  // Gera uma chave AES-GCM temporária para o teste
  const secretKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const plainText = "Mensagem altamente confidencial P2P do Loco!";
  
  // Criptografa
  const { cipherTextBase64, ivBase64 } = await encryptTextAES(secretKey, plainText);
  
  assert(cipherTextBase64.length > 0, "O texto cifrado gerado não pode ser vazio");
  assert(ivBase64.length > 0, "O Vetor de Inicialização (IV) não pode ser vazio");
  
  // Descriptografa
  const decryptedText = await decryptTextAES(secretKey, cipherTextBase64, ivBase64);
  
  assertEquals(decryptedText, plainText, "O texto decifrado deve ser exatamente igual à mensagem original");
});

Deno.test("Crypto AES - Deve falhar ao descriptografar com a chave AES incorreta", async () => {
  // Gera duas chaves distintas
  const key1 = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const key2 = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

  // Criptografa com a Chave 1
  const { cipherTextBase64, ivBase64 } = await encryptTextAES(key1, "Segredo do Handshake");

  // Tenta quebrar a criptografia usando a Chave 2
  await assertRejects(
    async () => {
      await decryptTextAES(key2, cipherTextBase64, ivBase64);
    },
    Error,
    "A decodificação falhou",
    "A função deve rejeitar (throw Error) quando uma chave AES errada tenta abrir o envelope"
  );
});

Deno.test("Crypto AES - Deve falhar caso o IV (Vetor de Inicialização) seja adulterado", async () => {
  const secretKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const { cipherTextBase64 } = await encryptTextAES(secretKey, "Dados sensíveis");

  // Geramos um IV falso aleatório, simulando uma adulteração (Man-in-the-Middle ou corrupção de rede)
  const fakeIv = crypto.getRandomValues(new Uint8Array(12));
  const fakeIvBase64 = btoa(String.fromCharCode(...fakeIv)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  await assertRejects(
    async () => {
      await decryptTextAES(secretKey, cipherTextBase64, fakeIvBase64);
    },
    Error,
    "A decodificação falhou",
    "O AES-GCM deve garantir a integridade e rejeitar a decifragem se o IV for modificado"
  );
});