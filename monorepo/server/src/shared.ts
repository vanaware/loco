// server/shared.ts
import { 
  expandRsaPublic, 
  expandRsaPrivate, 
  minifyRsaPublic,
  importJWKToKey
} from "../../../src/utils/crypto-utils.ts";
import { decifrarChaveVapid } from "../../../src/utils/push-utils.ts";

export { APP_VERSION } from "../../../src/constants/version.ts";

export { extrairEExpandirChavesVapid } from "../../../src/utils/push-utils.ts";

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

  if (!publicKeyStr || !privateKeyStr) {
    throw new Error("❌ Chaves SERVER_PUBLIC_KEY ou SERVER_PRIVATE_KEY não encontradas no ambiente!");
  }

  try {
    const rawPublicKeyJwk = JSON.parse(publicKeyStr);
    const rawPrivateKeyJwk = JSON.parse(privateKeyStr);

    // Expansão Oficial via PWA Utils
    const publicKeyJwk = expandRsaPublic(rawPublicKeyJwk);
    const privateKeyJwk = expandRsaPrivate(rawPrivateKeyJwk, publicKeyJwk);
    const minifiedPublicKey = minifyRsaPublic(publicKeyJwk);

    // Importação Oficial via PWA Utils
    const serverPrivateKey = await importJWKToKey(
      privateKeyJwk, 
      { name: "RSA-OAEP", hash: "SHA-256" }, 
      true, 
      ["decrypt"]
    );

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
  
  // 🔥 LÓGICA HIPER-ENXUTA: O Servidor apenas chama a rotina idêntica do Cliente
  return await decifrarChaveVapid(base64Envelope, serverPrivateKey);
}