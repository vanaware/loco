/// <reference lib="deno.ns" />
import { serveDir } from "@std/http/file-server";
import * as webpush from "@negrel/webpush";
import { deleteCookie } from "@std/http/cookie";

const PORT = 8000;

// 🔥 Lê diretamente do Deno.env (carregado via --env)
function carregarChavesDoServidor() {
  const publicKeyStr = Deno.env.get('SERVER_PUBLIC_KEY');
  const privateKeyStr = Deno.env.get('SERVER_PRIVATE_KEY');
  
  if (!publicKeyStr || !privateKeyStr) {
    console.error("❌ Chaves do servidor não encontradas!");
    console.error("   Execute 'deno task build' primeiro para gerar as chaves.");
    console.error("   Ou defina as variáveis de ambiente SERVER_PUBLIC_KEY e SERVER_PRIVATE_KEY");
    Deno.exit(1);
  }
  
  try {
    const publicKeyJwk = JSON.parse(publicKeyStr);
    const privateKeyJwk = JSON.parse(privateKeyStr);
    return { publicKeyJwk, privateKeyJwk };
  } catch (err) {
    console.error("❌ Erro ao parsear as chaves do servidor:", err);
    Deno.exit(1);
  }
}

// Chaves globais de infraestrutura do Servidor
let serverPrivateKey: CryptoKey;
let serverPublicKeyJwk: JsonWebKey;

async function inicializarChavesDoServidor() {
  const chaves = carregarChavesDoServidor();
  serverPublicKeyJwk = chaves.publicKeyJwk;
  
  serverPrivateKey = await crypto.subtle.importKey(
    "jwk",
    chaves.privateKeyJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"]
  );
  
  console.log("🔒 Chaves RSA de Infraestrutura do Servidor carregadas do Deno.env!");
}

// Inicializa as chaves antes de o Deno abrir a escuta HTTP
await inicializarChavesDoServidor();

// Função auxiliar para descriptografar dados Hex usando a chave RSA exclusiva do servidor
async function decryptWithServerKey(base64Envelope: string): Promise<any> {
  try {
    // 1. Desempacota o envelope Base64 enviado pelo navegador
    const envelopeText = atob(base64Envelope);
    const { iv, dadosCifrados, chaveAesCifrada } = JSON.parse(envelopeText);

    // Helper para converter strings Hex textuais de volta para arrays de bytes inteiros
    const fromHex = (hex: string) => new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));

    const ivBytes = fromHex(iv);
    const dadosBytes = fromHex(dadosCifrados);
    const chaveAesCifradaBytes = fromHex(chaveAesCifrada);

    // 2. Descriptografa a chave AES usando a chave privada RSA-OAEP exclusiva da RAM do servidor
    const aesChaveCruaBuffer = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      serverPrivateKey,
      chaveAesCifradaBytes
    );

    // 3. Importa a chave simétrica AES recuperada de volta para o runtime do Deno
    const chaveSimetricaAes = await crypto.subtle.importKey(
      "raw",
      aesChaveCruaBuffer,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    // 4. Descriptografa o conteúdo longo da chave privada VAPID original usando a chave AES aberta
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

// Transforma as strings textuais de chave pública/privada VAPID em JSON estruturado
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

// Auditoria Cega: Lê as Claims do JWT sem precisar de chaves e sem descriptografar a mensagem
function lerMetadadosJJWT(jwtString: string) {
  try {
    const parts = jwtString.split(".");
    if (parts.length !== 3) return null;

    let base64Url = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (base64Url.length % 4) base64Url += "=";

    const jsonString = new TextDecoder().decode(
      new Uint8Array([...atob(base64Url)].map(c => c.charCodeAt(0)))
    );
    
    return JSON.parse(jsonString);
  } catch {
    return null;
  }
}

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);
  
  // 1. Captura o Origin enviado pelo navegador
  let origin = req.headers.get("origin") || "";

  // CORREÇÃO CRUCIAL: Se o Origin vier vazio (comum em fetches relativos do mesmo domínio),
  // nós reconstrói ele dinamicamente usando o protocolo (http/https) e o Host atual do servidor
  if (origin === "") {
    const host = req.headers.get("host") || `localhost:${PORT}`;
    // Verifica se o seu servidor roda em ambiente seguro (HTTPS) na nuvem ou HTTP local
    const protocolo = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    origin = `${protocolo}://${host}`;
  }

  // 2. VALIDAÇÃO DE CORS ATUALIZADA
  // Permite localhost (qualquer porta) ou qualquer subdomínio de .vanaware.com
  const isAllowedOrigin = 
    /^https?:\/\/localhost(:\d+)?$/.test(origin) || 
    /^https?:\/\/([a-zA-Z0-9-]+\.)*vanaware\.com$/.test(origin);

  // 3. Define os cabeçalhos de resposta baseados na validação acima
  const corsHeaders = {
    "Access-Control-Allow-Origin": isAllowedOrigin ? origin : "https://vanaware.com",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Crypto-Key, TTL, Urgency, X-Push-Payload",
    "Access-Control-Allow-Credentials": "true"
  };

  // Trata requisições de preflight imediatamente
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Trava de segurança de API: Se a origem final gerada NÃO for permitida, bloqueia com 403
  if (!isAllowedOrigin && url.pathname.startsWith("/api/")) {
    console.warn(`🛑 [CORS REJEITADO] Acesso bloqueado para a origem: "${origin}"`);
    return new Response(JSON.stringify({ error: "CORS: Origem não autorizada para esta API." }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // ROTA DE INFRAESTRUTURA: Compartilha a chave pública para cifragem da chave VAPID
  if (req.method === "GET" && url.pathname === "/api/server-public-key") {
    return new Response(JSON.stringify(serverPublicKeyJwk), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  if (url.pathname === "/api/logout" && req.method === "POST") {
    const headers = new Headers();

    // Remove o cookie que guarda a sessão (substitua 'session_token' pelo nome do seu cookie)
    deleteCookie(headers, "session_token", { path: "/" });

    // Envia instrução nativa HTTP para o navegador apagar storages, cookies e caches
    headers.set("Clear-Site-Data", '"cache", "cookies", "storage"');
    
    // Retorna uma resposta de sucesso para o fetch do front-end
    return new Response(JSON.stringify({ disconnected: true }), {
      status: 200,
      headers: {
        ...Object.fromEntries(headers.entries()),
        "content-type": "application/json",
      },
    });
  }


  // ROTA DE DISPARO: Processa o envelope VAPID e encaminha o JWT criptografado
  if (req.method === "POST" && url.pathname === "/api/proxy-push") {
    console.log(`\n📥 [${new Date().toLocaleTimeString()}] Nova requisição proxy recebida!`);
    
    try {
      const body = await req.json();
      const { subscription, payloadText, vapid, isVapidEncrypted } = body;

      console.log(`   - Endpoint destino: ${subscription.endpoint.substring(0, 45)}...`);
      console.log(`   - isVapidEncrypted: ${isVapidEncrypted}`);
      console.log(`   - Tamanho do payloadText: ${payloadText?.length || 0} bytes`);

      // Executa a auditoria cega das claims do token JWT
      const jwtClaims = lerMetadadosJJWT(payloadText);
      if (jwtClaims) {
        console.log(`   - [AUDITORIA JWT] Emitido por: ${jwtClaims.name || "Desconhecido"} <${jwtClaims.iss || "Sem e-mail"}>`);
        console.log(`   - [AUDITORIA JWT] Destinado a: <${jwtClaims.sub || "Sem e-mail"}>`);
        console.log(`   - [AUDITORIA JWT] Texto E2EE Criptografado (Hex): ${jwtClaims.cipherText?.substring(0, 20) || "N/A"}...`);
      } else {
        console.log(`   - [AUDITORIA JWT] ⚠️ Não foi possível ler as claims do JWT`);
      }

      let privateKeyFinal = vapid.privateKey;

      // 🔥 DESCRIPTOGRAFIA DA CHAVE PRIVADA VAPID NA RAM
      if (isVapidEncrypted && typeof privateKeyFinal === "string") {
        console.log("   - [SEGURANÇA] Descriptografando Chave Privada VAPID com a RSA do Servidor...");
        console.log(`   - [SEGURANÇA] Tamanho do envelope: ${privateKeyFinal.length} bytes`);
        try {
          const decryptedPrivateKeyObj = await decryptWithServerKey(privateKeyFinal);
          privateKeyFinal = decryptedPrivateKeyObj;
          console.log("   - [SEGURANÇA] ✅ Chave VAPID descriptografada com sucesso!");
          console.log(`   - [SEGURANÇA] Chave descriptografada: kty=${privateKeyFinal.kty}, crv=${privateKeyFinal.crv}`);
        } catch (decryptErr) {
          console.error("   - [SEGURANÇA] ❌ Erro ao descriptografar chave VAPID:", decryptErr);
          return new Response(
            JSON.stringify({ success: false, error: "Falha ao descriptografar chave VAPID." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        console.log("   - Chave VAPID não está criptografada, usando diretamente");
      }

      // 1. Processa e normatiza as chaves do request
      let jwkKeys;
      try {
        jwkKeys = parseVapidKeysToJwk(vapid.publicKey, privateKeyFinal);
        console.log("   - ✅ Chaves VAPID parseadas com sucesso");
        console.log(`   - PublicKey: kty=${jwkKeys.publicKey.kty}, crv=${jwkKeys.publicKey.crv}`);
        console.log(`   - PrivateKey: kty=${jwkKeys.privateKey.kty}, crv=${jwkKeys.privateKey.crv}`);
      } catch (parseErr) {
        console.error("   - ❌ Erro ao parsear chaves VAPID:", parseErr);
        return new Response(
          JSON.stringify({ success: false, error: "Chaves VAPID inválidas." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 2. Importa a assinatura do cabeçalho de rede do push
      let vapidKeys;
      try {
        vapidKeys = await webpush.importVapidKeys(jwkKeys);
        console.log("   - ✅ Chaves VAPID importadas com sucesso");
        console.log(`   - VAPID Keys: publicKey=${!!vapidKeys.publicKey}, privateKey=${!!vapidKeys.privateKey}`);
      } catch (importErr) {
        console.error("   - ❌ Erro ao importar chaves VAPID:", importErr);
        return new Response(
          JSON.stringify({ success: false, error: "Falha ao importar chaves VAPID." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Cria o servidor de aplicação
      let appServer;
      try {
        const contact = vapid.subject.startsWith("mailto:") ? vapid.subject : `mailto:${vapid.subject}`;
        console.log(`   - Contact: ${contact}`);
        appServer = await webpush.ApplicationServer.new({
          contactInformation: contact,
          vapidKeys: vapidKeys,
        });
        console.log("   - ✅ ApplicationServer criado com sucesso");
      } catch (serverErr) {
        console.error("   - ❌ Erro ao criar ApplicationServer:", serverErr);
        return new Response(
          JSON.stringify({ success: false, error: "Falha ao criar servidor de push." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 3. Encaminha o token JWT fechado diretamente sem descriptografar o conteúdo
      try {
        console.log("   - 📤 Enviando push para:", subscription.endpoint.substring(0, 60) + "...");
        console.log(`   - 📤 Tamanho do payload: ${payloadText.length} bytes`);
        
        const subscriber = appServer.subscribe(subscription);
        await subscriber.pushTextMessage(payloadText, {});
        
        console.log("   ✅ [SUCESSO] Push despachado! Chave Privada VAPID descartada com segurança da RAM.");
      } catch (pushErr) {
        console.error("   - ❌ Erro ao enviar push:", pushErr);
        
        // 🔥 Tenta ler o corpo da resposta do FCM para diagnóstico
        let responseBody = '';
        let statusCode = 500;
        
        try {
          if (pushErr instanceof webpush.PushMessageError && pushErr.response) {
            statusCode = pushErr.response.status;
            responseBody = await pushErr.response.text();
            console.error(`   - 📄 Resposta do FCM (status ${statusCode}): ${responseBody}`);
          }
        } catch (e) {
          console.error(`   - ❌ Não foi possível ler a resposta do FCM:`, e);
        }
        
        // Se for erro de subscription inválida (410) ou 404
        if (pushErr instanceof webpush.PushMessageError && (pushErr.response?.status === 410 || pushErr.response?.status === 404)) {
          return new Response(
            JSON.stringify({ success: false, error: "Inscrição expirada ou revogada.", statusCode: pushErr.response.status }),
            { status: pushErr.response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // Se o status for 400, pode ser problema no payload ou na chave
        if (pushErr instanceof webpush.PushMessageError && pushErr.response?.status === 400) {
          // Se a resposta contiver "Invalid VAPID" ou similar, podemos personalizar
          let msg = "Requisição inválida. Verifique a subscription e o payload.";
          if (responseBody.includes("Invalid")) {
            msg = "Chave VAPID inválida ou malformada.";
          } else if (responseBody.includes("payload")) {
            msg = "Payload malformado ou muito grande.";
          }
          return new Response(
            JSON.stringify({ success: false, error: msg, statusCode: 400 }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // Re-lança o erro para ser tratado pelo catch externo se não for tratado acima
        throw pushErr;
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (error) {
      console.error(`\n❌ [ERRO NO SERVIDOR PUSH] [${new Date().toLocaleTimeString()}]:`);

      const isPushError = error && typeof error === 'object' && 'response' in error;
      
      if (isPushError) {
        const statusCode = (error as any).response?.status || 400;
        console.error(`   -> Servidor Remoto retornou Status HTTP: ${statusCode}`);
        console.error(`   -> Detalhe do Erro: ${error.toString()}`);

        let clienteMensagem = "Erro desconhecido no servidor de push.";
        switch (statusCode) {
          case 410: clienteMensagem = "Inscrição expirada ou revogada (Usuário desativou as notificações)."; break;
          case 404: clienteMensagem = "Endpoint não encontrado ou expirado no servidor de push."; break;
          case 401: clienteMensagem = "Chaves VAPID inválidas ou assinatura rejeitada pelo servidor."; break;
          case 413: clienteMensagem = "Payload muito grande. O limite máximo permitido é 4096 bytes (4KB)."; break;
          case 429: clienteMensagem = "Limite de requisições excedido para este dispositivo (Rate Limit)."; break;
          default: clienteMensagem = `Servidor de push rejeitou com status ${statusCode}.`;
        }

        return new Response(
          JSON.stringify({ success: false, error: clienteMensagem, statusCode }),
          { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      console.error(`   -> Erro Interno/Local: ${errorMessage}`);
      if (errorStack) console.error(errorStack);

      return new Response(
        JSON.stringify({ success: false, error: errorMessage, type: "InternalError" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  // 4. FALLBACK: Serve os arquivos compilados da pasta dist/
  return serveDir(req, {
    fsRoot: "./dist",
    showDirListing: false,
    quiet: true,
  });
});

console.log(`🚀 Protótipo rodando em http://localhost:${PORT}`);