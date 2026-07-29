// src/browser-a.tsx

// 1. Inicializa o banco IndexedDB exclusivo do Emissor (Browser A)
function abrirBancoDBA(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("BrowserA_IdentityDB", 1);
    request.onupgradeneeded = () => {
      // Tabela para salvar a identidade de assinatura e o perfil textual do Emissor
      request.result.createObjectStore("identidade", { keyPath: "id" });
      // Tabela de transição para enfileirar disparos travados em modo offline
      request.result.createObjectStore("fila_disparos", { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Função utilitária para converter um ArrayBuffer em string Base64URL segura para o padrão JWT
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(buffer));
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// GERA E PERSISTE A IDENTIDADE DIGITAL PERMANENTE DO BROWSER A
async function gerarIdentidadeA(): Promise<void> {
  const nameA = (document.getElementById('profileNameA') as HTMLInputElement).value;
  const emailA = (document.getElementById('profileEmailA') as HTMLInputElement).value;

  if (!nameA || !emailA) {
    alert("Por favor, preencha seu Nome e E-mail de remetente primeiro.");
    return;
  }

  try {
    // Gera a chave assimétrica no algoritmo oficial RSA-PSS para assinaturas complexas
    const keyPairA = await window.crypto.subtle.generateKey(
      {
        name: "RSA-PSS",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256"
      },
      false, // Chave privada inexportável da máquina do usuário
      ["sign", "verify"]
    );

    const db = await abrirBancoDBA();
    const tx = db.transaction("identidade", "readwrite");
    
    // Armazena a chave privada e metadados associados no banco do cliente
    await tx.objectStore("identidade").put({
      id: "minha_chave_privada_assinatura",
      name: nameA,
      email: emailA,
      privateKey: keyPairA.privateKey
    });

    const publicSignJwk = await window.crypto.subtle.exportKey("jwk", keyPairA.publicKey);
    
    // Injeta metadados estendidos dentro da especificação JWK JSON para facilitar a cópia
    const extendedJwk = {
      ...publicSignJwk,
      ownerName: nameA,
      ownerEmail: emailA
    };

    const textarea = document.getElementById('myPublicKeySign') as HTMLTextAreaElement;
    if (textarea) {
      textarea.value = JSON.stringify(extendedJwk);
    }
    alert("Identidade permanente gerada com sucesso! Copie a chave e homologue-a no Browser B.");
  } catch (err) {
    console.error(err);
    alert("Falha ao gerar identidade: " + (err as Error).message);
  }
}

// FUNÇÃO PRINCIPAL: Monta o JWT criptografado ponta a ponta e despacha (Online ou Background Sync)
async function sendMessage(): Promise<void> {
  const bundleRaw = (document.getElementById('unifiedBundle') as HTMLTextAreaElement).value;
  const messageText = (document.getElementById('message') as HTMLTextAreaElement).value;

  if (!bundleRaw || !messageText) {
    alert("Por favor, cole a carga unificada do Browser B e digite uma mensagem.");
    return;
  }

  try {
    const bodyPayload = JSON.parse(bundleRaw);
    const e2eConfig = bodyPayload.e2e;

    // A. CRIPTOGRAFIA DO TEXTO DA MENSAGEM (RSA-OAEP ponta a ponta para o Browser B)
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
    
    // Transforma os bytes criptografados em Hexadecimal para trafegar com segurança
    const messageHex = Array.from(new Uint8Array(encryptedBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    // B. RECUPERAÇÃO DA IDENTIDADE DE ASSINATURA DO BROWSER A
    const db = await abrirBancoDBA();
    const txIdent = db.transaction("identidade", "readonly");
    const identityRecord = await new Promise<any>((res) => {
      txIdent.objectStore("identidade").get("minha_chave_privada_assinatura").onsuccess = (e: any) => res(e.target.result);
    });

    if (!identityRecord) {
      throw new Error("Identidade do Browser A não localizada! Clique no botão 'Gerar Minha Chave de Identidade' primeiro.");
    }

    // C. MONTAGEM E ASSINATURA DO TOKEN JWT (RFC 7519 / JWS)
    const jwtHeader = { alg: "PS256", typ: "JWT" };
    const jwtPayload = {
      iss: identityRecord.email,          // Quem emitiu o token (Email do A)
      sub: e2eConfig.ownerEmail,          // Destinatário alvo (Email do B)
      name: identityRecord.name,          // Nome legível do remetente
      iat: Math.floor(Date.now() / 1000), // Carimbo de data/hora da emissão
      cipherText: messageHex              // Carga útil criptografada e ilegível para intermediários
    };

    const base64UrlHeader = arrayBufferToBase64Url(encoder.encode(JSON.stringify(jwtHeader)));
    const base64UrlPayload = arrayBufferToBase64Url(encoder.encode(JSON.stringify(jwtPayload)));
    const tokenStringWithoutSignature = `${base64UrlHeader}.${base64UrlPayload}`;

    // Executa a assinatura RSA-PSS em cima das duas primeiras partes do JWT
    const signatureBuffer = await window.crypto.subtle.sign(
      { name: "RSA-PSS", saltLength: 32 },
      identityRecord.privateKey,
      encoder.encode(tokenStringWithoutSignature)
    );
    const base64UrlSignature = arrayBufferToBase64Url(signatureBuffer);

    // Consolida o token JWT definitivo separado por pontos
    const finalJwtToken = `${tokenStringWithoutSignature}.${base64UrlSignature}`;

    // Aloca o token JWT gerado na propriedade esperada pelo Deno e Service Worker
    bodyPayload.payloadText = finalJwtToken;

    // D. GERENCIAMENTO DINÂMICO DE REDE (ONLINE VS BACKGROUND SYNC OFFLINE)
    if (navigator.onLine) {
      console.log("🌐 Dispositivo online. Enviando requisição HTTP POST direta...");
      const response = await fetch("/api/proxy-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload)
      });

      if (response.ok) {
        alert("Token JWT enviado com sucesso direta e instantaneamente!");
        return;
      }
    }

    // E. SE FALHAR A CONEXÃO: SALVA NO INDEXEDDB E ACIONA BACKGROUND SYNC API
    console.log("🔌 Falha de rede ou dispositivo offline. Enfileirando dados para sincronização em background...");
    
    const txSync = db.transaction("fila_disparos", "readwrite");
    await txSync.objectStore("fila_disparos").add(bodyPayload);

    const registration = await navigator.serviceWorker.ready;
    
    if ('sync' in registration) {
      // Registra a tag que o Service Worker está escutando no evento 'sync'
      await (registration as any).sync.register('sync-push-notifications');
      alert("Aviso: Você está sem conexão! O token JWT assinado foi armazenado no banco local e será transmitido automaticamente assim que a rede retornar.");
    } else {
      alert("Alerta: O token foi guardado, mas este navegador não possui suporte nativo à Background Sync API.");
    }

  } catch (err) {
    console.error(err);
    alert(`Erro no pipeline de transmissão: ${(err as Error).message}`);
  }
}

// Vincula as chamadas criptográficas diretamente aos botões da interface HTML
document.getElementById("btnGenerateIdentity")?.addEventListener("click", gerarIdentidadeA);
document.getElementById("btnSend")?.addEventListener("click", sendMessage);

// Escutador utilitário para os botões de cópia baseados em classe (.copy-btn)
document.querySelectorAll(".copy-btn").forEach((button) => {
  button.addEventListener("click", (event) => {
    const targetId = (event.currentTarget as HTMLButtonElement).getAttribute("data-target");
    if (targetId) {
      const input = document.getElementById(targetId) as HTMLInputElement;
      if (input) {
        input.select();
        document.execCommand('copy');
        alert("Texto copiado para a área de transferência!");
      }
    }
  });
});
