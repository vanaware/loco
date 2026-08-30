/// <reference lib="deno.ns" />
import { assert, assertEquals } from "@std/assert";
import { generateVAPIDKeys, generateE2EEKeys, exportKeyToJWK, base64UrlToBuffer } from "@loco/utils/crypto";
import { cifrarPayloadObj } from "@loco/utils/proxy";
import { criarJWT, verificarJWT } from "@loco/utils/crypto";
import { gunzipSync } from "fflate";

Deno.test("INTEGRAÇÃO E2E: Nó A (Compacta, Cifra, Assina) -> Servidor -> Nó B (Verifica, Decifra, Descompacta)", async () => {
  // 1. SETUP DOS NÓS
  const aliceVapid = await generateVAPIDKeys();
  const aliceVapidPubJwk = await exportKeyToJWK(aliceVapid.publicKey);
  const aliceVapidPrivJwk = await exportKeyToJWK(aliceVapid.privateKey);
  const bobE2E = await generateE2EEKeys();

  const payloadOriginal = {
    mensagem: { conteudo: "Mensagem Ultra Secreta! ".repeat(50) },
    contato: { sync: { nome: "Alice_PWA" } }
  };

  // 2. NÓ A PREPARA O PACOTE
  const envelopeCifrado = await cifrarPayloadObj(payloadOriginal, bobE2E.publicEncrypt);
  assert(envelopeCifrado.i && envelopeCifrado.d && envelopeCifrado.k);

  const jwtPayload = { 
    sub: "hand", 
    aud: "hash-do-bob", 
    jti: "handshake-123", 
    ct: JSON.stringify(envelopeCifrado) 
  };
  const jwtString = await criarJWT(jwtPayload, aliceVapidPrivJwk, { kid: aliceVapidPubJwk });

  // 3. SERVIDOR PROXY (cego)
  const tamanhoTransferencia = new Blob([jwtString]).size;
  console.log(`\n📦 Tamanho do pacote: ${tamanhoTransferencia} bytes`);
  assert(tamanhoTransferencia < 4096, "Pacote deve ser menor que 4KB");

  // 4. NÓ B RECEBE E ABRE
  const jwtDecodificado = await verificarJWT(jwtString);
  assertEquals(jwtDecodificado.header.alg, "ES256");
  assertEquals(jwtDecodificado.payload.aud, "hash-do-bob");

  const ctRecebido = JSON.parse(jwtDecodificado.payload.ct);

  const bobPrivateDecryptKey = await crypto.subtle.importKey(
    "jwk", 
    bobE2E.privateDecryptJwk, 
    { name: "RSA-OAEP", hash: "SHA-256" }, 
    true, 
    ["decrypt"]
  );

  const ivBytes = new Uint8Array(base64UrlToBuffer(ctRecebido.i));
  const dadosBytes = new Uint8Array(base64UrlToBuffer(ctRecebido.d));
  const chaveAesCifradaBytes = new Uint8Array(base64UrlToBuffer(ctRecebido.k));

  const aesChaveCruaBuffer = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" }, 
    bobPrivateDecryptKey, 
    chaveAesCifradaBytes
  );

  const chaveSimetricaAes = await crypto.subtle.importKey(
    "raw", 
    aesChaveCruaBuffer, 
    { name: "AES-GCM", length: 256 }, 
    false, 
    ["decrypt"]
  );

  const textoDecifradoBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes }, 
    chaveSimetricaAes, 
    dadosBytes
  );

  const decompressed = gunzipSync(new Uint8Array(textoDecifradoBuffer));
  const rotasObj = JSON.parse(new TextDecoder().decode(decompressed));

  // 5. PROVA MATEMÁTICA
  assertEquals(
    rotasObj.mensagem.conteudo, 
    payloadOriginal.mensagem.conteudo, 
    "Mensagem foi corrompida!"
  );
  assertEquals(
    rotasObj.contato.sync.nome, 
    "Alice_PWA", 
    "Piggyback falhou!"
  );
  console.log("✅ Pipeline E2E operando perfeitamente!");
});