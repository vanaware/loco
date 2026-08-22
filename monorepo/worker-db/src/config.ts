// config.ts
const getUseFakeDb = (): boolean => {
  try {
    // 1. Se estiver rodando no Deno (CLI / Testes), tenta ler a variável de ambiente
    if (typeof Deno !== "undefined") {
      const envVal = Deno.env.get("USE_FAKE_DB");
      if (envVal !== undefined) return envVal === "true";
    }
  } catch {
    // Caso a flag --allow-env não tenha sido passada no Deno CLI
  }

  // 2. Fallback padrão para desenvolvimento do protótipo no navegador
  return true;
};

export const APP_CONFIG = {
  USE_FAKE_DB: getUseFakeDb(),
  APP_VERSION: "1.0.0-beta",
  LOG_LEVEL: "debug",
};