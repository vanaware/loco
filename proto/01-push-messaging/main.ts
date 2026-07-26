/// <reference lib="deno.ns" />

import { serveDir } from "@std/http/file-server";
import * as webpush from "@negrel/webpush";

const PORT = 8000;
const VAPID_FILE = "./vapid.json";

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

// Carrega ou gera as chaves VAPID do servidor.
async function loadOrCreateVapidKeys(): Promise<CryptoKeyPair> {
  try {
    const raw = await Deno.readTextFile(VAPID_FILE);
    const exported = JSON.parse(raw);
    return await webpush.importVapidKeys(exported);
  } catch {
    const keys = await webpush.generateVapidKeys({ extractable: true });
    const exported = await webpush.exportVapidKeys(keys);
    await Deno.writeTextFile(VAPID_FILE, JSON.stringify(exported));
    console.log("🔐 Novas chaves VAPID geradas em vapid.json");
    return keys;
  }
}

const vapidKeys = await loadOrCreateVapidKeys();
const publicKey = await webpush.exportApplicationServerKey(vapidKeys);
const appServer = await webpush.ApplicationServer.new({
  contactInformation: "mailto:proto@loco.local",
  vapidKeys,
});

const subscriptions = new Map<string, PushSubscription>();

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/vapid" && req.method === "GET") {
    return new Response(JSON.stringify({ publicKey }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (url.pathname === "/register" && req.method === "POST") {
    const body = await req.json() as { id?: string; subscription?: PushSubscription };
    if (!body.id || !body.subscription) {
      return new Response("Bad request", { status: 400 });
    }
    subscriptions.set(body.id, body.subscription);
    console.log(`📥 Subscription registrada para id=${body.id}`);
    return new Response("OK");
  }

  if (url.pathname.startsWith("/send/") && req.method === "POST") {
    const id = url.pathname.slice("/send/".length);
    const subscription = subscriptions.get(id);
    if (!subscription) {
      return new Response("Subscription not found", { status: 404 });
    }

    const { text, fromId } = await req.json() as { text?: string; fromId?: string };
    const payload = JSON.stringify({
      title: `Mensagem de ${fromId ?? "alguém"}`,
      text: text ?? "",
      fromId: fromId ?? "desconhecido",
    });

    const subscriber = appServer.subscribe(subscription);
    await subscriber.pushTextMessage(payload, {});

    console.log(`📤 Push enviado para id=${id}`);
    return new Response("OK");
  }


  // 1. Cabeçalhos CORS para permitir que o seu próprio Front-end fale com o Proxy
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*", // Em produção, substitua pelo seu domínio exato
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Crypto-Key, TTL",
  };

  // Trata a requisição de pré-vôo (OPTIONS) feita pelo navegador antes do POST
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // 2. ROTA DO PROXY: Identifica se a requisição é para o push
  if (url.pathname.startsWith("/proxy/")) {
    // Extrai a URL real do serviço de push (ex: https://googleapis.com...)
    const targetUrl = url.pathname.replace("/proxy/", "") + url.search;

    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      return new Response("URL de destino inválida", { status: 400, headers: corsHeaders });
    }

    try {
      // Clona os cabeçalhos originais que o Front-end enviou (contendo o VAPID)
      const headers = new Headers(req.headers);
      headers.delete("host"); // Evita que o destino ache que a requisição veio de um domínio errado

      // O Deno faz o disparo para o servidor da Google/Apple (Sem restrição de CORS)
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: headers,
        body: req.body,
      });

      // Cria a resposta de volta para o navegador injetando as permissões de CORS
      const proxyResponseHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        proxyResponseHeaders.set(key, value);
      });

      return new Response(response.body, {
        status: response.status,
        headers: proxyResponseHeaders,
      });

    } catch (error) {
      return new Response(`Erro de conexão no Proxy: ${error.message}`, { 
        status: 500, 
        headers: corsHeaders 
      });
    }
  }


  return serveDir(req, {
    fsRoot: "./dist",
    showDirListing: false,
    quiet: true,
  });
});

console.log(`🚀 Protótipo PWA Push rodando em http://localhost:${PORT}`);
console.log(`   Chave pública VAPID: ${publicKey}`);




