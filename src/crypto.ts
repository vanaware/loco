export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

export interface PeerData {
  endpoint?: string;
  keys?: { p256dh: string; auth: string };
  vapidPublicKey?: string;
  id: string;
}

export function bufToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(
    /=+$/,
    "",
  );
}

export function base64ToBuf(base64: string): Uint8Array {
  const padded = base64.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4;
  const fixed = pad ? padded + "=".repeat(4 - pad) : padded;
  const binary = atob(fixed);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function generateVapidKeys(): Promise<VapidKeys> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey(
    "jwk",
    keyPair.privateKey,
  );

  return {
    publicKey: bufToBase64(publicKeyRaw),
    privateKey: privateKeyJwk.d || "",
  };
}

/**
 * Envia push direto para o endpoint do peer.
 * Nota: Implementação simplificada — envia payload como JSON.
 * Para Web Push completo (RFC 8291), seria necessário um relay server
 * que faça a criptografia do payload com as chaves do subscriber.
 */
export async function sendPushDirect(
  peer: PeerData,
  payload: string,
  _vapidKeys: VapidKeys,
): Promise<Response | void> {
  if (!peer.endpoint) {
    console.warn("Endpoint do peer não disponível");
    return;
  }
  const response = await fetch(peer.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "TTL": "86400",
    },
    body: JSON.stringify({
      type: "webpush",
      data: payload,
    }),
  });

  if (!response.ok && response.status !== 201) {
    throw new Error(`Push failed: ${response.status} ${response.statusText}`);
  }

  return response;
}
