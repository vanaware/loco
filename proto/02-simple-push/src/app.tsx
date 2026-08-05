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

// 🔥 Importar função centralizada de ID
import { gerarIdMensagem } from "./utils/id-utils.ts";

// ============================================================
// DEBUG LOGGER (captura logs para exibir na página)
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
      // Ignore scroll errors
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
// FUNÇÃO PARA REGISTRAR O SERVICE WORKER
// ============================================================
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
    // Use navigator.serviceWorker.ready para obter registro totalmente pronto
    const readyReg = await navigator.serviceWorker.ready;
    addDebugLog("✅ Service Worker ativo e pronto.");
    addDebugLog("Usando registration do ready (com pushManager)...");
    return readyReg;
  } catch (err: any) {
    addDebugLog("❌ Erro ao registrar Service Worker: " + (err?.message || String(err)));
    throw new Error(`Falha ao registrar Service Worker: ${err?.message || String(err)}`);
  }
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
// GERAÇÃO DE CHAVES VAPID (ECDSA) - extractable: true
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
// GERAR PERFIL (profile) – unificado (NÃO GERA JWT)
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
        addDebugLog("⚠️ ⚠️ Permissão de notificação foi negada pelo usuário. Continuando sem notificações...");
      } else if (Notification.permission === "default") {
        try {
          const permission = await Notification.requestPermission();
          if (permission !== "granted") {
            addDebugLog("⚠️ ⚠️ Permissão de notificação não concedida. Continuando sem notificações...");
          }
        } catch (permErr: any) {
          console.warn("⚠️ Não foi possível solicitar permissão de notificação (ambiente não suportado):", permErr?.message);
        }
      }
    } catch (notifErr: any) {
      console.warn("⚠️ Erro ao verificar notificações:", notifErr?.message);
    }

    addDebugLog("Step 2: Registrando Service Worker...");
    const registration = await registrarServiceWorker();

    addDebugLog("Step 3: Buscando chave pública do servidor...");
    const resServerKey = await fetch("/api/server-public-key");
    if (!resServerKey.ok) {
      throw new Error(`Erro ao buscar chave do servidor: ${resServerKey.status}`);
    }
    const serverPublicKeyJwk = await resServerKey.json();
    addDebugLog("Step 3.5: Chave do servidor recebida:: " + JSON.stringify(serverPublicKeyJwk));

    // Gerar ou obter chaves VAPID
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

    // Subscription
    addDebugLog("Step 4: Obtendo subscription...");
    addDebugLog("registration type:: " + JSON.stringify(typeof registration));
    addDebugLog("registration constructor:: " + JSON.stringify(registration?.constructor?.name));
    addDebugLog("registration.pushManager exists?: " + JSON.stringify(!!registration?.pushManager));
    addDebugLog("registration.scope:: " + JSON.stringify(registration?.scope));
    addDebugLog("registration.active:: " + JSON.stringify(registration?.active));
    addDebugLog("registration.installing:: " + JSON.stringify(registration?.installing));
    addDebugLog("registration.waiting:: " + JSON.stringify(registration?.waiting));
    addDebugLog("Object.keys(registration):: " + JSON.stringify(Object.keys(registration || {})));
    
    if (!registration) {
      throw new Error("Service Worker registration é null/undefined");
    }
    
    if (!registration.pushManager) {
      addDebugLog("⚠️ ⚠️ AVISO: pushManager não está disponível no registration object");
      addDebugLog("⚠️ Isso pode significar: navegador não suporta Web Push API, ou escopo está incorreto");
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

    // E2E keys
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
  addDebugLog("🔄 Gerando JWT de compartilhamento de perfil...");
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

    // 🔥 Usar função centralizada para gerar ID (12 caracteres)
    const msgId = gerarIdMensagem();
    console.log(`[APP] 📝 ID da mensagem: ${msgId} (${msgId.length} caracteres)`);

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
// CARREGAR MENSAGENS ENVIADAS
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
  addDebugLog("📂 Carregando dados iniciais (unificado)...");
  try {
    const profile = await buscarProfile();
    if (profile) {
      (document.getElementById('profileNameB') as HTMLInputElement).value = profile.name;
      (document.getElementById('profileEmailB') as HTMLInputElement).value = profile.email;
      addDebugLog("✅ Perfil carregado:: " + JSON.stringify(profile.name));
      // 🔥 Verifica se o envelope existe, senão avisa
      if (!profile.vapidPrivateKeyEnvelope) {
        addDebugLog("⚠️ ⚠️ Perfil antigo sem envelope VAPID. Clique em 'Gerar/Atualizar Perfil' para corrigir.");
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
    console.warn("⚠️ Erro ao carregar dados iniciais:", err);
  }
}

// ============================================================
// EVENT LISTENERS
// ============================================================
window.addEventListener("DOMContentLoaded", async () => {
  addDebugLog("📄 DOM carregado, inicializando aplicação...");
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
      console.error("❌ Erro catch no botão - Erro ao gerar perfil:", err);
      console.error("err.message:", err?.message);
      console.error("typeof err:", typeof err);
      const mensagemErro = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
      showToast("❌ Erro ao gerar perfil: " + mensagemErro, "error");
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