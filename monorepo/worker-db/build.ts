// build.ts
import { ensureDir } from "@std/fs";

import { createCache } from "@deno/cache-dir";
import { createGraph } from "@deno/graph";
import { parse } from "@std/jsonc"; // Utilitário oficial para ler arquivos JSONC
import { toFileUrl, resolve, join } from "@std/path";

const cache = async () => {
  console.log("📦 Resolvendo e cacheando dependências remotas...");

  try {
    // 1. Cria a instância de cache oficial do Deno
    const fileCache = createCache();

    // 2. Carrega o arquivo deno.jsonc e limpa comentários
    const configPath = resolve("./deno.jsonc");
    const configText = await Deno.readTextFile(configPath);
    const parsedConfig = parse(configText) as { imports?: Record<string, string> };
    const importsMap = parsedConfig.imports || {};

    // 3. Transforma o caminho relativo da entrada principal em uma URL absoluta "file://"
    const rootSpecifier = toFileUrl(resolve("./src/main.tsx")).href;

    // 4. Resolve o grafo de módulos utilizando URLs absolutas
    await createGraph(rootSpecifier, {
      
      // CORREÇÃO: Transforma todas as saídas em URLs absolutas válidas
      resolve: (specifier, referrer) => {
        let resolved = specifier;

        // Se houver uma correspondência exata no import map
        if (specifier in importsMap) {
          resolved = importsMap[specifier];
        } else {
          // Trata mapeamentos de diretório (ex: "@/src/" ou "meu-pacote/")
          for (const [key, value] of Object.entries(importsMap)) {
            if (key.endsWith("/") && specifier.startsWith(key)) {
              resolved = specifier.replace(key, value);
              break;
            }
          }
        }

        // Se o resultado do import map for um caminho local relativo (ex: "./src/")
        // nós precisamos mesclá-lo com a URL base de quem o chamou (referrer)
        if (resolved.startsWith("./") || resolved.startsWith("../")) {
          const referrerUrl = new URL(referrer);
          // Se o referrer for um arquivo local, resolve com caminhos do sistema
          if (referrerUrl.protocol === "file:") {
            const absolutePath = resolve(join(referrerUrl.pathname, "..", resolved));
            return toFileUrl(absolutePath).href;
          }
          // Se for um referrer remoto, resolve usando a classe URL padrão
          return new URL(resolved, referrer).href;
        }

        return resolved;
      },
      
      // Faz o download e salva no cache físico (DENO_DIR)
      load: async (specifier, options) => {
        // Ignora links acidentais de páginas HTML
        if (specifier.startsWith("http") && !/\.(ts|tsx|js|jsx|mts|mjs)$/i.test(specifier) && !specifier.includes("jsr:") && !specifier.includes("npm:")) {
          return {
            kind: "external",
            specifier,
          };
        }
        return await fileCache.load(specifier, options);
      },
    });

    console.log("✅ Cache pré-aquecido e import map resolvido com sucesso!");
  } catch (error) {
    console.error("❌ Erro ao baixar dependências:", error.message);
    throw new Error("Falha ao colocar dependências em cache. Verifique o seu deno.jsonc.");
  }
}

const clean = async () => {
  try {
    await Deno.remove("./build", { recursive: true });
    console.log("📁 Arquivos anteriores excluídos");
  } catch {
    // diretório não existe, ok
  }
  await ensureDir("./build");
}

const build = async () => {

  console.log("🚀 Iniciando build do Loco PWA...");
  const startTime = performance.now();

  try {
    // 1. Garante que a pasta de destino exista
    await clean();

    // 2. Pre-aquecimento do cache
    await cache();

    // 3. Compilação da aplicação
    console.log("⚙️ Gerando bundle da aplicação...");
    const result = await Deno.bundle({
      entrypoints: [
        "./src/main.ts"
      ],
      outputPath: "./build/worker-db.js",
      platform: "browser",
      format: "iife",
      packages: "external",
      keepnames: true,
      inlineImports: true,
      codeSplitting: false,
      minify: false,
      sourcemap: "linked",
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
    console.log("📁 Saída gerada no diretório: ./build/");

  } catch (error) {
    console.error("❌ Erro fatal durante o processo de build:");
    console.error(error);
    Deno.exit(1);
  }
}

await build();