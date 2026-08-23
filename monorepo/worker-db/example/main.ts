import { db, ls, listOpfsFiles, deleteFromOpfs, getFileFromOpfs } from "../src/mod.ts";

interface LocoMessage {
  _id?: string;
  senderId: string;
  recipientId: string;
  content: string;
  status: "pending" | "sent" | "delivered" | "read";
  priority: number;
  timestamp: number;
}

interface UserPreferences {
  _id?: string; // Permitindo o ID automático via interface
  theme: "dark" | "light";
  notificationsEnabled: boolean;
  activeChatId: string | null;
}

const appElement = document.getElementById("app");
const logElement = document.getElementById("log-output");

function log(msg: string, data?: any) {
  const dataStr = data ? `\n  ↳ ${JSON.stringify(data, null, 2)}` : "";
  const fullText = `${msg}${dataStr}\n`;
  
  if (logElement) {
    if (logElement.innerText.includes("Aguardando execução")) {
      logElement.innerText = "";
    }
    logElement.innerText += fullText;
  }
  console.log(msg, data || ""); 
}

async function runRealWorldTests() {
  log("🚀 INICIANDO DEMONSTRAÇÃO AVANÇADA DO LOCO PWA (AMBIENTE REAL)\n");
  
  ls().clear();
  db.init();

  log("📦 1. LocalStorage - Escopos e Prefixos...");
  const prefStore = ls("LOCO_PREF_");
  prefStore.set<UserPreferences>({ _id: "auto", theme: "dark", notificationsEnabled: true, activeChatId: "chat_1" });
  log(`   --> Total de chaves isoladas de Preferências: ${prefStore.keys().length}`);

  log("\n💬 2. IndexedDB Worker - Populando Fila de Mensagens...");
  const msgStore = db("LOCO_DATA", "messages", "MSG_");
  await msgStore.clear();

  const now = Date.now();
  await msgStore.setMany([
    ["auto", { senderId: "alice", recipientId: "bob", content: "Oi!", status: "delivered", priority: 1, timestamp: now - 5000 }],
    ["auto", { senderId: "alice", recipientId: "bob", content: "Tudo bem?", status: "pending", priority: 1, timestamp: now - 4000 }],
  ]);
  log(`   --> Total de mensagens injetadas com UUIDs gerados com sucesso: ${(await msgStore.keys()).length}`);

  log("\n📊 3. IndexedDB Worker - Análises e Agregações Remotas (query)...");
  const stats = await msgStore.query<LocoMessage, any>((items) => ({
    totalPending: items.filter(i => i.status === "pending").length,
  }));
  log(`   --> Estatísticas processadas no Worker:`, stats);

  log("\n💾 4. Origin Private File System (OPFS) - Backup Nativo e Resgate...");
  const oldFiles = await listOpfsFiles();
  for (const f of oldFiles) await deleteFromOpfs(f);
  await msgStore.backupToOpfs("mensagens_v1.json");
  const storedFiles = await listOpfsFiles();
  log(`   --> Backups gerados com sucesso na pasta interna '/backup'.`);

  log("\n🤖 5. Service Worker - Interação em Background (db-sw.ts)...");
  
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/sw.js", { type: "module" });
      
      if (!navigator.serviceWorker.controller) {
        log(`   --> ⚠️ O Service Worker foi instalado. Pressione F5 (recarregar) para que ele assuma o controle da página.`);
      } else {
        log(`   --> Service Worker ativo e controlando a página! Solicitando operação remota...`);
        
        const runSwTask = () => new Promise((resolve, reject) => {
          const channel = new MessageChannel();
          channel.port1.onmessage = (e) => {
            if (e.data.success) resolve(e.data.payload);
            else reject(new Error(e.data.error));
          };
          navigator.serviceWorker.controller!.postMessage({ type: "RUN_SW_DEMO" }, [channel.port2]);
        });

        const swResult = await runSwTask();
        log(`   --> ✅ Resultado retornado pelo Service Worker:`, swResult);
      }
    } catch (err) {
      log(`   ❌ Falha ao registrar o Service Worker:`, err);
    }
  }

  const finalStoredFiles = await listOpfsFiles();
  if (appElement && finalStoredFiles.length > 0) {
    const downloadContainer = document.createElement("div");
    downloadContainer.style.marginTop = "24px";
    downloadContainer.style.padding = "16px";
    downloadContainer.style.backgroundColor = "var(--md-sys-color-surface)";
    downloadContainer.style.borderRadius = "12px";

    let linksHTML = `<h3 style="margin-top: 0; color: var(--md-sys-color-primary);">🗂️ Arquivos OPFS (Inclui backups do SW)</h3>`;
    linksHTML += `<div style="display: flex; flex-direction: column; gap: 12px;">`;
    
    for (const fileName of finalStoredFiles) {
      const fileBlob = await getFileFromOpfs(fileName);
      const objectUrl = URL.createObjectURL(fileBlob);
      linksHTML += `<a href="${objectUrl}" download="${fileName}" style="color: #1a1c19; background: #9edeb6; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-weight: bold; width: fit-content; font-size: 14px;">📥 Baixar: ${fileName}</a>`;
    }
    
    downloadContainer.innerHTML = linksHTML + `</div>`;
    appElement.appendChild(downloadContainer);
  }

  db.terminate();
  log("\n✅ Demonstração Completa Finalizada!");
}

runRealWorldTests().catch((err) => {
  log("❌ OCORREU UM ERRO FATAL:", err.message);
});