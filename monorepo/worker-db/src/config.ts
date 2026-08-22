// config.ts
const checkEnv = (key: string): boolean | undefined => {
  try {
    if (typeof Deno !== "undefined") {
      const envVal = Deno.env.get(key);
      if (envVal !== undefined) return envVal === "true";
    }
  } catch {
    // Caso a flag --allow-env não tenha sido passada
    console.warn(`Não foi possível acessar a variável de ambiente ${key}.`);
  }
  return undefined;
};

const getUseFake = (): boolean => checkEnv("USE_FAKE") ?? false;

export const APP_CONFIG = {
  USE_FAKE: getUseFake(),
  APP_VERSION: "1.0.0-beta",
  LOG_LEVEL: "debug",
};