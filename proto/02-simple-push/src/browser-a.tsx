// src/browser-a.tsx

// Função auxiliar nativa para abrir o banco de dados IndexedDB
function abrirBancoDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("PushSyncDB", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("fila_disparos", { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function sendMessage() {
  const bundleRaw = (document.getElementById('unifiedBundle') as HTMLTextAreaElement).value;
  const message = (document.getElementById('message') as HTMLTextAreaElement).value;

  try {
    const bodyPayload = JSON.parse(bundleRaw);
    bodyPayload.payloadText = JSON.stringify({ title: "Mensagem", body: message });

    // 1. Verifica se o navegador está online. Se sim, tenta o envio direto
    if (navigator.onLine) {
      const response = await fetch("/api/proxy-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload)
      });
      if (response.ok) {
        alert("Mensagem enviada de forma direta!");
        return;
      }
    }

    // 2. Se falhar ou estiver OFFLINE, entra a Background Sync API
    console.log("🔌 Dispositivo offline ou falha de rede. Agendando sincronização de fundo...");
    
    // Salva o payload completo no IndexedDB
    const db = await abrirBancoDB();
    const tx = db.transaction("fila_disparos", "readwrite");
    tx.objectStore("fila_disparos").add(bodyPayload);

    // Registra a tarefa de sincronização no Service Worker
    const registration = await navigator.serviceWorker.ready;
    
    if ('sync' in registration) {
      // Registra a tag de sincronização que o SW vai escutar
      await (registration as any).sync.register('sync-push-notifications');
      alert("Você está offline! A mensagem foi salva e será enviada sozinha assim que a internet voltar.");
    } else {
      // Fallback caso o navegador não tenha a Sync API (ex: Safari desktop antigo)
      alert("Seu navegador não suporta Background Sync. Conecte-se para enviar.");
    }

  } catch (err) {
    console.error(err);
    alert(`Erro no processo: ${(err as Error).message}`);
  }
}

document.getElementById("btnSend")?.addEventListener("click", sendMessage);
