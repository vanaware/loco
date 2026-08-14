// src/sw/sw-utils.ts
import { addDebugLog } from '../utils/debug-utils.ts';

export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration> {
  addDebugLog("📡 Verificando suporte ao Service Worker...");
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Worker não é suportado neste navegador.");
  }

  // 🔥 ARQUITETURA: Resolução Dinâmica de Rota Base (Environment Agnostic)
  // Lemos a URL atual para descobrir se estamos rodando na raiz (/) ou em um subdiretório (/loco/)
  let basePath = globalThis.location.pathname;
  
  // Se a URL aponta para um arquivo (ex: /loco/index.html), extraímos apenas o diretório
  if (basePath.split('/').pop()?.includes('.')) {
    basePath = basePath.substring(0, basePath.lastIndexOf('/') + 1);
  } else if (!basePath.endsWith('/')) {
    // Se a URL é /loco (sem barra no final), forçamos a barra. 
    // Isso evita que o navegador interprete "loco" como arquivo e tente registrar o SW na raiz "/".
    basePath += '/';
  }

  const cacheBuster = Date.now();
  addDebugLog(`⏳ Registrando Service Worker no escopo: ${basePath}`);

  try {
    // Injetamos o basePath absoluto calculado na hora
    const registration = await navigator.serviceWorker.register(
      `${basePath}service-worker.js?cacheBuster=${cacheBuster}`,
      { scope: basePath }
    );
    
    if (!registration) {
      throw new Error("Service Worker registration retornou null/undefined");
    }
    
    addDebugLog("✅ Service Worker registrado, aguardando ready...");
    const readyReg = await navigator.serviceWorker.ready;
    addDebugLog("✅ Service Worker ativo e pronto.");
    
    return readyReg;
  } catch (err: any) {
    addDebugLog("❌ Erro ao registrar Service Worker: " + (err?.message || String(err)));
    throw new Error(`Falha ao registrar Service Worker: ${err?.message || String(err)}`);
  }
}