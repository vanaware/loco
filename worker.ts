// worker.ts
/// <reference lib="deno.ns" />

import * as webpush from "@negrel/webpush";

let serverPrivateKeyCache: CryptoKey | null = null;
let serverPublicKeyJwkCache: JsonWebKey | null = null;
let serverPublicKeyMinifiedCache: any | null = null; 

async function getOrInitServerKeys(env?: { SERVER_PUBLIC_KEY?: string; SERVER_PRIVATE_KEY?: string }) {
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

async function decryptWithServerKey(base64Envelope: string, serverPrivateKey: CryptoKey): Promise<any> {
  try {
    const envelopeText = atob(base64Envelope);
    const { iv, dadosCifrados, chaveAesCifrada } = JSON.parse(envelopeText);

    const fromHex = (hex: string) => new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
    const ivBytes = fromHex(iv);
    const dadosBytes = fromHex(dadosCifrados);
    const chaveAesCifradaBytes = fromHex(chaveAesCifrada);

    const aesChaveCruaBuffer = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, serverPrivateKey, chaveAesCifradaBytes);
    const chaveSimetricaAes = await crypto.subtle.importKey("raw", aesChaveCruaBuffer, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const vapidOriginalBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, chaveSimetricaAes, dadosBytes);

    return JSON.parse(new TextDecoder().decode(vapidOriginalBuffer));
  } catch (err) {
    throw new Error(`Falha VAPID E2E: ${err}`);
  }
}

function parseVapidKeysToJwk(publicKey: any, privateKey: any) {
  try {
    const pub = typeof publicKey === "string" ? JSON.parse(publicKey) : publicKey;
    const priv = typeof privateKey === "string" ? JSON.parse(privateKey) : privateKey;
    const expandedPub = pub.kty ? pub : { kty: "EC", crv: "P-256", x: pub.x, y: pub.y, ext: true, key_ops: ["verify"] };
    const expandedPriv = priv.kty ? priv : { kty: "EC", crv: "P-256", x: expandedPub.x, y: expandedPub.y, d: priv.d, ext: true, key_ops: ["sign"] };
    return { publicKey: expandedPub, privateKey: expandedPriv };
  } catch (err) {
    throw new Error(`JWK inválido: ${err}`);
  }
}

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

function createCorsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get("Origin") || "*";
  
  headers.set("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  
  const reqHeaders = request.headers.get("Access-Control-Request-Headers");
  headers.set("Access-Control-Allow-Headers", reqHeaders || "*");
  
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Vary", "Origin");
  
  return headers;
}

const workerHandler = {
  async fetch(request: Request, env: any, _ctx: any): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;
    
    const corsHeaders = createCorsHeaders(request);
    
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      const isPing = pathname.endsWith("/ping") || pathname.endsWith("/ping/");
      const isPublicKey = pathname.endsWith("/publickey") || pathname.endsWith("/publickey/");
      const isPushRoute = pathname.endsWith("/push") || pathname.endsWith("/push/");

      const { serverPrivateKey, serverPublicKeyMinified } = await getOrInitServerKeys(env);

      const sendResponse = (bodyObj: any, status = 200) => {
        const respHeaders = new Headers(corsHeaders);
        respHeaders.set("Content-Type", "application/json");
        return new Response(JSON.stringify(bodyObj), { status, headers: respHeaders });
      };

      if ((method === "POST" || method === "GET") && isPing) {
        return sendResponse({ status: "ok", service: "loco-proxy", timestamp: Date.now() });
      }

      if (method === "POST" && isPublicKey) {
        return sendResponse(serverPublicKeyMinified);
      }

      if (method === "POST" && isPushRoute) {
        const contentLength = request.headers.get("content-length");
        if (contentLength && parseInt(contentLength, 10) > 8192) {
          console.warn(`🛑 [DEFESA] Payload bloqueado (${contentLength} bytes). Origem: ${request.headers.get("cf-connecting-ip")}`);
          return sendResponse({ success: false, error: "Payload Too Large" }, 413);
        }
        
        const rawText = await request.text();
        let body;
        try {
          body = JSON.parse(rawText);
        } catch (e) {
          console.warn(`❌ [VALIDAÇÃO] Falha ao processar corpo JSON.`);
          return sendResponse({ success: false, error: "Corpo não é JSON válido." }, 400);
        }

        const { subscription, payloadText, vapid } = body;

        if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !payloadText || !vapid || !vapid.privateKey) {
          console.warn(`❌ [VALIDAÇÃO] Estrutura P2P incompleta ou corrompida.`);
          return sendResponse({ success: false, error: "Estrutura P2P Inválida." }, 400);
        }

        const jwtClaims = lerMetadadosJJWT(payloadText);
        if (!jwtClaims || !jwtClaims.sub || !['hand', 'contact'].includes(jwtClaims.sub)) {
          console.warn(`❌ [VALIDAÇÃO] Assinatura JWT não reconhecida pelo protocolo Loco.`);
          return sendResponse({ success: false, error: "Protocolo JWT Inválido." }, 400);
        }
        
        const proxyserverDestino = jwtClaims.proxyserver;
        
        // 🔥 ARQUITETURA [SEPARAÇÃO DE LEGADOS]: 
        // Só tenta federar se houver de fato um proxy destino completo, e que seja diferente de "/".
        // Isso resolve o problema de contatos antigos sem quebrar URL ou fazer "guessing" no Edge.
        if (proxyserverDestino) {
          let destinoUrlObj: URL;
          try {
             const urlFormatada = proxyserverDestino.startsWith('http') ? proxyserverDestino : `https://${proxyserverDestino}`;
             destinoUrlObj = new URL(urlFormatada);
          } catch(e) {
             console.warn(`❌ [FEDERAÇÃO] URL destino malformada: ${proxyserverDestino}`);
             return sendResponse({ success: false, error: "URL de proxy do destino malformada." }, 400);
          }

          if (url.hostname !== destinoUrlObj.hostname) {
             try {
                const baseUrl = proxyserverDestino.endsWith('/') ? proxyserverDestino.slice(0, -1) : proxyserverDestino;
                const urlDestino = `${baseUrl}/push`;
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); 
                
                const relayResponse = await fetch(urlDestino, {
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
                       errText = `Servidor destino (${destinoUrlObj.hostname}) offline ou recusou conexão.`;
                   } else {
                       errText = await relayResponse.text();
                       errText = errText.replace(/<[^>]*>?/gm, '').replace(/\n|\r/g, " ").substring(0, 100) + "...";
                   }
                   throw new Error(errText);
                }
                
                return sendResponse({ success: true, federated: true, target: destinoUrlObj.hostname });
                
             } catch (relayErr: any) {
                console.error(`❌ [FEDERAÇÃO] Falha ao reencaminhar pacote para ${destinoUrlObj.hostname}: ${relayErr.message}`);
                return sendResponse({ success: false, error: `Falha na ponte: ${relayErr.message}` }, 424);
             }
          }
        }
        
        // --- Processamento de Push Nativo ---
        let privateKeyFinal = vapid.privateKey;

        if (typeof privateKeyFinal === "string") {
          try {
            privateKeyFinal = await decryptWithServerKey(privateKeyFinal, serverPrivateKey);
          } catch (decryptErr) {
            console.warn(`❌ [SEGURANÇA] Falha ao decifrar VAPID. Chave do servidor desincronizada.`);
            return sendResponse({ success: false, error: "Falha ao descriptografar chave VAPID." }, 400);
          }
        }

        let jwkKeys = parseVapidKeysToJwk(vapid.publicKey, privateKeyFinal);
        let vapidKeys = await webpush.importVapidKeys(jwkKeys);
        
        const contact = vapid.subject.startsWith("mailto:") ? vapid.subject : `mailto:${vapid.subject}`;
        const appServer = await webpush.ApplicationServer.new({
          contactInformation: contact,
          vapidKeys: vapidKeys,
        });

        const subscriber = appServer.subscribe(subscription);
        
        try {
          await subscriber.pushTextMessage(payloadText, {});
        } catch (pushErr: any) {
          console.error(`❌ [FCM/WEBPUSH ERROR] O provedor rejeitou o envio: ${pushErr.message}`);
          throw new Error(`O provedor de Push (Google/Apple) rejeitou o pacote: ${pushErr.message}`);
        }

        return sendResponse({ success: true });
      }

      console.warn(`⚠️ [404] Rota não mapeada tentou ser acessada: ${pathname}`);
      return sendResponse({ error: "Endpoint não encontrado." }, 404);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ [WORKER EXCEPTION]: ${errorMessage}`);
      
      const errHeaders = new Headers(corsHeaders);
      errHeaders.set("Content-Type", "application/json");
      return new Response(JSON.stringify({ success: false, error: errorMessage }), { status: 400, headers: errHeaders });
    }
  }
};

export default workerHandler;