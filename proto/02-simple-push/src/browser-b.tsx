// src/browser-b.tsx

// Função auxiliar para abrir o banco IndexedDB local de forma assíncrona
function abrirBancoDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("BrowserB_SecurityDB", 1);
    
    request.onupgradeneeded = () => {
      const db = request.result;
      // Tabela para guardar as chaves privadas inexportáveis do próprio Browser B
      db.createObjectStore("chaves_privadas_e2e");
      // Tabela indexada por e-mail para cadastrar a lista branca de emissores (Browser A)
      db.createObjectStore("lista_branca_emissores", { keyPath: "email" });
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Função utilitária para copiar texto para a área de transferência
function copyToClipboard(id: string): void {
  const input = document.getElementById(id) as HTMLInputElement;
  if (input) {
    input.select();
    document.execCommand('copy');
    alert("Conteúdo copiado com sucesso!");
  }
}

// Gera as chaves VAPID nativas do navegador para transporte de rede
async function generateVAPIDKeys(): Promise<CryptoKeyPair> {
  return await window.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
}

// Converte buffers brutos para formato Base64Url padrão JWT/WebPush
function rawBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// CRIPTOGRAFIA DE PONTA A PONTA (E2EE): Gera as chaves de aplicação adicionais
async function generateE2EEKeys() {
  // 1. Gera par assimétrico para CRIPTOGRAFIA de conteúdo (RSA-OAEP)
  const encryptionKeyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    false, // Chaves privadas NUNCA saem do IndexedDB do cliente por segurança
    ["encrypt", "decrypt"]
  );

  // 2. Gera par assimétrico para VERIFICAÇÃO DE ASSINATURA do remetente (RSA-PSS)
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

  // 3. Salva com segurança as chaves privadas locais trancadas no cofre do IndexedDB
  const db = await abrirBancoDB();
  const tx = db.transaction("chaves_privadas_e2e", "readwrite");
  await tx.objectStore("chaves_privadas_e2e").put(encryptionKeyPair.privateKey, "minha_decript_key");
  await tx.objectStore("chaves_privadas_e2e").put(signatureKeyPair.privateKey, "minha_assinatura_key");

  // 4. Exporta apenas as chaves PÚBLICAS em formato JWK JSON para disponibilizar ao Browser A
  const publicEncryptJwk = await window.crypto.subtle.exportKey("jwk", encryptionKeyPair.publicKey);
  const publicSignJwk = await window.crypto.subtle.exportKey("jwk", signatureKeyPair.publicKey);

  return { publicEncryptJwk, publicSignJwk };
}

// FUNÇÃO PRINCIPAL: Monta o ecossistema com o perfil e sela a chave VAPID para o Deno
async function processarInscricaoComPerfil(): Promise<void> {
  const nomeB = (document.getElementById('profileNameB') as HTMLInputElement).value;
  const emailB = (document.getElementById('profileEmailB') as HTMLInputElement).value;

  if (!nomeB || !emailB) {
    alert("Por favor, preencha o Nome e o E-mail do perfil receptor.");
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("./service-worker.js");
    await navigator.serviceWorker.ready;

    // 1. Inicializa a geração das chaves VAPID nativas na máquina
    const vapidKeyPair = await generateVAPIDKeys();
    const rawPublicKey = await window.crypto.subtle.exportKey("raw", vapidKeyPair.publicKey);
    
    const publicKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.publicKey);
    const privateKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.privateKey);

    // 2. Limpa qualquer assinatura anterior no navegador para evitar conflito de chaves
    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
      await existingSubscription.unsubscribe();
    }

    // 3. Executa o subscribe amarrando a chave pública em formato Uint8Array
    const subscription = await registration.pushManager.subscribe({
      applicationServerKey: new Uint8Array(rawPublicKey),
      userVisibleOnly: true
    });

    const p256dhBuffer = subscription.getKey('p256dh');
    const authBuffer = subscription.getKey('auth');
    
    const customSubscriptionJson = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: rawBufferToBase64Url(p256dhBuffer),
        auth: rawBufferToBase64Url(authBuffer)
      }
    };

    // 4. Inicializa e recolhe as chaves públicas E2EE locais
    const e2ePublicKeys = await generateE2EEKeys();

    // 5. 🔥 SEGURANÇA MÁXIMA: Busca a Chave Pública RSA de infraestrutura do Servidor Deno
    console.log("🔒 Solicitando chave de infraestrutura ao Servidor Deno...");
    const resServerKey = await fetch("/api/server-public-key");
    if (!resServerKey.ok) {
      throw new Error("Não foi possível carregar a chave pública do servidor backend.");
    }
    const serverPublicKeyJwk = await resServerKey.json();

    const cryptoServerKey = await window.crypto.subtle.importKey(
      "jwk", serverPublicKeyJwk,
      { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]
    );

    // 6. 🔥 CRIPTOGRAFIA ASSIMÉTRICA: Sela a chave privada VAPID para que só a RAM do Deno consiga ler
    console.log("🔒 Criptografando a Chave Privada VAPID...");
    const encoder = new TextEncoder();
    const privateKeyVapidBytes = encoder.encode(JSON.stringify(privateKeyJwk));
    
    const encryptedVapidBuffer = await window.crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      cryptoServerKey,
      privateKeyVapidBytes
    );
    
    // Converte o buffer binário resultante em formato Hexadecimal textual limpo para trafegar
    const privateKeyVapidHex = Array.from(new Uint8Array(encryptedVapidBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    // 7. Agrupa o Payload unificado final montado em formato JWT-Ready
    const finalPayloadBundle = {
      subscription: customSubscriptionJson,
      vapid: {
        subject: `mailto:${emailB}`, // Email dinâmico mapeado no cabeçalho
        publicKey: publicKeyJwk,
        privateKey: privateKeyVapidHex // Chave trancada e mascarada em código HEX
      },
      isVapidEncrypted: true, // Tag que avisa ao main.ts para executar a decodificação na RAM
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
    console.log("🚀 Carga unificada em formato federado gerada e mascarada com sucesso!");

  } catch (err) {
    console.error(err);
    alert("Falha ao processar assinatura e chaves: " + (err as Error).message);
  }
}

// HOMOLOGAÇÃO DE IDENTIDADE: Cadastra chaves públicas do Browser A na lista branca local
async function homologarEmissorJWT(): Promise<void> {
  const rawJwk = (document.getElementById('senderPublicKeyJson') as HTMLTextAreaElement).value;
  if (!rawJwk) {
    alert("Cole o JSON do emissor antes de homologar.");
    return;
  }

  try {
    const jwkObject = JSON.parse(rawJwk);
    
    // Critério de validação do perfil estendido do JWT do Browser A
    if (!jwkObject.ownerEmail || !jwkObject.ownerName) {
      throw new Error("O JWK de identidade precisa carregar os metadados de Perfil do Emissor (Nome/E-mail).");
    }

    // Valida o mapeamento importando a chave no algoritmo RSA-PSS estável
    await window.crypto.subtle.importKey(
      "jwk", jwkObject,
      { name: "RSA-PSS", hash: "SHA-256" }, true, ["verify"]
    );

    const db = await abrirBancoDB();
    const tx = db.transaction("lista_branca_emissores", "readwrite");
    // Salva o registro indexado pelo e-mail dinâmico do remetente
    await tx.objectStore("lista_branca_emissores").put({
      email: jwkObject.ownerEmail,
      name: jwkObject.ownerName,
      jwk: jwkObject // A estrutura pura da chave de assinatura
    });
    
    alert(`🛡️ Emissor "${jwkObject.ownerName} <${jwkObject.ownerEmail}>" homologado com sucesso!`);
  } catch (err) {
    alert("Falha na validação do JWK: " + (err as Error).message);
  }
}

// Vincula as funções de clique diretamente aos elementos do HTML correspondentes
document.getElementById("btnRegisterPush")?.addEventListener("click", processarInscricaoComPerfil);
document.getElementById("btnSaveSenderIdentity")?.addEventListener("click", homologarEmissorJWT);

// Escutador dinâmico dos botões de cópia baseados em classe e atributos customizados data-target
document.querySelectorAll(".copy-btn").forEach((button) => {
  button.addEventListener("click", (event) => {
    const targetId = (event.currentTarget as HTMLButtonElement).getAttribute("data-target");
    if (targetId) {
      copyToClipboard(targetId);
    }
  });
});
