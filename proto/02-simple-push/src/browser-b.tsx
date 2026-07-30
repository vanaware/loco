// src/browser-b.tsx
import { set, createStore } from "idb-keyval";

console.log("🟢 [SW-LOG] Arquivo browser-b.tsx carregado com bancos isolados por idb-keyval!");

// 🔥 SOLUÇÃO DEFINITIVA: Bancos de dados separados para cada finalidade.
// Como cada banco gerencia apenas sua tabela interna padrão, o erro de transação some de vez!
const storeChavesE2E = createStore("BrowserB_E2E_Chaves_DB", "keyval");
const storeListaBranca = createStore("BrowserB_ListaBranca_DB", "keyval");

function copyToClipboard(id: string): void {
  const input = document.getElementById(id) as HTMLInputElement;
  if (input) {
    input.select();
    document.execCommand('copy');
    alert("Conteúdo copiado com sucesso!");
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

async function generateE2EEKeys() {
  console.log("🔑 [SW-LOG] Gerando chaves assimétricas de aplicação...");
  const encryptionKeyPair = await window.crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([0x01, 0x00, 0x01]), hash: "SHA-256" },
    false, ["encrypt", "decrypt"]
  );

  const signatureKeyPair = await window.crypto.subtle.generateKey(
    { name: "RSA-PSS", modulusLength: 2048, publicExponent: new Uint8Array([0x01, 0x00, 0x01]), hash: "SHA-256" },
    false, ["sign", "verify"]
  );

  // Grava de forma direta nos stores isolados correspondentes
  await set("minha_decript_key", encryptionKeyPair.privateKey, storeChavesE2E);
  await set("minha_assinatura_key", signatureKeyPair.privateKey, storeChavesE2E);

  const publicEncryptJwk = await window.crypto.subtle.exportKey("jwk", encryptionKeyPair.publicKey);
  const publicSignJwk = await window.crypto.subtle.exportKey("jwk", signatureKeyPair.publicKey);

  return { publicEncryptJwk, publicSignJwk };
}

async function processarInscricaoComPerfil(): Promise<void> {
  const nomeB = (document.getElementById('profileNameB') as HTMLInputElement).value;
  const emailB = (document.getElementById('profileEmailB') as HTMLInputElement).value;

  if (!nomeB || !emailB) {
    alert("Por favor, preencha o Nome e o E-mail do perfil receptor.");
    return;
  }

  try {
    const permissao = await Notification.requestPermission();
    if (permissao !== "granted") {
      alert("⚠️ ERRO: Permissão de notificação negada.");
      return;
    }

    const registration = await navigator.serviceWorker.register("./service-worker.js");
    await registration.update();
    await navigator.serviceWorker.ready;

    const vapidKeyPair = await generateVAPIDKeys();
    const rawPublicKey = await window.crypto.subtle.exportKey("raw", vapidKeyPair.publicKey);
    
    const publicKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.publicKey);
    const privateKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.privateKey);

    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) await existingSubscription.unsubscribe();

    const subscription = await registration.pushManager.subscribe({
      applicationServerKey: new Uint8Array(rawPublicKey),
      userVisibleOnly: true
    });

    const p256dhBuffer = subscription.getKey('p256dh');
    const authBuffer = subscription.getKey('auth');
    const customSubscriptionJson = {
      endpoint: subscription.endpoint,
      keys: { p256dh: rawBufferToBase64Url(p256dhBuffer), auth: rawBufferToBase64Url(authBuffer) }
    };

    const e2ePublicKeys = await generateE2EEKeys();

    const resServerKey = await fetch("/api/server-public-key");
    const serverPublicKeyJwk = await resServerKey.json();

    const cryptoServerKey = await window.crypto.subtle.importKey(
      "jwk", serverPublicKeyJwk,
      { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]
    );

    const chaveSimetricaAes = await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt"]
    );

    const encoder = new TextEncoder();
    const ivAes = window.crypto.getRandomValues(new Uint8Array(12));
    const vapidBytes = encoder.encode(JSON.stringify(privateKeyJwk));
    
    const vapidCriptografadaBuffer = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: ivAes },
      chaveSimetricaAes,
      vapidBytes
    );

    const aesChaveCrua = await window.crypto.subtle.exportKey("raw", chaveSimetricaAes);
    const aesChaveCriptografadaBuffer = await window.crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      cryptoServerKey,
      aesChaveCrua
    );

    const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');

    const envelopeVapidHex = JSON.stringify({
      iv: toHex(ivAes.buffer),
      dadosCifrados: toHex(vapidCriptografadaBuffer),
      chaveAesCifrada: toHex(aesChaveCriptografadaBuffer)
    });

    const finalPayloadBundle = {
      subscription: customSubscriptionJson,
      vapid: {
        subject: `mailto:${emailB}`,
        publicKey: publicKeyJwk,
        privateKey: btoa(envelopeVapidHex)
      },
      isVapidEncrypted: true,
      e2e: {
        ownerName: nomeB,
        ownerEmail: emailB,
        browserB_PublicKeyEncrypt: e2ePublicKeys.publicEncryptJwk,
        browserB_PublicKeyVerify: e2ePublicKeys.publicSignJwk
      },
      payloadText: ""
    };

    const textarea = document.getElementById('unifiedBundle') as HTMLTextAreaElement;
    if (textarea) textarea.value = JSON.stringify(finalPayloadBundle);
    console.log("🚀 Carga híbrida gerada com sucesso via idb-keyval!");

  } catch (err) {
    alert("Falha: " + (err as Error).message);
  }
}

async function homologarEmissorJWT(): Promise<void> {
  const rawJwk = (document.getElementById('senderPublicKeyJson') as HTMLTextAreaElement).value;
  try {
    const jwkObject = JSON.parse(rawJwk);
    if (!jwkObject.ownerEmail || !jwkObject.ownerName) throw new Error("JWK ausente de metadados de Perfil.");
    await window.crypto.subtle.importKey("jwk", jwkObject, { name: "RSA-PSS", hash: "SHA-256" }, true, ["verify"]);

    // Grava de forma limpa na lista branca isolada por banco
    await set(jwkObject.ownerEmail, {
      email: jwkObject.ownerEmail,
      name: jwkObject.ownerName,
      jwk: jwkObject
    }, storeListaBranca);

    alert(`🛡️ Emissor "${jwkObject.ownerName}" cadastrado com sucesso via idb-keyval!`);
  } catch (err) {
    alert("Falha na validação: " + (err as Error).message);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const btnRegister = document.getElementById("btnRegisterPush");
  const btnSave = document.getElementById("btnSaveSenderIdentity");

  if (btnRegister) btnRegister.addEventListener("click", processarInscricaoComPerfil);
  if (btnSave) btnSave.addEventListener("click", homologarEmissorJWT);

  document.querySelectorAll(".copy-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      const targetId = (event.currentTarget as HTMLButtonElement).getAttribute("data-target");
      if (targetId) copyToClipboard(targetId);
    });
  });
});
