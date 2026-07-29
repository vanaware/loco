/// <reference lib="deno.ns" />
import { serveDir } from "jsr:@std/http@1/file-server";
import * as webpush from "jsr:@negrel/webpush";

const PORT = 8000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Crypto-Key, TTL, Urgency, X-Push-Payload",
};

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === "POST" && url.pathname === "/api/proxy-push") {
    console.log(`\n📥 [${new Date().toLocaleTimeString()}] Nova requisição proxy recebida!`);
    
    try {
      const body = await req.json();
      const { subscription, payloadText, vapid } = body;

      console.log(`   [LOG] Endpoint destino: ${subscription.endpoint.substring(0, 50)}...`);
      console.log(`   [LOG] Importando chaves VAPID JWK nativas...`);

      // 1. Como chega em formato JWK estruturado, a importação é direta e nativa
      const vapidKeys = await webpush.importVapidKeys({
        publicKey: vapid.publicKey,
        privateKey: vapid.privateKey,
      });

      console.log(`   [LOG] Inicializando ApplicationServer...`);
      const appServer = await webpush.ApplicationServer.new({
        contactInformation: vapid.subject,
        vapidKeys: vapidKeys,
      });

      console.log(`   [LOG] Registrando assinatura no assinante...`);
      // 2. Como a subscription veio do .toJSON() do browser, o pacote do Negrel 
      // já sabe decodificar as propriedades internas sem intervenção manual de strings!
      const subscriber = appServer.subscribe(subscription);
      
      console.log(`   [LOG] Criptografando e despachando notificação Web Push...`);
      await subscriber.pushTextMessage(payloadText, {});

      console.log("   ✅ [SUCESSO] Push despachado corretamente para o servidor central!");

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (error) {
      console.error(`\n❌ [FALHA NO SERVIDOR]: ${(error as Error).message}`);
      console.error((error as Error).stack);

      return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }

  return serveDir(req, {
    fsRoot: "./dist",
    showDirListing: false,
    quiet: true,
  });
});

console.log(`🚀 Protótipo rodando em http://localhost:${PORT}`);
