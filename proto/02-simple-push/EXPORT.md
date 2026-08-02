> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém múltiplos arquivos do meu projeto estruturados em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Analise a estrutura de pastas, as dependências e o código fornecido para indicar as mudanças necessárias para a implementação das novas funcionalidades discutidas.
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo e não somente as partes que devem ser modificadas.

---

# Código Fonte Selecionado do Projeto

Gerado automaticamente em: 8/1/2026, 9:58:07 PM

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
  "name": "Loco Proto 02 — Simple Push",
  "short_name": "Proto Simple Push",
  "start_url": "/index.html",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#006c4f"
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

## Arquivo: `src/sw/push.js`

```js
// src/sw/push.js
import { get, set, createStore } from "idb-keyval";
import { gunzipSync } from "fflate";

// ============================================================
// CONFIGURAÇÃO
// ============================================================
const DEBUG = false;  // se true, salva dadosJwt no IndexedDB

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

function serializarPublicKeyVapid(jwk) {
  // Apenas os campos essenciais para evitar tamanho excessivo
  return JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y });
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
    const key = serializarPublicKeyVapid(contato.publicKeyVapid);
    await set(key, contato, storeContatos);
    console.log(`[SW-PUSH] ✅ Contato ${contato.email} salvo com chave: ${key.substring(0, 30)}...`);
  } catch (err) {
    console.error(`[SW-PUSH] ❌ Erro ao salvar contato:`, err);
  }
}

async function buscarContatoPorPublicKey(publicKeyVapid) {
  try {
    garantirStores();
    const key = serializarPublicKeyVapid(publicKeyVapid);
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
      const nomeRemetente = jwtPayload.name || "Remetente";

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
      // SALVA CONTATO (se novo ou atualizado)
      // ============================================================
      if (publicKeyVapid && publicKeyRSA && subscription) {
        const novoContato = {
          publicKeyVapid: publicKeyVapid,
          email: emailRemetente,
          nome: nomeRemetente,
          publicKeyRSA: publicKeyRSA,
          subscription: subscription,
          vapidPrivateKey: vapidPrivateKey || '',
          homologado: homologado,
          createdAt: contato ? contato.createdAt : Date.now(),
          updatedAt: Date.now()
        };
        await salvarContato(novoContato);
        contato = novoContato;
      } else {
        console.warn("[SW-PUSH] ⚠️ Dados insuficientes para salvar contato. publicKeyVapid:", !!publicKeyVapid, "publicKeyRSA:", !!publicKeyRSA, "subscription:", !!subscription);
      }

      // ============================================================
      // SALVA MENSAGEM RECEBIDA
      // ============================================================
      const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const mensagemRecebida = {
        id: msgId,
        contatoPublicKeyVapid: publicKeyVapid ? serializarPublicKeyVapid(publicKeyVapid) : '',
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



console.log("[SW-PUSH] 📦 Módulo push carregado (com contatos, DEBUG=" + DEBUG + ")");
```

---

## Arquivo: `src/sw/click.js`

```js
// src/sw/click.js

self.addEventListener('notificationclick', function(event) {
  console.log("[SW-CLICK] 🔗 ===== CLIQUE NA NOTIFICAÇÃO DETECTADO =====");
  event.notification.close();
  const urlParaAbrir = new URL('/index.html', self.location.origin).href;
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(windowClients) {
        // Tenta focar uma janela existente
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (client.url === urlParaAbrir && 'focus' in client) {
            return client.focus();
          }
        }
        // Se nenhuma janela encontrada, abre uma nova
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlParaAbrir);
        }
      })
      .catch(function(err) {
        // Ignora erros de foco, pois a janela pode não estar disponível
        console.warn("[SW-CLICK] ⚠️ Não foi possível focar a janela:", err.message);
        // Tenta abrir uma nova janela se falhar
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlParaAbrir);
        }
      })
  );
});
```

---

## Arquivo: `src/constants/db.ts`

```ts
// src/constants/db.ts
export const DB_NAMES = {
  // Browser A (mantido apenas para compatibilidade com a identidade)
  IDENTIDADE_A: "BrowserA_Identidade_DB",
  BUNDLES_A: "BrowserA_Bundles_DB",
  MENSAGENS_ENVIO_A: "BrowserA_MensagensEnvio_DB",

  // Browser B
  CHAVES_E2E_B: "BrowserB_E2E_Chaves_DB",
  CHAVES_VAPID_B: "BrowserB_Vapid_DB",
  SUBSCRIPTION_B: "BrowserB_Subscription_DB",
  MENSAGENS_RECEBIDAS_B: "BrowserB_MensagensRecebidas_DB",
  CONTATOS: "BrowserB_Contatos_DB",
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
// Contatos
// ============================================================

export function serializarPublicKeyVapid(jwk: JsonWebKey): string {
  return JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y });
}

export async function salvarContato(contato: Contato): Promise<void> {
  const key = serializarPublicKeyVapid(contato.publicKeyVapid);
  await salvarChave(storeContatos, key, contato);
}

export async function buscarContatoPorPublicKey(publicKeyVapid: JsonWebKey): Promise<Contato | undefined> {
  const key = serializarPublicKeyVapid(publicKeyVapid);
  return buscarChave<Contato>(storeContatos, key);
}

export async function buscarContatoPorChave(chave: string): Promise<Contato | undefined> {
  return buscarChave<Contato>(storeContatos, chave);
}

export async function listarContatos(): Promise<Contato[]> {
  const entries = await listarChaves<Contato>(storeContatos);
  return entries.map(([_, c]) => c);
}

export async function homologarContato(publicKeyVapid: JsonWebKey): Promise<void> {
  const key = serializarPublicKeyVapid(publicKeyVapid);
  const contato = await buscarChave<Contato>(storeContatos, key);
  if (contato) {
    contato.homologado = true;
    contato.updatedAt = Date.now();
    await salvarChave(storeContatos, key, contato);
  }
}

export async function removerContato(publicKeyVapid: JsonWebKey): Promise<void> {
  const key = serializarPublicKeyVapid(publicKeyVapid);
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
    <title>Browser B - Emissor e Receptor</title>
    <link rel="manifest" href="/manifest.json">
    <style>
      body { font-family: system-ui, sans-serif; padding: 20px; color: #333; max-width: 900px; margin: 0 auto; }
      .container { background: #f4f4f4; padding: 15px; border-radius: 6px; margin-bottom: 20px; box-sizing: border-box; }
      .container-receptor { border-left: 5px solid #006c4f; }
      .container-emissor { border-left: 5px solid #002b3d; }
      .container-mensagens { border-left: 5px solid #ff6b00; }
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
      .status-badge-pendente { background: #fff3cd; color: #856404; }
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
      @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    </style>
  </head>
  <body>
    <h1>📬 Browser B - Emissor e Receptor</h1>
    <p style="color: #666; margin-bottom: 20px;">Receba mensagens e responda para outros Browser B.</p>

    <!-- ============================================================ -->
    <!-- PERFIL E MEU BUNDLE                                           -->
    <!-- ============================================================ -->
    <div class="container" style="border-left: 5px solid #006c4f; background: #f0f8f4;">
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
      <button id="btnGerarBundle" style="width: 100%;">📦 Gerar Meu Bundle (copie para outros)</button>

      <button id="btnVerificarBundle" class="btn-sm" style="margin-top: 5px;">🔍 Verificar Bundle</button>
      <button id="btnLimparSubscription" class="btn-sm danger" style="margin-top: 10px;">🗑️ Limpar Subscription</button>
      
      <div class="row mt-10">
        <div class="col">
          <label for="myPublicKeyB">Minha Chave Pública (para homologação manual):</label>
          <textarea id="myPublicKeyB" rows="3" readonly placeholder="Clique em 'Gerar Meu Bundle' primeiro..."></textarea>
          <button class="copy-btn btn-sm" data-target="myPublicKeyB">📋 Copiar Chave Pública</button>
        </div>
      </div>
      <div class="row mt-10">
        <div class="col">
          <label for="unifiedBundle">📦 Meu Bundle (copie e cole no emissor para receber mensagens):</label>
          <textarea id="unifiedBundle" rows="5" readonly placeholder="Aguardando geração..."></textarea>
          <button class="copy-btn btn-sm" data-target="unifiedBundle">📋 Copiar Bundle</button>
        </div>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- GUIA: RECEBER MENSAGENS                                       -->
    <!-- ============================================================ -->
    <div class="container container-receptor">
      <h2>📥 Receber Mensagens</h2>
      
      <div class="tabs">
        <button class="tab active" data-tab="homologar">🛡️ Homologar Emissores</button>
        <button class="tab" data-tab="mensagens-recebidas">📬 Mensagens Recebidas</button>
      </div>

      <!-- Tab: Homologar Emissores -->
      <div id="tab-homologar" class="tab-content active">
        <div class="row">
          <div class="col">
            <label for="senderPublicKeyJson">Cole aqui a Chave Pública do Emissor (para homologação manual):</label>
            <textarea id="senderPublicKeyJson" rows="3" placeholder='{"kty":"RSA","n":"...","e":"...","ownerName":"...","ownerEmail":"..."}'></textarea>
            <button id="btnSaveSenderIdentity">✅ Autorizar e Salvar Emissor</button>
          </div>
        </div>
        
        <div class="mt-10">
          <label>📋 Emissores Autorizados:</label>
          <div id="listaEmissoresB" style="max-height: 150px; overflow-y: auto; background: white; padding: 10px; border-radius: 4px; border: 1px solid #ddd;">
            <p style="color: #666; font-size: 14px;">Nenhum emissor homologado ainda.</p>
          </div>
        </div>
      </div>

      <!-- Tab: Mensagens Recebidas -->
      <div id="tab-mensagens-recebidas" class="tab-content">
        <div class="flex mb-10">
          <span><strong>📬 Mensagens Recebidas</strong></span>
          <div class="flex-end">
            <button id="btnCarregarMensagens" class="btn-sm">🔄 Atualizar</button>
            <button id="btnLimparLidas" class="btn-sm danger">🗑️ Remover Lidas</button>
            <button id="btnHomologarTodas" class="btn-sm homologar-btn">🔄 Homologar Todas</button>
          </div>
        </div>
        <div id="mensagensRecebidas">
          <p style="color: #666;">Nenhuma mensagem recebida ainda.</p>
        </div>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- GUIA: ENVIAR MENSAGENS                                        -->
    <!-- ============================================================ -->
    <div class="container container-emissor">
      <h2>📤 Enviar Mensagens</h2>
      
      <div class="tabs">
        <button class="tab active" data-tab="enviar">✉️ Enviar Nova Mensagem</button>
        <button class="tab" data-tab="mensagens-enviadas">📤 Histórico de Envio</button>
      </div>

      <!-- Tab: Enviar Nova Mensagem -->
      <div id="tab-enviar" class="tab-content active">
        <label for="bundleDestinoB">1. Cole o Bundle do Destinatário (gerado por outro Browser B):</label>
        <textarea id="bundleDestinoB" rows="4" placeholder="Cole aqui o bundle do destinatário..."></textarea>
        
        <label for="tituloMensagemB">2. Título:</label>
        <input type="text" id="tituloMensagemB" value="Nova mensagem" placeholder="Digite o título..." />
        
        <label for="mensagemEnvioB">3. Mensagem:</label>
        <textarea id="mensagemEnvioB" rows="3" placeholder="Escreva sua mensagem aqui..."></textarea>
        
        <button id="btnEnviarB" class="send-btn">🚀 Enviar Mensagem</button>
      </div>

      <!-- Tab: Mensagens Enviadas -->
      <div id="tab-mensagens-enviadas" class="tab-content">
        <div class="flex mb-10">
          <span><strong>📤 Mensagens Enviadas</strong></span>
          <div class="flex-end">
            <button id="btnCarregarEnviadasB" class="btn-sm">🔄 Atualizar</button>
            <button id="btnLimparEnviadasB" class="btn-sm danger">🗑️ Limpar Enviadas</button>
          </div>
        </div>
        <div id="mensagensEnviadasB">
          <p style="color: #666;">Nenhuma mensagem enviada ainda.</p>
        </div>
      </div>
    </div>

    <!-- 🔥 Ponto de entrada atualizado para app.tsx -->
    <script src="./app.tsx" type="module"></script>
  </body>
</html>
```

---

## Arquivo: `src/app.tsx`

```tsx
// src/sw/click.js

self.addEventListener('notificationclick', function(event) {
  console.log("[SW-CLICK] 🔗 ===== CLIQUE NA NOTIFICAÇÃO DETECTADO =====");
  event.notification.close();
  const urlParaAbrir = new URL('/index.html', self.location.origin).href;
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(windowClients) {
        // Primeiro, tenta focar uma janela existente
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (client.url === urlParaAbrir && 'focus' in client) {
            try {
              return client.focus();
            } catch (err) {
              console.warn("[SW-CLICK] Não foi possível focar a janela:", err);
              // Se falhar, tenta abrir uma nova
              break;
            }
          }
        }
        // Se não encontrou janela ou não conseguiu focar, abre uma nova
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlParaAbrir).catch(err => {
            console.warn("[SW-CLICK] Não foi possível abrir janela:", err);
          });
        }
      })
  );
});
```

---

## Arquivo: `deno.json`

```json
{
  "extends": "../../deno.json",
  "imports": {
    "@negrel/webpush": "jsr:@negrel/webpush@^0.5.0"
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

## Arquivo: `build.ts`

```ts
/// <reference lib="deno.ns" />
import { ensureDir, copy } from "@std/fs";
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
  const assets: string[] = [];
  const exclude = new Set(['service-worker.js', 'service-worker.tmp.js']);
  for await (const entry of Deno.readDir(DIST_DIR)) {
    if (entry.isFile && !entry.name.endsWith(".map") && !exclude.has(entry.name)) {
      assets.push(`/${entry.name}`);
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
  const assetsArrayString = assets.map(asset => `"${asset}"`).join(", ");
  swCode = swCode.replace(/VERSION_HASH/g, versionHash);
  swCode = swCode.replace(/__GENERATED_ASSETS__/g, assetsArrayString);

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

