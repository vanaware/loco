// src/utils/share-utils.ts
import { gzipSync, gunzipSync } from 'fflate';
import { criarJWT, verificarJWT, base64UrlToArrayBuffer, arrayBufferToBase64Url } from './jwt-helpers.ts';
import type { ProfileConfig, Contato } from '../constants/db.ts';

const FCM_PREFIX = "https://fcm.googleapis.com/fcm/send/";

/**
 * Interface normalizada para compartilhamento de identidades (Perfil próprio ou Contato)
 */
export interface ShareableIdentity {
  email: string;
  name: string;
  vapidPublicKey: JsonWebKey;
  e2ePublicKey: JsonWebKey;
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  vapidPrivateKeyEnvelope: string;
}

/**
 * Converte um ProfileConfig ou Contato em uma estrutura normalizada de compartilhamento
 * 
 * @param {ProfileConfig | Contato} target - Perfil do usuário ou objeto de Contato
 * @returns {ShareableIdentity} Estrutura padronizada para geração de convites
 */
function toShareable(target: ProfileConfig | Contato): ShareableIdentity {
  if ('vapidPrivateKeyEnvelope' in target) {
    return {
      email: target.email,
      name: target.name,
      vapidPublicKey: target.vapidPublicKey,
      e2ePublicKey: target.e2ePublicKey,
      subscription: target.subscription,
      vapidPrivateKeyEnvelope: target.vapidPrivateKeyEnvelope
    };
  }
  return {
    email: target.email,
    name: target.nome,
    vapidPublicKey: target.publicKeyVapid,
    e2ePublicKey: target.publicKeyRSA,
    subscription: target.subscription,
    vapidPrivateKeyEnvelope: target.vapidPrivateKey
  };
}

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
 * Generates a high-density binary payload for QR Code rendering (sub-650 bytes).
 * Works for both My Profile and Saved Contacts.
 * 
 * @param {ProfileConfig | Contato} target - Perfil próprio ou Contato a ser compartilhado
 * @returns {string} Payload compactado codificado em Base64Url
 */
export function gerarPayloadQrCodeCompacto(target: ProfileConfig | Contato): string {
  const p = toShareable(target);
  const envelopeObj = JSON.parse(atob(p.vapidPrivateKeyEnvelope));

  // Otimiza o endpoint tirando o prefixo repetitivo do FCM Google
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

  // Tupla ordenada sem nomes de propriedades JSON para zerar overhead
  const compactPayload = [
    p.email,
    p.name,
    p.vapidPublicKey.x,
    p.vapidPublicKey.y,
    bytesToBase64Url(rsaNBytes),
    ep,
    p.subscription.keys.p256dh,
    p.subscription.keys.auth,
    bytesToBase64Url(ivBytes),
    bytesToBase64Url(dadosBytes),
    bytesToBase64Url(chaveBytes)
  ];

  const jsonBytes = new TextEncoder().encode(JSON.stringify(compactPayload));
  const compressed = gzipSync(jsonBytes);

  return bytesToBase64Url(compressed);
}

/**
 * Generates a GZIP-compressed web invitation link (cjwt) for WhatsApp/Web.
 * Works for both My Profile and Saved Contacts.
 * 
 * @param {ProfileConfig | Contato} target - Perfil próprio ou Contato a ser compartilhado
 * @param {JsonWebKey} myVapidPrivateKeyJwk - Chave privada VAPID de quem está assinando o convite
 * @param {JsonWebKey} myVapidPublicKeyJwk - Chave pública VAPID de quem está assinando
 * @returns {Promise<string>} URL de convite pronta para compartilhamento
 */
export async function gerarLinkConviteWeb(
  target: ProfileConfig | Contato,
  myVapidPrivateKeyJwk: JsonWebKey,
  myVapidPublicKeyJwk: JsonWebKey
): Promise<string> {
  const p = toShareable(target);

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

  const jwt = await criarJWT(payload, myVapidPrivateKeyJwk, { kid: myVapidPublicKeyJwk });
  
  const jwtBytes = new TextEncoder().encode(jwt);
  const compressed = gzipSync(jwtBytes);
  const cjwt = bytesToBase64Url(compressed);

  return `${window.location.origin}/share.html?cjwt=${cjwt}`;
}

/**
 * Unified parser that decodes any QR Code binary payload (cqr) or Web Link (cjwt / jwt).
 * 
 * @param {string} input - URL recebida, parâmetro cjwt/cqr ou código bruto
 * @returns {Promise<{ header: any; payload: any }>} Estrutura do contato decodificado
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
    if (!input.includes('.')) {
      cqr = input;
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

        if (endpoint.startsWith("1:")) {
          endpoint = FCM_PREFIX + endpoint.substring(2);
        }

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
      // Falha no parse do binário, prossegue para testar como JWT
    }
  }

  // CASO B: JWT Comprimido (Link Web)
  const targetCjwt = cjwt || cqr;
  if (targetCjwt) {
    const compressed = base64ToBytes(targetCjwt);
    const decompressed = gunzipSync(compressed);
    const jsonText = new TextDecoder().decode(decompressed);

    const { header, payload, valid } = await verificarJWT(jsonText);
    if (!valid) throw new Error("Assinatura do convite inválida ou corrompida.");
    return { header, payload };
  }

  // CASO C: JWT Legado
  if (jwt) {
    const { header, payload, valid } = await verificarJWT(jwt);
    if (!valid) throw new Error("Assinatura do convite inválida.");
    return { header, payload };
  }

  throw new Error("Formato de convite ou QR Code inválido.");
}