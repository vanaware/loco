// build.ts
import { ensureDir } from "@std/fs";
import { minifyRsaPublic, minifyRsaPrivate, generateE2EEKeys } from "@loco/utils/crypto";

const clean = async () => {
  try {
    await Promise.all([
      Deno.remove("./build/functions", { recursive: true }),
      Deno.remove("./build/worker.js"),
      //Deno.remove("./build/worker.js.map")
    ]);
    console.log("📁 Arquivos anteriores excluído");
  } catch {
    // diretório não existe, ok
  }
  await ensureDir("./build/dist");
  await ensureDir("./build/functions");
};

async function gerarOuCarregarChavesServidor() {
  const publicKey = Deno.env.get('SERVER_PUBLIC_KEY');
  const privateKey = Deno.env.get('SERVER_PRIVATE_KEY');
  
  if (publicKey && privateKey) {
    console.log("🔑 Chaves do servidor carregadas do .env");
    return;
  }

  console.log("🔐 Gerando novas chaves RSA do servidor (Formato Minificado Duplo)...");
  const { publicEncrypt, privateDecryptJwk } = await generateE2EEKeys();
  const compactPublicJwk = minifyRsaPublic(publicEncrypt);
  const compactPrivateJwk = minifyRsaPrivate(privateDecryptJwk);
  
  const publicKeyStr = JSON.stringify(compactPublicJwk);
  const privateKeyStr = JSON.stringify(compactPrivateJwk);
  
  Deno.env.set('SERVER_PUBLIC_KEY', publicKeyStr);
  Deno.env.set('SERVER_PRIVATE_KEY', privateKeyStr);
  
  await Deno.writeTextFile(
    '.env',
    `# Chaves RSA do Servidor - Geradas automaticamente pelo build\n` +
    `# NÃO COMMITAR ESTE ARQUIVO!\n` +
    `SERVER_PUBLIC_KEY=${publicKeyStr}\n` +
    `SERVER_PRIVATE_KEY=${privateKeyStr}\n`
  );
  console.log(`✅ Chaves do servidor salvas em .env`);
}

const build = async () => {
  console.log("🚀 Iniciando build do Worker Cloudflare ...");
  const startTime = performance.now();
  
  try {
    await clean();
    await gerarOuCarregarChavesServidor();
    
    console.log("⚙️ Gerando bundle do Worker...");
    // @ts-ignore: Deno.bundle API interna operacional no runtime
    const result = await Deno.bundle({
      entrypoints: [
        "./src/worker.ts", 
        "./src/functions/ping.ts",
        "./src/functions/publickey.ts",
        "./src/functions/push.ts",
      ],
      outputDir: "./build/",
      platform: "browser",
      format: "esm", 
      packages: "bundle",
      keepnames: true,
      inlineImports: true,
      codeSplitting: false,
      minify: false,
      sourcemap: "inline",
      write: true,
    });

    if (!result.success) {
      console.error(result.errors);
      throw new Error("Falha ao gerar bundle pelo compilador interno.");
    }

    for (const warning of result.warnings || []) {
      console.warn(warning);
    }

    const endTime = performance.now();
    console.log(`✅ Build concluído com sucesso em ${(endTime - startTime).toFixed(2)}ms!`);
    console.log("📁 Saída gerada no diretório: ./build/dist/");
  } catch (error) {
    console.error("❌ Erro fatal durante o processo de build:");
    console.error(error);
    Deno.exit(1);
  }
};

await build();