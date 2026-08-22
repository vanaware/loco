import { db, ls, listOpfsFiles } from "../src/mod.ts";

// Tipagem dos modelos de domínio do Loco PWA
interface LocoMessage {
  _id?: string;
  senderId: string;
  recipientId: string;
  content: string;
  status: "pending" | "sent" | "delivered";
  timestamp: number;
}

interface UserPreferences {
  theme: "dark" | "light";
  notificationsEnabled: boolean;
  activeChatId: string | null;
}

async function runLocoDbDemo() {
  console.log("🚀 [Loco PWA] Iniciando demonstração do WORKER-DB...\n");

  // Ajusta o caminho do Worker para execução nativa no Deno
  db.init(new URL("../build/worker-db.js", import.meta.url));

  // -------------------------------------------------------------
  // 1. GERENCIAMENTO DE PREFERÊNCIAS DE UI (LocalStorage Scoped)
  // -------------------------------------------------------------
  console.log("📦 1. Configurando Preferências do Usuário (LS)...");
  const prefsStore = ls("LOCO_PREF_");
  prefsStore.clear();

  prefsStore.set<UserPreferences>("config", {
    theme: "dark",
    notificationsEnabled: true,
    activeChatId: "chat_123",
  });

  const currentPrefs = prefsStore.get<UserPreferences>("config");
  console.log("   --> Preferências salvas:", currentPrefs);

  // -------------------------------------------------------------
  // 2. FILA DE MENSAGENS OFFLINE (IndexedDB via Web Worker)
  // -------------------------------------------------------------
  console.log("\n💬 2. Enfileirando Mensagens Offline (DB Worker)...");
  const msgStore = db("LOCO_DATA", "messages", "MSG_");
  await msgStore.clear();

  // Inserção com geração automática de ID (_id: "auto")
  const msgId1 = await msgStore.set<LocoMessage>({
    _id: "auto",
    senderId: "user_alice",
    recipientId: "user_bob",
    content: "Olá! Esta mensagem foi gravada offline.",
    status: "pending",
    timestamp: Date.now(),
  });

  const msgId2 = await msgStore.set<LocoMessage>({
    _id: "auto",
    senderId: "user_alice",
    recipientId: "user_bob",
    content: "Segunda mensagem na fila de sincronização.",
    status: "pending",
    timestamp: Date.now() + 1000,
  });

  console.log(`   --> Mensagens enfileiradas. Keys: ${msgId1}, ${msgId2}`);

  // -------------------------------------------------------------
  // 3. CONSULTAS E MUTAÇÕES AVANÇADAS NO WORKER (query & setSome)
  // -------------------------------------------------------------
  console.log("\n⚙️ 3. Processando Fila de Mensagens no Worker...");

  // Consulta agregada executada dentro da thread do Worker
  const pendingCount = await msgStore.query<LocoMessage, number>((items) => {
    return items.filter((m) => m.status === "pending").length;
  });
  console.log(`   --> Mensagens pendentes para envio: ${pendingCount}`);

  // Transição de estado: Marcar todas as mensagens de 'pending' para 'sent'
  await msgStore.setSome<LocoMessage>(
    (items) => items.filter((m) => m.status === "pending"),
    (item) => ({ ...item, status: "sent" })
  );

  const updatedMessages = await msgStore.values<LocoMessage>();
  console.log("   --> Estado das mensagens após envio:", updatedMessages);

  // -------------------------------------------------------------
  // 4. BACKUP E RESTAURAÇÃO DE SEGURANÇA (OPFS)
  // -------------------------------------------------------------
  console.log("\n💾 4. Executando Backup no OPFS (Origin Private File System)...");
  const backupFileName = await msgStore.backupToOpfs("mensagens_backup.json");
  console.log(`   --> Backup gerado com sucesso: ${backupFileName}`);

  const opfsFiles = await listOpfsFiles();
  console.log("   --> Arquivos armazenados no OPFS:", opfsFiles);

  // Limpa o banco e restaura a partir do backup do OPFS
  await msgStore.clear();
  console.log("   --> Banco de dados limpo. Total de itens:", (await msgStore.keys()).length);

  await msgStore.restoreFromOpfs(backupFileName);
  const restoredCount = (await msgStore.keys()).length;
  console.log(`   --> Banco de dados restaurado. Total de itens: ${restoredCount}`);

  // Limpa o ambiente antes de fechar
  db.terminate();
  console.log("\n✅ Demonstração finalizada. Worker encerrado.");
}

// Executar
runLocoDbDemo();