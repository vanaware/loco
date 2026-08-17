

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