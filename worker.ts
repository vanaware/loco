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

  if (!publicKeyStr || !privateKeyStr) {
    throw new Error("Chaves de infraestrutura do servidor (SERVER_PUBLIC_KEY / SERVER_PRIVATE_KEY) não encontradas!");
  }

  try {
    const publicKeyJwk = JSON.parse(publicKeyStr);
    const privateKeyJwk = JSON.parse(privateKeyStr);

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
    return {
      publicKey: typeof publicKey === "string" ? JSON.parse(publicKey) : publicKey,
      privateKey: typeof privateKey === "string" ? JSON.parse(privateKey) : privateKey
    };
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

    const isAllowedOrigin = 
      /^https?:\/\/localhost(:\d+)?$/.test(origin) || 
      /^https?:\/\/([a-zA-Z0-9-]+\.)*vanaware\.com$/.test(origin) ||
      /^https?:\/\/([a-zA-Z0-9-]+\.)*github\.io$/.test(origin);

    const corsHeaders = {
      "Access-Control-Allow-Origin": isAllowedOrigin ? origin : "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Crypto-Key, TTL, Urgency, X-Push-Payload",
      "Access-Control-Allow-Credentials": "true"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const proxyPath = env.PROXY_PATH || "";
    const targetPath = pathname.startsWith(proxyPath) ? pathname.slice(proxyPath.length) : pathname;

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

        // 🔥 VERIFICA SE O PROXYSERVER DE DESTINO É DIFERENTE DO ATUAL
        const proxyserverDestino = jwtClaims?.proxyserver;
        if (proxyserverDestino) {
          const urlAtual = new URL(request.url);
          const origemAtual = `${urlAtual.protocol}//${urlAtual.host}${env.PROXY_PATH || ""}`;
          
          // Normaliza ambas as URLs para comparação (remove barras finais)
          const origemNormalizada = origemAtual.replace(/\/$/, "");
          const destinoNormalizado = proxyserverDestino.replace(/\/$/, "");
          
          if (origemNormalizada !== destinoNormalizado) {
            console.log(`    🔄 [REDIRECIONAMENTO] Proxy destino (${destinoNormalizado}) difere do atual (${origemNormalizada}). Reencaminhando...`);
            
            // Reencaminha a mensagem para o proxy correto
            try {
              const response = await fetch(`${destinoNormalizado}/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subscription, payloadText, vapid })
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