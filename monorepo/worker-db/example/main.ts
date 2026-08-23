import { db, ls, listOpfsFiles, deleteFromOpfs, getFileFromOpfs, opfs } from "../src/mod.ts";

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

// ==========================================
// SEÇÃO INTERATIVA: GERENCIADOR OPFS UI
// ==========================================
function setupInteractiveOpfsUI() {
  if (!appElement) return;

  const container = document.createElement("div");
  container.style.marginTop = "32px";
  container.style.padding = "24px";
  container.style.backgroundColor = "var(--md-sys-color-surface)";
  container.style.borderRadius = "12px";
  container.style.border = "1px solid var(--md-sys-color-primary)";

  const title = document.createElement("h2");
  title.style.color = "var(--md-sys-color-primary)";
  title.style.marginTop = "0";
  title.innerText = "📁 Gerenciador Interativo OPFS (Isolado)";

  const desc = document.createElement("p");
  desc.innerText = "Selecione múltiplos arquivos para fazer upload nativo pelo Worker-DB. Eles serão persistidos no Origin Private File System do seu navegador.";

  const inputWrapper = document.createElement("div");
  inputWrapper.style.marginBottom = "24px";
  
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.style.display = "block";
  input.style.padding = "8px 0";
  input.style.color = "var(--md-sys-color-on-background)";

  const fileListContainer = document.createElement("div");
  fileListContainer.style.display = "flex";
  fileListContainer.style.flexDirection = "column";
  fileListContainer.style.gap = "8px";

  inputWrapper.appendChild(input);
  container.appendChild(title);
  container.appendChild(desc);
  container.appendChild(inputWrapper);
  container.appendChild(fileListContainer);
  appElement.appendChild(container);

  // Instância de testes do OPFS para a interface
  // Mesmo chamando db.terminate() antes, o worker reinicia sozinho ao enviarmos novos comandos!
  const userDrive = opfs("INTERACTIVE_DB", "files", "INT_", "ui_uploads");
  const FOLDER_KEY = "pasta_do_usuario"; 

  // Registra a pasta principal invisivelmente no IndexedDB
  userDrive.set(FOLDER_KEY, { created: Date.now(), type: "interactive_test" }).catch(console.error);

  const renderFiles = async () => {
    fileListContainer.innerHTML = "<p>Carregando arquivos...</p>";
    try {
      const files = await userDrive.listFiles(FOLDER_KEY);
      fileListContainer.innerHTML = "";

      if (files.length === 0) {
        fileListContainer.innerHTML = "<p style='color: #888;'>Nenhum arquivo nesta pasta. Faça um upload acima!</p>";
        return;
      }

      for (const f of files) {
        const item = document.createElement("div");
        item.style.display = "flex";
        item.style.justifyContent = "space-between";
        item.style.alignItems = "center";
        item.style.background = "#1a1c19";
        item.style.padding = "12px 16px";
        item.style.borderRadius = "8px";

        const name = document.createElement("span");
        name.innerText = `${f.name} - ${(f.size / 1024).toFixed(1)} KB`;
        
        const actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.gap = "8px";

        const btnDownload = document.createElement("button");
        btnDownload.innerText = "Baixar";
        btnDownload.style.cursor = "pointer";
        btnDownload.style.background = "var(--md-sys-color-primary)";
        btnDownload.style.color = "#1a1c19";
        btnDownload.style.border = "none";
        btnDownload.style.fontWeight = "bold";
        btnDownload.style.borderRadius = "4px";
        btnDownload.style.padding = "6px 12px";
        
        btnDownload.onclick = () => {
          const url = URL.createObjectURL(f.file);
          const a = document.createElement("a");
          a.href = url;
          a.download = f.name;
          a.click();
          URL.revokeObjectURL(url); // Previne vazamento de memória
        };

        const btnDelete = document.createElement("button");
        btnDelete.innerText = "Excluir";
        btnDelete.style.cursor = "pointer";
        btnDelete.style.background = "#ff5252";
        btnDelete.style.color = "white";
        btnDelete.style.border = "none";
        btnDelete.style.fontWeight = "bold";
        btnDelete.style.borderRadius = "4px";
        btnDelete.style.padding = "6px 12px";
        
        btnDelete.onclick = async () => {
          btnDelete.disabled = true;
          btnDelete.innerText = "Excluindo...";
          await userDrive.delFile(FOLDER_KEY, f.name);
          await renderFiles();
        };

        actions.appendChild(btnDownload);
        actions.appendChild(btnDelete);

        item.appendChild(name);
        item.appendChild(actions);
        fileListContainer.appendChild(item);
      }
    } catch (err) {
      fileListContainer.innerHTML = `<p style="color: #ff5252;">Erro ao listar: ${(err as Error).message}</p>`;
    }
  };

  input.onchange = async () => {
    if (!input.files || input.files.length === 0) return;
    
    input.disabled = true;
    
    try {
      // Como o addFile passa pelo Worker, podemos iterar sem travar a main thread
      for (const file of Array.from(input.files)) {
        await userDrive.addFile(FOLDER_KEY, file, file.name);
      }
    } catch (err) {
      console.error("Erro ao subir arquivo:", err);
    } finally {
      input.disabled = false;
      input.value = ""; // Limpa o input para novos envios
      await renderFiles();
    }
  };

  // Primeira listagem ao carregar a interface
  renderFiles();
}

// Inicia as demonstrações de backend e, em seguida, anexa a UI iterativa.
runRealWorldTests()
  .then(() => setupInteractiveOpfsUI())
  .catch((err) => {
    log("❌ OCORREU UM ERRO FATAL:", err.message);
  });