// server/functions/push.ts
import { sendResponse, handlePreflight, getOrInitServerKeys, extrairEExpandirChavesVapid } from "../shared.ts";
import * as webpush from "@negrel/webpush";

async function sendPush(jwkKeys: any, subscription: any, payloadText: string, vapid: any) {
  const vapidKeys = await webpush.importVapidKeys(jwkKeys);
  
  const rawSubject = vapid?.subject || "mailto:admin@loco.pwa";
  const contact = rawSubject.startsWith("mailto:") ? rawSubject : `mailto:${rawSubject}`;
  
  const appServer = await webpush.ApplicationServer.new({
    contactInformation: contact,
    vapidKeys: vapidKeys,
  });

  const { proxyserver: _ignored, ...cleanSubscription } = subscription;

  const subscriber = appServer.subscribe(cleanSubscription);
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

  const isSubscriptionValid = !!(
    subscription &&
    subscription.endpoint &&
    subscription.proxyserver &&
    subscription.keys?.p256dh &&
    subscription.keys?.auth
  );

  const isVapidValid = !!(
    vapid &&
    vapid.publicKey &&
    vapid.privateKey
  );

  if (!isSubscriptionValid || !isVapidValid || !payloadText) {
    return sendResponse(request, { success: false, error: "Estrutura P2P Inválida. Parâmetros em falta em subscription, vapid ou payloadText." }, 400);
  }

  // 1. Prova de Posse (Proof of Ownership): Abre o envelope e expande as chaves VAPID usando a utilitário unificada
  try {
    const { serverPrivateKey } = await getOrInitServerKeys(env);
    const jwkKeys = await extrairEExpandirChavesVapid(serverPrivateKey, vapid.publicKey, vapid.privateKey);
    
    await sendPush(jwkKeys, subscription, payloadText, vapid);
    return sendResponse(request, { success: true });
  } catch (_decryptErr) {
    // O envelope pertence a outro nó na rede de federação
  }

  // 2. Roteamento de Federação
  const proxyserver = subscription.proxyserver;

  if (proxyserver) {
    try {
      const urlFormatada = proxyserver.startsWith("http") ? proxyserver : `https://${proxyserver}`;
      const destinoUrlObj = new URL(urlFormatada);
      
      if (url.hostname !== destinoUrlObj.hostname) {
        return await routePush(proxyserver, rawText, request);
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
  return handlePreflight(context.request);
};