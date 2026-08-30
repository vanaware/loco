/// <reference lib="deno.ns" />
import { assert, assertEquals } from "@std/assert";
import { cifrarChaveVapid } from "@loco/utils/proxy";
import { generateVAPIDKeys, generateE2EEKeys, exportKeyToJWK } from "@loco/utils/crypto";

Deno.test("Push Utils - Blindagem do Servidor (cifrarChaveVapid)", async () => {
  const clientKeys = await generateVAPIDKeys();
  const clientVapidPrivateJwk = await exportKeyToJWK(clientKeys.privateKey);
  const serverKeys = await generateE2EEKeys();
  const serverPublicJwk = serverKeys.publicEncrypt;
  const envelopeBase64 = await cifrarChaveVapid(clientVapidPrivateJwk, serverPublicJwk);
  assert(typeof envelopeBase64 === "string", "O envelope gerado deve ser uma string Base64");
  assert(envelopeBase64.length > 50, "O envelope não pode ser vazio");
  const envelopeJsonStr = atob(envelopeBase64);
  const envelopeObj = JSON.parse(envelopeJsonStr);
  assert(envelopeObj.iv !== undefined, "O envelope deve conter um Vetor de Inicialização (iv)");
  assert(envelopeObj.dadosCifrados !== undefined, "O envelope deve conter os dados cifrados em AES (dadosCifrados)");
  assert(envelopeObj.chaveAesCifrada !== undefined, "O envelope deve conter a chave AES trancada pela chave RSA do servidor (chaveAesCifrada)");
  assertEquals(envelopeObj.iv.length, 24, "O IV em hexadecimal deve ter exatamente 24 caracteres");
});