// src/utils/jwt-helpers.ts
import { minifyVapidPublic, expandVapidPublic } from "./crypto-utils.ts";

export function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  try {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch (e: any) {
    throw new Error(`Erro ao codificar Buffer para Base64Url: ${e.message}`);
  }
}

export function base64UrlToArrayBuffer(base64Url: string): ArrayBuffer {
  try {
    // 🔥 ARQUITETURA: Regex /\s+/g expurga TODAS as quebras de linha e espaços 
    // que possam ter vindo acidentalmente no Ctrl+C / Ctrl+V do usuário.
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
    const padLength = (4 - (base64.length % 4)) % 4;
    base64 += '='.repeat(padLength);
    
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer as ArrayBuffer;
  } catch (e: any) {
    throw new Error(`Base64Url recebido contém formato inválido ou caracteres maliciosos: ${e.message}`);
  }
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  try {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
  } catch (e: any) {
    throw new Error(`Erro ao codificar Buffer para Base64 padrão: ${e.message}`);
  }
}

export async function criarJWT(
  payload: Record<string, any>,
  privateKeyJwk: JsonWebKey,
  headerExtra: Record<string, any> = {}
): Promise<string> {
  try {
    if (headerExtra.kid && (headerExtra.kid.kty || headerExtra.kid.x)) {
      headerExtra.kid = minifyVapidPublic(headerExtra.kid);
    }

    const header = { alg: "ES256", ...headerExtra };
    const encoder = new TextEncoder();

    const headerEnc = encoder.encode(JSON.stringify(header));
    const payloadEnc = encoder.encode(JSON.stringify(payload));

    const headerB64 = arrayBufferToBase64Url(headerEnc.buffer as ArrayBuffer);
    const payloadB64 = arrayBufferToBase64Url(payloadEnc.buffer as ArrayBuffer);
    const toSign = `${headerB64}.${payloadB64}`;

    const privateKey = await crypto.subtle.importKey(
      "jwk" as any,
      privateKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateKey,
      encoder.encode(toSign)
    );
    const sigB64 = arrayBufferToBase64Url(signature);

    return `${toSign}.${sigB64}`;
  } catch (err: any) {
    throw new Error(`Falha no motor criptográfico ao assinar JWT: ${err.message}`);
  }
}

export async function verificarJWT(
  jwt: string,
  publicKeyJwk?: JsonWebKey
): Promise<{ header: any; payload: any; signature: string; valid: boolean }> {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) {
      throw new Error("JWT malformado: Estrutura diferente de 3 partições (header.payload.signature).");
    }

    const headerB64 = parts[0]!;
    const payloadB64 = parts[1]!;
    const signatureB64 = parts[2]!;
    const decoder = new TextDecoder();

    const headerJson = decoder.decode(base64UrlToArrayBuffer(headerB64));
    const payloadJson = decoder.decode(base64UrlToArrayBuffer(payloadB64));
    
    let header, payload;
    try {
      header = JSON.parse(headerJson);
      payload = JSON.parse(payloadJson);
    } catch (_parseErr) {
      throw new Error("Conteúdo interno do JWT não é um JSON válido.");
    }

    let publicKeyJwkFinal = publicKeyJwk;
    if (!publicKeyJwkFinal) {
      if (!header.kid) {
        throw new Error("Header JWT não contém a propriedade 'kid' (Key ID) e nenhuma chave pública externa foi fornecida.");
      }
      publicKeyJwkFinal = expandVapidPublic(header.kid);
    } else {
      publicKeyJwkFinal = expandVapidPublic(publicKeyJwkFinal);
    }

    const publicKey = await crypto.subtle.importKey(
      "jwk" as any,
      publicKeyJwkFinal as JsonWebKey,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );

    const toSign = `${headerB64}.${payloadB64}`;
    const signatureBytes = base64UrlToArrayBuffer(signatureB64);

    const encoder = new TextEncoder();
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      signatureBytes,
      encoder.encode(toSign)
    );

    return { header, payload, signature: signatureB64, valid };
  } catch (err: any) {
    throw new Error(`Falha na verificação de integridade do JWT: ${err.message}`);
  }
}

export function decodificarJWT(jwt: string): { header: any; payload: any; signature: string } {
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    throw new Error("JWT malformado. Leitura interrompida.");
  }

  const headerB64 = parts[0]!;
  const payloadB64 = parts[1]!;
  const signatureB64 = parts[2]!;
  const decoder = new TextDecoder();

  try {
    const headerJson = decoder.decode(base64UrlToArrayBuffer(headerB64));
    const payloadJson = decoder.decode(base64UrlToArrayBuffer(payloadB64));

    return {
      header: JSON.parse(headerJson),
      payload: JSON.parse(payloadJson),
      signature: signatureB64
    };
  } catch (err: any) {
    throw new Error(`Falha de decodificação forçada no JWT: ${err.message}`);
  }
}