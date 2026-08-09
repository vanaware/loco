// src/utils/share-utils.ts
import { gzipSync, gunzipSync } from 'fflate';
import { criarJWT, verificarJWT, base64UrlToArrayBuffer, arrayBufferToBase64Url } from './jwt-helpers.ts';
import type { ProfileConfig, Contato } from '../constants/db.ts';

const FCM_PREFIX = "https://fcm.googleapis.com/fcm/send/";

// A interface unificada de compressão (usada no QR Code, Link e Handshake)
export interface CompactContact {
  req?: boolean; // Pede resposta?
  tr?: boolean;  // Confia?
  em: string;    // email
  nm: string;    // name
  vx: string;    // vapid X
  vy: string;    // vapid Y
  en: string;    // e2e N (RSA modulus)
  se: string;    // sub endpoint
  sp: string;    // sub p256dh
  sa: string;    // sub auth
  ve: string;    // vapid envelope
}

/**
 * Pega um Profile ou Contato e espreme no menor formato possível.
 */
export function extrairDadosCompactos(target: ProfileConfig | Contato, req = false, tr = false): CompactContact {
  let ep = target.subscription.endpoint;
  if (ep.startsWith(FCM_PREFIX)) ep = "1:" + ep.replace(FCM_PREFIX, "");

  return {
    req,
    tr,
    em: target.email || '',
    nm: target.name || '',
    vx: target.vapidPublicKey.x!,
    vy: target.vapidPublicKey.y!,
    en: target.e2ePublicKey.n!,
    se: ep,
    sp: target.subscription.keys.p256dh,
    sa: target.subscription.keys.auth,
    ve: target.vapidPrivateKeyEnvelope
  };
}

/**
 * Pega o pacote espremido da rede/qr code e reconstrói as chaves JWK completas.
 */
export function expandirDadosCompactos(c: CompactContact): Partial<Contato> {
  let ep = c.se;
  if (ep.startsWith("1:")) ep = FCM_PREFIX + ep.substring(2);

  return {
    email: c.em,
    name: c.nm,
    vapidPublicKey: { kty: "EC", crv: "P-256", x: c.vx, y: c.vy, ext: true },
    e2ePublicKey: { kty: "RSA", e: "AQAB", n: c.en, alg: "RSA-OAEP-256", ext: true },
    subscription: { endpoint: ep, keys: { p256dh: c.sp, auth: c.sa } },
    vapidPrivateKeyEnvelope: c.ve,
    trusted: c.tr,
    me: 'saved' // Status base de recepção
  };
}

export function gerarPayloadQrCodeCompacto(target: ProfileConfig | Contato): string {
  const compact = extrairDadosCompactos(target);
  const jsonBytes = new TextEncoder().encode(JSON.stringify(compact));
  const compressed = gzipSync(jsonBytes);
  return arrayBufferToBase64Url(compressed.buffer);
}

export async function gerarLinkConviteWeb(
  target: ProfileConfig | Contato,
  myVapidPrivateKeyJwk: JsonWebKey,
  myVapidPublicKeyJwk: JsonWebKey
): Promise<string> {
  const compact = extrairDadosCompactos(target);
  const payload = {
    sub: "contact",
    ...compact,
    iat: Math.floor(Date.now() / 1000)
  };

  const jwt = await criarJWT(payload, myVapidPrivateKeyJwk, { kid: myVapidPublicKeyJwk });
  const jwtBytes = new TextEncoder().encode(jwt);
  const compressed = gzipSync(jwtBytes);
  const cjwt = arrayBufferToBase64Url(compressed.buffer);

  return `${window.location.origin}/share.html?cjwt=${cjwt}`;
}

export async function processarQualquerConvite(input: string): Promise<Partial<Contato>> {
  let cqr = null, cjwt = null, jwt = null;

  try {
    const url = new URL(input);
    cqr = url.searchParams.get('cqr');
    cjwt = url.searchParams.get('cjwt');
    jwt = url.searchParams.get('jwt');
  } catch {
    if (!input.includes('.')) cqr = input;
    else jwt = input;
  }

  let compactData: CompactContact | null = null;

  // Tenta ler binário do QR Code (cqr ou string pura sem pontos)
  if (cqr) {
    try {
      const compressed = new Uint8Array(base64UrlToArrayBuffer(cqr));
      const decompressed = gunzipSync(compressed);
      const jsonText = new TextDecoder().decode(decompressed);
      const parsed = JSON.parse(jsonText);
      
      // Compatibilidade retroativa com o Array de 11 posições antigo
      if (Array.isArray(parsed)) {
        let [email, name, vapidX, vapidY, rsaN, endpoint, p256dh, auth, b64Iv, b64Dados, b64Chave] = parsed;
        const b64ToHex = (b64: string) => Array.from(new Uint8Array(base64UrlToArrayBuffer(b64))).map(b => b.toString(16).padStart(2, '0')).join('');
        const envelope = { iv: b64ToHex(b64Iv), dadosCifrados: b64ToHex(b64Dados), chaveAesCifrada: b64ToHex(b64Chave) };
        compactData = { em: email, nm: name, vx: vapidX, vy: vapidY, en: rsaN, se: endpoint, sp: p256dh, sa: auth, ve: btoa(JSON.stringify(envelope)) };
      } else if (parsed.vx && parsed.vy) {
        compactData = parsed as CompactContact;
      }
    } catch (e) { /* fallback silêncioso */ }
  }

  const targetCjwt = cjwt || cqr;
  if (!compactData && targetCjwt) {
    const compressed = new Uint8Array(base64UrlToArrayBuffer(targetCjwt));
    const decompressed = gunzipSync(compressed);
    const jsonText = new TextDecoder().decode(decompressed);
    const { payload, valid } = await verificarJWT(jsonText);
    if (!valid) throw new Error("Assinatura do convite inválida ou corrompida.");
    compactData = payload as CompactContact;
  }

  if (!compactData && jwt) {
    const { payload, valid } = await verificarJWT(jwt);
    if (!valid) throw new Error("Assinatura do convite inválida.");
    compactData = payload as CompactContact;
  }

  if (!compactData) throw new Error("Formato de convite ou QR Code inválido.");

  return expandirDadosCompactos(compactData);
}