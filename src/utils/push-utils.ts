// src/utils/push-utils.ts
import { gzipSync } from "fflate";
import { addDebugLog } from "./debug-utils.ts";

// ============================================================
// UTILITÁRIOS DE CRIPTOGRAFIA PARA PUSH
// ============================================================

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  try {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  } catch (e: any) {
    throw new Error(`Erro ao encodar payload cifrado para Base64: ${e.message}`);
  }
}

/**
 * Cifra um payloadObj (objeto JavaScript) usando AES-GCM e a chave E2EE RSA do destinatário.
 * Retorna envelope blindado: { i: ivBase64, d: dadosCifradosBase64, k: chaveAesCifradaBase64 }
 */
export async function cifrarPayloadObj(payloadObj: any, publicKeyRSA: JsonWebKey): Promise<{
  i: string;
  d: string;
  k: string;
}> {
  try {
    const encoder = new TextEncoder();
    const jsonString = JSON.stringify(payloadObj);
    const bytes = encoder.encode(jsonString);
    
    // Otimização: Compressão Deflate para poupar tráfego e respeitar a cota Web Push
    const compressed = gzipSync(bytes);
    
    // Avaliação Proativa de Gargalos de Rede (WebPush limita FCM a 4096 bytes)
    addDebugLog("info", "CRYPTO:PUSH", `Comprimido: ${compressed.length} bytes (Original: ${bytes.length} bytes)`);
    if (compressed.length > 3000) {
       addDebugLog("warn", "CRYPTO:PUSH", `Atenção: O payload comprimido está em ${compressed.length} bytes. Risco de estourar o limite de 4KB após a assinatura JWT.`);
    }

    const aesKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt"]
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      compressed
    );

    const cryptoKeyDestino = await crypto.subtle.importKey(
      "jwk",
      publicKeyRSA,
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["encrypt"]
    );
    
    const aesKeyRaw = await crypto.subtle.exportKey("raw", aesKey);
    const aesKeyEncrypted = await crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      cryptoKeyDestino,
      aesKeyRaw
    );

    return {
      i: arrayBufferToBase64(iv.buffer),
      d: arrayBufferToBase64(encryptedBuffer),
      k: arrayBufferToBase64(aesKeyEncrypted)
    };
  } catch (err: any) {
    addDebugLog("error", "CRYPTO:PUSH", `Erro severo na montagem do envelope E2EE: ${err.message}`);
    throw new Error(`Falha de criptografia Híbrida: ${err.message}`);
  }
}

/**
 * Envia um payload JWT pronto para o servidor proxy.
 * Retorna true se sucesso, lança erro detalhado em caso de falha.
 */
export async function enviarParaProxy(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payloadText: string,
  vapid: { subject: string; publicKey: JsonWebKey; privateKey: string }
): Promise<void> {
  // Apenas Blob consegue medir strings com caracteres multi-byte UTF-8 corretamente no Client Side
  const payloadSize = new Blob([payloadText]).size;
  if (payloadSize > 4096) {
    addDebugLog("error", "NETWORK:PUSH", `Rejeição preventiva: Payload de ${payloadSize} bytes ultrapassa o limite arquitetural de 4096 bytes do FCM.`);
    throw new Error(`Limite de cota de rede excedido. O pacote final ficou com ${payloadSize} bytes, mas as redes celulares aceitam apenas até 4KB.`);
  }

  try {
    const response = await fetch("/api/proxy-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription,
        payloadText,
        vapid: {
          subject: vapid.subject,
          publicKey: vapid.publicKey,
          privateKey: vapid.privateKey // Pode ser o envelope RSA para o servidor ou a JWK exposta
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`O servidor retransmissor rejeitou o pacote. HTTP ${response.status}: ${errorText}`);
    }
  } catch (err: any) {
     addDebugLog("error", "NETWORK:PUSH", `Falha de conexão com o Proxy: ${err.message}`);
     throw err;
  }
}

/**
 * Cifra a chave privada VAPID (JWK) com a chave pública do servidor usando Hybrid Crypto.
 * Retorna string Base64 estruturada.
 */
export async function cifrarChaveVapid(privateKeyJwk: JsonWebKey, serverPublicKeyJwk: JsonWebKey): Promise<string> {
  try {
    const serverKey = await crypto.subtle.importKey(
      "jwk",
      serverPublicKeyJwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["encrypt"]
    );
    
    const aesKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt"]
    );
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const vapidBytes = encoder.encode(JSON.stringify(privateKeyJwk));
    
    const vapidCifrado = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      vapidBytes
    );
    
    const aesKeyRaw = await crypto.subtle.exportKey("raw", aesKey);
    const aesKeyCifrado = await crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      serverKey,
      aesKeyRaw
    );

    // NOTA TÉCNICA: Mantemos Hex encoding temporariamente para retrocompatibilidade
    // estrutural com a leitura da API do Servidor (main.ts).
    const toHex = (buf: ArrayBuffer) =>
      Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    const envelope = {
      iv: toHex(iv.buffer),
      dadosCifrados: toHex(vapidCifrado),
      chaveAesCifrada: toHex(aesKeyCifrado)
    };
    
    return btoa(JSON.stringify(envelope));
  } catch (err: any) {
    addDebugLog("error", "CRYPTO:VAPID", `Falha no envelopamento da chave de Identidade: ${err.message}`);
    throw new Error(`Erro ao blindar perfil para a rede: ${err.message}`);
  }
}