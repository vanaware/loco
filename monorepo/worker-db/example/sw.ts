/// <reference lib="webworker" />

// ⚠️ IMPORTANTE: Importamos exclusivamente de db-sw.ts para não invocar Web Workers secundários!
import { db } from "../src/db-sw.ts";
import { listOpfsFiles } from "../src/utils/opfs_utils.ts";

const sw = self as unknown as ServiceWorkerGlobalScope;

// Força a instalação imediata do SW
sw.addEventListener("install", (event) => {
  sw.skipWaiting();
});

// Assume o controle de todas as páginas abertas imediatamente
sw.addEventListener("activate", (event) => {
  event.waitUntil(sw.clients.claim());
});

// Escuta comandos vindos da Main Thread (main.ts)
sw.addEventListener("message", async (event) => {
  if (event.data && event.data.type === "RUN_SW_DEMO") {
    try {
      // 1. Instancia o banco diretamente na thread do SW
      const msgStore = db("LOCO_DATA", "messages", "MSG_");

      // 2. Insere um dado no IndexedDB
      const insertedId = await msgStore.set("auto", {
        senderId: "system_sw",
        recipientId: "all",
        content: "Mensagem gravada diretamente pelo Service Worker!",
        status: "delivered",
        priority: 99,
        timestamp: Date.now()
      });

      // 3. Realiza a contagem dos dados
      const allMessages = await msgStore.values();

      // 4. Executa um Backup OPFS na pasta /backup
      const backupName = await msgStore.backupToOpfs("sw_auto_backup.json");
      const opfsFiles = await listOpfsFiles();

      // 5. Devolve a resposta para a Main Thread via MessageChannel
      event.ports[0]?.postMessage({
        success: true,
        payload: {
          insertedId,
          totalMessages: allMessages.length,
          backupName,
          opfsFiles
        }
      });
    } catch (error) {
      event.ports[0]?.postMessage({
        success: false,
        error: (error as Error).message
      });
    }
  }
});