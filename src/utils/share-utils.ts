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
  vp: any; 
  ep: any; 
  se: string;
  sp: string;
  sa: string;
  ve: string;
  ps?: string; 
}

export function extrairDadosCompactos(target: ProfileConfig | Contato, req = false, tr = false): CompactContact {
  let ep = target.subscription.endpoint;
  if (ep.startsWith(FCM_PREFIX)) ep = "1:" + ep.replace(FCM_PREFIX, "");

  return {
    req,
    tr,
    em: target.email || '',
    nm: target.name || '',
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

export async function processarQualquerConvite(rawInput: string): Promise<Partial<Contato>> {
  let cqr: string | null = null;
  let cjwt: string | null = null;
  let jwt: string | null = null;

  // 🔥 ARQUITETURA: Higienização inicial
  const input = rawInput.trim();

  // 1. Extração Segura de URL (Inteligência para o Roteamento Hash do Loco)
  try {
    if (input.includes('://') || input.startsWith('http')) {
      const url = new URL(input);
      
      // O formato oficial do Loco transporta o token no hash (#share=XYZ)
      if (url.hash && url.hash.includes('share=')) {
        const extracted = url.hash.split('share=')[1]?.split('&')[0];
        if (extracted) cjwt = extracted;
      } else {
        // Retrocompatibilidade para query params
        cqr = url.searchParams.get('cqr');
        cjwt = url.searchParams.get('cjwt');
        jwt = url.searchParams.get('jwt');
      }
    }
  } catch (e) {
    // Ignora erro de parsing da URL nativa e confia no fallback
  }

  // 2. Extração via texto puro (Caso a API de URL falhe ou falte protocolo)
  if (!cqr && !cjwt && !jwt) {
    if (input.includes('#share=')) {
      cjwt = input.split('#share=')[1]?.split('&')[0] || null;
    } else if (input.includes('cjwt=')) {
      cjwt = input.split('cjwt=')[1]?.split('&')[0] || null;
    } else if (input.includes('cqr=')) {
      cqr = input.split('cqr=')[1]?.split('&')[0] || null;
    } else if (input.includes('jwt=')) {
      jwt = input.split('jwt=')[1]?.split('&')[0] || null;
    }
  }

  // 3. Chute cego defensivo (O usuário colou SÓ o token sem nenhum prefixo)
  if (!cqr && !cjwt && !jwt && input) {
    // 🔥 ARQUITETURA: Um JWT padrão tem exatas 3 partições separadas por pontos. 
    // Protegemos contra URLs puras (que tem pontos no domínio) exigindo que não contenha '://'.
    if (input.split('.').length === 3 && !input.includes('://')) {
      jwt = input;
    } else {
      // Tenta descomprimir cegamente assumindo que é um token comprimido nu (cjwt/cqr)
      try {
        const cleanBase64 = input.replace(/[^A-Za-z0-9\-_]/g, ''); 
        const compressed = new Uint8Array(base64UrlToArrayBuffer(cleanBase64));
        const decompressed = gunzipSync(compressed);
        const text = new TextDecoder().decode(decompressed);
        
        if (text.startsWith('{')) {
          cqr = cleanBase64;
        } else {
          cjwt = cleanBase64;
        }
      } catch (_e) {
        // Fallback final: se tudo falhar, tenta jogar o input bruto pro validador cjwt
        cjwt = input;
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

  if (!compactData) throw new Error("O link ou código colado não é um convite válido do Loco.");

  // Camada de Retrocompatibilidade O(1):
  if ((compactData as any).vx && !compactData.vp) {
    compactData.vp = { x: (compactData as any).vx, y: (compactData as any).vy };
    compactData.ep = { n: (compactData as any).en };
  }

  return expandirDadosCompactos(compactData);
}