// tests/integration/server-crypto.test.ts
/// <reference lib="deno.ns" />
import { assert, assertEquals } from "@std/assert";
import { 
  generateVAPIDKeys, 
  generateRSAKeys, 
  exportKeyToJWK, 
  minifyRsaPublic, 
  minifyRsaPrivate,
  expandRsaPublic
} from "@loco/utils/crypto";
import { cifrarChaveVapid } from "@loco/utils/proxy";
import { decryptWithServerKey } from "../src/shared.ts";

Deno.test("INTEGRAÇÃO: Pipeline Criptográfica Completa (Cliente -> PWA -> Servidor)", async () => {
  // 1. Gera chaves RSA brutas para simular um servidor novo
  const rawServerKeys = await generateRSAKeys();
  const rawPublicKeyJwk = await exportKeyToJWK(rawServerKeys.publicKey);
  const rawPrivateKeyJwk = await exportKeyToJWK(rawServerKeys.privateKey);
  
  // 2. Simula o processo do deploy.sh minificando as chaves e setando as ENV vars
  const envMock = {
    SERVER_PUBLIC_KEY: JSON.stringify(minifyRsaPublic(rawPublicKeyJwk)),
    SERVER_PRIVATE_KEY: JSON.stringify(minifyRsaPrivate(rawPrivateKeyJwk))
  };
  
  // 3. O Cliente arranca e gera a sua chave VAPID
  const clientVapidKeys = await generateVAPIDKeys();
  const clientVapidPrivateKeyJwk = await exportKeyToJWK(clientVapidKeys.privateKey);
  
  // 🔥 SOLUÇÃO: O Cliente (PWA) recebe a chave minificada do Proxy e TEM de a expandir (injetar KTY, ALG, E)
  const expandedServerPublicKey = expandRsaPublic(JSON.parse(envMock.SERVER_PUBLIC_KEY));
  
  // Agora sim, a chave expandida é passada para o motor WebCrypto sem dar erro de "KTY missing"
  const envelopeBase64 = await cifrarChaveVapid(clientVapidPrivateKeyJwk, expandedServerPublicKey);
  assert(typeof envelopeBase64 === "string", "O envelope gerado deve ser uma string Base64");
  
  // 4. O Servidor recebe o envelope e tenta decifrá-lo consumindo as ENV vars minificadas
  const decryptedJwk = await decryptWithServerKey(envMock, envelopeBase64);
  
  // 5. Verifica se os dados se mantiveram perfeitos durante toda a transação
  assertEquals(
    decryptedJwk.d, 
    clientVapidPrivateKeyJwk.d, 
    "FALHA FATAL: A chave extraída pelo servidor não corresponde à original!"
  );
  console.log("✅ Pipeline Criptográfico Uniformizado operando com perfeição!");
});

Deno.test("INTEGRAÇÃO: Servidor deve rejeitar (Nó Incorreto/OperationError) com Chaves Dessincronizadas", async () => {
  const keysOntem = await generateRSAKeys();
  const keysHoje = await generateRSAKeys();
  
  const envMockHoje = {
    SERVER_PUBLIC_KEY: JSON.stringify(minifyRsaPublic(await exportKeyToJWK(keysHoje.publicKey))),
    SERVER_PRIVATE_KEY: JSON.stringify(minifyRsaPrivate(await exportKeyToJWK(keysHoje.privateKey)))
  };
  
  const clientVapidKeys = await generateVAPIDKeys();
  
  // 🔥 SOLUÇÃO: Expandir a chave minificada de "ontem" antes de o cliente a utilizar
  const chaveVelhaExpandida = expandRsaPublic(minifyRsaPublic(await exportKeyToJWK(keysOntem.publicKey)));
  
  // Cliente cifra usando a chave pública expandida de "ontem"
  const envelopeComChaveVelha = await cifrarChaveVapid(
    await exportKeyToJWK(clientVapidKeys.privateKey), 
    chaveVelhaExpandida
  );
  
  let deuErro = false;
  try {
    // Servidor tenta abrir usando as chaves de "hoje"
    await decryptWithServerKey(envMockHoje, envelopeComChaveVelha);
  } catch (error: any) {
    deuErro = true;
    assert(
      error.message.includes("OperationError") || error.message.includes("Nó incorreto") || error.name === "OperationError", 
      "O erro deveria ser de operação RSA (Nó Incorreto)"
    );
  }
  
  assert(deuErro, "Falha Crítica de Segurança: O Servidor conseguiu abrir um cofre trancado com outra chave!");
});