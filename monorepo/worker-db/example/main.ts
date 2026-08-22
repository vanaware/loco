import { db, ls, listOpfsFiles, deleteFromOpfs } from "../src/mod.ts";

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

// Utilitário simples para printar os resultados visualmente na interface HTML
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
  
  // Utilizando a nova lógica: enviando "auto" direto no ID interno
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
  
  // Testando o seu design: A chave informada é "auto" e o objeto não precisa de _id
  await msgStore.setMany([
    ["auto", { senderId: "alice", recipientId: "bob", content: "Oi!", status: "delivered", priority: 1, timestamp: now - 5000 }],
    ["auto", { senderId: "alice", recipientId: "bob", content: "Tudo bem?", status: "pending", priority: 1, timestamp: now - 4000 }],
    ["auto", { senderId: "bob", recipientId: "alice", content: "ALERTA URGENTE", status: "pending", priority: 5, timestamp: now - 3000 }],
    ["auto", { senderId: "alice", recipientId: "bob", content: "Foto.jpg", status: "read", priority: 1, timestamp: now - 10000 }],
  ]);

  log(`   --> Banco populado via "auto" explícito nas chaves.`);
  log(`   --> Total de mensagens injetadas com UUIDs gerados com sucesso: ${(await msgStore.keys()).length}`);

  // Testando também o .set simples para visualizar o retorno da chave gerada
  const keyGerada = await msgStore.set("auto", { senderId: "admin", recipientId: "all", content: "Bem-vindo!", status: "read", priority: 10, timestamp: now });
  log(`   --> Teste .set("auto"): Chave final retornada pelo sistema = ${keyGerada}`);

  // -------------------------------------------------------------
  // 3. WORKER DB: Consultas Analíticas (Agregações remotas)
  // -------------------------------------------------------------
  log("\n📊 3. IndexedDB Worker - Análises e Agregações Remotas (query)...");
  
  // Tudo isso roda em background, sem travar o Event Loop da UI!
  const stats = await msgStore.query<LocoMessage, any>((items) => {
    return {
      totalPending: items.filter(i => i.status === "pending").length,
      highestPriorityPending: items
        .filter(i => i.status === "pending")
        .toSorted((a, b) => b.priority - a.priority)[0], // toSorted do ES2023 no Worker!
      hasUrgent: items.some(i => i.priority >= 5),
      oldestMessage: items.reduce((oldest, current) => current.timestamp < oldest.timestamp ? current : oldest)
    };
  });
  
  log(`   --> Estatísticas processadas no Worker:`, stats);

  // -------------------------------------------------------------
  // 4. WORKER DB: Mutações Condicionais Complexas
  // -------------------------------------------------------------
  log("\n⚙️ 4. IndexedDB Worker - Transformações Assíncronas (setSome)...");

  // Altera mensagens pendentes: sobe o status para 'sent' e ofusca o conteúdo (Simulando preparo E2EE)
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

  // Removemos as mensagens antigas que já foram lidas (Simulando mensagens efêmeras)
  await msgStore.delSome<LocoMessage>((items) => items.filter(m => m.status === "read"));
  log(`   --> Mensagens "read" deletadas. Restantes no DB: ${(await msgStore.keys()).length}`);

  // -------------------------------------------------------------
  // 6. OPFS NATIVO: Backup Assíncrono no Sistema de Arquivos
  // -------------------------------------------------------------
  log("\n💾 6. Origin Private File System (OPFS) - Backup Nativo...");
  
  // Limpa lixos anteriores para a demonstração ser limpa
  const oldFiles = await listOpfsFiles();
  for (const f of oldFiles) await deleteFromOpfs(f);

  const backupName = await msgStore.backupToOpfs("mensagens_v1.json");
  const storedFiles = await listOpfsFiles();
  
  log(`   --> Backup gerado pelo Worker com sucesso.`);
  log(`   --> Arquivos fisicamente guardados no OPFS do navegador:`, storedFiles);

  // Prova real: vamos limpar o IndexedDB inteiro e restaurar pelo arquivo do OPFS
  await msgStore.clear();
  log(`   --> IndexedDB completamente apagado. Chaves: ${(await msgStore.keys()).length}`);
  
  await msgStore.restoreFromOpfs(backupName);
  log(`   --> Banco restaurado do disco (OPFS). Chaves recuperadas: ${(await msgStore.keys()).length}`);


  // Encerramento
  db.terminate();
  log("\n✅ Demonstração Completa Finalizada! Ambiente de dados totalmente operacional.");
}

// Inicia os testes no frontend
runRealWorldTests().catch((err) => {
  log("❌ OCORREU UM ERRO FATAL:", err.message);
});