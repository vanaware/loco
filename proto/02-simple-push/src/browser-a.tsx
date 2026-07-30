// src/browser-a.tsx
import { get, set, createStore } from "idb-keyval";

console.log("🟢 [SW-LOG-A] Arquivo browser-a.tsx carregado com bancos isolados por idb-keyval!");

// 🔥 SOLUÇÃO DEFINITIVA: Bancos de dados separados para cada finalidade.
// Como cada banco gerencia apenas sua tabela interna padrão "keyval", colisões de transações são impossíveis.
const storeIdentidadeA = createStore("BrowserA_Identidade_DB", "keyval");
const storeFilaDisparosA = createStore("BrowserA_OfflineFila_DB", "keyval");

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(buffer));
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// GERA E PERSISTE A IDENTIDADE DIGITAL PERMANENTE DO BROWSER A
async function gerarIdentidadeA(): Promise<void> {
  console.log("🚀 [SW-LOG-A] Iniciando geração de identidade do Emissor...");
  const nameA = (document.getElementById('profileNameA') as HTMLInputElement).value;
  const emailA = (document.getElementById('profileEmailA') as HTMLInputElement).value;

  if (!nameA || !emailA) {
    alert("Por favor, preencha seu Nome e E-mail de remetente primeiro.");
    return;
  }

  try {
    const keyPairA = await window.crypto.subtle.generateKey(
      {
        name: "RSA-PSS",
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: "SHA-256"
      },
      false, // Chave privada inexportável do hardware/navegador
      ["sign", "verify"]
    );

    // Salva o objeto contendo o perfil de forma atômica no banco isolado de identidade
    await set("minha_chave_privada_assinatura", {
      name: nameA,
      email: emailA,
      privateKey: keyPairA.privateKey
    }, storeIdentidadeA);

    const publicSignJwk = await window.crypto.subtle.exportKey("jwk", keyPairA.publicKey);
    const extendedJwk = { ...publicSignJwk, ownerName: nameA, ownerEmail: emailA };

    const textarea = document.getElementById('myPublicKeySign') as HTMLTextAreaElement;
    if (textarea) {
      textarea.value = JSON.stringify(extendedJwk);
    }
    console.log("✅ [SW-LOG-A] Identidade permanente gerada e salva com idb-keyval!");
    alert("Identidade permanente gerada com sucesso! Copie a chave e homologue-a no Browser B.");
  } catch (err) {
    console.error(err);
    alert("Falha ao gerar identidade: " + (err as Error).message);
  }
}

// FUNÇÃO PRINCIPAL: Monta o JWT criptografado e despacha (Online ou Fila Offline via idb-keyval)
async function sendMessage(): Promise<void> {
  console.log("🚀 [SW-LOG-A] Iniciando empacotamento JWT via idb-keyval...");
  
  const bundleRaw = (document.getElementById('unifiedBundle') as HTMLTextAreaElement).value;
  const messageText = (document.getElementById('message') as HTMLTextAreaElement).value;

  if (!bundleRaw || !messageText) {
    alert("Por favor, cole a carga unificada do Browser B e digite uma mensagem.");
    return;
  }

  try {
    const bodyPayload = JSON.parse(bundleRaw);
    const e2eConfig = bodyPayload.e2e;

    const cryptoKeyB = await window.crypto.subtle.importKey(
      "jwk", e2eConfig.browserB_PublicKeyEncrypt,
      { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]
    );

    const encoder = new TextEncoder();
    const encryptedBuffer = await window.crypto.subtle.encrypt(
      { name: "RSA-OAEP" }, cryptoKeyB, encoder.encode(messageText)
    );
    const messageHex = Array.from(new Uint8Array(encryptedBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Busca o registro usando o store assíncrono blindado e isolado por banco
    const identityRecord = await get("minha_chave_privada_assinatura", storeIdentidadeA);

    if (!identityRecord) {
      throw new Error("Identidade do Browser A não localizada! Clique no botão de gerar chave primeiro.");
    }

    const jwtHeader = { alg: "PS256", typ: "JWT" };
    const jwtPayload = {
      iss: identityRecord.email,
      sub: e2eConfig.ownerEmail,
      name: identityRecord.name,
      iat: Math.floor(Date.now() / 1000),
      cipherText: messageHex
    };

    const base64UrlHeader = arrayBufferToBase64Url(encoder.encode(JSON.stringify(jwtHeader)));
    const base64UrlPayload = arrayBufferToBase64Url(encoder.encode(JSON.stringify(jwtPayload)));
    const tokenStringWithoutSignature = `${base64UrlHeader}.${base64UrlPayload}`;

    const signatureBuffer = await window.crypto.subtle.sign(
      { name: "RSA-PSS", saltLength: 32 },
      identityRecord.privateKey,
      encoder.encode(tokenStringWithoutSignature)
    );
    const base64UrlSignature = arrayBufferToBase64Url(signatureBuffer);

    bodyPayload.payloadText = `${tokenStringWithoutSignature}.${base64UrlSignature}`;

    if (navigator.onLine) {
      const response = await fetch("/api/proxy-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload)
      });
      if (response.ok) {
        alert("Token JWT enviado com sucesso!");
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    // Fila offline com idb-keyval usando o banco isolado "BrowserA_OfflineFila_DB"
    const idUnicoFila = Date.now();
    await set(idUnicoFila, bodyPayload, storeFilaDisparosA);

    const registration = await navigator.serviceWorker.ready;
    if ('sync' in registration) {
      await (registration as any).sync.register('sync-push-notifications');
      alert("Aviso: Você está offline! O token foi salvo pelo idb-keyval na fila e será enviado sozinho assim que a rede voltar.");
    }

  } catch (err) {
    alert(`Erro no pipeline: ${(err as Error).message}`);
  }
}

// Vinculação estrita de eventos do DOM
window.addEventListener("DOMContentLoaded", () => {
  const btnIdentity = document.getElementById("btnGenerateIdentity");
  const btnSend = document.getElementById("btnSend");

  if (btnIdentity) btnIdentity.addEventListener("click", gerarIdentidadeA);
  if (btnSend) {
    btnSend.addEventListener("click", (e) => {
      e.stopPropagation();
      sendMessage();
    });
  }

  document.querySelectorAll(".copy-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      const targetId = (event.currentTarget as HTMLButtonElement).getAttribute("data-target");
      if (targetId && targetId !== "unifiedBundle" && targetId !== "message") {
        const input = document.getElementById(targetId) as HTMLInputElement;
        if (input) {
          input.select();
          document.execCommand('copy');
          alert("Texto copiado para a área de transferência!");
        }
      }
    });
  });
});
