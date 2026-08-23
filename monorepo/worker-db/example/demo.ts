import { db, ls } from "../src/fake/fake-mod.ts";

// Tipagem dos modelos de domínio do Loco PWA
interface LocoMessage {
  _id?: string;
  senderId: string;
  recipientId: string;
  content: string;
  status: "pending" | "sent" | "delivered";
  timestamp: number;
}

async function runLocoDbDemo() {
  console.log("🚀 [Loco PWA] Iniciando demonstração do WORKER-DB...\n");

  // Garante que o ambiente inicie limpo para a demonstração
  ls().clear();

  // -------------------------------------------------------------
  // 1. LOCALSTORAGE: Geração Automática de IDs (_id: "auto")
  // -------------------------------------------------------------
  console.log("📦 1. LocalStorage - Criando itens com _id 'auto'...");
  const prefStore = ls("LOCO_PREF_");

  const autoKey1 = prefStore.set({ _id: "auto", theme: "dark", notifications: true });
  const autoKey2 = prefStore.set({ _id: "auto", theme: "light", notifications: false });

  console.log(`   --> Item 1 gerado: Chave = ${autoKey1}`);
  console.log(`   --> Recuperando Item 1 (notem que '_id' volta limpo):`, prefStore.get(autoKey1));
  console.log(`   --> Recuperando Item 2:`, prefStore.get(autoKey2));


  // -------------------------------------------------------------
  // 2. LOCALSTORAGE: Isolamento de Escopos por Prefixo
  // -------------------------------------------------------------
  console.log("\n🔒 2. LocalStorage - Testando Isolamento de Prefixos...");
  const authStore = ls("LOCO_AUTH_");
  
  // Gravando uma chave fixa (ex: sessão)
  authStore.set("session_token", { token: "abc-123", active: true });
  
  console.log(`   --> Total de itens em LOCO_PREF_ (Preferências): ${prefStore.keys().length}`);
  console.log(`   --> Total de itens em LOCO_AUTH_ (Autenticação): ${authStore.keys().length}`);


  // -------------------------------------------------------------
  // 3. LOCALSTORAGE: Consulta Global (Prefixo nulo)
  // -------------------------------------------------------------
  console.log("\n🌍 3. LocalStorage - Visão Global (Sem prefixo)...");
  
  // Instanciando o `ls` sem parâmetros nos dá acesso a TODO o localStorage
  const globalStore = ls(); 
  const allKeys = globalStore.keys();
  
  console.log(`   --> Total de itens armazenados em TODA a aplicação: ${allKeys.length}`);
  console.log(`   --> Chaves globais detectadas:`, allKeys);
  console.log(`   --> Realizando leitura global do token:`, globalStore.get("LOCO_AUTH_session_token"));


  // -------------------------------------------------------------
  // 4. WORKER DB: Fila de Mensagens Offline com Geração de ID
  // -------------------------------------------------------------
  console.log("\n💬 4. IndexedDB Worker - Enfileirando Mensagens Offline...");
  
  // Lembrete: O DB() roda em background assíncrono (Web Worker)
  const msgStore = db("LOCO_DATA", "messages", "MSG_");
  await msgStore.clear();

  const msgId1 = await msgStore.set<LocoMessage>({
    _id: "auto",
    senderId: "user_alice",
    recipientId: "user_bob",
    content: "Olá! Esta mensagem foi enfileirada offline.",
    status: "pending",
    timestamp: Date.now(),
  });

  const msgId2 = await msgStore.set<LocoMessage>({
    _id: "auto",
    senderId: "user_alice",
    recipientId: "user_bob",
    content: "Esperando o Handshake com o servidor...",
    status: "pending",
    timestamp: Date.now() + 1000,
  });

  console.log(`   --> Mensagens injetadas no IndexedDB. Keys geradas: ${msgId1}, ${msgId2}`);


  // -------------------------------------------------------------
  // 5. WORKER DB: Consultas Avançadas (Background Processing)
  // -------------------------------------------------------------
  console.log("\n⚙️ 5. IndexedDB Worker - Mutações Assíncronas...");

  // Contagem feita DIRETAMENTE na thread do Worker, sem trafegar o array gigante para a Main Thread
  const pendingCount = await msgStore.query<LocoMessage, number>((items) => {
    return items.filter((m) => m.status === "pending").length;
  });
  console.log(`   --> Total pendente (calculado remotamente): ${pendingCount}`);

  // Atualização em massa: simula o Service Worker alterando tudo após conectar na rede
  await msgStore.setSome<LocoMessage>(
    (items) => items.filter((m) => m.status === "pending"),
    (item) => ({ ...item, status: "sent" })
  );

  const updatedMessages = await msgStore.values<LocoMessage>();
  console.log("   --> Estado das mensagens após envio simulado:", updatedMessages);

  // Limpa o ambiente antes de fechar para garantir finalização limpa do processo Deno
  db.terminate();
  console.log("\n✅ Demonstração finalizada. Worker encerrado.");
}

// Executar
runLocoDbDemo();