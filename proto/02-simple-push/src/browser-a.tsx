// src/browser-a.tsx
import { get, set, createStore } from "idb-keyval";
import {
  storeIdentidadeA,
  storeFilaDisparosA,
  storeBundlesA,
  storeMensagensEnvioA,
  salvarIdentidadeA,
  buscarIdentidadeA,
  salvarPublicKeyA,
  buscarPublicKeyA,
  salvarBundleAtivo,
  buscarBundleAtivo,
  salvarBundleHistorico,
  buscarHistoricoBundles,
  salvarMensagemEnvio,
  listarMensagensEnvio,
} from "./utils/db-helpers.ts";
import type { IdentidadeA, BundleData, MensagemEnvio } from "./constants/db.ts";

console.log("🟢 [SW-LOG-A] Arquivo browser-a.tsx carregado com bancos isolados por idb-keyval!");

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(buffer));
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// 🔥 Carrega identidade salva ao iniciar a página
async function carregarIdentidadeSalva(): Promise<void> {
  console.log("📂 [SW-LOG-A] Carregando identidade salva...");
  
  try {
    const identidade = await buscarIdentidadeA();
    const publicKeyJwk = await buscarPublicKeyA();
    
    if (identidade) {
      const nameInput = document.getElementById('profileNameA') as HTMLInputElement;
      const emailInput = document.getElementById('profileEmailA') as HTMLInputElement;
      
      if (nameInput) nameInput.value = identidade.name;
      if (emailInput) emailInput.value = identidade.email;
      
      console.log("📂 [SW-LOG-A] Identidade carregada do IndexedDB");
      console.log(`   👤 Nome: ${identidade.name}`);
      console.log(`   📧 Email: ${identidade.email}`);
      console.log(`   🔑 PrivateKey: ${identidade.privateKey ? '✅ Presente' : '❌ Ausente'}`);
    }
    
    if (publicKeyJwk) {
      const textarea = document.getElementById('myPublicKeySign') as HTMLTextAreaElement;
      if (textarea) {
        textarea.value = JSON.stringify(publicKeyJwk);
        console.log("✅ [SW-LOG-A] Chave pública carregada do IndexedDB");
      }
    }
  } catch (err) {
    console.warn("⚠️ [SW-LOG-A] Erro ao carregar identidade salva:", err);
  }
}

// 🔥 Carrega o último bundle salvo
async function carregarBundleSalvo(): Promise<void> {
  console.log("📂 [SW-LOG-A] Carregando bundle salvo...");
  
  try {
    const bundleData = await buscarBundleAtivo();
    
    if (bundleData) {
      const textarea = document.getElementById('unifiedBundle') as HTMLTextAreaElement;
      if (textarea) {
        textarea.value = JSON.stringify(bundleData.bundle, null, 2);
        console.log(`✅ [SW-LOG-A] Bundle carregado do IndexedDB (${bundleData.nomeReceptor})`);
      }
    }
  } catch (err) {
    console.warn("⚠️ [SW-LOG-A] Erro ao carregar bundle salvo:", err);
  }
}

// 🔥 Salva o bundle no IndexedDB
async function salvarBundleNoIndexedDB(bundle: any): Promise<void> {
  try {
    await salvarBundleAtivo(bundle);
    await salvarBundleHistorico(bundle);
    console.log("✅ [SW-LOG-A] Bundle salvo no IndexedDB");
  } catch (err) {
    console.warn("⚠️ [SW-LOG-A] Erro ao salvar bundle:", err);
  }
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

    const identidade: IdentidadeA = {
      name: nameA,
      email: emailA,
      privateKey: keyPairA.privateKey
    };
    await salvarIdentidadeA(identidade);

    const publicSignJwk = await window.crypto.subtle.exportKey("jwk", keyPairA.publicKey);
    const extendedJwk = { ...publicSignJwk, ownerName: nameA, ownerEmail: emailA };
    await salvarPublicKeyA(extendedJwk);

    const textarea = document.getElementById('myPublicKeySign') as HTMLTextAreaElement;
    if (textarea) {
      textarea.value = JSON.stringify(extendedJwk);
    }
    
    console.log("✅ [SW-LOG-A] Identidade permanente gerada e salva com idb-keyval!");
    alert("Identidade permanente gerada com sucesso! Copie a chave e homologue-a no Browser B.");
  } catch (err) {
    console.error(err);
    alert("Falha ao gerar identidade: " + (err as Error).message);
  }
}

// 🔥 FUNÇÃO PRINCIPAL: Monta o JWT e ENVIA PARA O SERVICE WORKER
async function sendMessage(): Promise<void> {
  console.log("🚀 [SW-LOG-A] Iniciando empacotamento JWT...");
  
  const bundleRaw = (document.getElementById('unifiedBundle') as HTMLTextAreaElement).value;
  const messageText = (document.getElementById('message') as HTMLTextAreaElement).value;

  if (!bundleRaw || !messageText) {
    alert("Por favor, cole a carga unificada do Browser B e digite uma mensagem.");
    return;
  }

  try {
    const bodyPayload = JSON.parse(bundleRaw);
    
    // 🔥 SALVA O BUNDLE NO INDEXEDDB
    await salvarBundleNoIndexedDB(bodyPayload);
    
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
      throw new Error("Identidade do Browser A não localizada! Clique no botão de gerar chave primeiro.");
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

    // 🔥 CRIA A MENSAGEM PARA ENVIAR AO SERVICE WORKER
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

    // 🔥 SALVA NO INDEXEDDB
    await salvarMensagemEnvio(mensagem);
    console.log(`✅ [SW-LOG-A] Mensagem salva no IndexedDB: ${mensagemId}`);

    // 🔥 ENVIA PARA O SERVICE WORKER
    const registration = await navigator.serviceWorker.ready;
    
    registration.active?.postMessage({
      type: 'ENVIAR_MENSAGEM',
      payload: mensagem
    });

    alert(`✅ Mensagem enviada para o Service Worker!\nID: ${mensagemId}\nStatus: Pendente`);

  } catch (err) {
    alert(`Erro no pipeline: ${(err as Error).message}`);
  }
}

// 🔥 Função para listar mensagens pendentes (debug)
async function listarMensagensPendentes(): Promise<void> {
  const mensagens = await listarMensagensEnvio();
  const pendentes = mensagens.filter(m => m.status === 'pendente' || m.status === 'enviando');
  
  if (pendentes.length === 0) {
    alert("Nenhuma mensagem pendente.");
    return;
  }
  
  const lista = pendentes.map((m, i) => 
    `${i + 1}. ${m.id} - ${m.destinatario} - ${m.status} (${new Date(m.criadoEm).toLocaleString()})`
  ).join('\n');
  
  alert(`📋 Mensagens pendentes:\n${lista}`);
}

window.addEventListener("DOMContentLoaded", async () => {
  // 🔥 CARREGA DADOS SALVOS AO INICIAR
  await carregarIdentidadeSalva();
  await carregarBundleSalvo();
  
  const btnIdentity = document.getElementById("btnGenerateIdentity");
  const btnSend = document.getElementById("btnSend");

  if (btnIdentity) btnIdentity.addEventListener("click", gerarIdentidadeA);
  if (btnSend) {
    btnSend.addEventListener("click", (e) => {
      e.stopPropagation();
      sendMessage();
    });
  }

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

  // 🔥 Botão para listar mensagens pendentes (debug)
  const btnListar = document.createElement('button');
  btnListar.textContent = '📋 Listar Mensagens Pendentes';
  btnListar.style.cssText = 'background-color: #555; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; margin-top: 8px;';
  btnListar.addEventListener('click', listarMensagensPendentes);
  
  const container = document.querySelector('.container:last-child');
  if (container) {
    container.appendChild(btnListar);
  }
});