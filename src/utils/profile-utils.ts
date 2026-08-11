// src/utils/profile-utils.ts
import { salvarProfile, buscarProfile } from './db-helpers.ts';
import { cifrarChaveVapid } from './push-utils.ts';
import { registrarServiceWorker } from "../sw/sw-utils.ts";
import { generateE2EEKeys, generateVAPIDKeys, rawBufferToBase64Url } from './crypto-utils.ts';
import type { ProfileConfig } from '../constants/db.ts';
import { addDebugLog } from './debug-utils.ts';
import { ProxyPath } from '../constants/config.ts';

export async function getServerPublicKey() {
  const response = await fetch(`${ProxyPath}/publickey`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!response.ok) throw new Error(`Erro ao buscar chave do servidor: ${response.status}`);
  return await response.json();
}

export async function solicitarArmazenamentoPersistente(): Promise<boolean> {
  if ('storage' in navigator && 'persist' in navigator.storage) {
    try {
      const concedido = await navigator.storage.persist();
      if (concedido) {
        addDebugLog("✅ Armazenamento Persistente concedido pelo navegador.");
      } else {
        addDebugLog("ℹ️ Navegador manteve o Armazenamento Padrão.");
      }
      return concedido;
    } catch (err: any) {
      addDebugLog("⚠️ Erro ao solicitar armazenamento persistente: " + err.message);
      return false;
    }
  }
  return false;
}

export async function gerarProfileCompleto(nome: string, email: string): Promise<ProfileConfig> {
  addDebugLog("📦 Gerando/Atualizando perfil unificado...");

  if (!nome || !email) {
    throw new Error("Preencha Nome e E-mail primeiro.");
  }

  try {
    addDebugLog("Step 1: Verificando permissão de notificação...");
    try {
      if (Notification.permission === "denied") {
        addDebugLog("⚠️ Permissão de notificação negada. Continuando offline...");
      } else if (Notification.permission === "default") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          addDebugLog("⚠️ Permissão de notificação não concedida.");
        }
      }
    } catch (notifErr: any) {
      addDebugLog("⚠️ Erro ao verificar notificações: " + notifErr?.message);
    }

    addDebugLog("Step 2: Registrando Service Worker...");
    const registration = await registrarServiceWorker();

    addDebugLog("Step 3: Buscando chave pública do servidor...");
    const serverPublicKeyJwk = await getServerPublicKey();
    addDebugLog("Step 3.5: Chave do servidor recebida");

    let vapidKeyPair: CryptoKeyPair | undefined = undefined;
    let publicKeyJwk: JsonWebKey | undefined = undefined;
    let privateKeyJwk: JsonWebKey | undefined = undefined;

    let existingProfile = await buscarProfile();
    if (existingProfile && existingProfile.vapidPublicKey && existingProfile.vapidPrivateKeyJwk) {
      addDebugLog("📂 Chaves VAPID encontradas no perfil.");
      publicKeyJwk = existingProfile.vapidPublicKey;
      privateKeyJwk = existingProfile.vapidPrivateKeyJwk;
      try {
        vapidKeyPair = {
          publicKey: await window.crypto.subtle.importKey("jwk" as any, publicKeyJwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]),
          privateKey: await window.crypto.subtle.importKey("jwk" as any, privateKeyJwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"])
        } as CryptoKeyPair;
      } catch {
        addDebugLog("⚠️ Erro ao importar chaves VAPID existentes. Gerando novas...");
        existingProfile = undefined;
      }
    }
    if (!existingProfile || !vapidKeyPair || !publicKeyJwk || !privateKeyJwk) {
      addDebugLog("🔑 Gerando novas chaves VAPID...");
      vapidKeyPair = await generateVAPIDKeys();
      publicKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.publicKey);
      privateKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.privateKey);
    }

    addDebugLog("Step 4: Obtendo subscription...");
    if (!registration) throw new Error("Service Worker registration é null/undefined");
    if (!registration.pushManager) throw new Error("Web Push API (pushManager) não disponível.");
    
    let existingSubscription = await registration.pushManager.getSubscription();
    let subscriptionValida = false;

    if (existingSubscription) {
      const profileSub = existingProfile?.subscription;
      if (profileSub && profileSub.endpoint === existingSubscription.endpoint) {
        subscriptionValida = true;
      } else {
        await existingSubscription.unsubscribe();
        if (existingProfile) {
           delete (existingProfile as any).subscription;
           await salvarProfile(existingProfile);
        }
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

    let e2ePublicKey: JsonWebKey;
    let e2ePrivateKeyJwk: JsonWebKey;

    if (existingProfile && existingProfile.e2ePublicKey && existingProfile.e2ePrivateKeyJwk) {
      addDebugLog("📂 Chaves E2E encontradas no perfil.");
      e2ePublicKey = existingProfile.e2ePublicKey;
      e2ePrivateKeyJwk = existingProfile.e2ePrivateKeyJwk;
      try {
        await window.crypto.subtle.importKey("jwk" as any, e2ePrivateKeyJwk, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["decrypt"]);
      } catch {
        addDebugLog("⚠️ Erro ao importar chave E2E existente. Gerando novas...");
        const newKeys = await generateE2EEKeys();
        e2ePublicKey = newKeys.publicEncrypt;
        e2ePrivateKeyJwk = newKeys.privateDecryptJwk;
      }
    } else {
      addDebugLog("🔑 Gerando novas chaves E2E...");
      const newKeys = await generateE2EEKeys();
      e2ePublicKey = newKeys.publicEncrypt;
      e2ePrivateKeyJwk = newKeys.privateDecryptJwk;
    }

    const privateKeyEncrypted = await cifrarChaveVapid(privateKeyJwk, serverPublicKeyJwk);

    const profile: ProfileConfig = {
      name: nome, email: email, vapidPublicKey: publicKeyJwk, vapidPrivateKeyJwk: privateKeyJwk,
      vapidPrivateKeyEnvelope: privateKeyEncrypted, e2ePublicKey: e2ePublicKey, e2ePrivateKeyJwk: e2ePrivateKeyJwk,
      subscription: subscription, createdAt: existingProfile?.createdAt || Date.now(), updatedAt: Date.now()
    };

    await salvarProfile(profile);
    await solicitarArmazenamentoPersistente();

    addDebugLog("✅ Perfil salvo com sucesso.");
    return profile;
  } catch (err) {
    addDebugLog("❌ Erro ao gerar perfil: " + (err instanceof Error ? err.message : String(err)));
    throw err;
  }
}