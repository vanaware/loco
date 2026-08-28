// src/utils/debug-utils.ts

import { DEBUG_CHANNEL_NAME } from "../config/mod.ts";

import type { DebugLogPayload } from "../interfaces/mod.ts";

// BroadcastChannel é suportado tanto na Window (UI) quanto no ServiceWorker
let debugChannel: BroadcastChannel | null = null;
if (typeof BroadcastChannel !== "undefined") {
  debugChannel = new BroadcastChannel(DEBUG_CHANNEL_NAME);
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
        entry,
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