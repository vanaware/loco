> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém múltiplos arquivos do meu projeto estruturados em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Analise a estrutura de pastas, as dependências e o código fornecido para indicar as mudanças necessárias para a implementação das novas funcionalidades discutidas.
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo e não somente as partes que devem ser modificadas.

---

# Código Fonte Selecionado do Projeto

Gerado automaticamente em: 8/5/2026, 10:07:05 PM

---

## Arquivo: `public/manifest.json`

```json
{
  "start_url": "/index.html",
  "scope": "/",
  "name": "loco",
  "short_name": "loco",
  "lang": "pt-BR",
  "icons": [
    {
      "src": "/android-chrome-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/android-chrome-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ],
  "theme_color": "#3b82f6",
  "background_color": "#60a5fa",
  "display": "standalone"
}
```

---

## Arquivo: `src/sw/cache.ts`

```ts
// src/sw/cache.js

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

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

## Arquivo: `src/sw/click.ts`

```ts
// src/sw/click.js

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

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

## Arquivo: `src/sw/sw-mensagens.ts`

```ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { get, set, createStore, del, entries } from "idb-keyval";
import { gunzipSync } from "fflate";
import { DB_NAMES, STORE_NAMES, KEY_NAMES, MAX_TENTATIVAS } from "../constants/db.ts";
import { base64UrlToArrayBuffer, criarJWT } from "../utils/jwt-helpers.ts";
import { gerarIdMensagem } from "../utils/id-utils.ts";
import {
  buscarContatoPorChave,
  serializarPublicKeyVapid,
  listarHandshakesPorMensagemId,
  salvarHandshake,
  listarMensagensEnviadasPorStatus,
  atualizarStatusMensagemEnviada,
  salvarMensagemEnviada,
  buscarMensagemEnviada,
  salvarProfile,
  buscarProfile,
  buscarChaveDecript,
  salvarContato,
  buscarContatoPorPublicKey,
  salvarMensagemRecebida,
} from "../utils/db-helpers.ts";
import { cifrarPayloadObj, enviarParaProxy, cifrarChaveVapid } from "../utils/push-utils.ts";
import { processarFilaHandshake } from "./sw-handshakes.ts";

// ============================================================
// FUNÇÃO PRINCIPAL: PROCESSAR MENSAGEM RECEBIDA (sub: "msg")
// ============================================================
export async function processarMensagemRecebida(payload: any, header: any, jwt: string) {
  console.log("[SW-MSG] 📩 Processando mensagem recebida...");

  try {
    const profile = await buscarProfile();
    if (!profile) {
      throw new Error("Perfil do receptor não encontrado.");
    }

    const aud = payload.aud || payload.sub;
    if (aud !== profile.email) {
      console.warn(`[SW-MSG] ⚠️ 'aud' não corresponde ao email do perfil. Esperado: ${profile.email}, Recebido: ${aud}`);
    }

    const jti = payload.jti || gerarIdMensagem();
    console.log(`[SW-MSG] 📋 jti: ${jti}`);

    const publicKeyVapid = header.kid;
    if (!publicKeyVapid) {
      throw new Error("Header JWT não contém 'kid' (chave pública VAPID).");
    }

    const emailRemetente = payload.iss || "remetente@desconhecido";
    const nomeRemetente = payload.nm || payload.name || emailRemetente.split('@')[0] || "Remetente";
    console.log(`[SW-MSG] 🔐 Mensagem de ${nomeRemetente} <${emailRemetente}>`);

    let contato = null;
    if (publicKeyVapid) {
      contato = await buscarContatoPorPublicKey(publicKeyVapid);
      if (contato) {
        console.log(`[SW-MSG] Contato existente encontrado: ${contato.email}`);
      }
    }

    const privateDecryptKey = await buscarChaveDecript();
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

    const ivBytes = new Uint8Array(base64UrlToArrayBuffer(iv));
    const dadosBytes = new Uint8Array(base64UrlToArrayBuffer(dados));
    const chaveAesCifradaBytes = new Uint8Array(base64UrlToArrayBuffer(chaveAesCifrada));

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

    let mensagemObj = JSON.parse(textoDecifrado);
    const conteudo = mensagemObj.c || textoDecifrado;

    const e = mensagemObj.e || {};
    const subscription = e.s ? {
      endpoint: e.s.e || e.s.endpoint,
      keys: e.s.k || e.s.keys
    } : null;
    const publicKeyRSA = e.p || null;
    const vapidPrivateKey = (e.s && e.s.v) ? e.s.v : null;

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
      console.warn("[SW-MSG] ⚠️ Dados insuficientes para salvar contato.");
    }

    const msgId = jti;
    const contatoKey = publicKeyVapid ? await serializarPublicKeyVapid(publicKeyVapid) : '';
    const mensagemRecebida = {
      id: msgId,
      contatoPublicKeyVapid: contatoKey,
      conteudo: conteudo,
      status: 'nao_lida',
      recebidoEm: Date.now()
    };
    await salvarMensagemRecebida(mensagemRecebida);

    if (contatoKey) {
      await criarHandshakeConfirmacaoEntrega(msgId, contatoKey);
    } else {
      console.warn("[SW-MSG] ⚠️ Não foi possível criar handshake: contatoKey vazio.");
    }

    const homologadoFinal = contato ? contato.homologado : false;
    const podeResponder = !!(contato && contato.subscription && contato.publicKeyRSA && contato.vapidPrivateKey);
    const statusEmoji = homologadoFinal ? '✅' : '🔄';
    const statusTexto = homologadoFinal ? 'Homologado' : 'Não homologado';

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
        homologado: homologadoFinal,
        podeResponder: podeResponder,
        acao: homologadoFinal ? 'ver_mensagem' : 'homologar_emissor'
      },
      tag: msgId,
      requireInteraction: !homologadoFinal,
      vibrate: [200, 100, 200]
    });

    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(client => {
      client.postMessage({
        type: "PUSH_RECEIVED",
        payload: {
          id: msgId,
          body: conteudo,
          remetente: nomeRemetente,
          homologado: homologadoFinal,
          podeResponder: podeResponder,
          status: 'nao_lida',
          audMismatch: aud !== profile.email
        }
      });
    });

  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao processar mensagem:", err);
    throw err;
  }
}

// ============================================================
// FUNÇÃO PARA CRIAR HANDSHAKE DE CONFIRMAÇÃO DE ENTREGA
// ============================================================
async function criarHandshakeConfirmacaoEntrega(mensagemId: string, contatoPublicKeyVapid: string) {
  console.log(`[SW-MSG] 🔄 Criando handshake de confirmação para mensagem ${mensagemId}`);
  try {
    const handshakesExistentes = await listarHandshakesPorMensagemId(mensagemId);
    if (handshakesExistentes.some(h => h.tipo === 'confirmacao_entrega' && h.direcao === 'out')) {
      console.log(`[SW-MSG] ℹ️ Handshake de confirmação já existe para ${mensagemId}.`);
      return;
    }

    const contato = await buscarContatoPorChave(contatoPublicKeyVapid);
    if (!contato) {
      throw new Error(`Contato para a mensagem ${mensagemId} não encontrado.`);
    }

    const handshakeId = gerarIdMensagem();
    const handshake = {
      id: handshakeId,
      mensagemId: mensagemId,
      tipo: 'confirmacao_entrega',
      direcao: 'out',
      status: 'pendente',
      tentativas: 0,
      payload: { recebidoEm: Date.now() },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await salvarHandshake(handshake);
    console.log(`[SW-MSG] ✅ Handshake ${handshakeId} salvo com status 'pendente'.`);

    // Disparar processamento imediato da fila de handshakes (agora com importação direta)
    await processarFilaHandshake();
    console.log(`[SW-MSG] ✅ Processamento da fila de handshakes iniciado.`);

    // Notifica janelas abertas (opcional)
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(client => {
      client.postMessage({ type: 'HANDSHAKE_CRIADO', payload: { handshakeId, mensagemId } });
    });

  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao criar handshake:", err);
  }
}

// ============================================================
// FUNÇÃO DE PROCESSAMENTO DA FILA DE ENVIO
// ============================================================
export async function processarFilaEnvio() {
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
        const contato = await buscarContatoPorChave(msg.contatoHash);
        let profile = await buscarProfile();

        if (!contato) throw new Error("Contato não encontrado");
        if (!profile) throw new Error("Perfil não encontrado");

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

        let vapidPrivateKeyEnvelope = profile.vapidPrivateKeyEnvelope;
        if (!vapidPrivateKeyEnvelope) {
          console.warn("[SW-MSG] ⚠️ Envelope da chave VAPID não encontrado. Cifrando...");
          const res = await fetch("/api/server-public-key");
          if (!res.ok) throw new Error("Não foi possível obter a chave pública do servidor.");
          const serverPublicKeyJwk = await res.json();
          vapidPrivateKeyEnvelope = await cifrarChaveVapid(profile.vapidPrivateKeyJwk, serverPublicKeyJwk);
          profile.vapidPrivateKeyEnvelope = vapidPrivateKeyEnvelope;
          await salvarProfile(profile);
        }

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

        const envelope = await cifrarPayloadObj(payloadObj, contato.publicKeyRSA);
        const envelopeJson = JSON.stringify(envelope);

        const payloadJwt = {
          iss: profile.email,
          sub: "msg",
          aud: contato.email,
          jti: msg.id,
          ct: envelopeJson,
          nm: profile.name
        };

        const jwt = await criarJWT(payloadJwt, profile.vapidPrivateKeyJwk, { kid: profile.vapidPublicKey });
const MAX_PAYLOAD_SIZE = 4096;
if (jwt.length > MAX_PAYLOAD_SIZE) {
  throw new Error(`Payload excede limite de ${MAX_PAYLOAD_SIZE} bytes (tamanho atual: ${jwt.length})`);
}
        await enviarParaProxy(
          contato.subscription,
          jwt,
          {
            subject: `mailto:${contato.email}`,
            publicKey: contato.publicKeyVapid,
            privateKey: contato.vapidPrivateKey
          }
        );

        await atualizarStatusMensagemEnviada(msg.id, 'enviada');
        console.log(`[SW-MSG] ✅ Mensagem ${msg.id} enviada com sucesso!`);

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
// LISTENERS DE EVENTOS (permanecem usando self para os eventos)
// ============================================================
self.addEventListener('message', async (event) => {
  const data = event.data;
  if (data.type === 'PROCESSAR_FILA_ENVIO') {
    console.log("[SW-MSG] 📩 Recebido comando para processar fila de envio.");
    await processarFilaEnvio();
  }
});

self.addEventListener('sync', async function(event) {
  if (event.tag === 'sync-envio-mensagens') {
    event.waitUntil(processarFilaEnvio());
  }
});

self.addEventListener('online', async function() {
  console.log("[SW-MSG] 🌐 Conexão restaurada, processando filas...");
  await processarFilaEnvio();
});

console.log("[SW-MSG] 📦 Módulo de mensagens carregado.");
```

---

## Arquivo: `src/sw/sw-handshakes.ts`

```ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { get, createStore } from "idb-keyval";
import { gunzipSync } from "fflate";
import { DB_NAMES, STORE_NAMES, KEY_NAMES, MAX_TENTATIVAS } from "../constants/db.ts";
import { base64UrlToArrayBuffer } from "../utils/jwt-helpers.ts";
import {
  salvarHandshake,
  listarHandshakesPendentesPorTipo,
  atualizarStatusHandshake,
  buscarMensagemEnviada,
  atualizarStatusMensagemEnviada,
  salvarProfile,
  buscarContatoPorChave,
  buscarHandshake,
  buscarProfile,
  buscarChaveDecript,
  listarHandshakes,
} from "../utils/db-helpers.ts";
import { criarJWT } from "../utils/jwt-helpers.ts";
import { cifrarPayloadObj, enviarParaProxy, cifrarChaveVapid } from "../utils/push-utils.ts";

// ============================================================
// FUNÇÃO PARA PROCESSAR HANDSHAKE RECEBIDO (sub: "hand")
// ============================================================
export async function processarHandshakeRecebido(payload: any, header: any, jwt: string) {
  console.log("[SW-HANDSHAKE] 🤝 Processando handshake recebido...");

  try {
    if (!payload.jti) throw new Error("Handshake sem jti");
    if (!payload.aud) throw new Error("Handshake sem aud (mensagemId esperada)");
    if (!payload.ct) throw new Error("Handshake sem ct (envelope cifrado)");

    const privateDecryptKey = await buscarChaveDecript();
    if (!privateDecryptKey) {
      throw new Error("Chave privada RSA não disponível para decifrar handshake.");
    }

    const envelopeJson = payload.ct;
    const envelope = JSON.parse(envelopeJson);
    const iv = envelope.i || envelope.iv;
    const dados = envelope.d || envelope.dadosCifrados;
    const chaveAesCifrada = envelope.k || envelope.chaveAesCifrada;
    if (!iv || !dados || !chaveAesCifrada) throw new Error("Envelope incompleto.");

    const ivBytes = new Uint8Array(base64UrlToArrayBuffer(iv));
    const dadosBytes = new Uint8Array(base64UrlToArrayBuffer(dados));
    const chaveAesCifradaBytes = new Uint8Array(base64UrlToArrayBuffer(chaveAesCifrada));

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
    const payloadObj = JSON.parse(textoDecifrado);

    if (!payloadObj.htype) throw new Error("Handshake sem htype no envelope");

    const mensagemId = payload.aud;

    const handshake = {
      id: payload.jti,
      mensagemId: mensagemId,
      tipo: payloadObj.htype,
      direcao: 'in',
      status: 'entregue',
      tentativas: 0,
      payload: payloadObj,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await salvarHandshake(handshake);
    console.log(`[SW-HANDSHAKE] ✅ Handshake ${handshake.id} (tipo: ${handshake.tipo}) recebido para mensagem ${mensagemId}.`);

    if (payloadObj.htype === 'confirmacao_entrega') {
      try {
        const mensagemEnviada = await buscarMensagemEnviada(mensagemId);
        if (mensagemEnviada) {
          await atualizarStatusMensagemEnviada(mensagemId, 'entregue');
          console.log(`[SW-HANDSHAKE] ✅ Mensagem enviada ${mensagemId} marcada como entregue.`);

          const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          clients.forEach(client => {
            client.postMessage({
              type: 'MENSAGEM_ENTREGUE',
              payload: {
                mensagemId: mensagemId,
                entregueEm: Date.now(),
              }
            });
          });
        } else {
          console.warn(`[SW-HANDSHAKE] ⚠️ Mensagem enviada ${mensagemId} não encontrada.`);
        }
      } catch (err) {
        console.error(`[SW-HANDSHAKE] ❌ Erro ao marcar mensagem enviada ${mensagemId} como entregue:`, err);
      }
    }

  } catch (err) {
    console.error("[SW-HANDSHAKE] ❌ Erro ao processar handshake:", err);
    throw err;
  }
}

// ============================================================
// FUNÇÃO PARA PROCESSAR FILA DE HANDSHAKES (envio)
// ============================================================
export async function processarFilaHandshake() {
  console.log("[SW-HANDSHAKE] 🔄 Processando fila de handshakes...");

  try {
    const pendentes = await listarHandshakesPendentesPorTipo('confirmacao_entrega');
    const todos = await listarHandshakes();
    const enviandoAntigos = todos.filter(
      h => h.tipo === 'confirmacao_entrega' &&
           h.direcao === 'out' &&
           h.status === 'enviando' &&
           (Date.now() - h.updatedAt) > 30000
    );

    const paraProcessar = [...pendentes, ...enviandoAntigos];

    if (paraProcessar.length === 0) {
      console.log("[SW-HANDSHAKE] ℹ️ Nenhum handshake pendente.");
      return;
    }

    console.log(`[SW-HANDSHAKE] 📦 ${paraProcessar.length} handshakes para processar (${pendentes.length} pendentes, ${enviandoAntigos.length} reenfileirados)`);

    for (const handshake of paraProcessar) {
      await atualizarStatusHandshake(handshake.id, 'enviando');

      try {
        const storeMensagensRecebidas = createStore(DB_NAMES.MENSAGENS_RECEBIDAS_B, STORE_NAMES.KEYVAL);
        const mensagemRecebida = await get(handshake.mensagemId, storeMensagensRecebidas);
        if (!mensagemRecebida) {
          throw new Error(`Mensagem ${handshake.mensagemId} não encontrada no banco.`);
        }

        const contato = await buscarContatoPorChave(mensagemRecebida.contatoPublicKeyVapid);
        if (!contato) {
          throw new Error(`Contato para a mensagem ${handshake.mensagemId} não encontrado.`);
        }

        let profile = await buscarProfile();
        if (!profile) throw new Error("Perfil não encontrado");

        if (!profile.e2ePublicKey || !profile.vapidPublicKey || !profile.vapidPrivateKeyJwk) {
          throw new Error("Usuário não logado (sem Chaves)");
        }
        if (!profile.subscription) {
          throw new Error("Web Push não configurado (sem Subscription)");
        }
        if (!contato.publicKeyRSA || !contato.publicKeyVapid || !contato.vapidPrivateKey) {
          throw new Error("Contato sem Chaves");
        }
        if (!contato.subscription) {
          throw new Error("Contato sem Subscription");
        }

        let vapidPrivateKeyEnvelope = profile.vapidPrivateKeyEnvelope;
        if (!vapidPrivateKeyEnvelope) {
          console.warn("[SW-HANDSHAKE] ⚠️ Envelope VAPID não encontrado. Cifrando...");
          const res = await fetch("/api/server-public-key");
          if (!res.ok) throw new Error("Não foi possível obter chave pública do servidor.");
          const serverPublicKeyJwk = await res.json();
          vapidPrivateKeyEnvelope = await cifrarChaveVapid(profile.vapidPrivateKeyJwk, serverPublicKeyJwk);
          profile.vapidPrivateKeyEnvelope = vapidPrivateKeyEnvelope;
          await salvarProfile(profile);
        }

        const payloadObj = {
          htype: handshake.tipo,
        };

        const envelope = await cifrarPayloadObj(payloadObj, contato.publicKeyRSA);
        const envelopeJson = JSON.stringify(envelope);

        const payloadJwt = {
          iss: profile.email,
          sub: "hand",
          aud: handshake.mensagemId,
          jti: handshake.id,
          ct: envelopeJson,
        };

        const jwt = await criarJWT(payloadJwt, profile.vapidPrivateKeyJwk, { kid: profile.vapidPublicKey });

        console.log(`[SW-HANDSHAKE] 📤 Enviando handshake ${handshake.id} para ${contato.email}`);
const MAX_PAYLOAD_SIZE = 4096;
if (jwt.length > MAX_PAYLOAD_SIZE) {
  throw new Error(`Payload excede limite de ${MAX_PAYLOAD_SIZE} bytes (tamanho atual: ${jwt.length})`);
}
        await enviarParaProxy(
          contato.subscription,
          jwt,
          {
            subject: `mailto:${contato.email}`,
            publicKey: contato.publicKeyVapid,
            privateKey: contato.vapidPrivateKey,
          }
        );

        await atualizarStatusHandshake(handshake.id, 'enviado');
        console.log(`[SW-HANDSHAKE] ✅ Handshake ${handshake.id} enviado com sucesso!`);
      } catch (err) {
        console.error(`[SW-HANDSHAKE] ❌ Erro ao enviar handshake ${handshake.id}:`, err);
        const handshakeAtual = await buscarHandshake(handshake.id);
        if (handshakeAtual) {
          handshakeAtual.tentativas++;
          handshakeAtual.erro = err.message;
          if (handshakeAtual.tentativas >= MAX_TENTATIVAS) {
            handshakeAtual.status = 'falha';
            console.log(`[SW-HANDSHAKE] ⛔ Handshake ${handshake.id} excedeu tentativas máximas.`);
          } else {
            handshakeAtual.status = 'pendente';
          }
          handshakeAtual.updatedAt = Date.now();
          await salvarHandshake(handshakeAtual);
        }
      }
    }
  } catch (err) {
    console.error("[SW-HANDSHAKE] ❌ Erro ao processar fila:", err);
  }
}

// ============================================================
// LISTENERS DE EVENTOS
// ============================================================
self.addEventListener('message', async (event) => {
  const data = event.data;
  if (data.type === 'PROCESSAR_FILA_HANDSHAKE') {
    console.log("[SW-HANDSHAKE] 📩 Recebido comando para processar fila de handshakes.");
    await processarFilaHandshake();
  }
});

self.addEventListener('sync', async function (event) {
  if (event.tag === 'sync-envio-handshakes') {
    event.waitUntil(processarFilaHandshake());
  }
});

self.addEventListener('online', async function () {
  console.log("[SW-HANDSHAKE] 🌐 Conexão restaurada, processando handshakes...");
  await processarFilaHandshake();
});

console.log("[SW-HANDSHAKE] 📦 Módulo de handshakes carregado.");
```

---

## Arquivo: `src/sw/push.ts`

```ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { verificarJWT } from "../utils/jwt-helpers.ts";
import { processarMensagemRecebida } from "./sw-mensagens.ts";
import { processarHandshakeRecebido } from "./sw-handshakes.ts";
import type { PayloadMensagem, PayloadHandshake } from "../constants/db.ts";

console.log("[SW-PUSH-ROUTER] 🔀 Router de push carregado.");

self.addEventListener('push', function (event) {
  if (!event.data) return;
  const rawText = event.data.text();
  console.log("[SW-PUSH-ROUTER] 📩 Push recebido, tamanho:", rawText.length);

  if (rawText.split('.').length !== 3) {
    event.waitUntil(
      self.registration.showNotification("Notificação", { body: rawText })
    );
    return;
  }

  event.waitUntil(
    (async function () {
      try {
        const { header, payload, valid } = await verificarJWT(rawText);
        if (!valid) {
          await self.registration.showNotification("⚠️ Assinatura inválida", {
            body: `Mensagem rejeitada.`,
            icon: '/icon.png',
          });
          return;
        }

        if (payload.sub === "hand") {
          await processarHandshakeRecebido(payload as PayloadHandshake, header, rawText);
          return;
        }

        if (payload.sub === "msg") {
          await processarMensagemRecebida(payload as PayloadMensagem, header, rawText);
          return;
        }

        await self.registration.showNotification("⚠️ Tipo de mensagem inválido", {
          body: `Esperado 'msg' ou 'hand', recebido '${payload.sub}'`,
          icon: '/icon.png',
        });
        console.warn(`[SW-PUSH-ROUTER] ⚠️ JWT com sub inválido: ${payload.sub}`);
      } catch (err) {
        console.error("[SW-PUSH-ROUTER] ❌ Erro no router:", err);
        await self.registration.showNotification("⚠️ Erro ao processar push", {
          body: err.message || "Falha no processamento.",
          icon: '/icon.png',
        });
      }
    })()
  );
});

console.log("[SW-PUSH-ROUTER] ✅ Router configurado.");
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
  HANDSHAKES: "Handshake_DB",
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
export const MAX_PAYLOAD_SIZE = 4096;

// ============================================================
// INTERFACES PRINCIPAIS (UNIFICADAS)
// ============================================================

export interface ProfileConfig {
  name: string;
  email: string;
  vapidPublicKey: JsonWebKey;
  vapidPrivateKeyJwk: JsonWebKey;
  vapidPrivateKeyEnvelope: string;
  e2ePublicKey: JsonWebKey;
  e2ePrivateKeyJwk: JsonWebKey;
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
  createdAt: number;
  updatedAt: number;
}

// ============================================================
// INTERFACES DE DADOS
// ============================================================

export interface MensagemEnviada {
  id: string;
  contatoHash: string;
  conteudo: string;
  status: 'pendente' | 'enviando' | 'enviada' | 'falha' | 'entregue';
  tentativas: number;
  createdAt: number;
  updatedAt: number;
  erro?: string;
}

export interface MensagemRecebida {
  id: string;
  contatoPublicKeyVapid: string;
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
  vapidPrivateKey: string;
  homologado: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Handshake {
  id: string;
  mensagemId: string;
  tipo: 'confirmacao_entrega';
  direcao: 'out' | 'in';
  status: 'pendente' | 'enviado' | 'falha' | 'entregue';
  tentativas: number;
  payload: any;
  createdAt: number;
  updatedAt: number;
  erro?: string;
}

// ============================================================
// 🔥 PAYLOADS DE JWT (CORREÇÃO)
// ============================================================

export interface PayloadMensagem {
  iss: string;
  sub: "msg";
  aud: string;
  jti: string;
  ct: string;          // envelope JSON
  nm: string;
  iat?: number;
}

export interface PayloadHandshake {
  iss: string;
  sub: "hand";
  aud: string;         // mensagemId
  jti: string;
  ct: string;          // envelope JSON
}

export interface PayloadContato {
  iss: string;
  sub: "contact";
  nm: string;
  p: JsonWebKey;
  s: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    k: string;         // envelope VAPID privada
  };
  iat: number;
}

export interface EnvelopeCifrado {
  i: string;  // iv base64
  d: string;  // dados cifrados base64
  k: string;  // chave AES cifrada base64
}

export interface ConteudoMensagem {
  c: string;  // texto
  e: {
    s?: {
      e?: string;  // endpoint (alternativo)
      endpoint?: string;
      k?: { p256dh: string; auth: string };
      keys?: { p256dh: string; auth: string };
      v?: string;  // envelope VAPID privada
    };
    p?: JsonWebKey;
  };
}

export interface ConteudoHandshake {
  htype: 'confirmacao_entrega';
  // outros campos opcionais
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

## Arquivo: `src/utils/id-utils.ts`

```ts
// src/utils/id-utils.ts

/**
 * Tamanho padrão do ID para mensagens.
 * 12 caracteres oferecem ~10^18 combinações, suficiente para protótipo.
 */
const ID_LENGTH = 12;

/**
 * Caracteres seguros para URL usados em IDs (como NanoID).
 * Remove: +, /, = (caracteres perigosos para URLs)
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

/**
 * Gera um ID único para mensagens usando Web Crypto API.
 * Substitui nanoid (que usa node:crypto no esm.sh) com implementação pura browser-safe.
 * @param length - Tamanho do ID (padrão: 12)
 * @returns ID único (ex: "V1StGXR8_Z5jd")
 */
export function gerarIdMensagem(length: number = ID_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  
  let id = "";
  for (let i = 0; i < length; i++) {
    id += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return id;
}

/**
 * Verifica se um ID é válido (tem o formato esperado).
 * @param id - ID a ser validado
 * @returns true se o ID parece válido
 */
export function validarIdMensagem(id: string): boolean {
  // NanoID usa caracteres A-Z, a-z, 0-9, _, -
  return /^[A-Za-z0-9_-]+$/.test(id) && id.length >= 8;
}

/**
 * Gera um ID de fallback para situações onde o nanoID não está disponível.
 * @returns ID de fallback (timestamp + random)
 */
export function gerarIdFallback(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
}
```

---

## Arquivo: `src/utils/push-utils.ts`

```ts

import { gzipSync } from "fflate";

// ============================================================
// UTILITÁRIOS DE CRIPTOGRAFIA
// ============================================================

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * Cifra um payloadObj (objeto JavaScript) usando AES-GCM e RSA-OAEP.
 * Retorna envelope: { i: ivBase64, d: dadosCifradosBase64, k: chaveAesCifradaBase64 }
 */
export async function cifrarPayloadObj(payloadObj: any, publicKeyRSA: JsonWebKey): Promise<{
  i: string;
  d: string;
  k: string;
}> {
  const encoder = new TextEncoder();
  const jsonString = JSON.stringify(payloadObj);
  const bytes = encoder.encode(jsonString);
  const compressed = gzipSync(bytes);
  console.log(`[PUSH-UTILS] 📦 Comprimido: ${compressed.length} bytes (original: ${bytes.length})`);

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

/**
 * Envia um payload JWT para o servidor proxy.
 * subscription: objeto com endpoint e keys.
 * payloadText: string JWT.
 * vapid: { subject, publicKey, privateKey } (privateKey pode ser envelope cifrado).
 * Retorna true se sucesso, lança erro em caso de falha.
 */
export async function enviarParaProxy(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payloadText: string,
  vapid: { subject: string; publicKey: JsonWebKey; privateKey: string }
): Promise<void> {
  const response = await fetch("/api/proxy-push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription,
      payloadText,
      vapid: {
        subject: vapid.subject,
        publicKey: vapid.publicKey,
        privateKey: vapid.privateKey // envelope ou JWK
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
}

/**
 * Cifra a chave privada VAPID (JWK) com a chave pública do servidor.
 * Retorna envelope base64.
 */
export async function cifrarChaveVapid(privateKeyJwk: JsonWebKey, serverPublicKeyJwk: JsonWebKey): Promise<string> {
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
  const toHex = (buf: ArrayBuffer) =>
    Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  const envelope = {
    iv: toHex(iv.buffer),
    dadosCifrados: toHex(vapidCifrado),
    chaveAesCifrada: toHex(aesKeyCifrado)
  };
  return btoa(JSON.stringify(envelope));
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
  Handshake,
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
export const storeHandshakes = criarStore(DB_NAMES.HANDSHAKES);

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
// 🔥 Função para buscar e importar a chave privada RSA (decodificação)
// ============================================================
export async function buscarChaveDecript(): Promise<CryptoKey | null> {
  try {
    const profile = await buscarProfile();
    if (!profile) {
      console.warn("[DB-HELPERS] ⚠️ Perfil não encontrado.");
      return null;
    }
    if (!profile.e2ePrivateKeyJwk) {
      console.warn("[DB-HELPERS] ⚠️ Chave privada RSA não encontrada no perfil.");
      return null;
    }

    const privateDecrypt = await crypto.subtle.importKey(
      "jwk",
      profile.e2ePrivateKeyJwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["decrypt"]
    );
    console.log("[DB-HELPERS] 🔑 Chave de decodificação RSA encontrada e importada.");
    return privateDecrypt;
  } catch (err) {
    console.error("[DB-HELPERS] ❌ Erro ao buscar chave de decodificação:", err);
    return null;
  }
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

export async function listarMensagensEnviadasPorStatus(status: MensagemEnviada['status']): Promise<MensagemEnviada[]> {
  const todas = await listarMensagensEnviadas();
  return todas.filter(m => m.status === status);
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

// ============================================================
// Handshakes
// ============================================================

export async function salvarHandshake(handshake: Handshake): Promise<void> {
  handshake.updatedAt = Date.now();
  if (!handshake.createdAt) {
    handshake.createdAt = Date.now();
  }
  await salvarChave(storeHandshakes, handshake.id, handshake);
}

export async function buscarHandshake(id: string): Promise<Handshake | undefined> {
  return buscarChave<Handshake>(storeHandshakes, id);
}

export async function listarHandshakes(): Promise<Handshake[]> {
  const entries = await listarChaves<Handshake>(storeHandshakes);
  return entries.map(([_, h]) => h);
}

export async function listarHandshakesPorStatus(status: Handshake['status']): Promise<Handshake[]> {
  const todos = await listarHandshakes();
  return todos.filter(h => h.status === status);
}

export async function listarHandshakesPendentesPorTipo(tipo: Handshake['tipo']): Promise<Handshake[]> {
  const todos = await listarHandshakes();
  return todos.filter(h => h.status === 'pendente' && h.tipo === tipo && h.direcao === 'out');
}

export async function atualizarStatusHandshake(id: string, status: Handshake['status'], erro?: string): Promise<void> {
  const handshake = await buscarHandshake(id);
  if (handshake) {
    handshake.status = status;
    handshake.updatedAt = Date.now();
    if (erro) handshake.erro = erro;
    await salvarHandshake(handshake);
  }
}

export async function removerHandshake(id: string): Promise<void> {
  await removerChave(storeHandshakes, id);
}

export async function listarHandshakesPorMensagemId(mensagemId: string): Promise<Handshake[]> {
  const todos = await listarHandshakes();
  return todos.filter(h => h.mensagemId === mensagemId);
}
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
      
      <!-- ============================================================ -->
      <!-- 🔥 CONTAINER PARA MENSAGENS ENVIADAS (adicionado)             -->
      <!-- ============================================================ -->
      <div class="mt-10">
        <label>📤 Mensagens Enviadas:</label>
        <div id="mensagensEnviadasB" style="max-height: 250px; overflow-y: auto; background: white; padding: 10px; border-radius: 4px; border: 1px solid #ddd; margin-top: 5px;">
          <p style="color: #666; font-size: 14px;">Nenhuma mensagem enviada.</p>
        </div>
      </div>
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
        </div>
      </div>
      <div id="mensagensRecebidas">
        <p style="color: #666;">Nenhuma mensagem recebida ainda.</p>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- DEBUG PANEL (visible logs on the page)                        -->
    <!-- ============================================================ -->
    <div class="container" style="background: #f5f5f5; border: 2px dashed #999; margin-top: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <h2 style="margin: 0;">🔍 Debug Logs</h2>
        <button id="btnClearDebugLogs" class="btn-sm" style="background-color: #ff6b6b;">🗑️ Limpar Logs</button>
      </div>
      <div id="debugPanel" style="background: #000; color: #0f0; font-family: 'Courier New', monospace; font-size: 12px; padding: 10px; border-radius: 4px; max-height: 300px; overflow-y: auto; white-space: pre-wrap; word-break: break-word;">
        Aguardando logs...
      </div>
    </div>

    <!-- Ponto de entrada -->
    <script src="./app.tsx" type="module"></script>
  </body>
</html>
```

---

## Arquivo: `src/service-worker.ts`

```ts
// src/service-worker.ts
import "./sw/cache.ts";
import "./sw/push.ts";
import "./sw/click.ts";
import "./sw/sw-mensagens.ts";
import "./sw/sw-handshakes.ts";
import { processarFilaEnvio } from "./sw/sw-mensagens.ts";
import { processarFilaHandshake } from "./sw/sw-handshakes.ts";

console.log("[SW] 🌌 Service Worker orquestrador carregado.");

// Ativação: processar filas pendentes (com await adequado)
self.addEventListener('activate', (event) => {
  console.log("[SW] 🔄 Ativando e agendando processamento de filas pendentes...");
  event.waitUntil(
    (async () => {
      // Aguarda 1 segundo antes de iniciar
      await new Promise(r => setTimeout(r, 1000));
      try {
        await processarFilaEnvio();
      } catch (e) {
        console.error("[SW] Erro ao processar fila de envio:", e);
      }
      try {
        await processarFilaHandshake();
      } catch (e) {
        console.error("[SW] Erro ao processar fila de handshakes:", e);
      }
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

import { gerarIdMensagem } from "./utils/id-utils.ts";
import { cifrarChaveVapid } from "./utils/push-utils.ts";

// ============================================================
// DEBUG LOGGER
// ============================================================
const debugLogs: string[] = [];

function addDebugLog(msg: string): void {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = `[${timestamp}] ${msg}`;
  debugLogs.push(logEntry);
  console.log(msg);
  updateDebugPanel();
}

function updateDebugPanel(): void {
  const panel = document.getElementById('debugPanel');
  if (panel) {
    const html = debugLogs.map(log => `<div>${escapeHtml(log)}</div>`).join('\n');
    panel.innerHTML = html;
    try {
      panel.scrollTop = panel.scrollHeight;
    } catch (e) {
      // ignore
    }
  }
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function clearDebugLogs(): void {
  debugLogs.length = 0;
  updateDebugPanel();
}

addDebugLog("🟢 [APP] Web Push Descentralizado - Perfis e Contatos (unificado)");

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
// SERVICE WORKER REGISTRATION
// ============================================================
let swMessageListenerAdded = false;

async function registrarServiceWorker(): Promise<ServiceWorkerRegistration> {
  addDebugLog("📡 Verificando suporte ao Service Worker...");
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Worker não é suportado neste navegador.");
  }

  const cacheBuster = Date.now();
  addDebugLog("⏳ Registrando/Atualizando Service Worker...");

  try {
    const registration = await navigator.serviceWorker.register(
      `./service-worker.js?cacheBuster=${cacheBuster}`,
      { scope: "/" }
    );
    
    if (!registration) {
      throw new Error("Service Worker registration retornou null/undefined");
    }
    
    addDebugLog("✅ Service Worker registrado, aguardando ready...");
    const readyReg = await navigator.serviceWorker.ready;
    addDebugLog("✅ Service Worker ativo e pronto.");

    if (!swMessageListenerAdded) {
      swMessageListenerAdded = true;
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'PUSH_RECEIVED') {
          addDebugLog('📬 Push recebido, recarregando mensagens...');
          const payload = event.data.payload;
          showToast(`📩 Nova mensagem de ${payload?.remetente || 'alguém'}!`, "info");
          setTimeout(() => {
            carregarMensagensRecebidas();
            carregarContatos();
          }, 1000);
        }
        if (event.data?.type === 'MENSAGEM_ENTREGUE') {
          addDebugLog('📨 Mensagem entregue: ' + JSON.stringify(event.data.payload));
          showToast(`✅ Mensagem ${event.data.payload.mensagemId} entregue!`, "success");
          carregarMensagensEnviadas();
        }
      });
    }

    return readyReg;
  } catch (err: any) {
    addDebugLog("❌ Erro ao registrar Service Worker: " + (err?.message || String(err)));
    throw new Error(`Falha ao registrar Service Worker: ${err?.message || String(err)}`);
  }
}

// ============================================================
// GERAÇÃO DE CHAVES E2E (RSA)
// ============================================================
async function generateE2EEKeys() {
  addDebugLog("🔑 Gerando chaves E2E (RSA-2048)...");
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
// GERAÇÃO DE CHAVES VAPID (ECDSA)
// ============================================================
async function generateVAPIDKeys(): Promise<CryptoKeyPair> {
  addDebugLog("🔑 Gerando chaves VAPID (ECDSA P-256)...");
  return await window.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
}

// ============================================================
// GERAR PERFIL (profile) – unificado
// ============================================================
async function gerarProfile(): Promise<ProfileConfig> {
  addDebugLog("📦 Gerando/Atualizando perfil unificado...");
  const nome = (document.getElementById('profileNameB') as HTMLInputElement).value;
  const email = (document.getElementById('profileEmailB') as HTMLInputElement).value;

  if (!nome || !email) {
    throw new Error("Preencha Nome e E-mail primeiro.");
  }

  try {
    addDebugLog("Step 1: Verificando permissão de notificação...");
    try {
      if (Notification.permission === "denied") {
        addDebugLog("⚠️ Permissão de notificação foi negada pelo usuário. Continuando sem notificações...");
      } else if (Notification.permission === "default") {
        try {
          const permission = await Notification.requestPermission();
          if (permission !== "granted") {
            addDebugLog("⚠️ Permissão de notificação não concedida. Continuando sem notificações...");
          }
        } catch (permErr: any) {
          addDebugLog("⚠️ Não foi possível solicitar permissão de notificação (ambiente não suportado): " + permErr?.message);
        }
      }
    } catch (notifErr: any) {
      addDebugLog("⚠️ Erro ao verificar notificações: " + notifErr?.message);
    }

    addDebugLog("Step 2: Registrando Service Worker...");
    const registration = await registrarServiceWorker();

    addDebugLog("Step 3: Buscando chave pública do servidor...");
    const resServerKey = await fetch("/api/server-public-key");
    if (!resServerKey.ok) {
      throw new Error(`Erro ao buscar chave do servidor: ${resServerKey.status}`);
    }
    const serverPublicKeyJwk = await resServerKey.json();
    addDebugLog("Step 3.5: Chave do servidor recebida");

    let vapidKeyPair: CryptoKeyPair;
    let publicKeyJwk: JsonWebKey;
    let privateKeyJwk: JsonWebKey;

    let existingProfile = await buscarProfile();
    if (existingProfile && existingProfile.vapidPublicKey && existingProfile.vapidPrivateKeyJwk) {
      addDebugLog("📂 Chaves VAPID encontradas no perfil.");
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
        addDebugLog("⚠️ Erro ao importar chaves VAPID existentes. Gerando novas...");
        existingProfile = undefined;
      }
    }
    if (!existingProfile || !vapidKeyPair) {
      addDebugLog("🔑 Gerando novas chaves VAPID...");
      vapidKeyPair = await generateVAPIDKeys();
      publicKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.publicKey);
      privateKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.privateKey);
    }

    addDebugLog("Step 4: Obtendo subscription...");
    if (!registration) {
      throw new Error("Service Worker registration é null/undefined");
    }
    if (!registration.pushManager) {
      addDebugLog("⚠️ AVISO: pushManager não está disponível no registration object");
      throw new Error("Web Push API (pushManager) não disponível. Navegador suportado? " + navigator.userAgent.substring(0, 50));
    }
    
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
      addDebugLog("📝 Criando nova subscription...");
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

    let e2ePublicKey: JsonWebKey;
    let e2ePrivateKeyJwk: JsonWebKey;
    let e2ePrivateKeyCrypto: CryptoKey;

    if (existingProfile && existingProfile.e2ePublicKey && existingProfile.e2ePrivateKeyJwk) {
      addDebugLog("📂 Chaves E2E encontradas no perfil.");
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
        addDebugLog("⚠️ Erro ao importar chave E2E existente. Gerando novas...");
        const newKeys = await generateE2EEKeys();
        e2ePublicKey = newKeys.publicEncrypt;
        e2ePrivateKeyJwk = newKeys.privateDecryptJwk;
        e2ePrivateKeyCrypto = newKeys.privateDecrypt;
      }
    } else {
      addDebugLog("🔑 Gerando novas chaves E2E...");
      const newKeys = await generateE2EEKeys();
      e2ePublicKey = newKeys.publicEncrypt;
      e2ePrivateKeyJwk = newKeys.privateDecryptJwk;
      e2ePrivateKeyCrypto = newKeys.privateDecrypt;
    }

    const privateKeyEncrypted = await cifrarChaveVapid(privateKeyJwk, serverPublicKeyJwk);

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

    const identidadeTemporaria = {
      name: nome,
      email: email,
      privateKey: vapidKeyPair.privateKey
    };
    await salvarIdentidadeA(identidadeTemporaria);

    return profile;
  } catch (err) {
    addDebugLog("❌ Erro ao gerar perfil: " + (err instanceof Error ? err.message : String(err)));
    throw err;
  }
}

// ============================================================
// COMPARTILHAR PERFIL via JWT (sub: "contact") – COM RECRIAÇÃO DO ENVELOPE
// ============================================================
async function compartilharProfile(): Promise<void> {
  addDebugLog("🔄 Gerando JWT de compartilhamento de perfil...");
  try {
    const profile = await buscarProfile();
    if (!profile) {
      throw new Error("Perfil não encontrado. Clique em 'Gerar/Atualizar Perfil' primeiro.");
    }

    if (!profile.vapidPublicKey || !profile.vapidPrivateKeyJwk || !profile.e2ePublicKey || !profile.subscription?.endpoint) {
      throw new Error("Perfil incompleto. Atualize seu perfil.");
    }

    addDebugLog("📡 Buscando chave pública atual do servidor para recriar envelope...");
    const resServerKey = await fetch("/api/server-public-key");
    if (!resServerKey.ok) throw new Error(`Erro ao buscar chave do servidor: ${resServerKey.status}`);
    const serverPublicKeyJwk = await resServerKey.json();

    addDebugLog("🔐 Recriando envelope da chave VAPID com chave pública atual...");
    const novoEnvelope = await cifrarChaveVapid(profile.vapidPrivateKeyJwk, serverPublicKeyJwk);

    profile.vapidPrivateKeyEnvelope = novoEnvelope;
    profile.updatedAt = Date.now();
    await salvarProfile(profile);
    addDebugLog("✅ Envelope atualizado e perfil salvo.");

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
        k: profile.vapidPrivateKeyEnvelope
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
    addDebugLog("❌ Erro ao gerar JWT: " + err.message);
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
    if (!valid) throw new Error("Assinatura do JWT inválida. O perfil pode ter sido adulterado.");
    if (!header.kid || !payload.p || !payload.s?.k || payload.sub !== "contact") {
      throw new Error("JWT de contato inválido ou incompleto.");
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
// CARREGAR LISTA DE CONTATOS
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
      addDebugLog(`Falha ao homologar ${c.email}: ${err}`);
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
// ENVIAR MENSAGEM (com ID centralizado)
// ============================================================
async function enviarMensagemB(): Promise<void> {
  addDebugLog("🚀 Enviando mensagem...");
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

    const msgId = gerarIdMensagem();
    addDebugLog(`📝 ID da mensagem: ${msgId} (${msgId.length} caracteres)`);

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
    addDebugLog(`❌ Erro: ${err.message}`);
    showToast(`❌ Erro: ${err.message}`, "error");
  }
}

// ============================================================
// CARREGAR MENSAGENS RECEBIDAS
// ============================================================
async function carregarMensagensRecebidas(): Promise<void> {
  addDebugLog("📬 Carregando mensagens recebidas...");
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
// CARREGAR MENSAGENS ENVIADAS (com status 'entregue')
// ============================================================
async function carregarMensagensEnviadas(): Promise<void> {
  addDebugLog("📤 Carregando mensagens enviadas...");
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
      'entregue': { emoji: '📬', label: 'Entregue', classe: 'msg-item-entregue' },
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
      <div class="msg-item ${status.classe}" style="border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin-bottom: 8px; background: ${msg.status === 'entregue' ? '#c8e6c9' : msg.status === 'enviada' ? '#e8f5e9' : msg.status === 'falha' ? '#ffebee' : '#fff8e1'};">
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
  addDebugLog("📂 Carregando dados iniciais (unificado)...");
  try {
    const profile = await buscarProfile();
    if (profile) {
      (document.getElementById('profileNameB') as HTMLInputElement).value = profile.name;
      (document.getElementById('profileEmailB') as HTMLInputElement).value = profile.email;
      addDebugLog("✅ Perfil carregado: " + profile.name);
      if (!profile.vapidPrivateKeyEnvelope) {
        addDebugLog("⚠️ Perfil antigo sem envelope VAPID. Clique em 'Gerar/Atualizar Perfil' para corrigir.");
        showToast("⚠️ Perfil desatualizado. Clique em 'Gerar/Atualizar Perfil' para corrigir.", "info");
      }
    } else {
      addDebugLog("ℹ️ Nenhum perfil encontrado. Gere um novo perfil.");
    }
    await carregarContatos();
    await carregarSelectContatos();
    await carregarMensagensRecebidas();
    await carregarMensagensEnviadas();
    addDebugLog("✅ Dados iniciais carregados!");
  } catch (err) {
    addDebugLog("⚠️ Erro ao carregar dados iniciais: " + err);
  }
}

// ============================================================
// EVENT LISTENERS
// ============================================================
window.addEventListener("DOMContentLoaded", async () => {
  addDebugLog("📄 DOM carregado, inicializando aplicação...");
  initTabs();
  await carregarDadosIniciais();

  document.getElementById('btnGerarProfile')?.addEventListener('click', async () => {
    try {
      const profile = await gerarProfile();
      showToast(`✅ Perfil de "${profile.name}" gerado/atualizado com sucesso!`, "success");
      (document.getElementById('profileNameB') as HTMLInputElement).value = profile.name;
      (document.getElementById('profileEmailB') as HTMLInputElement).value = profile.email;
    } catch (err: any) {
      addDebugLog("❌ Erro ao gerar perfil: " + (err?.message || err));
      showToast("❌ Erro ao gerar perfil: " + (err?.message || String(err)), "error");
    }
  });

  document.getElementById('btnCompartilharProfile')?.addEventListener('click', compartilharProfile);

  document.getElementById('btnCopyProfile')?.addEventListener('click', async () => {
    const display = document.getElementById('myProfileDisplay');
    if (display && display.textContent && !display.textContent.includes("Clique em")) {
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
  document.getElementById('btnClearDebugLogs')?.addEventListener('click', clearDebugLogs);

  document.getElementById('btnLimparSubscription')?.addEventListener('click', async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        addDebugLog("Subscription desinscrita.");
      }
      const profile = await buscarProfile();
      if (profile) {
        delete profile.subscription;
        await salvarProfile(profile);
      }
      showToast("✅ Subscription limpa. Gere um novo perfil.", "success");
    } catch (err) {
      addDebugLog("❌ Erro ao limpar subscription: " + err);
      showToast("❌ Erro ao limpar subscription.", "error");
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
    entrypoints: [join(SRC_DIR, "service-worker.ts")],
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
        //console.log(`   - [AUDITORIA JWT] Texto E2EE Criptografado (ct): ${(jwtClaims.ct || jwtClaims.cipherText || "N/A").substring(0, 20)}...`);
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

