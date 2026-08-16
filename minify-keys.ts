// minify-keys.ts
// Script utilitário para extrair e minificar as chaves RSA do servidor.

async function executarMinificacao() {
  // Lê o primeiro argumento passado na linha de comando
  const targetKey = Deno.args[0]; 

  // O Deno injeta automaticamente as variáveis de ambiente se passarmos a flag --env-file
  const publicKeyStr = Deno.env.get("SERVER_PUBLIC_KEY");
  const privateKeyStr = Deno.env.get("SERVER_PRIVATE_KEY");

  if (!publicKeyStr || !privateKeyStr) {
    console.error("❌ Não foi possível ler as chaves. Certifique-se de executar o comando com a flag --env-file=.env");
    Deno.exit(1);
  }

  try {
    const publicJwk = JSON.parse(publicKeyStr);
    const privateJwk = JSON.parse(privateKeyStr);

    // 🔥 ARQUITETURA: Minificação da Chave Pública (Apenas o módulo 'n')
    const compactPublicJwk = {
      n: publicJwk.n || publicJwk // Suporta se já foi minificada antes
    };

    // 🔥 ARQUITETURA: Minificação da Chave Privada
    const compactPrivateJwk = {
      d: privateJwk.d,
      p: privateJwk.p,
      q: privateJwk.q,
      dp: privateJwk.dp,
      dq: privateJwk.dq,
      qi: privateJwk.qi
    };

    // =========================================================================
    // MODO SILENCIOSO / AUTOMAÇÃO (Pipeline CI/CD / deploy.sh)
    // =========================================================================
    if (targetKey === "SERVER_PRIVATE_KEY") {
      console.log(JSON.stringify(compactPrivateJwk));
      Deno.exit(0);
    } 
    
    if (targetKey === "SERVER_PUBLIC_KEY") {
      console.log(JSON.stringify(compactPublicJwk));
      Deno.exit(0);
    }

    // =========================================================================
    // MODO VERBOSO / INTERATIVO (Para desenvolvedores no terminal)
    // =========================================================================
    console.log("\n✅ Minificação Dupla concluída com sucesso!\n");
    
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