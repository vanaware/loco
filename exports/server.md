> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém múltiplos arquivos do projeto **Loco v0.2.178-msxsid27** (CÓDIGO FONTE) estruturados em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco [v0.2.178-msxsid27] - Modo: SERVER

Gerado automaticamente em: 8/17/2026, 7:21:00 PM

---

## Arquivo: `server/functions/ping.ts`

```ts

import { sendResponse, handlePreflight } from "../shared.ts";

export async function handlePing(request: Request, env?: any): Promise<Response> {
  return sendResponse(request, { success: true, service: "loco-proxy", timestamp: Date.now() });
}

export const onRequestPost = async (context: any) => {
  return await handlePing(context.request, context.env);
};

export const onRequestOptions = async (context: any) => {
  return handlePreflight(context.request);;
};

```

---

## Arquivo: `server/functions/publickey.ts`

```ts


import { sendResponse, handlePreflight, getOrInitServerKeys } from "../shared.ts";

export async function handlePublicKey(request: Request, env?: any): Promise<Response> {
  const { serverPublicKeyMinified } = await getOrInitServerKeys(env);
  return sendResponse(request, serverPublicKeyMinified);
}

export const onRequestPost = async (context: any) => {
  return await handlePublicKey(context.request, context.env);
};

export const onRequestOptions = async (context: any) => {
  return handlePreflight(context.request);;
};
```

---

## Arquivo: `server/functions/push.ts`

```ts


import { sendResponse, handlePreflight, decryptWithServerKey } from "../shared.ts";
import * as webpush from "@negrel/webpush";

function lerMetadadosJJWT(jwtString: string) {
  try {
    const parts = jwtString.split(".");
    if (parts.length !== 3) return null;
    
    const payloadPart = parts[1];
    if (!payloadPart) return null;
    
    let base64Url = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    while (base64Url.length % 4) base64Url += "=";
    return JSON.parse(new TextDecoder().decode(new Uint8Array([...atob(base64Url)].map(c => c.charCodeAt(0)))));
  } catch {
    return null;
  }
}

async function parseVapidKeysToJwk(env: any, publicKey: any, privateKey: any) {
  try {
    const privateKeyFinal = await decryptWithServerKey(env, privateKey);
    const pub = typeof publicKey === "string" ? JSON.parse(publicKey) : publicKey;
    const priv = typeof privateKeyFinal === "string" ? JSON.parse(privateKeyFinal) : privateKeyFinal;
    const expandedPub = pub.kty ? pub : { kty: "EC", crv: "P-256", x: pub.x, y: pub.y, ext: true, key_ops: ["verify"] };
    const expandedPriv = priv.kty ? priv : { kty: "EC", crv: "P-256", x: expandedPub.x, y: expandedPub.y, d: priv.d, ext: true, key_ops: ["sign"] };
    return { publicKey: expandedPub, privateKey: expandedPriv };
  } catch (err) {
    throw new Error(`JWK inválido: ${err}`);
  }
}

async function sendPush(jwkKeys: any, subscription: any, payloadText: string, vapid: any) {
  const vapidKeys = await webpush.importVapidKeys(jwkKeys);
  const contact = vapid.subject.startsWith("mailto:") ? vapid.subject : `mailto:${vapid.subject}`;
  const appServer = await webpush.ApplicationServer.new({
    contactInformation: contact,
    vapidKeys: vapidKeys,
  });
  const subscriber = appServer.subscribe(subscription);
  try {
    await subscriber.pushTextMessage(payloadText, {});
  } catch (pushErr: any) {
    throw new Error(`O provedor de Push (Google/Apple) rejeitou o pacote: ${pushErr.message}`);
  }
}

async function routePush(proxyserverDestino: string, rawText: string, request: Request): Promise<Response> {
  try {   
    const baseUrl = proxyserverDestino.startsWith("http") ? proxyserverDestino : `https://${proxyserverDestino}`;
    const urlFormatada = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const urlDestinoObj = new URL(`${urlFormatada}/push`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); 

    const relayResponse = await fetch(urlDestinoObj.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "User-Agent": "Loco-Federation-Relay/1.0"
      },
      body: rawText,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!relayResponse.ok) {
      const contentType = relayResponse.headers.get("content-type") || "";
      let errText = "";
      if (relayResponse.status >= 500 || contentType.includes("text/html")) {
        errText = `Servidor destino (${urlDestinoObj.toString()}) offline ou recusou conexão.`;
      } else {
        errText = await relayResponse.text();
        errText = errText.replace(/<[^>]*>?/gm, "").replace(/\n|\r/g, " ").substring(0, 100) + "...";
      }
      throw new Error(errText);
    }
    return sendResponse(request, { success: true, federated: true, target: urlDestinoObj.toString() });
  } catch (relayErr: any) {
    return sendResponse(request, { success: false, error: `Falha na ponte: ${relayErr.message}` }, 424);
  }
}

export async function handlePush(request: Request, env?: any): Promise<Response> {

  const url = new URL(request.url);
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > 8192) {
    return sendResponse(request, { success: false, error: "Payload Too Large" }, 413);
  }

  const rawText = await request.text();
  let body;
  try {
    body = JSON.parse(rawText);
  } catch (_e) {
    return sendResponse(request, { success: false, error: "Corpo não é JSON válido." }, 400);
  }

  const { subscription, payloadText, vapid } = body;
  if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !payloadText || !vapid || !vapid.privateKey) {
    return sendResponse(request, { success: false, error: "Estrutura P2P Inválida." }, 400);
  }

  const jwtClaims = lerMetadadosJJWT(payloadText);
  if (!jwtClaims || !jwtClaims.sub || !["hand", "contact"].includes(jwtClaims.sub)) {
    return sendResponse(request, { success: false, error: "Protocolo JWT Inválido." }, 400);
  }

  const proxyserverDestino = jwtClaims.proxyserver;

  // Prova de Posse (Proof of Ownership): Tentamos abrir o envelope com a nossa chave privada
  try {
    const jwkKeys = await parseVapidKeysToJwk(env, vapid.publicKey, vapid.privateKey);
    await sendPush(jwkKeys, subscription, payloadText, vapid);
    return sendResponse(request, { success: true });
  } catch (_decryptErr) {
    // O envelope pertence a outro nó na rede de federação
  }

  // Se o envelope não é nosso, avaliamos o roteamento de federação via DNS
  if (proxyserverDestino) {
    try {
      const urlFormatada = proxyserverDestino.startsWith("http") ? proxyserverDestino : `https://${proxyserverDestino}`;
      const destinoUrlObj = new URL(urlFormatada);
      
      if (url.hostname !== destinoUrlObj.hostname) {
        return await routePush(proxyserverDestino, rawText, request);
      }
    } catch (_e) {
      return sendResponse(request, { success: false, error: "URL de proxy do destino malformada." }, 400);
    }
  }

  return sendResponse(request, { success: false, error: "Falha ao descriptografar chave VAPID. Nó incorreto." }, 400);
}

export const onRequestPost = async (context: any) => {
  return await handlePush(context.request, context.env);
};

export const onRequestOptions = async (context: any) => {
  return handlePreflight(context.request);;
};
```

---

## Arquivo: `server/main.ts`

```ts
/// <reference lib="deno.ns" />

import { serveDir } from "@std/http/file-server";
import workerHandler from "./worker.ts";

const env = Deno.env.toObject()
Deno.serve({ port: Number(env?.PORT || 8000) }, async (req) => {    
    const url = new URL(req.url);
    const ctx = {
        waitUntil: (p: Promise<any>) => { p.catch(console.error); },
        passThroughOnException: () => {}
    };

// 1. Tenta processar a requisição através do workerHandler (APIs e Proxy Push)
    const workerResponse = await workerHandler.fetch(req, env, ctx);

    // 2. Se o worker processou com sucesso ou retornou erro de API (ex: 400, 403, 500), retorna o resultado dele
    if (workerResponse.status !== 404) {
        return workerResponse;
    }

    // 3. Se o worker retornou 404 (Endpoint não encontrado), significa que não é uma API.
    // Deixamos o serveDir processar para entregar o arquivo estático correspondente (HTML, JS, CSS, Ícones) do ./dist.
    try {
        const staticResponse = await serveDir(req, {
            fsRoot: "./build/dist",
            showDirListing: false,
            quiet: true,
        });

        // Se o arquivo estático foi encontrado e servido com sucesso, retorna-o
        if (staticResponse.status !== 404) {
            return staticResponse;
        }
    } catch {
        // Silencia erros de IO do disco
    }

    // 4. Se nem a API nem o disco possuíam o recurso, retorna o 404 limpo do worker
    return workerResponse; 

});

```

---

## Arquivo: `server/worker.ts`

```ts

/// <reference lib="deno.ns" />

import { sendResponse, handlePreflight } from "./shared.ts";
import { handlePing } from "./functions/ping.ts";
import { handlePublicKey } from "./functions/publickey.ts";
import { handlePush } from "./functions/push.ts";

const workerHandler = {
  async fetch(request: Request, env: any, _ctx: any): Promise<Response> {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname;
      const method = request.method;

      if (method === "OPTIONS") {
          return handlePreflight(request);
      }

      if (method === "POST") {
        // Roteamento explícito delegando a execução para os handlers importados
        switch (pathname) {
          case "/ping":
            return await handlePing(request, env);

          case "/publickey":
            return await handlePublicKey(request, env);

          case "/push":
            return await handlePush(request, env);

          default:
            return sendResponse(request, { error: `Rota '${pathname}' não encontrada no Worker.` }, 404);
        }
      } else {
        return sendResponse(request, { error: `Método '${method}' não encontrado no Worker.` }, 404);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // [WORKER EXCEPTION]: ${errorMessage}
      return sendResponse(request, { success: false, error: errorMessage }, 400);
    }
  },
};

export default workerHandler;
```

---

## Arquivo: `server/shared.ts`

```ts
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
```

---

