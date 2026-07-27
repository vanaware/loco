import type { VapidKeyPair } from "./types.ts";

export function bufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function base64UrlToBuffer(base64Url: string): ArrayBuffer {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function generateVapidKeys(): Promise<VapidKeyPair> {
  console.log("[crypto] 🔑 Gerando par de chaves VAPID (ECDSA P-256)...");
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  console.log("[crypto] ✅ Par de chaves gerado com sucesso");
  
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  
  console.log("[crypto] 🔓 Public JWK:", JSON.stringify(publicJwk).slice(0, 80) + "...");
  console.log("[crypto] 🧩 Private JWK (parcial): kty=" + privateJwk.kty + ", alg=" + privateJwk.alg + ", crv=" + privateJwk.crv);
  return { publicJwk, privateJwk };
}

export async function exportPublicKeyRaw(jwk: JsonWebKey): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
  return crypto.subtle.exportKey("raw", key);
}

export async function createJwtVapid(privateJwk: JsonWebKey, endpoint: string): Promise<string> {
  console.log("[crypto] 🎫 Criando JWT VAPID...");
  const urlObj = new URL(endpoint);
  const aud = `${urlObj.protocol}//${urlObj.host}`;
  console.log("[crypto] 📍 Audience:", aud);

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const header = { alg: "ES256", typ: "JWT" };
  const payload = {
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: "mailto:p2p@loco.local",
  };
  console.log("[crypto] 🔧 Header:", JSON.stringify(header));
  console.log("[crypto] 📄 Payload:", JSON.stringify(payload));

  const encoder = new TextEncoder();
  const headerEncoded = bufferToBase64Url(encoder.encode(JSON.stringify(header)));
  const payloadEncoded = bufferToBase64Url(encoder.encode(JSON.stringify(payload)));
  const dataToSign = encoder.encode(`${headerEncoded}.${payloadEncoded}`);

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    privateKey,
    dataToSign,
  );

  const jwt = `${headerEncoded}.${payloadEncoded}.${bufferToBase64Url(signature)}`;
  console.log("[crypto] ✅ JWT gerado:", jwt.slice(0, 80) + "...");
  return jwt;
}

async function hmacSha256(key: ArrayBuffer, data: ArrayBuffer): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, data);
}

async function hkdfExtract(salt: ArrayBuffer, ikm: ArrayBuffer): Promise<ArrayBuffer> {
  const prk = await hmacSha256(salt, ikm);
  return prk;
}

async function hkdfExpand(prk: ArrayBuffer, info: ArrayBuffer, length: number): Promise<ArrayBuffer> {
  const hashLen = 32;
  const n = Math.ceil(length / hashLen);
  if (n > 255) throw new Error("Tamanho solicitado muito grande para HKDF-Expand");

  const okm = new Uint8Array(n * hashLen);
  let t = new Uint8Array(0);
  for (let i = 1; i <= n; i++) {
    const data = new Uint8Array(t.length + info.byteLength + 1);
    data.set(t, 0);
    data.set(new Uint8Array(info), t.length);
    data[data.length - 1] = i;
    const u = new Uint8Array(await hmacSha256(prk, data.buffer));
    okm.set(u, (i - 1) * hashLen);
    t = u;
  }
  return okm.slice(0, length).buffer;
}

export async function encryptPayloadWebPush(
  text: string,
  keys: { p256dh: string; auth: string },
): Promise<Uint8Array> {
  console.log("[crypto] 🔒 Criptografando payload Web Push (RFC 8291)...");
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(text);
  console.log("[crypto] 📝 Plaintext tamanho:", plaintext.length, "bytes");

  const p256dhBuffer = base64UrlToBuffer(keys.p256dh);
  const authBuffer = base64UrlToBuffer(keys.auth);
  console.log("[crypto] ✅ Chaves decodificadas - p256dh:", p256dhBuffer.byteLength, "bytes");

  const receiverPublic = await crypto.subtle.importKey(
    "raw",
    p256dhBuffer,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  console.log("[crypto] ✅ Chave pública do receptor importada");

  console.log("[crypto] 🔑 Gerando chaves efêmeras locais...");
  const localEphemeral = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const ephemeralPublicRaw = await crypto.subtle.exportKey("raw", localEphemeral.publicKey);
  console.log("[crypto] ✅ Chaves efêmeras geradas");

  console.log("[crypto] 🔗 Derivando shared secret via ECDH...");
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: receiverPublic },
    localEphemeral.privateKey,
    256,
  );
  console.log("[crypto] ✅ Shared secret derivado:", sharedSecret.byteLength, "bytes");

  console.log("[crypto] 🧂 Gerando salt aleatório...");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  console.log("[crypto] ✅ Salt gerado:", Array.from(salt.slice(0, 8)).map((b: number) => b.toString(16).padStart(2, '0')).join(':') + "...");

  // RFC 8291 §3.3: PRK = HKDF-Extract(auth_secret, shared_secret)
  console.log("[crypto] 🔐 HKDF-Extract com auth_secret e shared_secret...");
  const prk = await hkdfExtract(authBuffer, sharedSecret);
  console.log("[crypto] ✅ PRK gerado:", prk.byteLength, "bytes");

  // RFC 8291 §3.3: context = "WebPush: info" || 0x00 || len(ua) || ua || len(as) || as
  const receiverPub = new Uint8Array(p256dhBuffer);
  const senderPub = new Uint8Array(ephemeralPublicRaw);
  const ctxLen = 13 + 1 + 1 + receiverPub.byteLength + 1 + senderPub.byteLength;
  const context = new Uint8Array(ctxLen);
  let off = 0;
  context.set(encoder.encode("WebPush: info"), off); off += 13;
  context[off++] = 0x00;
  context[off++] = receiverPub.byteLength;
  context.set(receiverPub, off); off += receiverPub.byteLength;
  context[off++] = senderPub.byteLength;
  context.set(senderPub, off);
  console.log("[crypto] ✅ Context construído:", context.byteLength, "bytes");

  // CEK: HKDF-Expand(PRK, "aes128gcm" || 0x00 || context, 16)
  console.log("[crypto] 🔑 HKDF-Expand para CEK (Content Encryption Key)...");
  const keyInfo = new Uint8Array(10 + 1 + ctxLen);
  keyInfo.set(encoder.encode("aes128gcm"), 0);
  keyInfo[10] = 0x00;
  keyInfo.set(context, 11);
  const cek = await hkdfExpand(prk, keyInfo.buffer, 16);
  console.log("[crypto] ✅ CEK gerado: 16 bytes");

  // Nonce: HKDF-Expand(PRK, "nonce" || 0x00 || context, 12)
  console.log("[crypto] 🎲 HKDF-Expand para NONCE (IV)...");
  const nonceInfo = new Uint8Array(6 + 1 + ctxLen);
  nonceInfo.set(encoder.encode("nonce"), 0);
  nonceInfo[5] = 0x00;
  nonceInfo.set(context, 6);
  const nonce = await hkdfExpand(prk, nonceInfo.buffer, 12);
  console.log("[crypto] ✅ Nonce gerado:", Array.from(new Uint8Array(nonce)).map(b => b.toString(16).padStart(2, '0')).join(':'));

  console.log("[crypto] 🔑 Importando chave AES-GCM...");
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    cek,
    { name: "AES-GCM", length: 128 },
    false,
    ["encrypt"],
  );
  console.log("[crypto] ✅ Chave AES-GCM importada");

  console.log("[crypto] 🔐 Criptografando com AES-GCM...");
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: new Uint8Array(nonce) },
    cryptoKey,
    plaintext,
  );
  console.log("[crypto] ✅ Ciphertext gerado:", ciphertext.byteLength, "bytes");

  // Header: salt(16) || rs(4, big-endian 4096) || keyid_len(1) || keyid(65) || ciphertext
  const rs = new Uint8Array([0x00, 0x00, 0x10, 0x00]); // 4096
  const keyidLen = new Uint8Array([senderPub.byteLength]);

  const result = new Uint8Array(
    salt.length + rs.length + keyidLen.length + senderPub.byteLength + ciphertext.byteLength,
  );
  let o = 0;
  result.set(salt, o); o += salt.length;
  result.set(rs, o); o += rs.length;
  result.set(keyidLen, o); o += keyidLen.length;
  result.set(senderPub, o); o += senderPub.byteLength;
  result.set(new Uint8Array(ciphertext), o);

  console.log("[crypto] ✅ Payload criptografado concluído!");
  console.log("[crypto] 📦 Composição final:");
  console.log(`[crypto]   - Salt: ${salt.length} bytes`);
  console.log(`[crypto]   - RS: ${rs.length} bytes`);
  console.log(`[crypto]   - KeyID Length: ${keyidLen.length} bytes`);
  console.log(`[crypto]   - KeyID: ${senderPub.byteLength} bytes`);
  console.log(`[crypto]   - Ciphertext: ${ciphertext.byteLength} bytes`);
  console.log(`[crypto]   - TOTAL: ${result.length} bytes`);

  return result;
}
