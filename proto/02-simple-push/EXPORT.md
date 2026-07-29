> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém múltiplos arquivos do meu projeto estruturados em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Analise a estrutura de pastas, as dependências e o código fornecido para indicar as mudanças necessárias para a implementação das novas funcionalidades discutidas.
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo e não somente as partes que devem ser modificadas.

---

# Código Fonte Selecionado do Projeto

Gerado automaticamente em: 7/29/2026, 1:57:58 PM

---

## Arquivo: `main.ts`

```ts
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

// Escaneia a pasta dist/ após o build das páginas e cria o Service Worker estático com os caches injetados
async function processarEGravarServiceWorker() {
  const srcSwPath = join(SRC_DIR, "service-worker.js");
  const distSwPath = join(DIST_DIR, "service-worker.js");

  try {
    const assetsEncontrados: string[] = [];


    // 1. Vasculha a pasta dist/ para mapear todos os arquivos gerados com hash pelas páginas HTML
    for await (const entry of Deno.readDir(DIST_DIR)) {
      // Mapeia todos os arquivos gerados, ignorando mapas de desenvolvimento (.map)
      if (entry.isFile && !entry.name.endsWith(".map")) {
        assetsEncontrados.push(`/${entry.name}`);
      }
    }
    console.log("📦 Arquivos mapeados para o Cache Offline:", assetsEncontrados);

    // 2. Cria uma versão única baseada no timestamp atual para estourar o cache antigo
    const uniqueVersion = Date.now().toString(); 

    // 3. Converte o array do JavaScript em uma string formatada para injeção no array
    const assetsArrayString = assetsEncontrados.map(asset => `"${asset}"`).join(", ");

    // 4. CORREÇÃO DA ROTA: Lê o arquivo direto da pasta de ORIGEM (src/) para evitar erros de NotFound
    let swCode = await Deno.readTextFile(srcSwPath);

    // 5. Faz as substituições cirúrgicas nos placeholders do service-worker original
    swCode = swCode.replace("VERSION_HASH", uniqueVersion);
    swCode = swCode.replace("__GENERATED_ASSETS__", assetsArrayString);

    // 6. Grava o Service Worker definitivo diretamente na raiz de dist/ com o nome fixo perfeito
    await Deno.writeTextFile(distSwPath, swCode);
    console.log(`✨ Service Worker gerado com nome fixo e cache versionado para: v_${uniqueVersion}`);
  } catch (err) {
    console.error("⚠️ Falha ao processar ou gravar o Service Worker:", err);
  }
}

async function build() {
  console.log("\n🚀 Iniciando build do protótipo...\n");
  const start = performance.now();

  await clean();
  await copyStatic();

  // @ts-ignore: Deno.bundle é instável, usamos o fallback seguro do namespace se disponível
  const bundleFn = (Deno as any).bundle;

  if (!bundleFn) {
    throw new Error("A API Deno.bundle não está disponível. Execute com a flag --unstable-bundle");
  }

  // 1. Build das páginas HTML principais (Grava os arquivos JS com hash físicos na pasta dist/)
  await bundleFn({
    entrypoints: [
      join(SRC_DIR, "browser-a.html"),
      join(SRC_DIR, "browser-b.html")
    ],
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

  // 2. Processa o Service Worker lendo da origem, injetando os JS com hash descobertos na etapa 1 e salvando em dist/
  await processarEGravarServiceWorker();

  const elapsed = (performance.now() - start).toFixed(0);
  console.log(`\n✨ Build completo em ${elapsed}ms → ${DIST_DIR}/\n`);
}

await build();

```

---

## Arquivo: `public/manifest.json`

```json
{
  "name": "Loco Proto 02 — Simple Push",
  "short_name": "Proto Simple Push",
  "start_url": "/browser-b.html",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#006c4f"
}

```

---

## Arquivo: `src/browser-b.html`

```html
<!-- browser-b.html -->
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Browser B - Gerador de Carga</title>
    <link rel="manifest" href="/manifest.json">
    <style>
      textarea { width: 100%; max-width: 600px; padding: 8px; font-family: monospace; box-sizing: border-box; }
      button { padding: 10px; font-weight: bold; cursor: pointer; margin-top: 10px; }
    </style>
  </head>
  <body>
    <h1>Browser B - Emissor de Token Unificado</h1>
    <label>Copie o bloco de configuração abaixo:</label><br />
    <textarea id="unifiedBundle" rows="12" readonly placeholder="Aguardando geração..."></textarea><br />
    <button id="btnCopy">Copiar Tudo de Uma Vez</button>
    <br />
    <button id="btnInstall" style="display: none; background-color: #006c4f; color: white; padding: 12px; font-size: 16px; border: none; border-radius: 4px; width: 100%; max-width: 600px; margin-bottom: 20px;">
      ➕ Instalar Aplicativo no Dispositivo
    </button>

    <script src="./browser-b.tsx" type="module"></script>
  </body>
</html>

```

---

## Arquivo: `src/browser-a.html`

```html
<!-- browser-a.html -->
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Browser A - Disparador Simplificado</title>
    <link rel="manifest" href="/manifest.json">
    <style>
      textarea { width: 100%; max-width: 600px; padding: 8px; box-sizing: border-box; margin-bottom: 15px; }
      button { padding: 10px 20px; font-weight: bold; cursor: pointer; }
    </style>
  </head>
  <body>
    <h1>Browser A - Disparador de Notificação</h1>
    
    <label>1. Cole o Bloco Unificado aqui (obtido no Browser B):</label><br />
    <textarea id="unifiedBundle" rows="6" placeholder="Cole o JSON grande gerado pelo browser-b aqui..."></textarea><br />
    
    <label>2. Digite o texto da Mensagem:</label><br />
    <textarea id="message" rows="3" placeholder="Escreva o conteúdo da notificação..."></textarea><br />
    
    <button id="btnSend">Enviar Notificação Instantânea</button>
    
    <script src="./browser-a.tsx" type="module"></script>
  </body>
</html>

```

---

## Arquivo: `src/service-worker.js`

```js
// src/service-worker.js

const CACHE_VERSION = "VERSION_HASH";
const CACHE_NAME = `loco-proto-cache-${CACHE_VERSION}`;

const ASSETS_TO_CACHE = [__GENERATED_ASSETS__];

// 1. EVENTO DE INSTALAÇÃO
self.addEventListener("install", (event) => {
  console.log("[SW] 🛠️ Instalando novo Service Worker...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] 📦 Armazenando assets essenciais no cache local...");
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// 2. EVENTO DE ATIVAÇÃO
self.addEventListener("activate", (event) => {
  console.log("[SW] ✨ Ativando Service Worker e limpando caches antigos...");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log(`[SW] 🗑️ Removendo cache obsoleto: ${cache}`);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// 3. EVENTO FETCH
self.addEventListener("fetch", (event) => {
  if (!event.request.url.startsWith(self.location.origin) || event.request.url.includes("/api/")) {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        console.log(`[SW] 🔌 Usuário Offline. Servindo do cache: ${event.request.url}`);
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

// 4. EVENTO PUSH
self.addEventListener('push', function(event) {
  console.log("[SW] 📩 ===== PUSH EVENT RECEBIDO =====");
  if (!event.data) return;

  const rawText = event.data.text();
  let data = { title: "Mensagem", body: "" };

  try {
    data = JSON.parse(rawText);
  } catch (_err) {
    data.body = rawText;
  }

  const notificationTitle = data.title || "Nova Notificação";
  const notificationBody = data.body || rawText || "Sem conteúdo";

  const options = {
    body: notificationBody,
    icon: '/icon.png',
    badge: '/icon.png',
    data: data,
    vibrate: [200, 100, 200],
    sound: '/notification-sound.mp3'
  };

  event.waitUntil(
    self.registration.showNotification(notificationTitle, options)
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: "PUSH_RECEIVED", payload: data });
        });
      })
  );
});

// 5. EVENTO CLICK
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const urlParaAbrir = new URL('/browser-b.html', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(windowClients) {
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (client.url === urlParaAbrir && 'focus' in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlParaAbrir);
        }
      })
  );
});

// Função para abrir o IndexedDB de dentro do Worker
function abrirBancoDBWorker() {
  return new Promise((resolve, reject) => {
    // Usamos a API global indexDB disponível no escopo do Service Worker
    const request = indexedDB.open("PushSyncDB", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// 1. ESCUTA O RETORNO DA CONEXÃO À INTERNET
self.addEventListener('sync', function(event) {
  console.log(`[SW] 🔄 Sincronização em segundo plano disparada! Tag: ${event.tag}`);

  if (event.tag === 'sync-push-notifications') {
    // Força o navegador a manter o SW vivo até processar todas as mensagens da fila
    event.waitUntil(enviarMensagensPendentes());
  }
});

async function enviarMensagensPendentes() {
  try {
    const db = await abrirBancoDBWorker();
    
    // Captura as mensagens salvas na tabela
    const tx = db.transaction("fila_disparos", "readonly");
    const store = tx.objectStore("fila_disparos");
    
    const request = store.getAll();
    const disparosPendentes = await new Promise((res) => request.onsuccess = () => res(request.result));

    if (!disparosPendentes || disparosPendentes.length === 0) {
      console.log("[SW] ℹ️ Nenhuma mensagem pendente na fila.");
      return;
    }

    console.log(`[SW] 📦 Processando ${disparosPendentes.length} push(es) pendentes da fila...`);
    let totalSucesso = 0;

    // Loop de transmissão
    for (const payload of disparosPendentes) {
      try {
        const response = await fetch("/api/proxy-push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          totalSucesso++;
          console.log(`[SW] ✅ Mensagem enviada com sucesso ao servidor!`);
          
          // Remove da fila local
          const deleteTx = db.transaction("fila_disparos", "readwrite");
          deleteTx.objectStore("fila_disparos").delete(payload.id);
        }
      } catch (fetchErr) {
        console.error("[SW] ❌ Falha ao tentar postar da fila. Reagendando...", fetchErr);
        throw fetchErr; // Aborta para o navegador tentar em um momento de rede mais estável
      }
    }

    // 🔥 DISPARA A NOTIFICAÇÃO VISUAL DE CONFIRMAÇÃO SE ENVIAR ALGO
    if (totalSucesso > 0) {
      const plural = totalSucesso > 1 ? "s" : "";
      const mensagemCorpo = totalSucesso > 1 
        ? `${totalSucesso} mensagens que estavam travadas foram transmitidas.`
        : "A mensagem acumulada em modo offline foi transmitida.";

      await self.registration.showNotification("✨ Conexão Restaurada!", {
        body: `Sua${plural} notificação${plural} offline foi${plural} enviada${plural} com sucesso!`,
        icon: '/icon.png',
        badge: '/icon.png',
        tag: 'sync-success-tag', // Tag única para não misturar com as mensagens normais
        vibrate:, // Vibração curta de confirmação
        data: { url: '/browser-a.html' }
      });
      
      console.log(`[SW] 📢 Notificação de sucesso exibida para o usuário (${totalSucesso} enviadas).`);
    }

  } catch (err) {
    console.error("[SW] ⚠️ Falha ao processar o envio de fundo:", err);
  }
}


```

---

## Arquivo: `src/browser-a.tsx`

```tsx
// src/browser-a.tsx

// Função auxiliar nativa para abrir o banco de dados IndexedDB
function abrirBancoDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("PushSyncDB", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("fila_disparos", { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function sendMessage() {
  const bundleRaw = (document.getElementById('unifiedBundle') as HTMLTextAreaElement).value;
  const message = (document.getElementById('message') as HTMLTextAreaElement).value;

  try {
    const bodyPayload = JSON.parse(bundleRaw);
    bodyPayload.payloadText = JSON.stringify({ title: "Mensagem", body: message });

    // 1. Verifica se o navegador está online. Se sim, tenta o envio direto
    if (navigator.onLine) {
      const response = await fetch("/api/proxy-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload)
      });
      if (response.ok) {
        alert("Mensagem enviada de forma direta!");
        return;
      }
    }

    // 2. Se falhar ou estiver OFFLINE, entra a Background Sync API
    console.log("🔌 Dispositivo offline ou falha de rede. Agendando sincronização de fundo...");
    
    // Salva o payload completo no IndexedDB
    const db = await abrirBancoDB();
    const tx = db.transaction("fila_disparos", "readwrite");
    tx.objectStore("fila_disparos").add(bodyPayload);

    // Registra a tarefa de sincronização no Service Worker
    const registration = await navigator.serviceWorker.ready;
    
    if ('sync' in registration) {
      // Registra a tag de sincronização que o SW vai escutar
      await (registration as any).sync.register('sync-push-notifications');
      alert("Você está offline! A mensagem foi salva e será enviada sozinha assim que a internet voltar.");
    } else {
      // Fallback caso o navegador não tenha a Sync API (ex: Safari desktop antigo)
      alert("Seu navegador não suporta Background Sync. Conecte-se para enviar.");
    }

  } catch (err) {
    console.error(err);
    alert(`Erro no processo: ${(err as Error).message}`);
  }
}

document.getElementById("btnSend")?.addEventListener("click", sendMessage);

```

---

## Arquivo: `src/browser-b.tsx`

```tsx
// src/browser-b.tsx

function copyToClipboard(id: string): void {
  const input = document.getElementById(id) as HTMLInputElement;
  if (input) {
    input.select();
    document.execCommand('copy');
    alert(`Carga unificada copiada com sucesso!`);
  }
}

async function generateVAPIDKeys(): Promise<CryptoKeyPair> {
  return await window.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
}

function rawBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function subscribeToPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    alert("Service Workers não são suportados.");
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("./service-worker.js");
    await navigator.serviceWorker.ready;

    const vapidKeyPair = await generateVAPIDKeys();
    const rawPublicKey = await window.crypto.subtle.exportKey("raw", vapidKeyPair.publicKey);
    
    const publicKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.publicKey);
    const privateKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.privateKey);

    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
      await existingSubscription.unsubscribe();
    }

    const subscription = await registration.pushManager.subscribe({
      applicationServerKey: new Uint8Array(rawPublicKey),
      userVisibleOnly: true
    });

    const p256dhBuffer = subscription.getKey('p256dh');
    const authBuffer = subscription.getKey('auth');

    // Monta o bloco de assinatura
    const customSubscriptionJson = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: rawBufferToBase64Url(p256dhBuffer),
        auth: rawBufferToBase64Url(authBuffer)
      }
    };

    // Monta o bloco de credenciais de identificação
    const vapidJson = {
      subject: `mailto:john@example.com`,
      publicKey: publicKeyJwk,
      privateKey: privateKeyJwk
    };

    // 🔥 A MÁGICA: Prepara o payload completo, deixando um placeholder para a mensagem
    const finalPayloadBundle = {
      subscription: customSubscriptionJson,
      vapid: vapidJson,
      payloadText: "" // O browser-a vai preencher isso dinamicamente antes do POST
    };

    const textarea = document.getElementById('unifiedBundle') as HTMLTextAreaElement;
    if (textarea) {
      textarea.value = JSON.stringify(finalPayloadBundle);
    }

    console.log("🚀 Payload unificado gerado prontinho para o Browser A!");

  } catch (err) {
    console.error(err);
    alert("Falha ao se inscrever.");
  }
}

subscribeToPush();

document.getElementById("btnCopy")?.addEventListener("click", () => {
  copyToClipboard("unifiedBundle");
});

// Este trecho fica dentro do browser-a.tsx ou browser-b.tsx
navigator.serviceWorker.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PUSH_RECEIVED') {
    console.log("Recebi dados do Service Worker na página aberta!", event.data.payload);
    // Aqui você pode atualizar uma lista de mensagens na tela dinamicamente
  }
});


let deferredPrompt: any = null;
const btnInstall = document.getElementById('btnInstall');

// 1. Escuta o sinal do navegador dizendo que o app está pronto para ser instalado
window.addEventListener('beforeinstallprompt', (e) => {
  // Previne que o navegador mostre o banner padrão feio dele
  e.preventDefault();
  // Guarda o evento na memória para disparar no clique do nosso botão
  deferredPrompt = e;
  
  // Mostra o nosso botão customizado na tela
  if (btnInstall) {
    btnInstall.style.display = 'block';
  }
  console.log("ℹ️ O PWA atende aos critérios e está pronto para instalação!");
});

// 2. Controla o clique no botão de instalação
btnInstall?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  
  // Mostra a caixinha nativa de confirmação ("Deseja instalar o app?")
  deferredPrompt.prompt();
  
  // Espera a resposta do usuário
  const { outcome } = await deferredPrompt.userChoice;
  console.log(`👤 Usuário respondeu à instalação com: ${outcome}`);
  
  // Limpa o prompt da memória, ele só pode ser usado uma vez
  deferredPrompt = null;
  
  // Oculta o botão novamente
  btnInstall.style.display = 'none';
});

// 3. Opcional: detecta se o app foi instalado com sucesso
window.addEventListener('appinstalled', () => {
  console.log('🎉 Aplicativo instalado com sucesso no sistema operacional!');
  deferredPrompt = null;
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
    "build": "deno run --allow-read --allow-write --allow-env --allow-net --unstable-bundle build.ts",
    "start": "deno run --allow-all main.ts",
    "clean": "rm -rf dist && mkdir -p dist",
    "copy:static": "cp -r public/* dist/",
    "build:html": "deno bundle --platform=browser --outdir dist/ src/browser-a.html src/browser-b.html",
    "build:sw": "deno bundle --platform=browser -o dist/service-worker.js src/service-worker.js",
    "buildnow": "deno task clean && deno task copy:static && deno task build:html && deno task build:sw",
    "export": "deno run --allow-read --allow-write export.ts"
  }
}

```

---

