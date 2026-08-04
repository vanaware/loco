> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém múltiplos arquivos do meu projeto estruturados em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Analise a estrutura de pastas, as dependências e o código fornecido para indicar as mudanças necessárias para a implementação das novas funcionalidades discutidas.
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo e não somente as partes que devem ser modificadas.

---

# Código Fonte Selecionado do Projeto

Gerado automaticamente em: 8/3/2026, 11:03:08 PM

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

## Arquivo: `src/sw/sw-mensagens.js`

```js
// src/sw/sw-mensagens.js
import { get, set, createStore, del, entries } from "idb-keyval";
import { gunzipSync, gzipSync } from "fflate";
import { MAX_TENTATIVAS } from "../constants/db.ts";
import { arrayBufferToBase64Url, criarJWT } from "../utils/jwt-helpers.ts";

// 🔥 Constantes
const DB_NAMES = {
  MENSAGENS_ENVIADAS: "BrowserA_MensagensEnviadas_DB",
  MENSAGENS_RECEBIDAS_B: "BrowserB_MensagensRecebidas_DB",
  CONTATOS: "BrowserB_Contatos_DB",
  CONFIG: "AppConfig_DB",
};

const STORE_NAMES = {
  KEYVAL: "keyval",
};

const KEY_NAMES = {
  PROFILE: "profile",
};

// 🔥 Cria as stores
const storeMensagensEnviadas = createStore(DB_NAMES.MENSAGENS_ENVIADAS, STORE_NAMES.KEYVAL);
const storeMensagensRecebidasB = createStore(DB_NAMES.MENSAGENS_RECEBIDAS_B, STORE_NAMES.KEYVAL);
const storeContatos = createStore(DB_NAMES.CONTATOS, STORE_NAMES.KEYVAL);
const storeConfig = createStore(DB_NAMES.CONFIG, STORE_NAMES.KEYVAL);

console.log("[SW-MSG] ✅ Stores criadas com sucesso!");

// ============================================================
// FUNÇÕES AUXILIARES PARA CONTATOS E PERFIL
// ============================================================
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

async function buscarContatoPorChave(chaveOuJwk) {
  try {
    let key;
    if (typeof chaveOuJwk === 'string') {
      key = chaveOuJwk;
    } else if (chaveOuJwk && chaveOuJwk.kty) {
      key = await serializarPublicKeyVapid(chaveOuJwk);
    } else {
      return null;
    }
    return await get(key, storeContatos) || null;
  } catch {
    return null;
  }
}

async function buscarProfile() {
  try {
    return await get(KEY_NAMES.PROFILE, storeConfig);
  } catch {
    return null;
  }
}

async function salvarProfile(profile) {
  try {
    await set(KEY_NAMES.PROFILE, profile, storeConfig);
    console.log("[SW-MSG] ✅ Perfil atualizado com sucesso.");
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao salvar perfil:", err);
  }
}

// ============================================================
// FUNÇÕES DE BANCO PARA MENSAGENS ENVIADAS
// ============================================================
async function salvarMensagemEnviada(mensagem) {
  try {
    await set(mensagem.id, mensagem, storeMensagensEnviadas);
    console.log(`[SW-MSG] 💾 Mensagem ${mensagem.id} salva.`);
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao salvar mensagem ${mensagem.id}:`, err);
  }
}

async function buscarMensagemEnviada(id) {
  try {
    return await get(id, storeMensagensEnviadas);
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao buscar mensagem ${id}:`, err);
    return null;
  }
}

async function listarMensagensEnviadasPorStatus(status) {
  try {
    const todas = await listarMensagensEnviadas();
    return todas.filter(m => m.status === status);
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao listar mensagens por status:", err);
    return [];
  }
}

async function listarMensagensEnviadas() {
  try {
    const entriesList = await entries(storeMensagensEnviadas);
    return entriesList.map(([_, msg]) => msg);
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao listar mensagens:", err);
    return [];
  }
}

async function atualizarStatusMensagemEnviada(id, status, erro) {
  try {
    const mensagem = await buscarMensagemEnviada(id);
    if (mensagem) {
      mensagem.status = status;
      mensagem.updatedAt = Date.now();
      if (erro) mensagem.erro = erro;
      await salvarMensagemEnviada(mensagem);
      console.log(`[SW-MSG] ✅ Mensagem ${id} atualizada para status: ${status}`);
    }
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao atualizar mensagem ${id}:`, err);
  }
}

async function removerMensagemEnviada(id) {
  try {
    await del(id, storeMensagensEnviadas);
    console.log(`[SW-MSG] ✅ Mensagem ${id} removida`);
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao remover mensagem ${id}:`, err);
  }
}

// ============================================================
// UTILITÁRIOS DE CRIPTOGRAFIA
// ============================================================
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Função para cifrar a chave VAPID (usada apenas se o envelope não existir)
async function cifrarChaveVapid(privateKeyJwk, serverPublicKeyJwk) {
  const serverKey = await crypto.subtle.importKey(
    "jwk",
    serverPublicKeyJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const vapidBytes = encoder.encode(JSON.stringify(privateKeyJwk));
  const vapidCifrado = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    vapidBytes
  );
  const aesKeyRaw = await crypto.subtle.exportKey("raw", aesKey);
  const aesKeyCifrado = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    serverKey,
    aesKeyRaw
  );
  const toHex = (buf) =>
    Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  const envelope = {
    iv: toHex(iv.buffer),
    dadosCifrados: toHex(vapidCifrado),
    chaveAesCifrada: toHex(aesKeyCifrado)
  };
  return btoa(JSON.stringify(envelope));
}

async function cifrarPayloadObj(payloadObj, publicKeyRSA) {
  const encoder = new TextEncoder();
  const jsonString = JSON.stringify(payloadObj);
  const bytes = encoder.encode(jsonString);
  const compressed = gzipSync(bytes);
  console.log(`[SW-MSG] 📦 Comprimido: ${compressed.length} bytes (original: ${bytes.length})`);

  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    compressed
  );

  const cryptoKeyDestino = await crypto.subtle.importKey(
    "jwk",
    publicKeyRSA,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );
  const aesKeyRaw = await crypto.subtle.exportKey("raw", aesKey);
  const aesKeyEncrypted = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    cryptoKeyDestino,
    aesKeyRaw
  );

  return {
    i: arrayBufferToBase64(iv.buffer),
    d: arrayBufferToBase64(encryptedBuffer),
    k: arrayBufferToBase64(aesKeyEncrypted)
  };
}

// ============================================================
// FUNÇÃO PRINCIPAL: PROCESSAR FILA DE ENVIO
// ============================================================
async function processarFilaEnvio() {
  console.log("[SW-MSG] 🔄 Processando fila de envio...");

  try {
    const pendentes = await listarMensagensEnviadasPorStatus('pendente');
    const enviandoAntigos = (await listarMensagensEnviadasPorStatus('enviando'))
      .filter(m => (Date.now() - m.updatedAt) > 30000);

    const paraProcessar = [...pendentes, ...enviandoAntigos];

    if (paraProcessar.length === 0) {
      console.log("[SW-MSG] ℹ️ Nenhuma mensagem pendente para enviar.");
      return;
    }

    console.log(`[SW-MSG] 📦 ${paraProcessar.length} mensagens para processar`);

    for (const msg of paraProcessar) {
      await atualizarStatusMensagemEnviada(msg.id, 'enviando');

      try {
        // 1. Buscar contato e perfil
        const contato = await buscarContatoPorChave(msg.contatoHash);
        let profile = await buscarProfile();

        if (!contato) throw new Error("Contato não encontrado");
        if (!profile) throw new Error("Perfil não encontrado");

        // 2. Validações
        if (!profile.e2ePublicKey || !profile.vapidPublicKey || !profile.vapidPrivateKeyJwk) {
          throw new Error("Usuário não logado (sem Chaves)");
        }
        if (!profile.subscription) {
          throw new Error("Mensagens Web Push não configurada (sem Subscription)");
        }
        if (!contato.publicKeyRSA || !contato.publicKeyVapid || !contato.vapidPrivateKey) {
          throw new Error("Contato sem Chaves");
        }
        if (!contato.subscription) {
          throw new Error("Contato sem Subscription");
        }

        // 3. Obter o envelope da chave VAPID do emissor
        let vapidPrivateKeyEnvelope = profile.vapidPrivateKeyEnvelope;

        // Se o envelope não existir (perfil antigo), cifrar a chave e salvar no perfil
        if (!vapidPrivateKeyEnvelope) {
          console.warn("[SW-MSG] ⚠️ Envelope da chave VAPID não encontrado no perfil. Cifrando e salvando...");
          const res = await fetch("/api/server-public-key");
          if (!res.ok) throw new Error("Não foi possível obter a chave pública do servidor.");
          const serverPublicKeyJwk = await res.json();
          vapidPrivateKeyEnvelope = await cifrarChaveVapid(profile.vapidPrivateKeyJwk, serverPublicKeyJwk);
          
          profile.vapidPrivateKeyEnvelope = vapidPrivateKeyEnvelope;
          await salvarProfile(profile);
          console.log("[SW-MSG] ✅ Envelope da chave VAPID salvo no perfil.");
        }

        // 4. Montar payloadObj
        const payloadObj = {
          c: msg.conteudo,
          e: {
            s: {
              e: profile.subscription.endpoint,
              k: profile.subscription.keys,
              v: vapidPrivateKeyEnvelope
            },
            p: profile.e2ePublicKey
          }
        };

        // 5. Cifrar payloadObj
        const envelope = await cifrarPayloadObj(payloadObj, contato.publicKeyRSA);
        const envelopeJson = JSON.stringify(envelope);

        // 6. Construir JWT usando função genérica
        // 🔥 ALTERAÇÃO: sub="msg", aud=email do contato
        const payloadJwt = {
          iss: profile.email,
          sub: "msg",                // tipo de token: mensagem
          aud: contato.email,        // destinatário
          ct: envelopeJson,
          nm: profile.name
        };

        // Header com kid = chave pública VAPID
        const jwt = await criarJWT(payloadJwt, profile.vapidPrivateKeyJwk, { kid: profile.vapidPublicKey });

        console.log(`[SW-MSG] 📊 JWT tamanho: ${jwt.length} bytes`);

        // 7. Enviar para o servidor proxy
        const response = await fetch("/api/proxy-push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: contato.subscription,
            payloadText: jwt,
            vapid: {
              subject: `mailto:${contato.email}`,
              publicKey: contato.publicKeyVapid,
              privateKey: contato.vapidPrivateKey
            }
          })
        });

        if (response.ok) {
          await atualizarStatusMensagemEnviada(msg.id, 'enviada');
          console.log(`[SW-MSG] ✅ Mensagem ${msg.id} enviada com sucesso!`);
        } else {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

      } catch (err) {
        console.error(`[SW-MSG] ❌ Erro ao enviar mensagem ${msg.id}:`, err);

        const mensagemAtual = await buscarMensagemEnviada(msg.id);
        if (mensagemAtual) {
          mensagemAtual.tentativas++;
          mensagemAtual.erro = err.message;

          if (mensagemAtual.tentativas >= MAX_TENTATIVAS) {
            mensagemAtual.status = 'falha';
            console.log(`[SW-MSG] ⛔ Mensagem ${msg.id} excedeu tentativas máximas.`);
          } else {
            mensagemAtual.status = 'pendente';
          }
          mensagemAtual.updatedAt = Date.now();
          await salvarMensagemEnviada(mensagemAtual);
        }
      }
    }
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao processar fila de envio:", err);
  }
}

// ============================================================
// LISTENERS DE EVENTOS
// ============================================================
self.addEventListener('message', async (event) => {
  const data = event.data;
  if (data.type === 'PROCESSAR_FILA_ENVIO') {
    console.log("[SW-MSG] 📩 Recebido comando para processar fila de envio.");
    await processarFilaEnvio();
  }
});

self.addEventListener('sync', async function(event) {
  console.log(`[SW-MSG] 🔄 Sync disparado: ${event.tag}`);
  if (event.tag === 'sync-envio-mensagens') {
    event.waitUntil(processarFilaEnvio());
  }
});

self.addEventListener('online', async function() {
  console.log("[SW-MSG] 🌐 Conexão restaurada, processando filas...");
  await processarFilaEnvio();
});

self.processarFilaEnvio = processarFilaEnvio;

console.log("[SW-MSG] 📦 Módulo de mensagens carregado com sucesso!");
```

---

## Arquivo: `src/sw/push.js`

```js
// src/sw/push.js
import { get, set, createStore } from "idb-keyval";
import { gunzipSync } from "fflate";
import { DB_NAMES, STORE_NAMES, KEY_NAMES } from "../constants/db.ts";
import { verificarJWT, base64UrlToArrayBuffer } from "../utils/jwt-helpers.ts";

// ============================================================
// CONFIGURAÇÃO
// ============================================================
const DEBUG = false;

// ============================================================
// STORES - usando as constantes do db.ts
// ============================================================
function criarStore(nome) {
  try {
    return createStore(nome, STORE_NAMES.KEYVAL);
  } catch (err) {
    console.error(`[SW-PUSH] ❌ Erro ao criar store ${nome}:`, err);
    return null;
  }
}

let storeConfig = criarStore(DB_NAMES.CONFIG);
let storeMensagensRecebidasB = criarStore(DB_NAMES.MENSAGENS_RECEBIDAS_B);
let storeContatos = criarStore(DB_NAMES.CONTATOS);

function garantirStores() {
  if (!storeConfig) storeConfig = criarStore(DB_NAMES.CONFIG);
  if (!storeMensagensRecebidasB) storeMensagensRecebidasB = criarStore(DB_NAMES.MENSAGENS_RECEBIDAS_B);
  if (!storeContatos) storeContatos = criarStore(DB_NAMES.CONTATOS);
}

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================
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

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ============================================================
// FUNÇÕES DE BANCO UNIFICADAS
// ============================================================

async function buscarProfile() {
  try {
    garantirStores();
    return await get(KEY_NAMES.PROFILE, storeConfig);
  } catch (err) {
    console.error("[SW-PUSH] ❌ Erro ao buscar perfil:", err);
    return null;
  }
}

async function buscarChaveDecript() {
  try {
    const profile = await buscarProfile();
    if (!profile) {
      console.warn("[SW-PUSH] ⚠️ Perfil não encontrado.");
      return null;
    }
    if (!profile.e2ePrivateKeyJwk) {
      console.warn("[SW-PUSH] ⚠️ Chave privada RSA não encontrada no perfil.");
      return null;
    }

    const privateDecrypt = await crypto.subtle.importKey(
      "jwk",
      profile.e2ePrivateKeyJwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["decrypt"]
    );
    console.log("[SW-PUSH] 🔑 Chave de decodificação RSA encontrada e importada.");
    return privateDecrypt;
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

  // Se não parecer JWT, exibe como notificação simples
  if (rawText.split('.').length !== 3) {
    event.waitUntil(
      self.registration.showNotification("Notificação", { body: rawText })
    );
    return;
  }

  event.waitUntil(async function() {
    try {
      // Verificar assinatura usando a chave pública do header (kid)
      const { header, payload, valid } = await verificarJWT(rawText);
      if (!valid) {
        await self.registration.showNotification("⚠️ Assinatura inválida", {
          body: `Mensagem rejeitada.`,
          icon: '/icon.png'
        });
        return;
      }

      // 🔥 VALIDAÇÃO: sub deve ser "msg"
      if (payload.sub !== "msg") {
        await self.registration.showNotification("⚠️ Tipo de mensagem inválido", {
          body: `Esperado 'msg', recebido '${payload.sub}'`,
          icon: '/icon.png'
        });
        console.warn(`[SW-PUSH] ⚠️ JWT com sub inválido: ${payload.sub}`);
        return;
      }

      // Buscar o perfil do receptor (para validação do aud e para descriptografia)
      const profile = await buscarProfile();
      if (!profile) {
        throw new Error("Perfil do receptor não encontrado.");
      }

      // 🔥 VALIDAÇÃO: aud (destinatário) deve corresponder ao email do perfil
      const aud = payload.aud || payload.sub; // fallback para sub se aud não existir
      if (aud !== profile.email) {
        console.warn(`[SW-PUSH] ⚠️ 'aud' não corresponde ao email do perfil. Esperado: ${profile.email}, Recebido: ${aud}`);
        // Não bloqueia o processamento – apenas avisa
      }

      // Extrair chave pública VAPID do header (kid)
      const publicKeyVapid = header.kid;
      if (!publicKeyVapid) {
        throw new Error("Header JWT não contém 'kid' (chave pública VAPID).");
      }

      // Extrair dados do payload
      const emailRemetente = payload.iss || "remetente@desconhecido";
      const nomeRemetente = payload.nm || payload.name || emailRemetente.split('@')[0] || "Remetente";
      console.log(`[SW-PUSH] 🔐 Mensagem de ${nomeRemetente} <${emailRemetente}>`);

      // Buscar contato existente pela chave pública (header.kid)
      let contato = null;
      if (publicKeyVapid) {
        contato = await buscarContatoPorPublicKey(publicKeyVapid);
        if (contato) {
          console.log(`[SW-PUSH] Contato existente encontrado: ${contato.email}`);
        }
      }

      // Verificar se o contato é homologado (apenas para interface)
      let homologado = contato ? contato.homologado : false;

      // Descriptografar envelope
      const privateDecryptKey = await buscarChaveDecript(); // usa o perfil internamente
      if (!privateDecryptKey) {
        throw new Error("Chave privada RSA de decodificação não encontrada.");
      }

      const envelopeJson = payload.ct || payload.cipherText;
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

      // Parse do objeto de mensagem (agora { c, e })
      let mensagemObj = JSON.parse(textoDecifrado);
      const conteudo = mensagemObj.c || textoDecifrado;

      const e = mensagemObj.e || {};
      const subscription = e.s ? {
        endpoint: e.s.e || e.s.endpoint,
        keys: e.s.k || e.s.keys
      } : null;
      const publicKeyRSA = e.p || null;
      const vapidPrivateKey = (e.s && e.s.v) ? e.s.v : null;

      // Salva/atualiza contato (o emissor é o remetente)
      if (publicKeyVapid && publicKeyRSA && subscription) {
        let contatoExistente = await buscarContatoPorPublicKey(publicKeyVapid);
        const novoContato = {
          publicKeyVapid: publicKeyVapid,
          email: emailRemetente,
          nome: contatoExistente?.nome || nomeRemetente,
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

      // Salva mensagem recebida
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
        mensagemRecebida.dadosJwt = payload;
      }
      await salvarMensagemRecebida(mensagemRecebida);

      // Exibe notificação
      const podeResponder = !!(contato && contato.subscription && contato.publicKeyRSA && contato.vapidPrivateKey);
      const statusEmoji = homologado ? '✅' : '🔄';
      const statusTexto = homologado ? 'Homologado' : 'Não homologado';

      // 🔥 Adiciona indicação se o aud não corresponde
      let bodyNotificacao = `${conteudo}\n\n${statusEmoji} De: ${nomeRemetente} - ${statusTexto}`;
      if (aud !== profile.email) {
        bodyNotificacao += `\n⚠️ Esta mensagem foi enviada para outro destinatário (${aud})`;
      }

      await self.registration.showNotification(`📥 Nova mensagem`, {
        body: bodyNotificacao,
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
            status: 'nao_lida',
            audMismatch: aud !== profile.email // informa à UI se houve divergência
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

console.log("[SW-PUSH] 📦 Módulo push carregado (com store unificada e JWT helpers, DEBUG=" + DEBUG + ")");
```

---

## Arquivo: `src/constants/db.ts`

```ts
// src/constants/db.ts

export const DB_NAMES = {
  CONFIG: "AppConfig_DB",
  MENSAGENS_ENVIADAS: "BrowserA_MensagensEnviadas_DB",
  CONTATOS: "BrowserB_Contatos_DB",
  MENSAGENS_RECEBIDAS_B: "BrowserB_MensagensRecebidas_DB",
} as const;

export const STORE_NAMES = {
  KEYVAL: "keyval",
} as const;

export const KEY_NAMES = {
  PROFILE: "profile",
  MENSAGENS_ENVIADAS: "mensagens_enviadas",
  CONTATO: "contato_",
  MENSAGENS_RECEBIDAS: "mensagens_recebidas",
} as const;

// ============================================================
// Constantes
// ============================================================
export const MAX_TENTATIVAS = 3;

// ============================================================
// INTERFACES PRINCIPAIS (UNIFICADAS)
// ============================================================

/**
 * Perfil do usuário – armazenado na store AppConfig_DB com a chave "profile".
 * Contém todas as informações necessárias para identificar o usuário,
 * assinar mensagens, cifrar/decifrar e receber notificações.
 */
export interface ProfileConfig {
  // Identidade do usuário
  name: string;
  email: string;

  // Chaves VAPID (ECDSA P-256) – completas
  vapidPublicKey: JsonWebKey;
  vapidPrivateKeyJwk: JsonWebKey;  // chave privada em JWK (para assinar)
  vapidPrivateKeyEnvelope: string; // envelope cifrado da chave privada (para enviar ao proxy)

  // Chaves E2E (RSA-OAEP) – completas
  e2ePublicKey: JsonWebKey;
  e2ePrivateKeyJwk: JsonWebKey;    // chave privada em JWK (para decifrar envelopes)

  // Subscription do Web Push
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };

  // Metadados
  createdAt: number;
  updatedAt: number;
}

// ============================================================
// INTERFACES DE DADOS
// ============================================================

export interface MensagemEnviada {
  id: string;                      // Ex: "msg_1738765432100_abc123"
  contatoHash: string;             // hash SHA-256 da chave pública VAPID do contato
  conteudo: string;                // texto original da mensagem
  status: 'pendente' | 'enviando' | 'enviada' | 'falha';
  tentativas: number;
  createdAt: number;
  updatedAt: number;
  erro?: string;
}

export interface MensagemRecebida {
  id: string;
  contatoPublicKeyVapid: string; // hash SHA-256
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
  vapidPrivateKey: string;   // envelope cifrado da chave privada VAPID (para o proxy)
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
import { STORE_NAMES, KEY_NAMES, DB_NAMES } from "../constants/db.ts";
import type {
  ProfileConfig,
  MensagemEnviada,
  MensagemRecebida,
  Contato,
} from "../constants/db.ts";

// ============================================================
// Criação de Stores
// ============================================================

export function criarStore(nome: string) {
  return createStore(nome, STORE_NAMES.KEYVAL);
}

const storeConfig = criarStore(DB_NAMES.CONFIG);
export const storeMensagensEnviadasA = criarStore(DB_NAMES.MENSAGENS_ENVIADAS);
export const storeContatos = criarStore(DB_NAMES.CONTATOS);
export const storeMensagensRecebidasB = criarStore(DB_NAMES.MENSAGENS_RECEBIDAS_B);

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
// Gerenciamento do Perfil (ProfileConfig)
// ============================================================

export async function salvarProfile(profile: ProfileConfig): Promise<void> {
  profile.updatedAt = Date.now();
  if (!profile.createdAt) {
    profile.createdAt = Date.now();
  }
  await salvarChave(storeConfig, KEY_NAMES.PROFILE, profile);
}

export async function buscarProfile(): Promise<ProfileConfig | undefined> {
  return buscarChave<ProfileConfig>(storeConfig, KEY_NAMES.PROFILE);
}

export async function removerProfile(): Promise<void> {
  await removerChave(storeConfig, KEY_NAMES.PROFILE);
}

// ============================================================
// Funções de Conveniência (operam sobre o ProfileConfig)
// ============================================================

export async function buscarIdentidadeA(): Promise<{ name: string; email: string; privateKey: CryptoKey } | undefined> {
  const profile = await buscarProfile();
  if (!profile) return undefined;
  try {
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      profile.vapidPrivateKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );
    return {
      name: profile.name,
      email: profile.email,
      privateKey,
    };
  } catch {
    return undefined;
  }
}

export async function salvarIdentidadeA(identidade: { name: string; email: string; privateKey: CryptoKey }): Promise<void> {
  const profile = await buscarProfile() || {} as ProfileConfig;
  profile.name = identidade.name;
  profile.email = identidade.email;
  profile.vapidPrivateKeyJwk = await crypto.subtle.exportKey("jwk", identidade.privateKey);
  await salvarProfile(profile);
}

export async function buscarChavesE2EB(): Promise<{ privateDecrypt: CryptoKey; publicEncrypt: JsonWebKey } | undefined> {
  const profile = await buscarProfile();
  if (!profile || !profile.e2ePublicKey || !profile.e2ePrivateKeyJwk) return undefined;
  try {
    const privateDecrypt = await crypto.subtle.importKey(
      "jwk",
      profile.e2ePrivateKeyJwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["decrypt"]
    );
    return {
      privateDecrypt,
      publicEncrypt: profile.e2ePublicKey,
    };
  } catch {
    return undefined;
  }
}

export async function salvarChavesE2EB(chaves: { privateDecrypt: CryptoKey; publicEncrypt: JsonWebKey }): Promise<void> {
  const profile = await buscarProfile() || {} as ProfileConfig;
  profile.e2ePublicKey = chaves.publicEncrypt;
  profile.e2ePrivateKeyJwk = await crypto.subtle.exportKey("jwk", chaves.privateDecrypt);
  await salvarProfile(profile);
}

export async function buscarChavesVapidB(): Promise<{ publicKey: JsonWebKey; privateKey: JsonWebKey } | undefined> {
  const profile = await buscarProfile();
  if (!profile) return undefined;
  return {
    publicKey: profile.vapidPublicKey,
    privateKey: profile.vapidPrivateKeyJwk,
  };
}

export async function salvarChavesVapidB(chaves: { publicKey: JsonWebKey; privateKey: JsonWebKey }): Promise<void> {
  const profile = await buscarProfile() || {} as ProfileConfig;
  profile.vapidPublicKey = chaves.publicKey;
  profile.vapidPrivateKeyJwk = chaves.privateKey;
  await salvarProfile(profile);
}

export async function buscarSubscriptionB(): Promise<{ endpoint: string; keys: { p256dh: string; auth: string } } | undefined> {
  const profile = await buscarProfile();
  return profile?.subscription;
}

export async function salvarSubscriptionB(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void> {
  const profile = await buscarProfile() || {} as ProfileConfig;
  profile.subscription = subscription;
  await salvarProfile(profile);
}

export async function removerSubscriptionB(): Promise<void> {
  const profile = await buscarProfile();
  if (profile) {
    delete profile.subscription;
    await salvarProfile(profile);
  }
}

// ============================================================
// Mensagens Enviadas
// ============================================================

export async function salvarMensagemEnviada(mensagem: MensagemEnviada): Promise<void> {
  await salvarChave(storeMensagensEnviadasA, mensagem.id, mensagem);
}

export async function buscarMensagemEnviada(id: string): Promise<MensagemEnviada | undefined> {
  return buscarChave<MensagemEnviada>(storeMensagensEnviadasA, id);
}

export async function listarMensagensEnviadas(): Promise<MensagemEnviada[]> {
  const entries = await listarChaves<MensagemEnviada>(storeMensagensEnviadasA);
  return entries.map(([_, msg]) => msg);
}

export async function atualizarStatusMensagemEnviada(id: string, status: MensagemEnviada['status'], erro?: string): Promise<void> {
  const mensagem = await buscarMensagemEnviada(id);
  if (mensagem) {
    mensagem.status = status;
    mensagem.updatedAt = Date.now();
    if (erro) mensagem.erro = erro;
    await salvarMensagemEnviada(mensagem);
  }
}

export async function removerMensagemEnviada(id: string): Promise<void> {
  await removerChave(storeMensagensEnviadasA, id);
}

// ============================================================
// Mensagens Recebidas (não alteradas)
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
// Contatos (não alterados)
// ============================================================

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function serializarPublicKeyVapid(jwk: JsonWebKey): Promise<string> {
  const raw = `${jwk.kty?.toLowerCase() || ''}|${jwk.crv?.toLowerCase() || ''}|${jwk.x?.toLowerCase() || ''}|${jwk.y?.toLowerCase() || ''}`;
  return await sha256(raw);
}

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

## Arquivo: `src/utils/jwt-helpers.ts`

```ts
// src/utils/jwt-helpers.ts

// ============================================================
// UTILITÁRIOS BASE64URL
// ============================================================

export function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToArrayBuffer(base64Url: string): ArrayBuffer {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ============================================================
// FUNÇÃO GENÉRICA: CRIAR JWT
// ============================================================

/**
 * Cria um JWT assinado com ES256 (ECDSA P-256 + SHA-256).
 * @param payload - Objeto com os dados do payload (será convertido para JSON).
 * @param privateKeyJwk - Chave privada VAPID em formato JWK.
 * @param headerExtra - Campos extras para o header (ex: { kid: ... }).
 * @returns JWT completo (string) no formato header.payload.signature.
 */
export async function criarJWT(
  payload: Record<string, any>,
  privateKeyJwk: JsonWebKey,
  headerExtra: Record<string, any> = {}
): Promise<string> {
  const header = { alg: "ES256", ...headerExtra };
  const encoder = new TextEncoder();

  const headerB64 = arrayBufferToBase64Url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = arrayBufferToBase64Url(encoder.encode(JSON.stringify(payload)));
  const toSign = `${headerB64}.${payloadB64}`;

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    encoder.encode(toSign)
  );
  const sigB64 = arrayBufferToBase64Url(signature);

  return `${toSign}.${sigB64}`;
}

// ============================================================
// FUNÇÃO GENÉRICA: VERIFICAR JWT
// ============================================================

/**
 * Verifica um JWT assinado com ES256.
 * Se publicKeyJwk for fornecido, usa-o; senão, extrai a chave do campo 'kid' do header.
 * Retorna { header, payload, signature, valid }.
 */
export async function verificarJWT(
  jwt: string,
  publicKeyJwk?: JsonWebKey
): Promise<{ header: any; payload: any; signature: string; valid: boolean }> {
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    throw new Error("JWT inválido: deve ter 3 partes separadas por '.'");
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const decoder = new TextDecoder();

  const headerJson = decoder.decode(base64UrlToArrayBuffer(headerB64));
  const payloadJson = decoder.decode(base64UrlToArrayBuffer(payloadB64));
  const header = JSON.parse(headerJson);
  const payload = JSON.parse(payloadJson);

  let publicKeyJwkFinal = publicKeyJwk;
  if (!publicKeyJwkFinal) {
    if (!header.kid) {
      throw new Error("Header JWT não contém 'kid' e nenhuma chave pública foi fornecida.");
    }
    publicKeyJwkFinal = header.kid;
  }

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    publicKeyJwkFinal,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );

  const toSign = `${headerB64}.${payloadB64}`;
  const signatureBytes = base64UrlToArrayBuffer(signatureB64);

  const encoder = new TextEncoder();
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    signatureBytes,
    encoder.encode(toSign)
  );

  return { header, payload, signature: signatureB64, valid };
}

// ============================================================
// FUNÇÃO GENÉRICA: DECODIFICAR JWT (sem verificar assinatura)
// ============================================================

/**
 * Decodifica um JWT sem verificar a assinatura (apenas para leitura).
 * Retorna { header, payload, signature }.
 */
export function decodificarJWT(jwt: string): { header: any; payload: any; signature: string } {
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    throw new Error("JWT inválido: deve ter 3 partes separadas por '.'");
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const decoder = new TextDecoder();

  const headerJson = decoder.decode(base64UrlToArrayBuffer(headerB64));
  const payloadJson = decoder.decode(base64UrlToArrayBuffer(payloadB64));

  return {
    header: JSON.parse(headerJson),
    payload: JSON.parse(payloadJson),
    signature: signatureB64
  };
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
      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        <button id="btnGerarProfile" style="flex: 1; min-width: 150px;">📦 Gerar/Atualizar Perfil</button>
        <button id="btnCompartilharProfile" style="flex: 1; min-width: 150px; background-color: #002b3d;">🔗 Compartilhar Perfil (JWT)</button>
      </div>
      <button id="btnLimparSubscription" class="btn-sm danger" style="margin-top: 10px;">🗑️ Limpar Subscription</button>
      
      <div class="row mt-10">
        <div class="col">
          <label for="myProfileDisplay">📋 Meu Perfil (copie e cole para quem quiser te enviar mensagens):</label>
          <div id="myProfileDisplay" class="profile-field" style="background: #e8f5e9; border-color: #006c4f;">
            Clique em "Gerar/Atualizar Perfil" para criar seu perfil, depois em "Compartilhar Perfil" para gerar o JWT.
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
          <textarea id="profileInput" rows="4" placeholder="Cole aqui o JWT gerado pela outra pessoa..."></textarea>
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
.meu-icone { width: 32px; height: auto;}
```

---

## Arquivo: `src/styles.d.ts`

```ts
// src/styles.d.ts
declare module "*.css" {
  const content: string;
  export default content;
}
```

---

## Arquivo: `src/logout.html`

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Minha Área Restrita</title>
  <style>
    body { font-family: sans-serif; padding: 50px; text-align: center; }
    .btn-logout {
      background-color: #dc3545;
      color: white;
      border: none;
      padding: 10px 20px;
      font-size: 16px;
      cursor: pointer;
      border-radius: 4px;
    }
    .btn-logout:hover { background-color: #c82333; }
  </style>
</head>
<body>

  <h1>Exclusão de Sessão</h1>

  <!-- Botão que vai disparar o evento de Logout -->
  <button id="logoutBtn" class="btn-logout">Sair do Sistema</button>

  <script>
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      try {
        console.log("Processando logout local completo...");
        // 1. Limpa Web Storage
        window.localStorage.clear();
        window.sessionStorage.clear();
        // 2. Apaga rigorosamente todos os Cookies
        const cookies = document.cookie.split(";");
        for (let i = 0; i < cookies.length; i++) {
            const parts = cookies[i].split("=");
            const name = parts[0].trim();
            // Tenta apagar no path atual, na raiz e no domínio limpo (sem www)
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${window.location.hostname}`;
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${window.location.hostname.replace(/^www\./, '')}`;
        }
        // 3. Limpa IndexedDB
        if (window.indexedDB?.databases) {
            const dbs = await window.indexedDB.databases();
            for (const db of dbs) window.indexedDB.deleteDatabase(db.name);
        }
        // 4. Cancela Push Subscriptions e Desregistra Service Workers
        if ('serviceWorker' in navigator) {
          try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
              // Cancela a inscrição de Push Notification se ela existir
              if (registration.pushManager) {
                const subscription = await registration.pushManager.getSubscription();
                if (subscription) {
                  await subscription.unsubscribe();
                  console.log("Inscrição de Push Notification cancelada.");
                }
              }
              // Desregistra o Service Worker
              await registration.unregister();
              console.log("Service Worker desregistrado.");
            }
          } catch (error) {
            console.error("Erro ao limpar Service Workers/Push:", error);
          }
        }
        // 5. Limpa Cache Storage (Caso tenha sobrado resíduos do Service Worker)
        if (window.caches) {
          try {
            const cacheNames = await window.caches.keys();
            for (const name of cacheNames) {
              await window.caches.delete(name);
            }
          } catch (cacheError) {
            console.error("Erro ao limpar Cache Storage:", cacheError);
          }
        }
        // 6. Origin Private File System
        if (navigator.storage?.getDirectory) {
          const root = await navigator.storage.getDirectory();
          for await (const name of root.keys()) await root.removeEntry(name, { recursive: true });
        }

        // Envia a requisição POST exatamente para a rota do Deno
        const resposta = await fetch('./api/logout', {
          method: 'POST'
        });

        if (resposta.ok) {
          const dados = await resposta.json();
          
          if (dados.disconnected) {
            alert('Você foi desconectado do servidor! O navegador também limpou seus dados locais via Clear-Site-Data.');
            
            // Redireciona o usuário para a página de login após o sucesso
            window.location.href = './'; 
          }
        } else {
          console.error('Falha no servidor ao tentar deslogar.');
        }
      } catch (erro) {
        console.error('Erro de rede ao chamar a API de logout:', erro);
      }
    });
  </script>

</body>
</html>

```

---

## Arquivo: `src/service-worker.js`

```js
// src/service-worker.js

// Importa os módulos fatiados
import "./sw/cache.js";
import "./sw/push.js";
import "./sw/click.js";
import "./sw/sw-mensagens.js";

console.log("[SW] 🌌 Orquestrador Modular do Service Worker carregado com sucesso!");

// 🔥 PROCESSADOR DE FILAS EM BACKGROUND
// Tenta processar filas quando o SW é ativado
self.addEventListener('activate', (event) => {
  console.log("[SW] 🔄 Ativando e agendando processamento de filas pendentes...");
  event.waitUntil(
    (async () => {
      // Aguarda um pouco para garantir que tudo está pronto
      await new Promise(r => setTimeout(r, 1000));
      
      // Dispara o processamento em segundo plano, sem bloquear a ativação
      setTimeout(async () => {
        try {
          if (self.processarFilaEnvio) {
            await self.processarFilaEnvio();
          }
        } catch (e) {
          console.error("[SW] Erro ao processar fila de envio:", e);
        }
        try {
          if (self.processarFilaNotificacao) {
            await self.processarFilaNotificacao();
          }
        } catch (e) {
          console.error("[SW] Erro ao processar fila de notificações:", e);
        }
      }, 100);
    })()
  );
});
```

---

## Arquivo: `src/app.tsx`

```tsx
// src/app.tsx
import "./styles.css";

import {
  salvarProfile,
  buscarProfile,
  salvarMensagemEnviada,
  listarMensagensEnviadas,
  removerMensagemEnviada,
  listarMensagensRecebidas,
  atualizarStatusMensagemRecebida,
  removerMensagemRecebida,
  buscarIdentidadeA,
  salvarIdentidadeA,
  buscarChavesVapidB,
  salvarChavesVapidB,
  buscarChavesE2EB,
  salvarChavesE2EB,
  buscarSubscriptionB,
  salvarSubscriptionB,
  removerSubscriptionB,
  salvarContato,
  buscarContatoPorPublicKey,
  buscarContatoPorChave,
  listarContatos,
  homologarContato,
  removerContato,
  serializarPublicKeyVapid,
} from "./utils/db-helpers.ts";

import type {
  ProfileConfig,
  MensagemEnviada,
  MensagemRecebida,
  Contato,
} from "./constants/db.ts";

import {
  criarJWT,
  verificarJWT,
  decodificarJWT,
  arrayBufferToBase64Url,
  arrayBufferToBase64,
} from "./utils/jwt-helpers.ts";

console.log("🟢 [APP] Web Push Descentralizado - Perfis e Contatos (unificado)");

// ============================================================
// UTILITÁRIOS
// ============================================================
async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast("✅ Copiado para a área de transferência!", "success");
  } catch {
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

  const cacheBuster = Date.now();
  console.log("⏳ Registrando/Atualizando Service Worker...");

  const registration = await navigator.serviceWorker.register(
    `./service-worker.js?cacheBuster=${cacheBuster}`,
    { scope: "/" }
  );

  await navigator.serviceWorker.ready;
  console.log("✅ Service Worker ativo e pronto.");
  return registration;
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
// GERAÇÃO DE CHAVES E2E (RSA) - extractable: true
// ============================================================
async function generateE2EEKeys() {
  console.log("🔑 Gerando chaves E2E (RSA-2048)...");
  const encryptionKeyPair = await window.crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([0x01, 0x00, 0x01]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"]
  );
  const publicEncryptJwk = await window.crypto.subtle.exportKey("jwk", encryptionKeyPair.publicKey);
  const privateDecryptJwk = await window.crypto.subtle.exportKey("jwk", encryptionKeyPair.privateKey);
  return {
    privateDecrypt: encryptionKeyPair.privateKey,
    publicEncrypt: publicEncryptJwk,
    privateDecryptJwk: privateDecryptJwk
  };
}

// ============================================================
// GERAÇÃO DE CHAVES VAPID (ECDSA) - extractable: true
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
// GERAR PERFIL (profile) – unificado (NÃO GERA JWT)
// ============================================================
async function gerarProfile(): Promise<ProfileConfig> {
  console.log("📦 Gerando/Atualizando perfil unificado...");
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

    // Gerar ou obter chaves VAPID
    let vapidKeyPair: CryptoKeyPair;
    let publicKeyJwk: JsonWebKey;
    let privateKeyJwk: JsonWebKey;

    let existingProfile = await buscarProfile();
    if (existingProfile && existingProfile.vapidPublicKey && existingProfile.vapidPrivateKeyJwk) {
      console.log("📂 Chaves VAPID encontradas no perfil.");
      publicKeyJwk = existingProfile.vapidPublicKey;
      privateKeyJwk = existingProfile.vapidPrivateKeyJwk;
      try {
        vapidKeyPair = {
          publicKey: await window.crypto.subtle.importKey(
            "jwk", publicKeyJwk,
            { name: "ECDSA", namedCurve: "P-256" },
            true,
            ["verify"]
          ),
          privateKey: await window.crypto.subtle.importKey(
            "jwk", privateKeyJwk,
            { name: "ECDSA", namedCurve: "P-256" },
            true,
            ["sign"]
          )
        } as CryptoKeyPair;
      } catch {
        console.log("⚠️ Erro ao importar chaves VAPID existentes. Gerando novas...");
        existingProfile = undefined;
      }
    }
    if (!existingProfile || !vapidKeyPair) {
      console.log("🔑 Gerando novas chaves VAPID...");
      vapidKeyPair = await generateVAPIDKeys();
      publicKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.publicKey);
      privateKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.privateKey);
    }

    // Subscription
    let existingSubscription = await registration.pushManager.getSubscription();
    let subscriptionValida = false;

    if (existingSubscription) {
      const profileSub = existingProfile?.subscription;
      if (profileSub && profileSub.endpoint === existingSubscription.endpoint) {
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
    const subscription = {
      endpoint: existingSubscription.endpoint,
      keys: {
        p256dh: rawBufferToBase64Url(p256dhBuffer),
        auth: rawBufferToBase64Url(authBuffer)
      }
    };

    // E2E keys
    let e2ePublicKey: JsonWebKey;
    let e2ePrivateKeyJwk: JsonWebKey;
    let e2ePrivateKeyCrypto: CryptoKey;

    if (existingProfile && existingProfile.e2ePublicKey && existingProfile.e2ePrivateKeyJwk) {
      console.log("📂 Chaves E2E encontradas no perfil.");
      e2ePublicKey = existingProfile.e2ePublicKey;
      e2ePrivateKeyJwk = existingProfile.e2ePrivateKeyJwk;
      try {
        e2ePrivateKeyCrypto = await window.crypto.subtle.importKey(
          "jwk",
          e2ePrivateKeyJwk,
          { name: "RSA-OAEP", hash: "SHA-256" },
          true,
          ["decrypt"]
        );
      } catch {
        console.log("⚠️ Erro ao importar chave E2E existente. Gerando novas...");
        const newKeys = await generateE2EEKeys();
        e2ePublicKey = newKeys.publicEncrypt;
        e2ePrivateKeyJwk = newKeys.privateDecryptJwk;
        e2ePrivateKeyCrypto = newKeys.privateDecrypt;
      }
    } else {
      console.log("🔑 Gerando novas chaves E2E...");
      const newKeys = await generateE2EEKeys();
      e2ePublicKey = newKeys.publicEncrypt;
      e2ePrivateKeyJwk = newKeys.privateDecryptJwk;
      e2ePrivateKeyCrypto = newKeys.privateDecrypt;
    }

    // Cifrar a chave privada VAPID para o servidor (envelope)
    const privateKeyEncrypted = await criptografarChaveVapid(privateKeyJwk, serverPublicKeyJwk);

    // Montar o perfil unificado
    const profile: ProfileConfig = {
      name: nome,
      email: email,
      vapidPublicKey: publicKeyJwk,
      vapidPrivateKeyJwk: privateKeyJwk,
      vapidPrivateKeyEnvelope: privateKeyEncrypted,
      e2ePublicKey: e2ePublicKey,
      e2ePrivateKeyJwk: e2ePrivateKeyJwk,
      subscription: subscription,
      createdAt: existingProfile?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    await salvarProfile(profile);

    // Salvar identidade (para compatibilidade)
    const identidadeTemporaria = {
      name: nome,
      email: email,
      privateKey: vapidKeyPair.privateKey
    };
    await salvarIdentidadeA(identidadeTemporaria);

    return profile;
  } catch (err) {
    console.error("❌ Erro ao gerar perfil:", err);
    throw err;
  }
}

// ============================================================
// COMPARTILHAR PERFIL via JWT (sub: "contact") COM VALIDAÇÕES
// ============================================================
async function compartilharProfile(): Promise<void> {
  console.log("🔄 Gerando JWT de compartilhamento de perfil...");
  try {
    const profile = await buscarProfile();
    if (!profile) {
      throw new Error("Perfil não encontrado. Clique em 'Gerar/Atualizar Perfil' primeiro.");
    }

    // 🔥 VALIDAÇÕES ESSENCIAIS
    if (!profile.vapidPublicKey) {
      throw new Error("Chave pública VAPID ausente. Atualize seu perfil.");
    }
    if (!profile.vapidPrivateKeyJwk) {
      throw new Error("Chave privada VAPID ausente. Atualize seu perfil.");
    }
    if (!profile.e2ePublicKey) {
      throw new Error("Chave pública RSA ausente. Atualize seu perfil.");
    }
    if (!profile.subscription) {
      throw new Error("Subscription ausente. Atualize seu perfil.");
    }
    if (!profile.subscription.endpoint) {
      throw new Error("Endpoint da subscription ausente. Atualize seu perfil.");
    }
    if (!profile.subscription.keys || !profile.subscription.keys.p256dh || !profile.subscription.keys.auth) {
      throw new Error("Chaves da subscription incompletas. Atualize seu perfil.");
    }
    // 🔥 VALIDAÇÃO ESPECÍFICA PARA s.k (ENVELOPE)
    if (!profile.vapidPrivateKeyEnvelope) {
      throw new Error("Envelope da chave VAPID (k) ausente. Clique em 'Gerar/Atualizar Perfil' para recriar.");
    }

    const payload = {
      iss: profile.email,
      sub: "contact",
      nm: profile.name,
      p: profile.e2ePublicKey,
      s: {
        endpoint: profile.subscription.endpoint,
        keys: {
          p256dh: profile.subscription.keys.p256dh,
          auth: profile.subscription.keys.auth
        },
        k: profile.vapidPrivateKeyEnvelope // 🔥 ESSENCIAL
      },
      iat: Math.floor(Date.now() / 1000)
    };

    const jwt = await criarJWT(payload, profile.vapidPrivateKeyJwk, { kid: profile.vapidPublicKey });

    const display = document.getElementById('myProfileDisplay');
    if (display) {
      display.textContent = jwt;
      display.style.background = '#e8f5e9';
    }
    await copyToClipboard(jwt);
    showToast("✅ JWT de perfil copiado para a área de transferência!", "success");
  } catch (err: any) {
    console.error("Erro ao gerar JWT:", err);
    showToast("❌ Erro ao gerar JWT: " + err.message, "error");
  }
}

// ============================================================
// ADICIONAR CONTATO a partir de JWT (sub: "contact")
// ============================================================
async function adicionarContato(): Promise<void> {
  const profileRaw = (document.getElementById('profileInput') as HTMLTextAreaElement).value.trim();
  if (!profileRaw) {
    showToast("Cole o perfil (JWT) da pessoa que deseja adicionar.", "error");
    return;
  }

  try {
    if (profileRaw.split('.').length !== 3) {
      throw new Error("Formato inválido. Cole o JWT gerado pelo outro navegador.");
    }

    const { header, payload, valid } = await verificarJWT(profileRaw);
    if (!valid) {
      throw new Error("Assinatura do JWT inválida. O perfil pode ter sido adulterado.");
    }

    // 🔥 VALIDAÇÃO DE CAMPOS OBRIGATÓRIOS
    if (!header.kid) {
      throw new Error("JWT incompleto: falta 'kid' no header (chave pública VAPID).");
    }
    if (!payload.p) {
      throw new Error("JWT incompleto: falta 'p' (chave pública RSA).");
    }
    if (!payload.s) {
      throw new Error("JWT incompleto: falta 's' (subscription).");
    }
    if (!payload.s.k) {
      throw new Error("JWT incompleto: falta 's.k' (chave privada VAPID cifrada).");
    }
    if (payload.sub !== "contact") {
      throw new Error("Este JWT não é um perfil de contato (sub deve ser 'contact').");
    }

    let contatoExistente = await buscarContatoPorPublicKey(header.kid);

    const novoContato: Contato = {
      publicKeyVapid: header.kid,
      email: payload.iss,
      nome: payload.nm || payload.iss,
      publicKeyRSA: payload.p,
      subscription: {
        endpoint: payload.s.endpoint,
        keys: {
          p256dh: payload.s.keys.p256dh,
          auth: payload.s.keys.auth
        }
      },
      vapidPrivateKey: payload.s.k,
      homologado: true,
      createdAt: contatoExistente?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    await salvarContato(novoContato);

    showToast(`✅ Contato "${novoContato.nome}" adicionado com sucesso!`, "success");
    (document.getElementById('profileInput') as HTMLTextAreaElement).value = '';
    await carregarContatos();
    await carregarSelectContatos();
  } catch (err: any) {
    showToast(`❌ Erro ao adicionar contato: ${err.message}`, "error");
  }
}

// ============================================================
// CARREGAR LISTA DE CONTATOS (COM BOTÕES DE HOMOLOGAR)
// ============================================================
async function carregarContatos(): Promise<void> {
  const container = document.getElementById('listaContatos');
  if (!container) return;
  const contatos = await listarContatos();
  if (contatos.length === 0) {
    container.innerHTML = `
      <p style="color: #666; font-size: 14px;">Nenhum contato adicionado ainda.</p>
      <button id="btnHomologarTodosContatos" class="btn-sm homologar-btn" style="margin-top: 8px;">🔄 Homologar Todos</button>
    `;
    const btnHomologarTodos = document.getElementById('btnHomologarTodosContatos');
    if (btnHomologarTodos) {
      btnHomologarTodos.addEventListener('click', homologarTodosContatos);
    }
    return;
  }

  let html = '';
  for (const c of contatos) {
    const homol = c.homologado ? '✅' : '🔄';
    const botaoHomologar = !c.homologado ?
      `<button class="btn-homologar-contato btn-sm homologar-btn" data-publickey='${JSON.stringify(c.publicKeyVapid).replace(/'/g, "&#39;")}' style="font-size: 11px; padding: 2px 8px; color: white; border: none; border-radius: 3px; cursor: pointer;">🔄 Homologar</button>` :
      '';

    html += `
      <div class="contato-item">
        <span><strong>${c.nome}</strong> &lt;${c.email}&gt; ${homol}</span>
        <div style="display: flex; gap: 4px;">
          ${botaoHomologar}
          <button class="btn-remover-contato btn-sm danger" data-publickey='${JSON.stringify(c.publicKeyVapid).replace(/'/g, "&#39;")}' style="font-size: 11px; padding: 2px 8px; background: #cc0000; color: white; border: none; border-radius: 3px; cursor: pointer;">🗑️</button>
        </div>
      </div>
    `;
  }

  html += `
    <div style="margin-top: 10px; text-align: right;">
      <button id="btnHomologarTodosContatos" class="btn-sm homologar-btn">🔄 Homologar Todos</button>
    </div>
  `;

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

  container.querySelectorAll('.btn-homologar-contato').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const target = e.currentTarget as HTMLButtonElement;
      const publicKeyStr = target.dataset.publickey || '';
      try {
        const publicKeyVapid = JSON.parse(publicKeyStr);
        await homologarContato(publicKeyVapid);
        showToast("✅ Contato homologado!", "success");
        await carregarContatos();
        await carregarSelectContatos();
      } catch (err) {
        showToast(`❌ Erro: ${err.message}`, "error");
      }
    });
  });

  const btnHomologarTodos = document.getElementById('btnHomologarTodosContatos');
  if (btnHomologarTodos) {
    btnHomologarTodos.addEventListener('click', homologarTodosContatos);
  }
}

// ============================================================
// HOMOLOGAR TODOS OS CONTATOS
// ============================================================
async function homologarTodosContatos(): Promise<void> {
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
  await carregarContatos();
  await carregarSelectContatos();
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
// ENVIAR MENSAGEM
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
    const contato = await buscarContatoPorChave(selectedKey);
    if (!contato) {
      showToast("Contato não encontrado. Tente adicioná-lo novamente.", "error");
      return;
    }

    const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const mensagem: MensagemEnviada = {
      id: msgId,
      contatoHash: selectedKey,
      conteudo: conteudo,
      status: 'pendente',
      tentativas: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await salvarMensagemEnviada(mensagem);

    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage({ type: 'PROCESSAR_FILA_ENVIO' });

    showToast(`✅ Mensagem adicionada à fila para ${contato.nome}! ID: ${msgId}`, "success");
    (document.getElementById('mensagemEnvioB') as HTMLTextAreaElement).value = '';
    await carregarMensagensEnviadas();

  } catch (err: any) {
    console.error(err);
    showToast(`❌ Erro: ${err.message}`, "error");
  }
}

// ============================================================
// CARREGAR MENSAGENS RECEBIDAS
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

    let contato: Contato | null = null;
    let nome = 'Remetente desconhecido';
    let homologado = false;
    let podeResponder = false;

    if (msg.contatoPublicKeyVapid) {
      contato = await buscarContatoPorChave(msg.contatoPublicKeyVapid);
      if (!contato) {
        try {
          const parsed = JSON.parse(msg.contatoPublicKeyVapid);
          if (parsed && parsed.kty) {
            const hashKey = await serializarPublicKeyVapid(parsed);
            contato = await buscarContatoPorChave(hashKey);
          }
        } catch (e) {
          // ignora
        }
      }
      if (!contato) {
        const todosContatos = await listarContatos();
        for (const c of todosContatos) {
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
// CARREGAR MENSAGENS ENVIADAS
// ============================================================
async function carregarMensagensEnviadas(): Promise<void> {
  console.log("📤 Carregando mensagens enviadas...");
  const mensagens = await listarMensagensEnviadas();
  const container = document.getElementById('mensagensEnviadasB');
  if (!container) return;
  if (mensagens.length === 0) {
    container.innerHTML = '<p style="color: #666;">Nenhuma mensagem enviada.</p>';
    return;
  }
  mensagens.sort((a, b) => b.createdAt - a.createdAt);
  let html = '';
  for (const msg of mensagens) {
    const statusMap: Record<string, { emoji: string; label: string; classe: string }> = {
      'pendente': { emoji: '⏳', label: 'Pendente', classe: 'msg-item-pendente' },
      'enviando': { emoji: '🔄', label: 'Enviando...', classe: 'msg-item-pendente' },
      'enviada': { emoji: '✅', label: 'Enviada', classe: 'msg-item-enviada' },
      'falha': { emoji: '❌', label: 'Falha', classe: 'msg-item-falha' },
    };
    const status = statusMap[msg.status] || { emoji: '❓', label: msg.status, classe: '' };
    const data = new Date(msg.createdAt).toLocaleString();
    let nomeContato = msg.contatoHash;
    try {
      const contato = await buscarContatoPorChave(msg.contatoHash);
      if (contato) nomeContato = contato.nome;
    } catch {}

    html += `
      <div class="msg-item ${status.classe}" style="border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin-bottom: 8px; background: ${msg.status === 'enviada' ? '#e8f5e9' : msg.status === 'falha' ? '#ffebee' : '#fff8e1'};">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
          <strong>${status.emoji} Para: ${nomeContato}</strong>
          <small style="color: #888;">${data}</small>
        </div>
        <p style="margin: 5px 0;">${msg.conteudo || '(mensagem oculta)'}</p>
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
        await removerMensagemEnviada(id);
        await carregarMensagensEnviadas();
      }
    });
  });
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
  console.log("📂 Carregando dados iniciais (unificado)...");
  try {
    const profile = await buscarProfile();
    if (profile) {
      (document.getElementById('profileNameB') as HTMLInputElement).value = profile.name;
      (document.getElementById('profileEmailB') as HTMLInputElement).value = profile.email;
      console.log("✅ Perfil carregado:", profile.name);
      // 🔥 Verifica se o envelope existe, senão avisa
      if (!profile.vapidPrivateKeyEnvelope) {
        console.warn("⚠️ Perfil antigo sem envelope VAPID. Clique em 'Gerar/Atualizar Perfil' para corrigir.");
        showToast("⚠️ Perfil desatualizado. Clique em 'Gerar/Atualizar Perfil' para corrigir.", "info");
      }
    } else {
      console.log("ℹ️ Nenhum perfil encontrado. Gere um novo perfil.");
    }
    await carregarContatos();
    await carregarSelectContatos();
    await carregarMensagensRecebidas();
    await carregarMensagensEnviadas();
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

  // 🔥 Botão "Gerar/Atualizar Perfil" – cria ou atualiza o perfil
  document.getElementById('btnGerarProfile')?.addEventListener('click', async () => {
    try {
      const profile = await gerarProfile();
      showToast(`✅ Perfil de "${profile.name}" gerado/atualizado com sucesso!`, "success");
      // Atualiza interface com nome/email
      (document.getElementById('profileNameB') as HTMLInputElement).value = profile.name;
      (document.getElementById('profileEmailB') as HTMLInputElement).value = profile.email;
    } catch (err: any) {
      showToast("❌ Erro ao gerar perfil: " + err.message, "error");
    }
  });

  // 🔥 Botão "Compartilhar Perfil (JWT)" – gera o JWT a partir do perfil existente
  const btnCompartilhar = document.getElementById('btnCompartilharProfile');
  if (btnCompartilhar) {
    btnCompartilhar.addEventListener('click', compartilharProfile);
  }

  // 🔥 Botão "Copiar Perfil" – copia o conteúdo do display (JWT)
  document.getElementById('btnCopyProfile')?.addEventListener('click', async () => {
    const display = document.getElementById('myProfileDisplay');
    if (display && display.textContent && display.textContent !== 'Clique em "Gerar e Compartilhar Meu Perfil" para criar seu perfil.') {
      await copyToClipboard(display.textContent);
      showToast("✅ JWT copiado!", "success");
    } else {
      showToast("Primeiro gere seu perfil.", "info");
    }
  });

  document.getElementById('btnAdicionarContato')?.addEventListener('click', adicionarContato);
  document.getElementById('btnEnviarB')?.addEventListener('click', enviarMensagemB);
  document.getElementById('btnCarregarMensagens')?.addEventListener('click', carregarMensagensRecebidas);
  document.getElementById('btnLimparLidas')?.addEventListener('click', removerMensagensLidas);

  document.getElementById('btnLimparSubscription')?.addEventListener('click', async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        console.log("Subscription desinscrita.");
      }
      const profile = await buscarProfile();
      if (profile) {
        delete profile.subscription;
        await salvarProfile(profile);
      }
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
  });
});
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
    entrypoints: [join(SRC_DIR, "index.html"), join(SRC_DIR, "logout.html")],
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

Não há banco de dados central, nem filas compartilhadas: cada navegador mantém seu próprio **IndexedDB** com contatos, histórico de mensagens e o perfil do usuário.

---

## 2. Conceitos Fundamentais

### 2.1. Perfil (Profile)
Um **perfil** é um objeto JSON público gerado por cada usuário. Ele contém todas as informações necessárias para que outros possam enviar-lhe mensagens push. O perfil deve ser transferido fora de banda (por exemplo, copiando e colando) do receptor para o emissor.

**Estrutura do Perfil Público (compartilhado):**
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

**Estrutura da mensagem enviada (IndexedDB) – fila de envio:**
```typescript
interface MensagemEnviada {
  id: string;                      // msg_<timestamp>_<random>
  contatoHash: string;             // Hash SHA-256 da chave pública VAPID do contato
  conteudo: string;                // Texto original da mensagem
  status: 'pendente' | 'enviando' | 'enviada' | 'falha';
  tentativas: number;              // Número de tentativas de envio
  createdAt: number;
  updatedAt: number;
  erro?: string;                   // Mensagem de erro, se houver
}
```
**Constante:** `MAX_TENTATIVAS = 3` (número máximo de tentativas antes de marcar como falha).

---

## 3. Armazenamento IndexedDB – Detalhamento

O sistema utiliza as seguintes stores (bancos) no IndexedDB, gerenciadas pela biblioteca `idb-keyval`:

| Nome da Store (`DB_NAMES`) | Chave | Valor | Finalidade |
| :--- | :--- | :--- | :--- |
| `AppConfig_DB` | `"profile"` | `ProfileConfig` | **Store unificada** – contém todos os dados do perfil do usuário: nome, e-mail, chaves VAPID (pública e privada em JWK), envelope da chave privada VAPID, chaves RSA (pública e privada em JWK) e subscription. |
| `BrowserB_Contatos_DB` | **Hash SHA-256** (hex) da chave VAPID pública | `Contato` | Armazena todos os contatos conhecidos. A chave é um hash para evitar problemas de capitalização e inconsistências de serialização. |
| `BrowserB_MensagensRecebidas_DB` | `msg_<timestamp>_<random>` | `MensagemRecebida` | Armazena mensagens recebidas. O campo `contatoPublicKeyVapid` referencia a chave hash do contato correspondente. |
| `BrowserA_MensagensEnviadas_DB` | `msg_<timestamp>_<random>` | `MensagemEnviada` | Fila de mensagens aguardando envio (offline-first). O status e o contador de tentativas permitem gerenciar o fluxo de envio. |

**Observações importantes:**
- **A store `AppConfig_DB` substitui as antigas stores `BrowserA_Identidade_DB`, `BrowserB_E2E_Chaves_DB`, `BrowserB_Vapid_DB` e `BrowserB_Subscription_DB`**, eliminando a duplicação de dados e centralizando todas as informações do perfil.
- **Todas as chaves privadas** (VAPID e RSA) são persistidas como **JWK** dentro do `ProfileConfig`. Isso garante que, ao recarregar a página, o usuário não perca suas chaves, mantendo a capacidade de assinar e decifrar mensagens.
- **O envelope da chave privada VAPID** (`vapidPrivateKeyEnvelope`) é armazenado no perfil para que o Service Worker possa incluí-lo no payload da mensagem sem precisar cifrá-lo novamente a cada envio.
- **A store `BrowserA_Bundles_DB` foi removida** – o bundle do emissor é construído dinamicamente a partir do perfil unificado e do contato sempre que necessário.
- **A store `BrowserA_MensagensEnvio_DB` foi renomeada para `BrowserA_MensagensEnviadas_DB`** e sua estrutura foi simplificada para armazenar apenas os dados essenciais da mensagem, transferindo a lógica de cifragem e envio para o Service Worker.

**Geração do Hash do Contato:**
Para evitar diferenças de capitalização (ex: `"EC"` vs `"ec"`, `"P-256"` vs `"p-256"`), a chave primária da store de contatos é um **hash SHA-256** da string normalizada em minúsculo: `${kty}|${crv}|${x}|${y}` (extraídos da chave pública VAPID). Isso garante que a mesma chave pública gere sempre o mesmo hash, independentemente de como foi serializada.

---

## 4. Fluxos Detalhados

### 4.1. Geração do Perfil
**Função:** `gerarProfile()` em `src/app.tsx`

1. **Verificação de permissões**: Checa se a permissão de notificação está concedida; caso contrário, solicita.
2. **Registro do Service Worker**: Registra ou obtém a instância do Service Worker.
3. **Geração/obtenção de chaves VAPID**: Tenta carregar do perfil existente; caso não existam, gera um novo par ECDSA P-256 (`extractable: true`).
4. **Geração/obtenção de chaves RSA**: Tenta carregar do perfil existente; caso não existam, gera um novo par RSA-OAEP-256 (`extractable: true`).
5. **Obtenção da subscription**: Obtém a subscription do `PushManager` do navegador, usando a chave pública VAPID como `applicationServerKey`; reutiliza a subscription existente se ainda for válida.
6. **Busca da chave pública do servidor**: Faz uma requisição GET para `/api/server-public-key` para obter a chave pública RSA do servidor proxy.
7. **Cifragem da chave privada VAPID**: A chave privada VAPID (em JWK) é cifrada com AES-GCM, e a chave simétrica é cifrada com RSA-OAEP usando a chave pública do servidor. O envelope resultante é colocado no campo `k` do perfil público e também salvo no campo `vapidPrivateKeyEnvelope` do `ProfileConfig`.
8. **Montagem do perfil público**: Combina `iss` (email), `nm` (nome), `kid` (chave pública VAPID), `s` (subscription), `p` (chave pública RSA), e `k` (chave privada VAPID cifrada).
9. **Persistência do perfil unificado**: Salva todos os dados (nome, email, chaves VAPID e RSA em JWK, envelope VAPID, subscription) na store `AppConfig_DB` com a chave `"profile"`.
10. **Exibição**: O perfil público é mostrado em uma área de texto para o usuário copiar.

### 4.2. Adição de Contato
**Função:** `adicionarContato()` em `src/app.tsx`

1. O usuário cola um perfil JSON em uma textarea e clica em "Adicionar Contato".
2. Valida a estrutura do perfil (verifica campos obrigatórios).
3. **Importa a chave pública VAPID** (campo `kid`) para validar o formato.
4. Cria um objeto `Contato` com os dados do perfil (`homologado: false`).
5. **Gera o hash** da chave pública VAPID utilizando a função `serializarPublicKeyVapid`.
6. Salva o contato na store `BrowserB_Contatos_DB` usando o hash como chave.
7. Atualiza a interface: lista de contatos e dropdown de seleção.

### 4.3. Envio de Mensagem – App
**Função:** `enviarMensagemB()` em `src/app.tsx`

1. O usuário seleciona um contato no dropdown e digita a mensagem.
2. Recupera o contato completo do IndexedDB usando o hash selecionado.
3. **Salva a mensagem na fila de envio** (`BrowserA_MensagensEnviadas_DB`) com:
   - `contatoHash`: hash do contato
   - `conteudo`: texto original
   - `status: 'pendente'`
   - `tentativas: 0`
4. **Notifica o Service Worker** via `postMessage` com o tipo `PROCESSAR_FILA_ENVIO`.
5. O Service Worker processará a mensagem em background (offline-first).

### 4.4. Processamento do Envio – Service Worker
**Função:** `processarFilaEnvio()` em `src/sw/sw-mensagens.js`

1. O Service Worker recebe a mensagem da página via `postMessage` ou é ativado por eventos de sincronização (`sync`) ou conexão online.
2. Busca todas as mensagens com status `'pendente'` ou `'enviando'` com `updatedAt` há mais de 30 segundos.
3. Para cada mensagem:
   - Atualiza status para `'enviando'`.
   - Busca o contato pelo `contatoHash` e o perfil (store `AppConfig_DB`).
   - **Validações:**
     - Perfil: `e2ePublicKey`, `vapidPublicKey`, `vapidPrivateKeyJwk`, `vapidPrivateKeyEnvelope`, `subscription` → senão, erro "Usuário não logado (sem Chaves)" ou "Mensagens Web Push não configurada (sem Subscription)".
     - Contato: `publicKeyRSA`, `publicKeyVapid`, `vapidPrivateKey`, `subscription` → senão, erro "Contato sem Chaves" ou "Contato sem Subscription".
   - **Monta o payloadObj:**
     ```js
     {
       c: msg.conteudo,
       e: {
         s: {
           e: profile.subscription.endpoint,
           k: profile.subscription.keys,
           v: profile.vapidPrivateKeyEnvelope // envelope cifrado para o proxy
         },
         p: profile.e2ePublicKey
       }
     }
     ```
   - **Cifra o payloadObj:**
     - Serializa e compacta com Gzip.
     - Gera chave AES-GCM e IV.
     - Cifra os dados comprimidos com AES-GCM.
     - Cifra a chave AES com a chave pública RSA do contato.
     - Monta envelope: `{ i: base64IV, d: base64Dados, k: base64ChaveAES }`.
   - **Constrói o JWT:**
     - Header: `{ alg: "ES256" }`.
     - Payload: `{ iss: profile.email, sub: contato.email, ct: envelopeJSON, p: profile.vapidPublicKey, nm: profile.name }`.
     - Assina com a chave privada VAPID do emissor (importada de `profile.vapidPrivateKeyJwk`).
   - **Envia para o servidor proxy**: POST para `/api/proxy-push` com:
     ```json
     {
       "subscription": contato.subscription,
       "payloadText": jwt,
       "vapid": {
         "subject": `mailto:${contato.email}`,
         "publicKey": contato.publicKeyVapid,
         "privateKey": contato.vapidPrivateKey // envelope cifrado
       }
     }
     ```
   - **Atualiza status:**
     - Sucesso: `'enviada'`.
     - Falha: incrementa `tentativas`. Se `tentativas >= MAX_TENTATIVAS` (3), marca como `'falha'`; caso contrário, volta para `'pendente'`.

### 4.5. Recebimento da Mensagem – Service Worker (`push.js`)
1. O Service Worker recebe o evento `push` contendo o JWT no `event.data.text()`.
2. Divide o JWT em header, payload e signature.
3. **Verifica a assinatura** usando a chave pública VAPID do emissor (campo `p` do payload) e o algoritmo ECDSA P-256.
4. Se a assinatura for inválida, descarta a mensagem e exibe notificação de erro.
5. **Decifra o envelope**:
   - Obtém a chave privada RSA do receptor a partir do perfil unificado (`ProfileConfig.e2ePrivateKeyJwk`), importando-a como CryptoKey.
   - Decodifica `iv`, `dados` e `k` do envelope.
   - Descriptografa a chave AES usando RSA-OAEP.
   - Descriptografa os dados com AES-GCM.
   - Descomprime (gunzip) o resultado, obtendo o objeto JSON original (agora com estrutura simplificada `{ c, e }`).
6. **Salva/Atualiza o Contato**:
   - Extrai `subscription`, `publicKeyRSA` e `vapidPrivateKey` do objeto decifrado (agora `e.s`).
   - Gera o hash da chave pública VAPID do emissor (do campo `p` do JWT).
   - Busca um contato existente pelo hash.
   - Se não existir, cria um novo contato com os dados extraídos e o nome vindo de `nm` (ou fallback para o email). Se já existir, atualiza o nome e outros dados se necessário.
   - Salva o contato na store `BrowserB_Contatos_DB`.
7. **Salva a Mensagem**:
   - Gera um ID único.
   - Cria um objeto `MensagemRecebida` com o hash do contato, conteúdo decifrado (`c` do objeto), status `'nao_lida'` e timestamp.
   - Salva na store `BrowserB_MensagensRecebidas_DB`.
8. **Exibe notificação nativa** com o nome do remetente (buscado do contato) e o conteúdo.
9. **Notifica as páginas abertas** via `postMessage` com tipo `PUSH_RECEIVED`, para que a UI seja atualizada em tempo real.

### 4.6. Resposta (Responder)
1. Na interface de mensagens recebidas, cada mensagem tem um botão "Responder".
2. Ao clicar, o sistema obtém o hash do contato a partir da mensagem (campo `contatoPublicKeyVapid`).
3. Busca o contato completo no IndexedDB.
4. Preenche o dropdown de seleção de contatos com esse contato (via `select.value`) e navega para a aba de envio.
5. O usuário digita a mensagem e o fluxo de envio (4.3 e 4.4) é executado, enviando a mensagem de volta para o emissor original.

---

## 5. Segurança e Criptografia

| Etapa | Algoritmo/Esquema | Detalhe |
| :--- | :--- | :--- |
| **Assinatura do JWT** | ECDSA P-256 (`ES256`) | Garante que a mensagem não foi adulterada e autentica o emissor. |
| **Cifragem do envelope** | AES-GCM (256 bits) | Cifra o conteúdo da mensagem, garantindo confidencialidade. |
| **Cifragem da chave AES** | RSA-OAEP-256 | A chave AES é cifrada com a chave pública RSA do receptor, permitindo que apenas o receptor (com a chave privada) possa decifrá-la. |
| **Compressão** | Gzip | Reduz o tamanho do payload (necessário devido ao limite de 4096 bytes do Web Push). |
| **Chave privada VAPID** | Envelope RSA-AES (servidor) | A chave privada VAPID do emissor viaja cifrada no perfil. Apenas o servidor proxy (que possui a chave privada RSA correspondente) pode decifrá-la, evitando exposição no cliente. |
| **Persistência de chaves** | IndexedDB (local) | As chaves privadas (VAPID e RSA) são armazenadas em JWK no IndexedDB. Embora não sejam cifradas adicionalmente, o acesso é restrito ao domínio e ao navegador, sendo adequado para protótipos. |

**Observações sobre o limite de 4096 bytes:** O Web Push impõe um limite de 4096 bytes para o payload. Para respeitar esse limite, o sistema utiliza compressão gzip, campos curtos (`ct`, `p`, `nm`) e estrutura compacta do envelope. O tamanho típico do JWT fica em torno de 3700-3800 bytes.

---

## 6. Estrutura do Projeto (Arquivos Relevantes)

| Arquivo | Responsabilidade |
| :--- | :--- |
| `src/app.tsx` | Interface principal (UI) e lógica de negócio (geração de perfil, adição de contato, criação de mensagens na fila). |
| `src/sw/sw-mensagens.js` | Gerencia filas de envio offline. Processa mensagens pendentes: monta payloadObj, cifra, constrói JWT e envia ao servidor proxy. Gerencia tentativas e status. |
| `src/sw/push.js` | Lida com o evento `push`. Verifica assinatura, decifra envelope, salva contato e mensagem no IndexedDB, exibe notificação. |
| `src/sw/cache.js` | Gerencia cache offline para os assets estáticos (HTML, CSS, JS). |
| `src/sw/click.js` | Lida com o evento `notificationclick` – redireciona para a página principal. |
| `src/constants/db.ts` | Define nomes das stores, constantes (`MAX_TENTATIVAS`) e interfaces TypeScript para `ProfileConfig`, `MensagemEnviada`, `MensagemRecebida` e `Contato`. |
| `src/utils/db-helpers.ts` | Funções auxiliares para operações IndexedDB: salvar/buscar perfil, contatos, mensagens enviadas/recebidas, serialização de chaves. |
| `main.ts` | Servidor Deno (proxy). Endpoints: `/api/server-public-key` (retorna chave pública RSA) e `/api/proxy-push` (recebe JSON com subscription e payload, descriptografa a chave privada VAPID, assina e encaminha para o endpoint de push). |
| `build.ts` | Script de build usando `Deno.bundle` com entrypoints HTML. Compila `index.html` (que referencia `app.tsx`), gera bundle JS e atualiza o HTML. Também compila o Service Worker separadamente e injeta lista de assets e hash de versão. |

---

## 7. Build e Execução

### Build
O projeto utiliza **Deno** com `build.ts` para bundling:
- O arquivo `src/index.html` é usado como entrypoint. O Deno bundler detecta a tag `<script src="./app.tsx" type="module">` e compila o código, gerando um arquivo JS com hash e atualizando o HTML.
- O Service Worker é compilado separadamente em modo IIFE e tem seu conteúdo pós-processado para substituir `VERSION_HASH` e `__GENERATED_ASSETS__` pela lista de assets a cachear.

**Observação sobre o CSS:**  
O arquivo `src/styles.css` é importado no `app.tsx` via `import "./styles.css"`. Para que o TypeScript não reclame, criamos um arquivo de declaração (`src/styles.d.ts`) que declara o módulo `.css`. O `Deno.bundle`, ao processar o HTML, reconhece a tag `<link rel="stylesheet" href="./styles.css">` e copia o arquivo CSS para a pasta `dist/`, garantindo que o estilo seja carregado corretamente. A importação no código é mantida para compatibilidade com ferramentas de build futuras e para que o CSS seja tratado como dependência do módulo.

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

- **Perfil unificado**: Todas as informações do usuário (nome, e-mail, chaves VAPID e RSA completas, subscription) são armazenadas em uma única store (`AppConfig_DB`), eliminando duplicação e inconsistências.
- **Persistência de chaves privadas**: Tanto a chave privada VAPID quanto a chave privada RSA são armazenadas como JWK no perfil, garantindo que permaneçam disponíveis após recarregar a página. O envelope da chave privada VAPID (`vapidPrivateKeyEnvelope`) também é persistido, evitando recifragem a cada envio.
- **Fila de envio simplificada**: As mensagens enviadas são armazenadas com status e contador de tentativas, e o Service Worker é responsável por todo o processo de cifragem, montagem do JWT e envio. Isso torna o app mais leve e resiliente.
- **Chave de Contato**: A migração para o hash SHA-256 está completa. Todos os contatos são armazenados com chave hash. As mensagens recebidas salvam o hash do contato (`contatoPublicKeyVapid`).
- **Identificação do Emissor**: O campo `nm` (nome) é incluído no payload do JWT. O Service Worker extrai esse campo para salvar ou atualizar o nome do contato, garantindo que as mensagens exibam o nome correto.
- **Limitação de Payload**: O JWT total deve ser inferior a 4096 bytes. O sistema utiliza compressão gzip, campos curtos (`ct`, `p`, `nm`) e estrutura compacta do envelope.
- **Homologação**: A homologação é um campo booleano no contato, utilizado apenas para fins de interface (ex: exibir "Homologado" ou "Não homologado"). Não bloqueia o recebimento de mensagens.
- **Service Worker**: Durante o desenvolvimento, é necessário desregistrar o Service Worker manualmente (Application → Service Workers → Unregister) e recarregar a página para que a nova versão seja carregada, devido ao cache agressivo.
- **Remoção do Bundle**: A store `BrowserA_Bundles_DB` foi removida. O bundle do emissor é construído dinamicamente a partir do perfil unificado e do contato sempre que necessário.

---

## 9. Próximos Passos

- **Consistência de chaves**: Verificar se todas as operações de contato e mensagem usam corretamente o hash SHA-256, e se não há divergências entre os campos de referência.
- **Atualização de contatos**: Garantir que, ao receber uma nova mensagem de um contato existente, o nome e outros dados sejam atualizados corretamente.
- **Otimização de performance**: Avaliar consultas ao IndexedDB e possíveis índices.
- **Validação do fluxo de resposta**: Testar exaustivamente a resposta, assegurando que a chave privada VAPID cifrada seja corretamente utilizada.
- **Segurança adicional**: Avaliar a possibilidade de cifrar as chaves privadas armazenadas no IndexedDB com uma senha ou chave derivada.

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
| **Envelope** | Estrutura contendo `iv`, `dadosCifrados` e `chaveAesCifrada`, usada para transportar a mensagem cifrada. |
| **MAX_TENTATIVAS** | Constante que define o número máximo de tentativas de envio antes de marcar uma mensagem como falha (padrão 3). |


---

## ✅ Resumo das Atualizações no README

- **Seção 2.3**: Adicionada estrutura de `MensagemEnviada` e constante `MAX_TENTATIVAS`.
- **Seção 3**: Atualizada a tabela de stores com os novos nomes e descrições, incluindo `AppConfig_DB` e `BrowserA_MensagensEnviadas_DB`. Destacada a remoção de `BrowserA_Bundles_DB`.
- **Seção 4.3 e 4.4**: Dividido o fluxo de envio em duas partes: App (criação da mensagem na fila) e Service Worker (processamento completo), detalhando o novo `payloadObj`, as validações e a cifragem.
- **Seção 4.5**: Atualizada a estrutura do objeto decifrado no push para `{ c, e }` e o campo `vapidPrivateKey` agora em `e.s.v`.
- **Seção 6**: Atualizada a tabela de arquivos para refletir as novas responsabilidades.
- **Seção 8**: Atualizado o estado atual com as novas características (perfil unificado, persistência de chaves, fila simplificada).


# Anotações para Ajuste

Vamos melhorar o codigo do "bundle" gerado ao clicar em "Gerar e Compartilhar Meu Perfil" .
Usado para compartilhar os dados do perfil para poder ser importado como contato em outro browser, que agora será um JWT
Segue sugestão de código para gerar token (JWT) de compartilhamento de perfil

```js
// 1. Montar header e payload
const header = { alg: "ES256", kid: profile.vapidPublicKey };
const payloadJwt = {
  iss: profile.email,
  sub: "contact"
  nm: profile.name,
  "p": profile.e2ePublicKey,         // Chave pública RSA (RSA-OAEP-256) em JWK
  "s": {                             // Subscription do Web Push
    "endpoint": profile.subscription.endpoint,
    "keys": {
      "p256dh": profile.subscription.p256dh,
      "auth": profile.subscription.auth
    },
    "k": profile.vapidPrivateKeyEnvelope,   // Chave privada VAPID cifrada (envelope RSA-AES)
    "iat": Date.now()
  }
};

// 2. Codificar em Base64Url
const encoder = new TextEncoder();
const headerB64 = arrayBufferToBase64Url(encoder.encode(JSON.stringify(header)));
const payloadB64 = arrayBufferToBase64Url(encoder.encode(JSON.stringify(payloadJwt)));
const toSign = `${headerB64}.${payloadB64}`;

// 3. Assinar com a chave privada VAPID do emissor
const privateKey = await crypto.subtle.importKey(
  "jwk",
  profile.vapidPrivateKeyJwk,
  { name: "ECDSA", namedCurve: "P-256" },
  false,
  ["sign"]
);
const signature = await crypto.subtle.sign(
  { name: "ECDSA", hash: "SHA-256" },
  privateKey,
  encoder.encode(toSign)
);
const sigB64 = arrayBufferToBase64Url(signature);

// 4. JWT final
const jwt = `${toSign}.${sigB64}`;
```

O outro navegador vai importar este token como um contato, se o jwt for válido e devidamente assinado    

validar o sigB64 com o toSign do jwt recebido
dados obrigatórios :
* header.kid 
* payloadJwt.p 
* payloadJwt.s // completo

Contatos importados manualmente devem ser já considerados homologados desde o inicio

```js
  let contatoExistente = await buscarContatoPorPublicKey(payloadJwt.kid);
  const novoContato = {
    publicKeyVapid: header.kid,
    email: payloadJwt.iss,
    nome: payloadJwt.nm
    publicKeyRSA: payloadJwt.p,
    subscription: {
      endpoint: payloadJwt.s.endpoint,           
      keys: {
        p256dh: payloadJwt.s.keys.p256dh,
        auth: payloadJwt.s.keys.auth     
      };
    }
    vapidPrivateKey: payloadJwt.s.k,
    homologado: true,
    createdAt: contatoExistente ? contatoExistente.createdAt : Date.now(),
    updatedAt: Date.now()
  };
  await salvarContato(novoContato);
```
````

---

## Arquivo: `main.ts`

```ts
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

  // ROTA DE LOGOUT (mantida)
  if (url.pathname === "/api/logout" && req.method === "POST") {
    const headers = new Headers();
    deleteCookie(headers, "session_token", { path: "/" });
    headers.set("Clear-Site-Data", '"cache", "cookies", "storage"');
    return new Response(JSON.stringify({ disconnected: true }), {
      status: 200,
      headers: {
        ...Object.fromEntries(headers.entries()),
        "content-type": "application/json",
      },
    });
  }

  // ROTA DE DISPARO: Processa o envelope VAPID e encaminha o JWT criptografado
  // 🔥 CORREÇÃO: o caminho agora é "/api/proxy-push" (com barra)
  if (req.method === "POST" && url.pathname === "/api/proxy-push") {
    console.log(`\n📥 [${new Date().toLocaleTimeString()}] Nova requisição proxy recebida!`);
    
    try {
      const body = await req.json();
      const { subscription, payloadText, vapid } = body;

      console.log(`   - Endpoint destino: ${subscription.endpoint.substring(0, 45)}...`);
      console.log(`   - Tamanho do payloadText: ${payloadText?.length || 0} bytes`);

      // Executa a auditoria cega das claims do token JWT
      const jwtClaims = lerMetadadosJJWT(payloadText);
      if (jwtClaims) {
        console.log(`   - [AUDITORIA JWT] Emitido por: ${jwtClaims.nm || "Desconhecido"} <${jwtClaims.iss || "Sem e-mail"}>`);
        console.log(`   - [AUDITORIA JWT] Destinado a: <${jwtClaims.sub || "Sem e-mail"}>`);
        console.log(`   - [AUDITORIA JWT] Texto E2EE Criptografado (Hex): ${jwtClaims.cipherText?.substring(0, 20) || "N/A"}...`);
      } else {
        console.log(`   - [AUDITORIA JWT] ⚠️ Não foi possível ler as claims do JWT`);
      }

      let privateKeyFinal = vapid.privateKey;

      // 🔥 DESCRIPTOGRAFIA DA CHAVE PRIVADA VAPID NA RAM
      if (typeof privateKeyFinal === "string") {
        console.log("   - [SEGURANÇA] Descriptografando Chave Privada VAPID com a RSA do Servidor...");
        console.log(`   - [SEGURANÇA] Tamanho do envelope: ${privateKeyFinal.length} bytes`);
        try {
          const decryptedPrivateKeyObj = await decryptWithServerKey(privateKeyFinal);
          privateKeyFinal = decryptedPrivateKeyObj;
          console.log("   - [SEGURANÇA] ✅ Chave VAPID descriptografada com sucesso!");
        } catch (decryptErr) {
          console.error("   - [SEGURANÇA] ❌ Erro ao descriptografar chave VAPID:", decryptErr);
          return new Response(
            JSON.stringify({ success: false, error: "Falha ao descriptografar chave VAPID." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        console.log("   - Chave VAPID não é string, usando como está.");
      }

      // 1. Processa e normatiza as chaves do request
      let jwkKeys;
      try {
        jwkKeys = parseVapidKeysToJwk(vapid.publicKey, privateKeyFinal);
        console.log("   - ✅ Chaves VAPID parseadas com sucesso");
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

