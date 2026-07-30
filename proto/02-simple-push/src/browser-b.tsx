// src/browser-b.tsx
console.log("🟢 [SW-LOG] Arquivo browser-b.tsx carregado com sucesso pelo interpretador do navegador!");

// Função auxiliar para abrir o banco IndexedDB local de forma assíncrona
function abrirBancoDB(): Promise<IDBDatabase> {
  console.log("💾 [SW-LOG] Tentando inicializar/abrir o IndexedDB local...");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("BrowserB_SecurityDB", 1);
    
    request.onupgradeneeded = () => {
      console.log("💾 [SW-LOG] Upgrading IndexedDB: Criando tabelas de segurança...");
      const db = request.result;
      db.createObjectStore("chaves_privadas_e2e");
      db.createObjectStore("lista_branca_emissores", { keyPath: "email" });
    };
    
    request.onsuccess = () => {
      console.log("💾 [SW-LOG] IndexedDB aberto com sucesso!");
      resolve(request.result);
    };
    request.onerror = () => {
      console.error("💾 [SW-LOG] Erro ao abrir IndexedDB:", request.error);
      reject(request.error);
    };
  });
}

function copyToClipboard(id: string): void {
  const input = document.getElementById(id) as HTMLInputElement;
  if (input) {
    input.select();
    document.execCommand('copy');
    alert("Conteúdo copiado com sucesso!");
  }
}

async function generateVAPIDKeys(): Promise<CryptoKeyPair> {
  console.log("🔑 [SW-LOG] Gerando par de chaves VAPID nativas...");
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
  console.log("🔑 [SW-LOG] Gerando chaves assimétricas de aplicação RSA-OAEP e RSA-PSS...");
  const encryptionKeyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    false,
    ["encrypt", "decrypt"]
  );

  const signatureKeyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-PSS",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    false,
    ["sign", "verify"]
  );

  console.log("💾 [SW-LOG] Gravando chaves privadas E2EE no cofre do IndexedDB...");
  const db = await abrirBancoDB();
  const tx = db.transaction("chaves_privadas_e2e", "readwrite");
  await tx.objectStore("chaves_privadas_e2e").put(encryptionKeyPair.privateKey, "minha_decript_key");
  await tx.objectStore("chaves_privadas_e2e").put(signatureKeyPair.privateKey, "minha_assinatura_key");

  const publicEncryptJwk = await window.crypto.subtle.exportKey("jwk", encryptionKeyPair.publicKey);
  const publicSignJwk = await window.crypto.subtle.exportKey("jwk", signatureKeyPair.publicKey);

  return { publicEncryptJwk, publicSignJwk };
}

async function processarInscricaoComPerfil(): Promise<void> {
  console.log("🚀 [SW-LOG] [1/6] Função processarInscricaoComPerfil interceptou o clique!");
  
  const nomeB = (document.getElementById('profileNameB') as HTMLInputElement).value;
  const emailB = (document.getElementById('profileEmailB') as HTMLInputElement).value;

  if (!nomeB || !emailB) {
    alert("Por favor, preencha o Nome e o E-mail do perfil receptor.");
    return;
  }

  try {
    console.log("🚀 [SW-LOG] [2/6] Solicitando permissão de notificação nativa...");
    const permissao = await Notification.requestPermission();
    console.log(`🚀 [SW-LOG] Status da permissão de notificação: ${permissao}`);
    if (permissao !== "granted") {
      alert("⚠️ ERRO: Permissão de notificação negada.");
      return;
    }

    console.log("🚀 [SW-LOG] [3/6] Registrando Service Worker...");
    const registration = await navigator.serviceWorker.register("./service-worker.js");
    await registration.update();
    const activeWorker = await navigator.serviceWorker.ready;
    console.log("🚀 [SW-LOG] Service Worker ativo e pronto!");

    const vapidKeyPair = await generateVAPIDKeys();
    const rawPublicKey = await window.crypto.subtle.exportKey("raw", vapidKeyPair.publicKey);
    const publicKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.publicKey);
    const privateKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.privateKey);

    console.log("🚀 [SW-LOG] [4/6] Configurando pushManager.subscribe...");
    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
      console.log("🚀 [SW-LOG] Limpando inscrição push antiga detectada...");
      await existingSubscription.unsubscribe();
    }

    const subscription = await registration.pushManager.subscribe({
      applicationServerKey: new Uint8Array(rawPublicKey),
      userVisibleOnly: true
    });
    console.log("🚀 [SW-LOG] Inscrição Web Push gerada com sucesso!");

    const p256dhBuffer = subscription.getKey('p256dh');
    const authBuffer = subscription.getKey('auth');
    const customSubscriptionJson = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: rawBufferToBase64Url(p256dhBuffer),
        auth: rawBufferToBase64Url(authBuffer)
      }
    };

    console.log("🚀 [SW-LOG] [5/6] Disparando geração E2EE...");
    const e2ePublicKeys = await generateE2EEKeys();

    console.log("🚀 [SW-LOG] [6/6] Realizando fetch para capturar chave RSA de infra do Deno...");
    const resServerKey = await fetch("/api/server-public-key");
    console.log(`🚀 [SW-LOG] Resposta HTTP do servidor: ${resServerKey.status}`);
    if (!resServerKey.ok) {
      throw new Error(`HTTP ${resServerKey.status} na rota de chaves públicas.`);
    }
    const serverPublicKeyJwk = await resServerKey.json();

    console.log("🔒 [SW-LOG] Importando chave pública RSA do servidor...");
    const cryptoServerKey = await window.crypto.subtle.importKey(
      "jwk", serverPublicKeyJwk,
      { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]
    );

    console.log("🔒 [SW-LOG] Iniciando criptografia simétrica AES-GCM-256...");
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
    if (textarea) {
      textarea.value = JSON.stringify(finalPayloadBundle);
    }
    console.log("✅ [SW-LOG] SUCESSO COMPLETO: Carga unificada populada e visível!");

  } catch (err) {
    console.error("❌ [SW-LOG] CRASH DETECTADO:", err);
    alert(`Erro detectado no fluxo: ${(err as Error).name} - ${(err as Error).message}`);
  }
}

async function homologarEmissorJWT(): Promise<void> {
  console.log("🛡️ [SW-LOG] Iniciando processo de homologação de emissor...");
  const rawJwk = (document.getElementById('senderPublicKeyJson') as HTMLTextAreaElement).value;
  try {
    const jwkObject = JSON.parse(rawJwk);
    if (!jwkObject.ownerEmail || !jwkObject.ownerName) {
      throw new Error("JWK ausente de metadados de Perfil (Nome/E-mail).");
    }
    await window.crypto.subtle.importKey("jwk", jwkObject, { name: "RSA-PSS", hash: "SHA-256" }, true, ["verify"]);
    const db = await abrirBancoDB();
    const tx = db.transaction("lista_branca_emissores", "readwrite");
    await tx.objectStore("lista_branca_emissores").put({ email: jwkObject.ownerEmail, name: jwkObject.ownerName, jwk: jwkObject });
    alert(`🛡️ Emissor "${jwkObject.ownerName}" cadastrado com sucesso!`);
  } catch (err) {
    alert("Falha na validação: " + (err as Error).message);
  }
}

// 🔥 VINCULAÇÃO BLINDADA: Aguarda a árvore HTML estar 100% renderizada antes de atrelar o evento
window.addEventListener("DOMContentLoaded", () => {
  console.log("🟢 [SW-LOG] DOM totalmente carregado! Vinculando eventos de clique nos botões...");
  
  const btnRegister = document.getElementById("btnRegisterPush");
  const btnSave = document.getElementById("btnSaveSenderIdentity");

  if (btnRegister) {
    btnRegister.addEventListener("click", processarInscricaoComPerfil);
    console.log("🟢 [SW-LOG] Evento de clique atrelado com sucesso ao botão 'btnRegisterPush'!");
  } else {
    console.error("❌ [SW-LOG] ALERTA: Botão 'btnRegisterPush' não foi localizado no HTML da página!");
  }

  if (btnSave) {
    btnSave.addEventListener("click", homologarEmissorJWT);
  }

  document.querySelectorAll(".copy-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      const targetId = (event.currentTarget as HTMLButtonElement).getAttribute("data-target");
      if (targetId) copyToClipboard(targetId);
    });
  });
});

