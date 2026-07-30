// src/sw/push.js
import { get, createStore } from "idb-keyval";

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
  DECRYPT_KEY: "minha_decript_key",
};

function criarStore(nome) {
  return createStore(nome, STORE_NAMES.KEYVAL);
}

const storeChavesE2E = criarStore(DB_NAMES.CHAVES_E2E_B);
const storeListaBranca = criarStore(DB_NAMES.LISTA_BRANCA_B);
const storeMensagensRecebidasB = criarStore(DB_NAMES.MENSAGENS_RECEBIDAS_B);

// 🔥 Função para salvar mensagem recebida no IndexedDB
async function salvarMensagemRecebida(mensagem) {
  await set(mensagem.id, mensagem, storeMensagensRecebidasB);
}

self.addEventListener('push', function(event) {
  console.log("[SW-PUSH] 📩 ===== PUSH EVENT RECEBIDO =====");
  if (!event.data) return;

  const rawText = event.data.text();
  console.log("[SW-PUSH] 📦 Texto bruto recebido do push:", rawText);

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
      const emailRemetente = jwtPayload.iss;
      const nomeRemetente = jwtPayload.name || "Remetente Autorizado";

      console.log(`[SW-PUSH] 🔐 Analisando assinatura JWT de: ${nomeRemetente} <${emailRemetente}>`);

      const emissorHomologado = await get(emailRemetente, storeListaBranca);
      if (!emissorHomologado) {
        throw new Error(`O remetente "${emailRemetente}" não foi cadastrado na lista branca.`);
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

      if (!isSignatureValid) throw new Error("A assinatura digital do token falhou!");
      console.log("[SW-PUSH] 🛡️ Assinatura digital do JWT homologada com sucesso!");

      const privateDecryptKey = await get(KEY_NAMES.DECRYPT_KEY, storeChavesE2E);
      if (!privateDecryptKey) throw new Error("Sua chave privada RSA de decodificação não foi encontrada.");

      const encryptedBytes = new Uint8Array(jwtPayload.cipherText.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      const decryptedBuffer = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateDecryptKey, encryptedBytes);
      const textoOriginal = decoder.decode(decryptedBuffer);
      console.log("[SW-PUSH] 🔓 Conteúdo do JWT aberto com sucesso!");

      // 🔥 CRIA MENSAGEM RECEBIDA
      const mensagemId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const mensagemRecebida = {
        id: mensagemId,
        remetente: nomeRemetente,
        remetenteEmail: emailRemetente,
        titulo: `De: ${nomeRemetente}`,
        conteudo: textoOriginal,
        dadosJwt: jwtPayload,
        status: 'nao_lida',
        recebidoEm: Date.now()
      };

      // 🔥 SALVA NO INDEXEDDB
      await salvarMensagemRecebida(mensagemRecebida);
      console.log(`[SW-PUSH] ✅ Mensagem ${mensagemId} salva no IndexedDB`);

      // 🔥 TRIGGER PARA PROCESSAR FILA DE NOTIFICAÇÃO
      // Tenta processar imediatamente
      if (self.processarFilaNotificacao) {
        await self.processarFilaNotificacao();
      } else {
        // Fallback: notifica diretamente
        await self.registration.showNotification(`📥 De: ${nomeRemetente}`, {
          body: textoOriginal,
          icon: '/icon.png',
          badge: '/icon.png',
          vibrate: [200, 100, 200],
          data: jwtPayload,
          tag: mensagemId,
          requireInteraction: true
        });
        
        // Atualiza status
        mensagemRecebida.status = 'notificada';
        mensagemRecebida.notificadaEm = Date.now();
        await salvarMensagemRecebida(mensagemRecebida);
      }

      // Notifica os clientes abertos
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach((client) => {
        client.postMessage({
          type: "PUSH_RECEIVED",
          payload: {
            id: mensagemId,
            title: nomeRemetente,
            body: textoOriginal,
            status: 'nao_lida'
          }
        });
      });

    } catch (jwtError) {
      console.error("[SW-PUSH] ❌ Falha crítica no pipeline de segurança:", jwtError.message);
      await self.registration.showNotification("⚠️ Bloqueio de Segurança", {
        body: jwtError.message || "Assinatura corrompida ou remetente não autorizado.",
        icon: '/icon.png'
      });
    }
  }());
});