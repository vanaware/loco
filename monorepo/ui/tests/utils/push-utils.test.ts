// tests/utils/push-utils.test.ts
/// <reference lib="deno.ns" />
import { assert, assertEquals } from "@std/assert";
import { cifrarChaveVapid } from "../../src/utils/push-utils.ts";
import { generateVAPIDKeys, generateE2EEKeys, exportKeyToJWK } from "../../src/utils/crypto-utils.ts";

Deno.test("Push Utils - Blindagem do Servidor (cifrarChaveVapid)", async () => {
  // 1. Cenário: O Cliente PWA acabou de gerar sua chave VAPID privada
  const clientKeys = await generateVAPIDKeys();
  const clientVapidPrivateJwk = await exportKeyToJWK(clientKeys.privateKey);

  // 2. Cenário: O Servidor (Loco Proxy) disponibilizou sua chave Pública RSA
  const serverKeys = await generateE2EEKeys();
  const serverPublicJwk = serverKeys.publicEncrypt;

  // 3. AÇÃO: O Cliente blinda sua chave VAPID privada para enviar ao proxy
  const envelopeBase64 = await cifrarChaveVapid(clientVapidPrivateJwk, serverPublicJwk);
  
  // 4. VERIFICAÇÃO ESTRUTURAL
  assert(typeof envelopeBase64 === "string", "O envelope gerado deve ser uma string Base64");
  assert(envelopeBase64.length > 50, "O envelope não pode ser vazio");

  // Decodifica o base64 para verificar o JSON interno (sem quebrar a criptografia AES/RSA)
  const envelopeJsonStr = atob(envelopeBase64);
  const envelopeObj = JSON.parse(envelopeJsonStr);

  assert(envelopeObj.iv !== undefined, "O envelope deve conter um Vetor de Inicialização (iv)");
  assert(envelopeObj.dadosCifrados !== undefined, "O envelope deve conter os dados cifrados em AES (dadosCifrados)");
  assert(envelopeObj.chaveAesCifrada !== undefined, "O envelope deve conter a chave AES trancada pela chave RSA do servidor (chaveAesCifrada)");
  
  // O AES-GCM IV sempre terá 24 caracteres hexadecimais (12 bytes)
  assertEquals(envelopeObj.iv.length, 24, "O IV em hexadecimal deve ter exatamente 24 caracteres");
});