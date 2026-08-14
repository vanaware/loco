// src/utils/share-utils.ts
import { gzipSync, gunzipSync } from 'fflate';
import { criarJWT, verificarJWT, base64UrlToArrayBuffer, arrayBufferToBase64Url } from './jwt-helpers.ts';
import { minifyVapidPublic, expandVapidPublic, minifyRsaPublic, expandRsaPublic } from './crypto-utils.ts';
import type { ProfileConfig, Contato } from '../constants/db.ts';

const FCM_PREFIX = "https://fcm.googleapis.com/fcm/send/";

export interface CompactContact {
  req?: boolean;
  tr?: boolean;
  em: string;
  nm: string;
  vp: any; // 🔥 Chave VAPID Pública Minificada
  ep: any; // 🔥 Chave RSA Pública E2E Minificada
  se: string;
  sp: string;
  sa: string;
  ve: string;
  ps?: string; // proxyserver
}

export function extrairDadosCompactos(target: ProfileConfig | Contato, req = false, tr = false): CompactContact {
  let ep = target.subscription.endpoint;
  if (ep.startsWith(FCM_PREFIX)) ep = "1:" + ep.replace(FCM_PREFIX, "");

  return {
    req,
    tr,
    em: target.email || '',
    nm: target.name || '',
    // 🔥 Delega a minificação para o módulo criptográfico oficial
    vp: minifyVapidPublic(target.vapidPublicKey),
    ep: minifyRsaPublic(target.e2ePublicKey),
    se: ep,
    sp: target.subscription.keys.p256dh,
    sa: target.subscription.keys.auth,
    ve: target.vapidPrivateKeyEnvelope,
    ps: target.subscription.proxyserver
  };
}

export function expandirDadosCompactos(c: CompactContact): Partial<Contato> {
  let ep = c.se;
  if (ep.startsWith("1:")) ep = FCM_PREFIX + ep.substring(2);

  return {
    email: c.em,
    name: c.nm,
    // 🔥 Expande a partir dos moldes estáticos padronizados
    vapidPublicKey: expandVapidPublic(c.vp),
    e2ePublicKey: expandRsaPublic(c.ep),
    subscription: { endpoint: ep, keys: { p256dh: c.sp, auth: c.sa }, proxyserver: c.ps },
    vapidPrivateKeyEnvelope: c.ve,
    trusted: c.tr,
    me: 'saved' 
  };
}

export function gerarPayloadQrCodeCompacto(target: ProfileConfig | Contato): string {
  const compact = extrairDadosCompactos(target);
  const jsonBytes = new TextEncoder().encode(JSON.stringify(compact));
  const compressed = gzipSync(jsonBytes);
  return arrayBufferToBase64Url(compressed.buffer as ArrayBuffer);
}

export async function gerarLinkConviteWeb(
  target: ProfileConfig | Contato,
  myVapidPrivateKeyJwk: JsonWebKey,
  myVapidPublicKeyJwk: JsonWebKey,
  baseUrl?: string
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
  const cjwt = arrayBufferToBase64Url(compressed.buffer as ArrayBuffer);

  const origin = baseUrl || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  return `${origin}/#share=${cjwt}`;
}

export async function processarQualquerConvite(input: string): Promise<Partial<Contato>> {
  let cqr = null, cjwt = null, jwt = null;

  try {
    const fullUrl = input.includes('://') || input.startsWith('/') || input.includes('?')
      ? input 
      : `http://localhost/?${input}`;
    const url = new URL(fullUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    cqr = url.searchParams.get('cqr');
    cjwt = url.searchParams.get('cjwt');
    jwt = url.searchParams.get('jwt');
  } catch {
    if (input.includes('cjwt=')) {
      const parts = input.split('cjwt=');
      if (parts[1]) cjwt = parts[1].split('&')[0];
    } else if (input.includes('cqr=')) {
      const parts = input.split('cqr=');
      if (parts[1]) cqr = parts[1].split('&')[0];
    } else if (input.includes('jwt=')) {
      const parts = input.split('jwt=');
      if (parts[1]) jwt = parts[1].split('&')[0];
    }
  }

  if (!cqr && !cjwt && !jwt && input) {
    if (input.includes('.')) {
      jwt = input.trim();
    } else {
      try {
        const compressed = new Uint8Array(base64UrlToArrayBuffer(input.trim()));
        const decompressed = gunzipSync(compressed);
        const text = new TextDecoder().decode(decompressed);
        
        if (text.startsWith('{')) {
          cqr = input.trim();
        } else {
          cjwt = input.trim();
        }
      } catch (_e) {
        cjwt = input.trim();
      }
    }
  }

  let compactData: CompactContact | null = null;

  if (!compactData && cjwt) {
    try {
      const compressed = new Uint8Array(base64UrlToArrayBuffer(cjwt));
      const decompressed = gunzipSync(compressed);
      const jsonText = new TextDecoder().decode(decompressed);
      
      const { payload, valid } = await verificarJWT(jsonText); 
      if (!valid) throw new Error("Assinatura do convite inválida ou corrompida.");
      if (payload) compactData = payload as CompactContact;
    } catch (e) {
      console.warn("Falha ao verificar cjwt:", e);
    }
  }

  if (!compactData && cqr) {
    try {
      const compressed = new Uint8Array(base64UrlToArrayBuffer(cqr));
      const decompressed = gunzipSync(compressed);
      const jsonText = new TextDecoder().decode(decompressed);
      const parsed = JSON.parse(jsonText);
      
      // Valida tanto o formato novo quanto o antigo
      if (parsed.vp || (parsed.vx && parsed.vy)) {
        compactData = parsed as CompactContact;
      }
    } catch (e) {
      console.warn("Falha ao ler cqr:", e);
    }
  }

  if (!compactData && jwt) {
    try {
      const { payload, valid } = await verificarJWT(jwt);
      if (!valid) throw new Error("Assinatura do convite inválida.");
      if (payload) compactData = payload as CompactContact;
    } catch (e) {
      console.warn("Falha ao verificar jwt:", e);
    }
  }

  if (!compactData) throw new Error("Formato de convite ou QR Code inválido.");

  // 🔥 Camada de Retrocompatibilidade O(1):
  // Se escaneou um QR Code antigo que usava vx/vy/en separadamente,
  // nós transmutamos na RAM para a estrutura unificada (vp/ep) antes de expandir.
  if ((compactData as any).vx && !compactData.vp) {
    compactData.vp = { x: (compactData as any).vx, y: (compactData as any).vy };
    compactData.ep = { n: (compactData as any).en };
  }

  return expandirDadosCompactos(compactData);
}