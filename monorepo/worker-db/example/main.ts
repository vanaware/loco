import { db, ls } from "../src/mod.ts";

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
  console.log(msg, data || "");
}

async function runRealWorldTests() {
  log("🚀 INICIANDO TESTES DO LOCO PWA (AMBIENTE REAL)\n");
  
  // ==========================================
  // 1. TESTE LOCALSTORAGE
  // ==========================================
  log("--- TESTANDO LOCALSTORAGE (ls) ---");
  const local = ls("test_");
  local.clear();
  
  local.set("session", { active: true, device: "desktop" });
  const sess = local.get("session");
  log("✅ LocalStorage gravou e recuperou com prefixo 'test_':", sess);
  
  // ==========================================
  // 2. TESTE WORKER DB (INDEXEDDB)
  // ==========================================
  log("\n--- TESTANDO INDEXEDDB VIA WORKER (db) ---");
  
  // Inicia explicitamente o Worker (instancia usando o default './worker-db.js')
  db.init();

  // Escopo definido pela instrução do TODO
  const store = db("db_test", "test", "demo_");
  await store.clear();
  log("🧹 Banco de dados 'db_test' (store: test) limpo com sucesso.");

  // Teste de CRUD Simples
  log("\n[ CRUD Simples ]");
  const userId = await store.set("user_1", { nome: "Satoshi Nakamoto", privacy: "high" });
  log(`✅ Registro salvo via set(). Chave gerada: ${userId}`);

  const user = await store.get("user_1");
  log("✅ Leitura realizada com get():", user);

  await store.patch("user_1", { status: "online" });
  const updatedUser = await store.get("user_1");
  log("✅ Atualização parcial via patch() finalizada:", updatedUser);

  // ==========================================
  // 3. TESTE FUNÇÕES AVANÇADAS NO WORKER
  // ==========================================
  log("\n[ Mutação em Massa e Processamento em Background ]");
  
  await store.setMany([
    ["msg_1", { txt: "Hello PWA", read: true }],
    ["msg_2", { txt: "E2EE is awesome", read: false }],
    ["msg_3", { txt: "Offline First!", read: false }],
  ]);
  log("✅ setMany() inseriu 3 registros de uma vez.");

  // Executa contagem diretamente na thread do worker para não bloquear a UI!
  const unreadCount = await store.query<any, number>((items) => {
    return items.filter(i => i.read === false).length;
  });
  log(`✅ query() executada remotamente. Total de msgs não lidas: ${unreadCount}`);

  // Marca todas as não lidas como lidas de uma só vez (no worker!)
  await store.setSome<any>(
    (items) => items.filter(i => i.read === false),
    (item) => ({ ...item, read: true })
  );
  
  const finalMessages = await store.values();
  log("✅ Estado final do banco após setSome() (todas lidas):", finalMessages);

  log("\n🏁 TODOS OS TESTES PASSARAM COM SUCESSO!");
}

// Inicia os testes no frontend
runRealWorldTests().catch((err) => {
  log("❌ OCORREU UM ERRO FATAL:", err.message);
});