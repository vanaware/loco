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
