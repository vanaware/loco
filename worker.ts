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
    throw new Error("❌ Chave SERVER_PUBLIC_KEY não encontrada! Configure-a no arquivo wrangler.toml ou via dashboard da Cloudflare.");
  }
  
  if (!privateKeyStr) {
    throw new Error("❌ Chave SERVER_PRIVATE_KEY não encontrada! Configure-a como um Secret seguro na Cloudflare.");
  }

  try {
    const rawPublicKeyJwk = JSON.parse(publicKeyStr);
    let publicKeyJwk = { ...rawPublicKeyJwk };
    let privateKeyJwk = JSON.parse(privateKeyStr);

    const minifiedPublicKey = rawPublicKeyJwk.kty ? { n: rawPublicKeyJwk.n } : rawPublicKeyJwk;

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
    serverPublicKeyMinifiedCache = minifiedPublicKey;

    console.log("🔐 Chaves RSA de Infraestrutura carregadas com sucesso na RAM!");
    return { 
      serverPrivateKey, 
      serverPublicKeyJwk: publicKeyJwk,
      serverPublicKeyMinified: minifiedPublicKey 
    };
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

const workerHandler = {
  async fetch(request: Request, env: any, _ctx: any): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    const method = request.method;
    const origin = request.headers.get("Origin") || "*";
    const reqHeaders = request.headers.get("Access-Control-Request-Headers");

    // 🔥 LOG ESTRATÉGICO: Descobrindo o que os Túneis enviam
    console.log(`\n======================================================`);
    console.log(`🌐 [ROUTER] Nova Requisição Detectada!`);
    console.log(`📌 Método: ${method} | Rota: ${pathname}`);
    console.log(`🌍 Origem Recebida: ${origin}`);
    if (reqHeaders) {
      console.log(`📦 Headers Solicitados no Preflight: ${reqHeaders}`);
    }

    // 🔥 ARQUITETURA: CORS ESPELHO ABSOLUTO
    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": origin, // Espelha a origem exata (localhost ou tunnel)
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Credentials": "true", // Permitido apenas porque não usamos '*'
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin" // Exigência da W3C para CORS Dinâmico
    };

    if (reqHeaders) {
      corsHeaders["Access-Control-Allow-Headers"] = reqHeaders; // Espelha os headers
    } else {
      corsHeaders["Access-Control-Allow-Headers"] = "Content-Type, Authorization, Crypto-Key, TTL, Urgency, X-Push-Payload";
    }

    if (request.method === "OPTIONS") {
      console.log(`🛡️ CORS Headers Devolvidos no OPTIONS:`, JSON.stringify(corsHeaders));
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    const isPing = pathname.endsWith("/ping") || pathname.endsWith("/ping/");
    const isPublicKey = pathname.endsWith("/publickey") || pathname.endsWith("/publickey/");

    try {
      const { serverPrivateKey, serverPublicKeyMinified } = await getOrInitServerKeys(env);

      if ((request.method === "POST" || request.method === "GET") && isPing) {
        return new Response(JSON.stringify({ 
          status: "ok", 
          service: "loco-proxy",
          timestamp: Date.now()
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (request.method === "POST" && isPublicKey) {
        return new Response(JSON.stringify(serverPublicKeyMinified), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Rota principal de processamento de Push
      if (request.method === "POST" && !isPing && !isPublicKey) {
        
        const contentLength = request.headers.get("content-length");
        if (contentLength && parseInt(contentLength, 10) > 8192) {
          console.warn(`🛑 [DEFESA] Bloqueado: Payload excedeu o limite do roteador (Recebido: ${contentLength} bytes, Limite: 8192)`);
          return new Response(JSON.stringify({ error: "Payload Too Large" }), { status: 413, headers: corsHeaders });
        }

        console.log(`📥 [RECEIVE] Processando Payload PUSH de ${contentLength || 'tamanho desconhecido'} bytes.`);
        
        const body = await request.json();
        const { subscription, payloadText, vapid } = body;

        if (
          !subscription || !subscription.endpoint || !subscription.keys?.p256dh ||
          !payloadText || typeof payloadText !== 'string' ||
          !vapid || !vapid.subject || !vapid.publicKey || !vapid.privateKey
        ) {
          console.warn("🛑 [DEFESA] Bloqueado: Estrutura JSON malformada ou dados essenciais ausentes.");
          return new Response(
            JSON.stringify({ success: false, error: "Estrutura P2P Inválida." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const jwtClaims = lerMetadadosJJWT(payloadText);
        if (!jwtClaims || !jwtClaims.sub || !['hand', 'contact'].includes(jwtClaims.sub)) {
          console.warn("🛑 [DEFESA] Bloqueado: Token JWT inválido ou sub-protocolo desconhecido.");
          return new Response(
            JSON.stringify({ success: false, error: "Protocolo Inválido. Apenas payloads 'Loco' são aceitos." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`    - [AUDITORIA JWT] Emitido por: ${jwtClaims.nm || "Desconhecido"} <${jwtClaims.iss || "Sem e-mail"}>`);

        const proxyserverDestino = jwtClaims.proxyserver;
        if (proxyserverDestino) {
          const urlAtual = new URL(request.url);
          const origemAtual = `${urlAtual.host}${env.PROXY_PATH || ""}`;
          
          const destinoSemProtocolo = proxyserverDestino.replace(/^https?:\/\//, "").replace(/\/$/, "");
          const origemNormalizada = origemAtual.replace(/\/$/, "");
          
          if (origemNormalizada !== destinoSemProtocolo) {
            console.log(`    🔄 [REDIRECIONAMENTO] Proxy destino (${destinoSemProtocolo}) difere do atual (${origemNormalizada}). Reencaminhando...`);
            
            try {
              const urlDestino = proxyserverDestino.endsWith('/') ? proxyserverDestino : `${proxyserverDestino}/`;
              
              const response = await fetch(urlDestino, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subscription, payloadText, vapid })
              });
              
              if (!response.ok) {
                const errText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errText}`);
              }
              
              console.log(`    ✅ [REDIRECIONAMENTO] Push reencaminhado com sucesso! Status: ${response.status}`);
              
              return new Response(JSON.stringify({ success: true, redirected: true, target: destinoSemProtocolo }), {
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
      
      // O CORS deve ser incluído mesmo no erro 500 para o navegador conseguir ler a reposta!
      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }
};

export default workerHandler;