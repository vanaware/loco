> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém múltiplos arquivos do meu projeto estruturados em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Analise a estrutura de pastas, as dependências e o código fornecido para indicar as mudanças necessárias para a implementação das novas funcionalidades discutidas.
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo e não somente as partes que devem ser modificadas.

---

# Código Fonte Selecionado do Projeto

Gerado automaticamente em: 8/1/2026, 10:01:35 AM

---

## Arquivo: `main.ts`

```ts
/// <reference lib="deno.ns" />
import { serveDir } from "@std/http/file-server";
import * as webpush from "@negrel/webpush";

const PORT = 8000;

// 🔥 Lê diretamente do Deno.env (carregado via --env)
function carregarChavesDoServidor() {
  const publicKeyStr = Deno.env.get('SERVER_PUBLIC_KEY');
  const privateKeyStr = Deno.env.get('SERVER_PRIVATE_KEY');
  
  if (!publicKeyStr || !privateKeyStr) {
    console.error("❌ Chaves do servidor não encontradas!");
    console.error("   Execute 'deno task build' primeiro para gerar as chaves.");
    console.error("   Ou defina as variáveis de ambiente SERVER_PUBLIC_KEY e SERVER_PRIVATE_KEY");
    Deno.exit(1);
  }
  
  try {
    const publicKeyJwk = JSON.parse(publicKeyStr);
    const privateKeyJwk = JSON.parse(privateKeyStr);
    return { publicKeyJwk, privateKeyJwk };
  } catch (err) {
    console.error("❌ Erro ao parsear as chaves do servidor:", err);
    Deno.exit(1);
  }
}

// Chaves globais de infraestrutura do Servidor
let serverPrivateKey: CryptoKey;
let serverPublicKeyJwk: JsonWebKey;

async function inicializarChavesDoServidor() {
  const chaves = carregarChavesDoServidor();
  serverPublicKeyJwk = chaves.publicKeyJwk;
  
  serverPrivateKey = await crypto.subtle.importKey(
    "jwk",
    chaves.privateKeyJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"]
  );
  
  console.log("🔒 Chaves RSA de Infraestrutura do Servidor carregadas do Deno.env!");
}

// Inicializa as chaves antes de o Deno abrir a escuta HTTP
await inicializarChavesDoServidor();

// Função auxiliar para descriptografar dados Hex usando a chave RSA exclusiva do servidor
async function decryptWithServerKey(base64Envelope: string): Promise<any> {
  try {
    // 1. Desempacota o envelope Base64 enviado pelo navegador
    const envelopeText = atob(base64Envelope);
    const { iv, dadosCifrados, chaveAesCifrada } = JSON.parse(envelopeText);

    // Helper para converter strings Hex textuais de volta para arrays de bytes inteiros
    const fromHex = (hex: string) => new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));

    const ivBytes = fromHex(iv);
    const dadosBytes = fromHex(dadosCifrados);
    const chaveAesCifradaBytes = fromHex(chaveAesCifrada);

    // 2. Descriptografa a chave AES usando a chave privada RSA-OAEP exclusiva da RAM do servidor
    const aesChaveCruaBuffer = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      serverPrivateKey,
      chaveAesCifradaBytes
    );

    // 3. Importa a chave simétrica AES recuperada de volta para o runtime do Deno
    const chaveSimetricaAes = await crypto.subtle.importKey(
      "raw",
      aesChaveCruaBuffer,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    // 4. Descriptografa o conteúdo longo da chave privada VAPID original usando a chave AES aberta
    const vapidOriginalBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes },
      chaveSimetricaAes,
      dadosBytes
    );

    const jsonText = new TextDecoder().decode(vapidOriginalBuffer);
    return JSON.parse(jsonText);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[SERVER] ❌ Erro ao descriptografar envelope VAPID:", errorMessage);
    throw new Error(`Falha crítica na quebra do envelope de criptografia híbrida VAPID: ${errorMessage}`);
  }
}

// Transforma as strings textuais de chave pública/privada VAPID em JSON estruturado
function parseVapidKeysToJwk(publicKey: any, privateKey: any) {
  try {
    return {
      publicKey: typeof publicKey === "string" ? JSON.parse(publicKey) : publicKey,
      privateKey: typeof privateKey === "string" ? JSON.parse(privateKey) : privateKey
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    throw new Error(`As chaves enviadas não estão no formato JSON/JWK válido: ${errorMessage}`);
  }
}

// Auditoria Cega: Lê as Claims do JWT sem precisar de chaves e sem descriptografar a mensagem
function lerMetadadosJJWT(jwtString: string) {
  try {
    const parts = jwtString.split(".");
    if (parts.length !== 3) return null;

    let base64Url = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (base64Url.length % 4) base64Url += "=";

    const jsonString = new TextDecoder().decode(
      new Uint8Array([...atob(base64Url)].map(c => c.charCodeAt(0)))
    );
    
    return JSON.parse(jsonString);
  } catch {
    return null;
  }
}

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);
  
  // 1. Captura o Origin enviado pelo navegador
  let origin = req.headers.get("origin") || "";

  // CORREÇÃO CRUCIAL: Se o Origin vier vazio (comum em fetches relativos do mesmo domínio),
  // nós reconstrói ele dinamicamente usando o protocolo (http/https) e o Host atual do servidor
  if (origin === "") {
    const host = req.headers.get("host") || `localhost:${PORT}`;
    // Verifica se o seu servidor roda em ambiente seguro (HTTPS) na nuvem ou HTTP local
    const protocolo = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    origin = `${protocolo}://${host}`;
  }

  // 2. VALIDAÇÃO DE CORS ATUALIZADA
  // Permite localhost (qualquer porta) ou qualquer subdomínio de .vanaware.com
  const isAllowedOrigin = 
    /^https?:\/\/localhost(:\d+)?$/.test(origin) || 
    /^https?:\/\/([a-zA-Z0-9-]+\.)*vanaware\.com$/.test(origin);

  // 3. Define os cabeçalhos de resposta baseados na validação acima
  const corsHeaders = {
    "Access-Control-Allow-Origin": isAllowedOrigin ? origin : "https://vanaware.com",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Crypto-Key, TTL, Urgency, X-Push-Payload",
    "Access-Control-Allow-Credentials": "true"
  };

  // Trata requisições de preflight imediatamente
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Trava de segurança de API: Se a origem final gerada NÃO for permitida, bloqueia com 403
  if (!isAllowedOrigin && url.pathname.startsWith("/api/")) {
    console.warn(`🛑 [CORS REJEITADO] Acesso bloqueado para a origem: "${origin}"`);
    return new Response(JSON.stringify({ error: "CORS: Origem não autorizada para esta API." }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // ROTA DE INFRAESTRUTURA: Compartilha a chave pública para cifragem da chave VAPID
  if (req.method === "GET" && url.pathname === "/api/server-public-key") {
    return new Response(JSON.stringify(serverPublicKeyJwk), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // ROTA DE DISPARO: Processa o envelope VAPID e encaminha o JWT criptografado
  if (req.method === "POST" && url.pathname === "/api/proxy-push") {
    console.log(`\n📥 [${new Date().toLocaleTimeString()}] Nova requisição proxy recebida!`);
    
    try {
      const body = await req.json();
      const { subscription, payloadText, vapid, isVapidEncrypted } = body;

      console.log(`   - Endpoint destino: ${subscription.endpoint.substring(0, 45)}...`);
      console.log(`   - isVapidEncrypted: ${isVapidEncrypted}`);
      console.log(`   - Tamanho do payloadText: ${payloadText?.length || 0} bytes`);

      // Executa a auditoria cega das claims do token JWT
      const jwtClaims = lerMetadadosJJWT(payloadText);
      if (jwtClaims) {
        console.log(`   - [AUDITORIA JWT] Emitido por: ${jwtClaims.name || "Desconhecido"} <${jwtClaims.iss || "Sem e-mail"}>`);
        console.log(`   - [AUDITORIA JWT] Destinado a: <${jwtClaims.sub || "Sem e-mail"}>`);
        console.log(`   - [AUDITORIA JWT] Texto E2EE Criptografado (Hex): ${jwtClaims.cipherText?.substring(0, 20) || "N/A"}...`);
      } else {
        console.log(`   - [AUDITORIA JWT] ⚠️ Não foi possível ler as claims do JWT`);
      }

      let privateKeyFinal = vapid.privateKey;

      // 🔥 DESCRIPTOGRAFIA DA CHAVE PRIVADA VAPID NA RAM
      if (isVapidEncrypted && typeof privateKeyFinal === "string") {
        console.log("   - [SEGURANÇA] Descriptografando Chave Privada VAPID com a RSA do Servidor...");
        console.log(`   - [SEGURANÇA] Tamanho do envelope: ${privateKeyFinal.length} bytes`);
        try {
          const decryptedPrivateKeyObj = await decryptWithServerKey(privateKeyFinal);
          privateKeyFinal = decryptedPrivateKeyObj;
          console.log("   - [SEGURANÇA] ✅ Chave VAPID descriptografada com sucesso!");
          console.log(`   - [SEGURANÇA] Chave descriptografada: kty=${privateKeyFinal.kty}, crv=${privateKeyFinal.crv}`);
        } catch (decryptErr) {
          console.error("   - [SEGURANÇA] ❌ Erro ao descriptografar chave VAPID:", decryptErr);
          return new Response(
            JSON.stringify({ success: false, error: "Falha ao descriptografar chave VAPID." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        console.log("   - Chave VAPID não está criptografada, usando diretamente");
      }

      // 1. Processa e normatiza as chaves do request
      let jwkKeys;
      try {
        jwkKeys = parseVapidKeysToJwk(vapid.publicKey, privateKeyFinal);
        console.log("   - ✅ Chaves VAPID parseadas com sucesso");
        console.log(`   - PublicKey: kty=${jwkKeys.publicKey.kty}, crv=${jwkKeys.publicKey.crv}`);
        console.log(`   - PrivateKey: kty=${jwkKeys.privateKey.kty}, crv=${jwkKeys.privateKey.crv}`);
      } catch (parseErr) {
        console.error("   - ❌ Erro ao parsear chaves VAPID:", parseErr);
        return new Response(
          JSON.stringify({ success: false, error: "Chaves VAPID inválidas." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 2. Importa a assinatura do cabeçalho de rede do push
      let vapidKeys;
      try {
        vapidKeys = await webpush.importVapidKeys(jwkKeys);
        console.log("   - ✅ Chaves VAPID importadas com sucesso");
        console.log(`   - VAPID Keys: publicKey=${!!vapidKeys.publicKey}, privateKey=${!!vapidKeys.privateKey}`);
      } catch (importErr) {
        console.error("   - ❌ Erro ao importar chaves VAPID:", importErr);
        return new Response(
          JSON.stringify({ success: false, error: "Falha ao importar chaves VAPID." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Cria o servidor de aplicação
      let appServer;
      try {
        const contact = vapid.subject.startsWith("mailto:") ? vapid.subject : `mailto:${vapid.subject}`;
        console.log(`   - Contact: ${contact}`);
        appServer = await webpush.ApplicationServer.new({
          contactInformation: contact,
          vapidKeys: vapidKeys,
        });
        console.log("   - ✅ ApplicationServer criado com sucesso");
      } catch (serverErr) {
        console.error("   - ❌ Erro ao criar ApplicationServer:", serverErr);
        return new Response(
          JSON.stringify({ success: false, error: "Falha ao criar servidor de push." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 3. Encaminha o token JWT fechado diretamente sem descriptografar o conteúdo
      try {
        console.log("   - 📤 Enviando push para:", subscription.endpoint.substring(0, 60) + "...");
        console.log(`   - 📤 Tamanho do payload: ${payloadText.length} bytes`);
        
        const subscriber = appServer.subscribe(subscription);
        await subscriber.pushTextMessage(payloadText, {});
        
        console.log("   ✅ [SUCESSO] Push despachado! Chave Privada VAPID descartada com segurança da RAM.");
      } catch (pushErr) {
        console.error("   - ❌ Erro ao enviar push:", pushErr);
        
        // 🔥 Tenta ler o corpo da resposta do FCM para diagnóstico
        let responseBody = '';
        let statusCode = 500;
        
        try {
          if (pushErr instanceof webpush.PushMessageError && pushErr.response) {
            statusCode = pushErr.response.status;
            responseBody = await pushErr.response.text();
            console.error(`   - 📄 Resposta do FCM (status ${statusCode}): ${responseBody}`);
          }
        } catch (e) {
          console.error(`   - ❌ Não foi possível ler a resposta do FCM:`, e);
        }
        
        // Se for erro de subscription inválida (410) ou 404
        if (pushErr instanceof webpush.PushMessageError && (pushErr.response?.status === 410 || pushErr.response?.status === 404)) {
          return new Response(
            JSON.stringify({ success: false, error: "Inscrição expirada ou revogada.", statusCode: pushErr.response.status }),
            { status: pushErr.response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // Se o status for 400, pode ser problema no payload ou na chave
        if (pushErr instanceof webpush.PushMessageError && pushErr.response?.status === 400) {
          // Se a resposta contiver "Invalid VAPID" ou similar, podemos personalizar
          let msg = "Requisição inválida. Verifique a subscription e o payload.";
          if (responseBody.includes("Invalid")) {
            msg = "Chave VAPID inválida ou malformada.";
          } else if (responseBody.includes("payload")) {
            msg = "Payload malformado ou muito grande.";
          }
          return new Response(
            JSON.stringify({ success: false, error: msg, statusCode: 400 }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // Re-lança o erro para ser tratado pelo catch externo se não for tratado acima
        throw pushErr;
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (error) {
      console.error(`\n❌ [ERRO NO SERVIDOR PUSH] [${new Date().toLocaleTimeString()}]:`);

      const isPushError = error && typeof error === 'object' && 'response' in error;
      
      if (isPushError) {
        const statusCode = (error as any).response?.status || 400;
        console.error(`   -> Servidor Remoto retornou Status HTTP: ${statusCode}`);
        console.error(`   -> Detalhe do Erro: ${error.toString()}`);

        let clienteMensagem = "Erro desconhecido no servidor de push.";
        switch (statusCode) {
          case 410: clienteMensagem = "Inscrição expirada ou revogada (Usuário desativou as notificações)."; break;
          case 404: clienteMensagem = "Endpoint não encontrado ou expirado no servidor de push."; break;
          case 401: clienteMensagem = "Chaves VAPID inválidas ou assinatura rejeitada pelo servidor."; break;
          case 413: clienteMensagem = "Payload muito grande. O limite máximo permitido é 4096 bytes (4KB)."; break;
          case 429: clienteMensagem = "Limite de requisições excedido para este dispositivo (Rate Limit)."; break;
          default: clienteMensagem = `Servidor de push rejeitou com status ${statusCode}.`;
        }

        return new Response(
          JSON.stringify({ success: false, error: clienteMensagem, statusCode }),
          { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      console.error(`   -> Erro Interno/Local: ${errorMessage}`);
      if (errorStack) console.error(errorStack);

      return new Response(
        JSON.stringify({ success: false, error: errorMessage, type: "InternalError" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  // 4. FALLBACK: Serve os arquivos compilados da pasta dist/
  return serveDir(req, {
    fsRoot: "./dist",
    showDirListing: false,
    quiet: true,
  });
});

console.log(`🚀 Protótipo rodando em http://localhost:${PORT}`);
```

---

## Arquivo: `build.ts`

```ts
/// <reference lib="deno.ns" />
import { ensureDir, copy } from "@std/fs";
import { join } from "@std/path";

const DIST_DIR = "dist";
const SRC_DIR = "src";
const PUBLIC_DIR = "public";

interface BundleResult {
  success: boolean;
  errors?: unknown[];
  warnings?: unknown[];
  outputFiles?: Array<{
    path: string;
    contents: Record<string, number> | Uint8Array | string;
    hash?: string;
  }>;
  code?: string;
  output?: string;
}

interface BundleOptions {
  entrypoints: string[];
  outputDir?: string;
  outputFile?: string;
  platform?: "browser" | "deno" | "neutral";
  format?: "esm" | "iife" | "cjs";
  bundle?: boolean;
  minify?: boolean;
  sourcemap?: boolean | "linked" | "inline";
  write?: boolean;
  jsx?: "automatic" | "react" | "preserve";
  jsxImportSource?: string;
  jsxFactory?: string;
  jsxFragment?: string;
}

async function clean() {
  try {
    await Deno.remove(DIST_DIR, { recursive: true });
  } catch {
    // diretório não existe, ok
  }
  await ensureDir(DIST_DIR);
  console.log("📁 Arquivos anteriores excluídos");
}

async function copyStatic() {
  try {
    await copy(PUBLIC_DIR, DIST_DIR, { overwrite: true });
    console.log("📁 Arquivos estáticos copiados");
  } catch {
    console.log("⚠️ Pasta public não encontrada ou erro na cópia");
  }
}

/**
 * Converte o contents do outputFiles para string
 */
function contentsToString(contents: Record<string, number> | Uint8Array | string): string {
  // Se já é string, retorna
  if (typeof contents === 'string') {
    return contents;
  }
  
  // Se é Uint8Array, decodifica
  if (contents instanceof Uint8Array) {
    return new TextDecoder().decode(contents);
  }
  
  // Se é objeto com índices numéricos, converte para bytes
  if (contents && typeof contents === 'object') {
    const bytes: number[] = [];
    const keys = Object.keys(contents);
    const isNumericKeys = keys.every(k => !isNaN(Number(k)));
    
    if (isNumericKeys && keys.length > 0) {
      const sortedKeys = keys.map(Number).sort((a, b) => a - b);
      for (const key of sortedKeys) {
        const value = (contents as Record<string, number>)[key.toString()];
        if (typeof value === 'number' && value >= 0 && value <= 255) {
          bytes.push(value);
        }
      }
      if (bytes.length > 0) {
        return new TextDecoder().decode(new Uint8Array(bytes));
      }
    }
  }
  
  // Fallback: stringify
  return JSON.stringify(contents);
}

/**
 * Escreve o resultado do bundle no disco
 */
async function writeOutput(result: BundleResult, fileName: string): Promise<void> {
  if (!result.outputFiles || result.outputFiles.length === 0) {
    throw new Error(`Nenhum output gerado para ${fileName}`);
  }

  const text = contentsToString(result.outputFiles[0].contents);
  await Deno.writeTextFile(join(DIST_DIR, fileName), text);
}

/**
 * Extrai o código do bundle para manipulação em memória
 */
function extrairCodigoDoBundle(result: BundleResult): string {
  if (!result.outputFiles || result.outputFiles.length === 0) {
    return '';
  }
  return contentsToString(result.outputFiles[0].contents);
}

async function runBundle(name: string, bundleOpts: BundleOptions): Promise<BundleResult> {
  console.log(`🔨 [${name}] Iniciando bundle...`);
  
  // deno-lint-ignore no-explicit-any
  const result = (await (Deno as any).bundle(bundleOpts)) as BundleResult;
  
  if (!result.success) {
    console.error(`❌ Erros no bundle ${name}:`, result.errors);
    throw new Error(`Falha ao gerar ${name}`);
  }
  
  for (const warning of result.warnings || []) {
    console.warn(`⚠️ ${name}:`, warning);
  }
  
  return result;
}

/**
 * Gera ou carrega as chaves RSA do servidor usando Deno.env nativo
 */
async function gerarOuCarregarChavesServidor() {
  // 🔥 Lê diretamente do Deno.env (já carregado via --env)
  let publicKey = Deno.env.get('SERVER_PUBLIC_KEY');
  let privateKey = Deno.env.get('SERVER_PRIVATE_KEY');
  
  // Se encontrou as chaves, usa
  if (publicKey && privateKey) {
    console.log("🔑 Chaves do servidor carregadas do .env");
    return;
  }
  
  // Gera novas chaves RSA
  console.log("🔐 Gerando novas chaves RSA do servidor...");
  
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );
  
  // Exporta as chaves como JWK
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  
  const publicKeyStr = JSON.stringify(publicJwk);
  const privateKeyStr = JSON.stringify(privateJwk);
  
  // 🔥 Define no Deno.env (disponível no processo atual)
  Deno.env.set('SERVER_PUBLIC_KEY', publicKeyStr);
  Deno.env.set('SERVER_PRIVATE_KEY', privateKeyStr);
  
  // 🔥 Persiste no arquivo .env para futuras execuções
  await Deno.writeTextFile(
    '.env',
    `# Chaves RSA do Servidor - Geradas automaticamente pelo build\n` +
    `# NÃO COMMITAR ESTE ARQUIVO!\n` +
    `SERVER_PUBLIC_KEY=${publicKeyStr}\n` +
    `SERVER_PRIVATE_KEY=${privateKeyStr}\n`
  );
  
  console.log(`✅ Chaves do servidor salvas em .env`);
  console.log("   ⚠️  NÃO COMMITAR este arquivo!");
  console.log("   💡 Use 'deno task start' para rodar o servidor");
}

async function listarAssetsParaCache(): Promise<string[]> {
  const assets: string[] = [];
  const exclude = new Set(['service-worker.js', 'service-worker.tmp.js']);
  
  for await (const entry of Deno.readDir(DIST_DIR)) {
    if (entry.isFile && !entry.name.endsWith(".map") && !exclude.has(entry.name)) {
      assets.push(`/${entry.name}`);
    }
  }
  
  return assets;
}

async function build() {
  console.log("\n🚀 Iniciando build do protótipo...\n");
  const start = performance.now();

  // 0. Gera/carrega chaves do servidor usando Deno.env
  await gerarOuCarregarChavesServidor();

  // 1. Limpa e copia arquivos estáticos
  await clean();
  await copyStatic();

  // 2. Build das páginas HTML
  console.log("📦 Compilando páginas HTML...");
  await runBundle("HTML", {
    entrypoints: [
      join(SRC_DIR, "browser-a.html"),
      join(SRC_DIR, "browser-b.html"),
    join(SRC_DIR, "browser-c.html")
    ],
    outputDir: DIST_DIR,
    platform: "browser",
    format: "esm",
    bundle: true,
    minify: false,
    write: true,
    jsx: "automatic",
    jsxImportSource: "preact",
    jsxFactory: "h",
    jsxFragment: "Fragment",
  });

  // 3. Build do Service Worker em memória (write: false)
  console.log("📦 Compilando bundle do Service Worker em memória...");
  const swResult = await runBundle("ServiceWorker", {
    entrypoints: [join(SRC_DIR, "service-worker.js")],
    platform: "browser",
    format: "iife",
    bundle: true,
    minify: false,
    write: false,
  });

  // 4. Extrai código do SW em memória
  console.log("📖 Extraindo código do Service Worker em memória...");
  let swCode = extrairCodigoDoBundle(swResult);
  
  if (swCode.length < 100) {
    throw new Error("Não foi possível extrair o código do Service Worker");
  }

  console.log(`   📄 Código extraído: ${swCode.length} caracteres`);

  // 5. Lista assets e injeta cache
  console.log("📦 Mapeando assets para cache offline...");
  const assets = await listarAssetsParaCache();
  console.log(`   📄 ${assets.length} assets encontrados`);

  const versionHash = Date.now().toString();
  const assetsArrayString = assets.map(asset => `"${asset}"`).join(", ");
  
  swCode = swCode.replace(/VERSION_HASH/g, versionHash);
  swCode = swCode.replace(/__GENERATED_ASSETS__/g, assetsArrayString);

  // 6. Salva Service Worker
  const swOutputPath = join(DIST_DIR, "service-worker.js");
  await Deno.writeTextFile(swOutputPath, swCode);
  
  console.log(`✨ Service Worker gerado com sucesso! (v_${versionHash})`);
  console.log(`   📦 ${assets.length} assets em cache`);
  console.log(`   📄 Tamanho: ${(swCode.length / 1024).toFixed(2)} KB`);

  const elapsed = (performance.now() - start).toFixed(0);
  console.log(`\n✨ Build completo em ${elapsed}ms → ${DIST_DIR}/`);
  console.log(`   📄 Assets cacheados: ${assets.join(', ')}\n`);
}

await build();
```

---

## Arquivo: `public/manifest.json`

```json
{
  "name": "Loco Proto 02 — Simple Push",
  "short_name": "Proto Simple Push",
  "start_url": "/browser-b.html",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#006c4f"
}

```

---

## Arquivo: `src/browser-b.html`

```html
<!-- src/browser-b.html -->
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Browser B - Emissor e Receptor</title>
    <link rel="manifest" href="/manifest.json">
    <style>
      body { font-family: system-ui, sans-serif; padding: 20px; color: #333; max-width: 900px; margin: 0 auto; }
      .container { background: #f4f4f4; padding: 15px; border-radius: 6px; margin-bottom: 20px; box-sizing: border-box; }
      .container-receptor { border-left: 5px solid #006c4f; }
      .container-emissor { border-left: 5px solid #002b3d; }
      .container-mensagens { border-left: 5px solid #ff6b00; }
      textarea, input[type="text"] { width: 100%; max-width: 100%; padding: 8px; box-sizing: border-box; margin-bottom: 8px; font-family: monospace; }
      button { padding: 10px 16px; font-weight: bold; background-color: #006c4f; color: white; border: none; border-radius: 4px; cursor: pointer; margin-bottom: 10px; }
      button:hover { background-color: #004d3f; }
      button.send-btn { background-color: #002b3d; width: 100%; padding: 12px; font-size: 16px; margin-top: 10px; }
      button.send-btn:hover { background-color: #001a26; }
      button.danger { background-color: #cc0000; }
      button.danger:hover { background-color: #990000; }
      button.homologar-btn { background-color: #ff6b00; }
      button.homologar-btn:hover { background-color: #cc5500; }
      label { font-weight: bold; display: block; margin-top: 5px; }
      .row { display: flex; gap: 20px; flex-wrap: wrap; }
      .col { flex: 1; min-width: 300px; }
      .btn-sm { padding: 4px 12px; font-size: 12px; margin-bottom: 0; }
      .mt-10 { margin-top: 10px; }
      .mb-10 { margin-bottom: 10px; }
      .flex { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
      .flex-end { display: flex; gap: 8px; align-items: center; }
      .msg-item { border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin-bottom: 8px; }
      .msg-item-nao-lida { background: #fffde7; }
      .msg-item-notificada { background: #e3f2fd; }
      .msg-item-lida { background: #f9f9f9; }
      .msg-item-homologado { border-left: 4px solid #28a745; }
      .msg-item-nao-homologado { border-left: 4px solid #ff6b00; }
      .status-badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; }
      .status-badge-homologado { background: #d4edda; color: #155724; }
      .status-badge-nao-homologado { background: #fff3cd; color: #856404; }
      .status-badge-pendente { background: #fff3cd; color: #856404; }
      .status-badge-lida { background: #d1ecf1; color: #0c5460; }
      .status-badge-notificada { background: #d1ecf1; color: #0c5460; }
      .status-badge-enviada { background: #d4edda; color: #155724; }
      .status-badge-falha { background: #f8d7da; color: #721c24; }
      .tabs { display: flex; gap: 4px; margin-bottom: 10px; flex-wrap: wrap; }
      .tab { padding: 8px 16px; background: #e0e0e0; border: none; border-radius: 4px 4px 0 0; cursor: pointer; font-weight: bold; }
      .tab.active { background: #006c4f; color: white; }
      .tab-content { display: none; }
      .tab-content.active { display: block; }
      .toast { position: fixed; bottom: 20px; right: 20px; padding: 12px 20px; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 9999; max-width: 400px; font-family: system-ui, sans-serif; animation: fadeInUp 0.3s ease; }
      .toast-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
      .toast-error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
      .toast-info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
      @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    </style>
  </head>
  <body>
    <h1>📬 Browser B - Emissor e Receptor</h1>
    <p style="color: #666; margin-bottom: 20px;">Receba mensagens e responda para outros Browser B.</p>

    <!-- ============================================================ -->
    <!-- PERFIL E MEU BUNDLE                                           -->
    <!-- ============================================================ -->
    <div class="container" style="border-left: 5px solid #006c4f; background: #f0f8f4;">
      <h2>👤 Meu Perfil</h2>
      <div class="row">
        <div class="col">
          <label for="profileNameB">Meu Nome:</label>
          <input type="text" id="profileNameB" value="Alice" />
        </div>
        <div class="col">
          <label for="profileEmailB">Meu E-mail:</label>
          <input type="text" id="profileEmailB" value="alice@example.com" />
        </div>
      </div>
      <button id="btnGerarBundle" style="width: 100%;">📦 Gerar Meu Bundle (copie para outros)</button>

      <button id="btnVerificarBundle" class="btn-sm" style="margin-top: 5px;">🔍 Verificar Bundle</button>
      
      <div class="row mt-10">
        <div class="col">
          <label for="myPublicKeyB">Minha Chave Pública (para homologação manual):</label>
          <textarea id="myPublicKeyB" rows="3" readonly placeholder="Clique em 'Gerar Meu Bundle' primeiro..."></textarea>
          <button class="copy-btn btn-sm" data-target="myPublicKeyB">📋 Copiar Chave Pública</button>
        </div>
      </div>
      <div class="row mt-10">
        <div class="col">
          <label for="unifiedBundle">📦 Meu Bundle (copie e cole no emissor para receber mensagens):</label>
          <textarea id="unifiedBundle" rows="5" readonly placeholder="Aguardando geração..."></textarea>
          <button class="copy-btn btn-sm" data-target="unifiedBundle">📋 Copiar Bundle</button>
        </div>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- GUIA: RECEBER MENSAGENS                                       -->
    <!-- ============================================================ -->
    <div class="container container-receptor">
      <h2>📥 Receber Mensagens</h2>
      
      <div class="tabs">
        <button class="tab active" data-tab="homologar">🛡️ Homologar Emissores</button>
        <button class="tab" data-tab="mensagens-recebidas">📬 Mensagens Recebidas</button>
      </div>

      <!-- Tab: Homologar Emissores -->
      <div id="tab-homologar" class="tab-content active">
        <div class="row">
          <div class="col">
            <label for="senderPublicKeyJson">Cole aqui a Chave Pública do Emissor (para homologação manual):</label>
            <textarea id="senderPublicKeyJson" rows="3" placeholder='{"kty":"RSA","n":"...","e":"...","ownerName":"...","ownerEmail":"..."}'></textarea>
            <button id="btnSaveSenderIdentity">✅ Autorizar e Salvar Emissor</button>
          </div>
        </div>
        
        <div class="mt-10">
          <label>📋 Emissores Autorizados:</label>
          <div id="listaEmissoresB" style="max-height: 150px; overflow-y: auto; background: white; padding: 10px; border-radius: 4px; border: 1px solid #ddd;">
            <p style="color: #666; font-size: 14px;">Nenhum emissor homologado ainda.</p>
          </div>
        </div>
      </div>

      <!-- Tab: Mensagens Recebidas -->
      <div id="tab-mensagens-recebidas" class="tab-content">
        <div class="flex mb-10">
          <span><strong>📬 Mensagens Recebidas</strong></span>
          <div class="flex-end">
            <button id="btnCarregarMensagens" class="btn-sm">🔄 Atualizar</button>
            <button id="btnLimparLidas" class="btn-sm danger">🗑️ Remover Lidas</button>
            <button id="btnHomologarTodas" class="btn-sm homologar-btn">🔄 Homologar Todas</button>
          </div>
        </div>
        <div id="mensagensRecebidas">
          <p style="color: #666;">Nenhuma mensagem recebida ainda.</p>
        </div>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- GUIA: ENVIAR MENSAGENS                                        -->
    <!-- ============================================================ -->
    <div class="container container-emissor">
      <h2>📤 Enviar Mensagens</h2>
      
      <div class="tabs">
        <button class="tab active" data-tab="enviar">✉️ Enviar Nova Mensagem</button>
        <button class="tab" data-tab="mensagens-enviadas">📤 Histórico de Envio</button>
      </div>

      <!-- Tab: Enviar Nova Mensagem -->
      <div id="tab-enviar" class="tab-content active">
        <label for="bundleDestinoB">1. Cole o Bundle do Destinatário (gerado por outro Browser B):</label>
        <textarea id="bundleDestinoB" rows="4" placeholder="Cole aqui o bundle do destinatário..."></textarea>
        
        <label for="tituloMensagemB">2. Título:</label>
        <input type="text" id="tituloMensagemB" value="Nova mensagem" placeholder="Digite o título..." />
        
        <label for="mensagemEnvioB">3. Mensagem:</label>
        <textarea id="mensagemEnvioB" rows="3" placeholder="Escreva sua mensagem aqui..."></textarea>
        
        <button id="btnEnviarB" class="send-btn">🚀 Enviar Mensagem</button>
      </div>

      <!-- Tab: Mensagens Enviadas -->
      <div id="tab-mensagens-enviadas" class="tab-content">
        <div class="flex mb-10">
          <span><strong>📤 Mensagens Enviadas</strong></span>
          <div class="flex-end">
            <button id="btnCarregarEnviadasB" class="btn-sm">🔄 Atualizar</button>
            <button id="btnLimparEnviadasB" class="btn-sm danger">🗑️ Limpar Enviadas</button>
          </div>
        </div>
        <div id="mensagensEnviadasB">
          <p style="color: #666;">Nenhuma mensagem enviada ainda.</p>
        </div>
      </div>
    </div>

    <script src="./browser-b.tsx" type="module"></script>
  </body>
</html>
```

---

## Arquivo: `src/browser-a.html`

```html
<!-- src/browser-a.html -->
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Browser A - Painel de Controle e Emissão JWT</title>
    <link rel="manifest" href="/manifest.json">
    <style>
      body { font-family: system-ui, sans-serif; padding: 20px; color: #333; max-width: 800px; margin: 0 auto; }
      .container { background: #f4f4f4; padding: 15px; border-radius: 6px; margin-bottom: 20px; box-sizing: border-box; }
      textarea, input[type="text"] { width: 100%; max-width: 100%; padding: 8px; box-sizing: border-box; margin-bottom: 8px; font-family: monospace; }
      button { padding: 10px 16px; font-weight: bold; background-color: #006c4f; color: white; border: none; border-radius: 4px; cursor: pointer; margin-bottom: 10px; }
      button:hover { background-color: #004d3f; }
      button.send-btn { background-color: #002b3d; width: 100%; padding: 12px; font-size: 16px; margin-top: 10px; }
      button.send-btn:hover { background-color: #001a26; }
      label { font-weight: bold; display: block; margin-top: 5px; }
    </style>
  </head>
  <body>
    <h1>Browser A - Painel de Emissão de Web Push</h1>

    <!-- 1. BLOCO DE IDENTIDADE DO EMISSOR -->
<div class="container" style="border-left: 5px solid #002b3d;"> 
  <h2>🔒 Identidade do Emissor (Browser A)</h2> 
  
  <label for="profileNameA">Seu Nome (Remetente):</label> 
  <input type="text" id="profileNameA" value="John Doe" /> 
  
  <label for="profileEmailA">Seu E-mail (Remetente):</label> 
  <input type="text" id="profileEmailA" value="john@example.com" /> 
  
  <button id="btnGenerateIdentity">
    Gerar Minha Chave de Identidade Permanente 
  </button><br /> 
  
  <label for="myPublicKeySign">Minha Chave Pública de Assinatura (JWT-Ready JSON):</label> 
  <textarea id="myPublicKeySign" rows="4" readonly placeholder="Clique no botão acima para gerar sua chave pública permanente..."></textarea> 
  
  <button class="copy-btn" data-target="myPublicKeySign" style="background-color: #555; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer;"> 
    Copiar Minha Chave Pública 
  </button> 
</div>


    <!-- 2. PAINEL DE DISPARO DE MENSAGENS -->
    <div class="container">
      <h2>✉️ Central de Postagem</h2>
      
      <label for="unifiedBundle">1. Cole a Carga Unificada aqui (obtida no Browser B):</label>
      <textarea id="unifiedBundle" rows="6" placeholder="Cole o JSON grande gerado pelo browser-b aqui contendo o endpoint de push e a chave VAPID criptografada..."></textarea>
      
      <label for="message">2. Digite o conteúdo da Mensagem:</label>
      <textarea id="message" rows="4" placeholder="Escreva o texto que será criptografado de ponta a ponta e envelopado no token JWT..."></textarea>
      
      <button id="btnSend" class="send-btn">Enviar Notificação Instantânea</button>
    </div>

    <!-- Ponto de entrada do script processado pelo Deno -->
    <script src="./browser-a.tsx" type="module"></script>
  </body>
</html>

```

---

## Arquivo: `src/service-worker.js`

```js
// src/service-worker.js

// Importa os módulos fatiados
import "./sw/cache.js";
import "./sw/push.js";
import "./sw/sync.js";
import "./sw/click.js";
import "./sw/sw-mensagens.js"; // 🔥 NOVO - Processador de mensagens

console.log("[SW] 🌌 Orquestrador Modular do Service Worker carregado com sucesso!");

// 🔥 PROCESSADOR DE FILAS EM BACKGROUND
// Tenta processar filas quando o SW é ativado
self.addEventListener('activate', (event) => {
  console.log("[SW] 🔄 Ativando e processando filas pendentes...");
  event.waitUntil(
    (async () => {
      // Aguarda um pouco para garantir que tudo está pronto
      await new Promise(r => setTimeout(r, 1000));
      
      // Processa filas
      if (self.processarFilaEnvio) {
        await self.processarFilaEnvio();
      }
      if (self.processarFilaNotificacao) {
        await self.processarFilaNotificacao();
      }
    })()
  );
});
```

---

## Arquivo: `src/browser-a.tsx`

```tsx
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
    alert("Identidade permanente gerada com sucesso!");
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
    const publicKeyJwk = await buscarPublicKeyA();

    if (!identityRecord || !publicKeyJwk) {
      throw new Error("Identidade do Browser A não localizada! Clique no botão de gerar chave primeiro.");
    }

    // 🔥 CONSTRÓI O PAYLOAD COMPLETO COM A CHAVE PÚBLICA
    const jwtHeader = { alg: "PS256", typ: "JWT" };
    const jwtPayload = {
      iss: identityRecord.email,
      sub: e2eConfig.ownerEmail,
      name: identityRecord.name,
      iat: Math.floor(Date.now() / 1000),
      cipherText: messageHex,
      // 🔥 NOVO: Inclui a chave pública do emissor no payload
      publicKey: publicKeyJwk,
      // 🔥 NOVO: Campo extra para dados futuros
      extra: {
        titulo: "Nova mensagem", // Pode ser customizado futuramente
        versao: "1.0"
      }
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
```

---

## Arquivo: `src/sw/cache.js`

```js
// src/sw/cache.js

const CACHE_VERSION = "VERSION_HASH";
const CACHE_NAME = `loco-proto-cache-${CACHE_VERSION}`;

// O script de build vai injetar a lista dentro deste array substituindo o texto
const ASSETS_TO_CACHE = [__GENERATED_ASSETS__];

// EVENTO DE INSTALAÇÃO
self.addEventListener("install", (event) => {
  console.log("[SW-CACHE] 🛠️ Instalando novo Service Worker...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW-CACHE] 📦 Armazenando assets essenciais no cache local...");
      return Promise.all(
        ASSETS_TO_CACHE.map((url) => {
          return cache.add(url).catch((err) => {
            console.error(`[SW-CACHE] ❌ Falha ao cachear recurso: ${url}`, err);
          });
        })
      );
    }).then(() => self.skipWaiting())
  );
});

// EVENTO DE ATIVAÇÃO
self.addEventListener("activate", (event) => {
  console.log("[SW-CACHE] ✨ Ativando Service Worker e limpando caches antigos...");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log(`[SW-CACHE] 🗑️ Removendo cache obsoleto: ${cache}`);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// EVENTO FETCH
self.addEventListener("fetch", (event) => {
  if (!event.request.url.startsWith(self.location.origin) || event.request.url.includes("/api/")) {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      })
      .catch(() => {
        console.log(`[SW-CACHE] 🔌 Usuário Offline. Servindo do cache: ${event.request.url}`);
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          return new Response("Você está offline e este recurso não foi mapeado no cache.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
        });
      })
  );
});

```

---

## Arquivo: `src/sw/click.js`

```js
// src/sw/click.js

self.addEventListener('notificationclick', function(event) {
  console.log("[SW-CLICK] 🔗 ===== CLIQUE NA NOTIFICAÇÃO DETECTADO =====");
  event.notification.close();
  const urlParaAbrir = new URL('/browser-b.html', self.location.origin).href;
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(windowClients) {
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (client.url === urlParaAbrir && 'focus' in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlParaAbrir);
        }
      })
  );
});

```

---

## Arquivo: `src/sw/sync.js`

```js
// src/sw/sync.js
import { del, entries, createStore } from "idb-keyval";

// 🔥 Constantes centralizadas (copiadas do db.ts para uso no SW)
const DB_NAMES = {
  FILA_A: "BrowserA_OfflineFila_DB",
};

const STORE_NAMES = {
  KEYVAL: "keyval",
};

function criarStore(nome) {
  return createStore(nome, STORE_NAMES.KEYVAL);
}

const storeFilaDisparosA = criarStore(DB_NAMES.FILA_A);

self.addEventListener('sync', function(event) {
  console.log(`[SW-SYNC] 🔄 Sincronização em segundo plano disparada! Tag: ${event.tag}`);
  if (event.tag === 'sync-push-notifications') {
    event.waitUntil(enviarMensagensPendentes());
  }
});

async function enviarMensagensPendentes() {
  try {
    const todasAsChavesFila = await entries(storeFilaDisparosA);
    if (!todasAsChavesFila || todasAsChavesFila.length === 0) {
      console.log("[SW-SYNC] ℹ️ Nenhuma mensagem pendente na fila de sincronização.");
      return;
    }

    console.log(`[SW-SYNC] 📦 Encontrados ${todasAsChavesFila.length} push(es) pendentes para enviar...`);
    let totalSucesso = 0;

    for (const [id, payload] of todasAsChavesFila) {
      try {
        const response = await fetch("/api/proxy-push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          totalSucesso++;
          console.log(`[SW-SYNC] ✅ Mensagem enviada com sucesso ao servidor!`);
          await del(id, storeFilaDisparosA);
        } else {
          console.error("[SW-SYNC] ❌ Servidor rejeitou o POST da fila. Removendo item inválido.");
          await del(id, storeFilaDisparosA);
        }
      } catch (fetchErr) {
        console.error("[SW-SYNC] 🔌 Servidor inalcançável ou desligado. Reagendando mensagens no idb-keyval...");
        throw fetchErr; 
      }
    }

    if (totalSucesso > 0) {
      await self.registration.showNotification("✨ Conexão Restaurada!", {
        body: "Sua fila de notificações offline foi transmitida com sucesso!",
        icon: '/icon.png',
        badge: '/icon.png',
        vibrate: [100, 50, 100]
      });
    }

  } catch (err) {
    console.error("[SW-SYNC] ⚠️ Falha ao processar o envio de fundo:", err);
    throw err;
  }
}
```

---

## Arquivo: `src/sw/sw-mensagens.js`

```js
// src/sw/sw-mensagens.js
import { get, set, createStore, del, entries } from "idb-keyval";

// 🔥 Constantes
const DB_NAMES = {
  MENSAGENS_ENVIO_A: "BrowserA_MensagensEnvio_DB",
  MENSAGENS_RECEBIDAS_B: "BrowserB_MensagensRecebidas_DB",
};

const STORE_NAMES = {
  KEYVAL: "keyval",
};

// 🔥 Cria as stores IMEDIATAMENTE (não lazy)
const storeMensagensEnvioA = createStore(DB_NAMES.MENSAGENS_ENVIO_A, STORE_NAMES.KEYVAL);
const storeMensagensRecebidasB = createStore(DB_NAMES.MENSAGENS_RECEBIDAS_B, STORE_NAMES.KEYVAL);

console.log("[SW-MSG] ✅ Stores criadas com sucesso!");

// ============================================================
// PROCESSADOR DE MENSAGENS - BROWSER A (ENVIO)
// ============================================================

async function salvarMensagemEnvio(mensagem) {
  try {
    console.log(`[SW-MSG] 💾 Salvando mensagem ${mensagem.id}...`);
    await set(mensagem.id, mensagem, storeMensagensEnvioA);
    console.log(`[SW-MSG] ✅ Mensagem ${mensagem.id} salva no IndexedDB`);
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao salvar mensagem ${mensagem.id}:`, err);
    throw err;
  }
}

async function buscarMensagemEnvio(id) {
  try {
    return await get(id, storeMensagensEnvioA);
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao buscar mensagem ${id}:`, err);
    return null;
  }
}

async function listarMensagensEnvioPorStatus(status) {
  try {
    const todas = await listarMensagensEnvio();
    return todas.filter(m => m.status === status);
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao listar mensagens por status:", err);
    return [];
  }
}

async function listarMensagensEnvio() {
  try {
    const entriesList = await entries(storeMensagensEnvioA);
    return entriesList.map(([_, msg]) => msg);
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao listar mensagens:", err);
    return [];
  }
}

async function atualizarStatusMensagemEnvio(id, status, erro) {
  try {
    const mensagem = await buscarMensagemEnvio(id);
    if (mensagem) {
      mensagem.status = status;
      mensagem.atualizadoEm = Date.now();
      if (erro) mensagem.erro = erro;
      await salvarMensagemEnvio(mensagem);
      console.log(`[SW-MSG] ✅ Mensagem ${id} atualizada para status: ${status}`);
    }
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao atualizar mensagem ${id}:`, err);
  }
}

async function removerMensagemEnvio(id) {
  try {
    await del(id, storeMensagensEnvioA);
    console.log(`[SW-MSG] ✅ Mensagem ${id} removida`);
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao remover mensagem ${id}:`, err);
  }
}

// 🔥 ENVIA UMA MENSAGEM PARA O SERVIDOR
async function enviarMensagemParaServidor(mensagem) {
  try {
    console.log(`[SW-MSG] 📤 Enviando mensagem ${mensagem.id} para o servidor...`);
    
    const response = await fetch("/api/proxy-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...mensagem.bundle,
        payloadText: mensagem.payloadText
      })
    });

    if (response.ok) {
      console.log(`[SW-MSG] ✅ Mensagem ${mensagem.id} enviada com sucesso!`);
      await atualizarStatusMensagemEnvio(mensagem.id, 'enviada');
      return true;
    } else {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao enviar mensagem ${mensagem.id}:`, err);
    
    // Incrementa tentativas
    mensagem.tentativas++;
    mensagem.erro = err.message;
    
    if (mensagem.tentativas >= mensagem.maxTentativas) {
      console.log(`[SW-MSG] ⛔ Mensagem ${mensagem.id} excedeu tentativas máximas.`);
      await atualizarStatusMensagemEnvio(mensagem.id, 'falha', err.message);
    } else {
      await salvarMensagemEnvio(mensagem);
    }
    
    return false;
  }
}

// 🔥 PROCESSADOR DE FILA DE ENVIO
async function processarFilaEnvio() {
  console.log("[SW-MSG] 🔄 Processando fila de envio...");
  
  try {
    const pendentes = await listarMensagensEnvioPorStatus('pendente');
    const enviando = await listarMensagensEnvioPorStatus('enviando');
    
    // Recupera mensagens que ficaram presas em 'enviando'
    const todasEnviando = enviando.filter(m => {
      return (Date.now() - m.atualizadoEm) > 30000;
    });
    
    const paraProcessar = [...pendentes, ...todasEnviando];
    
    if (paraProcessar.length === 0) {
      console.log("[SW-MSG] ℹ️ Nenhuma mensagem pendente para enviar.");
      return;
    }
    
    console.log(`[SW-MSG] 📦 ${paraProcessar.length} mensagens para processar`);
    
    for (const msg of paraProcessar) {
      await atualizarStatusMensagemEnvio(msg.id, 'enviando');
      await enviarMensagemParaServidor(msg);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao processar fila de envio:", err);
  }
}

// ============================================================
// PROCESSADOR DE MENSAGENS - BROWSER B (RECEBIDAS)
// ============================================================

async function salvarMensagemRecebida(mensagem) {
  try {
    await set(mensagem.id, mensagem, storeMensagensRecebidasB);
    console.log(`[SW-MSG] ✅ Mensagem ${mensagem.id} salva no IndexedDB`);
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao salvar mensagem ${mensagem.id}:`, err);
  }
}

async function listarMensagensRecebidasPorStatus(status) {
  try {
    const todas = await listarMensagensRecebidas();
    return todas.filter(m => m.status === status);
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao listar mensagens recebidas:", err);
    return [];
  }
}

async function listarMensagensRecebidas() {
  try {
    const entriesList = await entries(storeMensagensRecebidasB);
    return entriesList.map(([_, msg]) => msg);
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao listar mensagens recebidas:", err);
    return [];
  }
}

async function atualizarStatusMensagemRecebida(id, status) {
  try {
    const mensagem = await get(id, storeMensagensRecebidasB);
    if (mensagem) {
      mensagem.status = status;
      if (status === 'lida') mensagem.lidaEm = Date.now();
      if (status === 'notificada') mensagem.notificadaEm = Date.now();
      await set(id, mensagem, storeMensagensRecebidasB);
      console.log(`[SW-MSG] ✅ Mensagem ${id} atualizada para status: ${status}`);
    }
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao atualizar mensagem ${id}:`, err);
  }
}

// 🔥 PROCESSADOR DE FILA DE NOTIFICAÇÃO
async function processarFilaNotificacao() {
  console.log("[SW-MSG] 🔔 Processando fila de notificações...");
  
  try {
    const naoLidas = await listarMensagensRecebidasPorStatus('nao_lida');
    
    if (naoLidas.length === 0) {
      console.log("[SW-MSG] ℹ️ Nenhuma mensagem não lida.");
      return;
    }
    
    console.log(`[SW-MSG] 📦 ${naoLidas.length} mensagens para notificar`);
    
    for (const msg of naoLidas) {
      try {
        console.log(`[SW-MSG] 🔔 Notificando mensagem ${msg.id}...`);
        
        await self.registration.showNotification(`📥 De: ${msg.remetente}`, {
          body: msg.conteudo,
          icon: '/icon.png',
          badge: '/icon.png',
          vibrate: [200, 100, 200],
          data: msg.dadosJwt,
          tag: msg.id,
          requireInteraction: true
        });
        
        await atualizarStatusMensagemRecebida(msg.id, 'notificada');
        console.log(`[SW-MSG] ✅ Mensagem ${msg.id} notificada com sucesso!`);
        
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (err) {
        console.error(`[SW-MSG] ❌ Erro ao notificar mensagem ${msg.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao processar fila de notificações:", err);
  }
}

// ============================================================
// LISTENERS DE EVENTOS
// ============================================================

// 🔥 OUVE MENSAGENS DA PÁGINA (Browser A/B)
self.addEventListener('message', async (event) => {
  const data = event.data;
  
  if (data.type === 'ENVIAR_MENSAGEM') {
    console.log(`[SW-MSG] 📩 Recebida mensagem da página para enviar: ${data.payload.id}`);
    try {
      await salvarMensagemEnvio(data.payload);
      
      // Tenta enviar imediatamente
      await processarFilaEnvio();
      
      // Responde para a página
      if (event.source) {
        event.source.postMessage({
          type: 'MENSAGEM_ENVIADA',
          id: data.payload.id,
          status: 'pendente'
        });
      }
    } catch (err) {
      console.error("[SW-MSG] ❌ Erro ao processar mensagem:", err);
      if (event.source) {
        event.source.postMessage({
          type: 'MENSAGEM_ERRO',
          id: data.payload.id,
          error: err.message
        });
      }
    }
  }
  
  if (data.type === 'LISTAR_MENSAGENS_PENDENTES') {
    try {
      const mensagens = await listarMensagensEnvioPorStatus('pendente');
      if (event.source) {
        event.source.postMessage({
          type: 'LISTA_MENSAGENS',
          mensagens: mensagens
        });
      }
    } catch (err) {
      console.error("[SW-MSG] ❌ Erro ao listar mensagens:", err);
    }
  }
});

// 🔥 SINC - Disparado quando o navegador está online
self.addEventListener('sync', async function(event) {
  console.log(`[SW-MSG] 🔄 Sync disparado: ${event.tag}`);
  
  if (event.tag === 'sync-envio-mensagens') {
    event.waitUntil(processarFilaEnvio());
  }
  
  if (event.tag === 'sync-notificar-mensagens') {
    event.waitUntil(processarFilaNotificacao());
  }
});

// 🔥 PERIODIC SYNC (se disponível)
self.addEventListener('periodicsync', async function(event) {
  console.log(`[SW-MSG] ⏰ Periodic sync: ${event.tag}`);
  
  if (event.tag === 'periodic-sync-mensagens') {
    await processarFilaEnvio();
    await processarFilaNotificacao();
  }
});

// 🔥 ONLINE/OFFLINE - Processa filas quando volta online
self.addEventListener('online', async function() {
  console.log("[SW-MSG] 🌐 Conexão restaurada, processando filas...");
  await processarFilaEnvio();
  await processarFilaNotificacao();
});

// 🔥 EXPORTA FUNÇÕES PARA O SERVICE WORKER PRINCIPAL
self.processarFilaEnvio = processarFilaEnvio;
self.processarFilaNotificacao = processarFilaNotificacao;

console.log("[SW-MSG] 📦 Módulo de mensagens carregado com sucesso!");
```

---

## Arquivo: `src/sw/push.js`

```js
// src/sw/push.js
import { get, set, createStore } from "idb-keyval";
import { gunzipSync } from "fflate";

// 🔥 Constantes
const DB_NAMES = {
  CHAVES_E2E_B: "BrowserB_E2E_Chaves_DB",
  LISTA_BRANCA_B: "BrowserB_ListaBranca_DB",
  MENSAGENS_RECEBIDAS_B: "BrowserB_MensagensRecebidas_DB",
};

const STORE_NAMES = {
  KEYVAL: "keyval",
};

const KEY_NAMES = {
  CHAVES_E2E_B: "chaves_e2e_b",
  DECRYPT_KEY: "minha_decript_key",
};

// 🔥 Função para criar stores com tratamento de erro
function criarStore(nome) {
  try {
    return createStore(nome, STORE_NAMES.KEYVAL);
  } catch (err) {
    console.error(`[SW-PUSH] ❌ Erro ao criar store ${nome}:`, err);
    return null;
  }
}

// 🔥 Inicializa stores
let storeChavesE2E = criarStore(DB_NAMES.CHAVES_E2E_B);
let storeListaBranca = criarStore(DB_NAMES.LISTA_BRANCA_B);
let storeMensagensRecebidasB = criarStore(DB_NAMES.MENSAGENS_RECEBIDAS_B);

// 🔥 Função para garantir que as stores estão disponíveis
function garantirStores() {
  if (!storeChavesE2E) {
    storeChavesE2E = criarStore(DB_NAMES.CHAVES_E2E_B);
  }
  if (!storeListaBranca) {
    storeListaBranca = criarStore(DB_NAMES.LISTA_BRANCA_B);
  }
  if (!storeMensagensRecebidasB) {
    storeMensagensRecebidasB = criarStore(DB_NAMES.MENSAGENS_RECEBIDAS_B);
  }
  return storeChavesE2E && storeListaBranca && storeMensagensRecebidasB;
}

// 🔥 Função para salvar mensagem recebida no IndexedDB
async function salvarMensagemRecebida(mensagem) {
  try {
    garantirStores();
    if (!storeMensagensRecebidasB) {
      throw new Error("Store de mensagens recebidas não disponível");
    }
    await set(mensagem.id, mensagem, storeMensagensRecebidasB);
    console.log(`[SW-PUSH] ✅ Mensagem ${mensagem.id} salva no IndexedDB`);
  } catch (err) {
    console.error(`[SW-PUSH] ❌ Erro ao salvar mensagem ${mensagem.id}:`, err);
    throw err;
  }
}

// 🔥 Função para buscar a chave privada de decodificação (RSA)
async function buscarChaveDecript() {
  try {
    garantirStores();
    if (!storeChavesE2E) {
      throw new Error("Store de chaves E2E não disponível");
    }
    
    const chavesE2E = await get(KEY_NAMES.CHAVES_E2E_B, storeChavesE2E);
    if (chavesE2E && chavesE2E.privateDecrypt) {
      console.log("[SW-PUSH] 🔑 Chave de decodificação RSA encontrada");
      return chavesE2E.privateDecrypt;
    }
    
    const decryptKey = await get(KEY_NAMES.DECRYPT_KEY, storeChavesE2E);
    if (decryptKey) {
      console.log("[SW-PUSH] 🔑 Chave de decodificação encontrada (legado)");
      return decryptKey;
    }
    
    return null;
  } catch (err) {
    console.error("[SW-PUSH] ❌ Erro ao buscar chave de decodificação:", err);
    return null;
  }
}

// 🔥 Função para homologar emissor automaticamente (usa chave pública VAPID)
async function homologarEmissorAutomatico(email, nome, publicKeyJwk) {
  try {
    garantirStores();
    if (!storeListaBranca) {
      throw new Error("Store da lista branca não disponível");
    }
    
    const existente = await get(email, storeListaBranca);
    if (existente) {
      console.log(`[SW-PUSH] ℹ️ Emissor ${email} já está homologado`);
      return true;
    }
    
    // Verifica se a chave é válida (ECDSA P-256)
    await crypto.subtle.importKey(
      "jwk", publicKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      true, ["verify"]
    );
    
    await set(email, {
      email: email,
      name: nome,
      jwk: publicKeyJwk,
      homologadoAutomaticamente: true,
      homologadoEm: Date.now()
    }, storeListaBranca);
    
    console.log(`[SW-PUSH] ✅ Emissor ${nome} <${email}> homologado automaticamente!`);
    return true;
  } catch (err) {
    console.error(`[SW-PUSH] ❌ Falha ao homologar emissor ${email}:`, err);
    return false;
  }
}

// 🔥 Função para salvar o emissor completo para permitir resposta
async function salvarEmissorCompleto(email, emissorData) {
  if (!emissorData) return;
  
  try {
    garantirStores();
    if (!storeMensagensRecebidasB) {
      throw new Error("Store de mensagens recebidas não disponível");
    }
    await set(`emissor_completo_${email}`, {
      ...emissorData,
      atualizadoEm: Date.now()
    }, storeMensagensRecebidasB);
    console.log(`[SW-PUSH] ✅ Dados completos do emissor ${email} salvos para resposta`);
  } catch (err) {
    console.error(`[SW-PUSH] ❌ Erro ao salvar dados do emissor:`, err);
  }
}

// 🔥 Função para converter Base64 para ArrayBuffer
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ============================================================
// 🔥 EVENTO PRINCIPAL DE PUSH
// ============================================================

self.addEventListener('push', function(event) {
  console.log("[SW-PUSH] 📩 ===== PUSH EVENT RECEBIDO =====");
  if (!event.data) return;

  const rawText = event.data.text();
  console.log("[SW-PUSH] 📦 Texto bruto recebido do push:", rawText.substring(0, 100) + "...");

  if (rawText.split('.').length !== 3) {
    console.log("[SW-PUSH] ℹ️ Carga não segue o padrão JWT. Exibindo como texto bruto.");
    event.waitUntil(
      self.registration.showNotification("Notificação de Teste", { body: rawText })
    );
    return;
  }

  event.waitUntil(async function() {
    try {
      const parts = rawText.split('.');
      const headerB64Url = parts[0];
      const payloadB64Url = parts[1];
      const signatureB64Url = parts[2];
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      const base64UrlDecode = (str) => {
        let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) base64 += '=';
        return decoder.decode(new Uint8Array([...atob(base64)].map(c => c.charCodeAt(0))));
      };

      const jwtPayload = JSON.parse(base64UrlDecode(payloadB64Url));
      const emailRemetente = jwtPayload.iss || jwtPayload.email || "remetente@desconhecido";
      const nomeRemetente = jwtPayload.name || "Remetente Autorizado";

      console.log(`[SW-PUSH] 🔐 Analisando mensagem de: ${nomeRemetente} <${emailRemetente}>`);

      // ============================================================
      // 🔥 VERIFICA HOMOLOGAÇÃO (com reconexão)
      // ============================================================
      garantirStores();
      let emissorHomologado = null;
      let homologado = false;
      
      if (storeListaBranca) {
        try {
          emissorHomologado = await get(emailRemetente, storeListaBranca);
          if (emissorHomologado) {
            console.log(`[SW-PUSH] ✅ Emissor ${emailRemetente} já está homologado`);
            homologado = true;
          }
        } catch (dbErr) {
          console.warn(`[SW-PUSH] ⚠️ Erro ao verificar homologação:`, dbErr);
        }
      }

      // ============================================================
      // 🔥 EXTRAI CHAVE PÚBLICA VAPID PARA VERIFICAÇÃO
      // ============================================================
      // A chave pública VAPID do emissor deve estar no campo "publicKey" do payload
      let publicKeyVapid = jwtPayload.publicKey || null;

      // Se não veio no JWT, tenta buscar do IndexedDB (dados salvos anteriormente)
      if (!publicKeyVapid && storeMensagensRecebidasB) {
        try {
          const emissorData = await get(`emissor_completo_${emailRemetente}`, storeMensagensRecebidasB);
          publicKeyVapid = emissorData?.publicKeyVapid || null;
        } catch (dbErr) {
          console.warn(`[SW-PUSH] ⚠️ Erro ao buscar emissor no IndexedDB:`, dbErr);
        }
      }

      // ============================================================
      // 🔥 VALIDA A ASSINATURA (ECDSA com chave pública VAPID)
      // ============================================================
      let assinaturaValida = false;

      try {
        if (publicKeyVapid) {
          const keyVerify = await crypto.subtle.importKey(
            "jwk", publicKeyVapid,
            { name: "ECDSA", namedCurve: "P-256" },
            true, ["verify"]
          );

          let b64Sig = signatureB64Url.replace(/-/g, '+').replace(/_/g, '/');
          while (b64Sig.length % 4) b64Sig += '=';
          const signatureBytes = new Uint8Array([...atob(b64Sig)].map(c => c.charCodeAt(0)));
          const tokenStringWithoutSignature = `${headerB64Url}.${payloadB64Url}`;

          assinaturaValida = await crypto.subtle.verify(
            { name: "ECDSA", hash: "SHA-256" },
            keyVerify,
            signatureBytes,
            encoder.encode(tokenStringWithoutSignature)
          );
        } else {
          console.log("[SW-PUSH] ⚠️ Chave pública VAPID do emissor não encontrada");
        }
      } catch (err) {
        console.error("[SW-PUSH] ❌ Erro na verificação da assinatura:", err);
      }

      // Se não tiver chave pública, tenta homologar automaticamente
      if (!publicKeyVapid && jwtPayload.publicKey) {
        console.log(`[SW-PUSH] 🔄 Tentando homologar automaticamente com chave do JWT...`);
        homologado = await homologarEmissorAutomatico(emailRemetente, nomeRemetente, jwtPayload.publicKey);
        if (homologado) {
          publicKeyVapid = jwtPayload.publicKey;
          try {
            const keyVerify = await crypto.subtle.importKey(
              "jwk", publicKeyVapid,
              { name: "ECDSA", namedCurve: "P-256" },
              true, ["verify"]
            );

            let b64Sig = signatureB64Url.replace(/-/g, '+').replace(/_/g, '/');
            while (b64Sig.length % 4) b64Sig += '=';
            const signatureBytes = new Uint8Array([...atob(b64Sig)].map(c => c.charCodeAt(0)));
            const tokenStringWithoutSignature = `${headerB64Url}.${payloadB64Url}`;

            assinaturaValida = await crypto.subtle.verify(
              { name: "ECDSA", hash: "SHA-256" },
              keyVerify,
              signatureBytes,
              encoder.encode(tokenStringWithoutSignature)
            );
          } catch (err) {
            console.error("[SW-PUSH] ❌ Erro na verificação da assinatura após homologação:", err);
          }
        }
      }

      if (!assinaturaValida) {
        console.warn(`[SW-PUSH] ⚠️ Assinatura inválida para ${emailRemetente}`);
        await self.registration.showNotification(`⚠️ Mensagem com assinatura inválida`, {
          body: `De: ${nomeRemetente}\nA mensagem não pôde ser verificada.`,
          icon: '/icon.png',
          tag: `invalid_${Date.now()}`
        });
        return;
      }

      console.log("[SW-PUSH] 🛡️ Assinatura digital do JWT validada com sucesso!");

      // ============================================================
      // 🔥 DESCRIPTOGRAFA O ENVELOPE HÍBRIDO (RSA-OAEP + AES-GCM)
      // ============================================================
      const privateDecryptKey = await buscarChaveDecript();
      if (!privateDecryptKey) {
        console.error("[SW-PUSH] ❌ Chave privada RSA de decodificação não encontrada!");
        throw new Error("Sua chave privada RSA de decodificação não foi encontrada.");
      }

      // 🔥 Extrai o envelope do JWT
      const envelopeJson = jwtPayload.ct || jwtPayload.cipherText;
      console.log("[SW-PUSH] 📦 Envelope JSON recebido:", envelopeJson?.length || 0, "bytes");

      if (!envelopeJson) {
        console.error("[SW-PUSH] ❌ Envelope não encontrado no JWT");
        throw new Error("Envelope não encontrado");
      }

      let envelope;
      try {
        envelope = JSON.parse(envelopeJson);
        console.log("[SW-PUSH] ✅ Envelope parseado com sucesso");
      } catch (parseErr) {
        console.error("[SW-PUSH] ❌ Erro ao parsear envelope JSON:", parseErr);
        throw new Error("Envelope inválido");
      }

      // 🔥 Extrai os campos
      const iv = envelope.i || envelope.iv;
      const dadosCifrados = envelope.d || envelope.dadosCifrados;
      const chaveAesCifrada = envelope.k || envelope.chaveAesCifrada;

      if (!iv || !dadosCifrados || !chaveAesCifrada) {
        console.error("[SW-PUSH] ❌ Envelope incompleto");
        throw new Error("Envelope incompleto");
      }

      // 🔥 Decodifica Base64
      const ivBytes = new Uint8Array(base64ToArrayBuffer(iv));
      const dadosBytes = new Uint8Array(base64ToArrayBuffer(dadosCifrados));
      const chaveAesCifradaBytes = new Uint8Array(base64ToArrayBuffer(chaveAesCifrada));

      console.log(`[SW-PUSH] 📦 IV: ${ivBytes.length} bytes`);
      console.log(`[SW-PUSH] 📦 Dados cifrados: ${dadosBytes.length} bytes`);
      console.log(`[SW-PUSH] 📦 Chave AES cifrada: ${chaveAesCifradaBytes.length} bytes`);

      // Descriptografa a chave AES com RSA
      console.log("[SW-PUSH] 🔑 Descriptografando chave AES com RSA...");
      const aesChaveCruaBuffer = await crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        privateDecryptKey,
        chaveAesCifradaBytes
      );
      console.log(`[SW-PUSH] ✅ Chave AES descriptografada (${aesChaveCruaBuffer.byteLength} bytes)`);

      // Importa a chave AES
      console.log("[SW-PUSH] 🔑 Importando chave AES...");
      const chaveSimetricaAes = await crypto.subtle.importKey(
        "raw",
        aesChaveCruaBuffer,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
      );
      console.log("[SW-PUSH] ✅ Chave AES importada");

      // Descriptografa os dados
      console.log("[SW-PUSH] 🔓 Descriptografando dados com AES-GCM...");
      const textoDecifradoBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ivBytes },
        chaveSimetricaAes,
        dadosBytes
      );
      console.log(`[SW-PUSH] ✅ Dados descriptografados (${textoDecifradoBuffer.byteLength} bytes)`);

      // Descompacta
      console.log("[SW-PUSH] 📦 Descompactando com gunzip...");
      const decompressedBytes = gunzipSync(new Uint8Array(textoDecifradoBuffer));
      const textoDecifrado = new TextDecoder().decode(decompressedBytes);
      console.log(`[SW-PUSH] ✅ Dados descompactados (${textoDecifrado.length} bytes)`);

      // ============================================================
      // 🔥 DESERIALIZA O OBJETO DE MENSAGEM
      // ============================================================
      let mensagemObj = null;
      let titulo = "Nova mensagem";
      let conteudo = textoDecifrado;
      let emissorData = null;
      let publicKeyEncrypt = null;
      let publicKeyVapidEmissor = null;
      let subscription = null;
      let vapid = null;

      try {
        mensagemObj = JSON.parse(textoDecifrado);
        titulo = mensagemObj.m?.t || "Nova mensagem";
        conteudo = mensagemObj.m?.c || textoDecifrado;
        
        if (mensagemObj.e) {
          const e = mensagemObj.e;
          emissorData = {
            email: emailRemetente,
            nome: nomeRemetente,
          };
          
          if (e.sub) {
            subscription = {
              endpoint: e.sub.endpoint,
              keys: e.sub.keys
            };
            emissorData.subscription = subscription;
          }
          
          // A chave pública VAPID (para verificação) – pode estar em 'pv'
          if (e.pv) {
            publicKeyVapidEmissor = e.pv;
            emissorData.publicKeyVapid = publicKeyVapidEmissor;
          }
          
          // A chave pública RSA para criptografia (para resposta)
          if (e.pe) {
            publicKeyEncrypt = e.pe;
            emissorData.publicKeyEncrypt = publicKeyEncrypt;
          }
          
          // Dados VAPID (públicos) – se disponíveis
          if (e.vapid) {
            vapid = {
              publicKey: e.vapid.publicKey,
              privateKey: e.vapid.privateKey // cifrada (para o servidor)
            };
            emissorData.vapid = vapid;
            emissorData.isVapidEncrypted = true;
          }
          
          // Salva o emissor completo
          await salvarEmissorCompleto(emailRemetente, emissorData);
          console.log(`[SW-PUSH] ✅ Emissor ${emailRemetente} salvo`);
        }
        
        console.log("[SW-PUSH] 📦 Objeto decodificado:", {
          titulo: titulo,
          emissor: emailRemetente,
          temSubscription: !!subscription,
          temPublicKeyEncrypt: !!publicKeyEncrypt
        });
      } catch (parseError) {
        console.error("[SW-PUSH] ❌ Erro ao parsear JSON:", parseError);
        emissorData = { email: emailRemetente, nome: nomeRemetente };
      }

      // ============================================================
      // 🔥 CRIA MENSAGEM RECEBIDA
      // ============================================================
      const mensagemId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const mensagemRecebida = {
        id: mensagemId,
        remetente: emissorData?.nome || nomeRemetente,
        remetenteEmail: emailRemetente,
        titulo: titulo,
        conteudo: conteudo,
        dadosJwt: jwtPayload,
        publicKey: publicKeyVapidEmissor || publicKeyVapid, // chave VAPID para verificação
        homologado: homologado,
        assinaturaValida: assinaturaValida,
        emissorCompleto: {
          nome: emissorData?.nome || nomeRemetente,
          email: emailRemetente,
          publicKeyEncrypt: publicKeyEncrypt || null,
          publicKeyVapid: publicKeyVapidEmissor || publicKeyVapid || null,
          subscription: subscription || null,
          vapid: vapid || null,
          isVapidEncrypted: true
        },
        bundleEmissor: (subscription && publicKeyEncrypt) ? {
          subscription: subscription,
          vapid: vapid || {
            subject: `mailto:${emailRemetente}`,
            publicKey: publicKeyVapidEmissor || publicKeyVapid
          },
          isVapidEncrypted: true,
          nome: emissorData?.nome || nomeRemetente,
          email: emailRemetente,
          publicKeyEncrypt: publicKeyEncrypt,
          publicKeyVapid: publicKeyVapidEmissor || publicKeyVapid
        } : null,
        status: 'nao_lida',
        recebidoEm: Date.now()
      };

      await salvarMensagemRecebida(mensagemRecebida);
      console.log(`[SW-PUSH] ✅ Mensagem ${mensagemId} salva`);

      // ============================================================
      // 🔥 NOTIFICAÇÃO
      // ============================================================
      const podeResponder = subscription && publicKeyEncrypt ? ' (pode responder)' : '';
      const statusEmoji = homologado ? '✅' : '🔄';
      const statusTexto = homologado ? 'Homologado' : 'Não homologado';
      
      await self.registration.showNotification(`📥 ${titulo}`, {
        body: `${conteudo}\n\n${statusEmoji} De: ${emissorData?.nome || nomeRemetente} - ${statusTexto}${podeResponder}`,
        icon: '/icon.png',
        badge: '/icon.png',
        vibrate: [200, 100, 200],
        data: {
          mensagemId: mensagemId,
          remetenteEmail: emailRemetente,
          nomeRemetente: emissorData?.nome || nomeRemetente,
          publicKey: publicKeyVapidEmissor || publicKeyVapid,
          homologado: homologado,
          podeResponder: !!subscription && !!publicKeyEncrypt,
          acao: homologado ? 'ver_mensagem' : 'homologar_emissor'
        },
        tag: mensagemId,
        requireInteraction: !homologado
      });

      // Notifica clientes abertos
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach((client) => {
        client.postMessage({
          type: "PUSH_RECEIVED",
          payload: {
            id: mensagemId,
            title: titulo,
            body: conteudo,
            remetente: emissorData?.nome || nomeRemetente,
            homologado: homologado,
            podeResponder: !!subscription && !!publicKeyEncrypt,
            status: 'nao_lida'
          }
        });
      });

      if (self.processarFilaNotificacao) {
        await self.processarFilaNotificacao();
      }

    } catch (jwtError) {
      console.error("[SW-PUSH] ❌ Falha crítica:", jwtError.message);
      console.error("[SW-PUSH] 🔍 Stack trace:", jwtError.stack);
      await self.registration.showNotification("⚠️ Bloqueio de Segurança", {
        body: jwtError.message || "Assinatura corrompida.",
        icon: '/icon.png'
      });
    }
  }());
});

// ============================================================
// 🔥 LISTENER PARA CLIQUE NA NOTIFICAÇÃO
// ============================================================

self.addEventListener('notificationclick', function(event) {
  console.log("[SW-CLICK] 🔗 ===== CLIQUE NA NOTIFICAÇÃO DETECTADO =====");
  
  const notificationData = event.notification.data;
  event.notification.close();
  
  if (notificationData?.acao === 'homologar_emissor' && notificationData?.publicKey) {
    const { remetenteEmail, nomeRemetente, publicKey, mensagemId } = notificationData;
    
    event.waitUntil(async function() {
      console.log(`[SW-CLICK] 🔄 Homologando emissor ${nomeRemetente} <${remetenteEmail}>...`);
      
      try {
        garantirStores();
        if (!storeListaBranca) {
          throw new Error("Store da lista branca não disponível");
        }
        
        const existente = await get(remetenteEmail, storeListaBranca);
        if (existente) {
          console.log(`[SW-CLICK] ℹ️ Emissor ${remetenteEmail} já está homologado`);
          
          const mensagem = await get(mensagemId, storeMensagensRecebidasB);
          if (mensagem) {
            mensagem.homologado = true;
            await set(mensagemId, mensagem, storeMensagensRecebidasB);
          }
          
          await self.registration.showNotification("✅ Emissor já homologado", {
            body: `${nomeRemetente} já estava na lista branca.`,
            icon: '/icon.png'
          });
          return;
        }
        
        // Verifica se a chave é uma chave ECDSA VAPID válida
        await crypto.subtle.importKey(
          "jwk", publicKey,
          { name: "ECDSA", namedCurve: "P-256" },
          true, ["verify"]
        );
        
        await set(remetenteEmail, {
          email: remetenteEmail,
          name: nomeRemetente,
          jwk: publicKey,
          homologadoEm: Date.now()
        }, storeListaBranca);
        
        const mensagem = await get(mensagemId, storeMensagensRecebidasB);
        if (mensagem) {
          mensagem.homologado = true;
          await set(mensagemId, mensagem, storeMensagensRecebidasB);
        }
        
        console.log(`[SW-CLICK] ✅ Emissor ${nomeRemetente} homologado com sucesso!`);
        
        await self.registration.showNotification("✅ Emissor Homologado!", {
          body: `${nomeRemetente} foi adicionado à lista branca.`,
          icon: '/icon.png',
          vibrate: [200, 100, 200]
        });
        
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        clients.forEach((client) => {
          client.postMessage({
            type: "EMISSOR_HOMOLOGADO",
            payload: { email: remetenteEmail, name: nomeRemetente }
          });
        });
        
      } catch (err) {
        console.error(`[SW-CLICK] ❌ Falha ao homologar:`, err);
        await self.registration.showNotification("❌ Falha na Homologação", {
          body: `Não foi possível homologar ${nomeRemetente}.`,
          icon: '/icon.png'
        });
      }
    }());
    return;
  }
  
  // Fallback: abre a página
  const urlParaAbrir = new URL('/browser-b.html', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(windowClients) {
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (client.url === urlParaAbrir && 'focus' in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlParaAbrir);
        }
      })
  );
});

console.log("[SW-PUSH] 📦 Módulo push carregado (assinatura ECDSA com VAPID)");
```

---

## Arquivo: `src/constants/db.ts`

```ts
// src/constants/db.ts
export const DB_NAMES = {
  // Browser A
  IDENTIDADE_A: "BrowserA_Identidade_DB",
  FILA_A: "BrowserA_OfflineFila_DB",
  BUNDLES_A: "BrowserA_Bundles_DB",
  MENSAGENS_ENVIO_A: "BrowserA_MensagensEnvio_DB",

  // Browser B
  CHAVES_E2E_B: "BrowserB_E2E_Chaves_DB",
  LISTA_BRANCA_B: "BrowserB_ListaBranca_DB",
  CHAVES_VAPID_B: "BrowserB_Vapid_DB",
  SUBSCRIPTION_B: "BrowserB_Subscription_DB",
  MENSAGENS_RECEBIDAS_B: "BrowserB_MensagensRecebidas_DB",
} as const;

export const STORE_NAMES = {
  KEYVAL: "keyval",
} as const;

export const KEY_NAMES = {
  // Browser A - Identidade (agora armazena chave privada VAPID)
  IDENTIDADE_A: "identidade_a",
  PUBLIC_KEY_A: "public_key_a",   // chave pública VAPID (com metadados)

  // Browser A - Fila Offline (legado)
  FILA_OFFLINE: "fila_offline",

  // Browser A - Bundles (do Browser B)
  BUNDLE_ATIVO: "bundle_ativo",
  BUNDLE_HISTORICO: "bundle_historico",

  // Browser A - Mensagens de Envio
  MENSAGENS_ENVIO: "mensagens_envio",

  // Browser B - E2E (agora apenas RSA de criptografia)
  CHAVES_E2E_B: "chaves_e2e_b",
  PUBLIC_ENCRYPT_B: "public_encrypt_b",
  // PUBLIC_VERIFY_B foi removido – a verificação usa a chave pública VAPID

  // Browser B - VAPID
  CHAVES_VAPID_B: "chaves_vapid_b",
  VAPID_PUBLIC_B: "vapid_public_b",
  VAPID_PRIVATE_B: "vapid_private_b",

  // Browser B - Subscription
  SUBSCRIPTION_B: "subscription_b",
  SUBSCRIPTION_ENDPOINT_B: "subscription_endpoint_b",

  // Browser B - Lista Branca (armazena chave pública VAPID dos emissores)
  LISTA_BRANCA: "lista_branca",

  // Browser B - Mensagens Recebidas
  MENSAGENS_RECEBIDAS: "mensagens_recebidas",
} as const;

// ============================================================
// INTERFACES
// ============================================================

export interface IdentidadeA {
  name: string;
  email: string;
  privateKey: CryptoKey;   // Agora é a chave privada VAPID (ECDSA P-256)
}

export interface BundleData {
  id: string;
  nomeReceptor: string;
  emailReceptor: string;
  bundle: any;            // O bundle completo (contém subscription, vapid, e2e)
  createdAt: number;
  updatedAt: number;
}

/**
 * Chaves E2E do Browser B – agora apenas RSA para criptografia.
 * A assinatura/verificação é feita com as chaves VAPID.
 */
export interface ChavesE2EB {
  privateDecrypt: CryptoKey;       // RSA privada para decifrar mensagens recebidas
  publicEncrypt: JsonWebKey;       // RSA pública para cifrar mensagens (enviada no bundle)
  // privateSign e publicSign foram removidos – usamos VAPID
}

export interface ChavesVapidB {
  publicKey: JsonWebKey;           // ECDSA P-256 pública
  privateKey: JsonWebKey;          // ECDSA P-256 privada (cifrada no bundle)
}

export interface SubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  vapidPublicKey?: JsonWebKey;     // Chave pública VAPID usada na subscription
  createdAt: number;
  updatedAt: number;
}

export interface MensagemEnvio {
  id: string;
  bundle: any;
  payloadText: string;             // JWT completo
  mensagemOriginal: string;
  destinatario: string;
  status: 'pendente' | 'enviando' | 'enviada' | 'falha';
  tentativas: number;
  maxTentativas: number;
  criadoEm: number;
  atualizadoEm: number;
  erro?: string;
}

export interface MensagemRecebida {
  id: string;
  remetente: string;
  remetenteEmail: string;
  titulo: string;
  conteudo: string;
  dadosJwt: any;                   // Payload do JWT (inclui 'publicKey' VAPID)
  publicKey?: JsonWebKey;          // Chave pública VAPID do emissor (para verificação)
  homologado?: boolean;
  assinaturaValida?: boolean;
  // Dados completos do emissor para resposta (inclui subscription, chaves públicas)
  emissorCompleto?: {
    nome: string;
    email: string;
    publicKeyEncrypt: JsonWebKey;  // RSA pública para cifrar resposta
    publicKeyVapid: JsonWebKey;    // Chave pública VAPID (para verificação)
    subscription?: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };
    // private VAPID não é armazenado aqui – está cifrado no bundle original
  };
  bundleEmissor?: {
    subscription: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };
    vapid: {
      subject: string;
      publicKey: JsonWebKey;      // pública VAPID
      privateKey: string;         // privada VAPID cifrada (para o servidor)
    };
    isVapidEncrypted: boolean;
    nome: string;
    email: string;
    publicKeyEncrypt: JsonWebKey;  // RSA pública para cifrar resposta
    publicKeyVapid: JsonWebKey;    // VAPID pública para verificação
  };
  status: 'nao_lida' | 'lida' | 'notificada';
  recebidoEm: number;
  lidaEm?: number;
  notificadaEm?: number;
}

export interface EmissorHomologado {
  email: string;
  name: string;
  jwk: JsonWebKey;   // Agora armazena a chave pública VAPID (ECDSA)
}
```

---

## Arquivo: `src/utils/db-helpers.ts`

```ts
// src/utils/db-helpers.ts
import { get, set, createStore, del, entries } from "idb-keyval";
import { 
  DB_NAMES, 
  STORE_NAMES, 
  KEY_NAMES, 
  IdentidadeA, 
  ChavesE2EB, 
  ChavesVapidB,
  SubscriptionData,
  BundleData,
  MensagemEnvio,
  MensagemRecebida,
  EmissorHomologado 
} from "../constants/db.ts";

// ============================================================
// Criação de Stores
// ============================================================

export function criarStore(nome: string) {
  return createStore(nome, STORE_NAMES.KEYVAL);
}

// Stores do Browser A
export const storeIdentidadeA = criarStore(DB_NAMES.IDENTIDADE_A);
export const storeFilaDisparosA = criarStore(DB_NAMES.FILA_A); // Legado
export const storeBundlesA = criarStore(DB_NAMES.BUNDLES_A);
export const storeMensagensEnvioA = criarStore(DB_NAMES.MENSAGENS_ENVIO_A); // 🔥 NOVO

// Stores do Browser B
export const storeChavesE2E = criarStore(DB_NAMES.CHAVES_E2E_B);
export const storeListaBranca = criarStore(DB_NAMES.LISTA_BRANCA_B);
export const storeChavesVapid = criarStore(DB_NAMES.CHAVES_VAPID_B);
export const storeSubscription = criarStore(DB_NAMES.SUBSCRIPTION_B);
export const storeMensagensRecebidasB = criarStore(DB_NAMES.MENSAGENS_RECEBIDAS_B); // 🔥 NOVO

// ============================================================
// Funções Genéricas
// ============================================================

export async function salvarChave<T>(store: IDBStore, key: string, value: T): Promise<void> {
  return set(key, value, store);
}

export async function buscarChave<T>(store: IDBStore, key: string): Promise<T | undefined> {
  return get(key, store);
}

export async function removerChave(store: IDBStore, key: string): Promise<void> {
  return del(key, store);
}

export async function listarChaves<T>(store: IDBStore): Promise<[string, T][]> {
  return entries(store) as Promise<[string, T][]>;
}

// ============================================================
// Funções Específicas - Browser A (Identidade)
// ============================================================

export async function salvarIdentidadeA(identidade: IdentidadeA): Promise<void> {
  await salvarChave(storeIdentidadeA, KEY_NAMES.IDENTIDADE_A, identidade);
}

export async function buscarIdentidadeA(): Promise<IdentidadeA | undefined> {
  return buscarChave<IdentidadeA>(storeIdentidadeA, KEY_NAMES.IDENTIDADE_A);
}

export async function salvarPublicKeyA(publicKeyJwk: JsonWebKey): Promise<void> {
  await salvarChave(storeIdentidadeA, KEY_NAMES.PUBLIC_KEY_A, publicKeyJwk);
}

export async function buscarPublicKeyA(): Promise<JsonWebKey | undefined> {
  return buscarChave<JsonWebKey>(storeIdentidadeA, KEY_NAMES.PUBLIC_KEY_A);
}

// ============================================================
// Funções Específicas - Browser A (Bundles)
// ============================================================

export async function salvarBundleAtivo(bundle: any): Promise<void> {
  const bundleData: BundleData = {
    id: `bundle_${Date.now()}`,
    nomeReceptor: bundle.e2e?.ownerName || "Desconhecido",
    emailReceptor: bundle.e2e?.ownerEmail || "Desconhecido",
    bundle: bundle,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await salvarChave(storeBundlesA, KEY_NAMES.BUNDLE_ATIVO, bundleData);
}

export async function buscarBundleAtivo(): Promise<BundleData | undefined> {
  return buscarChave<BundleData>(storeBundlesA, KEY_NAMES.BUNDLE_ATIVO);
}

export async function salvarBundleHistorico(bundle: any): Promise<void> {
  const bundleData: BundleData = {
    id: `bundle_${Date.now()}`,
    nomeReceptor: bundle.e2e?.ownerName || "Desconhecido",
    emailReceptor: bundle.e2e?.ownerEmail || "Desconhecido",
    bundle: bundle,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  const historico = await buscarChave<BundleData[]>(storeBundlesA, KEY_NAMES.BUNDLE_HISTORICO) || [];
  historico.push(bundleData);
  if (historico.length > 10) historico.shift();
  await salvarChave(storeBundlesA, KEY_NAMES.BUNDLE_HISTORICO, historico);
}

export async function buscarHistoricoBundles(): Promise<BundleData[]> {
  return await buscarChave<BundleData[]>(storeBundlesA, KEY_NAMES.BUNDLE_HISTORICO) || [];
}

export async function limparBundleAtivo(): Promise<void> {
  await removerChave(storeBundlesA, KEY_NAMES.BUNDLE_ATIVO);
}

// ============================================================
// Funções Específicas - Browser A (Mensagens de Envio)
// 🔥 NOVO
// ============================================================

export async function salvarMensagemEnvio(mensagem: MensagemEnvio): Promise<void> {
  await salvarChave(storeMensagensEnvioA, mensagem.id, mensagem);
}

export async function buscarMensagemEnvio(id: string): Promise<MensagemEnvio | undefined> {
  return buscarChave<MensagemEnvio>(storeMensagensEnvioA, id);
}

export async function buscarMensagensEnvioPorStatus(status: MensagemEnvio['status']): Promise<MensagemEnvio[]> {
  const todas = await listarMensagensEnvio();
  return todas.filter(m => m.status === status);
}

export async function listarMensagensEnvio(): Promise<MensagemEnvio[]> {
  const entries = await listarChaves<MensagemEnvio>(storeMensagensEnvioA);
  return entries.map(([_, msg]) => msg);
}

export async function atualizarStatusMensagemEnvio(id: string, status: MensagemEnvio['status'], erro?: string): Promise<void> {
  const mensagem = await buscarMensagemEnvio(id);
  if (mensagem) {
    mensagem.status = status;
    mensagem.atualizadoEm = Date.now();
    if (erro) mensagem.erro = erro;
    await salvarMensagemEnvio(mensagem);
  }
}

export async function removerMensagemEnvio(id: string): Promise<void> {
  await removerChave(storeMensagensEnvioA, id);
}

export async function limparMensagensEnvioAntigas(dias: number = 30): Promise<void> {
  const todas = await listarMensagensEnvio();
  const limite = Date.now() - (dias * 24 * 60 * 60 * 1000);
  for (const msg of todas) {
    if (msg.criadoEm < limite && msg.status === 'enviada') {
      await removerMensagemEnvio(msg.id);
    }
  }
}

// ============================================================
// Funções Específicas - Browser B (E2E)
// ============================================================

export async function salvarChavesE2EB(chaves: ChavesE2EB): Promise<void> {
  await salvarChave(storeChavesE2E, KEY_NAMES.CHAVES_E2E_B, chaves);
}

export async function buscarChavesE2EB(): Promise<ChavesE2EB | undefined> {
  return buscarChave<ChavesE2EB>(storeChavesE2E, KEY_NAMES.CHAVES_E2E_B);
}

export async function salvarPublicEncryptB(publicKey: JsonWebKey): Promise<void> {
  await salvarChave(storeChavesE2E, KEY_NAMES.PUBLIC_ENCRYPT_B, publicKey);
}

export async function buscarPublicEncryptB(): Promise<JsonWebKey | undefined> {
  return buscarChave<JsonWebKey>(storeChavesE2E, KEY_NAMES.PUBLIC_ENCRYPT_B);
}

export async function salvarPublicVerifyB(publicKey: JsonWebKey): Promise<void> {
  await salvarChave(storeChavesE2E, KEY_NAMES.PUBLIC_VERIFY_B, publicKey);
}

export async function buscarPublicVerifyB(): Promise<JsonWebKey | undefined> {
  return buscarChave<JsonWebKey>(storeChavesE2E, KEY_NAMES.PUBLIC_VERIFY_B);
}

// ============================================================
// Funções Específicas - Browser B (VAPID)
// ============================================================

export async function salvarChavesVapidB(chaves: ChavesVapidB): Promise<void> {
  await salvarChave(storeChavesVapid, KEY_NAMES.CHAVES_VAPID_B, chaves);
}

export async function buscarChavesVapidB(): Promise<ChavesVapidB | undefined> {
  return buscarChave<ChavesVapidB>(storeChavesVapid, KEY_NAMES.CHAVES_VAPID_B);
}

// ============================================================
// Funções Específicas - Browser B (Subscription)
// ============================================================

export async function salvarSubscriptionB(subscription: SubscriptionData): Promise<void> {
  await salvarChave(storeSubscription, KEY_NAMES.SUBSCRIPTION_B, subscription);
}

export async function buscarSubscriptionB(): Promise<SubscriptionData | undefined> {
  return buscarChave<SubscriptionData>(storeSubscription, KEY_NAMES.SUBSCRIPTION_B);
}

export async function salvarSubscriptionEndpointB(endpoint: string): Promise<void> {
  await salvarChave(storeSubscription, KEY_NAMES.SUBSCRIPTION_ENDPOINT_B, endpoint);
}

export async function buscarSubscriptionEndpointB(): Promise<string | undefined> {
  return buscarChave<string>(storeSubscription, KEY_NAMES.SUBSCRIPTION_ENDPOINT_B);
}

export async function removerSubscriptionB(): Promise<void> {
  await removerChave(storeSubscription, KEY_NAMES.SUBSCRIPTION_B);
  await removerChave(storeSubscription, KEY_NAMES.SUBSCRIPTION_ENDPOINT_B);
}

// ============================================================
// Funções Específicas - Browser B (Lista Branca)
// ============================================================

export async function salvarEmissorHomologado(email: string, emissor: EmissorHomologado): Promise<void> {
  await salvarChave(storeListaBranca, email, emissor);
}

export async function buscarEmissorHomologado(email: string): Promise<EmissorHomologado | undefined> {
  return buscarChave<EmissorHomologado>(storeListaBranca, email);
}

export async function listarEmissoresHomologados(): Promise<[string, EmissorHomologado][]> {
  return listarChaves<EmissorHomologado>(storeListaBranca);
}

// ============================================================
// Funções Específicas - Browser B (Mensagens Recebidas)
// 🔥 NOVO
// ============================================================

export async function salvarMensagemRecebida(mensagem: MensagemRecebida): Promise<void> {
  await salvarChave(storeMensagensRecebidasB, mensagem.id, mensagem);
}

export async function buscarMensagemRecebida(id: string): Promise<MensagemRecebida | undefined> {
  return buscarChave<MensagemRecebida>(storeMensagensRecebidasB, id);
}

export async function buscarMensagensRecebidasPorStatus(status: MensagemRecebida['status']): Promise<MensagemRecebida[]> {
  const todas = await listarMensagensRecebidas();
  return todas.filter(m => m.status === status);
}

export async function listarMensagensRecebidas(): Promise<MensagemRecebida[]> {
  const entries = await listarChaves<MensagemRecebida>(storeMensagensRecebidasB);
  return entries.map(([_, msg]) => msg);
}

export async function atualizarStatusMensagemRecebida(id: string, status: MensagemRecebida['status']): Promise<void> {
  const mensagem = await buscarMensagemRecebida(id);
  if (mensagem) {
    mensagem.status = status;
    if (status === 'lida') mensagem.lidaEm = Date.now();
    if (status === 'notificada') mensagem.notificadaEm = Date.now();
    await salvarMensagemRecebida(mensagem);
  }
}

export async function removerMensagemRecebida(id: string): Promise<void> {
  await removerChave(storeMensagensRecebidasB, id);
}

export async function limparMensagensRecebidasAntigas(dias: number = 30): Promise<void> {
  const todas = await listarMensagensRecebidas();
  const limite = Date.now() - (dias * 24 * 60 * 60 * 1000);
  for (const msg of todas) {
    if (msg.recebidoEm < limite && msg.status === 'lida') {
      await removerMensagemRecebida(msg.id);
    }
  }
}


const PERFIL_B_KEY = "perfil_b";

export async function salvarPerfilB(nome: string, email: string): Promise<void> {
  await salvarChave(storeChavesE2E, PERFIL_B_KEY, { nome, email, atualizadoEm: Date.now() });
}

export async function buscarPerfilB(): Promise<{ nome: string; email: string; atualizadoEm: number } | undefined> {
  return buscarChave(storeChavesE2E, PERFIL_B_KEY);
}
```

---

## Arquivo: `src/browser-c.tsx`

```tsx
// src/browser-c.tsx
// Browser C - Emissor e Receptor Unificado
// Reutiliza todos os IndexedDB existentes

import {
  // Browser A - Identidade
  storeIdentidadeA,
  salvarIdentidadeA,
  buscarIdentidadeA,
  salvarPublicKeyA,
  buscarPublicKeyA,
  
  // Browser A - Bundles
  storeBundlesA,
  salvarBundleAtivo,
  buscarBundleAtivo,
  salvarBundleHistorico,
  buscarHistoricoBundles,
  
  // Browser A - Mensagens de Envio
  storeMensagensEnvioA,
  salvarMensagemEnvio,
  buscarMensagensEnvioPorStatus,
  listarMensagensEnvio,
  atualizarStatusMensagemEnvio,
  removerMensagemEnvio,
  
  // Browser B - E2E
  storeChavesE2E,
  salvarChavesE2EB,
  buscarChavesE2EB,
  salvarPublicEncryptB,
  salvarPublicVerifyB,
  buscarPublicEncryptB,
  buscarPublicVerifyB,
  
  // Browser B - VAPID
  storeChavesVapid,
  salvarChavesVapidB,
  buscarChavesVapidB,
  
  // Browser B - Subscription
  storeSubscription,
  salvarSubscriptionB,
  buscarSubscriptionB,
  removerSubscriptionB,
  
  // Browser B - Lista Branca
  storeListaBranca,
  salvarEmissorHomologado,
  buscarEmissorHomologado,
  listarEmissoresHomologados,
  removerChave as removerEmissorHomologado,
  
  // Browser B - Mensagens Recebidas
  storeMensagensRecebidasB,
  salvarMensagemRecebida,
  listarMensagensRecebidas,
  atualizarStatusMensagemRecebida,
  removerMensagemRecebida,
  
  // Helpers de perfil
  salvarPerfilB,
  buscarPerfilB,
} from "./utils/db-helpers.ts";

import type {
  IdentidadeA,
  ChavesE2EB,
  ChavesVapidB,
  SubscriptionData,
  MensagemEnvio,
  MensagemRecebida,
  EmissorHomologado,
  BundleData,
} from "./constants/db.ts";

console.log("🟢 [SW-LOG-C] Arquivo browser-c.tsx carregado!");

// ============================================================
// UTILITÁRIOS
// ============================================================

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(buffer));
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
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

function copyToClipboard(id: string): void {
  const input = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
  if (input) {
    input.select();
    document.execCommand('copy');
    showToast("✅ Copiado para a área de transferência!", "success");
  }
}

// 🔥 Toast de notificação
function showToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  const colors = {
    success: '#d4edda',
    error: '#f8d7da',
    info: '#d1ecf1'
  };
  const textColors = {
    success: '#155724',
    error: '#721c24',
    info: '#0c5460'
  };
  
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; 
    background: ${colors[type]}; color: ${textColors[type]}; 
    padding: 12px 20px; border-radius: 6px; 
    border: 1px solid ${colors[type]};
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 9999; max-width: 400px;
    font-family: system-ui, sans-serif;
    animation: fadeInUp 0.3s ease;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================================
// FUNÇÕES DO BROWSER C (IDENTIDADE)
// ============================================================

async function gerarIdentidadeC(): Promise<void> {
  console.log("🚀 [SW-LOG-C] Gerando identidade...");
  
  const nameC = (document.getElementById('profileNameC') as HTMLInputElement).value;
  const emailC = (document.getElementById('profileEmailC') as HTMLInputElement).value;

  if (!nameC || !emailC) {
    showToast("Por favor, preencha seu Nome e E-mail.", "error");
    return;
  }

  try {
    const existente = await buscarIdentidadeA();
    if (existente) {
      if (!confirm(`Já existe uma identidade para "${existente.name}" <${existente.email}>. Deseja recriar?`)) {
        return;
      }
    }

    const keyPair = await window.crypto.subtle.generateKey(
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
      name: nameC,
      email: emailC,
      privateKey: keyPair.privateKey
    };
    await salvarIdentidadeA(identidade);

    const publicSignJwk = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const extendedJwk = { ...publicSignJwk, ownerName: nameC, ownerEmail: emailC };
    await salvarPublicKeyA(extendedJwk);

    await salvarPerfilB(nameC, emailC);

    const textarea = document.getElementById('myPublicKeyC') as HTMLTextAreaElement;
    if (textarea) {
      textarea.value = JSON.stringify(extendedJwk);
    }

    console.log("✅ [SW-LOG-C] Identidade gerada e salva!");
    showToast("✅ Identidade gerada com sucesso!", "success");
    
    await carregarListaEmissores();
    await carregarHistoricoBundlesC();
  } catch (err) {
    console.error(err);
    showToast("❌ Falha ao gerar identidade: " + (err as Error).message, "error");
  }
}

// ============================================================
// FUNÇÕES DO BROWSER C (RECEPTOR - Browser B)
// ============================================================

async function generateVAPIDKeys(): Promise<CryptoKeyPair> {
  return await window.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
}

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

async function generateE2EEKeys() {
  console.log("🔑 [SW-LOG-C] Gerando chaves E2E...");
  
  const encryptionKeyPair = await window.crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([0x01, 0x00, 0x01]), hash: "SHA-256" },
    false, ["encrypt", "decrypt"]
  );

  const signatureKeyPair = await window.crypto.subtle.generateKey(
    { name: "RSA-PSS", modulusLength: 2048, publicExponent: new Uint8Array([0x01, 0x00, 0x01]), hash: "SHA-256" },
    false, ["sign", "verify"]
  );

  const publicEncryptJwk = await window.crypto.subtle.exportKey("jwk", encryptionKeyPair.publicKey);
  const publicSignJwk = await window.crypto.subtle.exportKey("jwk", signatureKeyPair.publicKey);

  const chavesE2E: ChavesE2EB = {
    privateDecrypt: encryptionKeyPair.privateKey,
    publicEncrypt: publicEncryptJwk,
    privateSign: signatureKeyPair.privateKey,
    publicSign: publicSignJwk,
  };
  await salvarChavesE2EB(chavesE2E);

  await salvarPublicEncryptB(publicEncryptJwk);
  await salvarPublicVerifyB(publicSignJwk);

  return { publicEncryptJwk, publicSignJwk };
}

async function registrarPushC(): Promise<void> {
  console.log("📡 [SW-LOG-C] Registrando para push...");
  
  const nomeC = (document.getElementById('profileNameC') as HTMLInputElement).value;
  const emailC = (document.getElementById('profileEmailC') as HTMLInputElement).value;

  if (!nomeC || !emailC) {
    showToast("Por favor, preencha seu Nome e E-mail primeiro.", "error");
    return;
  }

  try {
    const permissao = await Notification.requestPermission();
    if (permissao !== "granted") {
      showToast("⚠️ ERRO: Permissão de notificação negada.", "error");
      return;
    }

    const registration = await navigator.serviceWorker.register("./service-worker.js");
    await registration.update();
    await navigator.serviceWorker.ready;

    const resServerKey = await fetch("/api/server-public-key");
    const serverPublicKeyJwk = await resServerKey.json();

    // ============================================================
    // CHAVES VAPID
    // ============================================================
    let chavesVapidSalvas = await buscarChavesVapidB();
    let vapidKeyPair: CryptoKeyPair;
    let publicKeyJwk: JsonWebKey;
    let privateKeyJwk: JsonWebKey;

    if (chavesVapidSalvas) {
      console.log("📂 [SW-LOG-C] Chaves VAPID encontradas no IndexedDB");
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
      } catch {
        chavesVapidSalvas = undefined;
      }
    }

    if (!chavesVapidSalvas) {
      console.log("🔑 [SW-LOG-C] Gerando novas chaves VAPID...");
      vapidKeyPair = await generateVAPIDKeys();
      publicKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.publicKey);
      privateKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.privateKey);
      
      await salvarChavesVapidB({
        publicKey: publicKeyJwk,
        privateKey: privateKeyJwk
      });
    }

    const rawPublicKey = await window.crypto.subtle.exportKey("raw", vapidKeyPair.publicKey);

    // ============================================================
    // SUBSCRIPTION
    // ============================================================
    let existingSubscription = await registration.pushManager.getSubscription();
    let subscriptionValida = false;

    if (existingSubscription) {
      const subscriptionData = await buscarSubscriptionB();
      if (subscriptionData && subscriptionData.vapidPublicKey?.n === publicKeyJwk.n) {
        subscriptionValida = true;
        console.log("✅ [SW-LOG-C] Subscription reutilizada");
      } else {
        await existingSubscription.unsubscribe();
        await removerSubscriptionB();
        existingSubscription = null;
      }
    }

    if (!existingSubscription || !subscriptionValida) {
      console.log("📝 [SW-LOG-C] Criando nova subscription...");
      existingSubscription = await registration.pushManager.subscribe({
        applicationServerKey: new Uint8Array(rawPublicKey),
        userVisibleOnly: true
      });
    }

    const p256dhBuffer = existingSubscription.getKey('p256dh');
    const authBuffer = existingSubscription.getKey('auth');
    const customSubscriptionJson = {
      endpoint: existingSubscription.endpoint,
      keys: { p256dh: rawBufferToBase64Url(p256dhBuffer), auth: rawBufferToBase64Url(authBuffer) }
    };

    // ============================================================
    // CHAVES E2E
    // ============================================================
    let e2ePublicKeys = await buscarChavesE2EB();
    let publicEncryptJwk: JsonWebKey;
    let publicSignJwk: JsonWebKey;

    if (e2ePublicKeys) {
      publicEncryptJwk = e2ePublicKeys.publicEncrypt;
      publicSignJwk = e2ePublicKeys.publicSign;
    } else {
      const novasChaves = await generateE2EEKeys();
      publicEncryptJwk = novasChaves.publicEncryptJwk;
      publicSignJwk = novasChaves.publicSignJwk;
    }

    // ============================================================
    // SALVA SUBSCRIPTION
    // ============================================================
    const subscriptionData: SubscriptionData = {
      endpoint: existingSubscription.endpoint,
      keys: customSubscriptionJson.keys,
      vapidPublicKey: publicKeyJwk,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await salvarSubscriptionB(subscriptionData);

    // ============================================================
    // CRIPTOGRAFA E MONTA BUNDLE
    // ============================================================
    const privateKeyEncrypted = await criptografarChaveVapid(privateKeyJwk, serverPublicKeyJwk);

    const finalPayloadBundle = {
      subscription: customSubscriptionJson,
      vapid: {
        subject: `mailto:${emailC}`,
        publicKey: publicKeyJwk,
        privateKey: privateKeyEncrypted
      },
      isVapidEncrypted: true,
      e2e: {
        ownerName: nomeC,
        ownerEmail: emailC,
        browserB_PublicKeyEncrypt: publicEncryptJwk,
        browserB_PublicKeyVerify: publicSignJwk
      },
      payloadText: ""
    };

    const textarea = document.getElementById('myBundleC') as HTMLTextAreaElement;
    if (textarea) {
      textarea.value = JSON.stringify(finalPayloadBundle, null, 2);
    }

    await salvarBundleAtivo(finalPayloadBundle);
    await salvarBundleHistorico(finalPayloadBundle);

    console.log("✅ [SW-LOG-C] Registro concluído!");
    showToast("✅ Registro para push concluído!", "success");
    
    await carregarMensagensRecebidasC();
    await carregarMensagensEnviadasC();
    await carregarHistoricoBundlesC();
  } catch (err) {
    console.error(err);
    showToast("❌ Falha ao registrar: " + (err as Error).message, "error");
  }
}

// ============================================================
// FUNÇÕES DO BROWSER C (HOMOLOGAÇÃO - Lista Branca)
// ============================================================

async function homologarEmissorC(): Promise<void> {
  const rawJwk = (document.getElementById('senderPublicKeyC') as HTMLTextAreaElement).value;
  try {
    const jwkObject = JSON.parse(rawJwk);
    if (!jwkObject.ownerEmail || !jwkObject.ownerName) {
      throw new Error("JWK ausente de metadados de Perfil.");
    }
    
    await window.crypto.subtle.importKey("jwk", jwkObject, { name: "RSA-PSS", hash: "SHA-256" }, true, ["verify"]);

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

async function removerEmissorC(email: string): Promise<void> {
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
  const container = document.getElementById('listaEmissoresC');
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
      if (email) await removerEmissorC(email);
    });
  });
}

// ============================================================
// FUNÇÕES DO BROWSER C (HISTÓRICO DE BUNDLES)
// ============================================================

async function carregarHistoricoBundlesC(): Promise<void> {
  const container = document.getElementById('historicoBundlesC');
  if (!container) return;

  const historico = await buscarHistoricoBundles();
  
  if (historico.length === 0) {
    container.innerHTML = '<p style="color: #666; font-size: 14px;">Nenhum bundle salvo no histórico.</p>';
    return;
  }

  let html = '';
  // Mostra os mais recentes primeiro
  const reversed = [...historico].reverse();
  for (const item of reversed) {
    const data = new Date(item.createdAt).toLocaleString();
    html += `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-bottom: 1px solid #eee; font-size: 14px;">
        <span><strong>${item.nomeReceptor}</strong> &lt;${item.emailReceptor}&gt; <small style="color: #888;">${data}</small></span>
        <button class="btn-carregar-bundle btn-sm" data-bundle='${JSON.stringify(item.bundle).replace(/'/g, "&#39;")}' style="font-size: 11px; padding: 2px 8px; background: #006c4f; color: white; border: none; border-radius: 3px; cursor: pointer;">📂 Carregar</button>
      </div>
    `;
  }
  container.innerHTML = html;
  
  container.querySelectorAll('.btn-carregar-bundle').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const bundleStr = (e.currentTarget as HTMLButtonElement).dataset.bundle;
      if (bundleStr) {
        try {
          const bundle = JSON.parse(bundleStr);
          const textarea = document.getElementById('bundleDestinoC') as HTMLTextAreaElement;
          if (textarea) {
            textarea.value = JSON.stringify(bundle, null, 2);
            showToast("✅ Bundle carregado!", "success");
          }
        } catch {
          showToast("❌ Erro ao carregar bundle.", "error");
        }
      }
    });
  });
}

// ============================================================
// FUNÇÕES DO BROWSER C (ENVIO - Browser A)
// ============================================================

async function enviarMensagemC(): Promise<void> {
  console.log("🚀 [SW-LOG-C] Enviando mensagem...");
  
  const bundleRaw = (document.getElementById('bundleDestinoC') as HTMLTextAreaElement).value;
  const messageText = (document.getElementById('mensagemEnvioC') as HTMLTextAreaElement).value;

  if (!bundleRaw || !messageText) {
    showToast("Por favor, cole o bundle do destinatário e digite uma mensagem.", "error");
    return;
  }

  try {
    const bodyPayload = JSON.parse(bundleRaw);
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
      throw new Error("Identidade não localizada! Clique em 'Gerar Minha Identidade' primeiro.");
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

    await salvarMensagemEnvio(mensagem);
    console.log(`✅ [SW-LOG-C] Mensagem salva: ${mensagemId}`);

    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({
      type: 'ENVIAR_MENSAGEM',
      payload: mensagem
    });

    showToast(`✅ Mensagem enviada para o Service Worker!\nID: ${mensagemId}`, "success");
    
    (document.getElementById('mensagemEnvioC') as HTMLTextAreaElement).value = '';
    
    await carregarMensagensEnviadasC();
  } catch (err) {
    showToast(`❌ Erro: ${(err as Error).message}`, "error");
  }
}

// ============================================================
// FUNÇÕES DO BROWSER C (UI - Mensagens Recebidas)
// ============================================================

async function carregarMensagensRecebidasC(): Promise<void> {
  console.log("📬 [SW-LOG-C] Carregando mensagens recebidas...");
  
  const mensagens = await listarMensagensRecebidas();
  const container = document.getElementById('mensagensRecebidasC');
  
  if (!container) return;
  
  if (mensagens.length === 0) {
    container.innerHTML = '<p style="color: #666;">Nenhuma mensagem recebida.</p>';
    return;
  }
  
  mensagens.sort((a, b) => b.recebidoEm - a.recebidoEm);
  
  let html = '';
  for (const msg of mensagens) {
    const statusMap: Record<string, { emoji: string; label: string; classe: string }> = {
      'nao_lida': { emoji: '🟡', label: 'Não lida', classe: 'msg-item-nao-lida' },
      'notificada': { emoji: '🔔', label: 'Notificada', classe: 'msg-item-notificada' },
      'lida': { emoji: '✅', label: 'Lida', classe: 'msg-item-lida' },
    };
    const status = statusMap[msg.status] || { emoji: '❓', label: msg.status, classe: '' };
    const data = new Date(msg.recebidoEm).toLocaleString();
    
    html += `
      <div class="msg-item ${status.classe}" style="border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin-bottom: 8px; background: ${msg.status === 'nao_lida' ? '#fffde7' : '#f9f9f9'};">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
          <strong>${status.emoji} ${msg.remetente}</strong>
          <small style="color: #888;">${data}</small>
        </div>
        <p style="margin: 5px 0;">${msg.conteudo}</p>
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <span style="font-size: 12px; color: #666;">Status: <strong>${status.label}</strong></span>
          <div>
            ${msg.status === 'nao_lida' || msg.status === 'notificada' ? 
              `<button class="btn-marcar-lida-c btn-sm" data-id="${msg.id}" style="font-size: 12px; padding: 2px 8px; background: #006c4f; color: white; border: none; border-radius: 3px; cursor: pointer;">📖 Marcar como lida</button>` : 
              ''
            }
            <button class="btn-remover-recebida-c btn-sm danger" data-id="${msg.id}" style="font-size: 12px; padding: 2px 8px; background: #cc0000; color: white; border: none; border-radius: 3px; cursor: pointer;">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }
  
  container.innerHTML = html;
  
  container.querySelectorAll('.btn-marcar-lida-c').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = (e.currentTarget as HTMLButtonElement).dataset.id;
      if (id) {
        await atualizarStatusMensagemRecebida(id, 'lida');
        await carregarMensagensRecebidasC();
      }
    });
  });
  
  container.querySelectorAll('.btn-remover-recebida-c').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = (e.currentTarget as HTMLButtonElement).dataset.id;
      if (id && confirm('Remover esta mensagem?')) {
        await removerMensagemRecebida(id);
        await carregarMensagensRecebidasC();
      }
    });
  });
}

async function removerMensagensLidasC(): Promise<void> {
  if (!confirm('Remover todas as mensagens lidas?')) return;
  
  const mensagens = await listarMensagensRecebidas();
  const lidas = mensagens.filter(m => m.status === 'lida');
  
  for (const msg of lidas) {
    await removerMensagemRecebida(msg.id);
  }
  
  await carregarMensagensRecebidasC();
  showToast(`✅ ${lidas.length} mensagens removidas.`, "success");
}

// ============================================================
// FUNÇÕES DO BROWSER C (UI - Mensagens Enviadas)
// ============================================================

async function carregarMensagensEnviadasC(): Promise<void> {
  console.log("📤 [SW-LOG-C] Carregando mensagens enviadas...");
  
  const mensagens = await listarMensagensEnvio();
  const container = document.getElementById('mensagensEnviadasC');
  
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
            <span style="font-size: 12px;">Status: <strong>${status.label}</strong></span>
            ${msg.tentativas > 0 ? `<span style="font-size: 12px; color: #666; margin-left: 8px;">Tentativas: ${msg.tentativas}</span>` : ''}
          </div>
          ${msg.status === 'enviada' || msg.status === 'falha' ? 
            `<button class="btn-remover-enviada-c btn-sm danger" data-id="${msg.id}" style="font-size: 12px; padding: 2px 8px; background: #cc0000; color: white; border: none; border-radius: 3px; cursor: pointer;">🗑️</button>` : 
            ''
          }
        </div>
        ${msg.erro ? `<div style="font-size: 12px; color: #cc0000; margin-top: 4px;">Erro: ${msg.erro}</div>` : ''}
      </div>
    `;
  }
  
  container.innerHTML = html;
  
  container.querySelectorAll('.btn-remover-enviada-c').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = (e.currentTarget as HTMLButtonElement).dataset.id;
      if (id && confirm('Remover esta mensagem do histórico?')) {
        await removerMensagemEnvio(id);
        await carregarMensagensEnviadasC();
      }
    });
  });
}

async function limparMensagensEnviadasC(): Promise<void> {
  if (!confirm('Remover todas as mensagens enviadas do histórico?')) return;
  
  const mensagens = await listarMensagensEnvio();
  const enviadas = mensagens.filter(m => m.status === 'enviada' || m.status === 'falha');
  
  for (const msg of enviadas) {
    await removerMensagemEnvio(msg.id);
  }
  
  await carregarMensagensEnviadasC();
  showToast(`✅ ${enviadas.length} mensagens removidas.`, "success");
}

// ============================================================
// FUNÇÕES DO BROWSER C (CARREGAMENTO INICIAL)
// ============================================================

async function carregarDadosIniciaisC(): Promise<void> {
  console.log("📂 [SW-LOG-C] Carregando dados iniciais...");
  
  try {
    const identidade = await buscarIdentidadeA();
    if (identidade) {
      (document.getElementById('profileNameC') as HTMLInputElement).value = identidade.name;
      (document.getElementById('profileEmailC') as HTMLInputElement).value = identidade.email;
      
      const publicKeyJwk = await buscarPublicKeyA();
      if (publicKeyJwk) {
        (document.getElementById('myPublicKeyC') as HTMLTextAreaElement).value = JSON.stringify(publicKeyJwk);
      }
    }
    
    const bundleData = await buscarBundleAtivo();
    if (bundleData) {
      (document.getElementById('myBundleC') as HTMLTextAreaElement).value = JSON.stringify(bundleData.bundle, null, 2);
    }
    
    await carregarListaEmissores();
    await carregarHistoricoBundlesC();
    await carregarMensagensRecebidasC();
    await carregarMensagensEnviadasC();
    
    console.log("✅ [SW-LOG-C] Dados iniciais carregados!");
  } catch (err) {
    console.warn("⚠️ [SW-LOG-C] Erro ao carregar dados iniciais:", err);
  }
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
// EVENT LISTENERS
// ============================================================

window.addEventListener("DOMContentLoaded", async () => {
  console.log("📄 [SW-LOG-C] DOM carregado, inicializando...");
  
  initTabs();
  await carregarDadosIniciaisC();
  
  // ============================================================
  // BOTÕES - IDENTIDADE E REGISTRO
  // ============================================================
  
  document.getElementById('btnGerarIdentidade')?.addEventListener('click', gerarIdentidadeC);
  document.getElementById('btnRegistrarPush')?.addEventListener('click', registrarPushC);
  
  // ============================================================
  // BOTÕES - HOMOLOGAÇÃO
  // ============================================================
  
  document.getElementById('btnSaveSenderC')?.addEventListener('click', homologarEmissorC);
  
  // ============================================================
  // BOTÕES - ENVIO
  // ============================================================
  
  document.getElementById('btnEnviarC')?.addEventListener('click', enviarMensagemC);
  
  // ============================================================
  // BOTÕES - MENSAGENS RECEBIDAS
  // ============================================================
  
  document.getElementById('btnCarregarRecebidasC')?.addEventListener('click', carregarMensagensRecebidasC);
  document.getElementById('btnLimparLidasC')?.addEventListener('click', removerMensagensLidasC);
  
  // ============================================================
  // BOTÕES - MENSAGENS ENVIADAS
  // ============================================================
  
  document.getElementById('btnCarregarEnviadasC')?.addEventListener('click', carregarMensagensEnviadasC);
  document.getElementById('btnLimparEnviadasC')?.addEventListener('click', limparMensagensEnviadasC);
  
  // ============================================================
  // COPY BUTTONS
  // ============================================================
  
  document.querySelectorAll('.copy-btn').forEach((button) => {
    button.addEventListener('click', (event) => {
      const targetId = (event.currentTarget as HTMLButtonElement).getAttribute('data-target');
      if (targetId) copyToClipboard(targetId);
    });
  });
  
  // ============================================================
  // SERVICE WORKER MESSAGES
  // ============================================================
  
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'PUSH_RECEIVED') {
      console.log('📬 [SW-LOG-C] Push recebido, recarregando mensagens...');
      const nome = event.data.payload?.title || 'Remetente';
      showToast(`📩 Nova mensagem de ${nome}!`, "info");
      setTimeout(carregarMensagensRecebidasC, 1000);
    }
    if (event.data?.type === 'MENSAGEM_ENVIADA') {
      console.log('📤 [SW-LOG-C] Mensagem enviada, atualizando lista...');
      setTimeout(carregarMensagensEnviadasC, 500);
    }
  });
});
```

---

## Arquivo: `src/browser-c.html`

```html
<!-- src/browser-c.html -->
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Browser C - Emissor e Receptor Unificado</title>
    <link rel="manifest" href="/manifest.json">
    <style>
      body { font-family: system-ui, sans-serif; padding: 20px; color: #333; max-width: 900px; margin: 0 auto; }
      .container { background: #f4f4f4; padding: 15px; border-radius: 6px; margin-bottom: 20px; box-sizing: border-box; }
      .container-receptor { border-left: 5px solid #006c4f; }
      .container-emissor { border-left: 5px solid #002b3d; }
      textarea, input[type="text"] { width: 100%; max-width: 100%; padding: 8px; box-sizing: border-box; margin-bottom: 8px; font-family: monospace; }
      button { padding: 10px 16px; font-weight: bold; background-color: #006c4f; color: white; border: none; border-radius: 4px; cursor: pointer; margin-bottom: 10px; }
      button:hover { background-color: #004d3f; }
      button.send-btn { background-color: #002b3d; width: 100%; padding: 12px; font-size: 16px; margin-top: 10px; }
      button.send-btn:hover { background-color: #001a26; }
      button.danger { background-color: #cc0000; }
      button.danger:hover { background-color: #990000; }
      label { font-weight: bold; display: block; margin-top: 5px; }
      .row { display: flex; gap: 20px; flex-wrap: wrap; }
      .col { flex: 1; min-width: 300px; }
      .btn-sm { padding: 4px 12px; font-size: 12px; margin-bottom: 0; }
      .mt-10 { margin-top: 10px; }
      .mb-10 { margin-bottom: 10px; }
      .flex { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
      .flex-end { display: flex; gap: 8px; align-items: center; }
      .msg-item { border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin-bottom: 8px; }
      .msg-item-nao-lida { background: #fffde7; }
      .msg-item-notificada { background: #e3f2fd; }
      .msg-item-lida { background: #f9f9f9; }
      .msg-item-enviada { background: #e8f5e9; }
      .msg-item-pendente { background: #fff8e1; }
      .msg-item-falha { background: #ffebee; }
      .tabs { display: flex; gap: 4px; margin-bottom: 10px; flex-wrap: wrap; }
      .tab { padding: 8px 16px; background: #e0e0e0; border: none; border-radius: 4px 4px 0 0; cursor: pointer; font-weight: bold; }
      .tab.active { background: #006c4f; color: white; }
      .tab-content { display: none; }
      .tab-content.active { display: block; }
      .historico-item { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-bottom: 1px solid #eee; font-size: 14px; }
      .historico-item:hover { background: #f0f0f0; }
    </style>
  </head>
  <body>
    <h1>🌐 Browser C - Emissor e Receptor Unificado</h1>
    <p style="color: #666; margin-bottom: 20px;">Uma única interface para enviar e receber mensagens push com segurança.</p>

    <!-- ============================================================ -->
    <!-- PERFIL UNIFICADO                                               -->
    <!-- ============================================================ -->
    <div class="container" style="border-left: 5px solid #6c4f00; background: #fcf8e8;">
      <h2>👤 Perfil Unificado</h2>
      <div class="row">
        <div class="col">
          <label for="profileNameC">Seu Nome:</label>
          <input type="text" id="profileNameC" value="Charlie" />
        </div>
        <div class="col">
          <label for="profileEmailC">Seu E-mail:</label>
          <input type="text" id="profileEmailC" value="charlie@example.com" />
        </div>
      </div>
      <div class="row">
        <div class="col">
          <button id="btnGerarIdentidade" style="width: 100%;">🔑 Gerar Minha Identidade (Chaves)</button>
        </div>
        <div class="col">
          <button id="btnRegistrarPush" style="width: 100%; background-color: #6c4f00;">📡 Registrar para Push</button>
        </div>
      </div>
      <div class="row mt-10">
        <div class="col">
          <label for="myPublicKeyC">Minha Chave Pública (copie para homologar em outros Browsers):</label>
          <textarea id="myPublicKeyC" rows="3" readonly placeholder="Clique em 'Gerar Minha Identidade' primeiro..."></textarea>
          <button class="copy-btn btn-sm" data-target="myPublicKeyC">📋 Copiar Chave Pública</button>
        </div>
      </div>
      <div class="row mt-10">
        <div class="col">
          <label for="myBundleC">Meu Bundle Unificado (copie e cole no Browser A para receber mensagens):</label>
          <textarea id="myBundleC" rows="4" readonly placeholder="Clique em 'Registrar para Push' primeiro..."></textarea>
          <button class="copy-btn btn-sm" data-target="myBundleC">📋 Copiar Bundle</button>
        </div>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- GUIA: RECEBER MENSAGENS (Browser B)                           -->
    <!-- ============================================================ -->
    <div class="container container-receptor">
      <h2>📥 Receber Mensagens (como Browser B)</h2>
      
      <div class="tabs">
        <button class="tab active" data-tab="homologar">🛡️ Homologar Emissores</button>
        <button class="tab" data-tab="mensagens-recebidas">📬 Mensagens Recebidas</button>
      </div>

      <!-- Tab: Homologar Emissores -->
      <div id="tab-homologar" class="tab-content active">
        <label for="senderPublicKeyC">Cole aqui a Chave Pública de Assinatura do Emissor (Browser A ou outro):</label>
        <textarea id="senderPublicKeyC" rows="3" placeholder='{"kty":"RSA","n":"...","e":"...","ownerName":"...","ownerEmail":"..."}'></textarea>
        <button id="btnSaveSenderC">✅ Autorizar e Salvar Emissor</button>
        
        <div class="mt-10">
          <label>Emissores Autorizados:</label>
          <div id="listaEmissoresC" style="max-height: 150px; overflow-y: auto; background: white; padding: 10px; border-radius: 4px; border: 1px solid #ddd;">
            <p style="color: #666; font-size: 14px;">Nenhum emissor homologado ainda.</p>
          </div>
        </div>
      </div>

      <!-- Tab: Mensagens Recebidas -->
      <div id="tab-mensagens-recebidas" class="tab-content">
        <div class="flex mb-10">
          <span><strong>📬 Mensagens Recebidas</strong></span>
          <div class="flex-end">
            <button id="btnCarregarRecebidasC" class="btn-sm">🔄 Atualizar</button>
            <button id="btnLimparLidasC" class="btn-sm danger">🗑️ Remover Lidas</button>
          </div>
        </div>
        <div id="mensagensRecebidasC">
          <p style="color: #666;">Nenhuma mensagem recebida ainda.</p>
        </div>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- GUIA: ENVIAR MENSAGENS (Browser A)                            -->
    <!-- ============================================================ -->
    <div class="container container-emissor">
      <h2>📤 Enviar Mensagens (como Browser A)</h2>
      
      <div class="tabs">
        <button class="tab active" data-tab="enviar">✉️ Enviar Nova Mensagem</button>
        <button class="tab" data-tab="mensagens-enviadas">📤 Histórico de Envio</button>
        <button class="tab" data-tab="historico-bundles">📦 Histórico de Bundles</button>
      </div>

      <!-- Tab: Enviar Nova Mensagem -->
      <div id="tab-enviar" class="tab-content active">
        <label for="bundleDestinoC">1. Cole o Bundle do Destinatário (gerado pelo Browser B/C):</label>
        <textarea id="bundleDestinoC" rows="4" placeholder="Cole aqui o bundle unificado do destinatário..."></textarea>
        
        <label for="mensagemEnvioC">2. Digite a Mensagem:</label>
        <textarea id="mensagemEnvioC" rows="3" placeholder="Escreva sua mensagem aqui..."></textarea>
        
        <button id="btnEnviarC" class="send-btn">🚀 Enviar Notificação</button>
      </div>

      <!-- Tab: Mensagens Enviadas -->
      <div id="tab-mensagens-enviadas" class="tab-content">
        <div class="flex mb-10">
          <span><strong>📤 Mensagens Enviadas</strong></span>
          <div class="flex-end">
            <button id="btnCarregarEnviadasC" class="btn-sm">🔄 Atualizar</button>
            <button id="btnLimparEnviadasC" class="btn-sm danger">🗑️ Limpar Enviadas</button>
          </div>
        </div>
        <div id="mensagensEnviadasC">
          <p style="color: #666;">Nenhuma mensagem enviada ainda.</p>
        </div>
      </div>

      <!-- Tab: Histórico de Bundles -->
      <div id="tab-historico-bundles" class="tab-content">
        <div class="flex mb-10">
          <span><strong>📦 Bundles Salvos (últimos 10)</strong></span>
          <button id="btnAtualizarHistoricoBundles" class="btn-sm">🔄 Atualizar</button>
        </div>
        <div id="historicoBundlesC" style="max-height: 200px; overflow-y: auto; background: white; padding: 10px; border-radius: 4px; border: 1px solid #ddd;">
          <p style="color: #666; font-size: 14px;">Nenhum bundle salvo no histórico.</p>
        </div>
      </div>
    </div>

    <script src="./browser-c.tsx" type="module"></script>
  </body>
</html>
```

---

## Arquivo: `src/browser-b.tsx`

```tsx
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
// CRIPTOGRAFIA DA CHAVE VAPID (para o servidor) - CORRIGIDA
// ============================================================
async function criptografarChaveVapid(
  privateKeyJwk: JsonWebKey,
  serverPublicKeyJwk: JsonWebKey
): Promise<string> {
  // Importação com hash como string
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
  // 🔥 Operação de cifragem sem hash (a chave já contém o hash)
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
  return await window.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
}

// ============================================================
// FUNÇÃO GERAR MEU BUNDLE
// ============================================================
async function gerarMeuBundle(): Promise<any> {
  console.log("📦 Gerando bundle do Browser B...");
  const nomeB = (document.getElementById('profileNameB') as HTMLInputElement).value;
  const emailB = (document.getElementById('profileEmailB') as HTMLInputElement).value;

  if (!nomeB || !emailB) {
    throw new Error("Preencha Nome e E-mail primeiro.");
  }

  try {
    const resServerKey = await fetch("/api/server-public-key");
    const serverPublicKeyJwk = await resServerKey.json();

    // Chaves VAPID
    let chavesVapidSalvas = await buscarChavesVapidB();
    let vapidKeyPair: CryptoKeyPair;
    let publicKeyJwk: JsonWebKey;
    let privateKeyJwk: JsonWebKey;

    if (chavesVapidSalvas) {
      console.log("📂 Chaves VAPID encontradas");
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
      } catch {
        chavesVapidSalvas = undefined;
      }
    }

    if (!chavesVapidSalvas) {
      console.log("🔑 Gerando novas chaves VAPID...");
      vapidKeyPair = await generateVAPIDKeys();
      publicKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.publicKey);
      privateKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.privateKey);
      await salvarChavesVapidB({ publicKey: publicKeyJwk, privateKey: privateKeyJwk });
    }

    // Subscription
    const registration = await navigator.serviceWorker.ready;
    let existingSubscription = await registration.pushManager.getSubscription();
    let subscriptionValida = false;

    if (existingSubscription) {
      const subscriptionData = await buscarSubscriptionB();
      if (subscriptionData && subscriptionData.vapidPublicKey?.n === publicKeyJwk.n) {
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
    const customSubscriptionJson = {
      endpoint: existingSubscription.endpoint,
      keys: {
        p256dh: rawBufferToBase64Url(p256dhBuffer),
        auth: rawBufferToBase64Url(authBuffer)
      }
    };

    // Chaves E2E (RSA para criptografia)
    let e2ePublicKeys = await buscarChavesE2EB();
    let publicEncryptJwk: JsonWebKey;

    if (e2ePublicKeys && e2ePublicKeys.publicEncrypt) {
      publicEncryptJwk = e2ePublicKeys.publicEncrypt;
    } else {
      const novasChaves = await generateE2EEKeys();
      publicEncryptJwk = novasChaves.publicEncryptJwk;
    }

    // Salvar subscription
    const subscriptionData: SubscriptionData = {
      endpoint: existingSubscription.endpoint,
      keys: customSubscriptionJson.keys,
      vapidPublicKey: publicKeyJwk,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await salvarSubscriptionB(subscriptionData);

    // Cifrar chave privada VAPID
    const privateKeyEncrypted = await criptografarChaveVapid(privateKeyJwk, serverPublicKeyJwk);

    // Salvar IDENTIDADE usando a chave privada VAPID
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
    }

    // Montar bundle
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

    return bundle;
  } catch (err) {
    console.error("❌ Erro ao gerar bundle:", err);
    throw err;
  }
}

// ============================================================
// FUNÇÃO ENVIAR MENSAGEM – CORRIGIDA (hash string, encrypt sem hash)
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

    // 🔥 Importação com hash como string
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

    const encoder = new TextEncoder();
    const mensagemObj = {
      m: { t: titulo, c: conteudo },
      e: {
        sub: subscription ? {
          endpoint: subscription.endpoint,
          keys: subscription.keys
        } : undefined,
        pe: publicKeyEncrypt,
        pv: publicVapid
      }
    };

    const mensagemBytes = encoder.encode(JSON.stringify(mensagemObj));
    const compressed = gzipSync(mensagemBytes);

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

    // 🔥 Operação de cifragem SEM hash (a chave já o contém)
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

    // 2. Assinar JWT com ECDSA (chave VAPID)
    const identidade = await buscarIdentidadeA();
    if (!identidade) throw new Error("Identidade não encontrada.");

    const header = { alg: "ES256", typ: "JWT" };
    const payload = {
      iss: identidade.email,
      sub: e2eConfig.ownerEmail,
      ct: envelopeJson,
      publicKey: publicVapid
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

    // 3. Salvar e enviar
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

    await salvarMensagemEnvio(mensagem);
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage({ type: 'ENVIAR_MENSAGEM', payload: mensagem });

    showToast(`✅ Mensagem enviada! ID: ${msgId}`, "success");
    (document.getElementById('mensagemEnvioB') as HTMLTextAreaElement).value = '';
    (document.getElementById('tituloMensagemB') as HTMLInputElement).value = 'Nova mensagem';
    await carregarMensagensEnviadasB();

  } catch (err) {
    console.error(err);
    showToast(`❌ Erro: ${(err as Error).message}`, "error");
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
// MENSAGENS RECEBIDAS
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

  container.querySelectorAll('.btn-responder-msg').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const msgId = (e.currentTarget as HTMLButtonElement).dataset.msgid;
      if (msgId) {
        const mensagem = await buscarMensagemRecebida(msgId);
        const emissorData = mensagem.emissorCompleto || mensagem.bundleEmissor || mensagem.dadosJwt?.emissor;
        if (emissorData && emissorData.subscription && emissorData.publicKeyEncrypt) {
          // Construir bundle para resposta
          const bundleData = {
            subscription: emissorData.subscription,
            vapid: emissorData.vapid || {
              subject: `mailto:${emissorData.email || mensagem.remetenteEmail}`,
              publicKey: emissorData.publicKeyVapid || mensagem.publicKey
            },
            isVapidEncrypted: true,
            e2e: {
              ownerName: emissorData.nome || mensagem.remetente,
              ownerEmail: emissorData.email || mensagem.remetenteEmail,
              browserB_PublicKeyEncrypt: emissorData.publicKeyEncrypt
            },
            payloadText: ""
          };
          const bundleTextarea = document.getElementById('bundleDestinoB') as HTMLTextAreaElement;
          if (bundleTextarea) {
            bundleTextarea.value = JSON.stringify(bundleData, null, 2);
            showToast(`✅ Bundle de ${mensagem.remetente} carregado para resposta!`, "success");
            document.querySelector('.container-emissor')?.scrollIntoView({ behavior: 'smooth' });
          }
        } else {
          showToast("❌ Este emissor não possui dados para responder (sem push configurado).", "error");
        }
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
    try {
      const bundle = await gerarMeuBundle();
      (document.getElementById('unifiedBundle') as HTMLTextAreaElement).value = JSON.stringify(bundle, null, 2);
      const pk = await buscarPublicKeyA();
      if (pk) {
        (document.getElementById('myPublicKeyB') as HTMLTextAreaElement).value = JSON.stringify(pk);
      }
      showToast("Bundle gerado com sucesso!", "success");
      await carregarListaEmissores();
    } catch (e) {
      showToast("Erro: " + (e as Error).message, "error");
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
```

---

## Arquivo: `deno.json`

```json
{
  "extends": "../../deno.json",
  "imports": {
    "@negrel/webpush": "jsr:@negrel/webpush@^0.5.0"
  },
  "tasks": {
    "build": "deno run --allow-read --allow-write --allow-env --allow-net --unstable-bundle --env-file build.ts",
    "start": "deno run --allow-read --allow-write --allow-env --allow-net --env-file main.ts",
    "dev": "deno run --allow-read --allow-write --allow-env --allow-net --env-file --watch main.ts",
    "clean": "rm -rf dist && mkdir -p dist",
    "export": "deno run --allow-read --allow-write export.ts"
  },
  "exclude": ["dist/", "public/"]
}

```

---

