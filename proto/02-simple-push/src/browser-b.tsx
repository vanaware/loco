// src/browser-b.tsx
import { set, createStore } from "idb-keyval";
import {
  storeChavesE2E,
  storeListaBranca,
  storeChavesVapid,
  storeSubscription,
  salvarChavesE2EB,
  buscarChavesE2EB,
  salvarPublicEncryptB,
  salvarPublicVerifyB,
  buscarPublicEncryptB,
  buscarPublicVerifyB,
  salvarChavesVapidB,
  buscarChavesVapidB,
  salvarSubscriptionB,
  buscarSubscriptionB,
  removerSubscriptionB,
  salvarEmissorHomologado,
  buscarEmissorHomologado,
} from "./utils/db-helpers.ts";
import type { ChavesE2EB, ChavesVapidB, SubscriptionData, EmissorHomologado } from "./constants/db.ts";

console.log("🟢 [SW-LOG] Arquivo browser-b.tsx carregado com bancos isolados por idb-keyval!");

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

// 🔥 Função para criptografar a chave VAPID com a chave pública do servidor
async function criptografarChaveVapid(
  privateKeyJwk: JsonWebKey,
  serverPublicKeyJwk: JsonWebKey
): Promise<string> {
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

  const publicEncryptJwk = await window.crypto.subtle.exportKey("jwk", encryptionKeyPair.publicKey);
  const publicSignJwk = await window.crypto.subtle.exportKey("jwk", signatureKeyPair.publicKey);

  const chavesE2E: ChavesE2EB = {
    privateDecrypt: encryptionKeyPair.privateKey,
    publicEncrypt: publicEncryptJwk,
    privateSign: signatureKeyPair.privateKey,
    publicSign: publicSignJwk,
  };
  await salvarChavesE2EB(chavesE2E);

  await salvarPublicEncryptB(publicEncryptJwk);
  await salvarPublicVerifyB(publicSignJwk);

  return { publicEncryptJwk, publicSignJwk };
}

// 🔥 Verifica se a subscription existente é válida
async function verificarSubscriptionValida(
  subscription: PushSubscription,
  vapidPublicKeyJwk: JsonWebKey
): Promise<boolean> {
  try {
    // Verifica se o endpoint ainda está ativo
    const p256dhBuffer = subscription.getKey('p256dh');
    const authBuffer = subscription.getKey('auth');
    
    if (!p256dhBuffer || !authBuffer) {
      console.log("🔍 [SW-LOG] Subscription inválida: chaves faltando");
      return false;
    }

    // Verifica se a VAPID é a mesma
    const subscriptionData = await buscarSubscriptionB();
    if (subscriptionData && subscriptionData.vapidPublicKey) {
      // Compara as chaves públicas (simplificado - poderia comparar o n e e)
      const currentN = vapidPublicKeyJwk.n;
      const storedN = subscriptionData.vapidPublicKey.n;
      
      if (currentN !== storedN) {
        console.log("🔍 [SW-LOG] Subscription de VAPID diferente, precisa recriar");
        return false;
      }
    }

    return true;
  } catch (err) {
    console.log("🔍 [SW-LOG] Erro ao verificar subscription:", err);
    return false;
  }
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

    // 🔥 Busca a chave pública do servidor
    const resServerKey = await fetch("/api/server-public-key");
    const serverPublicKeyJwk = await resServerKey.json();

    // ============================================================
    // 🔥 VERIFICA E CARREGA CHAVES VAPID EXISTENTES
    // ============================================================
    let chavesVapidSalvas = await buscarChavesVapidB();
    let vapidKeyPair: CryptoKeyPair;
    let publicKeyJwk: JsonWebKey;
    let privateKeyJwk: JsonWebKey;
    let chavesVapidGeradas = false;

    if (chavesVapidSalvas) {
      console.log("📂 [SW-LOG] Chaves VAPID encontradas no IndexedDB");
      publicKeyJwk = chavesVapidSalvas.publicKey;
      privateKeyJwk = chavesVapidSalvas.privateKey;
      
      try {
        vapidKeyPair = {
          publicKey: await window.crypto.subtle.importKey(
            "jwk", publicKeyJwk,
            { name: "ECDSA", namedCurve: "P-256" },
            true, ["verify"]
          ),
          privateKey: await window.crypto.subtle.importKey(
            "jwk", privateKeyJwk,
            { name: "ECDSA", namedCurve: "P-256" },
            true, ["sign"]
          )
        } as CryptoKeyPair;
        console.log("✅ [SW-LOG] Chaves VAPID carregadas com sucesso");
      } catch (err) {
        console.warn("⚠️ [SW-LOG] Erro ao importar chaves VAPID salvas, recriando...", err);
        chavesVapidSalvas = undefined;
      }
    }

    if (!chavesVapidSalvas) {
      console.log("🔑 [SW-LOG] Gerando novas chaves VAPID...");
      vapidKeyPair = await generateVAPIDKeys();
      publicKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.publicKey);
      privateKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.privateKey);
      
      await salvarChavesVapidB({
        publicKey: publicKeyJwk,
        privateKey: privateKeyJwk
      });
      chavesVapidGeradas = true;
      console.log("✅ [SW-LOG] Novas chaves VAPID salvas no IndexedDB");
    }

    const rawPublicKey = await window.crypto.subtle.exportKey("raw", vapidKeyPair.publicKey);

    // ============================================================
    // 🔥 VERIFICA SUBSCRIPTION EXISTENTE
    // ============================================================
    let existingSubscription = await registration.pushManager.getSubscription();
    let subscriptionValida = false;

    if (existingSubscription) {
      console.log("📂 [SW-LOG] Subscription existente encontrada");
      subscriptionValida = await verificarSubscriptionValida(existingSubscription, publicKeyJwk);
      
      if (subscriptionValida) {
        console.log("✅ [SW-LOG] Subscription válida, reutilizando");
      } else {
        console.log("🔄 [SW-LOG] Subscription inválida, removendo e recriando");
        await existingSubscription.unsubscribe();
        await removerSubscriptionB();
        existingSubscription = null;
      }
    }

    // Só cria nova subscription se não houver uma válida
    if (!existingSubscription || !subscriptionValida) {
      console.log("📝 [SW-LOG] Criando nova subscription...");
      existingSubscription = await registration.pushManager.subscribe({
        applicationServerKey: new Uint8Array(rawPublicKey),
        userVisibleOnly: true
      });
      console.log("✅ [SW-LOG] Nova subscription criada");
    }

    const p256dhBuffer = existingSubscription.getKey('p256dh');
    const authBuffer = existingSubscription.getKey('auth');
    const customSubscriptionJson = {
      endpoint: existingSubscription.endpoint,
      keys: { p256dh: rawBufferToBase64Url(p256dhBuffer), auth: rawBufferToBase64Url(authBuffer) }
    };

    // ============================================================
    // 🔥 VERIFICA E CARREGA CHAVES E2E EXISTENTES
    // ============================================================
    let e2ePublicKeys = await buscarChavesE2EB();
    let publicEncryptJwk: JsonWebKey;
    let publicSignJwk: JsonWebKey;

    if (e2ePublicKeys) {
      console.log("📂 [SW-LOG] Chaves E2E encontradas no IndexedDB");
      publicEncryptJwk = e2ePublicKeys.publicEncrypt;
      publicSignJwk = e2ePublicKeys.publicSign;
      
      // Verifica se as chaves são válidas (tenta importar)
      try {
        await window.crypto.subtle.importKey(
          "jwk", publicEncryptJwk,
          { name: "RSA-OAEP", hash: "SHA-256" },
          true, ["encrypt"]
        );
        await window.crypto.subtle.importKey(
          "jwk", publicSignJwk,
          { name: "RSA-PSS", hash: "SHA-256" },
          true, ["verify"]
        );
        console.log("✅ [SW-LOG] Chaves E2E carregadas com sucesso");
      } catch (err) {
        console.warn("⚠️ [SW-LOG] Erro ao importar chaves E2E salvas, recriando...", err);
        e2ePublicKeys = undefined;
      }
    }

    if (!e2ePublicKeys) {
      console.log("🔑 [SW-LOG] Gerando novas chaves E2E...");
      const novasChaves = await generateE2EEKeys();
      publicEncryptJwk = novasChaves.publicEncryptJwk;
      publicSignJwk = novasChaves.publicSignJwk;
      console.log("✅ [SW-LOG] Novas chaves E2E salvas no IndexedDB");
    }

    // ============================================================
    // 🔥 SALVA SUBSCRIPTION NO INDEXEDDB
    // ============================================================
    const subscriptionData: SubscriptionData = {
      endpoint: existingSubscription.endpoint,
      keys: customSubscriptionJson.keys,
      vapidPublicKey: publicKeyJwk,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await salvarSubscriptionB(subscriptionData);
    console.log("✅ [SW-LOG] Subscription salva no IndexedDB");

    // ============================================================
    // 🔥 CRIPTOGRAFA A CHAVE PRIVADA VAPID
    // ============================================================
    console.log("🔐 [SW-LOG] Criptografando chave VAPID para o bundle...");
    const privateKeyEncrypted = await criptografarChaveVapid(privateKeyJwk, serverPublicKeyJwk);
    console.log("✅ [SW-LOG] Chave VAPID criptografada com sucesso!");

    // ============================================================
    // 🔥 MONTA O BUNDLE
    // ============================================================
    const finalPayloadBundle = {
      subscription: customSubscriptionJson,
      vapid: {
        subject: `mailto:${emailB}`,
        publicKey: publicKeyJwk,
        privateKey: privateKeyEncrypted
      },
      isVapidEncrypted: true,
      e2e: {
        ownerName: nomeB,
        ownerEmail: emailB,
        browserB_PublicKeyEncrypt: publicEncryptJwk,
        browserB_PublicKeyVerify: publicSignJwk
      },
      payloadText: ""
    };

    const textarea = document.getElementById('unifiedBundle') as HTMLTextAreaElement;
    if (textarea) {
      textarea.value = JSON.stringify(finalPayloadBundle, null, 2);
    }
    
    console.log("🚀 Carga híbrida gerada com sucesso via idb-keyval!");
    alert("✅ Carga unificada gerada com sucesso! Copie o JSON e cole no Browser A.");

  } catch (err) {
    console.error("❌ [SW-LOG] Erro:", err);
    alert("Falha: " + (err as Error).message);
  }
}

async function homologarEmissorJWT(): Promise<void> {
  const rawJwk = (document.getElementById('senderPublicKeyJson') as HTMLTextAreaElement).value;
  try {
    const jwkObject = JSON.parse(rawJwk);
    if (!jwkObject.ownerEmail || !jwkObject.ownerName) throw new Error("JWK ausente de metadados de Perfil.");
    await window.crypto.subtle.importKey("jwk", jwkObject, { name: "RSA-PSS", hash: "SHA-256" }, true, ["verify"]);

    const emissor: EmissorHomologado = {
      email: jwkObject.ownerEmail,
      name: jwkObject.ownerName,
      jwk: jwkObject
    };
    await salvarEmissorHomologado(jwkObject.ownerEmail, emissor);

    alert(`🛡️ Emissor "${jwkObject.ownerName}" cadastrado com sucesso via idb-keyval!`);
  } catch (err) {
    alert("Falha na validação: " + (err as Error).message);
  }
}

// ============================================================
// FUNÇÕES DE MENSAGENS RECEBIDAS
// ============================================================

// 🔥 Função para carregar mensagens recebidas
async function carregarMensagensRecebidas(): Promise<void> {
  console.log("📬 [SW-LOG] Carregando mensagens recebidas...");
  
  const {
    listarMensagensRecebidas,
    atualizarStatusMensagemRecebida,
  } = await import("./utils/db-helpers.ts");
  
  const mensagens = await listarMensagensRecebidas();
  const container = document.getElementById('mensagensRecebidas');
  
  if (!container) return;
  
  if (mensagens.length === 0) {
    container.innerHTML = '<p style="color: #666;">Nenhuma mensagem recebida.</p>';
    return;
  }
  
  // Ordena por data (mais recentes primeiro)
  mensagens.sort((a, b) => b.recebidoEm - a.recebidoEm);
  
  let html = '';
  for (const msg of mensagens) {
    const statusEmoji = msg.status === 'nao_lida' ? '🟡' : msg.status === 'notificada' ? '🔔' : '✅';
    const data = new Date(msg.recebidoEm).toLocaleString();
    
    html += `
      <div style="border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin-bottom: 8px; 
                  background: ${msg.status === 'nao_lida' ? '#fffde7' : '#f9f9f9'};">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong>${statusEmoji} ${msg.remetente}</strong>
          <small style="color: #888;">${data}</small>
        </div>
        <p style="margin: 5px 0;">${msg.conteudo}</p>
        <div style="display: flex; gap: 8px; margin-top: 5px;">
          <span style="font-size: 12px; color: #666;">Status: ${msg.status}</span>
          ${msg.status === 'nao_lida' || msg.status === 'notificada' ? 
            `<button class="btn-marcar-lida" data-id="${msg.id}" style="font-size: 12px; padding: 2px 8px; background: #006c4f; color: white; border: none; border-radius: 3px; cursor: pointer;">Marcar como lida</button>` : 
            ''
          }
          <button class="btn-remover-msg" data-id="${msg.id}" style="font-size: 12px; padding: 2px 8px; background: #cc0000; color: white; border: none; border-radius: 3px; cursor: pointer;">Remover</button>
        </div>
      </div>
    `;
  }
  
  container.innerHTML = html;
  
  // Event listeners para os botões
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
        const { removerMensagemRecebida } = await import("./utils/db-helpers.ts");
        await removerMensagemRecebida(id);
        await carregarMensagensRecebidas();
      }
    });
  });
}

// 🔥 Função para remover mensagens lidas
async function removerMensagensLidas(): Promise<void> {
  if (!confirm('Remover todas as mensagens lidas?')) return;
  
  const { listarMensagensRecebidas, removerMensagemRecebida } = await import("./utils/db-helpers.ts");
  const mensagens = await listarMensagensRecebidas();
  const lidas = mensagens.filter(m => m.status === 'lida');
  
  for (const msg of lidas) {
    await removerMensagemRecebida(msg.id);
  }
  
  await carregarMensagensRecebidas();
  alert(`✅ ${lidas.length} mensagens removidas.`);
}

// ============================================================
// EVENT LISTENER PRINCIPAL
// ============================================================

window.addEventListener("DOMContentLoaded", () => {
  // ============================================================
  // EVENTOS EXISTENTES
  // ============================================================
  
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

  // ============================================================
  // EVENTOS DE MENSAGENS RECEBIDAS
  // ============================================================
  
  const btnCarregar = document.getElementById('btnCarregarMensagens');
  if (btnCarregar) {
    btnCarregar.addEventListener('click', carregarMensagensRecebidas);
  }

  const btnLimparLidas = document.getElementById('btnLimparLidas');
  if (btnLimparLidas) {
    btnLimparLidas.addEventListener('click', removerMensagensLidas);
  }

  // Carregar mensagens automaticamente ao iniciar
  carregarMensagensRecebidas();

  // Recarregar mensagens quando receber push (via postMessage)
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'PUSH_RECEIVED') {
      console.log('📬 [SW-LOG] Push recebido, recarregando mensagens...');
      setTimeout(carregarMensagensRecebidas, 1000);
    }
  });
});