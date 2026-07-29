// src/browser-b.tsx

function copyToClipboard(id: string): void {
  const input = document.getElementById(id) as HTMLInputElement;
  if (input) {
    input.select();
    document.execCommand('copy');
    alert(`Carga unificada copiada com sucesso!`);
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

async function subscribeToPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    alert("Service Workers não são suportados.");
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("./service-worker.js");
    await navigator.serviceWorker.ready;

    const vapidKeyPair = await generateVAPIDKeys();
    const rawPublicKey = await window.crypto.subtle.exportKey("raw", vapidKeyPair.publicKey);
    
    const publicKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.publicKey);
    const privateKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.privateKey);

    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
      await existingSubscription.unsubscribe();
    }

    const subscription = await registration.pushManager.subscribe({
      applicationServerKey: new Uint8Array(rawPublicKey),
      userVisibleOnly: true
    });

    const p256dhBuffer = subscription.getKey('p256dh');
    const authBuffer = subscription.getKey('auth');

    // Monta o bloco de assinatura
    const customSubscriptionJson = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: rawBufferToBase64Url(p256dhBuffer),
        auth: rawBufferToBase64Url(authBuffer)
      }
    };

    // Monta o bloco de credenciais de identificação
    const vapidJson = {
      subject: `mailto:john@example.com`,
      publicKey: publicKeyJwk,
      privateKey: privateKeyJwk
    };

    // 🔥 A MÁGICA: Prepara o payload completo, deixando um placeholder para a mensagem
    const finalPayloadBundle = {
      subscription: customSubscriptionJson,
      vapid: vapidJson,
      payloadText: "" // O browser-a vai preencher isso dinamicamente antes do POST
    };

    const textarea = document.getElementById('unifiedBundle') as HTMLTextAreaElement;
    if (textarea) {
      textarea.value = JSON.stringify(finalPayloadBundle);
    }

    console.log("🚀 Payload unificado gerado prontinho para o Browser A!");

  } catch (err) {
    console.error(err);
    alert("Falha ao se inscrever.");
  }
}

subscribeToPush();

document.getElementById("btnCopy")?.addEventListener("click", () => {
  copyToClipboard("unifiedBundle");
});

// Este trecho fica dentro do browser-a.tsx ou browser-b.tsx
navigator.serviceWorker.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PUSH_RECEIVED') {
    console.log("Recebi dados do Service Worker na página aberta!", event.data.payload);
    // Aqui você pode atualizar uma lista de mensagens na tela dinamicamente
  }
});


let deferredPrompt: any = null;
const btnInstall = document.getElementById('btnInstall');

// 1. Escuta o sinal do navegador dizendo que o app está pronto para ser instalado
window.addEventListener('beforeinstallprompt', (e) => {
  // Previne que o navegador mostre o banner padrão feio dele
  e.preventDefault();
  // Guarda o evento na memória para disparar no clique do nosso botão
  deferredPrompt = e;
  
  // Mostra o nosso botão customizado na tela
  if (btnInstall) {
    btnInstall.style.display = 'block';
  }
  console.log("ℹ️ O PWA atende aos critérios e está pronto para instalação!");
});

// 2. Controla o clique no botão de instalação
btnInstall?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  
  // Mostra a caixinha nativa de confirmação ("Deseja instalar o app?")
  deferredPrompt.prompt();
  
  // Espera a resposta do usuário
  const { outcome } = await deferredPrompt.userChoice;
  console.log(`👤 Usuário respondeu à instalação com: ${outcome}`);
  
  // Limpa o prompt da memória, ele só pode ser usado uma vez
  deferredPrompt = null;
  
  // Oculta o botão novamente
  btnInstall.style.display = 'none';
});

// 3. Opcional: detecta se o app foi instalado com sucesso
window.addEventListener('appinstalled', () => {
  console.log('🎉 Aplicativo instalado com sucesso no sistema operacional!');
  deferredPrompt = null;
});
