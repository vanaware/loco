// src/service-worker.js
import { get, del, entries, createStore } from "idb-keyval";

const CACHE_VERSION = "VERSION_HASH";
const CACHE_NAME = `loco-proto-cache-${CACHE_VERSION}`;

// O script de build vai injetar a lista dentro deste array substituindo o texto de forma dinâmica
const ASSETS_TO_CACHE = [__GENERATED_ASSETS__];

// 🔥 CORREÇÃO CRUCIAL: Inicializa as funções de store legítimas aceitas pelo idb-keyval compilado
const storeChavesE2E = createStore("BrowserB_E2E_Chaves_DB", "keyval");
const storeListaBranca = createStore("BrowserB_ListaBranca_DB", "keyval");
const storeFilaDisparosA = createStore("BrowserA_OfflineFila_DB", "keyval");

// ==========================================
// 1. EVENTO DE INSTALAÇÃO (Ciclo de Vida)
// ==========================================
self.addEventListener("install", (event) => {
  console.log("[SW] 🛠️ Instalando novo Service Worker...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] 📦 Armazenando assets essenciais no cache local...");
      return Promise.all(
        ASSETS_TO_CACHE.map((url) => {
          return cache.add(url).catch((err) => {
            console.error(`[SW] ❌ Falha ao cachear recurso: ${url}`, err);
          });
        })
      );
    }).then(() => self.skipWaiting())
  );
});

// ==========================================
// 2. EVENTO DE ATIVAÇÃO (Limpeza de Cache)
// ==========================================
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
    }).then(() => self.clients.claim())
  );
});

// ==========================================
// 3. EVENTO FETCH (Suporte Offline)
// ==========================================
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

// ==========================================
// 4. EVENTO PUSH (Fatiamento JWT e Decriptografia)
// ==========================================
self.addEventListener('push', function(event) {
  console.log("[SW] 📩 ===== PUSH EVENT RECEBIDO =====");
  if (!event.data) return;

  const rawText = event.data.text();
  console.log("[SW] 📦 Texto bruto recebido do push:", rawText);

  if (rawText.split('.').length !== 3) {
    console.log("[SW] ℹ️ Carga não segue o padrão JWT. Exibindo como texto bruto (DevTools).");
    event.waitUntil(
      self.registration.showNotification("Notificação de Teste", {
        body: rawText,
        icon: '/icon.png',
        badge: '/icon.png'
      })
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
      const emailRemetente = jwtPayload.iss;
      const nomeRemetente = jwtPayload.name || "Remetente Autorizado";

      console.log(`[SW] 🔐 Analisando assinatura JWT de: ${nomeRemetente} <${emailRemetente}>`);

      // 🔥 AGORA SUCESSO: A chamada get recebe uma instância executável real gerada pelo createStore
      const emissorHomologado = await get(emailRemetente, storeListaBranca);

      if (!emissorHomologado) {
        throw new Error(`O remetente "${emailRemetente}" não foi cadastrado na lista branca deste dispositivo.`);
      }

      const keyVerifyA = await crypto.subtle.importKey(
        "jwk", emissorHomologado.jwk, { name: "RSA-PSS", hash: "SHA-256" }, true, ["verify"]
      );

      let b64Sig = signatureB64Url.replace(/-/g, '+').replace(/_/g, '/');
      while (b64Sig.length % 4) b64Sig += '=';
      const signatureBytes = new Uint8Array([...atob(b64Sig)].map(c => c.charCodeAt(0)));
      const tokenStringWithoutSignature = `${headerB64Url}.${payloadB64Url}`;

      const isSignatureValid = await crypto.subtle.verify(
        { name: "RSA-PSS", saltLength: 32 }, keyVerifyA, signatureBytes, encoder.encode(tokenStringWithoutSignature)
      );

      if (!isSignatureValid) {
        throw new Error("A assinatura digital do token falhou! O conteúdo foi violado.");
      }
      console.log("[SW] 🛡️ Assinatura digital do JWT homologada com sucesso!");

      // Carrega a chave CryptoKey de decodificação usando a store legítima
      const privateDecryptKey = await get("minha_decript_key", storeChavesE2E);

      if (!privateDecryptKey) throw new Error("Sua chave privada RSA de decodificação não foi encontrada.");

      const encryptedBytes = new Uint8Array(jwtPayload.cipherText.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "RSA-OAEP" }, privateDecryptKey, encryptedBytes
      );
      const textoOriginal = decoder.decode(decryptedBuffer);
      console.log("[SW] 🔓 Conteúdo do JWT aberto com sucesso!");

      await self.registration.showNotification(`📥 De: ${nomeRemetente}`, {
        body: textoOriginal,
        icon: '/icon.png',
        badge: '/icon.png',
        vibrate: [200, 100, 200],
        data: jwtPayload
      });

      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach((client) => {
        client.postMessage({ type: "PUSH_RECEIVED", payload: { title: nomeRemetente, body: textoOriginal } });
      });

    } catch (jwtError) {
      console.error("[SW] ❌ Falha crítica no pipeline de segurança:", jwtError.message);
      await self.registration.showNotification("⚠️ Bloqueio de Segurança", {
        body: jwtError.message || "Assinatura corrompida ou remetente não autorizado.",
        icon: '/icon.png'
      });
    }
  }());
});

// ==========================================
// 5. EVENTO SYNC (Processamento Offline Background)
// ==========================================
self.addEventListener('sync', function(event) {
  console.log(`[SW] 🔄 Sincronização em segundo plano disparada! Tag: ${event.tag}`);
  if (event.tag === 'sync-push-notifications') {
    event.waitUntil(enviarMensagensPendentes());
  }
});

async function enviarMensagensPendentes() {
  try {
    const todasAsChavesFila = await entries(storeFilaDisparosA);
    if (!todasAsChavesFila || todasAsChavesFila.length === 0) {
      console.log("[SW] ℹ️ Nenhuma mensagem pendente na fila de sincronização.");
      return;
    }

    console.log(`[SW] 📦 Encontrados ${todasAsChavesFila.length} push(es) pendentes para enviar...`);
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
          console.log(`[SW] ✅ Mensagem enviada com sucesso ao servidor!`);
          await del(id, storeFilaDisparosA);
        } else {
          console.error("[SW] ❌ Servidor rejeitou o POST da fila. Mantendo no banco.");
        }
      } catch (fetchErr) {
        console.error("[SW] ❌ Falha de rede ao despachar da fila. Agendando nova tentativa...", fetchErr);
        throw fetchErr;
      }
    }

    if (totalSucesso > 0) {
      await self.registration.showNotification("✨ Conexão Restaurada!", {
        body: "Sua fila de notificações offline foi transmitida com sucesso!",
        icon: '/icon.png',
        badge: '/icon.png',
        vibrate: [200, 100, 200]
      });
      console.log(`[SW] 📢 Alerta de sucesso exibido (${totalSucesso} enviadas).`);
    }
  } catch (err) {
    console.error("[SW] ⚠️ Falha ao processar o envio de fundo:", err);
  }
}

// ==========================================
// 6. EVENTO CLICK (Foco e Redirecionamento)
// ==========================================
self.addEventListener('notificationclick', function(event) {
  console.log("[SW] 🔗 ===== CLIQUE NA NOTIFICAÇÃO DETECTADO =====");
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
}));});