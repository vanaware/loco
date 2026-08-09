// src/utils/debug-utils.ts

const DEBUG_CHANNEL_NAME = "loco_debug_channel";

// BroadcastChannel é suportado tanto na Window (UI) quanto no ServiceWorker
let debugChannel: BroadcastChannel | null = null;
if (typeof BroadcastChannel !== "undefined") {
  debugChannel = new BroadcastChannel(DEBUG_CHANNEL_NAME);
}

export interface DebugLogPayload {
  id: string;
  timestamp: string;
  type: "info" | "warn" | "error" | "success";
  module: string;
  message: string;
  details?: unknown;
}

/**
 * Emite logs desacoplados via BroadcastChannel para o DebugPanel e inspeciona no console nativo.
 * Esta função suporta retrocompatibilidade, aceitando tanto 1 argumento (msg) quanto a versão rica.
 */
export function addDebugLog(
  typeOrMsg: string,
  moduleOrDetails?: any,
  message?: string,
  details?: unknown
): void {
  let logType: DebugLogPayload["type"] = "info";
  let logModule = "SYSTEM";
  let logMessage = "";
  let logDetails: unknown = undefined;

  // Trata a sobrecarga de argumentos
  if (arguments.length === 1 || (arguments.length === 2 && typeof moduleOrDetails !== "string")) {
    logType = "info";
    logModule = "APP";
    logMessage = typeOrMsg;
    logDetails = moduleOrDetails;
  } else {
    logType = (typeOrMsg as DebugLogPayload["type"]) || "info";
    logModule = moduleOrDetails as string || "SYSTEM";
    logMessage = message || "";
    logDetails = details;
  }

  // 🔥 Cria a estrutura exata que o DebugPanel.tsx espera receber
  const entry: DebugLogPayload = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toLocaleTimeString(),
    type: logType,
    module: logModule,
    message: logMessage,
    details: logDetails,
  };

  try {
    if (debugChannel) {
      debugChannel.postMessage({
        type: "LOCO_DEBUG_LOG",
        entry, // A propriedade mágica "entry" que faltava no payload
      });
    }
  } catch (err) {
    console.warn("Erro ao emitir log no BroadcastChannel:", err);
  }

  // Espelha no console de desenvolvedor do navegador
  const consoleMsg = `[${logModule}] ${logMessage}`;
  if (logType === "error") console.error(consoleMsg, logDetails ?? "");
  else if (logType === "warn") console.warn(consoleMsg, logDetails ?? "");
  else console.log(consoleMsg, logDetails ?? "");
}