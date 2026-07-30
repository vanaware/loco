// src/browser-a.tsx
console.log("🟢 [SW-LOG-A] Arquivo browser-a.tsx carregado com sucesso!");

// Inicializa o banco IndexedDB exclusivo do Emissor (Browser A)
function abrirBancoDBA(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("BrowserA_IdentityDB", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("identidade", { keyPath: "id" });
      request.result.createObjectStore("fila_disparos", { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(buffer));
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// GERA E PERSISTE A IDENTIDADE DIGITAL PERMANENTE DO BROWSER A
async function gerarIdentidadeA(): Promise<void> {
  console.log("🚀 [SW-LOG-A] Iniciando geração de identidade do Emissor...");
  const nameA = (document.getElementById('profileNameA') as HTMLInputElement).value;
  const emailA = (document.getElementById('profileEmailA') as HTMLInputElement).value;

  if (!nameA || !emailA) {
    alert("Por favor, preencha seu Nome e E-mail de remetente primeiro.");
    return;
  }

  try {
    const keyPairA = await window.crypto.subtle.generateKey(
      {
        name: "RSA-PSS",
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: "SHA-256"
      },
      false,
      ["sign", "verify"]
    );

    const db = await abrirBancoDBA();
    const tx = db.transaction("identidade", "readwrite");
    await tx.objectStore("identidade").put({
      id: "minha_chave_privada_assinatura",
      name: nameA,
      email: emailA,
      privateKey: keyPairA.privateKey
    });

    const publicSignJwk = await window.crypto.subtle.exportKey("jwk", keyPairA.publicKey);
    
    const extendedJwk = {
      ...publicSignJwk,
      ownerName: nameA,
      ownerEmail: emailA
    };

    const textarea = document.getElementById('myPublicKeySign') as HTMLTextAreaElement;
    if (textarea) {
      textarea.value = JSON.stringify(extendedJwk);
    }
    console.log("✅ [SW-LOG-A] Identidade permanente gerada!");
    alert("Identidade permanente gerada com sucesso! Copie a chave e homologue-a no Browser B.");
  } catch (err) {
    console.error(err);
    alert("Falha ao gerar identidade: " + (err as Error).message);
  }
}

// FUNÇÃO PRINCIPAL: Monta o JWT criptografado e despacha
async function sendMessage(): Promise<void> {
  console.log("🚀 [SW-LOG-A] Botão Enviar detectou o clique! Iniciando empacotamento JWT...");
  
  const bundleRaw = (document.getElementById('unifiedBundle') as HTMLTextAreaElement).value;
  const messageText = (document.getElementById('message') as HTMLTextAreaElement).value;

  if (!bundleRaw || !messageText) {
    alert("Por favor, cole a carga unificada do Browser B e digite uma mensagem.");
    return;
  }

  try {
    const bodyPayload = JSON.parse(bundleRaw);
    const e2eConfig = bodyPayload.e2e;

    console.log("🚀 [SW-LOG-A] Importando chave pública RSA-OAEP do Browser B...");
    const cryptoKeyB = await window.crypto.subtle.importKey(
      "jwk", e2eConfig.browserB_PublicKeyEncrypt,
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["encrypt"]
    );

    const encoder = new TextEncoder();
    const encryptedBuffer = await window.crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      cryptoKeyB,
      encoder.encode(messageText)
    );
    
    const messageHex = Array.from(new Uint8Array(encryptedBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    console.log("🚀 [SW-LOG-A] Buscando chave de assinatura no IndexedDB local...");
    const db = await abrirBancoDBA();
    const txIdent = db.transaction("identidade", "readonly");
    const identityRecord = await new Promise<any>((res) => {
      txIdent.objectStore("identidade").get("minha_chave_privada_assinatura").onsuccess = (e: any) => res(e.target.result);
    });

    if (!identityRecord) {
      throw new Error("Identidade do Browser A não localizada! Clique em 'Gerar Minha Chave de Identidade' primeiro.");
    }

    console.log("🚀 [SW-LOG-A] Construindo estrutura federada do JWT...");
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

    console.log("🚀 [SW-LOG-A] Executando assinatura criptográfica RSA-PSS no JWT...");
    const signatureBuffer = await window.crypto.subtle.sign(
      { name: "RSA-PSS", saltLength: 32 },
      identityRecord.privateKey,
      encoder.encode(tokenStringWithoutSignature)
    );
    const base64UrlSignature = arrayBufferToBase64Url(signatureBuffer);

    const finalJwtToken = `${tokenStringWithoutSignature}.${base64UrlSignature}`;
    bodyPayload.payloadText = finalJwtToken;

    if (navigator.onLine) {
      console.log("🌐 [SW-LOG-A] Dispositivo online. Despachando via POST relativo...");
      const response = await fetch("/api/proxy-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload)
      });

      if (response.ok) {
        console.log("✅ [SW-LOG-A] Mensagem recebida com sucesso pelo servidor Deno!");
        alert("Token JWT enviado com sucesso!");
        return;
      }
      throw new Error(`Servidor rejeitou com HTTP ${response.status}`);
    }

    console.log("🔌 [SW-LOG-A] Offline detectado. Armazenando no IndexedDB para Background Sync...");
    const txSync = db.transaction("fila_disparos", "readwrite");
    await txSync.objectStore("fila_disparos").add(bodyPayload);

    const registration = await navigator.serviceWorker.ready;
    if ('sync' in registration) {
      await (registration as any).sync.register('sync-push-notifications');
      alert("Aviso: Você está offline. O token foi enfileirado e será enviado sozinho!");
    } else {
      alert("Token salvo, mas seu navegador não suporta Background Sync.");
    }

  } catch (err) {
    console.error("❌ [SW-LOG-A] Erro no pipeline de envio:", err);
    alert(`Erro no pipeline de transmissão: ${(err as Error).message}`);
  }
}

// 🔥 VINCULAÇÃO RIGOROSA DE EVENTOS APÓS O CARREGAMENTO DO DOM
window.addEventListener("DOMContentLoaded", () => {
  console.log("🟢 [SW-LOG-A] DOM totalmente pronto no Browser A. Fazendo o bind de escutadores...");

  const btnIdentity = document.getElementById("btnGenerateIdentity");
  const btnSend = document.getElementById("btnSend");

  if (btnIdentity) {
    btnIdentity.addEventListener("click", gerarIdentidadeA);
    console.log("🟢 [SW-LOG-A] Evento acoplado ao botão de Identidade.");
  }

  if (btnSend) {
    // Força a remoção de interceptores antigos limpando o gatilho de cliques
    btnSend.addEventListener("click", (e) => {
      e.stopPropagation(); // Impede que o seletor de cópia roube o evento
      sendMessage();
    });
    console.log("🟢 [SW-LOG-A] Evento acoplado com sucesso ao botão de Envio '#btnSend'!");
  } else {
    console.error("❌ [SW-LOG-A] ERRO CRÍTICO: Botão '#btnSend' não foi encontrado na árvore HTML!");
  }

  // Seletor restrito apenas aos elementos que servem para copiar
  document.querySelectorAll(".copy-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      const targetId = (event.currentTarget as HTMLButtonElement).getAttribute("data-target");
      if (targetId && targetId !== "unifiedBundle" && targetId !== "message") {
        const input = document.getElementById(targetId) as HTMLInputElement;
        if (input) {
          input.select();
          document.execCommand('copy');
          alert("Texto copiado para a área de transferência!");
        }
      }
    });
  });
});
