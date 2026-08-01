// src/browser-b.tsx
import { set, createStore } from "idb-keyval";
import {
  storeChavesE2E,
  storeListaBranca,
  storeChavesVapid,
  storeSubscription,
  storeBundlesA,
  storeMensagensEnvioA,
  salvarChavesE2EB,
  buscarChavesE2EB,
  salvarPublicEncryptB,
  salvarPublicVerifyB,
  salvarChavesVapidB,
  buscarChavesVapidB,
  salvarSubscriptionB,
  buscarSubscriptionB,
  removerSubscriptionB,
  salvarEmissorHomologado,
  buscarEmissorHomologado,
  listarEmissoresHomologados,
  removerChave as removerEmissorHomologado,
  salvarBundleAtivo,
  buscarBundleAtivo,
  salvarBundleHistorico,
  salvarMensagemEnvio,
  listarMensagensEnvio,
  removerMensagemEnvio,
  salvarMensagemRecebida,
  listarMensagensRecebidas,
  atualizarStatusMensagemRecebida,
  removerMensagemRecebida,
  salvarIdentidadeA,
  buscarIdentidadeA,
  salvarPublicKeyA,
  buscarPublicKeyA,
  storeMensagensRecebidasB,
  buscarMensagemRecebida, // 🔥 IMPORTADO
} from "./utils/db-helpers.ts";
import type {
  ChavesE2EB,
  ChavesVapidB,
  SubscriptionData,
  MensagemEnvio,
  MensagemRecebida,
  EmissorHomologado,
  IdentidadeA,
} from "./constants/db.ts";
import { gzipSync } from "fflate";

console.log("🟢 [SW-LOG] Browser B - Emissor e Receptor (assinatura com VAPID)");

// ============================================================
// UTILITÁRIOS
// ============================================================
function copyToClipboard(id: string): void {
  const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
  if (el) {
    el.select();
    document.execCommand('copy');
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

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function rawBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  return arrayBufferToBase64Url(buffer);
}

// ============================================================
// FUNÇÃO PARA REGISTRAR O SERVICE WORKER
// ============================================================
async function registrarServiceWorker(): Promise<ServiceWorkerRegistration> {
  console.log("📡 Verificando registro do Service Worker...");
  
  if (!navigator.serviceWorker) {
    throw new Error("Service Worker não é suportado neste navegador.");
  }

  // Verifica se já existe um SW ativo
  let registration = await navigator.serviceWorker.getRegistration();
  if (registration && registration.active) {
    console.log("✅ Service Worker já está ativo.");
    return registration;
  }

  // Tenta registrar
  console.log("⏳ Registrando Service Worker...");
  try {
    registration = await navigator.serviceWorker.register("./service-worker.js", { scope: "/" });
    console.log("✅ Service Worker registrado com sucesso.");
    // Aguarda ativação
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout ao esperar ativação do SW")), 5000);
      if (registration.active) {
        clearTimeout(timeout);
        resolve();
      } else {
        registration.addEventListener('activate', () => {
          clearTimeout(timeout);
          resolve();
        });
      }
    });
    console.log("✅ Service Worker ativado.");
    return registration;
  } catch (err) {
    console.error("❌ Erro ao registrar Service Worker:", err);
    throw new Error("Falha ao registrar Service Worker: " + (err as Error).message);
  }
}

// ============================================================
// CRIPTOGRAFIA DA CHAVE VAPID (para o servidor)
// ============================================================
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

// ============================================================
// GERAÇÃO DE CHAVES E2E (RSA para criptografia)
// ============================================================
async function generateE2EEKeys() {
  console.log("🔑 Gerando chaves E2E (RSA-2048)...");
  const encryptionKeyPair = await window.crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([0x01, 0x00, 0x01]), hash: "SHA-256" },
    false,
    ["encrypt", "decrypt"]
  );

  const publicEncryptJwk = await window.crypto.subtle.exportKey("jwk", encryptionKeyPair.publicKey);

  const chavesE2E: ChavesE2EB = {
    privateDecrypt: encryptionKeyPair.privateKey,
    publicEncrypt: publicEncryptJwk,
  };
  await salvarChavesE2EB(chavesE2E);
  await salvarPublicEncryptB(publicEncryptJwk);

  return { publicEncryptJwk };
}

// ============================================================
// GERAÇÃO DE CHAVES VAPID (ECDSA)
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
// FUNÇÃO GERAR MEU BUNDLE – COM REGISTRO EXPLÍCITO DO SW
// ============================================================
async function gerarMeuBundle(): Promise<any> {
  console.log("📦 Iniciando geração do bundle...");
  const nomeB = (document.getElementById('profileNameB') as HTMLInputElement).value;
  const emailB = (document.getElementById('profileEmailB') as HTMLInputElement).value;

  if (!nomeB || !emailB) {
    throw new Error("Preencha Nome e E-mail primeiro.");
  }

  try {
    // 1. Verificar permissão de notificação
    console.log("🔔 Verificando permissão de notificação...");
    if (Notification.permission === "denied") {
      throw new Error("Permissão de notificação negada. Habilite nas configurações do navegador.");
    }
    if (Notification.permission === "default") {
      console.log("📢 Solicitando permissão de notificação...");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Permissão de notificação não concedida.");
      }
      console.log("✅ Permissão concedida.");
    }

    // 2. Registrar/garantir que o Service Worker está ativo
    const registration = await registrarServiceWorker();
    console.log("✅ Service Worker pronto para uso.");

    // 3. Obter chave pública do servidor
    console.log("📡 Buscando chave pública do servidor...");
    const resServerKey = await fetch("/api/server-public-key");
    if (!resServerKey.ok) {
      throw new Error(`Erro ao buscar chave do servidor: ${resServerKey.status}`);
    }
    const serverPublicKeyJwk = await resServerKey.json();
    console.log("✅ Chave pública do servidor obtida.");

    // 4. Chaves VAPID
    console.log("🔑 Obtendo/gerando chaves VAPID...");
    let chavesVapidSalvas = await buscarChavesVapidB();
    let vapidKeyPair: CryptoKeyPair;
    let publicKeyJwk: JsonWebKey;
    let privateKeyJwk: JsonWebKey;

    if (chavesVapidSalvas) {
      console.log("📂 Chaves VAPID encontradas no IndexedDB");
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
      } catch (err) {
        console.warn("⚠️ Erro ao importar chaves VAPID salvas, recriando...", err);
        chavesVapidSalvas = undefined;
      }
    }

    if (!chavesVapidSalvas) {
      console.log("🔑 Gerando novas chaves VAPID...");
      vapidKeyPair = await generateVAPIDKeys();
      publicKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.publicKey);
      privateKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.privateKey);
      await salvarChavesVapidB({ publicKey: publicKeyJwk, privateKey: privateKeyJwk });
      console.log("✅ Novas chaves VAPID salvas.");
    }

    // 5. Subscription
    console.log("📡 Obtendo subscription...");
    let existingSubscription = await registration.pushManager.getSubscription();
    console.log("📡 Subscription obtida:", existingSubscription ? "sim" : "não");

    let subscriptionValida = false;

    if (existingSubscription) {
      const subscriptionData = await buscarSubscriptionB();
      if (subscriptionData && subscriptionData.vapidPublicKey?.n === publicKeyJwk.n) {
        subscriptionValida = true;
        console.log("✅ Subscription existente é válida.");
      } else {
        console.log("⚠️ Subscription existente não corresponde à chave VAPID atual. Removendo...");
        await existingSubscription.unsubscribe();
        await removerSubscriptionB();
        existingSubscription = null;
      }
    }

    if (!existingSubscription || !subscriptionValida) {
      console.log("📝 Criando nova subscription...");
      const rawPublicKey = await window.crypto.subtle.exportKey("raw", vapidKeyPair.publicKey);
      console.log("🔑 Chave pública VAPID exportada (raw).");
      try {
        existingSubscription = await registration.pushManager.subscribe({
          applicationServerKey: new Uint8Array(rawPublicKey),
          userVisibleOnly: true
        });
        console.log("✅ Nova subscription criada com sucesso.");
      } catch (subErr) {
        console.error("❌ Erro ao criar subscription:", subErr);
        throw new Error("Falha ao criar subscription: " + (subErr as Error).message);
      }
    }

    // Extrair chaves da subscription
    const p256dhBuffer = existingSubscription.getKey('p256dh');
    const authBuffer = existingSubscription.getKey('auth');
    if (!p256dhBuffer || !authBuffer) {
      throw new Error("Falha ao obter chaves da subscription (p256dh/auth).");
    }
    const customSubscriptionJson = {
      endpoint: existingSubscription.endpoint,
      keys: {
        p256dh: rawBufferToBase64Url(p256dhBuffer),
        auth: rawBufferToBase64Url(authBuffer)
      }
    };
    console.log("✅ Subscription processada.");

    // 6. Chaves E2E (RSA para criptografia)
    console.log("🔑 Obtendo/gerando chaves E2E...");
    let e2ePublicKeys = await buscarChavesE2EB();
    let publicEncryptJwk: JsonWebKey;

    if (e2ePublicKeys && e2ePublicKeys.publicEncrypt) {
      publicEncryptJwk = e2ePublicKeys.publicEncrypt;
      console.log("📂 Chaves E2E encontradas.");
    } else {
      console.log("🔑 Gerando novas chaves E2E...");
      const novasChaves = await generateE2EEKeys();
      publicEncryptJwk = novasChaves.publicEncryptJwk;
      console.log("✅ Novas chaves E2E geradas.");
    }

    // 7. Salvar subscription no IndexedDB
    const subscriptionData: SubscriptionData = {
      endpoint: existingSubscription.endpoint,
      keys: customSubscriptionJson.keys,
      vapidPublicKey: publicKeyJwk,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await salvarSubscriptionB(subscriptionData);
    console.log("✅ Subscription salva no IndexedDB.");

    // 8. Cifrar chave privada VAPID
    console.log("🔐 Cifrando chave privada VAPID para o servidor...");
    const privateKeyEncrypted = await criptografarChaveVapid(privateKeyJwk, serverPublicKeyJwk);
    console.log("✅ Chave privada VAPID cifrada.");

    // 9. Salvar IDENTIDADE usando a chave privada VAPID
    const identidadeExistente = await buscarIdentidadeA();
    if (!identidadeExistente) {
      console.log("🔑 Salvando identidade com chave VAPID...");
      const privateVapidKey = await window.crypto.subtle.importKey(
        "jwk",
        privateKeyJwk,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"]
      );
      await salvarIdentidadeA({
        name: nomeB,
        email: emailB,
        privateKey: privateVapidKey
      });
      const extendedPublic = { ...publicKeyJwk, ownerName: nomeB, ownerEmail: emailB };
      await salvarPublicKeyA(extendedPublic);
      console.log("✅ Identidade salva.");
    } else {
      console.log("📂 Identidade já existe, pulando.");
    }

    // 10. Montar bundle
    console.log("📦 Montando bundle final...");
    const bundle = {
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
      },
      payloadText: ""
    };

    await salvarBundleAtivo(bundle);
    await salvarBundleHistorico(bundle);
    console.log("✅ Bundle salvo no IndexedDB.");

    return bundle;
  } catch (err) {
    console.error("❌ Erro ao gerar bundle:", err);
    throw err;
  }
}

// ============================================================
// FUNÇÃO ENVIAR MENSAGEM – com tratamento de erro 410
// ============================================================
async function enviarMensagemB(): Promise<void> {
  console.log("🚀 Enviando mensagem...");
  const bundleRaw = (document.getElementById('bundleDestinoB') as HTMLTextAreaElement).value;
  const titulo = (document.getElementById('tituloMensagemB') as HTMLInputElement)?.value || "Nova mensagem";
  const conteudo = (document.getElementById('mensagemEnvioB') as HTMLTextAreaElement).value;

  if (!bundleRaw || !conteudo) {
    showToast("Preencha o bundle e a mensagem.", "error");
    return;
  }

  try {
    const bodyPayload = JSON.parse(bundleRaw);
    const e2eConfig = bodyPayload.e2e;

    if (!e2eConfig || !e2eConfig.browserB_PublicKeyEncrypt) {
      showToast("Bundle inválido: chave de criptografia não encontrada.", "error");
      return;
    }

    const publicKeyJwk = e2eConfig.browserB_PublicKeyEncrypt;
    if (publicKeyJwk.kty !== "RSA") {
      showToast("❌ A chave pública do destinatário não é RSA (kty=" + publicKeyJwk.kty + "). Verifique o bundle.", "error");
      return;
    }

    const cryptoKeyDestino = await window.crypto.subtle.importKey(
      "jwk",
      publicKeyJwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["encrypt"]
    );

    const subscription = await buscarSubscriptionB();
    const chavesVapid = await buscarChavesVapidB();
    const chavesE2E = await buscarChavesE2EB();
    const publicKeyEncrypt = chavesE2E?.publicEncrypt;
    const publicVapid = chavesVapid?.publicKey;
    if (!publicVapid) throw new Error("Chave pública VAPID não encontrada.");

    // Obtém a chave privada VAPID cifrada (com fallback)
    let vapidPrivateCifrada: string | undefined;
    let meuBundle = await buscarBundleAtivo();
    if (meuBundle?.vapid?.privateKey) {
      vapidPrivateCifrada = meuBundle.vapid.privateKey;
    } else {
      console.warn("⚠️ Chave privada VAPID não encontrada no bundle ativo. Buscando no IndexedDB...");
      const chavesVapidSalvas = await buscarChavesVapidB();
      if (chavesVapidSalvas?.privateKey) {
        console.log("🔑 Chave privada VAPID encontrada no IndexedDB. Cifrando novamente...");
        const resServerKey = await fetch("/api/server-public-key");
        const serverPublicKeyJwk = await resServerKey.json();
        vapidPrivateCifrada = await criptografarChaveVapid(chavesVapidSalvas.privateKey, serverPublicKeyJwk);
        // Atualiza bundle ativo
        if (!meuBundle) {
          const nomeB = (document.getElementById('profileNameB') as HTMLInputElement).value;
          const emailB = (document.getElementById('profileEmailB') as HTMLInputElement).value;
          meuBundle = {
            subscription: subscription ? {
              endpoint: subscription.endpoint,
              keys: subscription.keys
            } : undefined,
            vapid: {
              subject: `mailto:${emailB || 'unknown'}`,
              publicKey: publicVapid,
              privateKey: vapidPrivateCifrada
            },
            isVapidEncrypted: true,
            e2e: {
              ownerName: nomeB || 'Usuário',
              ownerEmail: emailB || 'unknown',
              browserB_PublicKeyEncrypt: publicKeyEncrypt
            },
            payloadText: ""
          };
        } else {
          if (!meuBundle.vapid) meuBundle.vapid = {};
          meuBundle.vapid.privateKey = vapidPrivateCifrada;
          meuBundle.vapid.publicKey = publicVapid;
          if (!meuBundle.vapid.subject) {
            const emailB = (document.getElementById('profileEmailB') as HTMLInputElement).value;
            meuBundle.vapid.subject = `mailto:${emailB || 'unknown'}`;
          }
        }
        await salvarBundleAtivo(meuBundle);
        console.log("✅ Bundle ativo atualizado.");
      } else {
        throw new Error("Chave privada VAPID não encontrada. Gere o bundle novamente.");
      }
    }

    const encoder = new TextEncoder();

    // Objeto mensagem otimizado (sem v.u)
    const mensagemObj = {
      m: { t: titulo, c: conteudo },
      e: {
        s: subscription ? {
          e: subscription.endpoint,
          k: subscription.keys
        } : undefined,
        p: publicKeyEncrypt,
        v: {
          k: vapidPrivateCifrada
        }
      }
    };

    const mensagemBytes = encoder.encode(JSON.stringify(mensagemObj));
    const compressed = gzipSync(mensagemBytes);
    console.log(`📦 Comprimido: ${compressed.length} bytes (original ${mensagemBytes.length})`);

    const aesKey = await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt"]
    );
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encryptedBuffer = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      compressed
    );
    const aesKeyRaw = await window.crypto.subtle.exportKey("raw", aesKey);
    const aesKeyEncrypted = await window.crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      cryptoKeyDestino,
      aesKeyRaw
    );

    const envelope = {
      i: arrayBufferToBase64(iv.buffer),
      d: arrayBufferToBase64(encryptedBuffer),
      k: arrayBufferToBase64(aesKeyEncrypted)
    };
    const envelopeJson = JSON.stringify(envelope);
    console.log(`📦 Envelope JSON: ${envelopeJson.length} bytes`);

    // JWT
    const identidade = await buscarIdentidadeA();
    if (!identidade) throw new Error("Identidade não encontrada.");

    const header = { alg: "ES256" };
    const payload = {
      iss: identidade.email,
      sub: e2eConfig.ownerEmail,
      ct: envelopeJson,
      p: publicVapid
    };

    const headerB64 = arrayBufferToBase64Url(encoder.encode(JSON.stringify(header)));
    const payloadB64 = arrayBufferToBase64Url(encoder.encode(JSON.stringify(payload)));
    const toSign = `${headerB64}.${payloadB64}`;

    const signature = await window.crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      identidade.privateKey,
      encoder.encode(toSign)
    );
    const sigB64 = arrayBufferToBase64Url(signature);
    const jwt = `${toSign}.${sigB64}`;

    console.log(`📊 Tamanho do JWT (payloadText): ${jwt.length} bytes`);
    if (jwt.length > 4096) {
      console.warn(`⚠️ JWT excede 4096 bytes em ${jwt.length - 4096} bytes!`);
    } else {
      console.log(`✅ JWT dentro do limite (${4096 - jwt.length} bytes restantes)`);
    }

    // Envia via Service Worker
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const mensagem: MensagemEnvio = {
      id: msgId,
      bundle: bodyPayload,
      payloadText: jwt,
      mensagemOriginal: conteudo,
      destinatario: e2eConfig.ownerEmail,
      status: 'pendente',
      tentativas: 0,
      maxTentativas: 3,
      criadoEm: Date.now(),
      atualizadoEm: Date.now()
    };

    // Adiciona ao IndexedDB e envia para o SW
    await salvarMensagemEnvio(mensagem);
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage({ type: 'ENVIAR_MENSAGEM', payload: mensagem });

    showToast(`✅ Mensagem enviada! ID: ${msgId}`, "success");
    (document.getElementById('mensagemEnvioB') as HTMLTextAreaElement).value = '';
    (document.getElementById('tituloMensagemB') as HTMLInputElement).value = 'Nova mensagem';
    await carregarMensagensEnviadasB();

  } catch (err: any) {
    console.error(err);
    // 🔥 Tratamento especial para erro 410
    if (err.message && err.message.includes('410')) {
      showToast("❌ A subscription do destinatário expirou. Peça para ele gerar um novo bundle.", "error");
    } else {
      showToast(`❌ Erro: ${err.message}`, "error");
    }
  }
}

// ============================================================
// HOMOLOGAÇÃO DE EMISSORES (usando chave pública VAPID)
// ============================================================
async function homologarEmissorDaMensagem(email: string, nome: string, publicKeyJwk: JsonWebKey): Promise<void> {
  try {
    const existente = await buscarEmissorHomologado(email);
    if (existente) {
      showToast(`ℹ️ Emissor "${nome}" já está homologado.`, "info");
      return;
    }

    await window.crypto.subtle.importKey(
      "jwk", publicKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      true, ["verify"]
    );

    const emissor: EmissorHomologado = {
      email: email,
      name: nome,
      jwk: publicKeyJwk
    };
    await salvarEmissorHomologado(email, emissor);

    showToast(`✅ Emissor "${nome}" homologado com sucesso!`, "success");
    await carregarMensagensRecebidas();
    await carregarListaEmissores();
  } catch (err) {
    showToast(`❌ Falha ao homologar: ${(err as Error).message}`, "error");
  }
}

async function homologarEmissorJWT(): Promise<void> {
  const rawJwk = (document.getElementById('senderPublicKeyJson') as HTMLTextAreaElement).value;
  try {
    const jwkObject = JSON.parse(rawJwk);
    if (!jwkObject.ownerEmail || !jwkObject.ownerName) {
      throw new Error("JWK ausente de metadados de Perfil.");
    }

    await window.crypto.subtle.importKey("jwk", jwkObject, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);

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

async function removerEmissorB(email: string): Promise<void> {
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
  const container = document.getElementById('listaEmissoresB');
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
      if (email) await removerEmissorB(email);
    });
  });
}

// ============================================================
// MENSAGENS RECEBIDAS (com lógica de resposta corrigida)
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
    const homologado = msg.homologado || false;
    const homolEmoji = homologado ? '✅' : '🔄';
    const homolTexto = homologado ? 'Homologado' : 'Não homologado';
    const homolClass = homologado ? 'msg-item-homologado' : 'msg-item-nao-homologado';

    const botaoHomologar = (!homologado && msg.publicKey) ?
      `<button class="btn-homologar-msg btn-sm homologar-btn" data-email="${msg.remetenteEmail}" data-nome="${msg.remetente}" data-publickey='${JSON.stringify(msg.publicKey).replace(/'/g, "&#39;")}' style="font-size: 11px; padding: 2px 8px; color: white; border: none; border-radius: 3px; cursor: pointer;">🔄 Homologar</button>` :
      '';

    const botaoResponder = (msg.emissorCompleto && msg.emissorCompleto.subscription && msg.emissorCompleto.publicKeyEncrypt) ?
      `<button class="btn-responder-msg btn-sm" data-msgid="${msg.id}" style="font-size: 11px; padding: 2px 8px; background: #002b3d; color: white; border: none; border-radius: 3px; cursor: pointer;">💬 Responder</button>` :
      '';

    html += `
      <div class="msg-item ${homolClass}" style="border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin-bottom: 8px; background: ${msg.status === 'nao_lida' ? '#fffde7' : '#f9f9f9'};">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
          <strong>${statusEmoji} ${msg.titulo || 'Nova mensagem'} - ${msg.remetente}</strong>
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
      const email = target.dataset.email || '';
      const nome = target.dataset.nome || '';
      const publicKeyStr = target.dataset.publickey || '';
      try {
        const publicKey = JSON.parse(publicKeyStr);
        await homologarEmissorDaMensagem(email, nome, publicKey);
      } catch (err) {
        showToast(`❌ Erro: ${(err as Error).message}`, "error");
      }
    });
  });

  // 🔥 CORREÇÃO DA LÓGICA DE RESPONDER
  container.querySelectorAll('.btn-responder-msg').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const msgId = (e.currentTarget as HTMLButtonElement).dataset.msgid;
      if (!msgId) return;

      try {
        const mensagem = await buscarMensagemRecebida(msgId);
        if (!mensagem) {
          showToast("❌ Mensagem não encontrada.", "error");
          return;
        }

        // Tenta obter o bundle do emissor (prioriza bundleEmissor)
        let bundleEmissor = mensagem.bundleEmissor;
        if (!bundleEmissor && mensagem.emissorCompleto) {
          // Constrói a partir de emissorCompleto (pode não ter a chave privada VAPID)
          const e = mensagem.emissorCompleto;
          if (e.subscription && e.publicKeyEncrypt) {
            // Se não tiver vapid.privateKey, tenta buscar do campo original
            const vapidData = e.vapid || {
              subject: `mailto:${e.email}`,
              publicKey: e.publicKeyVapid || mensagem.publicKey
            };
            bundleEmissor = {
              subscription: e.subscription,
              vapid: vapidData,
              isVapidEncrypted: true,
              nome: e.nome || mensagem.remetente,
              email: e.email || mensagem.remetenteEmail,
              publicKeyEncrypt: e.publicKeyEncrypt,
              publicKeyVapid: e.publicKeyVapid || mensagem.publicKey
            };
          }
        }

        if (!bundleEmissor || !bundleEmissor.subscription || !bundleEmissor.publicKeyEncrypt) {
          showToast("❌ Este emissor não possui dados para responder (sem push configurado).", "error");
          return;
        }

        // Verifica se temos a chave privada VAPID cifrada (necessária para o servidor)
        if (!bundleEmissor.vapid || !bundleEmissor.vapid.privateKey) {
          showToast("❌ Não foi possível obter a chave privada VAPID do emissor para responder.", "error");
          console.error("❌ bundleEmissor.vapid.privateKey ausente:", bundleEmissor);
          return;
        }

        // Construir bundle para resposta
        const bundleData = {
          subscription: bundleEmissor.subscription,
          vapid: bundleEmissor.vapid,
          isVapidEncrypted: true,
          e2e: {
            ownerName: bundleEmissor.nome || mensagem.remetente,
            ownerEmail: bundleEmissor.email || mensagem.remetenteEmail,
            browserB_PublicKeyEncrypt: bundleEmissor.publicKeyEncrypt
          },
          payloadText: ""
        };

        const bundleTextarea = document.getElementById('bundleDestinoB') as HTMLTextAreaElement;
        if (bundleTextarea) {
          bundleTextarea.value = JSON.stringify(bundleData, null, 2);
          showToast(`✅ Bundle de ${mensagem.remetente} carregado para resposta!`, "success");
          document.querySelector('.container-emissor')?.scrollIntoView({ behavior: 'smooth' });
        }
      } catch (err) {
        console.error("Erro ao responder:", err);
        showToast(`❌ Erro ao preparar resposta: ${(err as Error).message}`, "error");
      }
    });
  });
}

async function homologarTodasMensagens(): Promise<void> {
  const mensagens = await listarMensagensRecebidas();
  const naoHomologadas = mensagens.filter(m => !m.homologado && m.publicKey);
  if (naoHomologadas.length === 0) {
    showToast("ℹ️ Nenhuma mensagem com emissor não homologado.", "info");
    return;
  }
  if (!confirm(`Homologar ${naoHomologadas.length} emissores não homologados?`)) return;
  let sucesso = 0;
  for (const msg of naoHomologadas) {
    try {
      await homologarEmissorDaMensagem(msg.remetenteEmail, msg.remetente, msg.publicKey);
      sucesso++;
    } catch (err) {
      console.warn(`⚠️ Falha ao homologar ${msg.remetenteEmail}:`, err);
    }
  }
  showToast(`✅ ${sucesso} emissores homologados com sucesso!`, "success");
  await carregarMensagensRecebidas();
  await carregarListaEmissores();
}

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
// MENSAGENS ENVIADAS
// ============================================================
async function carregarMensagensEnviadasB(): Promise<void> {
  console.log("📤 Carregando mensagens enviadas...");
  const mensagens = await listarMensagensEnvio();
  const container = document.getElementById('mensagensEnviadasB');
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
        await removerMensagemEnvio(id);
        await carregarMensagensEnviadasB();
      }
    });
  });
}

async function limparMensagensEnviadasB(): Promise<void> {
  if (!confirm('Remover todas as mensagens enviadas do histórico?')) return;
  const mensagens = await listarMensagensEnvio();
  const enviadas = mensagens.filter(m => m.status === 'enviada' || m.status === 'falha');
  for (const msg of enviadas) {
    await removerMensagemEnvio(msg.id);
  }
  await carregarMensagensEnviadasB();
  showToast(`✅ ${enviadas.length} mensagens removidas.`, "success");
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
async function carregarDadosIniciaisB(): Promise<void> {
  console.log("📂 Carregando dados iniciais...");
  try {
    const identidade = await buscarIdentidadeA();
    if (identidade) {
      (document.getElementById('profileNameB') as HTMLInputElement).value = identidade.name;
      (document.getElementById('profileEmailB') as HTMLInputElement).value = identidade.email;
      const publicKeyJwk = await buscarPublicKeyA();
      if (publicKeyJwk) {
        (document.getElementById('myPublicKeyB') as HTMLTextAreaElement).value = JSON.stringify(publicKeyJwk);
      }
    }
    const bundleData = await buscarBundleAtivo();
    if (bundleData) {
      (document.getElementById('unifiedBundle') as HTMLTextAreaElement).value = JSON.stringify(bundleData.bundle, null, 2);
    }
    await carregarListaEmissores();
    await carregarMensagensRecebidas();
    await carregarMensagensEnviadasB();
    console.log("✅ Dados iniciais carregados!");
  } catch (err) {
    console.warn("⚠️ Erro ao carregar dados iniciais:", err);
  }
}

// ============================================================
// EVENT LISTENERS
// ============================================================
window.addEventListener("DOMContentLoaded", async () => {
  console.log("📄 DOM carregado, inicializando Browser B...");
  initTabs();
  await carregarDadosIniciaisB();

  // Gerar bundle
  document.getElementById('btnGerarBundle')?.addEventListener('click', async () => {
    console.log("🔄 Botão Gerar Bundle clicado.");
    try {
      const bundle = await gerarMeuBundle();
      console.log("✅ Bundle gerado com sucesso, atualizando UI...");
      (document.getElementById('unifiedBundle') as HTMLTextAreaElement).value = JSON.stringify(bundle, null, 2);
      const pk = await buscarPublicKeyA();
      if (pk) {
        (document.getElementById('myPublicKeyB') as HTMLTextAreaElement).value = JSON.stringify(pk);
      }
      showToast("Bundle gerado com sucesso!", "success");
      await carregarListaEmissores();
    } catch (e) {
      console.error("❌ Erro ao gerar bundle:", e);
      showToast("Erro ao gerar bundle: " + (e as Error).message, "error");
    }
  });

  document.getElementById('btnLimparSubscription')?.addEventListener('click', async () => {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      console.log("Subscription desinscrita.");
    }
    await removerSubscriptionB();
    console.log("Subscription removida do IndexedDB.");
    showToast("✅ Subscription limpa. Gere um novo bundle.", "success");
  } catch (err) {
    console.error(err);
    showToast("❌ Erro ao limpar subscription.", "error");
  }
});

  document.getElementById('btnVerificarBundle')?.addEventListener('click', async () => {
    const bundleRaw = (document.getElementById('bundleDestinoB') as HTMLTextAreaElement).value;
    if (!bundleRaw) {
      showToast("⚠️ Nenhum bundle colado.", "info");
      return;
    }
    try {
      const parsed = JSON.parse(bundleRaw);
      console.log("🔍 Bundle válido:", Object.keys(parsed));
      showToast("✅ Bundle válido! Verifique o console.", "success");
    } catch {
      showToast("❌ Bundle inválido.", "error");
    }
  });

  // Homologação
  document.getElementById('btnSaveSenderIdentity')?.addEventListener('click', homologarEmissorJWT);

  // Envio
  document.getElementById('btnEnviarB')?.addEventListener('click', enviarMensagemB);

  // Mensagens recebidas
  document.getElementById('btnCarregarMensagens')?.addEventListener('click', carregarMensagensRecebidas);
  document.getElementById('btnLimparLidas')?.addEventListener('click', removerMensagensLidas);
  document.getElementById('btnHomologarTodas')?.addEventListener('click', homologarTodasMensagens);

  // Mensagens enviadas
  document.getElementById('btnCarregarEnviadasB')?.addEventListener('click', carregarMensagensEnviadasB);
  document.getElementById('btnLimparEnviadasB')?.addEventListener('click', limparMensagensEnviadasB);

  // Copy buttons
  document.querySelectorAll('.copy-btn').forEach((button) => {
    button.addEventListener('click', (event) => {
      const targetId = (event.currentTarget as HTMLButtonElement).getAttribute('data-target');
      if (targetId) copyToClipboard(targetId);
    });
  });

  // Service Worker messages
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'PUSH_RECEIVED') {
      console.log('📬 Push recebido, recarregando mensagens...');
      const nome = event.data.payload?.title || 'Remetente';
      showToast(`📩 Nova mensagem de ${nome}!`, "info");
      setTimeout(carregarMensagensRecebidas, 1000);
    }
    if (event.data?.type === 'MENSAGEM_ENVIADA') {
      console.log('📤 Mensagem enviada, atualizando lista...');
      setTimeout(carregarMensagensEnviadasB, 500);
    }
    if (event.data?.type === 'EMISSOR_HOMOLOGADO') {
      console.log('✅ Emissor homologado via notificação, atualizando listas...');
      setTimeout(() => {
        carregarListaEmissores();
        carregarMensagensRecebidas();
      }, 500);
    }
  });
});