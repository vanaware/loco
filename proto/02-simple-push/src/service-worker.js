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

