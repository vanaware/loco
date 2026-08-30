// src/sw/sw-utils.ts
import { addDebugLog } from '@loco/utils/debug';
import { APP_VERSION } from '@loco/utils/config';

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

  addDebugLog(`⏳ Registrando Service Worker no escopo: ${basePath}`);

  try {
    const registration = await navigator.serviceWorker.register(
      `${basePath}service-worker.js?v=${APP_VERSION}`,
      { scope: basePath }
    );
    
    if (!registration) {
      throw new Error("Service Worker registration retornou null/undefined");
    }
    
    addDebugLog("✅ Service Worker registrado, aguardando ready...");
    const readyReg = await navigator.serviceWorker.ready;
    
    // 🔥 ARQUITETURA: Checagem Introspectiva de Versão (App vs SW)
    if (readyReg.active) {
      // Criamos um túnel de comunicação seguro (MessageChannel)
      const channel = new MessageChannel();
      
      // A UI fica escutando a porta 1
      channel.port1.onmessage = (event) => {
        if (event.data && event.data.type === 'PONG_SW_VERSION') {
          const swVersion = event.data.version;
          
          if (swVersion !== APP_VERSION) {
            addDebugLog("warn", "SYSTEM", `⚠️ Inconsistência de Versão! App está rodando v${APP_VERSION}, mas o Service Worker ativo em background é v${swVersion}. Um recarregamento forçado pode ser necessário.`);
          } else {
            addDebugLog("info", "SYSTEM", `🔒 Match de versão verificado: App e SW estão sincronizados na v${APP_VERSION}.`);
          }
        }
      };
      
      // A UI manda o sinal de PING pela porta 2 direto para o Worker ativo
      readyReg.active.postMessage({ type: 'PING_SW_VERSION' }, [channel.port2]);
    }
    
    return readyReg;
  } catch (err: any) {
    addDebugLog("❌ Erro ao registrar Service Worker: " + (err?.message || String(err)));
    throw new Error(`Falha ao registrar Service Worker: ${err?.message || String(err)}`);
  }
}