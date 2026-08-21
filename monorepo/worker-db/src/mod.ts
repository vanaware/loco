// worker-db/mod.ts

let workerInstance: Worker | null = null;
const pendingRequests = new Map<string, { resolve: Function; reject: Function }>();

// 1. INSTANCIAÇÃO (Lazy Initialization)
function getWorker(): Worker {
  if (!workerInstance) {
    const workerUrl = new URL("./worker-db.js", import.meta.url);
    workerInstance = new Worker(workerUrl, { type: "module" });

    // Tratamento de mensagens
    workerInstance.onmessage = (e: MessageEvent) => {
      const { requestId, success, result, error } = e.data;
      const promise = pendingRequests.get(requestId);
      
      if (promise) {
        if (success) promise.resolve(result);
        else promise.reject(new Error(error));
        pendingRequests.delete(requestId);
      }
    };

    // 2. RECUPERAÇÃO AUTOMÁTICA DE ERROS (Auto-heal)
    workerInstance.onerror = (event) => {
      console.error("⚠️ Falha crítica no Web Worker:", event.message);
      
      // Rejeita todas as Promises pendentes para a UI não ficar travada
      pendingRequests.forEach(({ reject }) => reject(new Error("Worker crashed")));
      pendingRequests.clear();

      // Mata e reinicializa o Worker
      restartWorker();
    };
  }

  return workerInstance;
}

// 3. REINICIALIZAÇÃO MANUAL
function restartWorker() {
  if (workerInstance) {
    workerInstance.terminate(); // Interrompe a thread imediatamente
    workerInstance = null;
  }
  
  // Cancela pendências antigas
  pendingRequests.forEach(({ reject }) => reject(new Error("Worker foi reiniciado")));
  pendingRequests.clear();

  // Recria a instância limpa
  getWorker();
}

function exec<T>(command: string, args: Record<string, any> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    pendingRequests.set(requestId, { resolve, reject });
    
    try {
      getWorker().postMessage({ requestId, command, args });
    } catch (err) {
      pendingRequests.delete(requestId);
      reject(err);
    }
  });
}

// API Pública com Controles de Ciclo de Vida
export const db = {
  // Comandos de Dados
  get: <T>(key: string) => exec<T>("GET", { key }),
  set: <T>(key: string, val: T) => exec<void>("SET", { key, val }),
  delete: (key: string) => exec<void>("DELETE", { key }),
  clear: () => exec<void>("CLEAR"),

  // Métodos de Controle do Ciclo de Vida
  init: () => { getWorker(); },     // Inicializa antes da primeira chamada se desejado
  restart: () => restartWorker(),   // Reinicia a thread do worker (útil ao trocar configs ou resetar mocks)
  terminate: () => {                // Destrói o worker completamente
    if (workerInstance) {
      workerInstance.terminate();
      workerInstance = null;
    }
  }
};