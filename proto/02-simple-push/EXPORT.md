> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém múltiplos arquivos do meu projeto estruturados em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Analise a estrutura de pastas, as dependências e o código fornecido para indicar as mudanças necessárias para a implementação das novas funcionalidades discutidas.
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo e não somente as partes que devem ser modificadas.

---

# Código Fonte Selecionado do Projeto

Gerado automaticamente em: 7/30/2026, 7:20:08 PM

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

      // Executa a auditoria cega das claims do token JWT
      const jwtClaims = lerMetadadosJJWT(payloadText);
      if (jwtClaims) {
        console.log(`   - [AUDITORIA JWT] Emitido por: ${jwtClaims.name || "Desconhecido"} <${jwtClaims.iss || "Sem e-mail"}>`);
        console.log(`   - [AUDITORIA JWT] Destinado a: <${jwtClaims.sub || "Sem e-mail"}>`);
        console.log(`   - [AUDITORIA JWT] Texto E2EE Criptografado (Hex): ${jwtClaims.cipherText?.substring(0, 20) || "N/A"}...`);
      }

      let privateKeyFinal = vapid.privateKey;

      // 🔥 DESCRIPTOGRAFIA DA CHAVE PRIVADA VAPID NA RAM
      if (isVapidEncrypted && typeof privateKeyFinal === "string") {
        console.log("   - [SEGURANÇA] Descriptografando Chave Privada VAPID com a RSA do Servidor...");
        const decryptedPrivateKeyObj = await decryptWithServerKey(privateKeyFinal);
        privateKeyFinal = decryptedPrivateKeyObj; 
      }

      // 1. Processa e normatiza as chaves do request
      const jwkKeys = parseVapidKeysToJwk(vapid.publicKey, privateKeyFinal);

      // 2. Importa a assinatura do cabeçalho de rede do push
      const vapidKeys = await webpush.importVapidKeys(jwkKeys);

      const appServer = await webpush.ApplicationServer.new({
        contactInformation: vapid.subject.startsWith("mailto:") ? vapid.subject : `mailto:${vapid.subject}`,
        vapidKeys: vapidKeys,
      });

      // 3. Encaminha o token JWT fechado diretamente sem descriptografar o conteúdo
      const subscriber = appServer.subscribe(subscription);
      await subscriber.pushTextMessage(payloadText, {});

      console.log("   ✅ [SUCESSO] Push despachado! Chave Privada VAPID descartada com segurança da RAM.");

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (error) {
      console.error(`\n❌ [ERRO NO SERVIDOR PUSH] [${new Date().toLocaleTimeString()}]:`);

      // Captura erros de rejeição remota das centrais de push (Google, Apple, Mozilla)
      // Verifica se é um erro de push com response
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

      // Erro interno/local - tratamento seguro de tipo unknown
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
      join(SRC_DIR, "browser-b.html")
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
    <title>Browser B - Gerador e Receptor Seguro</title>
    <link rel="manifest" href="/manifest.json">
    <style>
      body { font-family: system-ui, sans-serif; padding: 20px; color: #333; max-width: 800px; margin: 0 auto; }
      .container { background: #f4f4f4; padding: 15px; border-radius: 6px; margin-bottom: 20px; box-sizing: border-box; }
      textarea, input[type="text"] { width: 100%; max-width: 100%; padding: 8px; box-sizing: border-box; margin-bottom: 8px; font-family: monospace; }
      button { padding: 10px 16px; font-weight: bold; background-color: #006c4f; color: white; border: none; border-radius: 4px; cursor: pointer; margin-bottom: 15px; }
      button:hover { background-color: #004d3f; }
      label { font-weight: bold; display: block; margin-top: 5px; }
    </style>
  </head>
  <body>
    <h1>Browser B - Credenciais Unificadas e Identidade</h1>
    
    <!-- 1. BLOCO DE PERFIL DO RECEPTOR -->
    <div class="container">
      <h2>👤 Perfil do Receptor (Browser B)</h2>
      <label for="profileNameB">Nome do Dono do Canal:</label>
      <input type="text" id="profileNameB" value="Alice" />
      
      <label for="profileEmailB">E-mail de Contato VAPID:</label>
      <input type="text" id="profileEmailB" value="alice@example.com" />
      
      <button id="btnRegisterPush">Gerar Carga Unificada com Perfil</button>
    </div>

    <!-- 2. BANNER DE INSTALAÇÃO DO PWA (OPCIONAL/ATIVO) -->
    <button id="btnInstall" style="display: none; background-color: #002b3d; width: 100%;">
      ➕ Instalar Aplicativo no Dispositivo
    </button>

    <!-- 3. BLOCO DE CARGA UNIFICADA MASCARADA -->
    <div class="container">
      <h2>📦 Bloco Unificado de Configuração (JWT-Ready)</h2>
      <label for="unifiedBundle">Carga Unificada (Contém Chave VAPID Criptografada para o Servidor):</label>
      <textarea id="unifiedBundle" rows="10" readonly placeholder="Aguardando geração do perfil..."></textarea>
      <button class="copy-btn" data-target="unifiedBundle">Copiar Tudo de Uma Vez</button>
    </div>

    <!-- 4. BLOCO DE HOMOLOGAÇÃO DO EMISSOR (BROWSER A) -->
    <div class="container" style="border-left: 5px solid #006c4f;">
      <h2>🛡️ Homologação de Emissores Autorizados (Lista Branca)</h2>
      <label for="senderPublicKeyJson">Cole aqui a Chave Pública de Assinatura do Browser A (JWT-Ready):</label>
      <textarea id="senderPublicKeyJson" rows="4" placeholder='{"kty":"RSA","n":"...","e":"...","ownerName":"...","ownerEmail":"..."}'></textarea>
      
      <button id="btnSaveSenderIdentity">Autorizar e Salvar Emissor</button>
    </div>


<div class="container" style="border-left: 5px solid #ff6b00;">
  <h2>📬 Mensagens Recebidas</h2>
  <div id="mensagensRecebidas">
    <p style="color: #666;">Nenhuma mensagem recebida ainda.</p>
  </div>
  <button id="btnCarregarMensagens" style="background-color: #555; margin-top: 10px;">
    🔄 Carregar Mensagens
  </button>
  <button id="btnLimparLidas" style="background-color: #888; margin-top: 10px; margin-left: 10px;">
    🗑️ Remover Lidas
  </button>
</div>

    <!-- Ponto de entrada do script processado pelo Deno -->
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
  event.waitUntil(async () => {
    // Aguarda um pouco para garantir que tudo está pronto
    await new Promise(r => setTimeout(r, 1000));
    
    // Processa filas
    if (self.processarFilaEnvio) {
      await self.processarFilaEnvio();
    }
    if (self.processarFilaNotificacao) {
      await self.processarFilaNotificacao();
    }
  }());
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
      (document.getElementById('profileNameA') as HTMLInputElement).value = identidade.name;
      (document.getElementById('profileEmailA') as HTMLInputElement).value = identidade.email;
      console.log("✅ [SW-LOG-A] Identidade carregada do IndexedDB");
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
    
    // Envia a mensagem para o Service Worker processar
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

## Arquivo: `src/browser-b.tsx`

```tsx
// src/browser-b.tsx
import { set, createStore } from "idb-keyval";
import {
  storeChavesE2E,
  storeListaBranca,
  storeChavesVapid,
  storeSubscription,
  salvarChavesE2EB,
  buscarChavesE2EB,
  salvarPublicEncryptB,
  salvarPublicVerifyB,
  buscarPublicEncryptB,
  buscarPublicVerifyB,
  salvarChavesVapidB,
  buscarChavesVapidB,
  salvarSubscriptionB,
  buscarSubscriptionB,
  removerSubscriptionB,
  salvarEmissorHomologado,
  buscarEmissorHomologado,
} from "./utils/db-helpers.ts";
import type { ChavesE2EB, ChavesVapidB, SubscriptionData, EmissorHomologado } from "./constants/db.ts";

console.log("🟢 [SW-LOG] Arquivo browser-b.tsx carregado com bancos isolados por idb-keyval!");

function copyToClipboard(id: string): void {
  const input = document.getElementById(id) as HTMLInputElement;
  if (input) {
    input.select();
    document.execCommand('copy');
    alert("Conteúdo copiado com sucesso!");
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

// 🔥 Função para criptografar a chave VAPID com a chave pública do servidor
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
  console.log("🔑 [SW-LOG] Gerando chaves assimétricas de aplicação...");
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

// 🔥 Verifica se a subscription existente é válida
async function verificarSubscriptionValida(
  subscription: PushSubscription,
  vapidPublicKeyJwk: JsonWebKey
): Promise<boolean> {
  try {
    // Verifica se o endpoint ainda está ativo
    const p256dhBuffer = subscription.getKey('p256dh');
    const authBuffer = subscription.getKey('auth');
    
    if (!p256dhBuffer || !authBuffer) {
      console.log("🔍 [SW-LOG] Subscription inválida: chaves faltando");
      return false;
    }

    // Verifica se a VAPID é a mesma
    const subscriptionData = await buscarSubscriptionB();
    if (subscriptionData && subscriptionData.vapidPublicKey) {
      // Compara as chaves públicas (simplificado - poderia comparar o n e e)
      const currentN = vapidPublicKeyJwk.n;
      const storedN = subscriptionData.vapidPublicKey.n;
      
      if (currentN !== storedN) {
        console.log("🔍 [SW-LOG] Subscription de VAPID diferente, precisa recriar");
        return false;
      }
    }

    return true;
  } catch (err) {
    console.log("🔍 [SW-LOG] Erro ao verificar subscription:", err);
    return false;
  }
}

async function processarInscricaoComPerfil(): Promise<void> {
  const nomeB = (document.getElementById('profileNameB') as HTMLInputElement).value;
  const emailB = (document.getElementById('profileEmailB') as HTMLInputElement).value;

  if (!nomeB || !emailB) {
    alert("Por favor, preencha o Nome e o E-mail do perfil receptor.");
    return;
  }

  try {
    const permissao = await Notification.requestPermission();
    if (permissao !== "granted") {
      alert("⚠️ ERRO: Permissão de notificação negada.");
      return;
    }

    const registration = await navigator.serviceWorker.register("./service-worker.js");
    await registration.update();
    await navigator.serviceWorker.ready;

    // 🔥 Busca a chave pública do servidor
    const resServerKey = await fetch("/api/server-public-key");
    const serverPublicKeyJwk = await resServerKey.json();

    // ============================================================
    // 🔥 VERIFICA E CARREGA CHAVES VAPID EXISTENTES
    // ============================================================
    let chavesVapidSalvas = await buscarChavesVapidB();
    let vapidKeyPair: CryptoKeyPair;
    let publicKeyJwk: JsonWebKey;
    let privateKeyJwk: JsonWebKey;
    let chavesVapidGeradas = false;

    if (chavesVapidSalvas) {
      console.log("📂 [SW-LOG] Chaves VAPID encontradas no IndexedDB");
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
        console.log("✅ [SW-LOG] Chaves VAPID carregadas com sucesso");
      } catch (err) {
        console.warn("⚠️ [SW-LOG] Erro ao importar chaves VAPID salvas, recriando...", err);
        chavesVapidSalvas = undefined;
      }
    }

    if (!chavesVapidSalvas) {
      console.log("🔑 [SW-LOG] Gerando novas chaves VAPID...");
      vapidKeyPair = await generateVAPIDKeys();
      publicKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.publicKey);
      privateKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.privateKey);
      
      await salvarChavesVapidB({
        publicKey: publicKeyJwk,
        privateKey: privateKeyJwk
      });
      chavesVapidGeradas = true;
      console.log("✅ [SW-LOG] Novas chaves VAPID salvas no IndexedDB");
    }

    const rawPublicKey = await window.crypto.subtle.exportKey("raw", vapidKeyPair.publicKey);

    // ============================================================
    // 🔥 VERIFICA SUBSCRIPTION EXISTENTE
    // ============================================================
    let existingSubscription = await registration.pushManager.getSubscription();
    let subscriptionValida = false;

    if (existingSubscription) {
      console.log("📂 [SW-LOG] Subscription existente encontrada");
      subscriptionValida = await verificarSubscriptionValida(existingSubscription, publicKeyJwk);
      
      if (subscriptionValida) {
        console.log("✅ [SW-LOG] Subscription válida, reutilizando");
      } else {
        console.log("🔄 [SW-LOG] Subscription inválida, removendo e recriando");
        await existingSubscription.unsubscribe();
        await removerSubscriptionB();
        existingSubscription = null;
      }
    }

    // Só cria nova subscription se não houver uma válida
    if (!existingSubscription || !subscriptionValida) {
      console.log("📝 [SW-LOG] Criando nova subscription...");
      existingSubscription = await registration.pushManager.subscribe({
        applicationServerKey: new Uint8Array(rawPublicKey),
        userVisibleOnly: true
      });
      console.log("✅ [SW-LOG] Nova subscription criada");
    }

    const p256dhBuffer = existingSubscription.getKey('p256dh');
    const authBuffer = existingSubscription.getKey('auth');
    const customSubscriptionJson = {
      endpoint: existingSubscription.endpoint,
      keys: { p256dh: rawBufferToBase64Url(p256dhBuffer), auth: rawBufferToBase64Url(authBuffer) }
    };

    // ============================================================
    // 🔥 VERIFICA E CARREGA CHAVES E2E EXISTENTES
    // ============================================================
    let e2ePublicKeys = await buscarChavesE2EB();
    let publicEncryptJwk: JsonWebKey;
    let publicSignJwk: JsonWebKey;

    if (e2ePublicKeys) {
      console.log("📂 [SW-LOG] Chaves E2E encontradas no IndexedDB");
      publicEncryptJwk = e2ePublicKeys.publicEncrypt;
      publicSignJwk = e2ePublicKeys.publicSign;
      
      // Verifica se as chaves são válidas (tenta importar)
      try {
        await window.crypto.subtle.importKey(
          "jwk", publicEncryptJwk,
          { name: "RSA-OAEP", hash: "SHA-256" },
          true, ["encrypt"]
        );
        await window.crypto.subtle.importKey(
          "jwk", publicSignJwk,
          { name: "RSA-PSS", hash: "SHA-256" },
          true, ["verify"]
        );
        console.log("✅ [SW-LOG] Chaves E2E carregadas com sucesso");
      } catch (err) {
        console.warn("⚠️ [SW-LOG] Erro ao importar chaves E2E salvas, recriando...", err);
        e2ePublicKeys = undefined;
      }
    }

    if (!e2ePublicKeys) {
      console.log("🔑 [SW-LOG] Gerando novas chaves E2E...");
      const novasChaves = await generateE2EEKeys();
      publicEncryptJwk = novasChaves.publicEncryptJwk;
      publicSignJwk = novasChaves.publicSignJwk;
      console.log("✅ [SW-LOG] Novas chaves E2E salvas no IndexedDB");
    }

    // ============================================================
    // 🔥 SALVA SUBSCRIPTION NO INDEXEDDB
    // ============================================================
    const subscriptionData: SubscriptionData = {
      endpoint: existingSubscription.endpoint,
      keys: customSubscriptionJson.keys,
      vapidPublicKey: publicKeyJwk,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await salvarSubscriptionB(subscriptionData);
    console.log("✅ [SW-LOG] Subscription salva no IndexedDB");

    // ============================================================
    // 🔥 CRIPTOGRAFA A CHAVE PRIVADA VAPID
    // ============================================================
    console.log("🔐 [SW-LOG] Criptografando chave VAPID para o bundle...");
    const privateKeyEncrypted = await criptografarChaveVapid(privateKeyJwk, serverPublicKeyJwk);
    console.log("✅ [SW-LOG] Chave VAPID criptografada com sucesso!");

    // ============================================================
    // 🔥 MONTA O BUNDLE
    // ============================================================
    const finalPayloadBundle = {
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
        browserB_PublicKeyVerify: publicSignJwk
      },
      payloadText: ""
    };

    const textarea = document.getElementById('unifiedBundle') as HTMLTextAreaElement;
    if (textarea) {
      textarea.value = JSON.stringify(finalPayloadBundle, null, 2);
    }
    
    console.log("🚀 Carga híbrida gerada com sucesso via idb-keyval!");
    alert("✅ Carga unificada gerada com sucesso! Copie o JSON e cole no Browser A.");

  } catch (err) {
    console.error("❌ [SW-LOG] Erro:", err);
    alert("Falha: " + (err as Error).message);
  }
}

async function homologarEmissorJWT(): Promise<void> {
  const rawJwk = (document.getElementById('senderPublicKeyJson') as HTMLTextAreaElement).value;
  try {
    const jwkObject = JSON.parse(rawJwk);
    if (!jwkObject.ownerEmail || !jwkObject.ownerName) throw new Error("JWK ausente de metadados de Perfil.");
    await window.crypto.subtle.importKey("jwk", jwkObject, { name: "RSA-PSS", hash: "SHA-256" }, true, ["verify"]);

    const emissor: EmissorHomologado = {
      email: jwkObject.ownerEmail,
      name: jwkObject.ownerName,
      jwk: jwkObject
    };
    await salvarEmissorHomologado(jwkObject.ownerEmail, emissor);

    alert(`🛡️ Emissor "${jwkObject.ownerName}" cadastrado com sucesso via idb-keyval!`);
  } catch (err) {
    alert("Falha na validação: " + (err as Error).message);
  }
}

// ============================================================
// FUNÇÕES DE MENSAGENS RECEBIDAS
// ============================================================

// 🔥 Função para carregar mensagens recebidas
async function carregarMensagensRecebidas(): Promise<void> {
  console.log("📬 [SW-LOG] Carregando mensagens recebidas...");
  
  const {
    listarMensagensRecebidas,
    atualizarStatusMensagemRecebida,
  } = await import("./utils/db-helpers.ts");
  
  const mensagens = await listarMensagensRecebidas();
  const container = document.getElementById('mensagensRecebidas');
  
  if (!container) return;
  
  if (mensagens.length === 0) {
    container.innerHTML = '<p style="color: #666;">Nenhuma mensagem recebida.</p>';
    return;
  }
  
  // Ordena por data (mais recentes primeiro)
  mensagens.sort((a, b) => b.recebidoEm - a.recebidoEm);
  
  let html = '';
  for (const msg of mensagens) {
    const statusEmoji = msg.status === 'nao_lida' ? '🟡' : msg.status === 'notificada' ? '🔔' : '✅';
    const data = new Date(msg.recebidoEm).toLocaleString();
    
    html += `
      <div style="border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin-bottom: 8px; 
                  background: ${msg.status === 'nao_lida' ? '#fffde7' : '#f9f9f9'};">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong>${statusEmoji} ${msg.remetente}</strong>
          <small style="color: #888;">${data}</small>
        </div>
        <p style="margin: 5px 0;">${msg.conteudo}</p>
        <div style="display: flex; gap: 8px; margin-top: 5px;">
          <span style="font-size: 12px; color: #666;">Status: ${msg.status}</span>
          ${msg.status === 'nao_lida' || msg.status === 'notificada' ? 
            `<button class="btn-marcar-lida" data-id="${msg.id}" style="font-size: 12px; padding: 2px 8px; background: #006c4f; color: white; border: none; border-radius: 3px; cursor: pointer;">Marcar como lida</button>` : 
            ''
          }
          <button class="btn-remover-msg" data-id="${msg.id}" style="font-size: 12px; padding: 2px 8px; background: #cc0000; color: white; border: none; border-radius: 3px; cursor: pointer;">Remover</button>
        </div>
      </div>
    `;
  }
  
  container.innerHTML = html;
  
  // Event listeners para os botões
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
        const { removerMensagemRecebida } = await import("./utils/db-helpers.ts");
        await removerMensagemRecebida(id);
        await carregarMensagensRecebidas();
      }
    });
  });
}

// 🔥 Função para remover mensagens lidas
async function removerMensagensLidas(): Promise<void> {
  if (!confirm('Remover todas as mensagens lidas?')) return;
  
  const { listarMensagensRecebidas, removerMensagemRecebida } = await import("./utils/db-helpers.ts");
  const mensagens = await listarMensagensRecebidas();
  const lidas = mensagens.filter(m => m.status === 'lida');
  
  for (const msg of lidas) {
    await removerMensagemRecebida(msg.id);
  }
  
  await carregarMensagensRecebidas();
  alert(`✅ ${lidas.length} mensagens removidas.`);
}

// ============================================================
// EVENT LISTENER PRINCIPAL
// ============================================================

window.addEventListener("DOMContentLoaded", () => {
  // ============================================================
  // EVENTOS EXISTENTES
  // ============================================================
  
  const btnRegister = document.getElementById("btnRegisterPush");
  const btnSave = document.getElementById("btnSaveSenderIdentity");

  if (btnRegister) btnRegister.addEventListener("click", processarInscricaoComPerfil);
  if (btnSave) btnSave.addEventListener("click", homologarEmissorJWT);

  document.querySelectorAll(".copy-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      const targetId = (event.currentTarget as HTMLButtonElement).getAttribute("data-target");
      if (targetId) copyToClipboard(targetId);
    });
  });

  // ============================================================
  // EVENTOS DE MENSAGENS RECEBIDAS
  // ============================================================
  
  const btnCarregar = document.getElementById('btnCarregarMensagens');
  if (btnCarregar) {
    btnCarregar.addEventListener('click', carregarMensagensRecebidas);
  }

  const btnLimparLidas = document.getElementById('btnLimparLidas');
  if (btnLimparLidas) {
    btnLimparLidas.addEventListener('click', removerMensagensLidas);
  }

  // Carregar mensagens automaticamente ao iniciar
  carregarMensagensRecebidas();

  // Recarregar mensagens quando receber push (via postMessage)
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'PUSH_RECEIVED') {
      console.log('📬 [SW-LOG] Push recebido, recarregando mensagens...');
      setTimeout(carregarMensagensRecebidas, 1000);
    }
  });
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

## Arquivo: `src/sw/push.js`

```js
// src/sw/push.js
import { get, createStore } from "idb-keyval";

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
  DECRYPT_KEY: "minha_decript_key",
};

function criarStore(nome) {
  return createStore(nome, STORE_NAMES.KEYVAL);
}

const storeChavesE2E = criarStore(DB_NAMES.CHAVES_E2E_B);
const storeListaBranca = criarStore(DB_NAMES.LISTA_BRANCA_B);
const storeMensagensRecebidasB = criarStore(DB_NAMES.MENSAGENS_RECEBIDAS_B);

// 🔥 Função para salvar mensagem recebida no IndexedDB
async function salvarMensagemRecebida(mensagem) {
  await set(mensagem.id, mensagem, storeMensagensRecebidasB);
}

self.addEventListener('push', function(event) {
  console.log("[SW-PUSH] 📩 ===== PUSH EVENT RECEBIDO =====");
  if (!event.data) return;

  const rawText = event.data.text();
  console.log("[SW-PUSH] 📦 Texto bruto recebido do push:", rawText);

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
      const emailRemetente = jwtPayload.iss;
      const nomeRemetente = jwtPayload.name || "Remetente Autorizado";

      console.log(`[SW-PUSH] 🔐 Analisando assinatura JWT de: ${nomeRemetente} <${emailRemetente}>`);

      const emissorHomologado = await get(emailRemetente, storeListaBranca);
      if (!emissorHomologado) {
        throw new Error(`O remetente "${emailRemetente}" não foi cadastrado na lista branca.`);
      }

      const keyVerifyA = await crypto.subtle.importKey(
        "jwk", emissorHomologado.jwk, { name: "RSA-PSS", hash: "SHA-256" }, true, ["verify"]
      );

      let b64Sig = signatureB64Url.replace(/-/g, '+').replace(/_/g, '/');
      while (b64Sig.length % 4) b64Sig += '=';
      const signatureBytes = new Uint8Array([...atob(b64Sig)].map(c => c.charCodeAt(0)));
      const tokenStringWithoutSignature = `${headerB64Url}.${payloadB64Url}`;

      const isSignatureValid = await crypto.subtle.verify(
        { name: "RSA-PSS", saltLength: 32 }, keyVerifyA, signatureBytes, encoder.encode(tokenStringWithoutSignature)
      );

      if (!isSignatureValid) throw new Error("A assinatura digital do token falhou!");
      console.log("[SW-PUSH] 🛡️ Assinatura digital do JWT homologada com sucesso!");

      const privateDecryptKey = await get(KEY_NAMES.DECRYPT_KEY, storeChavesE2E);
      if (!privateDecryptKey) throw new Error("Sua chave privada RSA de decodificação não foi encontrada.");

      const encryptedBytes = new Uint8Array(jwtPayload.cipherText.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      const decryptedBuffer = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateDecryptKey, encryptedBytes);
      const textoOriginal = decoder.decode(decryptedBuffer);
      console.log("[SW-PUSH] 🔓 Conteúdo do JWT aberto com sucesso!");

      // 🔥 CRIA MENSAGEM RECEBIDA
      const mensagemId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const mensagemRecebida = {
        id: mensagemId,
        remetente: nomeRemetente,
        remetenteEmail: emailRemetente,
        titulo: `De: ${nomeRemetente}`,
        conteudo: textoOriginal,
        dadosJwt: jwtPayload,
        status: 'nao_lida',
        recebidoEm: Date.now()
      };

      // 🔥 SALVA NO INDEXEDDB
      await salvarMensagemRecebida(mensagemRecebida);
      console.log(`[SW-PUSH] ✅ Mensagem ${mensagemId} salva no IndexedDB`);

      // 🔥 TRIGGER PARA PROCESSAR FILA DE NOTIFICAÇÃO
      // Tenta processar imediatamente
      if (self.processarFilaNotificacao) {
        await self.processarFilaNotificacao();
      } else {
        // Fallback: notifica diretamente
        await self.registration.showNotification(`📥 De: ${nomeRemetente}`, {
          body: textoOriginal,
          icon: '/icon.png',
          badge: '/icon.png',
          vibrate: [200, 100, 200],
          data: jwtPayload,
          tag: mensagemId,
          requireInteraction: true
        });
        
        // Atualiza status
        mensagemRecebida.status = 'notificada';
        mensagemRecebida.notificadaEm = Date.now();
        await salvarMensagemRecebida(mensagemRecebida);
      }

      // Notifica os clientes abertos
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach((client) => {
        client.postMessage({
          type: "PUSH_RECEIVED",
          payload: {
            id: mensagemId,
            title: nomeRemetente,
            body: textoOriginal,
            status: 'nao_lida'
          }
        });
      });

    } catch (jwtError) {
      console.error("[SW-PUSH] ❌ Falha crítica no pipeline de segurança:", jwtError.message);
      await self.registration.showNotification("⚠️ Bloqueio de Segurança", {
        body: jwtError.message || "Assinatura corrompida ou remetente não autorizado.",
        icon: '/icon.png'
      });
    }
  }());
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

function criarStore(nome) {
  return createStore(nome, STORE_NAMES.KEYVAL);
}

const storeMensagensEnvioA = criarStore(DB_NAMES.MENSAGENS_ENVIO_A);
const storeMensagensRecebidasB = criarStore(DB_NAMES.MENSAGENS_RECEBIDAS_B);

// ============================================================
// PROCESSADOR DE MENSAGENS - BROWSER A (ENVIO)
// ============================================================

async function salvarMensagemEnvio(mensagem) {
  await set(mensagem.id, mensagem, storeMensagensEnvioA);
}

async function buscarMensagemEnvio(id) {
  return get(id, storeMensagensEnvioA);
}

async function listarMensagensEnvioPorStatus(status) {
  const todas = await listarMensagensEnvio();
  return todas.filter(m => m.status === status);
}

async function listarMensagensEnvio() {
  const entriesList = await entries(storeMensagensEnvioA);
  return entriesList.map(([_, msg]) => msg);
}

async function atualizarStatusMensagemEnvio(id, status, erro) {
  const mensagem = await buscarMensagemEnvio(id);
  if (mensagem) {
    mensagem.status = status;
    mensagem.atualizadoEm = Date.now();
    if (erro) mensagem.erro = erro;
    await salvarMensagemEnvio(mensagem);
  }
}

async function removerMensagemEnvio(id) {
  await del(id, storeMensagensEnvioA);
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
  
  const pendentes = await listarMensagensEnvioPorStatus('pendente');
  const enviando = await listarMensagensEnvioPorStatus('enviando');
  
  // Recupera mensagens que ficaram presas em 'enviando'
  const todasEnviando = enviando.filter(m => {
    // Se está em 'enviando' há mais de 30 segundos, recupera
    return (Date.now() - m.atualizadoEm) > 30000;
  });
  
  const paraProcessar = [...pendentes, ...todasEnviando];
  
  if (paraProcessar.length === 0) {
    console.log("[SW-MSG] ℹ️ Nenhuma mensagem pendente para enviar.");
    return;
  }
  
  console.log(`[SW-MSG] 📦 ${paraProcessar.length} mensagens para processar`);
  
  for (const msg of paraProcessar) {
    // Marca como 'enviando'
    await atualizarStatusMensagemEnvio(msg.id, 'enviando');
    
    // Envia
    await enviarMensagemParaServidor(msg);
    
    // Pequena pausa entre envios
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

// ============================================================
// PROCESSADOR DE MENSAGENS - BROWSER B (RECEBIDAS)
// ============================================================

async function salvarMensagemRecebida(mensagem) {
  await set(mensagem.id, mensagem, storeMensagensRecebidasB);
}

async function listarMensagensRecebidasPorStatus(status) {
  const todas = await listarMensagensRecebidas();
  return todas.filter(m => m.status === status);
}

async function listarMensagensRecebidas() {
  const entriesList = await entries(storeMensagensRecebidasB);
  return entriesList.map(([_, msg]) => msg);
}

async function atualizarStatusMensagemRecebida(id, status) {
  const mensagem = await get(id, storeMensagensRecebidasB);
  if (mensagem) {
    mensagem.status = status;
    if (status === 'lida') mensagem.lidaEm = Date.now();
    if (status === 'notificada') mensagem.notificadaEm = Date.now();
    await set(id, mensagem, storeMensagensRecebidasB);
  }
}

// 🔥 PROCESSADOR DE FILA DE NOTIFICAÇÃO
async function processarFilaNotificacao() {
  console.log("[SW-MSG] 🔔 Processando fila de notificações...");
  
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
      
      // Pequena pausa entre notificações
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (err) {
      console.error(`[SW-MSG] ❌ Erro ao notificar mensagem ${msg.id}:`, err);
    }
  }
}

// ============================================================
// LISTENERS DE EVENTOS
// ============================================================

// 🔥 OUVE MENSAGENS DA PÁGINA (Browser A)
self.addEventListener('message', async (event) => {
  const data = event.data;
  
  if (data.type === 'ENVIAR_MENSAGEM') {
    console.log(`[SW-MSG] 📩 Recebida mensagem da página para enviar: ${data.payload.id}`);
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
  }
  
  if (data.type === 'LISTAR_MENSAGENS_PENDENTES') {
    const mensagens = await listarMensagensEnvioPorStatus('pendente');
    if (event.source) {
      event.source.postMessage({
        type: 'LISTA_MENSAGENS',
        mensagens: mensagens
      });
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

// 🔥 PERIODIC SYNC (se disponível) - para processar filas em background
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
  MENSAGENS_ENVIO_A: "BrowserA_MensagensEnvio_DB", // 🔥 NOVO
  
  // Browser B
  CHAVES_E2E_B: "BrowserB_E2E_Chaves_DB",
  LISTA_BRANCA_B: "BrowserB_ListaBranca_DB",
  CHAVES_VAPID_B: "BrowserB_Vapid_DB",
  SUBSCRIPTION_B: "BrowserB_Subscription_DB",
  MENSAGENS_RECEBIDAS_B: "BrowserB_MensagensRecebidas_DB", // 🔥 NOVO
} as const;

export const STORE_NAMES = {
  KEYVAL: "keyval",
} as const;

export const KEY_NAMES = {
  // Browser A - Identidade
  IDENTIDADE_A: "identidade_a",
  PUBLIC_KEY_A: "public_key_a",
  
  // Browser A - Fila Offline (legado, será substituído)
  FILA_OFFLINE: "fila_offline",
  
  // Browser A - Bundles (do Browser B)
  BUNDLE_ATIVO: "bundle_ativo",
  BUNDLE_HISTORICO: "bundle_historico",
  
  // Browser A - Mensagens de Envio
  MENSAGENS_ENVIO: "mensagens_envio",
  
  // Browser B - E2E
  CHAVES_E2E_B: "chaves_e2e_b",
  PUBLIC_ENCRYPT_B: "public_encrypt_b",
  PUBLIC_VERIFY_B: "public_verify_b",
  
  // Browser B - VAPID
  CHAVES_VAPID_B: "chaves_vapid_b",
  VAPID_PUBLIC_B: "vapid_public_b",
  VAPID_PRIVATE_B: "vapid_private_b",
  
  // Browser B - Subscription
  SUBSCRIPTION_B: "subscription_b",
  SUBSCRIPTION_ENDPOINT_B: "subscription_endpoint_b",
  
  // Browser B - Lista Branca
  LISTA_BRANCA: "lista_branca",
  
  // Browser B - Mensagens Recebidas
  MENSAGENS_RECEBIDAS: "mensagens_recebidas",
} as const;

// ============================================================
// Interfaces para Mensagens
// ============================================================

export interface MensagemEnvio {
  id: string;
  bundle: any;
  payloadText: string;
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
  dadosJwt: any;
  status: 'nao_lida' | 'lida' | 'notificada';
  recebidoEm: number;
  lidaEm?: number;
  notificadaEm?: number;
}

// ============================================================
// Interfaces Existentes
// ============================================================

export interface IdentidadeA {
  name: string;
  email: string;
  privateKey: CryptoKey;
}

export interface BundleData {
  id: string;
  nomeReceptor: string;
  emailReceptor: string;
  bundle: any;
  createdAt: number;
  updatedAt: number;
}

export interface ChavesE2EB {
  privateDecrypt: CryptoKey;
  publicEncrypt: JsonWebKey;
  privateSign: CryptoKey;
  publicSign: JsonWebKey;
}

export interface ChavesVapidB {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}

export interface SubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  vapidPublicKey?: JsonWebKey;
  createdAt: number;
  updatedAt: number;
}

export interface EmissorHomologado {
  email: string;
  name: string;
  jwk: JsonWebKey;
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

