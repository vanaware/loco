let serverPrivateKeyCache: CryptoKey | null = null;
let serverPublicKeyJwkCache: JsonWebKey | null = null;
let serverPublicKeyMinifiedCache: any | null = null; 

export const DEFAULT_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Target-URL",
  "Access-Control-Max-Age": "86400",
};

function corsHeaders(request: Request): Headers {
  try {
    const headers = new Headers();
    const origin = request.headers.get("Origin") || "*";
    headers.set("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
    const reqHeaders = request.headers.get("Access-Control-Request-Headers");
    headers.set("Access-Control-Allow-Headers", reqHeaders || "*");
    headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Max-Age", "86400");
    headers.set("Vary", "Origin");
    return headers;
  } catch (_err) {
    return new Headers(DEFAULT_CORS_HEADERS);
  }
}

export function handlePreflight(request: Request): Response {
  const headers = corsHeaders(request);
  return new Response(null, { status: 204, headers });
}

export function sendResponse(request: Request, data: unknown, status = 200): Response {
  const headers = corsHeaders(request);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(data), { status, headers });
}

export async function getOrInitServerKeys(env: { SERVER_PUBLIC_KEY?: string; SERVER_PRIVATE_KEY?: string }) {
  if (serverPrivateKeyCache && serverPublicKeyJwkCache && serverPublicKeyMinifiedCache) {
    return { 
      serverPrivateKey: serverPrivateKeyCache, 
      serverPublicKeyJwk: serverPublicKeyJwkCache,
      serverPublicKeyMinified: serverPublicKeyMinifiedCache
    };
  }

  const publicKeyStr = env?.SERVER_PUBLIC_KEY;
  const privateKeyStr = env?.SERVER_PRIVATE_KEY;

  if (!publicKeyStr) {
    throw new Error("❌ Chave SERVER_PUBLIC_KEY não encontrada!");
  }
  
  if (!privateKeyStr) {
    throw new Error("❌ Chave SERVER_PRIVATE_KEY não encontrada!");
  }

  try {
    const rawPublicKeyJwk = JSON.parse(publicKeyStr);
    let publicKeyJwk = { ...rawPublicKeyJwk };
    let privateKeyJwk = JSON.parse(privateKeyStr);

    const minifiedPublicKey = rawPublicKeyJwk.kty ? { n: rawPublicKeyJwk.n } : rawPublicKeyJwk;

    if (!publicKeyJwk.kty) {
      publicKeyJwk = { kty: "RSA", alg: "RSA-OAEP-256", n: publicKeyJwk.n, e: "AQAB", ext: true, key_ops: ["encrypt"] };
    }

    if (!privateKeyJwk.kty) {
      privateKeyJwk = { kty: "RSA", alg: "RSA-OAEP-256", e: publicKeyJwk.e, n: publicKeyJwk.n, ext: true, key_ops: ["decrypt"], d: privateKeyJwk.d, p: privateKeyJwk.p, q: privateKeyJwk.q, dp: privateKeyJwk.dp, dq: privateKeyJwk.dq, qi: privateKeyJwk.qi };
    }

    const serverPrivateKey = await crypto.subtle.importKey("jwk" as any, privateKeyJwk, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["decrypt"]);

    serverPrivateKeyCache = serverPrivateKey;
    serverPublicKeyJwkCache = publicKeyJwk;
    serverPublicKeyMinifiedCache = minifiedPublicKey;

    return { serverPrivateKey, serverPublicKeyJwk: publicKeyJwk, serverPublicKeyMinified: minifiedPublicKey };
  } catch (err) {
    throw new Error(`Erro inicializando chaves: ${err}`);
  }
}

export async function decryptWithServerKey(env: { SERVER_PUBLIC_KEY?: string; SERVER_PRIVATE_KEY?: string }, base64Envelope: string): Promise<any> {
  const { serverPrivateKey } = await getOrInitServerKeys(env);
  
  // Tratamento seguro de Base64 e JSON parse
  let binaryString: string;
  try {
    binaryString = atob(base64Envelope);
  } catch (_e) {
    const base64Standard = base64Envelope.replace(/-/g, "+").replace(/_/g, "/");
    binaryString = atob(base64Standard);
  }

  const { iv, dadosCifrados, chaveAesCifrada } = JSON.parse(binaryString);

  const fromHex = (hex: string) => new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
  const ivBytes = fromHex(iv);
  const dadosBytes = fromHex(dadosCifrados);
  const chaveAesCifradaBytes = fromHex(chaveAesCifrada);

  const aesChaveCruaBuffer = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, serverPrivateKey, chaveAesCifradaBytes);
  const chaveSimetricaAes = await crypto.subtle.importKey("raw", aesChaveCruaBuffer, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const vapidOriginalBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, chaveSimetricaAes, dadosBytes);

  return JSON.parse(new TextDecoder().decode(vapidOriginalBuffer));
}