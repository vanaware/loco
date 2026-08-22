import { db, ls, listOpfsFiles, deleteFromOpfs, getFileFromOpfs } from "../src/mod.ts";

// Tipagem dos modelos de domínio do Loco PWA
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
  theme: "dark" | "light";
  notificationsEnabled: boolean;
  activeChatId: string | null;
}

// Elementos da interface HTML
const appElement = document.getElementById("app");
const logElement = document.getElementById("log-output");

function log(msg: string, data?: any) {
  const dataStr = data ? `\n  ↳ ${JSON.stringify(data, null, 2)}` : "";
  const fullText = `${msg}${dataStr}\n`;
  
  if (logElement) {
    if (logElement.innerText.includes("Aguardando execução")) {
      logElement.innerText = ""; // Limpa a tela inicial
    }
    logElement.innerText += fullText;
  }
  console.log(msg, data || ""); // Mantém no console do DevTools também
}

async function runRealWorldTests() {
  log("🚀 INICIANDO DEMONSTRAÇÃO AVANÇADA DO LOCO PWA (AMBIENTE REAL)\n");
  
  // Limpeza global
  ls().clear();
  db.init(); // Inicia o Worker do IndexedDB

  // -------------------------------------------------------------
  // 1. LOCALSTORAGE: Isolamento e Visão Global
  // -------------------------------------------------------------
  log("📦 1. LocalStorage - Escopos e Prefixos...");
  const prefStore = ls("LOCO_PREF_");
  const authStore = ls("LOCO_AUTH_");
  
  prefStore.set<UserPreferences>({ _id: "auto", theme: "dark", notificationsEnabled: true, activeChatId: "chat_1" });
  authStore.set("session_token", { token: "abc-123-xyz", active: true });
  
  const globalStore = ls(); 
  log(`   --> Total de chaves isoladas de Preferências: ${prefStore.keys().length}`);
  log(`   --> Visão Global da Aplicação (todas as chaves):`, globalStore.keys());

  // -------------------------------------------------------------
  // 2. WORKER DB: Carga de Dados Massiva
  // -------------------------------------------------------------
  log("\n💬 2. IndexedDB Worker - Populando Fila de Mensagens...");
  const msgStore = db("LOCO_DATA", "messages", "MSG_");
  await msgStore.clear();

  const now = Date.now();
  await msgStore.setMany([
    ["auto", { senderId: "alice", recipientId: "bob", content: "Oi!", status: "delivered", priority: 1, timestamp: now - 5000 }],
    ["auto", { senderId: "alice", recipientId: "bob", content: "Tudo bem?", status: "pending", priority: 1, timestamp: now - 4000 }],
    ["auto", { senderId: "bob", recipientId: "alice", content: "ALERTA URGENTE", status: "pending", priority: 5, timestamp: now - 3000 }],
    ["auto", { senderId: "alice", recipientId: "bob", content: "Foto.jpg", status: "read", priority: 1, timestamp: now - 10000 }],
  ]);

  log(`   --> Banco populado via "auto" explícito nas chaves.`);
  log(`   --> Total de mensagens injetadas com UUIDs gerados com sucesso: ${(await msgStore.keys()).length}`);

  // -------------------------------------------------------------
  // 3. WORKER DB: Consultas Analíticas (Agregações remotas)
  // -------------------------------------------------------------
  log("\n📊 3. IndexedDB Worker - Análises e Agregações Remotas (query)...");
  
  const stats = await msgStore.query<LocoMessage, any>((items) => {
    return {
      totalPending: items.filter(i => i.status === "pending").length,
      highestPriorityPending: items
        .filter(i => i.status === "pending")
        .toSorted((a, b) => b.priority - a.priority)[0],
      hasUrgent: items.some(i => i.priority >= 5),
      oldestMessage: items.reduce((oldest, current) => current.timestamp < oldest.timestamp ? current : oldest)
    };
  });
  
  log(`   --> Estatísticas processadas no Worker:`, stats);

  // -------------------------------------------------------------
  // 4. WORKER DB: Mutações Condicionais Complexas
  // -------------------------------------------------------------
  log("\n⚙️ 4. IndexedDB Worker - Transformações Assíncronas (setSome)...");

  await msgStore.setSome<LocoMessage>(
    (items) => items.filter((m) => m.status === "pending"),
    (item) => ({ 
      ...item, 
      status: "sent",
      content: `[ENCRIPTADO] ${item.content.length} bytes` 
    })
  );

  const updatedMessages = await msgStore.getSome<LocoMessage>((items) => items.filter(m => m.status === "sent"));
  log("   --> Mensagens atualizadas condicionalmente:", updatedMessages);

  // -------------------------------------------------------------
  // 5. WORKER DB: Deleção em Lote Segura (Garbage Collection)
  // -------------------------------------------------------------
  log("\n🧹 5. IndexedDB Worker - Limpeza Condicional (delSome)...");

  await msgStore.delSome<LocoMessage>((items) => items.filter(m => m.status === "read"));
  log(`   --> Mensagens "read" deletadas. Restantes no DB: ${(await msgStore.keys()).length}`);

  // -------------------------------------------------------------
  // 6. OPFS NATIVO: Backup Assíncrono e Download de Múltiplos Arquivos
  // -------------------------------------------------------------
  log("\n💾 6. Origin Private File System (OPFS) - Backup Nativo e Resgate...");
  
  const oldFiles = await listOpfsFiles();
  for (const f of oldFiles) await deleteFromOpfs(f);

  // Gerando os dois backups
  await msgStore.backupToOpfs("mensagens_v1.json");
  await msgStore.set("auto", { senderId: "admin", recipientId: "all", content: "Aviso importante!", status: "delivered", priority: 10, timestamp: Date.now() });
  const finalBackupName = await msgStore.backupToOpfs("mensagens_v2_final.json");

  const storedFiles = await listOpfsFiles();
  log(`   --> Backups gerados com sucesso na pasta interna '/backup'.`);
  log(`   --> Arquivos fisicamente encontrados na pasta:`, storedFiles);

  // Criando a UI interativa de Downloads fora do <pre> para o innerText do log() não esmagá-los
  if (appElement && storedFiles.length > 0) {
    const downloadContainer = document.createElement("div");
    downloadContainer.style.marginTop = "24px";
    downloadContainer.style.padding = "16px";
    downloadContainer.style.backgroundColor = "var(--md-sys-color-surface)";
    downloadContainer.style.borderRadius = "12px";
    downloadContainer.style.boxShadow = "0 4px 6px rgba(0,0,0,0.3)";

    let linksHTML = `<h3 style="margin-top: 0; color: var(--md-sys-color-primary);">🗂️ Arquivos de Backup (OPFS)</h3>`;
    linksHTML += `<div style="display: flex; flex-direction: column; gap: 12px;">`;
    
    for (const fileName of storedFiles) {
      const fileBlob = await getFileFromOpfs(fileName);
      const objectUrl = URL.createObjectURL(fileBlob);
      linksHTML += `<a href="${objectUrl}" download="${fileName}" style="color: #1a1c19; background: #9edeb6; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-weight: bold; width: fit-content; font-size: 14px;">📥 Baixar: ${fileName}</a>`;
    }
    
    linksHTML += `</div>`;
    downloadContainer.innerHTML = linksHTML;
    appElement.appendChild(downloadContainer); // Adiciona na página de forma segura
    log(`   --> Links de download renderizados na interface gráfica com sucesso!`);
  }

  // Restauração do sistema
  await msgStore.clear();
  log(`   --> IndexedDB completamente apagado. Chaves: ${(await msgStore.keys()).length}`);
  
  await msgStore.restoreFromOpfs(finalBackupName);
  log(`   --> Banco restaurado do disco (OPFS: ${finalBackupName}). Chaves recuperadas: ${(await msgStore.keys()).length}`);

  db.terminate();
  log("\n✅ Demonstração Completa Finalizada! Ambiente de dados totalmente operacional.");
}

// Inicia os testes no frontend
runRealWorldTests().catch((err) => {
  log("❌ OCORREU UM ERRO FATAL:", err.message);
});