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

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(buffer));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
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
// GERAR PERFIL (profile) – unificado
// ============================================================
async function gerarProfile(): Promise<any> {
  console.log("📦 Gerando perfil unificado...");
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
      vapidPrivateKeyEnvelope: privateKeyEncrypted, // <-- novo campo
      e2ePublicKey: e2ePublicKey,
      e2ePrivateKeyJwk: e2ePrivateKeyJwk,
      subscription: subscription,
      createdAt: existingProfile?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    // Salvar perfil unificado
    await salvarProfile(profile);

    // Salvar identidade (para compatibilidade)
    const identidadeTemporaria = {
      name: nome,
      email: email,
      privateKey: vapidKeyPair.privateKey
    };
    await salvarIdentidadeA(identidadeTemporaria);

    // Construir o objeto de perfil para compartilhamento
    const profilePublic = {
      iss: email,
      nm: nome,
      kid: publicKeyJwk,
      s: subscription,
      p: e2ePublicKey,
      k: privateKeyEncrypted // chave VAPID cifrada
    };

    return profilePublic;
  } catch (err) {
    console.error("❌ Erro ao gerar perfil:", err);
    throw err;
  }
}

// ============================================================
// ADICIONAR CONTATO
// ============================================================
async function adicionarContato(): Promise<void> {
  const profileRaw = (document.getElementById('profileInput') as HTMLTextAreaElement).value;
  if (!profileRaw) {
    showToast("Cole o perfil da pessoa que deseja adicionar.", "error");
    return;
  }
  try {
    const profile = JSON.parse(profileRaw);
    const required = ['iss', 'kid', 's', 'p', 'k'];
    for (const field of required) {
      if (!profile[field]) throw new Error(`Campo obrigatório ausente: ${field}`);
    }
    if (!profile.s.endpoint || !profile.s.keys || !profile.s.keys.p256dh || !profile.s.keys.auth) {
      throw new Error('Subscription inválida: falta endpoint ou keys.');
    }
    await crypto.subtle.importKey(
      "jwk", profile.kid,
      { name: "ECDSA", namedCurve: "P-256" },
      true, ["verify"]
    );

    const contato: Contato = {
      publicKeyVapid: profile.kid,
      email: profile.iss,
      nome: profile.nm || profile.iss,
      publicKeyRSA: profile.p,
      subscription: profile.s,
      vapidPrivateKey: profile.k,
      homologado: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await salvarContato(contato);
    showToast(`✅ Contato "${contato.nome}" adicionado!`, "success");
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
    container.innerHTML = '<p style="color: #666; font-size: 14px;">Nenhum contato adicionado ainda.</p>';
    return;
  }
  let html = '';
  for (const c of contatos) {
    const homol = c.homologado ? '✅' : '🔄';
    html += `
      <div class="contato-item">
        <span><strong>${c.nome}</strong> &lt;${c.email}&gt; ${homol}</span>
        <button class="btn-remover-contato btn-sm danger" data-publickey='${JSON.stringify(c.publicKeyVapid).replace(/'/g, "&#39;")}' style="font-size: 11px; padding: 2px 8px; background: #cc0000; color: white; border: none; border-radius: 3px; cursor: pointer;">🗑️</button>
      </div>
    `;
  }
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
    // Validar contato
    const contato = await buscarContatoPorChave(selectedKey);
    if (!contato) {
      showToast("Contato não encontrado. Tente adicioná-lo novamente.", "error");
      return;
    }

    // Salvar mensagem na fila
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

    // Notificar Service Worker
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
// COMPARTILHAR PERFIL
// ============================================================
async function compartilharProfile(): Promise<void> {
  console.log("🔄 Gerando e compartilhando perfil...");
  try {
    const profile = await gerarProfile();
    const profileJson = JSON.stringify(profile, null, 2);
    const display = document.getElementById('myProfileDisplay');
    if (display) {
      display.textContent = profileJson;
      display.style.background = '#e8f5e9';
    }
    await copyToClipboard(profileJson);
    showToast("✅ Perfil copiado para a área de transferência!", "success");
  } catch (err: any) {
    showToast("❌ Erro ao gerar perfil: " + err.message, "error");
  }
}

// ============================================================
// CARREGAR MENSAGENS RECEBIDAS (implementação completa)
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

    const botaoHomologar = (!homologado && contato) ?
      `<button class="btn-homologar-msg btn-sm homologar-btn" data-publickey='${JSON.stringify(contato.publicKeyVapid).replace(/'/g, "&#39;")}' style="font-size: 11px; padding: 2px 8px; color: white; border: none; border-radius: 3px; cursor: pointer;">🔄 Homologar</button>` :
      '';

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
            ${botaoHomologar}
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

  container.querySelectorAll('.btn-homologar-msg').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const target = e.currentTarget as HTMLButtonElement;
      const publicKeyStr = target.dataset.publickey || '';
      try {
        const publicKeyVapid = JSON.parse(publicKeyStr);
        await homologarContato(publicKeyVapid);
        showToast("✅ Emissor homologado!", "success");
        await carregarMensagensRecebidas();
        await carregarContatos();
      } catch (err) {
        showToast(`❌ Erro: ${err.message}`, "error");
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
// HOMOLOGAR TODOS OS CONTATOS
// ============================================================
async function homologarTodasMensagens(): Promise<void> {
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
  await carregarMensagensRecebidas();
  await carregarContatos();
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

  document.getElementById('btnGerarProfile')?.addEventListener('click', compartilharProfile);
  document.getElementById('btnCopyProfile')?.addEventListener('click', async () => {
    const display = document.getElementById('myProfileDisplay');
    if (display && display.textContent && display.textContent !== 'Clique em "Gerar e Compartilhar Meu Perfil" para criar seu perfil.') {
      await copyToClipboard(display.textContent);
    } else {
      showToast("Primeiro gere seu perfil.", "info");
    }
  });
  document.getElementById('btnAdicionarContato')?.addEventListener('click', adicionarContato);
  document.getElementById('btnEnviarB')?.addEventListener('click', enviarMensagemB);
  document.getElementById('btnCarregarMensagens')?.addEventListener('click', carregarMensagensRecebidas);
  document.getElementById('btnLimparLidas')?.addEventListener('click', removerMensagensLidas);
  document.getElementById('btnHomologarTodas')?.addEventListener('click', homologarTodasMensagens);

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
    if (event.data?.type === 'MENSAGEM_ENVIADA') {
      console.log('📤 Mensagem enviada, atualizando lista...');
      setTimeout(carregarMensagensEnviadas, 500);
    }
  });
});