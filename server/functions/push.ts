/// <reference types="https://esm.sh/@cloudflare/workers-types@4.20241022.0/index.d.ts" />

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

async function parseVapidKeysToJwk(env:any, publicKey: any, privateKey: any) {
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
        // [FCM/WEBPUSH ERROR] O provedor rejeitou o envio: ${pushErr.message}
        throw new Error(`O provedor de Push (Google/Apple) rejeitou o pacote: ${pushErr.message}`);
    }
}

async function routePush(proxyserverDestino: string, rawText: string, request: Request, env?: any): Promise<Response> {
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
        return sendResponse(request, { success: true, federated: true, target: urlDestino });
    } catch (relayErr: any) {
        // [FEDERAÇÃO] Falha ao reencaminhar pacote: ${relayErr.message}
        return sendResponse(request, { success: false, error: `Falha na ponte: ${relayErr.message}` }, 424);
    }
}

export async function handlePush(request: Request, env?: any): Promise<Response> {
  const method = request.method;
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return handlePreflight(request);
  }

    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > 8192) {
        // [DEFESA] Payload bloqueado (${contentLength} bytes).
        return sendResponse(request, { success: false, error: "Payload Too Large" }, 413);
    }

    const rawText = await request.text();
    let body;
    try {
        body = JSON.parse(rawText);
    } catch (e) {
        // [VALIDAÇÃO] Falha ao processar corpo JSON.
        return sendResponse(request,{ success: false, error: "Corpo não é JSON válido." }, 400);
    }

    const { subscription, payloadText, vapid } = body;
    if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !payloadText || !vapid || !vapid.privateKey) {
        // [VALIDAÇÃO] Estrutura P2P incompleta ou corrompida.
        return sendResponse(request, { success: false, error: "Estrutura P2P Inválida." }, 400);
    }

    const jwtClaims = lerMetadadosJJWT(payloadText);
    if (!jwtClaims || !jwtClaims.sub || !['hand', 'contact'].includes(jwtClaims.sub)) {
        // [VALIDAÇÃO] Assinatura JWT não reconhecida pelo protocolo Loco.
        return sendResponse(request, { success: false, error: "Protocolo JWT Inválido." }, 400);
    }

    const proxyserverDestino = jwtClaims.proxyserver;
    let destinoUrlObj: URL | null = null;

    // Prova de Posse (Proof of Ownership): Tentamos abrir o cadeado
    let isMyEnvelope = false;
    try {
        // Se não der erro, significa que este Worker possui a chave privada que criou este envelope!
        let jwkKeys = await parseVapidKeysToJwk(env, vapid.publicKey, vapid.privateKey);
        await sendPush(jwkKeys, subscription, payloadText, vapid)
        isMyEnvelope = true;
        return sendResponse(request, { success: true });
    } catch (decryptErr) {
        // O envelope pertence a outro servidor.
        isMyEnvelope = false;
    }
    let requiresFederationByDns = false;
    if (!isMyEnvelope) {
        try {
            const urlFormatada = proxyserverDestino.startsWith('http') ? proxyserverDestino : `https://${proxyserverDestino}`;
            destinoUrlObj = new URL(urlFormatada);
            if (url.hostname !== destinoUrlObj.hostname) {
            requiresFederationByDns = true;
            }
        } catch(e) {
            // [FEDERAÇÃO] URL destino malformada: ${proxyserverDestino}
            return sendResponse(request, { success: false, error: "URL de proxy do destino malformada." }, 400);
        }
        if (requiresFederationByDns && destinoUrlObj) {
            await routePush(proxyserverDestino, rawText, request, env);
        } else {
           // [SEGURANÇA] Falha crítica: O envelope VAPID não nos pertence, e não existe rota de federação configurada.
           return sendResponse(request, { success: false, error: "Falha ao descriptografar chave VAPID. Nó incorreto." }, 400);
        }
    }


}

export const onRequest: PagesFunction<any> = async (context) => {
  return await handlePush(context.request, context.env);
};