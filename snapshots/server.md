> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém os arquivos de configuração e execução do SERVIDOR @loco/server e CI/CD.
> O projeto é o **Loco ** estruturado em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco - Modo: SERVER

Gerado automaticamente em: 8/30/2026, 12:32:32 AM

---

## Arquivo: `.github/workflows/main.yml`

```yaml
name: Release and Deploy

on:
  push:
    tags:
      - 'v*.*' # Dispara apenas para tags iniciando com 'v' (ex: v0.2, v1.0.0)

jobs:
  test-and-build:
    runs-on: ubuntu-latest
    environment: production
    outputs:
      version: ${{ steps.set_tag.outputs.VERSION_TAG }}
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4
      
      - name: Set Tag Output
        id: set_tag
        run: echo "VERSION_TAG=${{ github.ref_name }}" >> $GITHUB_OUTPUT

      - name: Setup Deno
        uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x
          cache: true

      - name: Run Tests
        run: deno task tests

      # No build, as variáveis opcionais podem ficar vazias, o Deno lida bem com isso
      - name: Run Build Script
        env:
          SERVER_PRIVATE_KEY: ${{ secrets.SERVER_PRIVATE_KEY }}
          SERVER_PUBLIC_KEY: ${{ secrets.SERVER_PUBLIC_KEY }}
          PROXY_PATH: ${{ secrets.PROXY_PATH }}
        # Executa o build sem versionamento incremental, pois o deploy.sh já o fez localmente
        run: deno task build noversion

      - name: Zip Release Files
        run: zip -r build.zip build/

      - name: Upload Artifact
        uses: actions/upload-artifact@v4
        with:
          name: deployment-package
          path: |
            build.zip
            wrangler-pages.toml
            wrangler-worker.toml
          if-no-files-found: error
          retention-days: 1

  create-release:
    needs: test-and-build
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Download Artifact
        uses: actions/download-artifact@v4
        with:
          name: deployment-package
      
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: build.zip
          name: Release ${{ needs.test-and-build.outputs.version }}
          tag_name: ${{ needs.test-and-build.outputs.version }}

  deploy-pages:
    needs: create-release
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Download Artifact
        uses: actions/download-artifact@v4
        with:
          name: deployment-package

      - name: Unzip Build
        run: unzip build.zip

      - name: Setup Pages
        uses: actions/configure-pages@v4

      - name: Upload Pages Artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: 'build/dist'

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4

  deploy-cloudflare:
    needs: create-release
    runs-on: ubuntu-latest
    steps:
      - name: Download Artifact
        uses: actions/download-artifact@v4
        with:
          name: deployment-package

      - name: Unzip Build
        run: unzip build.zip

      - name: Deploy do Backend (Cloudflare Worker)
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          # 🔥 Passa explicitamente a configuração do backend
          command: deploy --name loco -c wrangler-worker.toml

      - name: Prepare Pages Config
        run: |
          mv wrangler-pages.toml wrangler.toml
          mv build/functions ./

      - name: Deploy do Frontend (Cloudflare Pages)
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          # 🔥 Comando 100% limpo: o Wrangler Actions lerá o wrangler.toml nativamente!
          command: pages deploy
```

---

## Arquivo: `monorepo/server/tests/server-crypto.test.ts`

```ts
// tests/integration/server-crypto.test.ts
/// <reference lib="deno.ns" />
import { assert, assertEquals } from "@std/assert";
import { 
  generateVAPIDKeys, 
  generateRSAKeys, 
  exportKeyToJWK, 
  minifyRsaPublic, 
  minifyRsaPrivate,
  expandRsaPublic
} from "@loco/utils/crypto";
import { cifrarChaveVapid } from "@loco/utils/proxy";
import { decryptWithServerKey } from "../src/shared.ts";

Deno.test("INTEGRAÇÃO: Pipeline Criptográfica Completa (Cliente -> PWA -> Servidor)", async () => {
  // 1. Gera chaves RSA brutas para simular um servidor novo
  const rawServerKeys = await generateRSAKeys();
  const rawPublicKeyJwk = await exportKeyToJWK(rawServerKeys.publicKey);
  const rawPrivateKeyJwk = await exportKeyToJWK(rawServerKeys.privateKey);
  
  // 2. Simula o processo do deploy.sh minificando as chaves e setando as ENV vars
  const envMock = {
    SERVER_PUBLIC_KEY: JSON.stringify(minifyRsaPublic(rawPublicKeyJwk)),
    SERVER_PRIVATE_KEY: JSON.stringify(minifyRsaPrivate(rawPrivateKeyJwk))
  };
  
  // 3. O Cliente arranca e gera a sua chave VAPID
  const clientVapidKeys = await generateVAPIDKeys();
  const clientVapidPrivateKeyJwk = await exportKeyToJWK(clientVapidKeys.privateKey);
  
  // 🔥 SOLUÇÃO: O Cliente (PWA) recebe a chave minificada do Proxy e TEM de a expandir (injetar KTY, ALG, E)
  const expandedServerPublicKey = expandRsaPublic(JSON.parse(envMock.SERVER_PUBLIC_KEY));
  
  // Agora sim, a chave expandida é passada para o motor WebCrypto sem dar erro de "KTY missing"
  const envelopeBase64 = await cifrarChaveVapid(clientVapidPrivateKeyJwk, expandedServerPublicKey);
  assert(typeof envelopeBase64 === "string", "O envelope gerado deve ser uma string Base64");
  
  // 4. O Servidor recebe o envelope e tenta decifrá-lo consumindo as ENV vars minificadas
  const decryptedJwk = await decryptWithServerKey(envMock, envelopeBase64);
  
  // 5. Verifica se os dados se mantiveram perfeitos durante toda a transação
  assertEquals(
    decryptedJwk.d, 
    clientVapidPrivateKeyJwk.d, 
    "FALHA FATAL: A chave extraída pelo servidor não corresponde à original!"
  );
  console.log("✅ Pipeline Criptográfico Uniformizado operando com perfeição!");
});

Deno.test("INTEGRAÇÃO: Servidor deve rejeitar (Nó Incorreto/OperationError) com Chaves Dessincronizadas", async () => {
  const keysOntem = await generateRSAKeys();
  const keysHoje = await generateRSAKeys();
  
  const envMockHoje = {
    SERVER_PUBLIC_KEY: JSON.stringify(minifyRsaPublic(await exportKeyToJWK(keysHoje.publicKey))),
    SERVER_PRIVATE_KEY: JSON.stringify(minifyRsaPrivate(await exportKeyToJWK(keysHoje.privateKey)))
  };
  
  const clientVapidKeys = await generateVAPIDKeys();
  
  // 🔥 SOLUÇÃO: Expandir a chave minificada de "ontem" antes de o cliente a utilizar
  const chaveVelhaExpandida = expandRsaPublic(minifyRsaPublic(await exportKeyToJWK(keysOntem.publicKey)));
  
  // Cliente cifra usando a chave pública expandida de "ontem"
  const envelopeComChaveVelha = await cifrarChaveVapid(
    await exportKeyToJWK(clientVapidKeys.privateKey), 
    chaveVelhaExpandida
  );
  
  let deuErro = false;
  try {
    // Servidor tenta abrir usando as chaves de "hoje"
    await decryptWithServerKey(envMockHoje, envelopeComChaveVelha);
  } catch (error: any) {
    deuErro = true;
    assert(
      error.message.includes("OperationError") || error.message.includes("Nó incorreto") || error.name === "OperationError", 
      "O erro deveria ser de operação RSA (Nó Incorreto)"
    );
  }
  
  assert(deuErro, "Falha Crítica de Segurança: O Servidor conseguiu abrir um cofre trancado com outra chave!");
});
```

---

## Arquivo: `monorepo/server/tests/federation_routing_test.ts`

```ts
// testes/federation_routing_test.ts
import { assertEquals } from "@std/assert";
import { handlePing } from "../src/functions/ping.ts";
import { handlePush } from "../src/functions/push.ts";

interface PingResponse {
  success: boolean;
  service: string;
}

interface ErrorResponse {
  error: string;
}

Deno.test("Server - Handler /ping deve retornar HTTP 200 com status OK", async () => {
  const req = new Request("https://proxy.vanaware.com/ping", {
    method: "POST"
  });
  const res = await handlePing(req);
  assertEquals(res.status, 200);
  
  const data = await res.json() as PingResponse;
  assertEquals(data.success, true);
  assertEquals(data.service, "loco-proxy");
});

Deno.test("Server - Handler /push deve rejeitar payload vazio com HTTP 400", async () => {
  const req = new Request("https://proxy.vanaware.com/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "invalid-json",
  });
  const res = await handlePush(req);
  assertEquals(res.status, 400);
  
  const data = await res.json() as ErrorResponse;
  assertEquals(data.error, "Corpo não é JSON válido.");
});
```

---

## Arquivo: `monorepo/server/tests/proxy-validation.test.ts`

```ts
// tests/integration/proxy-validation.test.ts
/// <reference lib="deno.ns" />
import { assertEquals } from "@std/assert";
import { handlePush } from "../src/functions/push.ts";

interface ErrorResponse {
  error: string;
}

// Objeto base 100% válido para usar de modelo nos testes
const createValidPayload = () => ({
  subscription: {
    endpoint: "https://fcm.googleapis.com/fcm/send/token-teste",
    keys: {
      p256dh: "p256dh-valido-base64",
      auth: "auth-valida-base64",
    },
    proxyserver: "https://proxy.loco.com",
  },
  vapid: {
    publicKey: { x: "coordenada-x", y: "coordenada-y" },
    privateKey: "envelope-cifrado-valido",
  },
  payloadText: "header.payload.signature",
});

// Auxiliar para simular a requisição HTTP POST recebida pelo Worker
function createMockRequest(bodyObj: any): Request {
  return new Request("https://proxy.loco.com/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj),
  });
}

Deno.test("VALIDAÇÃO NEGATIVA: Servidor deve ACEITAR a estrutura completa preliminarmente", async () => {
  const payload = createValidPayload();
  const res = await handlePush(createMockRequest(payload), {});
  const data = await res.json() as ErrorResponse;
  assertEquals(data.error !== "Estrutura P2P Inválida. Parâmetros em falta em subscription, vapid ou payloadText.", true);
});

Deno.test("REJEIÇÃO: Deve falhar se 'subscription' estiver ausente", async () => {
  const payload = createValidPayload();
  delete (payload as any).subscription;
  const res = await handlePush(createMockRequest(payload), {});
  assertEquals(res.status, 400);
  const data = await res.json() as ErrorResponse;
  assertEquals(data.error.includes("Estrutura P2P Inválida"), true);
});

Deno.test("REJEIÇÃO: Deve falhar se 'subscription.endpoint' estiver ausente/vazio", async () => {
  const payload = createValidPayload();
  payload.subscription.endpoint = "";
  const res = await handlePush(createMockRequest(payload), {});
  assertEquals(res.status, 400);
  const data = await res.json() as ErrorResponse;
  assertEquals(data.error.includes("Estrutura P2P Inválida"), true);
});

Deno.test("REJEIÇÃO: Deve falhar se 'subscription.proxyserver' estiver ausente/vazio", async () => {
  const payload = createValidPayload();
  payload.subscription.proxyserver = "";
  const res = await handlePush(createMockRequest(payload), {});
  assertEquals(res.status, 400);
  const data = await res.json() as ErrorResponse;
  assertEquals(data.error.includes("Estrutura P2P Inválida"), true);
});

Deno.test("REJEIÇÃO: Deve falhar se 'subscription.keys.p256dh' estiver ausente", async () => {
  const payload = createValidPayload();
  delete (payload.subscription.keys as any).p256dh;
  const res = await handlePush(createMockRequest(payload), {});
  assertEquals(res.status, 400);
  const data = await res.json() as ErrorResponse;
  assertEquals(data.error.includes("Estrutura P2P Inválida"), true);
});

Deno.test("REJEIÇÃO: Deve falhar se 'vapid.publicKey' estiver ausente", async () => {
  const payload = createValidPayload();
  delete (payload.vapid as any).publicKey;
  const res = await handlePush(createMockRequest(payload), {});
  assertEquals(res.status, 400);
  const data = await res.json() as ErrorResponse;
  assertEquals(data.error.includes("Estrutura P2P Inválida"), true);
});

Deno.test("REJEIÇÃO: Deve falhar se 'vapid.privateKey' (envelope) estiver ausente", async () => {
  const payload = createValidPayload();
  delete (payload.vapid as any).privateKey;
  const res = await handlePush(createMockRequest(payload), {});
  assertEquals(res.status, 400);
  const data = await res.json() as ErrorResponse;
  assertEquals(data.error.includes("Estrutura P2P Inválida"), true);
});

Deno.test("REJEIÇÃO: Deve falhar se 'payloadText' estiver vazio", async () => {
  const payload = createValidPayload();
  payload.payloadText = "";
  const res = await handlePush(createMockRequest(payload), {});
  assertEquals(res.status, 400);
  const data = await res.json() as ErrorResponse;
  assertEquals(data.error.includes("Estrutura P2P Inválida"), true);
});
```

---

## Arquivo: `monorepo/server/src/functions/ping.ts`

```ts
/// <reference types="@cloudflare/workers-types" />

import { sendResponse, handlePreflight, APP_VERSION } from "../shared.ts";

export async function handlePing(request: Request, env?: any): Promise<Response> {
  return sendResponse(request, { success: true, service: "loco-proxy", timestamp: Date.now(), version: APP_VERSION });
}

export const onRequestPost = async (context: any) => {
  return await handlePing(context.request, context.env);
};

export const onRequestOptions = async (context: any) => {
  return handlePreflight(context.request);;
};

```

---

## Arquivo: `monorepo/server/src/functions/publickey.ts`

```ts
/// <reference types="@cloudflare/workers-types" />

import { sendResponse, handlePreflight, getOrInitServerKeys } from "../shared.ts";

export async function handlePublicKey(request: Request, env?: any): Promise<Response> {
  const { serverPublicKeyMinified } = await getOrInitServerKeys(env);
  return sendResponse(request, serverPublicKeyMinified);
}

export const onRequestPost = async (context: any) => {
  return await handlePublicKey(context.request, context.env);
};

export const onRequestOptions = async (context: any) => {
  return handlePreflight(context.request);;
};
```

---

## Arquivo: `monorepo/server/src/functions/push.ts`

```ts
/// <reference types="@cloudflare/workers-types" />

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
```

---

## Arquivo: `monorepo/server/src/worker.ts`

```ts

/// <reference types="@cloudflare/workers-types" />

import { sendResponse, handlePreflight } from "./shared.ts";
import { handlePing } from "./functions/ping.ts";
import { handlePublicKey } from "./functions/publickey.ts";
import { handlePush } from "./functions/push.ts";

const workerHandler = {
  async fetch(request: Request, env: any, _ctx: any): Promise<Response> {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname;
      const method = request.method;

      if (method === "OPTIONS") {
          return handlePreflight(request);
      }

      if (method === "POST") {
        // Roteamento explícito delegando a execução para os handlers importados
        switch (pathname) {
          case "/ping":
            return await handlePing(request, env);

          case "/publickey":
            return await handlePublicKey(request, env);

          case "/push":
            return await handlePush(request, env);

          default:
            return sendResponse(request, { error: `Rota '${pathname}' não encontrada no Worker.` }, 404);
        }
      } else {
        return sendResponse(request, { error: `Método '${method}' não encontrado no Worker.` }, 404);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // [WORKER EXCEPTION]: ${errorMessage}
      return sendResponse(request, { success: false, error: errorMessage }, 400);
    }
  },
};

export default workerHandler;
```

---

## Arquivo: `monorepo/server/src/main.ts`

```ts
/// <reference lib="deno.ns" />

import { serveDir } from "@std/http/file-server";
import workerHandler from "./worker.ts";

const env = Deno.env.toObject()
Deno.serve({ port: Number(env?.PORT || 8000) }, async (req) => {    
    const url = new URL(req.url);
    const ctx = {
        waitUntil: (p: Promise<any>) => { p.catch(console.error); },
        passThroughOnException: () => {}
    };

// 1. Tenta processar a requisição através do workerHandler (APIs e Proxy Push)
    const workerResponse = await workerHandler.fetch(req, env, ctx);

    // 2. Se o worker processou com sucesso ou retornou erro de API (ex: 400, 403, 500), retorna o resultado dele
    if (workerResponse.status !== 404) {
        return workerResponse;
    }

    // 3. Se o worker retornou 404 (Endpoint não encontrado), significa que não é uma API.
    // Deixamos o serveDir processar para entregar o arquivo estático correspondente (HTML, JS, CSS, Ícones) do ./dist.
    try {
        const staticResponse = await serveDir(req, {
            fsRoot: "../build/dist",
            showDirListing: false,
            quiet: true,
        });

        // Se o arquivo estático foi encontrado e servido com sucesso, retorna-o
        if (staticResponse.status !== 404) {
            return staticResponse;
        }
    } catch {
        // Silencia erros de IO do disco
    }

    // 4. Se nem a API nem o disco possuíam o recurso, retorna o 404 limpo do worker
    return workerResponse; 

});

```

---

## Arquivo: `monorepo/server/src/shared.ts`

```ts
// server/shared.ts
import { 
  expandRsaPublic, 
  expandRsaPrivate, 
  minifyRsaPublic,
  importJWKToKey
} from "@loco/utils/crypto";

import { 
  decifrarChaveVapid, 
  extrairEExpandirChavesVapid 
} from "@loco/utils/proxy";

export { APP_VERSION } from "@loco/utils/config";
export { extrairEExpandirChavesVapid };

let serverPrivateKeyCache: CryptoKey | null = null;
let serverPublicKeyJwkCache: JsonWebKey | null = null;
let serverPublicKeyMinifiedCache: any | null = null; 

export const DEFAULT_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Target-URL",
  "Access-Control-Max-Age": "86400",
};

function corsHeaders(request: Request): Headers {
  try {
    const headers = new Headers();
    const origin = request.headers.get("Origin") || "*";
    headers.set("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
    const reqHeaders = request.headers.get("Access-Control-Request-Headers");
    headers.set("Access-Control-Allow-Headers", reqHeaders || "*");
    headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Max-Age", "86400");
    headers.set("Vary", "Origin");
    return headers;
  } catch (_err) {
    return new Headers(DEFAULT_CORS_HEADERS);
  }
}

export function handlePreflight(request: Request): Response {
  const headers = corsHeaders(request);
  return new Response(null, { status: 204, headers });
}

export function sendResponse(request: Request, data: unknown, status = 200): Response {
  const headers = corsHeaders(request);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(data), { status, headers });
}

export async function getOrInitServerKeys(env: { SERVER_PUBLIC_KEY?: string; SERVER_PRIVATE_KEY?: string }) {
  if (serverPrivateKeyCache && serverPublicKeyJwkCache && serverPublicKeyMinifiedCache) {
    return { 
      serverPrivateKey: serverPrivateKeyCache, 
      serverPublicKeyJwk: serverPublicKeyJwkCache,
      serverPublicKeyMinified: serverPublicKeyMinifiedCache
    };
  }

  const publicKeyStr = env?.SERVER_PUBLIC_KEY;
  const privateKeyStr = env?.SERVER_PRIVATE_KEY;

  if (!publicKeyStr || !privateKeyStr) {
    throw new Error("❌ Chaves SERVER_PUBLIC_KEY ou SERVER_PRIVATE_KEY não encontradas no ambiente!");
  }

  try {
    const rawPublicKeyJwk = JSON.parse(publicKeyStr);
    const rawPrivateKeyJwk = JSON.parse(privateKeyStr);
    
    // Expansão Oficial via PWA Utils
    const publicKeyJwk = expandRsaPublic(rawPublicKeyJwk);
    const privateKeyJwk = expandRsaPrivate(rawPrivateKeyJwk, publicKeyJwk);
    const minifiedPublicKey = minifyRsaPublic(publicKeyJwk);
    
    // Importação Oficial via PWA Utils
    const serverPrivateKey = await importJWKToKey(
      privateKeyJwk, 
      { name: "RSA-OAEP", hash: "SHA-256" }, 
      true, 
      ["decrypt"]
    );

    serverPrivateKeyCache = serverPrivateKey;
    serverPublicKeyJwkCache = publicKeyJwk;
    serverPublicKeyMinifiedCache = minifiedPublicKey;

    return { serverPrivateKey, serverPublicKeyJwk: publicKeyJwk, serverPublicKeyMinified: minifiedPublicKey };
  } catch (err) {
    throw new Error(`Erro inicializando chaves: ${err}`);
  }
}

export async function decryptWithServerKey(env: { SERVER_PUBLIC_KEY?: string; SERVER_PRIVATE_KEY?: string }, base64Envelope: string): Promise<any> {
  const { serverPrivateKey } = await getOrInitServerKeys(env);
  
  // 🔥 LÓGICA HIPER-ENXUTA: O Servidor apenas chama a rotina idêntica do Cliente
  return await decifrarChaveVapid(base64Envelope, serverPrivateKey);
}
```

---

## Arquivo: `monorepo/server/wrangler-pages.toml`

```toml
#:schema node_modules/wrangler/config-schema.json

# wrangler.toml (FRONTEND - Cloudflare Pages)

name = "loco"
compatibility_date = "2026-08-16"

# Configuração nativa para o diretório estático do Pages
pages_build_output_dir = "build/dist"

[vars]
SERVER_PUBLIC_KEY = '{"n":"mCUI2Ol5JwQsPMOT5DyMRJSy5WBT2rWX-w8_2tMJgk4GmCfmX9Di2MeUBa-S4Z3YuzBjGfsi2ZQ1PiET7tlbWDY0_2sztcvTJKiCWwMuGjnW3drzrytTdY6KiE8yxdLV8SjBPM6lpgBmIPXm0meOa5Ucn3lVwhO5md3gasR14MjtVWq4-SdYPJw7wP9OyAv4Q06izfS2aiFSQSbeXuj10HM9kyXArT3JhN4-LIIDh_jB5vE58FHzOdjzUalq9tEQolmxZ9rxEAaBtqMBNobn1Pgbe1NA1XyHHdHjo7Y3feraieBCl0B21OUxCPr80aC-SnxhW9pPf7IMP7fDryFgBQ"}'

```

---

## Arquivo: `monorepo/server/wrangler-worker.toml`

```toml
#:schema node_modules/wrangler/config-schema.json

# wrangler-worker.toml (BACKEND - Cloudflare Worker)

name = "loco"
main = "build/worker.js"
compatibility_date = "2026-08-16"
workers_dev = false
preview_urls = false

routes = [
  { pattern = "proxy.vanaware.com", custom_domain = true }
]

[vars]
PROXY_PATH = '/'
SERVER_PUBLIC_KEY = '{"n":"mCUI2Ol5JwQsPMOT5DyMRJSy5WBT2rWX-w8_2tMJgk4GmCfmX9Di2MeUBa-S4Z3YuzBjGfsi2ZQ1PiET7tlbWDY0_2sztcvTJKiCWwMuGjnW3drzrytTdY6KiE8yxdLV8SjBPM6lpgBmIPXm0meOa5Ucn3lVwhO5md3gasR14MjtVWq4-SdYPJw7wP9OyAv4Q06izfS2aiFSQSbeXuj10HM9kyXArT3JhN4-LIIDh_jB5vE58FHzOdjzUalq9tEQolmxZ9rxEAaBtqMBNobn1Pgbe1NA1XyHHdHjo7Y3feraieBCl0B21OUxCPr80aC-SnxhW9pPf7IMP7fDryFgBQ"}'

[observability]
enabled = true
head_sampling_rate = 1

[observability.logs]
enabled = true
head_sampling_rate = 1
persist = true
invocation_logs = true

[observability.traces]
enabled = true
persist = true
head_sampling_rate = 1
```

---

## Arquivo: `monorepo/server/deploy.sh`

```bash
#!/bin/bash

# Aborta o script se ocorrer algum erro crítico nas operações normais
set -e

# ==============================================================================
# 0. CONFIGURAÇÕES DE AMBIENTE (NON-INTERACTIVE)
# ==============================================================================
# O CI=true força o Wrangler a não fazer perguntas interativas.
export CI=true
export WRANGLER_SEND_METRICS=false

# ==============================================================================
# 1. PARSING DE ARGUMENTOS (--at=... --m=...)
# ==============================================================================

# AT="github"
MESSAGE=""

for i in "$@"; do
  case $i in
    --at=*)
      AT="${i#*=}"
      shift
      ;;
    --m=*)
      MESSAGE="${i#*=}"
      shift
      ;;
    *)
      ;;
  esac
done

# ==============================================================================
# 2. EXTRAÇÃO DINÂMICA DA VERSÃO E CONFIGURAÇÃO
# ==============================================================================

FULL_VERSION=$(grep '"version"' ../../deno.jsonc | awk -F'"' '{print $4}')
MAJOR_MINOR=$(echo $FULL_VERSION | awk -F'.' '{print $1"."$2}')
TAG_NAME="v${MAJOR_MINOR}"

if [ -z "$MESSAGE" ]; then
  MESSAGE="Versão $TAG_NAME"
fi

echo "============================================================"
echo "🚀 INICIANDO DEPLOY LOCO"
echo "============================================================"
echo "📌 Versão completa: $FULL_VERSION"
echo "🏷️  Tag alvo: $TAG_NAME"
echo "📝 Mensagem de commit: $MESSAGE"
echo "🎯 Alvo do Deploy: $AT"
echo "============================================================"

# ==============================================================================
# 3. ROTEAMENTO DO DEPLOY
# ==============================================================================

if [ "$AT" = "github" ]; then
  # ----------------------------------------------------------------------------
  # FLUXO: GITHUB ACTIONS (Com Commit e Push)
  # ----------------------------------------------------------------------------
  echo ""
  echo "📦 1/3 - Empacotando e enviando código fonte para o repositório..."
  git add :/
  git commit -m "$MESSAGE" || true
  git push

  echo ""
  echo "🧹 2/3 - Limpando tags antigas ($TAG_NAME)..."
  git push origin --delete $TAG_NAME 2>/dev/null || true
  git tag -d $TAG_NAME 2>/dev/null || true

  echo ""
  echo "🏷️  3/3 - Publicando nova tag (Isso disparará o Github Actions)..."
  git tag -a $TAG_NAME -m "Versão $TAG_NAME"
  git push origin $TAG_NAME --force

  echo ""
  echo "✅ DEPLOY VIA GITHUB ACIONADO COM SUCESSO!"
  echo "Acompanhe o andamento na aba Actions do seu repositório."

elif [ "$AT" = "cloudflare" ]; then
  # ----------------------------------------------------------------------------
  # FLUXO: CLOUDFLARE DIRETO (Sem Commit, Sem Push, Apenas Infraestrutura)
  # ----------------------------------------------------------------------------
  
  EXTRACTED_PRIVATE_KEY=$(deno run -A --env-file minify-keys.ts SERVER_PRIVATE_KEY)
  
  if [ -z "$EXTRACTED_PRIVATE_KEY" ]; then
    echo "❌ ERRO: A extração da chave retornou vazia! O deploy foi abortado."
    exit 1
  fi

  echo ""
  echo "🔐 1/4 - Injetando Segredos (Secrets) no Cloudflare Worker..."
  echo "$EXTRACTED_PRIVATE_KEY" | deno run -A wrangler secret put SERVER_PRIVATE_KEY -c wrangler-worker.toml
  echo "✅ SERVER_PRIVATE_KEY atualizado com segurança no Worker."

  echo ""
  echo "⚡ 2/4 - Realizando deploy do Backend (Cloudflare Worker)..."
  deno run -A wrangler deploy -c wrangler-worker.toml 

  echo ""
  echo "📦 Preparando ambiente local para o deploy do Frontend..."
  # O Pages lê tudo nativamente do wrangler.toml. 
  # Criamos uma cópia temporária e expomos a pasta de funções.
  cp wrangler-pages.toml wrangler.toml
  mv build/functions ./

  echo ""
  echo "🔐 3/4 - Injetando Segredos (Secrets) no Cloudflare Pages..."
  # Injeção do segredo explicitamente para o projeto Cloudflare Pages chamado "loco"
  echo "$EXTRACTED_PRIVATE_KEY" | deno run -A wrangler pages secret put SERVER_PRIVATE_KEY --project-name loco
  echo "✅ SERVER_PRIVATE_KEY atualizado com segurança no Pages."

  echo ""
  echo "⚡ 4/4 - Realizando deploy do Frontend (Cloudflare Pages)..."
  deno run -A wrangler pages deploy --commit-dirty=true
  
  echo ""
  echo "🧹 Limpando ambiente e restaurando arquivos..."
  # Limpamos o rastro para o repositório continuar limpo e organizado
  rm wrangler.toml
  mv ./functions build/

  echo ""
  echo "✅ DEPLOY DIRETO NO CLOUDFLARE CONCLUÍDO COM SUCESSO!"
  
else
  echo ""
  echo "❌ ERRO: Alvo de deploy desconhecido ('$AT'). Use '--at=github' ou '--at=cloudflare'."
  exit 1
fi

echo "============================================================"
```

---

## Arquivo: `monorepo/server/build.ts`

```ts
// build.ts
import { ensureDir } from "@std/fs";
import { minifyRsaPublic, minifyRsaPrivate, generateE2EEKeys } from "@loco/utils/crypto";

const clean = async () => {
  try {
    await Promise.all([
      Deno.remove("./build/functions", { recursive: true }),
      Deno.remove("./build/worker.js"),
      //Deno.remove("./build/worker.js.map")
    ]);
    console.log("📁 Arquivos anteriores excluído");
  } catch {
    // diretório não existe, ok
  }
  await ensureDir("./build/dist");
  await ensureDir("./build/functions");
};

async function gerarOuCarregarChavesServidor() {
  const publicKey = Deno.env.get('SERVER_PUBLIC_KEY');
  const privateKey = Deno.env.get('SERVER_PRIVATE_KEY');
  
  if (publicKey && privateKey) {
    console.log("🔑 Chaves do servidor carregadas do .env");
    return;
  }

  console.log("🔐 Gerando novas chaves RSA do servidor (Formato Minificado Duplo)...");
  const { publicEncrypt, privateDecryptJwk } = await generateE2EEKeys();
  const compactPublicJwk = minifyRsaPublic(publicEncrypt);
  const compactPrivateJwk = minifyRsaPrivate(privateDecryptJwk);
  
  const publicKeyStr = JSON.stringify(compactPublicJwk);
  const privateKeyStr = JSON.stringify(compactPrivateJwk);
  
  Deno.env.set('SERVER_PUBLIC_KEY', publicKeyStr);
  Deno.env.set('SERVER_PRIVATE_KEY', privateKeyStr);
  
  await Deno.writeTextFile(
    '.env',
    `# Chaves RSA do Servidor - Geradas automaticamente pelo build\n` +
    `# NÃO COMMITAR ESTE ARQUIVO!\n` +
    `SERVER_PUBLIC_KEY=${publicKeyStr}\n` +
    `SERVER_PRIVATE_KEY=${privateKeyStr}\n`
  );
  console.log(`✅ Chaves do servidor salvas em .env`);
}

const build = async () => {
  console.log("🚀 Iniciando build do Worker Cloudflare ...");
  const startTime = performance.now();
  
  try {
    await clean();
    await gerarOuCarregarChavesServidor();
    
    console.log("⚙️ Gerando bundle do Worker...");
    // @ts-ignore: Deno.bundle API interna operacional no runtime
    const result = await Deno.bundle({
      entrypoints: [
        "./src/worker.ts", 
        "./src/functions/ping.ts",
        "./src/functions/publickey.ts",
        "./src/functions/push.ts",
      ],
      outputDir: "./build/",
      platform: "browser",
      format: "esm", 
      packages: "bundle",
      keepnames: true,
      inlineImports: true,
      codeSplitting: false,
      minify: false,
      sourcemap: "inline",
      write: true,
    });

    if (!result.success) {
      console.error(result.errors);
      throw new Error("Falha ao gerar bundle pelo compilador interno.");
    }

    for (const warning of result.warnings || []) {
      console.warn(warning);
    }

    const endTime = performance.now();
    console.log(`✅ Build concluído com sucesso em ${(endTime - startTime).toFixed(2)}ms!`);
    console.log("📁 Saída gerada no diretório: ./build/dist/");
  } catch (error) {
    console.error("❌ Erro fatal durante o processo de build:");
    console.error(error);
    Deno.exit(1);
  }
};

await build();
```

---

## Arquivo: `monorepo/server/deno.jsonc`

```json
{
  "name": "@loco/server",
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "dom.asynciterable", "esnext", "deno.ns"],
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true
  },
  "imports": {
    "@negrel/webpush": "jsr:@negrel/webpush@^0.5.0",
    "@std/assert": "jsr:@std/assert",
    "@std/fs": "jsr:@std/fs",
    "@std/http": "jsr:@std/http",
    "@std/path": "jsr:@std/path",
    "@cloudflare/workers-types": "npm:@cloudflare/workers-types",
    "wrangler": "npm:wrangler@^4.123.0"
  },
  "tasks": {
    "build": "deno run --allow-import --allow-read --allow-write --allow-env --allow-net --env-file --unstable-bundle build.ts",
    "test": "deno test --allow-env --allow-net --allow-read tests/",
    "check": "deno check build.ts minify-keys.ts src/**/*.ts src/**/*.tsx tests/**/*.ts",
    "tests": "deno task check && deno task test",
    "start": "deno run --allow-read --allow-write --allow-env --allow-net --env-file ./src/main.ts",
    "dev": "deno run --allow-read --allow-write --allow-env --allow-net --env-file --watch ./src/main.ts",
    "clean": "deno clean && rm -rf ./build && mkdir -p ./build/dist",
    "deploy": "./deploy.sh"
  },
  "exports": "./src/worker.ts",
  "exclude": ["./build/"]
}
```

---

## Arquivo: `monorepo/server/minify-keys.ts`

```ts
// minify-keys.ts
import { minifyRsaPublic, minifyRsaPrivate } from "@loco/utils/crypto";

async function executarMinificacao() {
  const targetKey = Deno.args[0]; 
  const publicKeyStr = Deno.env.get("SERVER_PUBLIC_KEY");
  const privateKeyStr = Deno.env.get("SERVER_PRIVATE_KEY");

  if (!publicKeyStr || !privateKeyStr) {
    console.error("❌ Não foi possível ler as chaves. Certifique-se de executar o comando com a flag --env-file=.env");
    Deno.exit(1);
  }

  try {
    const publicJwk = JSON.parse(publicKeyStr);
    const privateJwk = JSON.parse(privateKeyStr);
    
    // 🔥 ARQUITETURA UNIFICADA: Minificação Centralizada
    const compactPublicJwk = minifyRsaPublic(publicJwk);
    const compactPrivateJwk = minifyRsaPrivate(privateJwk);
    
    // MODO SILENCIOSO / AUTOMAÇÃO
    if (targetKey === "SERVER_PRIVATE_KEY") {
      console.log(JSON.stringify(compactPrivateJwk));
      Deno.exit(0);
    } 
    if (targetKey === "SERVER_PUBLIC_KEY") {
      console.log(JSON.stringify(compactPublicJwk));
      Deno.exit(0);
    }
    
    // MODO VERBOSO / INTERATIVO
    console.log("\n✅ Minificação Dupla concluída com sucesso (Usando Utils Centralizadas)!\n");
    console.log("=====================================================================");
    console.log("🌐 SERVER_PUBLIC_KEY (Variável/Var Pública no Cloudflare)");
    console.log("=====================================================================");
    console.log(JSON.stringify(compactPublicJwk));
    console.log("\n");
    console.log("=====================================================================");
    console.log("🔐 SERVER_PRIVATE_KEY (Secret/Encrypt no Cloudflare)");
    console.log("=====================================================================");
    console.log(JSON.stringify(compactPrivateJwk));
    console.log("\n=====================================================================\n");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("❌ Falha ao processar as chaves. Verifique se o JSON no .env é válido.", errorMsg);
    Deno.exit(1);
  }
}

executarMinificacao();
```

---

