import {
  bufferToBase64Url,
  createJwtVapid,
  encryptPayloadWebPush,
  exportPublicKeyRaw,
} from "./crypto.ts";
import type { Contact, PushPayload } from "./types.ts";

const PUSH_SERVICES = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
  "wns2-p1p.par3p.windows.com",
  "wns2-par02p.wns.windows.com",
];

function isPushService(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return PUSH_SERVICES.some((host) => url.host === host || url.host.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

export async function sendPushMessage(
  contact: Contact,
  text: string,
  fromId: string,
): Promise<{ ok: boolean; fallback?: boolean; error?: string }> {
  const { subscription, vapidPrivateJwk, vapidPublicJwk } = contact;

  console.log("[push] ===== SEND PUSH MESSAGE =====");
  console.log("[push] 🎯 Contact ID:", contact.id);
  console.log("[push] 📡 Endpoint:", subscription.endpoint);
  
  console.log("[push] 🔑 ===== CHAVES DO DESTINATÁRIO =====");
  console.log("[push] 🔑 subscription.keys.p256dh (public key do navegador dele):");
  console.log("   ", subscription.keys.p256dh);
  console.log("[push] 🔑 subscription.keys.auth (auth secret dele):");
  console.log("   ", subscription.keys.auth);
  console.log("[push] 🔑 vapidPublicJwk (para verificar JWT):");
  console.log("   ", JSON.stringify(vapidPublicJwk, null, 2));
  console.log("[push] 🔑 vapidPrivateJwk (para ASSINAR JWT - usaremos esta):");
  console.log("   kty:", vapidPrivateJwk.kty);
  console.log("   crv:", vapidPrivateJwk.crv);
  console.log("   d:", vapidPrivateJwk.d?.slice(0, 30) + "...");
  console.log("[push] =====================================");
  
  console.log("[push] 📝 Texto a enviar:", text.slice(0, 100));

  console.log("[push] 🔐 Criando JWT VAPID com privateJwk do contato...");
  const jwtToken = await createJwtVapid(vapidPrivateJwk, subscription.endpoint);
  console.log("[push] ✅ JWT gerado:", jwtToken.slice(0, 40) + "...");
  console.log("[push] 🔑 O JWT foi assinado com a privateJwk.d:", vapidPrivateJwk.d?.slice(0, 20) + "...");

  console.log("[push] 🔑 Exportando publicJwk do contato para Crypto-Key header...");
  const rawPublic = await exportPublicKeyRaw(vapidPublicJwk);
  const publicKeyString = bufferToBase64Url(rawPublic);
  console.log("[push] ✅ Crypto-Key p256ecdsa:", publicKeyString);
  console.log("[push] 📝 Esta chave pública será usada pelo navegador dele para VERIFICAR a assinatura JWT");

  console.log("[push] 🔒 Criptografando payload (RFC 8291)...");
  console.log("[push] 🔑 Usando subscription.keys.p256dh para ECDH:", subscription.keys.p256dh);
  console.log("[push] 🔑 Usando subscription.keys.auth para HKDF:", subscription.keys.auth);
  const payloadCriptografado = await encryptPayloadWebPush(text, subscription.keys);
  console.log("[push] ✅ Payload criptografado:", payloadCriptografado.byteLength, "bytes");
  console.log("[push] 📦 O payload foi criptografado com a chave pública p256dh do destinatário");
  console.log("[push] 📦 Somente o destinatário poderá descriptografar com sua chave privada");

  const payload: PushPayload = { title: `Mensagem de ${fromId}`, text, fromId };
  const payloadJson = JSON.stringify(payload);

  const commonHeaders: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "Content-Encoding": "aes128gcm",
    "TTL": "60",
    "Authorization": `WebPush ${jwtToken}`,
    "Crypto-Key": `p256ecdsa=${publicKeyString}`,
    "Urgency": "normal",
  };

  // Log dos headers enviados
  console.log("[push] 📨 ===== HEADERS QUE SERÃO ENVIADOS =====");
  for (const [key, value] of Object.entries(commonHeaders)) {
    if (key === "Authorization") {
      console.log(`[push]   ${key}: WebPush ${value.split(' ')[1]?.slice(0, 30)}...`);
      console.log(`[push]     ↑ JWT assinado com privateJwk do contato`);
    } else if (key === "Crypto-Key") {
      console.log(`[push]   ${key}: ${value}`);
      console.log(`[push]     ↑ publicJwk do contato (para verificar JWT)`);
    } else {
      console.log(`[push]   ${key}: ${value}`);
    }
  }
  console.log("[push] =======================================");

  const skipDirect = isPushService(subscription.endpoint);
  console.log("[push] 🌐 É endpoint de serviço oficial?", skipDirect ? "SIM" : "NÃO");

  if (!skipDirect) {
    try {
      console.log("[push] 🚀 Tentando envio DIRETO para:", subscription.endpoint.slice(0, 60) + "...");
      const directResponse = await fetch(subscription.endpoint, {
        method: "POST",
        headers: { ...commonHeaders },
        body: payloadCriptografado as BodyInit,
      });

      console.log(`[push] 📥 Resposta direta - Status: ${directResponse.status} ${directResponse.statusText}`);
      
      if (directResponse.ok) {
        console.log("[push] ✅ PUSH ENVIO DIRETO SUCEDIDO!");
        console.log("[push] 📦 Mensagem criptografada com p256dh:", subscription.keys.p256dh.slice(0, 30) + "...");
        console.log("[push] 🔐 JWT assinado com privateJwk.d:", vapidPrivateJwk.d?.slice(0, 20) + "...");
        return { ok: true };
      }
      
      const errorText = await directResponse.text();
      console.warn(`[push] ⚠️ Envio direto falhou (${directResponse.status}):`, errorText.slice(0, 200));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[push] ❌ Erro no envio direto:", msg);
      console.log("[push] 🔄 Tentando fallback via proxy...");
    }
  } else {
    console.log("[push] ℹ️ Pulando envio direto (serviço oficial), indo direto para proxy");
  }

  try {
    const proxyUrl = `/proxy/${subscription.endpoint}`;
    console.log("[push] 🚀 Enviando via PROXY para:", proxyUrl.slice(0, 60) + "...");
    const proxyResponse = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        ...commonHeaders,
        "X-Push-Payload": encodeURIComponent(payloadJson),
      },
      body: payloadCriptografado as BodyInit,
    });

    const responseText = await proxyResponse.text();
    console.log(`[push] 📥 Resposta do proxy - Status: ${proxyResponse.status} ${proxyResponse.statusText}`);
    console.log(`[push] 📦 Corpo da resposta (${responseText.length} bytes):`, responseText.slice(0, 300) || "(vazio)");

    if (proxyResponse.ok) {
      console.log("[push] ✅ PUSH ACEITO PELO SERVIÇO (via proxy)");
      console.log("[push] 🔑 Chaves usadas:");
      console.log("   - Criptografia: p256dh =", subscription.keys.p256dh.slice(0, 30) + "...");
      console.log("   - Autenticação: auth =", subscription.keys.auth.slice(0, 20) + "...");
      console.log("   - JWT: assinado com privateJwk.d =", vapidPrivateJwk.d?.slice(0, 20) + "...");
      console.log("   - Verificação JWT: publicJwk =", publicKeyString.slice(0, 30) + "...");
      console.log("[push] ===== END OF PUSH FLOW =====");
      return { ok: true, fallback: true };
    }

    console.warn(`[push] ⚠️ Proxy rejeitou (${proxyResponse.status}):`, responseText.slice(0, 300));
    console.log("[push] ===== END OF PUSH FLOW =====");
    return { ok: false, fallback: true, error: responseText };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[push] ❌ ERRO CRÍTICO NO PROXY:", error);
    console.error("[push] Stack trace:", err instanceof Error ? err.stack : "N/A");
    console.log("[push] ===== END OF PUSH FLOW =====");
    return { ok: false, fallback: true, error };
  }
}
