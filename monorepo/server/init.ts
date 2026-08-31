// build.ts
import { minifyRsaPublic, minifyRsaPrivate, generateE2EEKeys } from "@loco/utils/crypto";

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

const init = async () => {
  console.log("🚀 Iniciando preparação de chaves do Servidor ...");
  const startTime = performance.now();
  
  try {

    await gerarOuCarregarChavesServidor();


    const endTime = performance.now();
    console.log(`✅ Init concluído com sucesso em ${(endTime - startTime).toFixed(2)}ms!`);
  } catch (error) {
    console.error("❌ Erro fatal durante o processo de init:");
    console.error(error);
    Deno.exit(1);
  }
};

await init();