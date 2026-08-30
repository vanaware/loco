// minify-keys.ts
import { minifyRsaPublic, minifyRsaPrivate } from "@loco/utils/crypto";

async function executarMinificacao() {
  const targetKey = Deno.args[0]; 
  const publicKeyStr = Deno.env.get("SERVER_PUBLIC_KEY");
  const privateKeyStr = Deno.env.get("SERVER_PRIVATE_KEY");

  if (!publicKeyStr || !privateKeyStr) {
    console.error("❌ Não foi possível ler as chaves. Certifique-se de executar o comando com a flag --env-file=.env");
    Deno.exit(1);
  }

  try {
    const publicJwk = JSON.parse(publicKeyStr);
    const privateJwk = JSON.parse(privateKeyStr);
    
    // 🔥 ARQUITETURA UNIFICADA: Minificação Centralizada
    const compactPublicJwk = minifyRsaPublic(publicJwk);
    const compactPrivateJwk = minifyRsaPrivate(privateJwk);
    
    // MODO SILENCIOSO / AUTOMAÇÃO
    if (targetKey === "SERVER_PRIVATE_KEY") {
      console.log(JSON.stringify(compactPrivateJwk));
      Deno.exit(0);
    } 
    if (targetKey === "SERVER_PUBLIC_KEY") {
      console.log(JSON.stringify(compactPublicJwk));
      Deno.exit(0);
    }
    
    // MODO VERBOSO / INTERATIVO
    console.log("\n✅ Minificação Dupla concluída com sucesso (Usando Utils Centralizadas)!\n");
    console.log("=====================================================================");
    console.log("🌐 SERVER_PUBLIC_KEY (Variável/Var Pública no Cloudflare)");
    console.log("=====================================================================");
    console.log(JSON.stringify(compactPublicJwk));
    console.log("\n");
    console.log("=====================================================================");
    console.log("🔐 SERVER_PRIVATE_KEY (Secret/Encrypt no Cloudflare)");
    console.log("=====================================================================");
    console.log(JSON.stringify(compactPrivateJwk));
    console.log("\n=====================================================================\n");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("❌ Falha ao processar as chaves. Verifique se o JSON no .env é válido.", errorMsg);
    Deno.exit(1);
  }
}

executarMinificacao();