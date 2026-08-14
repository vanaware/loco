// worker.ts
/// <reference lib="deno.ns" />

import * as webpush from "@negrel/webpush";
import { deleteCookie } from "@std/http/cookie";

let serverPrivateKeyCache: CryptoKey | null = null;
let serverPublicKeyJwkCache: JsonWebKey | null = null;

async function getOrInitServerKeys(env?: { SERVER_PUBLIC_KEY?: string; SERVER_PRIVATE_KEY?: string }) {
  if (serverPrivateKeyCache && serverPublicKeyJwkCache) {
    return { serverPrivateKey: serverPrivateKeyCache, serverPublicKeyJwk: serverPublicKeyJwkCache };
  }

  const publicKeyStr = env?.SERVER_PUBLIC_KEY;
  const privateKeyStr = env?.SERVER_PRIVATE_KEY;

  if (!publicKeyStr) {
    throw new Error("❌ Chave SERVER_PUBLIC_KEY não encontrada! Configure-a no arquivo wrangler.toml ou via dashboard da Cloudflare.");
  }
  
  if (!privateKeyStr) {
    throw new Error("❌ Chave SERVER_PRIVATE_KEY não encontrada! Configure-a como um Secret seguro na Cloudflare.");
  }

  try {
    let publicKeyJwk = JSON.parse(publicKeyStr);
    let privateKeyJwk = JSON.parse(privateKeyStr);

    if (!publicKeyJwk.kty) {
      publicKeyJwk = {
        kty: "RSA",
        alg: "RSA-OAEP-256",
        n: publicKeyJwk.n,
        e: "AQAB",
        ext: true,
        key_ops: ["encrypt"]
      };
    }

    if (!privateKeyJwk.kty) {
      privateKeyJwk = {
        kty: "RSA",
        alg: "RSA-OAEP-256",
        e: publicKeyJwk.e,
        n: publicKeyJwk.n,
        ext: true,
        key_ops: ["decrypt"],
        d: privateKeyJwk.d,
        p: privateKeyJwk.p,
        q: privateKeyJwk.q,
        dp: privateKeyJwk.dp,
        dq: privateKeyJwk.dq,
        qi: privateKeyJwk.qi
      };
    }

    const serverPrivateKey = await crypto.subtle.importKey(
      "jwk" as any,
      privateKeyJwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["decrypt"]
    );

    serverPrivateKeyCache = serverPrivateKey;
    serverPublicKeyJwkCache = publicKeyJwk;

    console.log("🔐 Chaves RSA de Infraestrutura carregadas com sucesso na RAM!");
    return { serverPrivateKey, serverPublicKeyJwk: publicKeyJwk };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new Error(`Erro ao inicializar chaves do servidor: ${errorMsg}`);
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

    const aesChaveCruaBuffer = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      serverPrivateKey,
      chaveAesCifradaBytes
    );

    const chaveSimetricaAes = await crypto.subtle.importKey(
      "raw",
      aesChaveCruaBuffer,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    const vapidOriginalBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes },
      chaveSimetricaAes,
      dadosBytes
    );

    const jsonText = new TextDecoder().decode(vapidOriginalBuffer);
    return JSON.parse(jsonText);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[SERVER] ❌ Erro ao descriptografar envelope VAPID:", errorMessage);
    throw new Error(`Falha crítica na quebra do envelope de criptografia híbrida VAPID: ${errorMessage}`);
  }
}

function parseVapidKeysToJwk(publicKey: any, privateKey: any) {
  try {
    const pub = typeof publicKey === "string" ? JSON.parse(publicKey) : publicKey;
    const priv = typeof privateKey === "string" ? JSON.parse(privateKey) : privateKey;

    // 🔥 ARQUITETURA: Reconstrução Inteligente VAPID
    const expandedPub = pub.kty ? pub : {
      kty: "EC", crv: "P-256", x: pub.x, y: pub.y, ext: true, key_ops: ["verify"]
    };

    const expandedPriv = priv.kty ? priv : {
      kty: "EC", crv: "P-256", x: expandedPub.x, y: expandedPub.y, d: priv.d, ext: true, key_ops: ["sign"]
    };

    return { publicKey: expandedPub, privateKey: expandedPriv };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    throw new Error(`As chaves enviadas não estão no formato JSON/JWK válido: ${errorMessage}`);
  }
}

function lerMetadadosJJWT(jwtString: string) {
  try {
    const parts = jwtString.split(".");
    if (parts.length !== 3) return null;

    const part1 = parts[1];
    if (!part1) return null;

    let base64Url = part1.replace(/-/g, "+").replace(/_/g, "/");
    while (base64Url.length % 4) base64Url += "=";

    const jsonString = new TextDecoder().decode(
      new Uint8Array([...atob(base64Url)].map(c => c.charCodeAt(0)))
    );
    
    return JSON.parse(jsonString);
  } catch {
    return null;
  }
}

function checkIsAllowedOrigin(origin: string, env: any): boolean {
  if (!origin) return false;

  const defaultPatterns = [
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/([a-zA-Z0-9-]+\.)*arvati\.workers\.dev$/,
    /^https?:\/\/([a-zA-Z0-9-]+\.)*vanaware\.com$/,
    /^https?:\/\/([a-zA-Z0-9-]+\.)*tap\.app\.br$/,
    /^https?:\/\/([a-zA-Z0-9-]+\.)*github\.io$/,
    /^https?:\/\/dash\.cloudflare\.com$/
  ];

  for (const pattern of defaultPatterns) {
    if (pattern.test(origin)) return true;
  }

  const envOrigins = env?.ALLOWED_ORIGINS;
  if (typeof envOrigins === "string" && envOrigins.trim() !== "") {
    const rules = envOrigins.split(",").map(s => s.trim());
    for (const rule of rules) {
      const escapedRule = rule
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\\\*/g, "([a-zA-Z0-9-]+\\.)*");

      const dynamicRegex = new RegExp(`^${escapedRule}$`, "i");
      if (dynamicRegex.test(origin)) {
        return true;
      }
    }
  }

  return false;
}

const workerHandler = {
  async fetch(request: Request, env: any, _ctx: any): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    let origin = request.headers.get("origin") || "";
    if (origin === "") {
      const host = request.headers.get("host") || "localhost";
      const protocolo = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
      origin = `${protocolo}://${host}`;
    }

    const isAllowedOrigin = checkIsAllowedOrigin(origin, env);

    const corsHeaders = {
      "Access-Control-Allow-Origin": isAllowedOrigin ? origin : "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Crypto-Key, TTL, Urgency, X-Push-Payload",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const proxyPath = env.PROXY_PATH || "";
    
    let targetPath = pathname.startsWith(proxyPath) ? pathname.slice(proxyPath.length) : pathname;
    
    if (!targetPath.startsWith("/")) {
      targetPath = "/" + targetPath;
    }

    if (!isAllowedOrigin) {
      console.warn(`🛑 [CORS REJEITADO] Acesso bloqueado para a origem: "${origin}"`);
      return new Response(JSON.stringify({ error: "CORS: Origem não autorizada para esta API." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    try {
      const { serverPrivateKey, serverPublicKeyJwk } = await getOrInitServerKeys(env);

      if (request.method === "POST" && (targetPath === "/publickey" || targetPath === "/publickey/")) {
        return new Response(JSON.stringify(serverPublicKeyJwk), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (request.method === "POST" && (targetPath === "/logout" || targetPath === "/logout/")) {
        const headers = new Headers(corsHeaders);
        deleteCookie(headers, "session_token", { path: "/" });
        headers.set("Clear-Site-Data", '"cache", "cookies", "storage"');
        headers.set("Content-Type", "application/json");
        return new Response(JSON.stringify({ disconnected: true }), {
          status: 200,
          headers,
        });
      }

      if (request.method === "POST" && (targetPath === "" || targetPath === "/")) {
        console.log(`\n📥 [${new Date().toLocaleTimeString()}] Nova requisição proxy web push recebida!`);
        
        const body = await request.json();
        const { subscription, payloadText, vapid } = body;

        if (!subscription || !payloadText || !vapid) {
          return new Response(
            JSON.stringify({ success: false, error: "Parâmetros obrigatórios ausentes no body." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const jwtClaims = lerMetadadosJJWT(payloadText);
        if (jwtClaims) {
          console.log(`    - [AUDITORIA JWT] Emitido por: ${jwtClaims.nm || "Desconhecido"} <${jwtClaims.iss || "Sem e-mail"}>`);
        }

        const proxyserverDestino = jwtClaims?.proxyserver;
        if (proxyserverDestino) {
          const urlAtual = new URL(request.url);
          const origemAtual = `${urlAtual.host}${env.PROXY_PATH || ""}`;
          
          const destinoSemProtocolo = proxyserverDestino.replace(/^https?:\/\//, "").replace(/\/$/, "");
          const origemNormalizada = origemAtual.replace(/\/$/, "");
          const destinoNormalizado = destinoSemProtocolo;
          
          if (origemNormalizada !== destinoNormalizado) {
            console.log(`    🔄 [REDIRECIONAMENTO] Proxy destino (${destinoNormalizado}) difere do atual (${origemNormalizada}). Reencaminhando...`);
            
            try {
              const urlDestino = destinoNormalizado.startsWith("http") 
                ? `${destinoNormalizado}/` 
                : `https://${destinoNormalizado}/`;
              
              const response = await fetch(urlDestino, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subscription, payloadText, vapid }),
                redirect: "follow"
              });
              
              const result = await response.json();
              console.log(`    ✅ [REDIRECIONAMENTO] Push reencaminhado com sucesso! Status: ${response.status}`);
              
              return new Response(JSON.stringify({ success: true, redirected: true, target: destinoNormalizado }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
              });
            } catch (redirectErr) {
              const errorMsg = redirectErr instanceof Error ? redirectErr.message : String(redirectErr);
              console.error(`    ❌ [REDIRECIONAMENTO] Falha ao reencaminhar: ${errorMsg}`);
              return new Response(
                JSON.stringify({ success: false, error: `Falha ao reencaminhar para proxy destino: ${errorMsg}` }),
                { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
        }

        let privateKeyFinal = vapid.privateKey;

        if (typeof privateKeyFinal === "string") {
          console.log("    - [SEGURANÇA] Descriptografando Chave Privada VAPID com a RSA do Servidor...");
          try {
            const decryptedPrivateKeyObj = await decryptWithServerKey(privateKeyFinal, serverPrivateKey);
            privateKeyFinal = decryptedPrivateKeyObj;
            console.log("    - [SEGURANÇA] ✅ Chave VAPID descriptografada com sucesso!");
          } catch (decryptErr) {
            console.error("    - [SEGURANÇA] ❌ Erro ao descriptografar chave VAPID:", decryptErr);
            return new Response(
              JSON.stringify({ success: false, error: "Falha ao descriptografar chave VAPID." }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        // 🔥 Aqui a mágica da remontagem ocorre de forma limpa!
        let jwkKeys = parseVapidKeysToJwk(vapid.publicKey, privateKeyFinal);
        let vapidKeys = await webpush.importVapidKeys(jwkKeys);
        
        const contact = vapid.subject.startsWith("mailto:") ? vapid.subject : `mailto:${vapid.subject}`;
        const appServer = await webpush.ApplicationServer.new({
          contactInformation: contact,
          vapidKeys: vapidKeys,
        });

        const subscriber = appServer.subscribe(subscription);
        await subscriber.pushTextMessage(payloadText, {});
        
        console.log("    ✅ [SUCESSO] Push despachado com sucesso!");

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      return new Response(
        JSON.stringify({ error: "Endpoint não encontrado no servidor proxy do Loco." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("❌ Erro no Worker:", errorMessage);
      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }
};

export default workerHandler;