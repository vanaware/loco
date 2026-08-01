// src/browser-c.tsx
// Browser C - Emissor e Receptor Unificado
// Reutiliza todos os IndexedDB existentes

import {
  // Browser A - Identidade
  storeIdentidadeA,
  salvarIdentidadeA,
  buscarIdentidadeA,
  salvarPublicKeyA,
  buscarPublicKeyA,
  
  // Browser A - Bundles
  storeBundlesA,
  salvarBundleAtivo,
  buscarBundleAtivo,
  salvarBundleHistorico,
  buscarHistoricoBundles,
  
  // Browser A - Mensagens de Envio
  storeMensagensEnvioA,
  salvarMensagemEnvio,
  buscarMensagensEnvioPorStatus,
  listarMensagensEnvio,
  atualizarStatusMensagemEnvio,
  removerMensagemEnvio,
  
  // Browser B - E2E
  storeChavesE2E,
  salvarChavesE2EB,
  buscarChavesE2EB,
  salvarPublicEncryptB,
  salvarPublicVerifyB,
  buscarPublicEncryptB,
  buscarPublicVerifyB,
  
  // Browser B - VAPID
  storeChavesVapid,
  salvarChavesVapidB,
  buscarChavesVapidB,
  
  // Browser B - Subscription
  storeSubscription,
  salvarSubscriptionB,
  buscarSubscriptionB,
  removerSubscriptionB,
  
  // Browser B - Lista Branca
  storeListaBranca,
  salvarEmissorHomologado,
  buscarEmissorHomologado,
  listarEmissoresHomologados,
  removerChave as removerEmissorHomologado,
  
  // Browser B - Mensagens Recebidas
  storeMensagensRecebidasB,
  salvarMensagemRecebida,
  listarMensagensRecebidas,
  atualizarStatusMensagemRecebida,
  removerMensagemRecebida,
  
  // Helpers de perfil
  salvarPerfilB,
  buscarPerfilB,
} from "./utils/db-helpers.ts";

import type {
  IdentidadeA,
  ChavesE2EB,
  ChavesVapidB,
  SubscriptionData,
  MensagemEnvio,
  MensagemRecebida,
  EmissorHomologado,
  BundleData,
} from "./constants/db.ts";

console.log("🟢 [SW-LOG-C] Arquivo browser-c.tsx carregado!");

// ============================================================
// UTILITÁRIOS
// ============================================================

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(buffer));
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
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

function copyToClipboard(id: string): void {
  const input = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
  if (input) {
    input.select();
    document.execCommand('copy');
    showToast("✅ Copiado para a área de transferência!", "success");
  }
}

// 🔥 Toast de notificação
function showToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  const colors = {
    success: '#d4edda',
    error: '#f8d7da',
    info: '#d1ecf1'
  };
  const textColors = {
    success: '#155724',
    error: '#721c24',
    info: '#0c5460'
  };
  
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; 
    background: ${colors[type]}; color: ${textColors[type]}; 
    padding: 12px 20px; border-radius: 6px; 
    border: 1px solid ${colors[type]};
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 9999; max-width: 400px;
    font-family: system-ui, sans-serif;
    animation: fadeInUp 0.3s ease;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================================
// FUNÇÕES DO BROWSER C (IDENTIDADE)
// ============================================================

async function gerarIdentidadeC(): Promise<void> {
  console.log("🚀 [SW-LOG-C] Gerando identidade...");
  
  const nameC = (document.getElementById('profileNameC') as HTMLInputElement).value;
  const emailC = (document.getElementById('profileEmailC') as HTMLInputElement).value;

  if (!nameC || !emailC) {
    showToast("Por favor, preencha seu Nome e E-mail.", "error");
    return;
  }

  try {
    const existente = await buscarIdentidadeA();
    if (existente) {
      if (!confirm(`Já existe uma identidade para "${existente.name}" <${existente.email}>. Deseja recriar?`)) {
        return;
      }
    }

    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: "RSA-PSS",
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: "SHA-256"
      },
      false,
      ["sign", "verify"]
    );

    const identidade: IdentidadeA = {
      name: nameC,
      email: emailC,
      privateKey: keyPair.privateKey
    };
    await salvarIdentidadeA(identidade);

    const publicSignJwk = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const extendedJwk = { ...publicSignJwk, ownerName: nameC, ownerEmail: emailC };
    await salvarPublicKeyA(extendedJwk);

    await salvarPerfilB(nameC, emailC);

    const textarea = document.getElementById('myPublicKeyC') as HTMLTextAreaElement;
    if (textarea) {
      textarea.value = JSON.stringify(extendedJwk);
    }

    console.log("✅ [SW-LOG-C] Identidade gerada e salva!");
    showToast("✅ Identidade gerada com sucesso!", "success");
    
    await carregarListaEmissores();
    await carregarHistoricoBundlesC();
  } catch (err) {
    console.error(err);
    showToast("❌ Falha ao gerar identidade: " + (err as Error).message, "error");
  }
}

// ============================================================
// FUNÇÕES DO BROWSER C (RECEPTOR - Browser B)
// ============================================================

async function generateVAPIDKeys(): Promise<CryptoKeyPair> {
  return await window.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
}

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
  console.log("🔑 [SW-LOG-C] Gerando chaves E2E...");
  
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

async function registrarPushC(): Promise<void> {
  console.log("📡 [SW-LOG-C] Registrando para push...");
  
  const nomeC = (document.getElementById('profileNameC') as HTMLInputElement).value;
  const emailC = (document.getElementById('profileEmailC') as HTMLInputElement).value;

  if (!nomeC || !emailC) {
    showToast("Por favor, preencha seu Nome e E-mail primeiro.", "error");
    return;
  }

  try {
    const permissao = await Notification.requestPermission();
    if (permissao !== "granted") {
      showToast("⚠️ ERRO: Permissão de notificação negada.", "error");
      return;
    }

    const registration = await navigator.serviceWorker.register("./service-worker.js");
    await registration.update();
    await navigator.serviceWorker.ready;

    const resServerKey = await fetch("/api/server-public-key");
    const serverPublicKeyJwk = await resServerKey.json();

    // ============================================================
    // CHAVES VAPID
    // ============================================================
    let chavesVapidSalvas = await buscarChavesVapidB();
    let vapidKeyPair: CryptoKeyPair;
    let publicKeyJwk: JsonWebKey;
    let privateKeyJwk: JsonWebKey;

    if (chavesVapidSalvas) {
      console.log("📂 [SW-LOG-C] Chaves VAPID encontradas no IndexedDB");
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
      } catch {
        chavesVapidSalvas = undefined;
      }
    }

    if (!chavesVapidSalvas) {
      console.log("🔑 [SW-LOG-C] Gerando novas chaves VAPID...");
      vapidKeyPair = await generateVAPIDKeys();
      publicKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.publicKey);
      privateKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.privateKey);
      
      await salvarChavesVapidB({
        publicKey: publicKeyJwk,
        privateKey: privateKeyJwk
      });
    }

    const rawPublicKey = await window.crypto.subtle.exportKey("raw", vapidKeyPair.publicKey);

    // ============================================================
    // SUBSCRIPTION
    // ============================================================
    let existingSubscription = await registration.pushManager.getSubscription();
    let subscriptionValida = false;

    if (existingSubscription) {
      const subscriptionData = await buscarSubscriptionB();
      if (subscriptionData && subscriptionData.vapidPublicKey?.n === publicKeyJwk.n) {
        subscriptionValida = true;
        console.log("✅ [SW-LOG-C] Subscription reutilizada");
      } else {
        await existingSubscription.unsubscribe();
        await removerSubscriptionB();
        existingSubscription = null;
      }
    }

    if (!existingSubscription || !subscriptionValida) {
      console.log("📝 [SW-LOG-C] Criando nova subscription...");
      existingSubscription = await registration.pushManager.subscribe({
        applicationServerKey: new Uint8Array(rawPublicKey),
        userVisibleOnly: true
      });
    }

    const p256dhBuffer = existingSubscription.getKey('p256dh');
    const authBuffer = existingSubscription.getKey('auth');
    const customSubscriptionJson = {
      endpoint: existingSubscription.endpoint,
      keys: { p256dh: rawBufferToBase64Url(p256dhBuffer), auth: rawBufferToBase64Url(authBuffer) }
    };

    // ============================================================
    // CHAVES E2E
    // ============================================================
    let e2ePublicKeys = await buscarChavesE2EB();
    let publicEncryptJwk: JsonWebKey;
    let publicSignJwk: JsonWebKey;

    if (e2ePublicKeys) {
      publicEncryptJwk = e2ePublicKeys.publicEncrypt;
      publicSignJwk = e2ePublicKeys.publicSign;
    } else {
      const novasChaves = await generateE2EEKeys();
      publicEncryptJwk = novasChaves.publicEncryptJwk;
      publicSignJwk = novasChaves.publicSignJwk;
    }

    // ============================================================
    // SALVA SUBSCRIPTION
    // ============================================================
    const subscriptionData: SubscriptionData = {
      endpoint: existingSubscription.endpoint,
      keys: customSubscriptionJson.keys,
      vapidPublicKey: publicKeyJwk,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await salvarSubscriptionB(subscriptionData);

    // ============================================================
    // CRIPTOGRAFA E MONTA BUNDLE
    // ============================================================
    const privateKeyEncrypted = await criptografarChaveVapid(privateKeyJwk, serverPublicKeyJwk);

    const finalPayloadBundle = {
      subscription: customSubscriptionJson,
      vapid: {
        subject: `mailto:${emailC}`,
        publicKey: publicKeyJwk,
        privateKey: privateKeyEncrypted
      },
      isVapidEncrypted: true,
      e2e: {
        ownerName: nomeC,
        ownerEmail: emailC,
        browserB_PublicKeyEncrypt: publicEncryptJwk,
        browserB_PublicKeyVerify: publicSignJwk
      },
      payloadText: ""
    };

    const textarea = document.getElementById('myBundleC') as HTMLTextAreaElement;
    if (textarea) {
      textarea.value = JSON.stringify(finalPayloadBundle, null, 2);
    }

    await salvarBundleAtivo(finalPayloadBundle);
    await salvarBundleHistorico(finalPayloadBundle);

    console.log("✅ [SW-LOG-C] Registro concluído!");
    showToast("✅ Registro para push concluído!", "success");
    
    await carregarMensagensRecebidasC();
    await carregarMensagensEnviadasC();
    await carregarHistoricoBundlesC();
  } catch (err) {
    console.error(err);
    showToast("❌ Falha ao registrar: " + (err as Error).message, "error");
  }
}

// ============================================================
// FUNÇÕES DO BROWSER C (HOMOLOGAÇÃO - Lista Branca)
// ============================================================

async function homologarEmissorC(): Promise<void> {
  const rawJwk = (document.getElementById('senderPublicKeyC') as HTMLTextAreaElement).value;
  try {
    const jwkObject = JSON.parse(rawJwk);
    if (!jwkObject.ownerEmail || !jwkObject.ownerName) {
      throw new Error("JWK ausente de metadados de Perfil.");
    }
    
    await window.crypto.subtle.importKey("jwk", jwkObject, { name: "RSA-PSS", hash: "SHA-256" }, true, ["verify"]);

    const emissor: EmissorHomologado = {
      email: jwkObject.ownerEmail,
      name: jwkObject.ownerName,
      jwk: jwkObject
    };
    await salvarEmissorHomologado(jwkObject.ownerEmail, emissor);

    showToast(`✅ Emissor "${jwkObject.ownerName}" homologado!`, "success");
    await carregarListaEmissores();
  } catch (err) {
    showToast("❌ Falha na validação: " + (err as Error).message, "error");
  }
}

async function removerEmissorC(email: string): Promise<void> {
  if (!confirm(`Remover emissor "${email}" da lista branca?`)) return;
  
  try {
    await removerEmissorHomologado(storeListaBranca, email);
    showToast(`✅ Emissor "${email}" removido.`, "success");
    await carregarListaEmissores();
  } catch (err) {
    showToast("❌ Erro ao remover emissor.", "error");
  }
}

async function carregarListaEmissores(): Promise<void> {
  const container = document.getElementById('listaEmissoresC');
  if (!container) return;

  const emissores = await listarEmissoresHomologados();
  
  if (emissores.length === 0) {
    container.innerHTML = '<p style="color: #666; font-size: 14px;">Nenhum emissor homologado ainda.</p>';
    return;
  }

  let html = '';
  for (const [email, data] of emissores) {
    html += `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-bottom: 1px solid #eee; font-size: 14px;">
        <span><strong>${data.name}</strong> &lt;${email}&gt;</span>
        <button class="btn-remover-emissor btn-sm danger" data-email="${email}" style="font-size: 11px; padding: 2px 8px; background: #cc0000; color: white; border: none; border-radius: 3px; cursor: pointer;">🗑️</button>
      </div>
    `;
  }
  container.innerHTML = html;
  
  container.querySelectorAll('.btn-remover-emissor').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const email = (e.currentTarget as HTMLButtonElement).dataset.email;
      if (email) await removerEmissorC(email);
    });
  });
}

// ============================================================
// FUNÇÕES DO BROWSER C (HISTÓRICO DE BUNDLES)
// ============================================================

async function carregarHistoricoBundlesC(): Promise<void> {
  const container = document.getElementById('historicoBundlesC');
  if (!container) return;

  const historico = await buscarHistoricoBundles();
  
  if (historico.length === 0) {
    container.innerHTML = '<p style="color: #666; font-size: 14px;">Nenhum bundle salvo no histórico.</p>';
    return;
  }

  let html = '';
  // Mostra os mais recentes primeiro
  const reversed = [...historico].reverse();
  for (const item of reversed) {
    const data = new Date(item.createdAt).toLocaleString();
    html += `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-bottom: 1px solid #eee; font-size: 14px;">
        <span><strong>${item.nomeReceptor}</strong> &lt;${item.emailReceptor}&gt; <small style="color: #888;">${data}</small></span>
        <button class="btn-carregar-bundle btn-sm" data-bundle='${JSON.stringify(item.bundle).replace(/'/g, "&#39;")}' style="font-size: 11px; padding: 2px 8px; background: #006c4f; color: white; border: none; border-radius: 3px; cursor: pointer;">📂 Carregar</button>
      </div>
    `;
  }
  container.innerHTML = html;
  
  container.querySelectorAll('.btn-carregar-bundle').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const bundleStr = (e.currentTarget as HTMLButtonElement).dataset.bundle;
      if (bundleStr) {
        try {
          const bundle = JSON.parse(bundleStr);
          const textarea = document.getElementById('bundleDestinoC') as HTMLTextAreaElement;
          if (textarea) {
            textarea.value = JSON.stringify(bundle, null, 2);
            showToast("✅ Bundle carregado!", "success");
          }
        } catch {
          showToast("❌ Erro ao carregar bundle.", "error");
        }
      }
    });
  });
}

// ============================================================
// FUNÇÕES DO BROWSER C (ENVIO - Browser A)
// ============================================================

async function enviarMensagemC(): Promise<void> {
  console.log("🚀 [SW-LOG-C] Enviando mensagem...");
  
  const bundleRaw = (document.getElementById('bundleDestinoC') as HTMLTextAreaElement).value;
  const messageText = (document.getElementById('mensagemEnvioC') as HTMLTextAreaElement).value;

  if (!bundleRaw || !messageText) {
    showToast("Por favor, cole o bundle do destinatário e digite uma mensagem.", "error");
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

    const identityRecord = await buscarIdentidadeA();
    if (!identityRecord) {
      throw new Error("Identidade não localizada! Clique em 'Gerar Minha Identidade' primeiro.");
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

    const payloadText = `${tokenStringWithoutSignature}.${base64UrlSignature}`;

    const mensagemId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    
    const mensagem: MensagemEnvio = {
      id: mensagemId,
      bundle: bodyPayload,
      payloadText: payloadText,
      mensagemOriginal: messageText,
      destinatario: e2eConfig.ownerEmail,
      status: 'pendente',
      tentativas: 0,
      maxTentativas: 3,
      criadoEm: Date.now(),
      atualizadoEm: Date.now()
    };

    await salvarMensagemEnvio(mensagem);
    console.log(`✅ [SW-LOG-C] Mensagem salva: ${mensagemId}`);

    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({
      type: 'ENVIAR_MENSAGEM',
      payload: mensagem
    });

    showToast(`✅ Mensagem enviada para o Service Worker!\nID: ${mensagemId}`, "success");
    
    (document.getElementById('mensagemEnvioC') as HTMLTextAreaElement).value = '';
    
    await carregarMensagensEnviadasC();
  } catch (err) {
    showToast(`❌ Erro: ${(err as Error).message}`, "error");
  }
}

// ============================================================
// FUNÇÕES DO BROWSER C (UI - Mensagens Recebidas)
// ============================================================

async function carregarMensagensRecebidasC(): Promise<void> {
  console.log("📬 [SW-LOG-C] Carregando mensagens recebidas...");
  
  const mensagens = await listarMensagensRecebidas();
  const container = document.getElementById('mensagensRecebidasC');
  
  if (!container) return;
  
  if (mensagens.length === 0) {
    container.innerHTML = '<p style="color: #666;">Nenhuma mensagem recebida.</p>';
    return;
  }
  
  mensagens.sort((a, b) => b.recebidoEm - a.recebidoEm);
  
  let html = '';
  for (const msg of mensagens) {
    const statusMap: Record<string, { emoji: string; label: string; classe: string }> = {
      'nao_lida': { emoji: '🟡', label: 'Não lida', classe: 'msg-item-nao-lida' },
      'notificada': { emoji: '🔔', label: 'Notificada', classe: 'msg-item-notificada' },
      'lida': { emoji: '✅', label: 'Lida', classe: 'msg-item-lida' },
    };
    const status = statusMap[msg.status] || { emoji: '❓', label: msg.status, classe: '' };
    const data = new Date(msg.recebidoEm).toLocaleString();
    
    html += `
      <div class="msg-item ${status.classe}" style="border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin-bottom: 8px; background: ${msg.status === 'nao_lida' ? '#fffde7' : '#f9f9f9'};">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
          <strong>${status.emoji} ${msg.remetente}</strong>
          <small style="color: #888;">${data}</small>
        </div>
        <p style="margin: 5px 0;">${msg.conteudo}</p>
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <span style="font-size: 12px; color: #666;">Status: <strong>${status.label}</strong></span>
          <div>
            ${msg.status === 'nao_lida' || msg.status === 'notificada' ? 
              `<button class="btn-marcar-lida-c btn-sm" data-id="${msg.id}" style="font-size: 12px; padding: 2px 8px; background: #006c4f; color: white; border: none; border-radius: 3px; cursor: pointer;">📖 Marcar como lida</button>` : 
              ''
            }
            <button class="btn-remover-recebida-c btn-sm danger" data-id="${msg.id}" style="font-size: 12px; padding: 2px 8px; background: #cc0000; color: white; border: none; border-radius: 3px; cursor: pointer;">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }
  
  container.innerHTML = html;
  
  container.querySelectorAll('.btn-marcar-lida-c').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = (e.currentTarget as HTMLButtonElement).dataset.id;
      if (id) {
        await atualizarStatusMensagemRecebida(id, 'lida');
        await carregarMensagensRecebidasC();
      }
    });
  });
  
  container.querySelectorAll('.btn-remover-recebida-c').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = (e.currentTarget as HTMLButtonElement).dataset.id;
      if (id && confirm('Remover esta mensagem?')) {
        await removerMensagemRecebida(id);
        await carregarMensagensRecebidasC();
      }
    });
  });
}

async function removerMensagensLidasC(): Promise<void> {
  if (!confirm('Remover todas as mensagens lidas?')) return;
  
  const mensagens = await listarMensagensRecebidas();
  const lidas = mensagens.filter(m => m.status === 'lida');
  
  for (const msg of lidas) {
    await removerMensagemRecebida(msg.id);
  }
  
  await carregarMensagensRecebidasC();
  showToast(`✅ ${lidas.length} mensagens removidas.`, "success");
}

// ============================================================
// FUNÇÕES DO BROWSER C (UI - Mensagens Enviadas)
// ============================================================

async function carregarMensagensEnviadasC(): Promise<void> {
  console.log("📤 [SW-LOG-C] Carregando mensagens enviadas...");
  
  const mensagens = await listarMensagensEnvio();
  const container = document.getElementById('mensagensEnviadasC');
  
  if (!container) return;
  
  if (mensagens.length === 0) {
    container.innerHTML = '<p style="color: #666;">Nenhuma mensagem enviada.</p>';
    return;
  }
  
  mensagens.sort((a, b) => b.criadoEm - a.criadoEm);
  
  let html = '';
  for (const msg of mensagens) {
    const statusMap: Record<string, { emoji: string; label: string; classe: string }> = {
      'pendente': { emoji: '⏳', label: 'Pendente', classe: 'msg-item-pendente' },
      'enviando': { emoji: '🔄', label: 'Enviando...', classe: 'msg-item-pendente' },
      'enviada': { emoji: '✅', label: 'Enviada', classe: 'msg-item-enviada' },
      'falha': { emoji: '❌', label: 'Falha', classe: 'msg-item-falha' },
    };
    const status = statusMap[msg.status] || { emoji: '❓', label: msg.status, classe: '' };
    const data = new Date(msg.criadoEm).toLocaleString();
    
    html += `
      <div class="msg-item ${status.classe}" style="border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin-bottom: 8px; background: ${msg.status === 'enviada' ? '#e8f5e9' : msg.status === 'falha' ? '#ffebee' : '#fff8e1'};">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
          <strong>${status.emoji} Para: ${msg.destinatario}</strong>
          <small style="color: #888;">${data}</small>
        </div>
        <p style="margin: 5px 0;">${msg.mensagemOriginal || '(mensagem oculta)'}</p>
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div>
            <span style="font-size: 12px;">Status: <strong>${status.label}</strong></span>
            ${msg.tentativas > 0 ? `<span style="font-size: 12px; color: #666; margin-left: 8px;">Tentativas: ${msg.tentativas}</span>` : ''}
          </div>
          ${msg.status === 'enviada' || msg.status === 'falha' ? 
            `<button class="btn-remover-enviada-c btn-sm danger" data-id="${msg.id}" style="font-size: 12px; padding: 2px 8px; background: #cc0000; color: white; border: none; border-radius: 3px; cursor: pointer;">🗑️</button>` : 
            ''
          }
        </div>
        ${msg.erro ? `<div style="font-size: 12px; color: #cc0000; margin-top: 4px;">Erro: ${msg.erro}</div>` : ''}
      </div>
    `;
  }
  
  container.innerHTML = html;
  
  container.querySelectorAll('.btn-remover-enviada-c').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = (e.currentTarget as HTMLButtonElement).dataset.id;
      if (id && confirm('Remover esta mensagem do histórico?')) {
        await removerMensagemEnvio(id);
        await carregarMensagensEnviadasC();
      }
    });
  });
}

async function limparMensagensEnviadasC(): Promise<void> {
  if (!confirm('Remover todas as mensagens enviadas do histórico?')) return;
  
  const mensagens = await listarMensagensEnvio();
  const enviadas = mensagens.filter(m => m.status === 'enviada' || m.status === 'falha');
  
  for (const msg of enviadas) {
    await removerMensagemEnvio(msg.id);
  }
  
  await carregarMensagensEnviadasC();
  showToast(`✅ ${enviadas.length} mensagens removidas.`, "success");
}

// ============================================================
// FUNÇÕES DO BROWSER C (CARREGAMENTO INICIAL)
// ============================================================

async function carregarDadosIniciaisC(): Promise<void> {
  console.log("📂 [SW-LOG-C] Carregando dados iniciais...");
  
  try {
    const identidade = await buscarIdentidadeA();
    if (identidade) {
      (document.getElementById('profileNameC') as HTMLInputElement).value = identidade.name;
      (document.getElementById('profileEmailC') as HTMLInputElement).value = identidade.email;
      
      const publicKeyJwk = await buscarPublicKeyA();
      if (publicKeyJwk) {
        (document.getElementById('myPublicKeyC') as HTMLTextAreaElement).value = JSON.stringify(publicKeyJwk);
      }
    }
    
    const bundleData = await buscarBundleAtivo();
    if (bundleData) {
      (document.getElementById('myBundleC') as HTMLTextAreaElement).value = JSON.stringify(bundleData.bundle, null, 2);
    }
    
    await carregarListaEmissores();
    await carregarHistoricoBundlesC();
    await carregarMensagensRecebidasC();
    await carregarMensagensEnviadasC();
    
    console.log("✅ [SW-LOG-C] Dados iniciais carregados!");
  } catch (err) {
    console.warn("⚠️ [SW-LOG-C] Erro ao carregar dados iniciais:", err);
  }
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
// EVENT LISTENERS
// ============================================================

window.addEventListener("DOMContentLoaded", async () => {
  console.log("📄 [SW-LOG-C] DOM carregado, inicializando...");
  
  initTabs();
  await carregarDadosIniciaisC();
  
  // ============================================================
  // BOTÕES - IDENTIDADE E REGISTRO
  // ============================================================
  
  document.getElementById('btnGerarIdentidade')?.addEventListener('click', gerarIdentidadeC);
  document.getElementById('btnRegistrarPush')?.addEventListener('click', registrarPushC);
  
  // ============================================================
  // BOTÕES - HOMOLOGAÇÃO
  // ============================================================
  
  document.getElementById('btnSaveSenderC')?.addEventListener('click', homologarEmissorC);
  
  // ============================================================
  // BOTÕES - ENVIO
  // ============================================================
  
  document.getElementById('btnEnviarC')?.addEventListener('click', enviarMensagemC);
  
  // ============================================================
  // BOTÕES - MENSAGENS RECEBIDAS
  // ============================================================
  
  document.getElementById('btnCarregarRecebidasC')?.addEventListener('click', carregarMensagensRecebidasC);
  document.getElementById('btnLimparLidasC')?.addEventListener('click', removerMensagensLidasC);
  
  // ============================================================
  // BOTÕES - MENSAGENS ENVIADAS
  // ============================================================
  
  document.getElementById('btnCarregarEnviadasC')?.addEventListener('click', carregarMensagensEnviadasC);
  document.getElementById('btnLimparEnviadasC')?.addEventListener('click', limparMensagensEnviadasC);
  
  // ============================================================
  // COPY BUTTONS
  // ============================================================
  
  document.querySelectorAll('.copy-btn').forEach((button) => {
    button.addEventListener('click', (event) => {
      const targetId = (event.currentTarget as HTMLButtonElement).getAttribute('data-target');
      if (targetId) copyToClipboard(targetId);
    });
  });
  
  // ============================================================
  // SERVICE WORKER MESSAGES
  // ============================================================
  
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'PUSH_RECEIVED') {
      console.log('📬 [SW-LOG-C] Push recebido, recarregando mensagens...');
      const nome = event.data.payload?.title || 'Remetente';
      showToast(`📩 Nova mensagem de ${nome}!`, "info");
      setTimeout(carregarMensagensRecebidasC, 1000);
    }
    if (event.data?.type === 'MENSAGEM_ENVIADA') {
      console.log('📤 [SW-LOG-C] Mensagem enviada, atualizando lista...');
      setTimeout(carregarMensagensEnviadasC, 500);
    }
  });
});