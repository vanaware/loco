> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém múltiplos arquivos do meu projeto estruturados em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Analise a estrutura de pastas, as dependências e o código fornecido para indicar as mudanças necessárias para a implementação das novas funcionalidades discutidas.
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo e não somente as partes que devem ser modificadas.

---

# Código Fonte Selecionado do Projeto

Gerado automaticamente em: 8/2/2026, 12:51:34 PM

---

## Arquivo: `main.ts`

```ts
/// <reference lib="deno.ns" />
import { serveDir } from "@std/http/file-server";
import * as webpush from "@negrel/webpush";

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
```

---

## Arquivo: `public/manifest.json`

```json
{
  "start_url": "/index.html",
  "name": "loco",
  "short_name": "loco",
  "icons": [
    {
      "src": "./android-chrome-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "./android-chrome-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ],
  "theme_color": "#ffffff",
  "background_color": "#ffffff",
  "display": "standalone"
}
```

---

## Arquivo: `src/service-worker.js`

```js
// src/service-worker.js

// Importa os módulos fatiados
import "./sw/cache.js";
import "./sw/push.js";
import "./sw/sync.js";
import "./sw/click.js";
import "./sw/sw-mensagens.js"; // 🔥 NOVO - Processador de mensagens

console.log("[SW] 🌌 Orquestrador Modular do Service Worker carregado com sucesso!");

// 🔥 PROCESSADOR DE FILAS EM BACKGROUND
// Tenta processar filas quando o SW é ativado
self.addEventListener('activate', (event) => {
  console.log("[SW] 🔄 Ativando e processando filas pendentes...");
  event.waitUntil(
    (async () => {
      // Aguarda um pouco para garantir que tudo está pronto
      await new Promise(r => setTimeout(r, 1000));
      
      // Processa filas
      if (self.processarFilaEnvio) {
        await self.processarFilaEnvio();
      }
      if (self.processarFilaNotificacao) {
        await self.processarFilaNotificacao();
      }
    })()
  );
});
```

---

## Arquivo: `src/sw/cache.js`

```js
// src/sw/cache.js

const CACHE_VERSION = "VERSION_HASH";
const CACHE_NAME = `loco-proto-cache-${CACHE_VERSION}`;

// O script de build vai injetar a lista dentro deste array substituindo o texto
const ASSETS_TO_CACHE = [__GENERATED_ASSETS__];

// EVENTO DE INSTALAÇÃO
self.addEventListener("install", (event) => {
  console.log("[SW-CACHE] 🛠️ Instalando novo Service Worker...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW-CACHE] 📦 Armazenando assets essenciais no cache local...");
      return Promise.all(
        ASSETS_TO_CACHE.map((url) => {
          return cache.add(url).catch((err) => {
            console.error(`[SW-CACHE] ❌ Falha ao cachear recurso: ${url}`, err);
          });
        })
      );
    }).then(() => self.skipWaiting())
  );
});

// EVENTO DE ATIVAÇÃO
self.addEventListener("activate", (event) => {
  console.log("[SW-CACHE] ✨ Ativando Service Worker e limpando caches antigos...");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log(`[SW-CACHE] 🗑️ Removendo cache obsoleto: ${cache}`);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// EVENTO FETCH
self.addEventListener("fetch", (event) => {
  if (!event.request.url.startsWith(self.location.origin) || event.request.url.includes("/api/")) {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      })
      .catch(() => {
        console.log(`[SW-CACHE] 🔌 Usuário Offline. Servindo do cache: ${event.request.url}`);
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          return new Response("Você está offline e este recurso não foi mapeado no cache.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
        });
      })
  );
});

```

---

## Arquivo: `src/sw/sync.js`

```js
// src/sw/sync.js
import { del, entries, createStore } from "idb-keyval";

// 🔥 Constantes centralizadas (copiadas do db.ts para uso no SW)
const DB_NAMES = {
  FILA_A: "BrowserA_OfflineFila_DB",
};

const STORE_NAMES = {
  KEYVAL: "keyval",
};

function criarStore(nome) {
  return createStore(nome, STORE_NAMES.KEYVAL);
}

const storeFilaDisparosA = criarStore(DB_NAMES.FILA_A);

self.addEventListener('sync', function(event) {
  console.log(`[SW-SYNC] 🔄 Sincronização em segundo plano disparada! Tag: ${event.tag}`);
  if (event.tag === 'sync-push-notifications') {
    event.waitUntil(enviarMensagensPendentes());
  }
});

async function enviarMensagensPendentes() {
  try {
    const todasAsChavesFila = await entries(storeFilaDisparosA);
    if (!todasAsChavesFila || todasAsChavesFila.length === 0) {
      console.log("[SW-SYNC] ℹ️ Nenhuma mensagem pendente na fila de sincronização.");
      return;
    }

    console.log(`[SW-SYNC] 📦 Encontrados ${todasAsChavesFila.length} push(es) pendentes para enviar...`);
    let totalSucesso = 0;

    for (const [id, payload] of todasAsChavesFila) {
      try {
        const response = await fetch("/api/proxy-push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          totalSucesso++;
          console.log(`[SW-SYNC] ✅ Mensagem enviada com sucesso ao servidor!`);
          await del(id, storeFilaDisparosA);
        } else {
          console.error("[SW-SYNC] ❌ Servidor rejeitou o POST da fila. Removendo item inválido.");
          await del(id, storeFilaDisparosA);
        }
      } catch (fetchErr) {
        console.error("[SW-SYNC] 🔌 Servidor inalcançável ou desligado. Reagendando mensagens no idb-keyval...");
        throw fetchErr; 
      }
    }

    if (totalSucesso > 0) {
      await self.registration.showNotification("✨ Conexão Restaurada!", {
        body: "Sua fila de notificações offline foi transmitida com sucesso!",
        icon: '/icon.png',
        badge: '/icon.png',
        vibrate: [100, 50, 100]
      });
    }

  } catch (err) {
    console.error("[SW-SYNC] ⚠️ Falha ao processar o envio de fundo:", err);
    throw err;
  }
}
```

---

## Arquivo: `src/sw/sw-mensagens.js`

```js
// src/sw/sw-mensagens.js
import { get, set, createStore, del, entries } from "idb-keyval";

// 🔥 Constantes
const DB_NAMES = {
  MENSAGENS_ENVIO_A: "BrowserA_MensagensEnvio_DB",
  MENSAGENS_RECEBIDAS_B: "BrowserB_MensagensRecebidas_DB",
};

const STORE_NAMES = {
  KEYVAL: "keyval",
};

// 🔥 Cria as stores IMEDIATAMENTE (não lazy)
const storeMensagensEnvioA = createStore(DB_NAMES.MENSAGENS_ENVIO_A, STORE_NAMES.KEYVAL);
const storeMensagensRecebidasB = createStore(DB_NAMES.MENSAGENS_RECEBIDAS_B, STORE_NAMES.KEYVAL);

console.log("[SW-MSG] ✅ Stores criadas com sucesso!");

// ============================================================
// PROCESSADOR DE MENSAGENS - BROWSER A (ENVIO)
// ============================================================

async function salvarMensagemEnvio(mensagem) {
  try {
    console.log(`[SW-MSG] 💾 Salvando mensagem ${mensagem.id}...`);
    await set(mensagem.id, mensagem, storeMensagensEnvioA);
    console.log(`[SW-MSG] ✅ Mensagem ${mensagem.id} salva no IndexedDB`);
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao salvar mensagem ${mensagem.id}:`, err);
    throw err;
  }
}

async function buscarMensagemEnvio(id) {
  try {
    return await get(id, storeMensagensEnvioA);
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao buscar mensagem ${id}:`, err);
    return null;
  }
}

async function listarMensagensEnvioPorStatus(status) {
  try {
    const todas = await listarMensagensEnvio();
    return todas.filter(m => m.status === status);
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao listar mensagens por status:", err);
    return [];
  }
}

async function listarMensagensEnvio() {
  try {
    const entriesList = await entries(storeMensagensEnvioA);
    return entriesList.map(([_, msg]) => msg);
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao listar mensagens:", err);
    return [];
  }
}

async function atualizarStatusMensagemEnvio(id, status, erro) {
  try {
    const mensagem = await buscarMensagemEnvio(id);
    if (mensagem) {
      mensagem.status = status;
      mensagem.atualizadoEm = Date.now();
      if (erro) mensagem.erro = erro;
      await salvarMensagemEnvio(mensagem);
      console.log(`[SW-MSG] ✅ Mensagem ${id} atualizada para status: ${status}`);
    }
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao atualizar mensagem ${id}:`, err);
  }
}

async function removerMensagemEnvio(id) {
  try {
    await del(id, storeMensagensEnvioA);
    console.log(`[SW-MSG] ✅ Mensagem ${id} removida`);
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao remover mensagem ${id}:`, err);
  }
}

// 🔥 ENVIA UMA MENSAGEM PARA O SERVIDOR
async function enviarMensagemParaServidor(mensagem) {
  try {
    console.log(`[SW-MSG] 📤 Enviando mensagem ${mensagem.id} para o servidor...`);
    
    const response = await fetch("/api/proxy-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...mensagem.bundle,
        payloadText: mensagem.payloadText
      })
    });

    if (response.ok) {
      console.log(`[SW-MSG] ✅ Mensagem ${mensagem.id} enviada com sucesso!`);
      await atualizarStatusMensagemEnvio(mensagem.id, 'enviada');
      return true;
    } else {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao enviar mensagem ${mensagem.id}:`, err);
    
    // Incrementa tentativas
    mensagem.tentativas++;
    mensagem.erro = err.message;
    
    if (mensagem.tentativas >= mensagem.maxTentativas) {
      console.log(`[SW-MSG] ⛔ Mensagem ${mensagem.id} excedeu tentativas máximas.`);
      await atualizarStatusMensagemEnvio(mensagem.id, 'falha', err.message);
    } else {
      await salvarMensagemEnvio(mensagem);
    }
    
    return false;
  }
}

// 🔥 PROCESSADOR DE FILA DE ENVIO
async function processarFilaEnvio() {
  console.log("[SW-MSG] 🔄 Processando fila de envio...");
  
  try {
    const pendentes = await listarMensagensEnvioPorStatus('pendente');
    const enviando = await listarMensagensEnvioPorStatus('enviando');
    
    // Recupera mensagens que ficaram presas em 'enviando'
    const todasEnviando = enviando.filter(m => {
      return (Date.now() - m.atualizadoEm) > 30000;
    });
    
    const paraProcessar = [...pendentes, ...todasEnviando];
    
    if (paraProcessar.length === 0) {
      console.log("[SW-MSG] ℹ️ Nenhuma mensagem pendente para enviar.");
      return;
    }
    
    console.log(`[SW-MSG] 📦 ${paraProcessar.length} mensagens para processar`);
    
    for (const msg of paraProcessar) {
      await atualizarStatusMensagemEnvio(msg.id, 'enviando');
      await enviarMensagemParaServidor(msg);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao processar fila de envio:", err);
  }
}

// ============================================================
// PROCESSADOR DE MENSAGENS - BROWSER B (RECEBIDAS)
// ============================================================

async function salvarMensagemRecebida(mensagem) {
  try {
    await set(mensagem.id, mensagem, storeMensagensRecebidasB);
    console.log(`[SW-MSG] ✅ Mensagem ${mensagem.id} salva no IndexedDB`);
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao salvar mensagem ${mensagem.id}:`, err);
  }
}

async function listarMensagensRecebidasPorStatus(status) {
  try {
    const todas = await listarMensagensRecebidas();
    return todas.filter(m => m.status === status);
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao listar mensagens recebidas:", err);
    return [];
  }
}

async function listarMensagensRecebidas() {
  try {
    const entriesList = await entries(storeMensagensRecebidasB);
    return entriesList.map(([_, msg]) => msg);
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao listar mensagens recebidas:", err);
    return [];
  }
}

async function atualizarStatusMensagemRecebida(id, status) {
  try {
    const mensagem = await get(id, storeMensagensRecebidasB);
    if (mensagem) {
      mensagem.status = status;
      if (status === 'lida') mensagem.lidaEm = Date.now();
      if (status === 'notificada') mensagem.notificadaEm = Date.now();
      await set(id, mensagem, storeMensagensRecebidasB);
      console.log(`[SW-MSG] ✅ Mensagem ${id} atualizada para status: ${status}`);
    }
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao atualizar mensagem ${id}:`, err);
  }
}

// 🔥 PROCESSADOR DE FILA DE NOTIFICAÇÃO
async function processarFilaNotificacao() {
  console.log("[SW-MSG] 🔔 Processando fila de notificações...");
  
  try {
    const naoLidas = await listarMensagensRecebidasPorStatus('nao_lida');
    
    if (naoLidas.length === 0) {
      console.log("[SW-MSG] ℹ️ Nenhuma mensagem não lida.");
      return;
    }
    
    console.log(`[SW-MSG] 📦 ${naoLidas.length} mensagens para notificar`);
    
    for (const msg of naoLidas) {
      try {
        console.log(`[SW-MSG] 🔔 Notificando mensagem ${msg.id}...`);
        
        await self.registration.showNotification(`📥 De: ${msg.remetente}`, {
          body: msg.conteudo,
          icon: '/icon.png',
          badge: '/icon.png',
          vibrate: [200, 100, 200],
          data: msg.dadosJwt,
          tag: msg.id,
          requireInteraction: true
        });
        
        await atualizarStatusMensagemRecebida(msg.id, 'notificada');
        console.log(`[SW-MSG] ✅ Mensagem ${msg.id} notificada com sucesso!`);
        
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (err) {
        console.error(`[SW-MSG] ❌ Erro ao notificar mensagem ${msg.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao processar fila de notificações:", err);
  }
}

// ============================================================
// LISTENERS DE EVENTOS
// ============================================================

// 🔥 OUVE MENSAGENS DA PÁGINA (Browser A/B)
self.addEventListener('message', async (event) => {
  const data = event.data;
  
  if (data.type === 'ENVIAR_MENSAGEM') {
    console.log(`[SW-MSG] 📩 Recebida mensagem da página para enviar: ${data.payload.id}`);
    try {
      await salvarMensagemEnvio(data.payload);
      
      // Tenta enviar imediatamente
      await processarFilaEnvio();
      
      // Responde para a página
      if (event.source) {
        event.source.postMessage({
          type: 'MENSAGEM_ENVIADA',
          id: data.payload.id,
          status: 'pendente'
        });
      }
    } catch (err) {
      console.error("[SW-MSG] ❌ Erro ao processar mensagem:", err);
      if (event.source) {
        event.source.postMessage({
          type: 'MENSAGEM_ERRO',
          id: data.payload.id,
          error: err.message
        });
      }
    }
  }
  
  if (data.type === 'LISTAR_MENSAGENS_PENDENTES') {
    try {
      const mensagens = await listarMensagensEnvioPorStatus('pendente');
      if (event.source) {
        event.source.postMessage({
          type: 'LISTA_MENSAGENS',
          mensagens: mensagens
        });
      }
    } catch (err) {
      console.error("[SW-MSG] ❌ Erro ao listar mensagens:", err);
    }
  }
});

// 🔥 SINC - Disparado quando o navegador está online
self.addEventListener('sync', async function(event) {
  console.log(`[SW-MSG] 🔄 Sync disparado: ${event.tag}`);
  
  if (event.tag === 'sync-envio-mensagens') {
    event.waitUntil(processarFilaEnvio());
  }
  
  if (event.tag === 'sync-notificar-mensagens') {
    event.waitUntil(processarFilaNotificacao());
  }
});

// 🔥 PERIODIC SYNC (se disponível)
self.addEventListener('periodicsync', async function(event) {
  console.log(`[SW-MSG] ⏰ Periodic sync: ${event.tag}`);
  
  if (event.tag === 'periodic-sync-mensagens') {
    await processarFilaEnvio();
    await processarFilaNotificacao();
  }
});

// 🔥 ONLINE/OFFLINE - Processa filas quando volta online
self.addEventListener('online', async function() {
  console.log("[SW-MSG] 🌐 Conexão restaurada, processando filas...");
  await processarFilaEnvio();
  await processarFilaNotificacao();
});

// 🔥 EXPORTA FUNÇÕES PARA O SERVICE WORKER PRINCIPAL
self.processarFilaEnvio = processarFilaEnvio;
self.processarFilaNotificacao = processarFilaNotificacao;

console.log("[SW-MSG] 📦 Módulo de mensagens carregado com sucesso!");
```

---

## Arquivo: `src/sw/click.js`

```js
// src/sw/click.js

self.addEventListener('notificationclick', function(event) {
  console.log("[SW-CLICK] 🔗 ===== CLIQUE NA NOTIFICAÇÃO DETECTADO =====");
  event.notification.close();
  const urlParaAbrir = new URL('/', self.location.origin).href;
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(windowClients) {
        // Tenta focar uma janela existente
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (client.url === urlParaAbrir && 'focus' in client) {
            try {
              return client.focus();
            } catch (err) {
              console.warn("[SW-CLICK] ⚠️ Não foi possível focar a janela:", err.message);
              // Se falhar, continua para abrir uma nova
              break;
            }
          }
        }
        // Se não encontrou ou não conseguiu focar, abre uma nova
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlParaAbrir)
            .catch(function(err) {
              console.warn("[SW-CLICK] ⚠️ Não foi possível abrir janela:", err.message);
              // Se falhar, tenta abrir com target _blank? Não há suporte direto, mas podemos ignorar.
              // Retornamos uma promessa resolvida para não travar o SW.
              return Promise.resolve();
            });
        }
      })
  );
});
```

---

## Arquivo: `src/sw/push.js`

```js
// src/sw/push.js
import { get, set, createStore } from "idb-keyval";
import { gunzipSync } from "fflate";

// ============================================================
// CONFIGURAÇÃO
// ============================================================
const DEBUG = false;

// ============================================================
// CONSTANTES
// ============================================================
const DB_NAMES = {
  CHAVES_E2E_B: "BrowserB_E2E_Chaves_DB",
  MENSAGENS_RECEBIDAS_B: "BrowserB_MensagensRecebidas_DB",
  CONTATOS: "BrowserB_Contatos_DB",
};

const STORE_NAMES = { KEYVAL: "keyval" };
const KEY_NAMES = { CHAVES_E2E_B: "chaves_e2e_b" };

// ============================================================
// STORES
// ============================================================
function criarStore(nome) {
  try {
    return createStore(nome, STORE_NAMES.KEYVAL);
  } catch (err) {
    console.error(`[SW-PUSH] ❌ Erro ao criar store ${nome}:`, err);
    return null;
  }
}

let storeChavesE2E = criarStore(DB_NAMES.CHAVES_E2E_B);
let storeMensagensRecebidasB = criarStore(DB_NAMES.MENSAGENS_RECEBIDAS_B);
let storeContatos = criarStore(DB_NAMES.CONTATOS);

function garantirStores() {
  if (!storeChavesE2E) storeChavesE2E = criarStore(DB_NAMES.CHAVES_E2E_B);
  if (!storeMensagensRecebidasB) storeMensagensRecebidasB = criarStore(DB_NAMES.MENSAGENS_RECEBIDAS_B);
  if (!storeContatos) storeContatos = criarStore(DB_NAMES.CONTATOS);
}

// ============================================================
// UTILITÁRIOS
// ============================================================
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function sha256(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function serializarPublicKeyVapid(jwk) {
  const raw = `${jwk.kty?.toLowerCase() || ''}|${jwk.crv?.toLowerCase() || ''}|${jwk.x?.toLowerCase() || ''}|${jwk.y?.toLowerCase() || ''}`;
  return await sha256(raw);
}

// ============================================================
// FUNÇÕES DE BANCO
// ============================================================
async function buscarChaveDecript() {
  try {
    garantirStores();
    const chavesE2E = await get(KEY_NAMES.CHAVES_E2E_B, storeChavesE2E);
    if (chavesE2E && chavesE2E.privateDecrypt) {
      console.log("[SW-PUSH] 🔑 Chave de decodificação RSA encontrada");
      return chavesE2E.privateDecrypt;
    }
    return null;
  } catch (err) {
    console.error("[SW-PUSH] ❌ Erro ao buscar chave de decodificação:", err);
    return null;
  }
}

async function salvarContato(contato) {
  try {
    garantirStores();
    const key = await serializarPublicKeyVapid(contato.publicKeyVapid);
    await set(key, contato, storeContatos);
    console.log(`[SW-PUSH] ✅ Contato ${contato.email} salvo com chave hash: ${key.substring(0, 8)}...`);
  } catch (err) {
    console.error(`[SW-PUSH] ❌ Erro ao salvar contato:`, err);
  }
}

async function buscarContatoPorPublicKey(publicKeyVapid) {
  try {
    garantirStores();
    const key = await serializarPublicKeyVapid(publicKeyVapid);
    return await get(key, storeContatos);
  } catch (err) {
    console.error("[SW-PUSH] ❌ Erro ao buscar contato:", err);
    return null;
  }
}

async function salvarMensagemRecebida(mensagem) {
  try {
    garantirStores();
    await set(mensagem.id, mensagem, storeMensagensRecebidasB);
    console.log(`[SW-PUSH] ✅ Mensagem ${mensagem.id} salva.`);
  } catch (err) {
    console.error(`[SW-PUSH] ❌ Erro ao salvar mensagem ${mensagem.id}:`, err);
  }
}

// ============================================================
// EVENTO PUSH
// ============================================================
self.addEventListener('push', function(event) {
  if (!event.data) return;
  const rawText = event.data.text();
  console.log("[SW-PUSH] 📩 Push recebido, tamanho:", rawText.length);

  if (rawText.split('.').length !== 3) {
    event.waitUntil(
      self.registration.showNotification("Notificação", { body: rawText })
    );
    return;
  }

  event.waitUntil(async function() {
    try {
      const parts = rawText.split('.');
      const headerB64Url = parts[0];
      const payloadB64Url = parts[1];
      const signatureB64Url = parts[2];
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      const base64UrlDecode = (str) => {
        let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) base64 += '=';
        return decoder.decode(new Uint8Array([...atob(base64)].map(c => c.charCodeAt(0))));
      };

      const jwtPayload = JSON.parse(base64UrlDecode(payloadB64Url));
      const emailRemetente = jwtPayload.iss || "remetente@desconhecido";
      // 🔥 Extrai nome: prioriza 'nm', depois 'name', fallback
      const nomeRemetente = jwtPayload.nm || jwtPayload.name || emailRemetente.split('@')[0] || "Remetente";

      console.log(`[SW-PUSH] 🔐 Mensagem de ${nomeRemetente} <${emailRemetente}>`);

      // ============================================================
      // EXTRAI CHAVE PÚBLICA VAPID (campo 'p' ou 'publicKey')
      // ============================================================
      let publicKeyVapid = jwtPayload.p || jwtPayload.publicKey || null;
      console.log(`[SW-PUSH] Chave pública VAPID: ${publicKeyVapid ? 'encontrada' : 'não encontrada'}`);

      // Tenta buscar contato existente
      let contato = null;
      if (publicKeyVapid) {
        contato = await buscarContatoPorPublicKey(publicKeyVapid);
        if (contato) {
          console.log(`[SW-PUSH] Contato existente encontrado: ${contato.email}`);
        }
      }

      // ============================================================
      // VERIFICA ASSINATURA
      // ============================================================
      let assinaturaValida = false;
      let homologado = contato ? contato.homologado : false;

      try {
        if (publicKeyVapid) {
          const keyVerify = await crypto.subtle.importKey(
            "jwk", publicKeyVapid,
            { name: "ECDSA", namedCurve: "P-256" },
            true, ["verify"]
          );

          let b64Sig = signatureB64Url.replace(/-/g, '+').replace(/_/g, '/');
          while (b64Sig.length % 4) b64Sig += '=';
          const signatureBytes = new Uint8Array([...atob(b64Sig)].map(c => c.charCodeAt(0)));
          const tokenStringWithoutSignature = `${headerB64Url}.${payloadB64Url}`;

          assinaturaValida = await crypto.subtle.verify(
            { name: "ECDSA", hash: "SHA-256" },
            keyVerify,
            signatureBytes,
            encoder.encode(tokenStringWithoutSignature)
          );
        } else {
          console.warn("[SW-PUSH] ⚠️ Chave pública VAPID não encontrada.");
        }
      } catch (err) {
        console.error("[SW-PUSH] ❌ Erro na verificação:", err);
      }

      if (!assinaturaValida) {
        await self.registration.showNotification("⚠️ Assinatura inválida", {
          body: `Mensagem de ${nomeRemetente} rejeitada.`,
          icon: '/icon.png'
        });
        return;
      }

      console.log("[SW-PUSH] 🛡️ Assinatura validada com sucesso!");

      // ============================================================
      // DESCRIPTOGRAFA ENVELOPE
      // ============================================================
      const privateDecryptKey = await buscarChaveDecript();
      if (!privateDecryptKey) {
        throw new Error("Chave privada RSA de decodificação não encontrada.");
      }

      const envelopeJson = jwtPayload.ct || jwtPayload.cipherText;
      if (!envelopeJson) throw new Error("Envelope não encontrado.");

      const envelope = JSON.parse(envelopeJson);
      const iv = envelope.i || envelope.iv;
      const dados = envelope.d || envelope.dadosCifrados;
      const chaveAesCifrada = envelope.k || envelope.chaveAesCifrada;
      if (!iv || !dados || !chaveAesCifrada) throw new Error("Envelope incompleto.");

      const ivBytes = new Uint8Array(base64ToArrayBuffer(iv));
      const dadosBytes = new Uint8Array(base64ToArrayBuffer(dados));
      const chaveAesCifradaBytes = new Uint8Array(base64ToArrayBuffer(chaveAesCifrada));

      const aesChaveCruaBuffer = await crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        privateDecryptKey,
        chaveAesCifradaBytes
      );
      const chaveSimetricaAes = await crypto.subtle.importKey(
        "raw",
        aesChaveCruaBuffer,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
      );
      const textoDecifradoBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ivBytes },
        chaveSimetricaAes,
        dadosBytes
      );
      const decompressed = gunzipSync(new Uint8Array(textoDecifradoBuffer));
      const textoDecifrado = new TextDecoder().decode(decompressed);

      // ============================================================
      // PARSE DO OBJETO DE MENSAGEM
      // ============================================================
      let mensagemObj = JSON.parse(textoDecifrado);
      const conteudo = mensagemObj.m?.c || textoDecifrado;

      // Extrai dados do emissor (subscription, chaves)
      const e = mensagemObj.e || {};
      const subscription = e.s ? {
        endpoint: e.s.e || e.s.endpoint,
        keys: e.s.k || e.s.keys
      } : null;
      const publicKeyRSA = e.p || null;
      const vapidPrivateKey = (e.v && e.v.k) ? e.v.k : null;

      // ============================================================
      // SALVA CONTATO (se novo ou atualizado) – com nome do JWT
      // ============================================================
      if (publicKeyVapid && publicKeyRSA && subscription) {
  let contatoExistente = await buscarContatoPorPublicKey(publicKeyVapid);
  const novoContato = {
    publicKeyVapid: publicKeyVapid,
    email: emailRemetente,
    nome: contatoExistente?.nome || nomeRemetente, // Mantém nome existente se já tiver
    publicKeyRSA: publicKeyRSA,
    subscription: subscription,
    vapidPrivateKey: vapidPrivateKey || '',
    homologado: contatoExistente ? contatoExistente.homologado : false,
    createdAt: contatoExistente ? contatoExistente.createdAt : Date.now(),
    updatedAt: Date.now()
  };
  await salvarContato(novoContato);
  contato = novoContato;
} else {
        console.warn("[SW-PUSH] ⚠️ Dados insuficientes para salvar contato. publicKeyVapid:", !!publicKeyVapid, "publicKeyRSA:", !!publicKeyRSA, "subscription:", !!subscription);
      }

      // ============================================================
      // SALVA MENSAGEM RECEBIDA – usa hash como chave do contato
      // ============================================================
      const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const contatoKey = publicKeyVapid ? await serializarPublicKeyVapid(publicKeyVapid) : '';
      const mensagemRecebida = {
        id: msgId,
        contatoPublicKeyVapid: contatoKey,
        conteudo: conteudo,
        status: 'nao_lida',
        recebidoEm: Date.now()
      };
      if (DEBUG) {
        mensagemRecebida.dadosJwt = jwtPayload;
      }
      await salvarMensagemRecebida(mensagemRecebida);

      // ============================================================
      // NOTIFICAÇÃO
      // ============================================================
      const podeResponder = !!(contato && contato.subscription && contato.publicKeyRSA && contato.vapidPrivateKey);
      const statusEmoji = homologado ? '✅' : '🔄';
      const statusTexto = homologado ? 'Homologado' : 'Não homologado';

      await self.registration.showNotification(`📥 Nova mensagem`, {
        body: `${conteudo}\n\n${statusEmoji} De: ${nomeRemetente} - ${statusTexto}`,
        icon: '/icon.png',
        data: {
          mensagemId: msgId,
          publicKeyVapid: publicKeyVapid,
          homologado: homologado,
          podeResponder: podeResponder,
          acao: homologado ? 'ver_mensagem' : 'homologar_emissor'
        },
        tag: msgId,
        requireInteraction: !homologado,
        vibrate: [200, 100, 200]
      });

      // Notifica clientes abertos
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach(client => {
        client.postMessage({
          type: "PUSH_RECEIVED",
          payload: {
            id: msgId,
            body: conteudo,
            remetente: nomeRemetente,
            homologado: homologado,
            podeResponder: podeResponder,
            status: 'nao_lida'
          }
        });
      });

    } catch (err) {
      console.error("[SW-PUSH] ❌ Erro:", err);
      await self.registration.showNotification("⚠️ Erro ao processar mensagem", {
        body: err.message || "Falha na decriptografia.",
        icon: '/icon.png'
      });
    }
  }());
});


console.log("[SW-PUSH] 📦 Módulo push carregado (com contatos via hash, DEBUG=" + DEBUG + ")");
```

---

## Arquivo: `src/constants/db.ts`

```ts
// src/constants/db.ts
export const DB_NAMES = {
  IDENTIDADE_A: "BrowserA_Identidade_DB",
  BUNDLES_A: "BrowserA_Bundles_DB",
  MENSAGENS_ENVIO_A: "BrowserA_MensagensEnvio_DB",

  CHAVES_E2E_B: "BrowserB_E2E_Chaves_DB",
  CHAVES_VAPID_B: "BrowserB_Vapid_DB",
  SUBSCRIPTION_B: "BrowserB_Subscription_DB",
  MENSAGENS_RECEBIDAS_B: "BrowserB_MensagensRecebidas_DB",
  CONTATOS: "BrowserB_Contatos_DB", // Chave primária: SHA-256 da chave pública VAPID
} as const;

export const STORE_NAMES = {
  KEYVAL: "keyval",
} as const;

export const KEY_NAMES = {
  IDENTIDADE_A: "identidade_a",
  PUBLIC_KEY_A: "public_key_a",
  BUNDLE_ATIVO: "bundle_ativo",
  BUNDLE_HISTORICO: "bundle_historico",
  MENSAGENS_ENVIO: "mensagens_envio",
  CHAVES_E2E_B: "chaves_e2e_b",
  PUBLIC_ENCRYPT_B: "public_encrypt_b",
  CHAVES_VAPID_B: "chaves_vapid_b",
  SUBSCRIPTION_B: "subscription_b",
  SUBSCRIPTION_ENDPOINT_B: "subscription_endpoint_b",
  MENSAGENS_RECEBIDAS: "mensagens_recebidas",
  CONTATO: "contato_",
} as const;

// ============================================================
// INTERFACES
// ============================================================

export interface IdentidadeA {
  name: string;
  email: string;
  privateKey: CryptoKey; // chave privada VAPID (ECDSA)
}

export interface BundleData {
  id: string;
  nomeReceptor: string;
  emailReceptor: string;
  bundle: any;
  createdAt: number;
  updatedAt: number;
}

export interface ChavesE2EB {
  privateDecrypt: CryptoKey;
  publicEncrypt: JsonWebKey;
}

export interface ChavesVapidB {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}

export interface SubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  vapidPublicKey?: JsonWebKey;
  createdAt: number;
  updatedAt: number;
}

export interface MensagemEnvio {
  id: string;
  bundle: any;
  payloadText: string;
  mensagemOriginal: string;
  destinatario: string;
  status: 'pendente' | 'enviando' | 'enviada' | 'falha';
  tentativas: number;
  maxTentativas: number;
  criadoEm: number;
  atualizadoEm: number;
  erro?: string;
}

export interface MensagemRecebida {
  id: string;
  contatoPublicKeyVapid: string; // chave do contato (serializada)
  conteudo: string;
  status: 'nao_lida' | 'lida' | 'notificada';
  recebidoEm: number;
  lidaEm?: number;
  notificadaEm?: number;
}

export interface Contato {
  publicKeyVapid: JsonWebKey;
  email: string;
  nome: string;
  publicKeyRSA: JsonWebKey;
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  vapidPrivateKey: string; // cifrada
  homologado: boolean;
  createdAt: number;
  updatedAt: number;
}
```

---

## Arquivo: `src/utils/db-helpers.ts`

```ts
// src/utils/db-helpers.ts
import { get, set, createStore, del, entries } from "idb-keyval";
import { STORE_NAMES, KEY_NAMES, IdentidadeA, ChavesE2EB, ChavesVapidB, SubscriptionData, BundleData, MensagemEnvio } from "../constants/db.ts";
import { DB_NAMES, Contato, MensagemRecebida } from "../constants/db.ts";

// ============================================================
// Criação de Stores
// ============================================================

export function criarStore(nome: string) {
  return createStore(nome, STORE_NAMES.KEYVAL);
}

export const storeIdentidadeA = criarStore(DB_NAMES.IDENTIDADE_A);
export const storeBundlesA = criarStore(DB_NAMES.BUNDLES_A);
export const storeMensagensEnvioA = criarStore(DB_NAMES.MENSAGENS_ENVIO_A);
export const storeChavesE2E = criarStore(DB_NAMES.CHAVES_E2E_B);
export const storeChavesVapid = criarStore(DB_NAMES.CHAVES_VAPID_B);
export const storeSubscription = criarStore(DB_NAMES.SUBSCRIPTION_B);
export const storeMensagensRecebidasB = criarStore(DB_NAMES.MENSAGENS_RECEBIDAS_B);
export const storeContatos = criarStore(DB_NAMES.CONTATOS);

// ============================================================
// Funções Genéricas
// ============================================================

export async function salvarChave<T>(store: IDBStore, key: string, value: T): Promise<void> {
  return set(key, value, store);
}

export async function buscarChave<T>(store: IDBStore, key: string): Promise<T | undefined> {
  return get(key, store);
}

export async function removerChave(store: IDBStore, key: string): Promise<void> {
  return del(key, store);
}

export async function listarChaves<T>(store: IDBStore): Promise<[string, T][]> {
  return entries(store) as Promise<[string, T][]>;
}

// ============================================================
// Identidade A
// ============================================================

export async function salvarIdentidadeA(identidade: IdentidadeA): Promise<void> {
  await salvarChave(storeIdentidadeA, KEY_NAMES.IDENTIDADE_A, identidade);
}

export async function buscarIdentidadeA(): Promise<IdentidadeA | undefined> {
  return buscarChave<IdentidadeA>(storeIdentidadeA, KEY_NAMES.IDENTIDADE_A);
}

export async function salvarPublicKeyA(publicKeyJwk: JsonWebKey): Promise<void> {
  await salvarChave(storeIdentidadeA, KEY_NAMES.PUBLIC_KEY_A, publicKeyJwk);
}

export async function buscarPublicKeyA(): Promise<JsonWebKey | undefined> {
  return buscarChave<JsonWebKey>(storeIdentidadeA, KEY_NAMES.PUBLIC_KEY_A);
}

// ============================================================
// Bundles
// ============================================================

export async function salvarBundleAtivo(bundle: any): Promise<void> {
  const bundleData: BundleData = {
    id: `bundle_${Date.now()}`,
    nomeReceptor: bundle.e2e?.ownerName || "Desconhecido",
    emailReceptor: bundle.e2e?.ownerEmail || "Desconhecido",
    bundle: bundle,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarChave(storeBundlesA, KEY_NAMES.BUNDLE_ATIVO, bundleData);
}

export async function buscarBundleAtivo(): Promise<BundleData | undefined> {
  return buscarChave<BundleData>(storeBundlesA, KEY_NAMES.BUNDLE_ATIVO);
}

export async function salvarBundleHistorico(bundle: any): Promise<void> {
  const bundleData: BundleData = {
    id: `bundle_${Date.now()}`,
    nomeReceptor: bundle.e2e?.ownerName || "Desconhecido",
    emailReceptor: bundle.e2e?.ownerEmail || "Desconhecido",
    bundle: bundle,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  const historico = await buscarChave<BundleData[]>(storeBundlesA, KEY_NAMES.BUNDLE_HISTORICO) || [];
  historico.push(bundleData);
  if (historico.length > 10) historico.shift();
  await salvarChave(storeBundlesA, KEY_NAMES.BUNDLE_HISTORICO, historico);
}

export async function buscarHistoricoBundles(): Promise<BundleData[]> {
  return await buscarChave<BundleData[]>(storeBundlesA, KEY_NAMES.BUNDLE_HISTORICO) || [];
}

export async function limparBundleAtivo(): Promise<void> {
  await removerChave(storeBundlesA, KEY_NAMES.BUNDLE_ATIVO);
}

// ============================================================
// Mensagens de Envio
// ============================================================

export async function salvarMensagemEnvio(mensagem: MensagemEnvio): Promise<void> {
  await salvarChave(storeMensagensEnvioA, mensagem.id, mensagem);
}

export async function buscarMensagemEnvio(id: string): Promise<MensagemEnvio | undefined> {
  return buscarChave<MensagemEnvio>(storeMensagensEnvioA, id);
}

export async function listarMensagensEnvio(): Promise<MensagemEnvio[]> {
  const entries = await listarChaves<MensagemEnvio>(storeMensagensEnvioA);
  return entries.map(([_, msg]) => msg);
}

export async function atualizarStatusMensagemEnvio(id: string, status: MensagemEnvio['status'], erro?: string): Promise<void> {
  const mensagem = await buscarMensagemEnvio(id);
  if (mensagem) {
    mensagem.status = status;
    mensagem.atualizadoEm = Date.now();
    if (erro) mensagem.erro = erro;
    await salvarMensagemEnvio(mensagem);
  }
}

export async function removerMensagemEnvio(id: string): Promise<void> {
  await removerChave(storeMensagensEnvioA, id);
}

// ============================================================
// E2E
// ============================================================

export async function salvarChavesE2EB(chaves: ChavesE2EB): Promise<void> {
  await salvarChave(storeChavesE2E, KEY_NAMES.CHAVES_E2E_B, chaves);
}

export async function buscarChavesE2EB(): Promise<ChavesE2EB | undefined> {
  return buscarChave<ChavesE2EB>(storeChavesE2E, KEY_NAMES.CHAVES_E2E_B);
}

export async function salvarPublicEncryptB(publicKey: JsonWebKey): Promise<void> {
  await salvarChave(storeChavesE2E, KEY_NAMES.PUBLIC_ENCRYPT_B, publicKey);
}

export async function buscarPublicEncryptB(): Promise<JsonWebKey | undefined> {
  return buscarChave<JsonWebKey>(storeChavesE2E, KEY_NAMES.PUBLIC_ENCRYPT_B);
}

// ============================================================
// VAPID
// ============================================================

export async function salvarChavesVapidB(chaves: ChavesVapidB): Promise<void> {
  await salvarChave(storeChavesVapid, KEY_NAMES.CHAVES_VAPID_B, chaves);
}

export async function buscarChavesVapidB(): Promise<ChavesVapidB | undefined> {
  return buscarChave<ChavesVapidB>(storeChavesVapid, KEY_NAMES.CHAVES_VAPID_B);
}

// ============================================================
// Subscription
// ============================================================

export async function salvarSubscriptionB(subscription: SubscriptionData): Promise<void> {
  await salvarChave(storeSubscription, KEY_NAMES.SUBSCRIPTION_B, subscription);
}

export async function buscarSubscriptionB(): Promise<SubscriptionData | undefined> {
  return buscarChave<SubscriptionData>(storeSubscription, KEY_NAMES.SUBSCRIPTION_B);
}

export async function removerSubscriptionB(): Promise<void> {
  await removerChave(storeSubscription, KEY_NAMES.SUBSCRIPTION_B);
}

// ============================================================
// Mensagens Recebidas
// ============================================================

export async function salvarMensagemRecebida(mensagem: MensagemRecebida): Promise<void> {
  await salvarChave(storeMensagensRecebidasB, mensagem.id, mensagem);
}

export async function buscarMensagemRecebida(id: string): Promise<MensagemRecebida | undefined> {
  return buscarChave<MensagemRecebida>(storeMensagensRecebidasB, id);
}

export async function listarMensagensRecebidas(): Promise<MensagemRecebida[]> {
  const entries = await listarChaves<MensagemRecebida>(storeMensagensRecebidasB);
  return entries.map(([_, msg]) => msg);
}

export async function atualizarStatusMensagemRecebida(id: string, status: MensagemRecebida['status']): Promise<void> {
  const mensagem = await buscarMensagemRecebida(id);
  if (mensagem) {
    mensagem.status = status;
    if (status === 'lida') mensagem.lidaEm = Date.now();
    if (status === 'notificada') mensagem.notificadaEm = Date.now();
    await salvarMensagemRecebida(mensagem);
  }
}

export async function removerMensagemRecebida(id: string): Promise<void> {
  await removerChave(storeMensagensRecebidasB, id);
}

// ============================================================
// Contatos (com hash) – funções melhoradas
// ============================================================

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Serializa uma chave pública VAPID para um hash estável (SHA-256).
 * Ignora diferenças de capitalização, espaços, etc.
 */
export async function serializarPublicKeyVapid(jwk: JsonWebKey): Promise<string> {
  const raw = `${jwk.kty?.toLowerCase() || ''}|${jwk.crv?.toLowerCase() || ''}|${jwk.x?.toLowerCase() || ''}|${jwk.y?.toLowerCase() || ''}`;
  return await sha256(raw);
}

/**
 * Normaliza uma entrada (hash ou JWK) para a chave hash usada na store de contatos.
 * Se for string, assume que já é hash; se for objeto, serializa.
 */
export async function normalizarChaveContato(input: string | JsonWebKey): Promise<string> {
  if (typeof input === 'string') return input;
  if (typeof input === 'object' && input !== null && 'kty' in input) {
    return await serializarPublicKeyVapid(input);
  }
  throw new Error('Chave de contato inválida: deve ser string (hash) ou JWK.');
}

export async function salvarContato(contato: Contato): Promise<void> {
  const key = await serializarPublicKeyVapid(contato.publicKeyVapid);
  await salvarChave(storeContatos, key, contato);
}

export async function buscarContatoPorPublicKey(publicKeyVapid: JsonWebKey): Promise<Contato | undefined> {
  const key = await serializarPublicKeyVapid(publicKeyVapid);
  return buscarChave<Contato>(storeContatos, key);
}

/**
 * Busca contato por chave (hash) ou JWK.
 * @param chaveOuJwk - string (hash) ou JsonWebKey
 */
export async function buscarContatoPorChave(chaveOuJwk: string | JsonWebKey): Promise<Contato | undefined> {
  const key = await normalizarChaveContato(chaveOuJwk);
  return buscarChave<Contato>(storeContatos, key);
}

export async function listarContatos(): Promise<Contato[]> {
  const entries = await listarChaves<Contato>(storeContatos);
  return entries.map(([_, c]) => c);
}

export async function homologarContato(publicKeyVapid: JsonWebKey): Promise<void> {
  const key = await serializarPublicKeyVapid(publicKeyVapid);
  const contato = await buscarChave<Contato>(storeContatos, key);
  if (contato) {
    contato.homologado = true;
    contato.updatedAt = Date.now();
    await salvarChave(storeContatos, key, contato);
  }
}

export async function removerContato(publicKeyVapid: JsonWebKey): Promise<void> {
  const key = await serializarPublicKeyVapid(publicKeyVapid);
  await removerChave(storeContatos, key);
}
```

---

## Arquivo: `src/index.html`

```html
<!-- src/index.html -->
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>loco</title>
    <link rel="manifest" href="./manifest.json">
<link rel="icon" href="./favicon.ico" sizes="any" />
<link rel="icon" type="image/png" sizes="32x32" href="./favicon-32x32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="./favicon-16x16.png" />
<link rel="apple-touch-icon" sizes="180x180" href="./apple-touch-icon.png" />
<meta name="application-name" content="loco" />
<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
    
  </head>
  <body>
    <h1>📬 Web Push Descentralizado</h1>
    <p style="color: #666; margin-bottom: 20px;">Compartilhe seu perfil e receba mensagens de forma descentralizada.</p>

    <!-- ============================================================ -->
    <!-- MEU PERFIL                                                   -->
    <!-- ============================================================ -->
    <div class="container" style="background: #f0f8f4;">
      <h2>👤 Meu Perfil</h2>
      <div class="row">
        <div class="col">
          <label for="profileNameB">Meu Nome:</label>
          <input type="text" id="profileNameB" value="Alice" />
        </div>
        <div class="col">
          <label for="profileEmailB">Meu E-mail:</label>
          <input type="text" id="profileEmailB" value="alice@example.com" />
        </div>
      </div>
      <button id="btnGerarProfile" style="width: 100%;">📦 Gerar e Compartilhar Meu Perfil</button>
      <button id="btnLimparSubscription" class="btn-sm danger" style="margin-top: 10px;">🗑️ Limpar Subscription</button>
      
      <div class="row mt-10">
        <div class="col">
          <label for="myProfileDisplay">📋 Meu Perfil (copie e cole para quem quiser te enviar mensagens):</label>
          <div id="myProfileDisplay" class="profile-field" style="background: #e8f5e9; border-color: #006c4f;">
            Clique em "Gerar e Compartilhar Meu Perfil" para criar seu perfil.
          </div>
          <button id="btnCopyProfile" class="btn-sm">📋 Copiar Perfil</button>
        </div>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- CONTATOS                                                     -->
    <!-- ============================================================ -->
    <div class="container container-contatos">
      <h2>📇 Contatos</h2>
      <div class="row">
        <div class="col">
          <label for="profileInput">Cole aqui o perfil de outra pessoa para adicionar como contato:</label>
          <textarea id="profileInput" rows="4" placeholder='{"iss":"...","kid":{...},"nm":"...","s":{...},"p":{...},"k":"..."}'></textarea>
          <button id="btnAdicionarContato">➕ Adicionar Contato</button>
        </div>
      </div>
      <div class="mt-10">
        <label>📋 Meus Contatos:</label>
        <div id="listaContatos" style="max-height: 200px; overflow-y: auto; background: white; padding: 10px; border-radius: 4px; border: 1px solid #ddd;">
          <p style="color: #666; font-size: 14px;">Nenhum contato adicionado ainda.</p>
        </div>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- ENVIAR MENSAGENS                                             -->
    <!-- ============================================================ -->
    <div class="container container-emissor">
      <h2>📤 Enviar Mensagem</h2>
      <div class="row">
        <div class="col">
          <label for="contatoSelect">Selecione o contato destino:</label>
          <select id="contatoSelect" class="contato-select">
            <option value="">-- Selecione um contato --</option>
          </select>
        </div>
      </div>
      <label for="mensagemEnvioB">Mensagem:</label>
      <textarea id="mensagemEnvioB" rows="3" placeholder="Escreva sua mensagem aqui..."></textarea>
      <button id="btnEnviarB" class="send-btn">🚀 Enviar Mensagem</button>
    </div>

    <!-- ============================================================ -->
    <!-- MENSAGENS RECEBIDAS                                          -->
    <!-- ============================================================ -->
    <div class="container container-receptor">
      <h2>📬 Mensagens Recebidas</h2>
      <div class="flex mb-10">
        <span></span>
        <div class="flex-end">
          <button id="btnCarregarMensagens" class="btn-sm">🔄 Atualizar</button>
          <button id="btnLimparLidas" class="btn-sm danger">🗑️ Remover Lidas</button>
          <button id="btnHomologarTodas" class="btn-sm homologar-btn">🔄 Homologar Todos</button>
        </div>
      </div>
      <div id="mensagensRecebidas">
        <p style="color: #666;">Nenhuma mensagem recebida ainda.</p>
      </div>
    </div>

    <!-- Ponto de entrada -->
    <script src="./app.tsx" type="module"></script>
  </body>
</html>
```

---

## Arquivo: `src/app.tsx`

```tsx
// src/app.tsx

import "./styles.css";

import {
  storeChavesE2E,
  storeChavesVapid,
  storeSubscription,
  salvarChavesE2EB,
  buscarChavesE2EB,
  salvarPublicEncryptB,
  salvarChavesVapidB,
  buscarChavesVapidB,
  salvarSubscriptionB,
  buscarSubscriptionB,
  removerSubscriptionB,
  salvarBundleAtivo,
  buscarBundleAtivo,
  salvarBundleHistorico,
  salvarMensagemEnvio,
  listarMensagensEnvio,
  removerMensagemEnvio,
  salvarMensagemRecebida,
  listarMensagensRecebidas,
  atualizarStatusMensagemRecebida,
  removerMensagemRecebida,
  salvarIdentidadeA,
  buscarIdentidadeA,
  salvarPublicKeyA,
  buscarPublicKeyA,
  buscarMensagemRecebida,
  // CONTATOS
  storeContatos,
  salvarContato,
  buscarContatoPorPublicKey,
  buscarContatoPorChave,
  listarContatos,
  homologarContato,
  removerContato,
  serializarPublicKeyVapid,
  salvarChave,
  removerChave,
} from "./utils/db-helpers.ts";
import type {
  ChavesE2EB,
  ChavesVapidB,
  SubscriptionData,
  MensagemEnvio,
  MensagemRecebida,
  IdentidadeA,
  Contato,
} from "./constants/db.ts";
import { gzipSync } from "fflate";

console.log("🟢 [SW-LOG] Web Push Descentralizado - Perfis e Contatos");

// ============================================================
// UTILITÁRIOS
// ============================================================
async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast("✅ Copiado para a área de transferência!", "success");
  } catch {
    // Fallback para browsers antigos
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast("✅ Copiado para a área de transferência!", "success");
  }
}


function showToast(msg: string, type: 'success' | 'error' | 'info' = 'info'): void {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(buffer));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function rawBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  return arrayBufferToBase64Url(buffer);
}

// ============================================================
// FUNÇÃO PARA REGISTRAR O SERVICE WORKER
// ============================================================
async function registrarServiceWorker(): Promise<ServiceWorkerRegistration> {
  console.log("📡 Verificando suporte ao Service Worker...");

  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Worker não é suportado neste navegador.");
  }

  // 1. Sempre chamamos o register com cacheBuster. 
  // O navegador é inteligente: se o arquivo for idêntico, ele não reinstala.
  // Se o arquivo mudou no servidor (novo hash do Deno), ele inicia o processo de atualização.
  const cacheBuster = Date.now();
  console.log("⏳ Registrando/Atualizando Service Worker...");

  try {
    const registration = await navigator.serviceWorker.register(
      `./service-worker.js?cacheBuster=${cacheBuster}`,
      { scope: "/" }
    );
    
    console.log("Service Worker registrado. Escopo:", registration.scope);

    // 2. Aguarda a ativação do Worker desta transição atual
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout de 5s: O SW pode estar aguardando abas antigas fecharem (waiting)."));
      }, 5000);

      const limparEInsucesso = (msg: string) => {
        clearTimeout(timeout);
        reject(new Error(msg));
      };

      const limparESucesso = () => {
        clearTimeout(timeout);
        resolve();
      };

      // Cenário A: Já está ativo e não há nenhuma atualização pendente (recarregamento simples)
      if (registration.active && !registration.installing && !registration.waiting) {
        return limparESucesso();
      }

      // Cenário B: Existe uma atualização acontecendo ou aguardando
      // Prioriza o worker que está entrando (installing) ou na fila (waiting)
      const novoWorker = registration.installing || registration.waiting || registration.active;

      if (!novoWorker) {
        return limparEInsucesso("Instância do Service Worker não encontrada.");
      }

      // Se o worker alvo já chegou no estado ativado de forma síncrona
      if (novoWorker.state === "activated") {
        return limparESucesso();
      }

      // Escuta a mudança de estado do worker correto
      novoWorker.addEventListener("statechange", () => {
        if (novoWorker.state === "activated") {
          limparESucesso();
        } else if (novoWorker.state === "redundant") {
          limparEInsucesso("O Service Worker tornou-se redundante (falha na instalação).");
        }
      });
    });

    console.log("✅ Service Worker ativo e pronto.");
    return registration;

  } catch (err) {
    console.error("❌ Erro no ciclo do Service Worker:", err);
    throw new Error(`Falha ao registrar Service Worker: ${(err as Error).message}`);
  }
}


// ============================================================
// CRIPTOGRAFIA DA CHAVE VAPID (para o servidor)
// ============================================================
async function criptografarChaveVapid(privateKeyJwk: JsonWebKey, serverPublicKeyJwk: JsonWebKey): Promise<string> {
  const serverKey = await window.crypto.subtle.importKey(
    "jwk",
    serverPublicKeyJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );
  const aesKey = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"]
  );
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const vapidBytes = encoder.encode(JSON.stringify(privateKeyJwk));
  const vapidCifrado = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    aesKey,
    vapidBytes
  );
  const aesKeyRaw = await window.crypto.subtle.exportKey("raw", aesKey);
  const aesKeyCifrado = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    serverKey,
    aesKeyRaw
  );
  const toHex = (buf: ArrayBuffer) =>
    Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  const envelope = {
    iv: toHex(iv.buffer),
    dadosCifrados: toHex(vapidCifrado),
    chaveAesCifrada: toHex(aesKeyCifrado)
  };
  return btoa(JSON.stringify(envelope));
}

// ============================================================
// GERAÇÃO DE CHAVES E2E (RSA para criptografia)
// ============================================================
async function generateE2EEKeys() {
  console.log("🔑 Gerando chaves E2E (RSA-2048)...");
  const encryptionKeyPair = await window.crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([0x01, 0x00, 0x01]), hash: "SHA-256" },
    false,
    ["encrypt", "decrypt"]
  );
  const publicEncryptJwk = await window.crypto.subtle.exportKey("jwk", encryptionKeyPair.publicKey);
  const chavesE2E: ChavesE2EB = {
    privateDecrypt: encryptionKeyPair.privateKey,
    publicEncrypt: publicEncryptJwk,
  };
  await salvarChavesE2EB(chavesE2E);
  await salvarPublicEncryptB(publicEncryptJwk);
  return { publicEncryptJwk };
}

// ============================================================
// GERAÇÃO DE CHAVES VAPID (ECDSA)
// ============================================================
async function generateVAPIDKeys(): Promise<CryptoKeyPair> {
  console.log("🔑 Gerando chaves VAPID (ECDSA P-256)...");
  return await window.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
}

// ============================================================
// GERAR PERFIL (profile) – substitui o bundle
// ============================================================
async function gerarProfile(): Promise<any> {
  console.log("📦 Gerando perfil...");
  const nome = (document.getElementById('profileNameB') as HTMLInputElement).value;
  const email = (document.getElementById('profileEmailB') as HTMLInputElement).value;

  if (!nome || !email) {
    throw new Error("Preencha Nome e E-mail primeiro.");
  }

  try {
    if (Notification.permission === "denied") {
      throw new Error("Permissão de notificação negada.");
    }
    if (Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Permissão de notificação não concedida.");
      }
    }

    const registration = await registrarServiceWorker();

    const resServerKey = await fetch("/api/server-public-key");
    if (!resServerKey.ok) {
      throw new Error(`Erro ao buscar chave do servidor: ${resServerKey.status}`);
    }
    const serverPublicKeyJwk = await resServerKey.json();

    let chavesVapidSalvas = await buscarChavesVapidB();
    let vapidKeyPair: CryptoKeyPair;
    let publicKeyJwk: JsonWebKey;
    let privateKeyJwk: JsonWebKey;

    if (chavesVapidSalvas) {
      console.log("📂 Chaves VAPID encontradas no IndexedDB");
      publicKeyJwk = chavesVapidSalvas.publicKey;
      privateKeyJwk = chavesVapidSalvas.privateKey;
      try {
        vapidKeyPair = {
          publicKey: await window.crypto.subtle.importKey(
            "jwk", publicKeyJwk,
            { name: "ECDSA", namedCurve: "P-256" },
            true, ["verify"]
          ),
          privateKey: await window.crypto.subtle.importKey(
            "jwk", privateKeyJwk,
            { name: "ECDSA", namedCurve: "P-256" },
            true, ["sign"]
          )
        } as CryptoKeyPair;
      } catch {
        chavesVapidSalvas = undefined;
      }
    }
    if (!chavesVapidSalvas) {
      console.log("🔑 Gerando novas chaves VAPID...");
      vapidKeyPair = await generateVAPIDKeys();
      publicKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.publicKey);
      privateKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.privateKey);
      await salvarChavesVapidB({ publicKey: publicKeyJwk, privateKey: privateKeyJwk });
    }

    let existingSubscription = await registration.pushManager.getSubscription();
    let subscriptionValida = false;

    if (existingSubscription) {
      const subscriptionData = await buscarSubscriptionB();
      if (subscriptionData && subscriptionData.vapidPublicKey?.n === publicKeyJwk.n) {
        subscriptionValida = true;
      } else {
        await existingSubscription.unsubscribe();
        await removerSubscriptionB();
        existingSubscription = null;
      }
    }
    if (!existingSubscription || !subscriptionValida) {
      console.log("📝 Criando nova subscription...");
      const rawPublicKey = await window.crypto.subtle.exportKey("raw", vapidKeyPair.publicKey);
      existingSubscription = await registration.pushManager.subscribe({
        applicationServerKey: new Uint8Array(rawPublicKey),
        userVisibleOnly: true
      });
    }

    const p256dhBuffer = existingSubscription.getKey('p256dh');
    const authBuffer = existingSubscription.getKey('auth');
    if (!p256dhBuffer || !authBuffer) {
      throw new Error("Falha ao obter chaves da subscription (p256dh/auth).");
    }
    const subscriptionJson = {
      endpoint: existingSubscription.endpoint,
      keys: {
        p256dh: rawBufferToBase64Url(p256dhBuffer),
        auth: rawBufferToBase64Url(authBuffer)
      }
    };

    let e2ePublicKeys = await buscarChavesE2EB();
    let publicEncryptJwk: JsonWebKey;
    if (e2ePublicKeys && e2ePublicKeys.publicEncrypt) {
      publicEncryptJwk = e2ePublicKeys.publicEncrypt;
    } else {
      const novasChaves = await generateE2EEKeys();
      publicEncryptJwk = novasChaves.publicEncryptJwk;
    }

    const subscriptionData: SubscriptionData = {
      endpoint: existingSubscription.endpoint,
      keys: subscriptionJson.keys,
      vapidPublicKey: publicKeyJwk,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await salvarSubscriptionB(subscriptionData);

    const privateKeyEncrypted = await criptografarChaveVapid(privateKeyJwk, serverPublicKeyJwk);

    const identidadeExistente = await buscarIdentidadeA();
    if (!identidadeExistente) {
      const privateVapidKey = await window.crypto.subtle.importKey(
        "jwk",
        privateKeyJwk,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"]
      );
      await salvarIdentidadeA({
        name: nome,
        email: email,
        privateKey: privateVapidKey
      });
      const extendedPublic = { ...publicKeyJwk, ownerName: nome, ownerEmail: email };
      await salvarPublicKeyA(extendedPublic);
    }

    const profile = {
      iss: email,
      nm: nome,
      kid: publicKeyJwk,
      s: subscriptionJson,
      p: publicEncryptJwk,
      k: privateKeyEncrypted
    };

    const bundle = {
      subscription: subscriptionJson,
      vapid: {
        subject: `mailto:${email}`,
        publicKey: publicKeyJwk,
        privateKey: privateKeyEncrypted
      },
      isVapidEncrypted: true,
      e2e: {
        ownerName: nome,
        ownerEmail: email,
        browserB_PublicKeyEncrypt: publicEncryptJwk,
      },
      payloadText: ""
    };
    await salvarBundleAtivo(bundle);
    await salvarBundleHistorico(bundle);

    return profile;
  } catch (err) {
    console.error("❌ Erro ao gerar perfil:", err);
    throw err;
  }
}

// ============================================================
// ADICIONAR CONTATO – com validação reforçada
// ============================================================
async function adicionarContato(): Promise<void> {
  const profileRaw = (document.getElementById('profileInput') as HTMLTextAreaElement).value;
  if (!profileRaw) {
    showToast("Cole o perfil da pessoa que deseja adicionar.", "error");
    return;
  }
  try {
    const profile = JSON.parse(profileRaw);
    // Verificação completa dos campos obrigatórios
    const required = ['iss', 'kid', 's', 'p', 'k'];
    for (const field of required) {
      if (!profile[field]) throw new Error(`Campo obrigatório ausente: ${field}`);
    }
    // Verifica se 's' contém endpoint e keys
    if (!profile.s.endpoint || !profile.s.keys || !profile.s.keys.p256dh || !profile.s.keys.auth) {
      throw new Error('Subscription inválida: falta endpoint ou keys.');
    }
    // Tenta importar a chave pública VAPID para validar
    await crypto.subtle.importKey(
      "jwk", profile.kid,
      { name: "ECDSA", namedCurve: "P-256" },
      true, ["verify"]
    );

    const contato: Contato = {
      publicKeyVapid: profile.kid,
      email: profile.iss,
      nome: profile.nm || profile.iss,
      publicKeyRSA: profile.p,
      subscription: profile.s,
      vapidPrivateKey: profile.k,
      homologado: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await salvarContato(contato);
    showToast(`✅ Contato "${contato.nome}" adicionado!`, "success");
    (document.getElementById('profileInput') as HTMLTextAreaElement).value = '';
    await carregarContatos();
    await carregarSelectContatos();
  } catch (err: any) {
    showToast(`❌ Erro ao adicionar contato: ${err.message}`, "error");
  }
}



// ============================================================
// CARREGAR LISTA DE CONTATOS (UI)
// ============================================================
async function carregarContatos(): Promise<void> {
  const container = document.getElementById('listaContatos');
  if (!container) return;
  const contatos = await listarContatos();
  if (contatos.length === 0) {
    container.innerHTML = '<p style="color: #666; font-size: 14px;">Nenhum contato adicionado ainda.</p>';
    return;
  }
  let html = '';
  for (const c of contatos) {
    const homol = c.homologado ? '✅' : '🔄';
    html += `
      <div class="contato-item">
        <span><strong>${c.nome}</strong> &lt;${c.email}&gt; ${homol}</span>
        <button class="btn-remover-contato btn-sm danger" data-publickey='${JSON.stringify(c.publicKeyVapid).replace(/'/g, "&#39;")}' style="font-size: 11px; padding: 2px 8px; background: #cc0000; color: white; border: none; border-radius: 3px; cursor: pointer;">🗑️</button>
      </div>
    `;
  }
  container.innerHTML = html;

  container.querySelectorAll('.btn-remover-contato').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const target = e.currentTarget as HTMLButtonElement;
      const publicKeyStr = target.dataset.publickey || '';
      try {
        const publicKeyVapid = JSON.parse(publicKeyStr);
        if (confirm('Remover este contato?')) {
          await removerContato(publicKeyVapid);
          await carregarContatos();
          await carregarSelectContatos();
          showToast('Contato removido.', 'info');
        }
      } catch (err) {
        showToast('Erro ao remover contato.', 'error');
      }
    });
  });
}

// ============================================================
// CARREGAR SELECT DE CONTATOS
// ============================================================
async function carregarSelectContatos(): Promise<void> {
  const select = document.getElementById('contatoSelect') as HTMLSelectElement;
  if (!select) return;
  const contatos = await listarContatos();
  select.innerHTML = '<option value="">-- Selecione um contato --</option>';
  for (const c of contatos) {
    const key = await serializarPublicKeyVapid(c.publicKeyVapid);
    select.innerHTML += `<option value="${key}">${c.nome} (${c.email})</option>`;
  }
}

// ============================================================
// ENVIAR MENSAGEM PARA UM CONTATO SELECIONADO
// ============================================================
async function enviarMensagemB(): Promise<void> {
  console.log("🚀 Enviando mensagem...");
  const select = document.getElementById('contatoSelect') as HTMLSelectElement;
  const selectedKey = select.value;
  if (!selectedKey) {
    showToast("Selecione um contato para enviar a mensagem.", "error");
    return;
  }
  const conteudo = (document.getElementById('mensagemEnvioB') as HTMLTextAreaElement).value;
  if (!conteudo) {
    showToast("Digite uma mensagem.", "error");
    return;
  }

  try {
    let contato = await buscarContatoPorChave(selectedKey);
    if (!contato) {
      console.warn("Contato não encontrado pela chave exata. Tentando fallback...");
      const todosContatos = await listarContatos();
      for (const c of todosContatos) {
        const hash = await serializarPublicKeyVapid(c.publicKeyVapid);
        if (hash === selectedKey) {
          contato = c;
          break;
        }
      }
      if (!contato) {
        showToast("Contato não encontrado. Tente adicioná-lo novamente.", "error");
        return;
      }
    }

    if (!contato.subscription || !contato.publicKeyRSA || !contato.vapidPrivateKey) {
      showToast("❌ Contato incompleto para enviar mensagem. Peça para a pessoa gerar um novo perfil.", "error");
      return;
    }

    const bundle = {
      subscription: contato.subscription,
      vapid: {
        subject: `mailto:${contato.email}`,
        publicKey: contato.publicKeyVapid,
        privateKey: contato.vapidPrivateKey
      },
      isVapidEncrypted: true,
      e2e: {
        ownerName: contato.nome,
        ownerEmail: contato.email,
        browserB_PublicKeyEncrypt: contato.publicKeyRSA
      },
      payloadText: ""
    };

    const e2eConfig = bundle.e2e;
    const publicKeyJwk = e2eConfig.browserB_PublicKeyEncrypt;
    if (publicKeyJwk.kty !== "RSA") {
      showToast("❌ Chave pública do contato não é RSA.", "error");
      return;
    }

    const cryptoKeyDestino = await window.crypto.subtle.importKey(
      "jwk", publicKeyJwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["encrypt"]
    );

    const subscription = await buscarSubscriptionB();
    const chavesVapid = await buscarChavesVapidB();
    const chavesE2E = await buscarChavesE2EB();
    const publicKeyEncrypt = chavesE2E?.publicEncrypt;
    const publicVapid = chavesVapid?.publicKey;
    if (!publicVapid) throw new Error("Chave pública VAPID não encontrada.");

    let vapidPrivateCifrada: string | undefined;
    let meuBundle = await buscarBundleAtivo();
    if (meuBundle?.vapid?.privateKey) {
      vapidPrivateCifrada = meuBundle.vapid.privateKey;
    } else {
      const chavesVapidSalvas = await buscarChavesVapidB();
      if (chavesVapidSalvas?.privateKey) {
        const resServerKey = await fetch("/api/server-public-key");
        const serverPublicKeyJwk = await resServerKey.json();
        vapidPrivateCifrada = await criptografarChaveVapid(chavesVapidSalvas.privateKey, serverPublicKeyJwk);
        if (!meuBundle) {
          const nomeB = (document.getElementById('profileNameB') as HTMLInputElement).value;
          const emailB = (document.getElementById('profileEmailB') as HTMLInputElement).value;
          meuBundle = {
            subscription: subscription ? {
              endpoint: subscription.endpoint,
              keys: subscription.keys
            } : undefined,
            vapid: {
              subject: `mailto:${emailB || 'unknown'}`,
              publicKey: publicVapid,
              privateKey: vapidPrivateCifrada
            },
            isVapidEncrypted: true,
            e2e: {
              ownerName: nomeB || 'Usuário',
              ownerEmail: emailB || 'unknown',
              browserB_PublicKeyEncrypt: publicKeyEncrypt
            },
            payloadText: ""
          };
        } else {
          if (!meuBundle.vapid) meuBundle.vapid = {};
          meuBundle.vapid.privateKey = vapidPrivateCifrada;
          meuBundle.vapid.publicKey = publicVapid;
          if (!meuBundle.vapid.subject) {
            const emailB = (document.getElementById('profileEmailB') as HTMLInputElement).value;
            meuBundle.vapid.subject = `mailto:${emailB || 'unknown'}`;
          }
        }
        await salvarBundleAtivo(meuBundle);
      } else {
        throw new Error("Chave privada VAPID não encontrada. Gere seu perfil novamente.");
      }
    }

    const encoder = new TextEncoder();
    const mensagemObj = {
      m: { c: conteudo },
      e: {
        s: subscription ? {
          e: subscription.endpoint,
          k: subscription.keys
        } : undefined,
        p: publicKeyEncrypt,
        v: {
          k: vapidPrivateCifrada
        }
      }
    };

    const mensagemBytes = encoder.encode(JSON.stringify(mensagemObj));
    const compressed = gzipSync(mensagemBytes);
    console.log(`📦 Comprimido: ${compressed.length} bytes`);

    const aesKey = await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt"]
    );
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encryptedBuffer = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      compressed
    );
    const aesKeyRaw = await window.crypto.subtle.exportKey("raw", aesKey);
    const aesKeyEncrypted = await window.crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      cryptoKeyDestino,
      aesKeyRaw
    );

    const envelope = {
      i: arrayBufferToBase64(iv.buffer),
      d: arrayBufferToBase64(encryptedBuffer),
      k: arrayBufferToBase64(aesKeyEncrypted)
    };
    const envelopeJson = JSON.stringify(envelope);

    const identidade = await buscarIdentidadeA();
    if (!identidade) throw new Error("Identidade não encontrada.");
    const header = { alg: "ES256" };
    const payload = {
      iss: identidade.email,
      sub: contato.email,
      ct: envelopeJson,
      p: publicVapid,
      nm: identidade.name
    };
    const headerB64 = arrayBufferToBase64Url(encoder.encode(JSON.stringify(header)));
    const payloadB64 = arrayBufferToBase64Url(encoder.encode(JSON.stringify(payload)));
    const toSign = `${headerB64}.${payloadB64}`;
    const signature = await window.crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      identidade.privateKey,
      encoder.encode(toSign)
    );
    const sigB64 = arrayBufferToBase64Url(signature);
    const jwt = `${toSign}.${sigB64}`;

    console.log(`📊 Tamanho do JWT: ${jwt.length} bytes`);
    if (jwt.length > 4096) {
      console.warn(`⚠️ JWT excede 4096 bytes em ${jwt.length - 4096} bytes!`);
    } else {
      console.log(`✅ JWT dentro do limite (${4096 - jwt.length} bytes restantes)`);
    }

    const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const mensagem: MensagemEnvio = {
      id: msgId,
      bundle: bundle,
      payloadText: jwt,
      mensagemOriginal: conteudo,
      destinatario: contato.email,
      status: 'pendente',
      tentativas: 0,
      maxTentativas: 3,
      criadoEm: Date.now(),
      atualizadoEm: Date.now()
    };

    await salvarMensagemEnvio(mensagem);
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage({ type: 'ENVIAR_MENSAGEM', payload: mensagem });

    showToast(`✅ Mensagem enviada para ${contato.nome}! ID: ${msgId}`, "success");
    (document.getElementById('mensagemEnvioB') as HTMLTextAreaElement).value = '';
    await carregarMensagensEnviadasB();

  } catch (err: any) {
    console.error(err);
    if (err.message && err.message.includes('410')) {
      showToast("❌ A subscription do contato expirou. Peça para ele gerar um novo perfil.", "error");
    } else {
      showToast(`❌ Erro: ${err.message}`, "error");
    }
  }
}

// ============================================================
// COMPARTILHAR PERFIL – usando copyToClipboard assíncrono
// ============================================================
async function compartilharProfile(): Promise<void> {
  console.log("🔄 Gerando e compartilhando perfil...");
  try {
    const profile = await gerarProfile();
    const profileJson = JSON.stringify(profile, null, 2);
    const display = document.getElementById('myProfileDisplay');
    if (display) {
      display.textContent = profileJson;
      display.style.background = '#e8f5e9';
    }
    await copyToClipboard(profileJson);
    showToast("✅ Perfil copiado para a área de transferência!", "success");
  } catch (err: any) {
    showToast("❌ Erro ao gerar perfil: " + err.message, "error");
  }
}

// ============================================================
// CARREGAR MENSAGENS RECEBIDAS – com fallback robusto
// ============================================================
async function carregarMensagensRecebidas(): Promise<void> {
  console.log("📬 Carregando mensagens recebidas...");
  const mensagens = await listarMensagensRecebidas();
  const container = document.getElementById('mensagensRecebidas');
  if (!container) return;

  if (mensagens.length === 0) {
    container.innerHTML = '<p style="color: #666;">Nenhuma mensagem recebida.</p>';
    return;
  }

  mensagens.sort((a, b) => b.recebidoEm - a.recebidoEm);
  let html = '';
  for (const msg of mensagens) {
    const statusEmoji = msg.status === 'nao_lida' ? '🟡' : msg.status === 'notificada' ? '🔔' : '✅';
    const data = new Date(msg.recebidoEm).toLocaleString();

    // 🔥 Busca contato pela chave da mensagem (agora hash)
    let contato: Contato | null = null;
    let nome = 'Remetente desconhecido';
    let homologado = false;
    let podeResponder = false;

    if (msg.contatoPublicKeyVapid) {
      // Primeiro, tenta buscar diretamente pela chave
      contato = await buscarContatoPorChave(msg.contatoPublicKeyVapid);
      if (!contato) {
        // Fallback: se a chave for JSON antigo, tenta converter para hash e buscar
        try {
          const parsed = JSON.parse(msg.contatoPublicKeyVapid);
          // Se for um objeto JWK, serializa para hash e busca
          if (parsed && parsed.kty) {
            const hashKey = await serializarPublicKeyVapid(parsed);
            contato = await buscarContatoPorChave(hashKey);
          }
        } catch (e) {
          // Não é JSON, ignora
        }
      }
      // Se ainda não encontrou, percorre todos os contatos comparando a chave pública VAPID
      if (!contato) {
        const todosContatos = await listarContatos();
        for (const c of todosContatos) {
          // Gera o hash da chave pública do contato e compara com a chave da mensagem
          const hashKey = await serializarPublicKeyVapid(c.publicKeyVapid);
          if (hashKey === msg.contatoPublicKeyVapid) {
            contato = c;
            break;
          }
        }
      }
    }

    if (contato) {
      nome = contato.nome || 'Remetente';
      homologado = contato.homologado || false;
      podeResponder = !!(contato.subscription && contato.publicKeyRSA && contato.vapidPrivateKey);
    }

    const homolEmoji = homologado ? '✅' : '🔄';
    const homolTexto = homologado ? 'Homologado' : 'Não homologado';
    const homolClass = homologado ? 'msg-item-homologado' : 'msg-item-nao-homologado';

    const botaoHomologar = (!homologado && contato) ?
      `<button class="btn-homologar-msg btn-sm homologar-btn" data-publickey='${JSON.stringify(contato.publicKeyVapid).replace(/'/g, "&#39;")}' style="font-size: 11px; padding: 2px 8px; color: white; border: none; border-radius: 3px; cursor: pointer;">🔄 Homologar</button>` :
      '';

    const botaoResponder = (podeResponder) ?
      `<button class="btn-responder-msg btn-sm" data-publickey='${JSON.stringify(contato.publicKeyVapid).replace(/'/g, "&#39;")}' style="font-size: 11px; padding: 2px 8px; background: #002b3d; color: white; border: none; border-radius: 3px; cursor: pointer;">💬 Responder</button>` :
      '';

    html += `
      <div class="msg-item ${homolClass}" style="border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin-bottom: 8px; background: ${msg.status === 'nao_lida' ? '#fffde7' : '#f9f9f9'};">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
          <strong>${statusEmoji} De: ${nome}</strong>
          <small style="color: #888;">${data}</small>
        </div>
        <p style="margin: 5px 0;">${msg.conteudo}</p>
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 5px;">
          <div>
            <span class="status-badge status-badge-${msg.status}">${msg.status}</span>
            <span class="status-badge ${homologado ? 'status-badge-homologado' : 'status-badge-nao-homologado'}" style="margin-left: 5px;">
              ${homolEmoji} ${homolTexto}
            </span>
          </div>
          <div style="display: flex; gap: 4px; flex-wrap: wrap;">
            ${botaoHomologar}
            ${botaoResponder}
            ${msg.status === 'nao_lida' || msg.status === 'notificada' ?
              `<button class="btn-marcar-lida" data-id="${msg.id}" style="font-size: 12px; padding: 2px 8px; background: #006c4f; color: white; border: none; border-radius: 3px; cursor: pointer;">📖 Marcar lida</button>` :
              ''
            }
            <button class="btn-remover-msg" data-id="${msg.id}" style="font-size: 12px; padding: 2px 8px; background: #cc0000; color: white; border: none; border-radius: 3px; cursor: pointer;">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;

  // Event listeners (idênticos ao código anterior)
  container.querySelectorAll('.btn-marcar-lida').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = (e.currentTarget as HTMLButtonElement).dataset.id;
      if (id) {
        await atualizarStatusMensagemRecebida(id, 'lida');
        await carregarMensagensRecebidas();
      }
    });
  });

  container.querySelectorAll('.btn-remover-msg').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = (e.currentTarget as HTMLButtonElement).dataset.id;
      if (id && confirm('Remover esta mensagem?')) {
        await removerMensagemRecebida(id);
        await carregarMensagensRecebidas();
      }
    });
  });

  container.querySelectorAll('.btn-homologar-msg').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const target = e.currentTarget as HTMLButtonElement;
      const publicKeyStr = target.dataset.publickey || '';
      try {
        const publicKeyVapid = JSON.parse(publicKeyStr);
        await homologarContato(publicKeyVapid);
        showToast("✅ Emissor homologado!", "success");
        await carregarMensagensRecebidas();
        await carregarContatos();
      } catch (err) {
        showToast(`❌ Erro: ${err.message}`, "error");
      }
    });
  });

  container.querySelectorAll('.btn-responder-msg').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const target = e.currentTarget as HTMLButtonElement;
      const publicKeyStr = target.dataset.publickey || '';
      try {
        const publicKeyVapid = JSON.parse(publicKeyStr);
        const contato = await buscarContatoPorPublicKey(publicKeyVapid);
        if (!contato) {
          showToast("❌ Contato não encontrado.", "error");
          return;
        }
        if (!contato.subscription || !contato.publicKeyRSA || !contato.vapidPrivateKey) {
          showToast("❌ Contato incompleto para responder.", "error");
          return;
        }
        const select = document.getElementById('contatoSelect') as HTMLSelectElement;
        const key = await serializarPublicKeyVapid(publicKeyVapid);
        select.value = key;
        showToast(`✅ Contato ${contato.nome} selecionado para responder!`, "success");
        document.querySelector('.container-emissor')?.scrollIntoView({ behavior: 'smooth' });
      } catch (err) {
        showToast(`❌ Erro: ${err.message}`, "error");
      }
    });
  });
}

// ============================================================
// HOMOLOGAR TODOS OS CONTATOS
// ============================================================
async function homologarTodasMensagens(): Promise<void> {
  const contatos = await listarContatos();
  const naoHomologados = contatos.filter(c => !c.homologado);
  if (naoHomologados.length === 0) {
    showToast("ℹ️ Nenhum contato não homologado.", "info");
    return;
  }
  if (!confirm(`Homologar ${naoHomologados.length} contatos?`)) return;
  let sucesso = 0;
  for (const c of naoHomologados) {
    try {
      await homologarContato(c.publicKeyVapid);
      sucesso++;
    } catch (err) {
      console.warn(`Falha ao homologar ${c.email}:`, err);
    }
  }
  showToast(`✅ ${sucesso} contatos homologados.`, "success");
  await carregarMensagensRecebidas();
  await carregarContatos();
}

// ============================================================
// REMOVER MENSAGENS LIDAS
// ============================================================
async function removerMensagensLidas(): Promise<void> {
  if (!confirm('Remover todas as mensagens lidas?')) return;
  const mensagens = await listarMensagensRecebidas();
  const lidas = mensagens.filter(m => m.status === 'lida');
  for (const msg of lidas) {
    await removerMensagemRecebida(msg.id);
  }
  await carregarMensagensRecebidas();
  showToast(`✅ ${lidas.length} mensagens removidas.`, "success");
}

// ============================================================
// MENSAGENS ENVIADAS
// ============================================================
async function carregarMensagensEnviadasB(): Promise<void> {
  console.log("📤 Carregando mensagens enviadas...");
  const mensagens = await listarMensagensEnvio();
  const container = document.getElementById('mensagensEnviadasB');
  if (!container) return;
  if (mensagens.length === 0) {
    container.innerHTML = '<p style="color: #666;">Nenhuma mensagem enviada.</p>';
    return;
  }
  mensagens.sort((a, b) => b.criadoEm - a.criadoEm);
  let html = '';
  for (const msg of mensagens) {
    const statusMap: Record<string, { emoji: string; label: string; classe: string }> = {
      'pendente': { emoji: '⏳', label: 'Pendente', classe: 'msg-item-pendente' },
      'enviando': { emoji: '🔄', label: 'Enviando...', classe: 'msg-item-pendente' },
      'enviada': { emoji: '✅', label: 'Enviada', classe: 'msg-item-enviada' },
      'falha': { emoji: '❌', label: 'Falha', classe: 'msg-item-falha' },
    };
    const status = statusMap[msg.status] || { emoji: '❓', label: msg.status, classe: '' };
    const data = new Date(msg.criadoEm).toLocaleString();

    html += `
      <div class="msg-item ${status.classe}" style="border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin-bottom: 8px; background: ${msg.status === 'enviada' ? '#e8f5e9' : msg.status === 'falha' ? '#ffebee' : '#fff8e1'};">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
          <strong>${status.emoji} Para: ${msg.destinatario}</strong>
          <small style="color: #888;">${data}</small>
        </div>
        <p style="margin: 5px 0;">${msg.mensagemOriginal || '(mensagem oculta)'}</p>
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div>
            <span class="status-badge status-badge-${msg.status}">${status.label}</span>
            ${msg.tentativas > 0 ? `<span style="font-size: 12px; color: #666; margin-left: 8px;">Tentativas: ${msg.tentativas}</span>` : ''}
          </div>
          ${msg.status === 'enviada' || msg.status === 'falha' ?
            `<button class="btn-remover-enviada-b btn-sm danger" data-id="${msg.id}" style="font-size: 12px; padding: 2px 8px; background: #cc0000; color: white; border: none; border-radius: 3px; cursor: pointer;">🗑️</button>` :
            ''
          }
        </div>
        ${msg.erro ? `<div style="font-size: 12px; color: #cc0000; margin-top: 4px;">Erro: ${msg.erro}</div>` : ''}
      </div>
    `;
  }
  container.innerHTML = html;

  container.querySelectorAll('.btn-remover-enviada-b').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = (e.currentTarget as HTMLButtonElement).dataset.id;
      if (id && confirm('Remover esta mensagem do histórico?')) {
        await removerMensagemEnvio(id);
        await carregarMensagensEnviadasB();
      }
    });
  });
}

// ============================================================
// TABS
// ============================================================
function initTabs(): void {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const parent = tab.parentElement;
      if (!parent) return;
      parent.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const tabId = tab.getAttribute('data-tab');
      if (!tabId) return;
      const contentParent = parent.parentElement;
      if (!contentParent) return;
      contentParent.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      const target = document.getElementById(`tab-${tabId}`);
      if (target) target.classList.add('active');
    });
  });
}

// ============================================================
// CARREGAMENTO INICIAL
// ============================================================
async function carregarDadosIniciais(): Promise<void> {
  console.log("📂 Carregando dados iniciais...");
  try {
    const identidade = await buscarIdentidadeA();
    if (identidade) {
      (document.getElementById('profileNameB') as HTMLInputElement).value = identidade.name;
      (document.getElementById('profileEmailB') as HTMLInputElement).value = identidade.email;
    }
    await carregarContatos();
    await carregarSelectContatos();
    await carregarMensagensRecebidas();
    await carregarMensagensEnviadasB();
    console.log("✅ Dados iniciais carregados!");
  } catch (err) {
    console.warn("⚠️ Erro ao carregar dados iniciais:", err);
  }
}

// ============================================================
// EVENT LISTENERS
// ============================================================
window.addEventListener("DOMContentLoaded", async () => {
  console.log("📄 DOM carregado, inicializando aplicação...");
  initTabs();
  await carregarDadosIniciais();

  document.getElementById('btnGerarProfile')?.addEventListener('click', compartilharProfile);

  document.getElementById('btnCopyProfile')?.addEventListener('click', () => {
    const display = document.getElementById('myProfileDisplay');
    if (display && display.textContent && display.textContent !== 'Clique em "Gerar e Compartilhar Meu Perfil" para criar seu perfil.') {
      copyToClipboard('myProfileDisplay');
    } else {
      showToast("Primeiro gere seu perfil.", "info");
    }
  });

  document.getElementById('btnAdicionarContato')?.addEventListener('click', adicionarContato);
  document.getElementById('btnEnviarB')?.addEventListener('click', enviarMensagemB);
  document.getElementById('btnCarregarMensagens')?.addEventListener('click', carregarMensagensRecebidas);
  document.getElementById('btnLimparLidas')?.addEventListener('click', removerMensagensLidas);
  document.getElementById('btnHomologarTodas')?.addEventListener('click', homologarTodasMensagens);

  document.getElementById('btnLimparSubscription')?.addEventListener('click', async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        console.log("Subscription desinscrita.");
      }
      await removerSubscriptionB();
      console.log("Subscription removida do IndexedDB.");
      showToast("✅ Subscription limpa. Gere um novo perfil.", "success");
    } catch (err) {
      console.error(err);
      showToast("❌ Erro ao limpar subscription.", "error");
    }
  });

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'PUSH_RECEIVED') {
      console.log('📬 Push recebido, recarregando mensagens...');
      showToast(`📩 Nova mensagem de ${event.data.payload?.remetente || 'alguém'}!`, "info");
      setTimeout(() => {
        carregarMensagensRecebidas();
        carregarContatos();
      }, 1000);
    }
    if (event.data?.type === 'MENSAGEM_ENVIADA') {
      console.log('📤 Mensagem enviada, atualizando lista...');
      setTimeout(carregarMensagensEnviadasB, 500);
    }
  });
});
```

---

## Arquivo: `src/styles.css`

```css
* { box-sizing: border-box; }
body { font-family: system-ui, sans-serif; padding: 20px; color: #333; max-width: 900px; margin: 0 auto; }
.container { background: #f4f4f4; padding: 15px; border-radius: 6px; margin-bottom: 20px; border-left: 5px solid #006c4f; }
.container-emissor { border-left-color: #002b3d; }
.container-receptor { border-left-color: #ff6b00; }
.container-contatos { border-left-color: #6c4f00; }
textarea, input[type="text"] { width: 100%; max-width: 100%; padding: 8px; box-sizing: border-box; margin-bottom: 8px; font-family: monospace; }
button { padding: 10px 16px; font-weight: bold; background-color: #006c4f; color: white; border: none; border-radius: 4px; cursor: pointer; margin-bottom: 10px; }
button:hover { background-color: #004d3f; }
button.send-btn { background-color: #002b3d; width: 100%; padding: 12px; font-size: 16px; margin-top: 10px; }
button.send-btn:hover { background-color: #001a26; }
button.danger { background-color: #cc0000; }
button.danger:hover { background-color: #990000; }
button.homologar-btn { background-color: #ff6b00; }
button.homologar-btn:hover { background-color: #cc5500; }
label { font-weight: bold; display: block; margin-top: 5px; }
.row { display: flex; gap: 20px; flex-wrap: wrap; }
.col { flex: 1; min-width: 300px; }
.btn-sm { padding: 4px 12px; font-size: 12px; margin-bottom: 0; }
.mt-10 { margin-top: 10px; }
.mb-10 { margin-bottom: 10px; }
.flex { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.flex-end { display: flex; gap: 8px; align-items: center; }
.msg-item { border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin-bottom: 8px; }
.msg-item-nao-lida { background: #fffde7; }
.msg-item-notificada { background: #e3f2fd; }
.msg-item-lida { background: #f9f9f9; }
.msg-item-homologado { border-left: 4px solid #28a745; }
.msg-item-nao-homologado { border-left: 4px solid #ff6b00; }
.status-badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; }
.status-badge-homologado { background: #d4edda; color: #155724; }
.status-badge-nao-homologado { background: #fff3cd; color: #856404; }
.status-badge-lida { background: #d1ecf1; color: #0c5460; }
.status-badge-notificada { background: #d1ecf1; color: #0c5460; }
.status-badge-enviada { background: #d4edda; color: #155724; }
.status-badge-falha { background: #f8d7da; color: #721c24; }
.tabs { display: flex; gap: 4px; margin-bottom: 10px; flex-wrap: wrap; }
.tab { padding: 8px 16px; background: #e0e0e0; border: none; border-radius: 4px 4px 0 0; cursor: pointer; font-weight: bold; }
.tab.active { background: #006c4f; color: white; }
.tab-content { display: none; }
.tab-content.active { display: block; }
.toast { position: fixed; bottom: 20px; right: 20px; padding: 12px 20px; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 9999; max-width: 400px; font-family: system-ui, sans-serif; animation: fadeInUp 0.3s ease; }
.toast-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
.toast-error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
.toast-info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
.profile-field { background: #fafafa; border: 1px solid #ddd; border-radius: 4px; padding: 8px; font-family: monospace; font-size: 12px; word-break: break-all; max-height: 150px; overflow-y: auto; white-space: pre-wrap; }
.contato-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-bottom: 1px solid #eee; }
.contato-item:hover { background: #f0f0f0; }
.contato-select { width: 100%; padding: 8px; margin-bottom: 10px; }
@keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
```

---

## Arquivo: `deno.json`

```json
{
  "extends": "../../deno.json",
  "imports": {
    "@negrel/webpush": "jsr:@negrel/webpush@^0.5.0",
    "preact": "https://esm.sh/preact@10.29.7",
    "@preact/signals": "https://esm.sh/@preact/signals@1.2.2",
    "idb-keyval": "https://esm.sh/idb-keyval@6.2.1",
    "fflate": "https://esm.sh/fflate@0.8.2",
    "@material/web": "https://esm.sh/@material/web@1.5.1?bundle"
  },
  "tasks": {
    "build": "deno run --allow-read --allow-write --allow-env --allow-net --unstable-bundle --env-file build.ts",
    "start": "deno run --allow-read --allow-write --allow-env --allow-net --env-file main.ts",
    "dev": "deno run --allow-read --allow-write --allow-env --allow-net --env-file --watch main.ts",
    "clean": "rm -rf dist && mkdir -p dist",
    "export": "deno run --allow-read --allow-write export.ts"
  },
  "exclude": ["dist/", "public/"]
}

```

---

## Arquivo: `README.md`

````md
# 📡 Web Push Descentralizado – Protótipo Detalhado

## 1. Objetivo Geral

Este protótipo implementa um sistema de mensagens **descentralizado** utilizando a API **Web Push** (especificamente via FCM no Chrome) como transporte. O objetivo é permitir que dois navegadores (ou mais) troquem mensagens diretamente, sem a necessidade de um servidor central para armazenar mensagens ou gerenciar contatos.

Cada navegador atua como um **ponto autônomo**:
- **Emissor**: envia mensagens para outro usuário.
- **Receptor**: recebe mensagens e pode responder.

A infraestrutura mínima necessária é um **servidor proxy** (fornecido neste projeto em Deno) que:
- Fornece uma chave pública RSA usada para cifrar a chave privada VAPID durante a troca de perfis.
- Reencaminha as requisições push ao serviço de push (FCM), após descriptografar a chave privada VAPID para assinar o cabeçalho de autorização.

Não há banco de dados central, nem filas compartilhadas: cada navegador mantém seu próprio **IndexedDB** com contatos e histórico de mensagens.

---

## 2. Conceitos Fundamentais

### 2.1. Perfil (Profile)
Um **perfil** é um objeto JSON público gerado por cada usuário. Ele contém todas as informações necessárias para que outros possam enviar-lhe mensagens push. O perfil deve ser transferido fora de banda (por exemplo, copiando e colando) do receptor para o emissor.

**Estrutura do Perfil:**
```json
{
  "iss": "email@exemplo.com",       // Identificador único (e-mail do dono)
  "nm": "Nome do Usuário",           // Nome legível (exibido nas mensagens)
  "kid": { ... },                    // Chave pública VAPID (ECDSA P-256) em JWK
  "s": {                             // Subscription do Web Push
    "endpoint": "https://fcm.googleapis.com/...",
    "keys": {
      "p256dh": "base64...",
      "auth": "base64..."
    }
  },
  "p": { ... },                      // Chave pública RSA (RSA-OAEP-256) em JWK
  "k": "base64..."                   // Chave privada VAPID cifrada (envelope RSA-AES)
}
```

**Campos explicados:**
- `iss`: E-mail ou identificador único do dono do perfil.
- `nm`: Nome legível para exibição na interface e nas notificações.
- `kid`: Chave pública VAPID. Usada para verificar a assinatura do JWT recebido e para identificar o contato.
- `s`: Subscription obtida via `PushManager.subscribe()`. Contém o endpoint do serviço de push e as chaves `p256dh`/`auth`, necessárias para cifrar o payload.
- `p`: Chave pública RSA. Usada pelo emissor para cifrar a chave AES que, por sua vez, cifra a mensagem.
- `k`: Chave privada VAPID cifrada com um envelope híbrido: AES-GCM + RSA-OAEP usando a chave pública RSA do servidor proxy. Apenas o servidor proxy pode decifrá-la, garantindo que a chave privada VAPID nunca seja transmitida em texto puro.

### 2.2. Contato (Contact)
Quando um usuário recebe uma mensagem (ou adiciona manualmente um perfil), o emissor é salvo localmente como um **contato**. O contato armazena a subscription e as chaves públicas do emissor, permitindo que o receptor responda no futuro sem a necessidade de um novo perfil.

**Estrutura do Contato (IndexedDB):**
```typescript
interface Contato {
  publicKeyVapid: JsonWebKey;      // Chave pública VAPID (ECDSA)
  email: string;
  nome: string;
  publicKeyRSA: JsonWebKey;        // Chave pública RSA (para cifrar a resposta)
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  vapidPrivateKey: string;         // Chave privada VAPID cifrada (para o proxy)
  homologado: boolean;             // Se o contato é confiável (lista branca)
  createdAt: number;
  updatedAt: number;
}
```

### 2.3. Mensagem (Message)
A mensagem propriamente dita é transportada dentro de um **JWT** assinado. O conteúdo da mensagem é cifrado e comprimido para reduzir o tamanho (limite de 4096 bytes no Web Push).

**Estrutura da mensagem recebida (IndexedDB):**
```typescript
interface MensagemRecebida {
  id: string;                       // msg_<timestamp>_<random>
  contatoPublicKeyVapid: string;   // Hash SHA-256 da chave VAPID do emissor (referência ao contato)
  conteudo: string;                 // Texto decifrado
  status: 'nao_lida' | 'lida' | 'notificada';
  recebidoEm: number;
}
```

---

## 3. Armazenamento IndexedDB – Detalhamento

O sistema utiliza as seguintes stores (bancos) no IndexedDB, gerenciadas pela biblioteca `idb-keyval`:

| Nome da Store (`DB_NAMES`) | Chave | Valor | Finalidade |
| :--- | :--- | :--- | :--- |
| `BrowserB_Contatos_DB` | **Hash SHA-256** (hex) da chave VAPID pública serializada | `Contato` | Armazena todos os contatos conhecidos. A chave é um hash para evitar problemas de capitalização (case-insensitive) e inconsistências de serialização. |
| `BrowserB_MensagensRecebidas_DB` | `msg_<timestamp>_<random>` | `MensagemRecebida` | Armazena mensagens recebidas. O campo `contatoPublicKeyVapid` referencia a chave hash do contato correspondente. |
| `BrowserA_Identidade_DB` | `identidade_a` | `IdentidadeA` | Armazena a chave privada VAPID do usuário local (como `CryptoKey`), usada para assinar JWT. |
| `BrowserA_MensagensEnvio_DB` | `msg_<timestamp>_<random>` | `MensagemEnvio` | Fila de mensagens aguardando envio (offline-first). |
| `BrowserB_Subscription_DB` | `subscription_b` | `SubscriptionData` | Armazena a subscription atual do usuário. |
| `BrowserA_Bundles_DB` | `bundle_ativo`, `bundle_historico` | `BundleData` | Armazena o perfil/bundle atual do usuário e histórico (para referência). |

**Geração do Hash do Contato:**
Para evitar diferenças de capitalização (ex: `"EC"` vs `"ec"`, `"P-256"` vs `"p-256"`), a chave primária da store de contatos é um **hash SHA-256** da string normalizada em minúsculo: `${kty}|${crv}|${x}|${y}` (extraídos da chave pública VAPID). Isso garante que a mesma chave pública gere sempre o mesmo hash, independentemente de como foi serializada.

---

## 4. Fluxos Detalhados

### 4.1. Geração do Perfil
**Função:** `gerarProfile()` em `src/app.tsx`

1. **Verificação de permissões**: Checa se a permissão de notificação está concedida; caso contrário, solicita.
2. **Registro do Service Worker**: Registra ou obtém a instância do Service Worker.
3. **Geração de chaves VAPID**: Gera um par de chaves ECDSA P-256 (`vapidKeyPair`).
4. **Geração de chaves RSA**: Gera um par de chaves RSA-OAEP-256 (`encryptionKeyPair`).
5. **Obtenção da subscription**: Obtém a subscription do `PushManager` do navegador, usando a chave pública VAPID como `applicationServerKey`.
6. **Busca da chave pública do servidor**: Faz uma requisição GET para `/api/server-public-key` para obter a chave pública RSA do servidor proxy.
7. **Cifragem da chave privada VAPID**:
   - A chave privada VAPID (em JWK) é cifrada com AES-GCM usando uma chave simétrica gerada aleatoriamente.
   - A chave simétrica é cifrada com RSA-OAEP usando a chave pública do servidor.
   - O resultado é um envelope JSON com `iv`, `dadosCifrados` e `chaveAesCifrada`, codificado em Base64. Esse envelope é colocado no campo `k` do perfil.
8. **Montagem do perfil**: Combina `iss` (email), `nm` (nome), `kid` (chave pública VAPID), `s` (subscription), `p` (chave pública RSA), e `k` (chave privada VAPID cifrada).
9. **Persistência**: Salva o perfil no IndexedDB (`bundle_ativo`) e também em histórico.
10. **Exibição**: O perfil é mostrado em uma área de texto para o usuário copiar.

### 4.2. Adição de Contato
**Função:** `adicionarContato()` em `src/app.tsx`

1. O usuário cola um perfil JSON em uma textarea e clica em "Adicionar Contato".
2. Valida a estrutura do perfil (verifica campos obrigatórios).
3. **Importa a chave pública VAPID** (campo `kid`) usando `crypto.subtle.importKey` com algoritmo `ECDSA` e `namedCurve: "P-256"` para validar o formato. Se falhar, o perfil é rejeitado.
4. Cria um objeto `Contato` com os dados do perfil (`homologado: false`).
5. **Gera o hash** da chave pública VAPID utilizando a função `serializarPublicKeyVapid` (que normaliza e aplica SHA-256).
6. Salva o contato no IndexedDB (`BrowserB_Contatos_DB`) usando o hash como chave.
7. Atualiza a interface: lista de contatos e dropdown de seleção.

### 4.3. Envio de Mensagem
**Função:** `enviarMensagemB()` em `src/app.tsx`

1. O usuário seleciona um contato no dropdown (populado com os hashes) e digita a mensagem.
2. Recupera o contato completo do IndexedDB usando o hash selecionado.
3. **Prepara o objeto da mensagem**:
   ```javascript
   const mensagemObj = {
     m: { c: conteudo },           // m = message, c = content (curto)
     e: {
       s: {                         // subscription do emissor (para resposta)
         e: subscription.endpoint,
         k: subscription.keys
       },
       p: publicKeyEncrypt,         // chave pública RSA do emissor
       v: { k: vapidPrivateCifrada } // chave privada VAPID cifrada do emissor
     }
   };
   ```
4. **Comprime** o JSON com Gzip.
5. **Gera uma chave AES-GCM** e IV aleatório.
6. **Cifra os dados comprimidos** com AES-GCM.
7. **Cifra a chave AES** com a chave pública RSA do contato (usando RSA-OAEP).
8. Monta o envelope:
   ```json
   { "i": iv_base64, "d": dados_cifrados_base64, "k": chave_aes_cifrada_base64 }
   ```
9. **Constrói o JWT**:
   - Header: `{ "alg": "ES256" }`
   - Payload: 
     ```json
     {
       "iss": email_do_emissor,
       "sub": email_do_receptor,
       "ct": envelope_json_string,
       "p": publicKeyVapid_do_emissor,
       "nm": nome_do_emissor
     }
     ```
10. **Assina o JWT** usando a chave privada VAPID do emissor (ECDSA) – obtida da store `IdentidadeA`.
11. **Salva a mensagem** na store de envio (`BrowserA_MensagensEnvio_DB`) com status `'pendente'`.
12. **Envia uma mensagem ao Service Worker** via `postMessage` com tipo `ENVIAR_MENSAGEM`, contendo o bundle e o JWT.
13. O Service Worker tentará enviar imediatamente ou mais tarde (offline).

### 4.4. Processamento do Envio (Service Worker – `sw-mensagens.js`)
1. O Service Worker recebe a mensagem da página via `postMessage`.
2. Salva a mensagem na store `BrowserA_MensagensEnvio_DB` (se ainda não foi salva).
3. Dispara a função `processarFilaEnvio()`.
4. Para cada mensagem pendente (status `'pendente'` ou `'enviando'` há mais de 30 segundos):
   - Atualiza status para `'enviando'`.
   - Chama `enviarMensagemParaServidor(mensagem)`, que faz uma requisição HTTP POST para `/api/proxy-push` no servidor Deno, com os campos: `subscription`, `payloadText` (JWT), `vapid` (objeto com chaves), e `isVapidEncrypted: true`.
   - Se a resposta for bem-sucedida, atualiza status para `'enviada'`. Em caso de erro, incrementa tentativas e, se exceder o máximo, marca como `'falha'`.
5. A sincronização em segundo plano (`sync` event) também pode disparar esse processo quando a conexão for restaurada.

### 4.5. Recebimento da Mensagem (Service Worker – `push.js`)
1. O Service Worker recebe o evento `push` contendo o JWT no `event.data.text()`.
2. Divide o JWT em header, payload e signature.
3. **Verifica a assinatura**:
   - Extrai o payload (Base64Url decodificado) e obtém `iss` (email), `nm` (nome), `p` (chave pública VAPID do emissor), `ct` (envelope).
   - Verifica se `p` é uma chave válida e importa-a como `CryptoKey` para `ECDSA`.
   - Decodifica a assinatura e verifica a integridade do JWT.
4. Se a assinatura for inválida, descarta a mensagem e exibe notificação de erro.
5. **Decifra o envelope**:
   - Obtém a chave privada RSA do receptor (armazenada em `storeChavesE2E`).
   - Decodifica `iv`, `dados` e `k` do envelope.
   - Descriptografa a chave AES usando RSA-OAEP.
   - Descriptografa os dados com AES-GCM.
   - Descomprime (gunzip) o resultado, obtendo o objeto JSON original.
6. **Salva/Atualiza o Contato**:
   - Extrai `subscription`, `publicKeyRSA` e `vapidPrivateKey` do objeto decifrado.
   - Gera o hash da chave pública VAPID do emissor (do campo `p` do JWT).
   - Busca um contato existente pelo hash.
   - Se não existir, cria um novo contato com os dados extraídos e o nome vindo de `nm` (ou fallback para o email). Se já existir, atualiza o nome e outros dados se necessário.
   - Salva o contato na store `BrowserB_Contatos_DB`.
7. **Salva a Mensagem**:
   - Gera um ID único.
   - Cria um objeto `MensagemRecebida` com o hash do contato, conteúdo decifrado, status `'nao_lida'` e timestamp.
   - Salva na store `BrowserB_MensagensRecebidas_DB`.
8. **Exibe notificação nativa** com o nome do remetente e o conteúdo.
9. **Notifica as páginas abertas** via `postMessage` com tipo `PUSH_RECEIVED`, para que a UI seja atualizada em tempo real.

### 4.6. Resposta (Responder)
1. Na interface de mensagens recebidas, cada mensagem tem um botão "Responder".
2. Ao clicar, o sistema obtém o hash do contato a partir da mensagem (campo `contatoPublicKeyVapid`).
3. Busca o contato completo no IndexedDB.
4. Preenche o dropdown de seleção de contatos com esse contato (via `select.value`) e navega para a aba de envio.
5. O usuário digita a mensagem e o fluxo de envio (4.3) é executado, enviando a mensagem de volta para o emissor original.

---

## 5. Segurança e Criptografia

| Etapa | Algoritmo/Esquema | Detalhe |
| :--- | :--- | :--- |
| **Assinatura do JWT** | ECDSA P-256 (`ES256`) | Garante que a mensagem não foi adulterada e autentica o emissor. |
| **Cifragem do envelope** | AES-GCM (256 bits) | Cifra o conteúdo da mensagem, garantindo confidencialidade. |
| **Cifragem da chave AES** | RSA-OAEP-256 | A chave AES é cifrada com a chave pública RSA do receptor, permitindo que apenas o receptor (com a chave privada) possa decifrá-la. |
| **Compressão** | Gzip | Reduz o tamanho do payload (necessário devido ao limite de 4096 bytes do Web Push). |
| **Chave privada VAPID** | Envelope RSA-AES (servidor) | A chave privada VAPID do emissor viaja cifrada no perfil. Apenas o servidor proxy (que possui a chave privada RSA correspondente) pode decifrá-la, evitando exposição no cliente. |

**Observações sobre o limite de 4096 bytes:** O Web Push impõe um limite de 4096 bytes para o payload. Para respeitar esse limite, o sistema utiliza compressão gzip, campos curtos (ex: `ct`, `p`, `nm`) e estrutura compacta do envelope. O tamanho típico do JWT fica em torno de 3700-3800 bytes.

---

## 6. Estrutura do Projeto (Arquivos Relevantes)

| Arquivo | Responsabilidade |
| :--- | :--- |
| `src/app.tsx` | Interface principal (UI) e lógica de negócio (geração de perfil, envio, recebimento via SW). Usa `preact` para componentes, mas é um arquivo único. |
| `src/sw/push.js` | Lida com o evento `push`. Verifica assinatura, decifra envelope, salva contato e mensagem no IndexedDB, exibe notificação. |
| `src/sw/sw-mensagens.js` | Gerencia filas de envio offline. Escuta mensagens da página (`postMessage`) e envia ao servidor proxy. |
| `src/sw/cache.js` | Gerencia cache offline para os assets estáticos (HTML, CSS, JS). |
| `src/sw/click.js` | Lida com o evento `notificationclick` – redireciona para a página principal. |
| `src/constants/db.ts` | Define nomes das stores e interfaces TypeScript para contato, mensagem, etc. |
| `src/utils/db-helpers.ts` | Funções auxiliares para operações IndexedDB: `salvarContato`, `buscarContatoPorChave`, `serializarPublicKeyVapid` (hash SHA-256). |
| `main.ts` | Servidor Deno (proxy). Endpoints: `/api/server-public-key` (retorna chave pública RSA) e `/api/proxy-push` (recebe JSON com subscription e payload, descriptografa a chave privada VAPID, assina e encaminha para o endpoint de push). |
| `build.ts` | Script de build usando `Deno.bundle` com entrypoints HTML. Compila `index.html` (que referencia `app.tsx`), gera bundle JS e atualiza o HTML. Também compila o Service Worker separadamente e injeta lista de assets e hash de versão. |

---

## 7. Build e Execução

### Build
O projeto utiliza **Deno** com `build.ts` para bundling:
- O arquivo `src/index.html` é usado como entrypoint. O Deno bundler detecta a tag `<script src="./app.tsx" type="module">` e compila o código, gerando um arquivo JS com hash e atualizando o HTML.
- O Service Worker é compilado separadamente em modo IIFE e tem seu conteúdo pós-processado para substituir `VERSION_HASH` e `__GENERATED_ASSETS__` pela lista de assets a cachear.

Comando:
```bash
deno task build
```

### Execução do Servidor
O servidor proxy é iniciado com:
```bash
deno task start
```
Ele roda na porta 8000 e serve os arquivos estáticos da pasta `dist/`. Também fornece os endpoints `/api/server-public-key` (GET) e `/api/proxy-push` (POST).

---

## 8. Estado Atual e Pontos de Atenção

- **Chave de Contato**: A migração para o hash SHA-256 está completa. Todos os contatos são armazenados com chave hash. As mensagens recebidas salvam o hash do contato (`contatoPublicKeyVapid`).
- **Identificação do Emissor**: O campo `nm` (nome) é incluído no payload do JWT. O Service Worker extrai esse campo para salvar ou atualizar o nome do contato, garantindo que as mensagens exibam o nome correto.
- **Limitação de Payload**: O JWT total deve ser inferior a 4096 bytes. O sistema utiliza compressão gzip, campos curtos (`ct`, `p`, `nm`) e estrutura compacta do envelope.
- **Homologação**: A homologação é um campo booleano no contato, utilizado apenas para fins de interface (ex: exibir "Homologado" ou "Não homologado"). Não bloqueia o recebimento de mensagens.
- **Service Worker**: Durante o desenvolvimento, é necessário desregistrar o Service Worker manualmente (Application → Service Workers → Unregister) e recarregar a página para que a nova versão seja carregada, devido ao cache agressivo.

---

## 9. Próximos Passos (Contexto para a Próxima IA)

A próxima iteração deverá focar na **revisão da estrutura de dados no IndexedDB**, incluindo:
1. **Consistência de chaves**: Verificar se todas as operações de contato e mensagem usam corretamente o hash SHA-256, e se não há divergências entre os campos de referência.
2. **Atualização de contatos**: Garantir que, ao receber uma nova mensagem de um contato existente, o nome e outros dados sejam atualizados corretamente.
3. **Limpeza de dados obsoletos**: Avaliar a possibilidade de remover stores ou campos que não são mais usados (ex: `BrowserB_ListaBranca_DB` ou campos antigos de mensagens).
4. **Otimização de performance**: Verificar se as consultas ao IndexedDB são eficientes e se há índices que poderiam ser criados.
5. **Validação do fluxo de resposta**: Testar exaustivamente o fluxo de resposta, assegurando que a chave privada VAPID cifrada (`vapidPrivateKey`) seja corretamente utilizada para montar o bundle de resposta.

Além disso, considere a **documentação de testes manuais** e, se possível, a criação de um conjunto básico de testes unitários para as funções críticas (ex: serialização de chave, cifragem/decifragem).

---

## 10. Glossário de Termos

| Termo | Significado |
| :--- | :--- |
| **VAPID** | Voluntary Application Server Identification – mecanismo para identificar o servidor de aplicação ao serviço de push. Utiliza chaves ECDSA. |
| **JWK** | JSON Web Key – formato para representar chaves criptográficas. |
| **JWT** | JSON Web Token – token assinado usado para transportar informações entre partes. |
| **FCM** | Firebase Cloud Messaging – serviço de push da Google (utilizado no Chrome). |
| **APNs** | Apple Push Notification service – serviço de push da Apple. |
| **E2EE** | End-to-End Encryption – criptografia de ponta a ponta. |
| **Subscription** | Objeto que representa a inscrição de um navegador no serviço de push, contendo endpoint e chaves de cifragem. |
| **Proxy Server** | Servidor intermediário que encaminha requisições, neste caso, para o FCM, após assiná-las com a chave privada VAPID. |

````

---

## Arquivo: `build.ts`

```ts
/// <reference lib="deno.ns" />
import { ensureDir, copy, walk } from "@std/fs";
import { join } from "@std/path";

const DIST_DIR = "dist";
const SRC_DIR = "src";
const PUBLIC_DIR = "public";

interface BundleResult {
  success: boolean;
  errors?: unknown[];
  warnings?: unknown[];
  outputFiles?: Array<{
    path: string;
    contents: Record<string, number> | Uint8Array | string;
    hash?: string;
  }>;
  code?: string;
  output?: string;
}

interface BundleOptions {
  entrypoints: string[];
  outputDir?: string;
  outputFile?: string;
  platform?: "browser" | "deno" | "neutral";
  format?: "esm" | "iife" | "cjs";
  bundle?: boolean;
  minify?: boolean;
  sourcemap?: boolean | "linked" | "inline";
  write?: boolean;
  jsx?: "automatic" | "react" | "preserve";
  jsxImportSource?: string;
  jsxFactory?: string;
  jsxFragment?: string;
}

async function clean() {
  try {
    await Deno.remove(DIST_DIR, { recursive: true });
  } catch {
    // diretório não existe, ok
  }
  await ensureDir(DIST_DIR);
  console.log("📁 Arquivos anteriores excluídos");
}

async function copyStatic() {
  try {
    await copy(PUBLIC_DIR, DIST_DIR, { overwrite: true });
    console.log("📁 Arquivos estáticos copiados");
  } catch {
    console.log("⚠️ Pasta public não encontrada ou erro na cópia");
  }
}

function contentsToString(contents: Record<string, number> | Uint8Array | string): string {
  if (typeof contents === 'string') return contents;
  if (contents instanceof Uint8Array) return new TextDecoder().decode(contents);
  if (contents && typeof contents === 'object') {
    const bytes: number[] = [];
    const keys = Object.keys(contents);
    const isNumericKeys = keys.every(k => !isNaN(Number(k)));
    if (isNumericKeys && keys.length > 0) {
      const sortedKeys = keys.map(Number).sort((a, b) => a - b);
      for (const key of sortedKeys) {
        const value = (contents as Record<string, number>)[key.toString()];
        if (typeof value === 'number' && value >= 0 && value <= 255) bytes.push(value);
      }
      if (bytes.length > 0) return new TextDecoder().decode(new Uint8Array(bytes));
    }
  }
  return JSON.stringify(contents);
}

async function writeOutput(result: BundleResult, fileName: string): Promise<void> {
  if (!result.outputFiles || result.outputFiles.length === 0) {
    throw new Error(`Nenhum output gerado para ${fileName}`);
  }
  const text = contentsToString(result.outputFiles[0].contents);
  await Deno.writeTextFile(join(DIST_DIR, fileName), text);
}

function extrairCodigoDoBundle(result: BundleResult): string {
  if (!result.outputFiles || result.outputFiles.length === 0) return '';
  return contentsToString(result.outputFiles[0].contents);
}

async function runBundle(name: string, bundleOpts: BundleOptions): Promise<BundleResult> {
  console.log(`🔨 [${name}] Iniciando bundle...`);
  // deno-lint-ignore no-explicit-any
  const result = (await (Deno as any).bundle(bundleOpts)) as BundleResult;
  if (!result.success) {
    console.error(`❌ Erros no bundle ${name}:`, result.errors);
    throw new Error(`Falha ao gerar ${name}`);
  }
  for (const warning of result.warnings || []) {
    console.warn(`⚠️ ${name}:`, warning);
  }
  return result;
}

async function gerarOuCarregarChavesServidor() {
  let publicKey = Deno.env.get('SERVER_PUBLIC_KEY');
  let privateKey = Deno.env.get('SERVER_PRIVATE_KEY');
  if (publicKey && privateKey) {
    console.log("🔑 Chaves do servidor carregadas do .env");
    return;
  }
  console.log("🔐 Gerando novas chaves RSA do servidor...");
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const publicKeyStr = JSON.stringify(publicJwk);
  const privateKeyStr = JSON.stringify(privateJwk);
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
  console.log("   ⚠️  NÃO COMMITAR este arquivo!");
  console.log("   💡 Use 'deno task start' para rodar o servidor");
}

async function listarAssetsParaCache(): Promise<string[]> {
  const assets: string[] = []; // Não Inclui a rota raiz explicitamente
  const exclude = new Set(['service-worker.js', 'service-worker.tmp.js']);
  
  // Caminha recursivamente por todos os subdiretórios criados pelo bundle dentro de dist
  for await (const entry of walk(DIST_DIR, { includeDirs: false })) {
    if (!entry.name.endsWith(".map") && !exclude.has(entry.name)) {
      // Transforma o caminho do sistema de arquivos em caminho relativo web (ex: /assets/style.css)
      const webPath = entry.path.replace(DIST_DIR, "").replace(/\\/g, "/");
      assets.push(webPath);
    }
  }
  return assets;
}

async function build() {
  console.log("\n🚀 Iniciando build do protótipo...\n");
  const start = performance.now();

  await gerarOuCarregarChavesServidor();
  await clean();
  await copyStatic();

  console.log("📦 Compilando página HTML (browser-b)...");
  await runBundle("HTML", {
    entrypoints: [join(SRC_DIR, "index.html")],
    outputDir: DIST_DIR,
    platform: "browser",
    format: "esm",
    bundle: true,
    minify: false,
    write: true,
    jsx: "automatic",
    jsxImportSource: "preact",
    jsxFactory: "h",
    jsxFragment: "Fragment",
  });

  console.log("📦 Compilando Service Worker em memória...");
  const swResult = await runBundle("ServiceWorker", {
    entrypoints: [join(SRC_DIR, "service-worker.js")],
    platform: "browser",
    format: "iife",
    bundle: true,
    minify: false,
    write: false,
  });

  let swCode = extrairCodigoDoBundle(swResult);
  if (swCode.length < 100) throw new Error("Não foi possível extrair o código do Service Worker");
  console.log(`   📄 Código extraído: ${swCode.length} caracteres`);

const assets = await listarAssetsParaCache();
const versionHash = Date.now().toString();

// Injeta as propriedades de forma robusta
swCode = swCode
  .replace(/VERSION_HASH/g, versionHash)
  // Substitui a expressão inteira __GENERATED_ASSETS__ pelo array serializado em JSON
  .replace(/__GENERATED_ASSETS__/g, JSON.stringify(assets).slice(1, -1)); 
  // O .slice(1, -1) remove os colchetes [ ] do JSON.stringify para encaixar perfeitamente dentro de [__GENERATED_ASSETS__]

await Deno.writeTextFile(join(DIST_DIR, "service-worker.js"), swCode);

  console.log(`✨ Service Worker gerado com sucesso! (v_${versionHash})`);
  console.log(`   📦 ${assets.length} assets em cache`);
  console.log(`   📄 Tamanho: ${(swCode.length / 1024).toFixed(2)} KB`);

  const elapsed = (performance.now() - start).toFixed(0);
  console.log(`\n✨ Build completo em ${elapsed}ms → ${DIST_DIR}/`);
  console.log(`   📄 Assets cacheados: ${assets.join(', ')}\n`);
}

await build();
```

---

