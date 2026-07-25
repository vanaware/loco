export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

export interface PeerData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  vapidPublicKey: string;
  id: string;
}

export function bufToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64ToBuf(base64: string): Uint8Array {
  const padded = base64.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function generateVapidKeys(): Promise<VapidKeys> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  
  return {
    publicKey: bufToBase64(publicKeyRaw),
    privateKey: privateKeyJwk.d || "",
  };
}

export async function sendPushDirect(
  peer: PeerData,
  payload: string,
  vapidKeys: VapidKeys
): Promise<Response> {
  const encoder = new TextEncoder();
  
  const subscription = {
    endpoint: peer.endpoint,
    keys: peer.keys,
  };

  // Web Push direto usando fetch (navegador -> servidor push do destino)
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "TTL": "86400",
      "Encryption": `salt=${generateSalt()}`,
      "Crypto-Key": `dh=${peer.keys.p256dh}`,
    },
    body: encoder.encode(payload),
  });

  return response;
}

function generateSalt(): string {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return bufToBase64(salt.buffer);
}
