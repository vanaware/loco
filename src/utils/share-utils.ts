// src/utils/share-utils.ts
import { gzipSync, gunzipSync } from 'fflate';
import { criarJWT, verificarJWT, base64UrlToArrayBuffer, arrayBufferToBase64Url } from './jwt-helpers.ts';
import type { ProfileConfig } from '../constants/db.ts';

const FCM_PREFIX = "https://fcm.googleapis.com/fcm/send/";

/**
 * Converte uma string Base64 / Base64Url para Uint8Array direto
 */
function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(base64UrlToArrayBuffer(b64));
}

/**
 * Converte Uint8Array diretamente para Base64Url sem inflar a memória
 */
function bytesToBase64Url(bytes: Uint8Array): string {
  return arrayBufferToBase64Url(bytes.buffer);
}

/**
 * 1. GERADOR DE QR CODE BINÁRIO (De-para direto de ArrayBuffer - Extremamente leve)
 */
export function gerarPayloadQrCodeCompacto(p: ProfileConfig): string {
  const envelopeObj = JSON.parse(atob(p.vapidPrivateKeyEnvelope));

  // Otimiza o endpoint tirando o prefixo repetitivo da Google
  let ep = p.subscription.endpoint;
  if (ep.startsWith(FCM_PREFIX)) {
    ep = "1:" + ep.replace(FCM_PREFIX, "");
  }

  // Decodifica strings Hex/Base64 para Uint8Arrays brutos
  const hexToBytes = (hex: string) => 
    new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));

  const ivBytes = hexToBytes(envelopeObj.iv);
  const dadosBytes = hexToBytes(envelopeObj.dadosCifrados);
  const chaveBytes = hexToBytes(envelopeObj.chaveAesCifrada);
  const rsaNBytes = base64ToBytes(p.e2ePublicKey.n!);

  // Estrutura ultra-compacta contendo valores convertidos/compactados
  const compactPayload = [
    p.email,
    p.name,
    p.vapidPublicKey.x,
    p.vapidPublicKey.y,
    bytesToBase64Url(rsaNBytes), // RSA Módulo em bytes limpos
    ep,
    p.subscription.keys.p256dh,
    p.subscription.keys.auth,
    bytesToBase64Url(ivBytes),
    bytesToBase64Url(dadosBytes),
    bytesToBase64Url(chaveBytes)
  ];

  // Comprime o JSON minimalista
  const jsonBytes = new TextEncoder().encode(JSON.stringify(compactPayload));
  const compressed = gzipSync(jsonBytes);

  return bytesToBase64Url(compressed);
}

/**
 * 2. GERADOR DE LINK DE CONVITE (JWT Assinado Comprimido para Web/WhatsApp)
 */
export async function gerarLinkConviteWeb(p: ProfileConfig, serverPublicKeyJwk: JsonWebKey): Promise<string> {
  const payload = {
    iss: p.email,
    sub: "contact",
    nm: p.name,
    p: p.e2ePublicKey,
    s: {
      endpoint: p.subscription.endpoint,
      keys: p.subscription.keys,
      k: p.vapidPrivateKeyEnvelope
    },
    iat: Math.floor(Date.now() / 1000)
  };

  const jwt = await criarJWT(payload, p.vapidPrivateKeyJwk, { kid: p.vapidPublicKey });
  
  const jwtBytes = new TextEncoder().encode(jwt);
  const compressed = gzipSync(jwtBytes);
  const cjwt = bytesToBase64Url(compressed);

  return `${window.location.origin}/share.html?cjwt=${cjwt}`;
}

/**
 * 3. PARSER UNIFICADO (Lê tanto QR Codes binários quanto Links cjwt/jwt)
 */
export async function processarQualquerConvite(input: string): Promise<{ header: any; payload: any }> {
  let cqr = null;
  let cjwt = null;
  let jwt = null;

  try {
    const url = new URL(input);
    cqr = url.searchParams.get('cqr');
    cjwt = url.searchParams.get('cjwt');
    jwt = url.searchParams.get('jwt');
  } catch {
    // Se colou código bruto no campo de texto
    if (!input.includes('.')) {
      cqr = input; // Tenta como payload binário
    } else {
      jwt = input;
    }
  }

  // CASO A: Payload Binário de QR Code
  if (cqr) {
    try {
      const compressed = base64ToBytes(cqr);
      const decompressed = gunzipSync(compressed);
      const jsonText = new TextDecoder().decode(decompressed);
      const data = JSON.parse(jsonText);

      if (Array.isArray(data) && data.length === 11) {
        let [email, name, vapidX, vapidY, rsaN, endpoint, p256dh, auth, b64Iv, b64Dados, b64Chave] = data;

        // Reconstitui o endpoint FCM se tiver sido tokenizado
        if (endpoint.startsWith("1:")) {
          endpoint = FCM_PREFIX + endpoint.substring(2);
        }

        // Reconstitui o Envelope Hexadecimal a partir do Base64
        const b64ToHex = (b64: string) => {
          const bytes = base64ToBytes(b64);
          return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        };

        const envelope = {
          iv: b64ToHex(b64Iv),
          dadosCifrados: b64ToHex(b64Dados),
          chaveAesCifrada: b64ToHex(b64Chave)
        };

        return {
          header: {
            kid: { kty: "EC", crv: "P-256", x: vapidX, y: vapidY }
          },
          payload: {
            iss: email,
            nm: name,
            p: { kty: "RSA", e: "AQAB", n: rsaN, alg: "RSA-OAEP-256", ext: true },
            s: {
              endpoint: endpoint,
              keys: { p256dh, auth },
              k: btoa(JSON.stringify(envelope))
            }
          }
        };
      }
    } catch (e) {
      // Se falhar o parse do binário, cai pro CJWT
    }
  }

  // CASO B: JWT Comprimido (Link Web / WhatsApp)
  const targetCjwt = cjwt || cqr;
  if (targetCjwt) {
    const compressed = base64ToBytes(targetCjwt);
    const decompressed = gunzipSync(compressed);
    const jsonText = new TextDecoder().decode(decompressed);

    const { header, payload, valid } = await verificarJWT(jsonText);
    if (!valid) throw new Error("Assinatura do convite inválida ou corrompida.");
    return { header, payload };
  }

  // CASO C: JWT Legado (Não comprimido)
  if (jwt) {
    const { header, payload, valid } = await verificarJWT(jwt);
    if (!valid) throw new Error("Assinatura do convite inválida.");
    return { header, payload };
  }

  throw new Error("Formato de convite ou QR Code inválido.");
}