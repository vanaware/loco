// src/utils/jwt-helpers.ts
import { 
  minifyVapidPublic, 
  expandVapidPublic,
  bufferToBase64Url,
  base64UrlToBuffer
} from "./mod.ts";


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

    const headerB64 = bufferToBase64Url(headerEnc.buffer as ArrayBuffer);
    const payloadB64 = bufferToBase64Url(payloadEnc.buffer as ArrayBuffer);
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
    const sigB64 = bufferToBase64Url(signature);

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

    const headerJson = decoder.decode(base64UrlToBuffer(headerB64));
    const payloadJson = decoder.decode(base64UrlToBuffer(payloadB64));
    
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
    const signatureBytes = base64UrlToBuffer(signatureB64);

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
    const headerJson = decoder.decode(base64UrlToBuffer(headerB64));
    const payloadJson = decoder.decode(base64UrlToBuffer(payloadB64));

    return {
      header: JSON.parse(headerJson),
      payload: JSON.parse(payloadJson),
      signature: signatureB64
    };
  } catch (err: any) {
    throw new Error(`Falha de decodificação forçada no JWT: ${err.message}`);
  }
}