// src/utils/jwt-helpers.ts

// ============================================================
// UTILITÁRIOS BASE64URL
// ============================================================

export function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToArrayBuffer(base64Url: string): ArrayBuffer {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ============================================================
// FUNÇÃO GENÉRICA: CRIAR JWT
// ============================================================

/**
 * Cria um JWT assinado com ES256 (ECDSA P-256 + SHA-256).
 * @param payload - Objeto com os dados do payload (será convertido para JSON).
 * @param privateKeyJwk - Chave privada VAPID em formato JWK.
 * @param headerExtra - Campos extras para o header (ex: { kid: ... }).
 * @returns JWT completo (string) no formato header.payload.signature.
 */
export async function criarJWT(
  payload: Record<string, any>,
  privateKeyJwk: JsonWebKey,
  headerExtra: Record<string, any> = {}
): Promise<string> {
  const header = { alg: "ES256", ...headerExtra };
  const encoder = new TextEncoder();

  const headerB64 = arrayBufferToBase64Url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = arrayBufferToBase64Url(encoder.encode(JSON.stringify(payload)));
  const toSign = `${headerB64}.${payloadB64}`;

  const privateKey = await crypto.subtle.importKey(
    "jwk",
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
}

// ============================================================
// FUNÇÃO GENÉRICA: VERIFICAR JWT
// ============================================================

/**
 * Verifica um JWT assinado com ES256.
 * Se publicKeyJwk for fornecido, usa-o; senão, extrai a chave do campo 'kid' do header.
 * Retorna { header, payload, signature, valid }.
 */
export async function verificarJWT(
  jwt: string,
  publicKeyJwk?: JsonWebKey
): Promise<{ header: any; payload: any; signature: string; valid: boolean }> {
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    throw new Error("JWT inválido: deve ter 3 partes separadas por '.'");
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const decoder = new TextDecoder();

  const headerJson = decoder.decode(base64UrlToArrayBuffer(headerB64));
  const payloadJson = decoder.decode(base64UrlToArrayBuffer(payloadB64));
  const header = JSON.parse(headerJson);
  const payload = JSON.parse(payloadJson);

  let publicKeyJwkFinal = publicKeyJwk;
  if (!publicKeyJwkFinal) {
    if (!header.kid) {
      throw new Error("Header JWT não contém 'kid' e nenhuma chave pública foi fornecida.");
    }
    publicKeyJwkFinal = header.kid;
  }

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    publicKeyJwkFinal,
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
}

// ============================================================
// FUNÇÃO GENÉRICA: DECODIFICAR JWT (sem verificar assinatura)
// ============================================================

/**
 * Decodifica um JWT sem verificar a assinatura (apenas para leitura).
 * Retorna { header, payload, signature }.
 */
export function decodificarJWT(jwt: string): { header: any; payload: any; signature: string } {
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    throw new Error("JWT inválido: deve ter 3 partes separadas por '.'");
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const decoder = new TextDecoder();

  const headerJson = decoder.decode(base64UrlToArrayBuffer(headerB64));
  const payloadJson = decoder.decode(base64UrlToArrayBuffer(payloadB64));

  return {
    header: JSON.parse(headerJson),
    payload: JSON.parse(payloadJson),
    signature: signatureB64
  };
}