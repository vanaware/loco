Instruções para ajustar o prototipo 01 para que a funcionalidade dele tenha o desejado para o projeto principal

---

# Arquitetura Web Push Descentralizada (Client-Side VAPID + CORS Proxy)

## 1. Visão Geral da Arquitetura
O objetivo é implementar um sistema de Web Push Notifications para um site estático sem armazenar uma chave VAPID global ou centralizada no servidor. 

Cada cliente gera seu próprio par de chaves VAPID (Pública/Privada) no navegador. O servidor atua estritamente como um servidor de arquivos estáticos e um **Proxy CORS cego**, sem conhecimento das chaves privadas ou do conteúdo das mensagens.

[Cliente Remetente]│▼ (Gera JWT com a Chave Privada do Destinatário)[Requisição de Push] ──> [/proxy/ URL do Push Service] (Servidor Deno)│▼ (Repassa sem restrição de CORS)[Push Service da BigTech] (Google/Apple/Mozilla)│▼ (Entrega a Notificação)[Cliente Destinatário]



---

## 2. Fluxo de Dados e Troca de Chaves
Para que o **Cliente A** envie uma notificação para o **Cliente B**, os dados devem ser trafegados por um canal externo (QR Code, WebRTC, P2P, etc.) seguindo a estrutura abaixo:

1. **Cliente B (Destinatário):**
   - Gera um par de chaves VAPID locais via Web Crypto API.
   - Usa a sua *Chave Pública VAPID* para se inscrever no `pushManager`.
   - Obtém o objeto `Subscription` (contendo o endpoint da Google/Apple/Mozilla e as chaves de criptografia `p256dh` e `auth`).
2. **Exportação/Divulgação:**
   - O **Cliente B** exporta e envia para o **Cliente A** três informações críticas:
     1. O JSON completo da `Subscription`.
     2. A sua **Chave Pública VAPID** (em formato JWK ou String Base64).
     3. A sua **Chave Privada VAPID** (em formato JWK ou String Base64).
3. **Cliente A (Remetente):**
   - Importa os dados do Cliente B.
   - Criptografa o payload da mensagem usando as chaves `p256dh` e `auth` da Subscription do Cliente B.
   - Cria e assina o token JWT usando a **Chave Privada VAPID** do Cliente B.
   - Dispara o envio através do caminho relativo `/proxy/` do servidor Deno.

---

## 3. Implementação: Geração de Chaves no Cliente (Browser)
O código abaixo usa exclusivamente a **Web Crypto API** nativa do navegador para criar as chaves VAPID compatíveis com a curva `P-256` exigida pelo protocolo de Web Push.

```javascript
// Função para gerar o par de chaves VAPID locais
async function gerarChavesVapidLocais() {
  const parDeChaves = await window.crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    true, // Permite exportar as chaves
    ["sign", "verify"]
  );

  // Exporta no formato JWK (JSON Web Key) para fácil transporte/armazenamento
  const chavePublicaJwk = await window.crypto.subtle.exportKey("jwk", parDeChaves.publicKey);
  const chavePrivadaJwk = await window.crypto.subtle.exportKey("jwk", parDeChaves.privateKey);

  return {
    publicJwk: chavePublicaJwk,
    privateJwk: chavePrivadaJwk
  };
}
```

---

## 4. Implementação: Criação do Token JWT VAPID (Browser)
Ao enviar a mensagem, o remetente precisa gerar um token JWT assinado pela chave privada VAPID do destinatário para provar a autenticidade ao servidor de push.

```javascript
// Utilitário para codificar em Base64URL de forma segura
function tokenBase64Url(stringOuBuffer) {
  const base64 = typeof stringOuBuffer === "string" 
    ? btoa(unescape(encodeURIComponent(stringOuBuffer)))
    : btoa(String.fromCharCode.apply(null, new Uint8Array(stringOuBuffer)));
  return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function criarTokenJwtVapid(privateJwk, endpointPushService) {
  const urlObj = new URL(endpointPushService);
  const origemPushService = `${urlObj.protocol}//${urlObj.host}`;

  // Importa a chave privada JWK recebida do destinatário
  const chavePrivada = await window.crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const cabecalho = { alg: "ES256", typ: "JWT" };
  const payload = {
    aud: origemPushService,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, // 12 horas de validade
    sub: "mailto:descentralizado@exemplo.com" // String obrigatória exigida pelo protocolo
  };

  const cabecalhoCodificado = tokenBase64Url(JSON.stringify(cabecalho));
  const payloadCodificado = tokenBase64Url(JSON.stringify(payload));
  const dadosParaAssinar = new TextEncoder().encode(`${cabecalhoCodificado}.${payloadCodificado}`);

  // Assina o JWT usando o algoritmo ECDSA P-256
  const assinaturaBuffer = await window.crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    chavePrivada,
    dadosParaAssinar
  );

  const assinaturaCodificada = tokenBase64Url(assinaturaBuffer);
  return `${cabecalhoCodificado}.${payloadCodificado}.${assinaturaCodificada}`;
}
```

---

## 5. Implementação: Disparando o Envio via Proxy CORS (Browser)
Como os navegadores bloqueiam requisições diretas do front-end para os endpoints de push (devido às políticas de CORS restritas das Big Techs), a requisição é envelopada através do endpoint local `/proxy/`.

```javascript
async function enviarNotificacaoP2P(subscriptionDestinatario, privateJwkDestinatario, publicJwkDestinatario, payloadTexto) {
  const endpointOriginal = subscriptionDestinatario.endpoint;
  
  // 1. Gera o Token JWT assinado localmente com a chave do destinatário
  const jwtToken = await criarTokenJwtVapid(privateJwkDestinatario, endpointOriginal);
  
  // 2. Extrai a chave pública do formato JWK para String Base64Url (Exigência do cabeçalho Crypto-Key)
  const chavePublicaString = tokenBase64Url(
    await window.crypto.subtle.exportKey(
      "raw", 
      await window.crypto.subtle.importKey("jwk", publicJwkDestinatario, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"])
    )
  );

  // Nota: O payloadTexto precisa ser criptografado seguindo a especificação ECE (Encrypted Content Encoding - RFC 8188)
  // Para simplificar o fluxo P2P sem dependências robustas, use bibliotecas client-side compatíveis se enviar payload.
  const payloadCriptografado = new TextEncoder().encode(payloadTexto); 

  // 3. Rota relativa do Proxy configurado no Deno
  const urlDoProxy = `/proxy/${endpointOriginal}`;

  const resposta = await fetch(urlDoProxy, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "TTL": "60", // Tempo de vida da notificação em segundos
      "Authorization": `WebPush ${jwtToken}`,
      "Crypto-Key": `p256ecdsa=${chavePublicaString}`
    },
    body: payloadCriptografado
  });

  if (resposta.ok) {
    console.log("Notificação enviada com sucesso via túnel Proxy!");
  } else {
    console.error("Erro ao enviar push:", await resposta.text());
  }
}
```

---

## 6. O Servidor Proxy (Deno Puro)
O código abaixo gerencia as páginas estáticas e funciona como o túnel cego que remove a restrição de CORS das requisições de saída.

```typescript
import { serveDir } from "https://deno.land";

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Configuração padrão de CORS para comunicação local
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Crypto-Key, TTL",
  };

  // Trata requisições OPTIONS prévias do navegador
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Captura e gerencia a rota do Proxy
  if (url.pathname.startsWith("/proxy/")) {
    const targetUrl = url.pathname.replace("/proxy/", "") + url.search;

    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      return new Response("URL inválida", { status: 400, headers: corsHeaders });
    }

    try {
      const headers = new Headers(req.headers);
      headers.delete("host"); // Previne falhas de validação de host no destino

      // O Deno faz a requisição direta livre de bloqueios de CORS do navegador
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: headers,
        body: req.body,
      });

      // Replica os cabeçalhos de resposta injetando permissões CORS do site estático
      const proxyResponseHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        proxyResponseHeaders.set(key, value);
      });

      return new Response(response.body, {
        status: response.status,
        headers: proxyResponseHeaders,
      });

    } catch (error) {
      return new Response(`Erro no Proxy: ${error.message}`, { status: 500, headers: corsHeaders });
    }
  }

  // Rota Padrão: Serve a pasta de arquivos estáticos front-end
  return serveDir(req, {
    fsRoot: "public",
    showDirListing: false,
    quiet: true,
  });
});
```

------------------------------

Perfeito. Com a inscrição manual, o destinatário irá copiar um bloco de texto gerado pelo seu navegador (contendo a Subscription + o par de chaves VAPID) e colará no dispositivo do remetente.
Abaixo está o código JavaScript completo e unificado para o cliente. Ele cobre três etapas fundamentais:

   1. Geração das chaves VAPID e Registro do Push (Destinatário).
   2. Criptografia do Payload (RFC 8188 / AES-128-GCM) exigida pelo protocolo Web Push (Remetente).
   3. Assinatura JWT e Envio via Proxy Deno (Remetente).

Este script utiliza apenas a Web Crypto API nativa do navegador, eliminando a necessidade de bibliotecas externas.
## Script do Cliente (main.js)

// ==========================================// 1. UTILITÁRIOS DE CONVERSÃO E BASE64URL// ==========================================function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function base64UrlToBuffer(base64Url) {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
// ==========================================// 2. CONFIGURAÇÃO E GERAÇÃO (DESTINATÁRIO)// ==========================================async function gerarPacoteInscricaoManual() {
  // 1. Registra o Service Worker obrigatoriamente
  const registro = await navigator.serviceWorker.register("sw.js");
  await navigator.serviceWorker.ready;

  // 2. Gera o par de chaves VAPID locais no navegador
  const parDeChavesVapid = await window.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );

  const publicJwk = await window.crypto.subtle.exportKey("jwk", parDeChavesVapid.publicKey);
  const privateJwk = await window.crypto.subtle.exportKey("jwk", parDeChavesVapid.privateKey);

  // 3. Converte a chave pública para Uint8Array para registrar no PushManager
  const rawPublic = await window.crypto.subtle.exportKey("raw", parDeChavesVapid.publicKey);
  
  // 4. Inscreve o navegador no Push Service da BigTech usando a própria chave pública
  const subscription = await registro.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: new Uint8Array(rawPublic)
  });

  // 5. Monta o bloco de texto para cópia manual
  const pacoteCompleto = {
    subscription: subscription.toJSON(),
    vapidPublicKeyJwk: publicJwk,
    vapidPrivateKeyJwk: privateJwk
  };

  const stringParaCopiar = btoa(JSON.stringify(pacoteCompleto));
  console.log("Copie este código e envie ao remetente:", stringParaCopiar);
  return stringParaCopiar;
}
// ==========================================// 3. CRIPTOGRAFIA DO PAYLOAD (RFC 8188)// ==========================================async function criptografarPayloadWebPush(textoMensagem, keysDestinatario) {
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(textoMensagem);

  // Importa as chaves de criptografia da Subscription do Destinatário
  const p256dhBuffer = base64UrlToBuffer(keysDestinatario.p256dh);
  const authBuffer = base64UrlToBuffer(keysDestinatario.auth);

  const receiverPublic = await window.crypto.subtle.importKey(
    "raw", p256dhBuffer, { name: "ECDH", namedCurve: "P-256" }, false, []
  );

  // Gera par de chaves efêmeras para o segredo de Diffie-Hellman
  const localEphemeral = await window.crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]
  );
  const localEphemeralPublicRaw = await window.crypto.subtle.exportKey("raw", localEphemeral.publicKey);

  // Computa o segredo compartilhado (IKM)
  const sharedSecret = await window.crypto.subtle.deriveBits(
    { name: "ECDH", public: receiverPublic }, localEphemeral.privateKey, 256
  );

  // Derivação de chaves simplificada baseada na RFC 8188 (AES-128-GCM)
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  
  const infoKey = encoder.encode("WebPush: info\0");
  const ikmKey = await window.crypto.subtle.importKey("raw", authBuffer, { name: "HKDF" }, false, ["deriveKey"]);
  const prkKey = await window.crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: sharedSecret, info: infoKey },
    ikmKey, { name: "AES-GCM", length: 128 }, false, ["encrypt"]
  );

  // Criação do vetor de inicialização (IV) de 12 bytes
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  // Criptografa usando AES-GCM
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    prkKey,
    plaintext
  );

  // Montagem do bloco final concatenando os metadados necessários para o Service Worker descriptografar
  const resultadoFinal = new Uint8Array(salt.length + 4 + localEphemeralPublicRaw.byteLength + ciphertext.byteLength);
  resultadoFinal.set(salt, 0);
  // Tamanho do registro padrão da RFC 8188 (4096 bytes codificado em 4 bytes em dedução Big-Endian)
  resultadoFinal.set([0, 0, 16, 0], salt.length); 
  resultadoFinal.set(new Uint8Array(localEphemeralPublicRaw), salt.length + 4);
  resultadoFinal.set(new Uint8Array(ciphertext), salt.length + 4 + localEphemeralPublicRaw.byteLength);

  return resultadoFinal;
}
// ==========================================// 4. ASSINATURA JWT VAPID E DISPARO (REMETENTE)// ==========================================async function criarTokenJwtVapid(privateJwk, endpoint) {
  const urlObj = new URL(endpoint);
  const origemPushService = `${urlObj.protocol}//${urlObj.host}`;

  const chavePrivada = await window.crypto.subtle.importKey(
    "jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]
  );

  const cabecalho = { alg: "ES256", typ: "JWT" };
  const payload = {
    aud: origemPushService,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: "mailto:p2p-manual@exemplo.com"
  };

  const cabecalhoCodificado = bufferToBase64Url(new TextEncoder().encode(JSON.stringify(cabecalho)));
  const payloadCodificado = bufferToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const dadosParaAssinar = new TextEncoder().encode(`${cabecalhoCodificado}.${payloadCodificado}`);

  const assinaturaBuffer = await window.crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    chavePrivada,
    dadosParaAssinar
  );

  return `${cabecalhoCodificado}.${payloadCodificado}.${bufferToBase64Url(assinaturaBuffer)}`;
}
async function enviarMensagemManual(stringPacoteDestinatario, textoMensagem) {
  // Desembrulha a string colada manualmente pelo remetente
  const dadosDestinatario = JSON.parse(atob(stringPacoteDestinatario));
  const { subscription, vapidPrivateKeyJwk, vapidPublicKeyJwk } = dadosDestinatario;

  // 1. Assina o token JWT usando a chave privada recebida
  const jwtToken = await criarTokenJwtVapid(vapidPrivateKeyJwk, subscription.endpoint);

  // 2. Extrai e converte a chave pública para String do cabeçalho Crypto-Key
  const rawPublic = await window.crypto.subtle.exportKey(
    "raw", 
    await window.crypto.subtle.importKey("jwk", vapidPublicKeyJwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"])
  );
  const chavePublicaString = bufferToBase64Url(rawPublic);

  // 3. Criptografa o corpo do texto de forma estrita de ponta a ponta
  const payloadCriptografado = await criptografarPayloadWebPush(textoMensagem, subscription.keys);

  // 4. Encaminha via Rota de Proxy local do Deno
  const urlDoProxy = `/proxy/${subscription.endpoint}`;

  const resposta = await fetch(urlDoProxy, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm", // Define a codificação RFC 8188 para o Push Service
      "TTL": "86400",
      "Authorization": `WebPush ${jwtToken}`,
      "Crypto-Key": `p256ecdsa=${chavePublicaString}`
    },
    body: payloadCriptografado
  });

  if (resposta.ok) {
    console.log("Mensagem enviada com sucesso!");
  } else {
    console.error("Erro ao enviar:", await resposta.text());
  }
}

## Código Obrigatório do Service Worker (sw.js)
Coloque este arquivo na mesma pasta raiz dos arquivos estáticos para receber e ler o payload.

self.addEventListener("push", function (event) {
  let titulo = "Nova Mensagem P2P";
  let opções = { body: "Conteúdo criptografado ou ilegível." };

  if (event.data) {
    // O próprio navegador cuida da descriptografia automática usando as chaves
    // internas associadas à Subscription e joga o texto limpo aqui.
    opções.body = event.data.text();
  }

  event.waitUntil(self.registration.showNotification(titulo, opções));
});

Se desejar, o que você gostaria de ajustar em seguida? Podemos estruturar a interface visual simples para copiar e colar essas chaves, ou refinar as permissões no servidor Deno.

------------------------------

como temos testes a fazer durante o desenvolvimento teremos um deno que simula o recebimento e envio dos payloads aos clientes mas seria um fallback caso o web push esteja indisponível. somente aproveitar que estamos de fato num servidor deno.

a sequência seria:
veja se o push web está disponível, se estiver tente mandar sem o proxy do deno, se não der certo envie pelo proxy.
web push indisponível use o deno como fallback com mensagem por ele

neste caso o fallback é dentro do  proprio deno. no proxy ele percebe que o processo de web push não foi entregue por algum motivo ou foi negado. então ele valida se o payload esta devidamente assinado e formatado segundo as regras do pwa push, caso esteja bem formatado supõe que o problema são nos servidores externos então ele fará uma outra forma de entregar a mensagem para quando o cliente destinatário ficar online (desenvolvimento futuro)

------------------------------
ATenção:

se o fallback envolver pooling no servidor, precisamos garantir que somente quem tem a chave privada vapid é que pode acessar o endereço de pooling e receber as mensagens pendentes. 
sem esta garantia qualquer um poderia puxar as mensagens pendentes.

como para enviar mensagens o remetente sabe tambem qual é o private vapid pois ele assina a mensagem no push web tradicional, precisamos garantir tambem que somente o destinatário real é que consegue puxar as mensagens pending em um fallback de pooling.  então além da chave privada, vamos precisar de um ID secreto ou outra chave privada que sirva de identificação do cliente pwa realmente , estou imaginando que precisamos ter duas chaves privadas
Uma que identifica o destinatário de push web , pois esta logica reversa que criamos
outra chave privada que identifique o pwa que criou a chave privada acima (que deixará de ser secreta pois será divulgada para os contatos enviar mensagem)


# Como o Web Push funciona no Loco

## O que é Web Push

Web Push é um protocolo que permite que um **servidor de aplicação** envie
mensagens para um **navegador**, mesmo quando o site não está aberto. No Loco,
usamos Web Push como camada de fallback quando a comunicação P2P
(WebRTC/DataChannel) não está disponível.

## Por que ele é importante

O Loco é um PWA sem servidor central. Quando você envia uma mensagem:

1. Primeiro, o app tenta enviar diretamente via **P2P/WebRTC** (canal direto).
2. Se o contato não está online no momento, o app usa **Web Push** para acordar
   o navegador do destinatário.

Isso significa que:

- O destinatário pode estar com o navegador fechado ou em segundo plano.
- O sistema operacional recebe o push e acorda o Service Worker do app.
- O Service Worker processa a notificação e, quando possível, entrega a
  mensagem.

## Como o navegador "dorme" e acorda

Um PWA instalado continua com o **Service Worker** registrado no sistema
operacional, mesmo que:

- A aba do navegador esteja fechada.
- O dispositivo esteja ocioso.
- O app não esteja ativo na tela.

Quando um push chega, o SO executa o Service Worker em background. Esse processo
é chamado de **wake-up**: o navegador "acorda" o app para processar a mensagem.

## Fluxo de envio no Loco

```
Usuário A -> Digita mensagem
     |
     v
Tentativa P2P (DataChannel/WebRTC)
     |
     |-- sucesso --> mensagem entregue diretamente
     |
     falha
     |
     v
Envio via Web Push
     |
     v
Serviço de Push do destinatário (ex: FCM, Mozilla, etc.)
     |
     v
Navegador do destinatário acorda o Service Worker
     |
     v
Notificação exibida + mensagem processada
```

## VAPID: identidade do remetente

Para enviar um push, o remetente precisa de chaves **VAPID**:

- **Chave pública**: compartilhada com o contato para validar quem enviou.
- **Chave privada**: usada para assinar a requisição de push.

No Loco, as chaves VAPID são geradas automaticamente na primeira execução e
armazenadas no IndexedDB.

## Limitações importantes

- **Não é garantido**: o destinatário pode ter negado notificações ou o serviço
  de push pode estar indisponível.
- **Criptografia do payload**: o protocolo Web Push exige criptografia do
  conteúdo com as chaves do subscriber. A implementação atual do Loco envia JSON
  simplificado; em produção, um **relay server** é recomendado para fazer a
  criptografia correta.
- **Navegadores**: cada navegador usa seu próprio servidor push (Chrome=FCM,
  Firefox=Autopush, Safari=APNs via Safari Push).

## O futuro: relay server

Para suportar Web Push robusto sem servidor central, o Loco pode usar um **relay
server opcional** que apenas encaminha pushes assinados, sem armazenar
mensagens. Isso resolve:

- Criptografia de payload (RFC 8291).
- Rate limits e retries.
- Compatibilidade entre diferentes browsers.

## Resumo

Web Push é o mecanismo que permite o Loco alcançar contatos offline. Combinado
com P2P quando ambos estão online, o app consegue entregar mensagens em
praticamente qualquer situação em que o dispositivo tenha internet e
notificações habilitadas.
