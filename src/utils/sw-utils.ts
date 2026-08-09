// src/utils/sw-utils.ts
import { addDebugLog } from "./debug-utils.ts";

export function logSwInfo(module: string, message: string, details?: unknown) {
  addDebugLog("info", `SW:${module}`, message, details);
}

export function logSwError(module: string, message: string, details?: unknown) {
  addDebugLog("error", `SW:${module}`, message, details);
}

export function logSwWarn(module: string, message: string, details?: unknown) {
  addDebugLog("warn", `SW:${module}`, message, details);
}

export function logSwSuccess(module: string, message: string, details?: unknown) {
  addDebugLog("success", `SW:${module}`, message, details);
}

/**
 * Registra o Service Worker principal no navegador
 */
export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) {
    logSwWarn("INIT", "Service Worker não é suportado neste navegador.");
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register("/service-worker.js", {
      scope: "/",
    });
    logSwSuccess("INIT", "Service Worker registrado com sucesso", { scope: registration.scope });
    return registration;
  } catch (error: any) {
    logSwError("INIT", "Falha ao registrar Service Worker", error);
    throw error;
  }
}