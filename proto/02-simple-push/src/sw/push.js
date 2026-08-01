// src/sw/push.js
import { get, set, createStore } from "idb-keyval";
import { gunzipSync } from "fflate";

// 🔥 Constantes
const DB_NAMES = {
  CHAVES_E2E_B: "BrowserB_E2E_Chaves_DB",
  LISTA_BRANCA_B: "BrowserB_ListaBranca_DB",
  MENSAGENS_RECEBIDAS_B: "BrowserB_MensagensRecebidas_DB",
};

const STORE_NAMES = {
  KEYVAL: "keyval",
};

const KEY_NAMES = {
  CHAVES_E2E_B: "chaves_e2e_b",
  DECRYPT_KEY: "minha_decript_key",
};

// 🔥 Função para criar stores com tratamento de erro
function criarStore(nome) {
  try {
    return createStore(nome, STORE_NAMES.KEYVAL);
  } catch (err) {
    console.error(`[SW-PUSH] ❌ Erro ao criar store ${nome}:`, err);
    return null;
  }
}

// 🔥 Inicializa stores
let storeChavesE2E = criarStore(DB_NAMES.CHAVES_E2E_B);
let storeListaBranca = criarStore(DB_NAMES.LISTA_BRANCA_B);
let storeMensagensRecebidasB = criarStore(DB_NAMES.MENSAGENS_RECEBIDAS_B);

// 🔥 Função para garantir que as stores estão disponíveis
function garantirStores() {
  if (!storeChavesE2E) {
    storeChavesE2E = criarStore(DB_NAMES.CHAVES_E2E_B);
  }
  if (!storeListaBranca) {
    storeListaBranca = criarStore(DB_NAMES.LISTA_BRANCA_B);
  }
  if (!storeMensagensRecebidasB) {
    storeMensagensRecebidasB = criarStore(DB_NAMES.MENSAGENS_RECEBIDAS_B);
  }
  return storeChavesE2E && storeListaBranca && storeMensagensRecebidasB;
}

// 🔥 Função para salvar mensagem recebida no IndexedDB
async function salvarMensagemRecebida(mensagem) {
  try {
    garantirStores();
    if (!storeMensagensRecebidasB) {
      throw new Error("Store de mensagens recebidas não disponível");
    }
    await set(mensagem.id, mensagem, storeMensagensRecebidasB);
    console.log(`[SW-PUSH] ✅ Mensagem ${mensagem.id} salva no IndexedDB`);
  } catch (err) {
    console.error(`[SW-PUSH] ❌ Erro ao salvar mensagem ${mensagem.id}:`, err);
    throw err;
  }
}

// 🔥 Função para buscar a chave privada de decodificação (RSA)
async function buscarChaveDecript() {
  try {
    garantirStores();
    if (!storeChavesE2E) {
      throw new Error("Store de chaves E2E não disponível");
    }
    
    const chavesE2E = await get(KEY_NAMES.CHAVES_E2E_B, storeChavesE2E);
    if (chavesE2E && chavesE2E.privateDecrypt) {
      console.log("[SW-PUSH] 🔑 Chave de decodificação RSA encontrada");
      return chavesE2E.privateDecrypt;
    }
    
    const decryptKey = await get(KEY_NAMES.DECRYPT_KEY, storeChavesE2E);
    if (decryptKey) {
      console.log("[SW-PUSH] 🔑 Chave de decodificação encontrada (legado)");
      return decryptKey;
    }
    
    return null;
  } catch (err) {
    console.error("[SW-PUSH] ❌ Erro ao buscar chave de decodificação:", err);
    return null;
  }
}

// 🔥 Função para homologar emissor automaticamente (usa chave pública VAPID - ECDSA)
async function homologarEmissorAutomatico(email, nome, publicKeyJwk) {
  try {
    garantirStores();
    if (!storeListaBranca) {
      throw new Error("Store da lista branca não disponível");
    }
    
    const existente = await get(email, storeListaBranca);
    if (existente) {
      console.log(`[SW-PUSH] ℹ️ Emissor ${email} já está homologado`);
      return true;
    }
    
    // Verifica se a chave é uma chave ECDSA P-256 válida
    await crypto.subtle.importKey(
      "jwk", publicKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      true, ["verify"]
    );
    
    await set(email, {
      email: email,
      name: nome,
      jwk: publicKeyJwk,
      homologadoAutomaticamente: true,
      homologadoEm: Date.now()
    }, storeListaBranca);
    
    console.log(`[SW-PUSH] ✅ Emissor ${nome} <${email}> homologado automaticamente!`);
    return true;
  } catch (err) {
    console.error(`[SW-PUSH] ❌ Falha ao homologar emissor ${email}:`, err);
    return false;
  }
}

// 🔥 Função para salvar o emissor completo para permitir resposta
async function salvarEmissorCompleto(email, emissorData) {
  if (!emissorData) return;
  
  try {
    garantirStores();
    if (!storeMensagensRecebidasB) {
      throw new Error("Store de mensagens recebidas não disponível");
    }
    await set(`emissor_completo_${email}`, {
      ...emissorData,
      atualizadoEm: Date.now()
    }, storeMensagensRecebidasB);
    console.log(`[SW-PUSH] ✅ Dados completos do emissor ${email} salvos para resposta`);
  } catch (err) {
    console.error(`[SW-PUSH] ❌ Erro ao salvar dados do emissor:`, err);
  }
}

// 🔥 Função para converter Base64 para ArrayBuffer
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ============================================================
// 🔥 EVENTO PRINCIPAL DE PUSH
// ============================================================

self.addEventListener('push', function(event) {
  console.log("[SW-PUSH] 📩 ===== PUSH EVENT RECEBIDO =====");
  if (!event.data) return;

  const rawText = event.data.text();
  console.log("[SW-PUSH] 📦 Texto bruto recebido do push:", rawText.substring(0, 100) + "...");

  if (rawText.split('.').length !== 3) {
    console.log("[SW-PUSH] ℹ️ Carga não segue o padrão JWT. Exibindo como texto bruto.");
    event.waitUntil(
      self.registration.showNotification("Notificação de Teste", { body: rawText })
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
      const emailRemetente = jwtPayload.iss || jwtPayload.email || "remetente@desconhecido";
      const nomeRemetente = jwtPayload.name || "Remetente Autorizado";

      console.log(`[SW-PUSH] 🔐 Analisando mensagem de: ${nomeRemetente} <${emailRemetente}>`);

      // ============================================================
      // 🔥 VERIFICA HOMOLOGAÇÃO (com reconexão)
      // ============================================================
      garantirStores();
      let emissorHomologado = null;
      let homologado = false;
      
      if (storeListaBranca) {
        try {
          emissorHomologado = await get(emailRemetente, storeListaBranca);
          if (emissorHomologado) {
            console.log(`[SW-PUSH] ✅ Emissor ${emailRemetente} já está homologado`);
            homologado = true;
          }
        } catch (dbErr) {
          console.warn(`[SW-PUSH] ⚠️ Erro ao verificar homologação:`, dbErr);
        }
      }

      // ============================================================
      // 🔥 EXTRAI CHAVE PÚBLICA VAPID PARA VERIFICAÇÃO
      // Suporta 'publicKey' (antigo) ou 'p' (campo curto)
      // ============================================================
      let publicKeyVapid = jwtPayload.publicKey || jwtPayload.p || null;
      console.log(`[SW-PUSH] Chave pública VAPID do JWT: ${publicKeyVapid ? 'encontrada' : 'não encontrada'}`);

      // Se não veio no JWT, tenta buscar do IndexedDB (dados salvos anteriormente)
      if (!publicKeyVapid && storeMensagensRecebidasB) {
        try {
          const emissorData = await get(`emissor_completo_${emailRemetente}`, storeMensagensRecebidasB);
          publicKeyVapid = emissorData?.publicKeyVapid || null;
          console.log(`[SW-PUSH] Chave pública VAPID recuperada do IndexedDB: ${publicKeyVapid ? 'sim' : 'não'}`);
        } catch (dbErr) {
          console.warn(`[SW-PUSH] ⚠️ Erro ao buscar emissor no IndexedDB:`, dbErr);
        }
      }

      // ============================================================
      // 🔥 VALIDA A ASSINATURA (ECDSA com chave pública VAPID)
      // ============================================================
      let assinaturaValida = false;

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
          console.log("[SW-PUSH] ⚠️ Chave pública VAPID do emissor não encontrada");
        }
      } catch (err) {
        console.error("[SW-PUSH] ❌ Erro na verificação da assinatura:", err);
      }

      // Se não tiver chave pública, tenta homologar automaticamente
      if (!publicKeyVapid && jwtPayload.p) {
        console.log(`[SW-PUSH] 🔄 Tentando homologar automaticamente com chave do JWT (campo p)...`);
        homologado = await homologarEmissorAutomatico(emailRemetente, nomeRemetente, jwtPayload.p);
        if (homologado) {
          publicKeyVapid = jwtPayload.p;
          try {
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
          } catch (err) {
            console.error("[SW-PUSH] ❌ Erro na verificação da assinatura após homologação:", err);
          }
        }
      }

      if (!assinaturaValida) {
        console.warn(`[SW-PUSH] ⚠️ Assinatura inválida para ${emailRemetente}`);
        await self.registration.showNotification(`⚠️ Mensagem com assinatura inválida`, {
          body: `De: ${nomeRemetente}\nA mensagem não pôde ser verificada.`,
          icon: '/icon.png',
          tag: `invalid_${Date.now()}`
        });
        return;
      }

      console.log("[SW-PUSH] 🛡️ Assinatura digital do JWT validada com sucesso!");

      // ============================================================
      // 🔥 DESCRIPTOGRAFA O ENVELOPE HÍBRIDO (RSA-OAEP + AES-GCM)
      // ============================================================
      const privateDecryptKey = await buscarChaveDecript();
      if (!privateDecryptKey) {
        console.error("[SW-PUSH] ❌ Chave privada RSA de decodificação não encontrada!");
        throw new Error("Sua chave privada RSA de decodificação não foi encontrada.");
      }

      // 🔥 Extrai o envelope do JWT
      const envelopeJson = jwtPayload.ct || jwtPayload.cipherText;
      console.log("[SW-PUSH] 📦 Envelope JSON recebido:", envelopeJson?.length || 0, "bytes");

      if (!envelopeJson) {
        console.error("[SW-PUSH] ❌ Envelope não encontrado no JWT");
        throw new Error("Envelope não encontrado");
      }

      let envelope;
      try {
        envelope = JSON.parse(envelopeJson);
        console.log("[SW-PUSH] ✅ Envelope parseado com sucesso");
      } catch (parseErr) {
        console.error("[SW-PUSH] ❌ Erro ao parsear envelope JSON:", parseErr);
        throw new Error("Envelope inválido");
      }

      // 🔥 Extrai os campos
      const iv = envelope.i || envelope.iv;
      const dadosCifrados = envelope.d || envelope.dadosCifrados;
      const chaveAesCifrada = envelope.k || envelope.chaveAesCifrada;

      if (!iv || !dadosCifrados || !chaveAesCifrada) {
        console.error("[SW-PUSH] ❌ Envelope incompleto");
        throw new Error("Envelope incompleto");
      }

      // 🔥 Decodifica Base64
      const ivBytes = new Uint8Array(base64ToArrayBuffer(iv));
      const dadosBytes = new Uint8Array(base64ToArrayBuffer(dadosCifrados));
      const chaveAesCifradaBytes = new Uint8Array(base64ToArrayBuffer(chaveAesCifrada));

      console.log(`[SW-PUSH] 📦 IV: ${ivBytes.length} bytes`);
      console.log(`[SW-PUSH] 📦 Dados cifrados: ${dadosBytes.length} bytes`);
      console.log(`[SW-PUSH] 📦 Chave AES cifrada: ${chaveAesCifradaBytes.length} bytes`);

      // Descriptografa a chave AES com RSA
      console.log("[SW-PUSH] 🔑 Descriptografando chave AES com RSA...");
      const aesChaveCruaBuffer = await crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        privateDecryptKey,
        chaveAesCifradaBytes
      );
      console.log(`[SW-PUSH] ✅ Chave AES descriptografada (${aesChaveCruaBuffer.byteLength} bytes)`);

      // Importa a chave AES
      console.log("[SW-PUSH] 🔑 Importando chave AES...");
      const chaveSimetricaAes = await crypto.subtle.importKey(
        "raw",
        aesChaveCruaBuffer,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
      );
      console.log("[SW-PUSH] ✅ Chave AES importada");

      // Descriptografa os dados
      console.log("[SW-PUSH] 🔓 Descriptografando dados com AES-GCM...");
      const textoDecifradoBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ivBytes },
        chaveSimetricaAes,
        dadosBytes
      );
      console.log(`[SW-PUSH] ✅ Dados descriptografados (${textoDecifradoBuffer.byteLength} bytes)`);

      // Descompacta
      console.log("[SW-PUSH] 📦 Descompactando com gunzip...");
      const decompressedBytes = gunzipSync(new Uint8Array(textoDecifradoBuffer));
      const textoDecifrado = new TextDecoder().decode(decompressedBytes);
      console.log(`[SW-PUSH] ✅ Dados descompactados (${textoDecifrado.length} bytes)`);

      // ============================================================
      // 🔥 DESERIALIZA O OBJETO DE MENSAGEM
      // ============================================================
      let mensagemObj = null;
      let titulo = "Nova mensagem";
      let conteudo = textoDecifrado;
      let emissorData = null;
      let publicKeyEncrypt = null;
      let subscription = null;
      let vapid = null;

      try {
        mensagemObj = JSON.parse(textoDecifrado);
        titulo = mensagemObj.m?.t || "Nova mensagem";
        conteudo = mensagemObj.m?.c || textoDecifrado;
        
        if (mensagemObj.e) {
          const e = mensagemObj.e;
          emissorData = {
            email: emailRemetente,
            nome: nomeRemetente,
          };
          
          // Subscription do emissor (para responder)
          if (e.s) {
            subscription = {
              endpoint: e.s.e || e.s.endpoint,
              keys: e.s.k || e.s.keys
            };
            emissorData.subscription = subscription;
          }
          
          // Chave pública RSA do emissor (para cifrar resposta)
          if (e.p) {
            publicKeyEncrypt = e.p;
            emissorData.publicKeyEncrypt = publicKeyEncrypt;
          }
          
          // Chave privada VAPID cifrada (para o servidor)
          if (e.v && e.v.k) {
            vapid = {
              privateKey: e.v.k,
              // A chave pública VAPID vem do JWT (campo 'p') – não está no envelope
              publicKey: publicKeyVapid
            };
            emissorData.vapid = vapid;
            emissorData.isVapidEncrypted = true;
            emissorData.publicKeyVapid = publicKeyVapid;
          }
          
          // Salva o emissor completo
          await salvarEmissorCompleto(emailRemetente, emissorData);
          console.log(`[SW-PUSH] ✅ Emissor ${emailRemetente} salvo`);
        }
        
        console.log("[SW-PUSH] 📦 Objeto decodificado:", {
          titulo: titulo,
          emissor: emailRemetente,
          temSubscription: !!subscription,
          temPublicKeyEncrypt: !!publicKeyEncrypt,
          temVapidPrivate: !!(vapid && vapid.privateKey)
        });
      } catch (parseError) {
        console.error("[SW-PUSH] ❌ Erro ao parsear JSON:", parseError);
        emissorData = { email: emailRemetente, nome: nomeRemetente };
      }

      // ============================================================
      // 🔥 CRIA MENSAGEM RECEBIDA
      // ============================================================
      const mensagemId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const mensagemRecebida = {
        id: mensagemId,
        remetente: emissorData?.nome || nomeRemetente,
        remetenteEmail: emailRemetente,
        titulo: titulo,
        conteudo: conteudo,
        dadosJwt: jwtPayload,
        publicKey: publicKeyVapid, // chave VAPID para verificação
        homologado: homologado,
        assinaturaValida: assinaturaValida,
        emissorCompleto: {
          nome: emissorData?.nome || nomeRemetente,
          email: emailRemetente,
          publicKeyEncrypt: publicKeyEncrypt || null,
          publicKeyVapid: publicKeyVapid || null,
          subscription: subscription || null,
          vapid: vapid || null,
          isVapidEncrypted: true
        },
        bundleEmissor: (subscription && publicKeyEncrypt && vapid && vapid.privateKey) ? {
          subscription: subscription,
          vapid: {
            subject: `mailto:${emailRemetente}`,
            publicKey: publicKeyVapid,
            privateKey: vapid.privateKey
          },
          isVapidEncrypted: true,
          nome: emissorData?.nome || nomeRemetente,
          email: emailRemetente,
          publicKeyEncrypt: publicKeyEncrypt,
          publicKeyVapid: publicKeyVapid
        } : null,
        status: 'nao_lida',
        recebidoEm: Date.now()
      };

      await salvarMensagemRecebida(mensagemRecebida);
      console.log(`[SW-PUSH] ✅ Mensagem ${mensagemId} salva`);

      // ============================================================
      // 🔥 NOTIFICAÇÃO
      // ============================================================
      const podeResponder = subscription && publicKeyEncrypt && vapid && vapid.privateKey ? ' (pode responder)' : '';
      const statusEmoji = homologado ? '✅' : '🔄';
      const statusTexto = homologado ? 'Homologado' : 'Não homologado';
      
      await self.registration.showNotification(`📥 ${titulo}`, {
        body: `${conteudo}\n\n${statusEmoji} De: ${emissorData?.nome || nomeRemetente} - ${statusTexto}${podeResponder}`,
        icon: '/icon.png',
        badge: '/icon.png',
        vibrate: [200, 100, 200],
        data: {
          mensagemId: mensagemId,
          remetenteEmail: emailRemetente,
          nomeRemetente: emissorData?.nome || nomeRemetente,
          publicKey: publicKeyVapid,
          homologado: homologado,
          podeResponder: !!subscription && !!publicKeyEncrypt && !!vapid?.privateKey,
          acao: homologado ? 'ver_mensagem' : 'homologar_emissor'
        },
        tag: mensagemId,
        requireInteraction: !homologado
      });

      // Notifica clientes abertos
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach((client) => {
        client.postMessage({
          type: "PUSH_RECEIVED",
          payload: {
            id: mensagemId,
            title: titulo,
            body: conteudo,
            remetente: emissorData?.nome || nomeRemetente,
            homologado: homologado,
            podeResponder: !!subscription && !!publicKeyEncrypt && !!vapid?.privateKey,
            status: 'nao_lida'
          }
        });
      });

      if (self.processarFilaNotificacao) {
        await self.processarFilaNotificacao();
      }

    } catch (jwtError) {
      console.error("[SW-PUSH] ❌ Falha crítica:", jwtError.message);
      console.error("[SW-PUSH] 🔍 Stack trace:", jwtError.stack);
      await self.registration.showNotification("⚠️ Bloqueio de Segurança", {
        body: jwtError.message || "Assinatura corrompida.",
        icon: '/icon.png'
      });
    }
  }());
});

// ============================================================
// 🔥 LISTENER PARA CLIQUE NA NOTIFICAÇÃO
// ============================================================

self.addEventListener('notificationclick', function(event) {
  console.log("[SW-CLICK] 🔗 ===== CLIQUE NA NOTIFICAÇÃO DETECTADO =====");
  
  const notificationData = event.notification.data;
  event.notification.close();
  
  if (notificationData?.acao === 'homologar_emissor' && notificationData?.publicKey) {
    const { remetenteEmail, nomeRemetente, publicKey, mensagemId } = notificationData;
    
    event.waitUntil(async function() {
      console.log(`[SW-CLICK] 🔄 Homologando emissor ${nomeRemetente} <${remetenteEmail}>...`);
      
      try {
        garantirStores();
        if (!storeListaBranca) {
          throw new Error("Store da lista branca não disponível");
        }
        
        const existente = await get(remetenteEmail, storeListaBranca);
        if (existente) {
          console.log(`[SW-CLICK] ℹ️ Emissor ${remetenteEmail} já está homologado`);
          
          const mensagem = await get(mensagemId, storeMensagensRecebidasB);
          if (mensagem) {
            mensagem.homologado = true;
            await set(mensagemId, mensagem, storeMensagensRecebidasB);
          }
          
          await self.registration.showNotification("✅ Emissor já homologado", {
            body: `${nomeRemetente} já estava na lista branca.`,
            icon: '/icon.png'
          });
          return;
        }
        
        // Verifica se a chave é uma chave ECDSA VAPID válida
        await crypto.subtle.importKey(
          "jwk", publicKey,
          { name: "ECDSA", namedCurve: "P-256" },
          true, ["verify"]
        );
        
        await set(remetenteEmail, {
          email: remetenteEmail,
          name: nomeRemetente,
          jwk: publicKey,
          homologadoEm: Date.now()
        }, storeListaBranca);
        
        const mensagem = await get(mensagemId, storeMensagensRecebidasB);
        if (mensagem) {
          mensagem.homologado = true;
          await set(mensagemId, mensagem, storeMensagensRecebidasB);
        }
        
        console.log(`[SW-CLICK] ✅ Emissor ${nomeRemetente} homologado com sucesso!`);
        
        await self.registration.showNotification("✅ Emissor Homologado!", {
          body: `${nomeRemetente} foi adicionado à lista branca.`,
          icon: '/icon.png',
          vibrate: [200, 100, 200]
        });
        
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        clients.forEach((client) => {
          client.postMessage({
            type: "EMISSOR_HOMOLOGADO",
            payload: { email: remetenteEmail, name: nomeRemetente }
          });
        });
        
      } catch (err) {
        console.error(`[SW-CLICK] ❌ Falha ao homologar:`, err);
        await self.registration.showNotification("❌ Falha na Homologação", {
          body: `Não foi possível homologar ${nomeRemetente}.`,
          icon: '/icon.png'
        });
      }
    }());
    return;
  }
  
  // Fallback: abre a página
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

console.log("[SW-PUSH] 📦 Módulo push carregado (assinatura ECDSA com VAPID - campo p suportado)");