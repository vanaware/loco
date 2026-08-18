// tests/integration/e2e-payload-pipeline.test.ts
/// <reference lib="deno.ns" />

import { assert, assertEquals } from "@std/assert";
import { generateVAPIDKeys, generateE2EEKeys, exportKeyToJWK, base64UrlToBuffer } from "../../src/utils/crypto-utils.ts";
import { cifrarPayloadObj } from "../../src/utils/push-utils.ts";
import { criarJWT, verificarJWT } from "../../src/utils/jwt-helpers.ts";
import { gunzipSync } from "fflate";

Deno.test("INTEGRAÇÃO E2E: Nó A (Compacta, Cifra, Assina) -> Servidor (Cego) -> Nó B (Verifica, Decifra, Descompacta)", async () => {
  
  // =========================================================================
  // 1. SETUP DOS NÓS (Geração das identidades criptográficas)
  // =========================================================================
  
  // Nó A (Remetente / Alice)
  const aliceVapid = await generateVAPIDKeys();
  const aliceVapidPubJwk = await exportKeyToJWK(aliceVapid.publicKey);
  const aliceVapidPrivJwk = await exportKeyToJWK(aliceVapid.privateKey);

  // Nó B (Destinatário / Bob)
  const bobE2E = await generateE2EEKeys();
  
  // O payload original (Usamos uma string repetida para provar que o GZIP/fflate atua reduzindo o tamanho)
  const payloadOriginal = {
    mensagem: { conteudo: "Mensagem Ultra Secreta! ".repeat(50) },
    contato: { sync: { nome: "Alice_PWA" } }
  };


  // =========================================================================
  // 2. NÓ A (ALICE) PREPARA O PACOTE (Simulando sw-handshakes.ts -> Fluxo OUT)
  // =========================================================================
  
  // A) Compacta com GZIP e Cifra com AES/RSA (Usando a chave pública E2E do Bob)
  const envelopeCifrado = await cifrarPayloadObj(payloadOriginal, bobE2E.publicEncrypt);
  
  assert(envelopeCifrado.i && envelopeCifrado.d && envelopeCifrado.k, "O Envelope deve conter IV, Dados e Chave AES cifrada.");

  // B) Assina o pacote num JWT (Usando a chave privada VAPID da Alice)
  const jwtPayload = { 
    sub: "hand", 
    aud: "hash-do-bob", 
    jti: "handshake-123", 
    ct: JSON.stringify(envelopeCifrado) 
  };
  
  const jwtString = await criarJWT(jwtPayload, aliceVapidPrivJwk, { kid: aliceVapidPubJwk });


  // =========================================================================
  // 3. O SERVIDOR PROXY (O "Carteiro Cego")
  // =========================================================================
  
  // O Servidor recebe a string JWT. Ele não tem a chave E2E privada do Bob.
  // Se o servidor tentar ler o conteúdo dentro de 'ct', ele só verá lixo binário.
  const tamanhoTransferencia = new Blob([jwtString]).size;
  console.log(`\n📦 Tamanho do pacote trafegado na rede: ${tamanhoTransferencia} bytes`);
  assert(tamanhoTransferencia < 4096, "O pacote JWT final deve ser menor que o MTU do Web Push (4KB)");


  // =========================================================================
  // 4. NÓ B (BOB) RECEBE E ABRE O PACOTE (Simulando sw-handshakes.ts -> Fluxo IN)
  // =========================================================================
  
  // A) Verifica a Assinatura (Garante que foi a Alice quem enviou e que ninguém alterou o pacote no meio do caminho)
  const jwtDecodificado = await verificarJWT(jwtString);
  assertEquals(jwtDecodificado.header.alg, "ES256", "O JWT deve ter sido assinado com a curva P-256 (ECDSA)");
  assertEquals(jwtDecodificado.payload.aud, "hash-do-bob", "O pacote deve ser destinado ao Bob");

  // B) Extrai o cofre
  const ctRecebido = JSON.parse(jwtDecodificado.payload.ct);

  // C) Decifra RSA (Bob usa a sua própria chave E2E privada para abrir a chave AES que a Alice gerou)
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

  // D) Decifra AES (Abre a mensagem propriamente dita)
  const textoDecifradoBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes }, 
    chaveSimetricaAes, 
    dadosBytes
  );

  // E) Descompacta GZIP (fflate) e faz o Parse JSON
  const decompressed = gunzipSync(new Uint8Array(textoDecifradoBuffer));
  const rotasObj = JSON.parse(new TextDecoder().decode(decompressed));


  // =========================================================================
  // 5. PROVA MATEMÁTICA FINAL
  // =========================================================================
  
  assertEquals(
    rotasObj.mensagem.conteudo, 
    payloadOriginal.mensagem.conteudo, 
    "FALHA FATAL: A mensagem foi corrompida ou alterada durante o trajeto!"
  );
  
  assertEquals(
    rotasObj.contato.sync.nome, 
    "Alice_PWA", 
    "FALHA FATAL: O Piggybacking (Sincronização de contato embutida) falhou!"
  );

  console.log("✅ Pipeline de Dados E2E (Compactação -> AES -> RSA -> JWT -> Rede) operando perfeitamente!");
});