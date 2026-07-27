/// <reference lib="deno.ns" />

import { serveDir } from "@std/http/file-server";

const PORT = 8000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Crypto-Key, TTL, Urgency, X-Push-Payload",
};

interface PendingMessage {
  endpoint: string;
  payload: string;
  receivedAt: number;
}

const pendingMessages = new Map<string, PendingMessage[]>();

function getPendingKey(endpoint: string): string {
  return endpoint;
}

function storePendingMessage(endpoint: string, payload: string) {
  const key = getPendingKey(endpoint);
  const list = pendingMessages.get(key) ?? [];
  list.push({ endpoint, payload, receivedAt: Date.now() });
  pendingMessages.set(key, list);
}

function takePendingMessages(endpoint: string): PendingMessage[] {
  const key = getPendingKey(endpoint);
  const list = pendingMessages.get(key) ?? [];
  pendingMessages.delete(key);
  return list;
}

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (url.pathname.startsWith("/proxy/")) {
    const targetUrl = url.pathname.replace("/proxy/", "") + url.search;
    const ts = new Date().toISOString();
    console.log(`\n${"=".repeat(72)}`);
    console.log(`[PROXY ${ts}] ${req.method} → ${targetUrl}`);
    console.log(`${"=".repeat(72)}`);

    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      console.error(`[PROXY] ❌ URL inválida: ${targetUrl}`);
      return new Response("URL de destino inválida", { status: 400, headers: corsHeaders });
    }

    const fallbackPayload = req.headers.get("X-Push-Payload");
    const contentType = req.headers.get("Content-Type");
    const contentEncoding = req.headers.get("Content-Encoding");
    const ttl = req.headers.get("TTL");
    const authorization = req.headers.get("Authorization");
    const cryptoKey = req.headers.get("Crypto-Key");
    const urgency = req.headers.get("Urgency");

    console.log(`[PROXY] headers recebidos do cliente:`);
    console.log(`  Content-Type:      ${contentType}`);
    console.log(`  Content-Encoding:  ${contentEncoding}`);
    console.log(`  TTL:               ${ttl}`);
    console.log(`  Urgency:           ${urgency}`);
    console.log(`  Authorization:     ${authorization ? authorization.slice(0, 40) + "…" : "❌ AUSENTE"}`);
    console.log(`  Crypto-Key:        ${cryptoKey ? cryptoKey.slice(0, 40) + "…" : "❌ AUSENTE"}`);
    console.log(`  X-Push-Payload:    ${fallbackPayload ? "presente (" + fallbackPayload.length + " chars)" : "ausente"}`);

    const bodyBytes = req.body ? await new Response(req.body).arrayBuffer() : null;
    console.log(`[PROXY] body: ${bodyBytes ? bodyBytes.byteLength + " bytes" : "vazio/null"}`);

    try {
      const forwardHeaders = new Headers();
      if (contentType) forwardHeaders.set("Content-Type", contentType);
      if (contentEncoding) forwardHeaders.set("Content-Encoding", contentEncoding);
      if (ttl) forwardHeaders.set("TTL", ttl);
      if (authorization) forwardHeaders.set("Authorization", authorization);
      if (cryptoKey) forwardHeaders.set("Crypto-Key", cryptoKey);
      if (urgency) forwardHeaders.set("Urgency", urgency);
      if (bodyBytes) forwardHeaders.set("Content-Length", String(bodyBytes.byteLength));

      console.log(`[PROXY] enviando para ${new URL(targetUrl).host} …`);
      const t0 = performance.now();

      const response = await fetch(targetUrl, {
        method: req.method,
        headers: forwardHeaders,
        body: bodyBytes ?? undefined,
      });

      const elapsed = (performance.now() - t0).toFixed(0);
      const responseBody = await response.text();

      console.log(`[PROXY] ✅ resposta do FCM em ${elapsed}ms:`);
      console.log(`  Status:  ${response.status} ${response.statusText}`);
      console.log(`  Headers: ${[...response.headers.entries()].map(([k, v]) => `${k}=${v}`).join(", ")}`);
      if (responseBody) {
        console.log(`  Body:    ${responseBody.slice(0, 500)}`);
      } else {
        console.log(`  Body:    (vazio)`);
      }

      if (!response.ok) {
        console.warn(`[PROXY] ⚠️  FCM retornou erro ${response.status}`);
      }

      const proxyResponseHeaders = new Headers();
      proxyResponseHeaders.set("Content-Type", response.headers.get("Content-Type") ?? "text/plain");
      Object.entries(corsHeaders).forEach(([key, value]) => {
        proxyResponseHeaders.set(key, value);
      });

      return new Response(responseBody || null, {
        status: response.status,
        headers: proxyResponseHeaders,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[PROXY] ❌ ERRO de rede ao contatar ${targetUrl}`);
      console.error(`  ${message}`);
      console.log(`[FALLBACK] armazenando mensagem para pickup via /pending`);

      if (fallbackPayload) {
        storePendingMessage(targetUrl, decodeURIComponent(fallbackPayload));
        console.log(`[FALLBACK] payload salvo (${fallbackPayload.length} chars)`);
      }

      return new Response(
        JSON.stringify({ fallback: true, error: message }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  if (url.pathname === "/pending") {
    const endpoint = url.searchParams.get("endpoint");
    console.log(`\n[PENDING ${new Date().toISOString()}] consulta para: ${endpoint?.slice(0, 80)}…`);
    if (!endpoint) {
      return new Response(JSON.stringify({ error: "endpoint obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const messages = takePendingMessages(endpoint).map((m) => m.payload);
    console.log(`[PENDING] ${messages.length} mensagem(ns) pendente(s) encontrada(s)`);
    return new Response(JSON.stringify({ messages }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return serveDir(req, {
    fsRoot: "./dist",
    showDirListing: false,
    quiet: true,
  });
});

console.log(`🚀 Protótipo PWA Push rodando em http://localhost:${PORT}`);
