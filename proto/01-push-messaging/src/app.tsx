import { render } from "preact";
import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { get, set } from "idb-keyval";
import "@material/web/all.js";
import type { Contact, Message, Identity, PushSubscription } from "./types.ts";
import { generateVapidKeys, exportPublicKeyRaw } from "./crypto.ts";
import { sendPushMessage } from "./push.ts";

const STORE_KEYS = {
  myIdentity: "push:myIdentity",
  contacts: "push:contacts",
  selectedContactId: "push:selectedContactId",
  messages: "push:messages",
} as const;

interface PersistedState {
  myIdentity: Identity | null;
  contacts: Contact[];
  selectedContactId: string;
  messages: Message[];
}

function generateId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function packIdentity(identity: Identity): string {
  return btoa(JSON.stringify(identity));
}

function unpackIdentity(packed: string): Identity {
  return JSON.parse(atob(packed)) as Identity;
}

async function loadPersistedState() {
  try {
    const [myIdentity, contacts, selectedContactId, messages] = await Promise.all([
      get<Identity>(STORE_KEYS.myIdentity),
      get<Contact[]>(STORE_KEYS.contacts),
      get<string>(STORE_KEYS.selectedContactId),
      get<Message[]>(STORE_KEYS.messages),
    ]);
    return {
      myIdentity: myIdentity ?? null,
      contacts: Array.isArray(contacts) ? contacts : [] as Contact[],
      selectedContactId: typeof selectedContactId === "string" ? selectedContactId : "",
      messages: Array.isArray(messages) ? messages : [] as Message[],
    };
  } catch {
    return { myIdentity: null, contacts: [] as Contact[], selectedContactId: "", messages: [] as Message[] };
  }
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  console.log("[app] registrando Service Worker...");
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  console.log("[app] ✅ SW registrado:", registration.scope);
  console.log("[app]   SW ativo:", registration.active?.state ?? "nenhum");
  console.log("[app]   SW waiting:", registration.waiting?.state ?? "nenhum");
  console.log("[app]   SW installing:", registration.installing?.state ?? "nenhum");
  return registration;
}

async function subscribePushManager(registration: ServiceWorkerRegistration, vapidPublicJwk: JsonWebKey): Promise<PushSubscription> {
  const rawPublic = await exportPublicKeyRaw(vapidPublicJwk);

  // Se já existe uma subscription antiga com outra chave, cancela antes de criar nova.
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    console.log("[app] cancelando subscription antiga:", existing.endpoint);
    await existing.unsubscribe();
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: new Uint8Array(rawPublic),
  });

  console.log("[app] ✅ push subscription criada:", subscription.endpoint);
  console.log("[app]   keys.p256dh:", subscription.toJSON().keys?.p256dh?.slice(0, 20) + "…");

  return subscription.toJSON() as unknown as PushSubscription;
}

function identityToContact(identity: Identity): Contact {
  return {
    id: identity.id,
    displayName: identity.displayName,
    subscription: identity.subscription,
    vapidPublicJwk: identity.vapidPublicJwk,
    vapidPrivateJwk: identity.vapidPrivateJwk,
  };
}

function getContactDisplayName(contact?: Contact): string {
  if (!contact) return "";
  return contact.displayName?.trim() || contact.id;
}

function App() {
  const myIdentity = useSignal<Identity | null>(null);
  const identityPacked = useSignal<string>("");
  const contacts = useSignal<Contact[]>([]);
  const selectedContactId = useSignal<string>("");
  const newContactPack = useSignal<string>("");
  const newContactName = useSignal<string>("");
  const messageText = useSignal<string>("");
  const status = useSignal<string>("Inicializando...");
  const messages = useSignal<Message[]>([]);
  const loaded = useSignal(false);
  const mobileView = useSignal<"contacts" | "chat">("contacts");
  const showIdentityDetails = useSignal(false);
  
  // Painel de logs visível
  const showLogs = useSignal(false);
  const logLines = useSignal<string[]>([]);
  
  // Intercepta console.log/warn/error para mostrar no painel
  useEffect(() => {
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;
    
    const addLine = (type: string, args: any[]) => {
      const line = `[${type}] ${args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ")}`;
      if (logLines.value.length > 500) {
        logLines.value = logLines.value.slice(-300); // limite para performance
      }
      logLines.value = [...logLines.value, line];
    };
    
    console.log = (...args) => { addLine("LOG", args); origLog.apply(console, args); };
    console.warn = (...args) => { addLine("WARN", args); origWarn.apply(console, args); };
    console.error = (...args) => { addLine("ERROR", args); origError.apply(console, args); };
    
    // Adiciona entrada inicial
    addLine("INIT", ["Debug panel ativo — " + new Date().toISOString()]);
    
    return () => {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
    };
  }, []);

  // Log de capacidades da API
  useEffect(() => {
    console.log("[app] === DIAGNÓSTICO DE CAPACIDADES ===");
    console.log("[app]   navigator.serviceWorker:", !!navigator.serviceWorker ? "✅ disponível" : "❌ indisponível");
    console.log("[app]   window.isSecureContext:", window.isSecureContext);
    console.log("[app]   location.protocol:", location.protocol);
    console.log("[app]   location.hostname:", location.hostname);
    console.log("[app]   window.pushManager:", !!window.PushManager ? "✅ disponível" : "❌ indisponível");
    if (navigator.serviceWorker) {
      navigator.serviceWorker.ready.then((reg) => {
        console.log("[app]   pushManager.getSubscription():", "chamado");
        reg.pushManager.getSubscription().then((sub) => {
          console.log("[app]   subscription existente:", sub ? sub.endpoint : "nenhuma");
        });
      }).catch((err) => {
        console.error("[app]   falha ao verificar pushManager:", err);
      });
    }
    console.log("[app] === FIM DIAGNÓSTICO ===");
  }, []);

  useEffect(() => {
    loadPersistedState()
      .then(async (state) => {
        if (state.myIdentity) {
          console.log("📂 [app] ===== IDENTIDADE CARREGADA DO INDEXEDDB =====");
          console.log("📦 Objeto identity carregado:");
          console.log("   id:", state.myIdentity.id);
          console.log("   displayName:", state.myIdentity.displayName);
          console.log("   subscription.endpoint:", state.myIdentity.subscription.endpoint);
          console.log("   subscription.keys.p256dh:", state.myIdentity.subscription.keys.p256dh);
          console.log("   subscription.keys.auth:", state.myIdentity.subscription.keys.auth);
          console.log("   vapidPublicJwk:", JSON.stringify(state.myIdentity.vapidPublicJwk, null, 2));
          console.log("   vapidPrivateJwk:", JSON.stringify(state.myIdentity.vapidPrivateJwk, null, 2));
          
          const packed = packIdentity(state.myIdentity);
          console.log("📦 Pacote identidade (Base64):", packed.slice(0, 100) + "...");
          console.log("📂 [app] ================================================");
          
          myIdentity.value = state.myIdentity;
          identityPacked.value = packIdentity(state.myIdentity);
        }
        contacts.value = state.contacts;
        selectedContactId.value = state.selectedContactId;
        messages.value = state.messages;
        loaded.value = true;

        try {
          if (!state.myIdentity) {
            await createIdentity();
          } else {
            const registration = await registerServiceWorker().catch((err) => {
              console.error("[app] erro ao registrar SW:", err);
              return null;
            });
            // Verifica se a subscription ainda existe no browser; se não, renova
            if (registration) {
              const currentSub = await registration.pushManager.getSubscription();
              if (!currentSub || currentSub.endpoint !== state.myIdentity.subscription.endpoint) {
                console.log("[app] ⚠️ subscription stale, renovando...");
                const newSub = await subscribePushManager(registration, state.myIdentity.vapidPublicJwk);
                const updated = { ...state.myIdentity, subscription: newSub };
                myIdentity.value = updated;
                identityPacked.value = packIdentity(updated);
                await set(STORE_KEYS.myIdentity, updated);
                status.value = `⚠️ Subscription renovada! Reexporte seu pacote. ID: ${updated.id}`;
                console.warn("[app] ⚠️ NOVO identity pack (copie para seus contatos):", identityPacked.value);
              } else {
                console.log("[app] ✅ subscription válida:", currentSub.endpoint);
              }
            }
            status.value = `Pronto. ID: ${state.myIdentity!.id}`;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[app] erro na inicialização:", err);
          status.value = `❌ Erro: ${msg}`;
        }
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[app] erro ao carregar estado:", err);
        status.value = `❌ Erro ao carregar: ${msg}`;
      });

    const handleMessage = (event: MessageEvent) => {
      console.log("[app] 📨 Mensagem recebida do SW:", event.data);
      if (event.data?.type === "PUSH_MESSAGE") {
        const payload = event.data.payload as { text?: string; fromId?: string };
        console.log("[app] 📥 Payload da mensagem:", payload);
        if (payload.text && payload.fromId && myIdentity.value) {
          const incoming: Message = {
            text: payload.text,
            fromId: payload.fromId,
            toId: myIdentity.value.id,
            timestamp: Date.now(),
          };
          console.log("[app] 💾 Salvando mensagem:", incoming);
          persistMessages([...messages.value, incoming]);

          // Cadastra contato automaticamente se não existir
          const contactExists = contacts.value.some((c) => c.id === payload.fromId);
          if (!contactExists) {
            console.log("[app] 📬 Novo contato detectado:", payload.fromId);
            // Cria contato básico com o ID (sem dados de subscription ainda)
            const newContact: Contact = {
              id: payload.fromId,
              displayName: payload.fromId,
              subscription: { endpoint: "", keys: { p256dh: "", auth: "" } },
              vapidPublicJwk: {},
              vapidPrivateJwk: {},
            };
            console.log("[app] ✅ Contato criado automaticamente:", newContact);
            persistContacts([...contacts.value, newContact]);
          } else {
            console.log("[app] ℹ️ Contato já existe:", payload.fromId);
          }
        } else {
          console.warn("[app] ⚠️ Payload inválido:", { text: payload.text, fromId: payload.fromId, myIdentity: !!myIdentity.value });
        }
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);

    const interval = setInterval(() => {
      pollPendingMessages();
    }, 120000); // repeat interval to check for pending messages every 120 seconds

    pollPendingMessages();

    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
      clearInterval(interval);
    };
  }, []);

  async function createIdentity() {
    console.log("🆔 [app] ===== CRIANDO NOVA IDENTIDADE =====");
    try {
      console.log("🔑 [app] Gerando chaves VAPID...");
      const vapidKeys = await generateVapidKeys();
      console.log("🔑 [app] ✅ Chaves VAPID geradas:");
      console.log("   Public JWK:", JSON.stringify(vapidKeys.publicJwk, null, 2));
      console.log("   Private JWK (parcial):", JSON.stringify({
        kty: vapidKeys.privateJwk.kty,
        crv: vapidKeys.privateJwk.crv,
        d: vapidKeys.privateJwk.d?.slice(0, 20) + "...",
        x: vapidKeys.privateJwk.x,
        y: vapidKeys.privateJwk.y
      }, null, 2));
      
      console.log("🆔 [app] Gerando ID único...");
      const id = generateId();
      console.log("🆔 [app] ✅ ID gerado:", id);
      
      console.log("📡 [app] Registrando Service Worker...");
      const registration = await registerServiceWorker();
      console.log("📡 [app] ✅ SW registrado:", registration.scope);
      
      console.log("🔔 [app] ===== CRIANDO SUBSCRIPTION PUSH =====");
      console.log("🔔 [app] Usando VAPID public JWK para subscription:");
      console.log("   kty:", vapidKeys.publicJwk.kty);
      console.log("   crv:", vapidKeys.publicJwk.crv);
      console.log("   x:", vapidKeys.publicJwk.x);
      console.log("   y:", vapidKeys.publicJwk.y);
      
      const subscription = await subscribePushManager(registration, vapidKeys.publicJwk);
      console.log("✅ [app] Subscription criada com sucesso!");
      console.log("📡 [app] Endpoint:", subscription.endpoint);
      console.log("🔑 [app] Subscription keys:");
      console.log("   p256dh:", subscription.keys.p256dh);
      console.log("   auth:", subscription.keys.auth);
      console.log("🔔 [app] ===== FIM SUBSCRIPTION PUSH =====");
      
      const identity: Identity = {
        id,
        displayName: "Você",
        subscription,
        vapidPublicJwk: vapidKeys.publicJwk,
        vapidPrivateJwk: vapidKeys.privateJwk,
      };
      
      console.log("💾 [app] ===== IDENTIDADE SALVA (DADOS COMPLETOS) =====");
      console.log("📦 Objeto identity completo:");
      console.log("   id:", identity.id);
      console.log("   displayName:", identity.displayName);
      console.log("   subscription.endpoint:", identity.subscription.endpoint);
      console.log("   subscription.keys.p256dh:", identity.subscription.keys.p256dh);
      console.log("   subscription.keys.auth:", identity.subscription.keys.auth);
      console.log("   vapidPublicJwk:", JSON.stringify(identity.vapidPublicJwk, null, 2));
      console.log("   vapidPrivateJwk:", JSON.stringify(identity.vapidPrivateJwk, null, 2));
      
      console.log("📦 Pacote identidade (Base64):");
      const packed = packIdentity(identity);
      console.log(packed);
      
      console.log("📦 Pacote identidade (JSON descompactado):");
      console.log(JSON.stringify(JSON.parse(atob(packed)), null, 2));
      console.log("💾 [app] ================================================");
      
      myIdentity.value = identity;
      identityPacked.value = packed;
      await set(STORE_KEYS.myIdentity, identity);
      status.value = `Pronto. ID: ${id}`;
      console.log("✅ [app] Identidade criada e persistida com sucesso!");
      console.log("🆔 [app] Novo ID:", id);
      console.log("📋 [app] Pacote identidade (copie para seus contatos):");
      console.log(packed);
      console.log("🆔 [app] ===== FIM CRIAÇÃO IDENTIDADE =====");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("❌ [app] Erro ao criar identidade:", err);
      status.value = `❌ Erro ao criar identidade: ${msg}`;
    }
  }

  async function updateMyDisplayName(name: string) {
    if (!myIdentity.value) return;
    const next = { ...myIdentity.value, displayName: name };
    myIdentity.value = next;
    identityPacked.value = packIdentity(next);
    await set(STORE_KEYS.myIdentity, next);
  }

  async function pollPendingMessages() {
    if (!myIdentity.value) return;
    console.log("[app] 🔍 Iniciando poll de mensagens pendentes...");
    try {
      const endpoint = encodeURIComponent(myIdentity.value.subscription.endpoint);
      console.log("[app] 📡 Consultando servidor:", `/pending?endpoint=${endpoint.slice(0, 30)}...`);
      const response = await fetch(`/pending?endpoint=${endpoint}`);
      console.log("[app] 📨 Status da resposta:", response.status);
      if (!response.ok) {
        console.log("[app] ℹ️ Nenhuma mensagem pendente (status:", response.status + ")");
        return;
      }
      const data = await response.json();
      console.log("[app] 📦 Dados recebidos:", JSON.stringify(data).slice(0, 200));
      if (!Array.isArray(data.messages)) {
        console.warn("[app] ⚠️ Formato inesperado de dados:", data);
        return;
      }

      const incomingMessages: Message[] = [];
      for (const item of data.messages) {
        let payload: { text?: string; fromId?: string } = {};
        try {
          payload = JSON.parse(item as string);
        } catch {
          continue;
        }
        if (payload.text && payload.fromId) {
          console.log("[app] 📨 Mensagem do poll de:", payload.fromId, "-", payload.text.slice(0, 50));
          incomingMessages.push({
            text: payload.text,
            fromId: payload.fromId,
            toId: myIdentity.value!.id,
            timestamp: Date.now(),
          });
        }
      }

      if (incomingMessages.length > 0) {
        console.log("[app] 💾 Salvando", incomingMessages.length, "novas mensagens...");
        await persistMessages([...messages.value, ...incomingMessages]);
        
        // Cadastra contatos automaticamente se não existirem
        for (const msg of incomingMessages) {
          const contactExists = contacts.value.some((c) => c.id === msg.fromId);
          if (!contactExists) {
            console.log("[app] 📬 Novo contato detectado (poll):", msg.fromId);
            const newContact: Contact = {
              id: msg.fromId,
              displayName: msg.fromId,
              subscription: { endpoint: "", keys: { p256dh: "", auth: "" } },
              vapidPublicJwk: {},
              vapidPrivateJwk: {},
            };
            await persistContacts([...contacts.value, newContact]);
          }
        }
      } else {
        console.log("[app] ℹ️ Nenhuma nova mensagem encontrada");
      }
    } catch (err) {
      console.error("[app] ❌ Erro no poll:", err instanceof Error ? err.message : String(err));
    }
  }

  async function persistContacts(next: Contact[]) {
    contacts.value = next;
    await set(STORE_KEYS.contacts, next);
  }

  async function persistSelectedContactId(id: string) {
    selectedContactId.value = id;
    await set(STORE_KEYS.selectedContactId, id);
  }

  async function persistMessages(next: Message[]) {
    messages.value = next;
    await set(STORE_KEYS.messages, next);
  }

  async function renewIdentity() {
    console.log("[app] 🔄 ===== RENOVANDO IDENTIDADE =====");
    
    // Limpa todos os dados persistidos
    console.log("[app] 🧹 Limpando contatos...");
    await set(STORE_KEYS.contacts, []);
    console.log("[app] 🧹 Limpando contato selecionado...");
    await set(STORE_KEYS.selectedContactId, "");
    console.log("[app] 🧹 Limpando mensagens...");
    await set(STORE_KEYS.messages, []);
    
    // Gera nova identidade
    console.log("[app] 🔑 Gerando novas chaves VAPID...");
    const vapidKeys = await generateVapidKeys();
    console.log("🔑 [app] ✅ Novas chaves VAPID geradas:");
    console.log("   Public JWK:", JSON.stringify(vapidKeys.publicJwk, null, 2));
    console.log("   Private JWK (parcial):", JSON.stringify({
      kty: vapidKeys.privateJwk.kty,
      crv: vapidKeys.privateJwk.crv,
      d: vapidKeys.privateJwk.d?.slice(0, 20) + "...",
      x: vapidKeys.privateJwk.x,
      y: vapidKeys.privateJwk.y
    }, null, 2));
    
    console.log("[app] 🆔 Gerando novo ID único...");
    const id = generateId();
    console.log("[app] 🆔 ✅ Novo ID:", id);
    
    console.log("[app] 📡 Registrando Service Worker...");
    const registration = await registerServiceWorker();
    console.log("[app] 📡 ✅ SW registrado:", registration.scope);
    
    console.log("[app] 🔔 ===== CRIANDO NOVA SUBSCRIPTION PUSH =====");
    console.log("[app] 🔔 Usando NOVA VAPID public JWK:");
    console.log("   kty:", vapidKeys.publicJwk.kty);
    console.log("   crv:", vapidKeys.publicJwk.crv);
    console.log("   x:", vapidKeys.publicJwk.x);
    console.log("   y:", vapidKeys.publicJwk.y);
    
    const subscription = await subscribePushManager(registration, vapidKeys.publicJwk);
    console.log("[app] ✅ Subscription criada:", subscription.endpoint);
    console.log("[app] 🔑 Subscription keys:");
    console.log("   p256dh:", subscription.keys.p256dh);
    console.log("   auth:", subscription.keys.auth);
    console.log("[app] 🔔 ===== FIM SUBSCRIPTION PUSH =====");
    
    const identity: Identity = {
      id,
      displayName: "Você",
      subscription,
      vapidPublicJwk: vapidKeys.publicJwk,
      vapidPrivateJwk: vapidKeys.privateJwk,
    };
    
    console.log("💾 [app] ===== NOVA IDENTIDADE SALVA (DADOS COMPLETOS) =====");
    console.log("📦 Objeto identity completo:");
    console.log("   id:", identity.id);
    console.log("   displayName:", identity.displayName);
    console.log("   subscription.endpoint:", identity.subscription.endpoint);
    console.log("   subscription.keys.p256dh:", identity.subscription.keys.p256dh);
    console.log("   subscription.keys.auth:", identity.subscription.keys.auth);
    console.log("   vapidPublicJwk:", JSON.stringify(identity.vapidPublicJwk, null, 2));
    console.log("   vapidPrivateJwk:", JSON.stringify(identity.vapidPrivateJwk, null, 2));
    
    console.log("📦 Pacote identidade (Base64):");
    const packed = packIdentity(identity);
    console.log(packed);
    
    console.log("📦 Pacote identidade (JSON descompactado):");
    console.log(JSON.stringify(JSON.parse(atob(packed)), null, 2));
    console.log("💾 [app] ======================================================");
    
    // Atualiza estado em memória
    console.log("[app] 💾 Atualizando estado em memória...");
    myIdentity.value = identity;
    identityPacked.value = packed;
    contacts.value = [];
    selectedContactId.value = "";
    messages.value = [];
    
    // Persiste nova identidade
    console.log("[app] 💾 Persistindo nova identidade no IndexedDB...");
    await set(STORE_KEYS.myIdentity, identity);
    
    console.log("✅ [app] Identidade renovada com sucesso!");
    console.log("✅ [app] Novo ID:", id);
    console.log("✅ [app] Novo endpoint:", subscription.endpoint);
    console.log("📋 [app] NOVO pacote identidade (REEXPORTE para contatos):");
    console.log(packIdentity(identity));
    console.log("[app] 🔄 ===== FIM RENOVAÇÃO IDENTIDADE =====");
    
    status.value = `🆔 Identidade renovada! Novo ID: ${id}`;
    
    // Recarrega a página para aplicar todas as mudanças
    console.log("[app] ⏳ Recarregando página em 1 segundo...");
    setTimeout(() => {
      console.log("[app] 🔄 Recarregando página agora...");
      location.reload();
    }, 1000);
  }

  function deleteContact(contactId: string) {
    console.log("🗑️ [app] Iniciando exclusão de contato:", contactId);
    
    // Remove mensagens deste contato
    const messagesToRemove = messages.value.filter((msg) => {
      const otherId = msg.fromId === (myIdentity.value?.id ?? "") ? msg.toId : msg.fromId;
      return otherId === contactId;
    });
    console.log("🗑️ [app] Mensagens a serem excluídas:", messagesToRemove.length);
    
    messages.value = messages.value.filter((msg) => {
      const otherId = msg.fromId === (myIdentity.value?.id ?? "") ? msg.toId : msg.fromId;
      return otherId !== contactId;
    });
    persistMessages(messages.value);
    console.log("✅ [app] Mensagens do contato removidas");
    
    // Remove contato da lista
    const removedContact = contacts.value.find((c) => c.id === contactId);
    contacts.value = contacts.value.filter((c) => c.id !== contactId);
    persistContacts(contacts.value);
    console.log("✅ [app] Contato removido:", removedContact?.displayName || contactId);
    
    // Limpa contato selecionado se for o excluído
    if (selectedContactId.value === contactId) {
      console.log("📱 [app] Contato excluído estava selecionado, limpando seleção...");
      selectedContactId.value = "";
      persistSelectedContactId("");
      mobileView.value = "contacts";
    }
    
    status.value = `Contato excluído`;
    console.log("✅ [app] Exclusão concluída!");
  }

  function ensureContact(contact: Contact) {
    const exists = contacts.value.some((c) => c.id === contact.id);
    if (!exists) {
      console.log("➡️ [app] Contato adicionado à lista:", contact.displayName, "(" + contact.id + ")");
      persistContacts([...contacts.value, contact]);
    } else {
      console.log("ℹ️ [app] Contato já existe na lista:", contact.displayName);
    }
  }

  async function addNewContact() {
    if (!newContactPack.value.trim()) {
      console.warn("[app] ⚠️ Pacote de identidade vazio!");
      return;
    }
    try {
      console.log("[app] ➕ ===== ADICIONANDO NOVO CONTATO =====");
      console.log("[app] 📦 Pacote recebido:", newContactPack.value.trim());
      
      const identity = unpackIdentity(newContactPack.value.trim());
      console.log("[app] 📦 Pacote descompactado:");
      console.log("   id:", identity.id);
      console.log("   displayName:", identity.displayName);
      console.log("   subscription.endpoint:", identity.subscription.endpoint);
      console.log("   subscription.keys.p256dh:", identity.subscription.keys.p256dh);
      console.log("   subscription.keys.auth:", identity.subscription.keys.auth);
      console.log("   vapidPublicJwk:", JSON.stringify(identity.vapidPublicJwk, null, 2));
      console.log("   vapidPrivateJwk (parcial):", JSON.stringify({
        kty: identity.vapidPrivateJwk.kty,
        crv: identity.vapidPrivateJwk.crv,
        d: identity.vapidPrivateJwk.d?.slice(0, 20) + "..."
      }, null, 2));
      
      if (!identity.id || !identity.subscription || !identity.vapidPublicJwk || !identity.vapidPrivateJwk) {
        throw new Error("Pacote inválido - faltam campos obrigatórios");
      }
      const contact = identityToContact(identity);
      const providedName = newContactName.value.trim();
      contact.displayName = providedName || identity.displayName || contact.id;
      
      console.log("[app] ✅ Contato criado com as seguintes chaves:");
      console.log("   ID:", contact.id);
      console.log("   Nome:", contact.displayName);
      console.log("   Endpoint:", contact.subscription.endpoint);
      console.log("   🔑 subscription.keys.p256dh:", contact.subscription.keys.p256dh);
      console.log("   🔑 subscription.keys.auth:", contact.subscription.keys.auth);
      console.log("   🔑 vapidPublicJwk (para assinar mensagens):");
      console.log("      kty:", contact.vapidPublicJwk.kty);
      console.log("      crv:", contact.vapidPublicJwk.crv);
      console.log("      x:", contact.vapidPublicJwk.x);
      console.log("      y:", contact.vapidPublicJwk.y);
      console.log("   🔑 vapidPrivateJwk (para assinar JWT VAPID):");
      console.log("      kty:", contact.vapidPrivateJwk.kty);
      console.log("      crv:", contact.vapidPrivateJwk.crv);
      console.log("      d:", contact.vapidPrivateJwk.d?.slice(0, 20) + "...");
      
      ensureContact(contact);
      await persistSelectedContactId(contact.id);
      newContactPack.value = "";
      newContactName.value = "";
      mobileView.value = "chat";
      status.value = `Contato adicionado: ${contact.displayName}`;
      console.log("[app] 🎉 Contato adicionado com sucesso!");
      console.log("[app] ➕ ===== FIM ADIÇÃO CONTATO =====");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[app] ❌ Erro ao adicionar contato:", err);
      status.value = `Erro ao adicionar contato: ${msg}`;
    }
  }

  async function selectContact(id: string) {
    const contact = contacts.value.find((c) => c.id === id);
    console.log("📱 [app] Selecionando contato:", contact?.displayName || id, "(" + id + ")");
    await persistSelectedContactId(id);
    mobileView.value = "chat";
  }

  function backToContacts() {
    mobileView.value = "contacts";
    console.log("📑 [app] Voltando para lista de contatos");
  }

  async function sendMessage() {
    if (!selectedContactId.value.trim()) {
      console.warn("[app] ⚠️ Nenhum contato selecionado!");
      return;
    }
    if (!messageText.value.trim()) {
      console.warn("[app] ⚠️ Mensagem vazia!");
      return;
    }
    if (!myIdentity.value) {
      console.error("[app] ❌ Identidade não carregada!");
      return;
    }

    const contact = contacts.value.find((c) => c.id === selectedContactId.value);
    if (!contact) {
      console.error("[app] ❌ Contato não encontrado:", selectedContactId.value);
      return;
    }

    const fromId = myIdentity.value.id;
    const toId = contact.id;
    const text = messageText.value.trim();

    console.log("📤 [app] ===== ENVIANDO MENSAGEM =====");
    console.log("📤 [app] De:", fromId);
    console.log("📤 [app] Para:", toId);
    console.log("📤 [app] Texto:", text);
    
    console.log("🔑 [app] ===== CHAVES DO CONTATO (DESTINATÁRIO) =====");
    console.log("🔑 [app] subscription.endpoint:", contact.subscription.endpoint);
    console.log("🔑 [app] subscription.keys.p256dh (chave pública do navegador dele):", contact.subscription.keys.p256dh);
    console.log("🔑 [app] subscription.keys.auth (segredo de autenticação dele):", contact.subscription.keys.auth);
    console.log("🔑 [app] vapidPublicJwk (usado para verificar assinatura JWT):");
    console.log("   kty:", contact.vapidPublicJwk.kty);
    console.log("   crv:", contact.vapidPublicJwk.crv);
    console.log("   x:", contact.vapidPublicJwk.x);
    console.log("   y:", contact.vapidPublicJwk.y);
    console.log("🔑 [app] vapidPrivateJwk (usado para ASSINAR JWT VAPID):");
    console.log("   kty:", contact.vapidPrivateJwk.kty);
    console.log("   crv:", contact.vapidPrivateJwk.crv);
    console.log("   d:", contact.vapidPrivateJwk.d?.slice(0, 30) + "...");
    console.log("🔑 [app] ===========================================");

    console.log("📡 [app] Endpoint:", contact.subscription.endpoint.slice(0, 50) + "...");

    try {
      console.log("🔐 [app] Criptografando payload com chaves do contato...");
      const result = await sendPushMessage(contact, text, fromId);
      console.log("📨 [app] Resultado do envio:", result);
      
      if (!result.ok) {
        console.error("❌ [app] Falha ao enviar:", result.error ?? "desconhecido");
        status.value = `Erro ao enviar: ${result.error ?? "desconhecido"}`;
        return;
      }

      await persistMessages([...messages.value, { text, fromId, toId, timestamp: Date.now() }]);
      messageText.value = "";
      const msgType = result.fallback ? "via proxy (fallback)" : "diretamente";
      console.log("✅ [app] Mensagem enviada com sucesso!", msgType);
      console.log("📤 [app] ===== FIM ENVIO MENSAGEM =====");
      status.value = `Mensagem enviada ${msgType}`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("❌ [app] Erro ao enviar:", err);
      status.value = `Erro ao enviar: ${msg}`;
    }
  }

  async function copyMyIdentity() {
    if (!myIdentity.value) {
      console.warn("[app] ⚠️ Identidade não carregada para cópia!");
      return;
    }
    try {
      const packed = identityPacked.value || packIdentity(myIdentity.value);
      console.log("📋 [app] ===== COPIANDO IDENTIDADE =====");
      console.log("📦 Conteúdo sendo copiado (Base64):");
      console.log(packed);
      console.log("📦 Conteúdo descompactado:");
      console.log(JSON.stringify(JSON.parse(atob(packed)), null, 2));
      
      await navigator.clipboard.writeText(packed);
      console.log("✅ [app] Identidade copiada para área de transferência!");
      console.log("📋 [app] =================================");
    } catch (err) {
      console.error("❌ [app] Erro ao copiar:", err instanceof Error ? err.message : String(err));
    }
  }

  const filteredMessages = messages.value
    .filter((msg) => {
      const otherId = msg.fromId === (myIdentity.value?.id ?? "") ? msg.toId : msg.fromId;
      return otherId === selectedContactId.value;
    })
    .sort((a, b) => a.timestamp - b.timestamp);

  const selectedContact = contacts.value.find((c) => c.id === selectedContactId.value);
  const appClass = `app ${mobileView.value === "chat" ? "mobile-chat" : "mobile-contacts"}`;

  if (!loaded.value) {
    return <div class={appClass}><p class="empty">Carregando...</p></div>;
  }

  return (
    <div class={appClass}>
      <aside class="sidebar">
        <div class="sidebar-header">
          <h1 class="app-title">Loco Push</h1>

          <div class="my-identity">
            <md-outlined-text-field
              label="Seu nome"
              value={myIdentity.value?.displayName ?? "Você"}
              onInput={(e: Event) => {
                const name = (e.target as HTMLInputElement).value;
                updateMyDisplayName(name);
              }}
              style={{ flex: 1, fontSize: "0.85rem" }}
            ></md-outlined-text-field>
            <md-icon-button aria-label="Copiar identidade" onClick={copyMyIdentity}>
              <md-icon>content_copy</md-icon>
            </md-icon-button>
            <md-icon-button aria-label="Detalhes da identidade" onClick={() => (showIdentityDetails.value = !showIdentityDetails.value)}>
              <md-icon>{showIdentityDetails.value ? "expand_less" : "expand_more"}</md-icon>
            </md-icon-button>
          </div>

          {showIdentityDetails.value && (
            <div class="identity-details">
              <div class="detail-row">
                <span class="detail-label">ID técnico:</span>
                <span class="detail-value">{myIdentity.value?.id}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Endpoint:</span>
                <span class="detail-value" style={{ fontSize: "0.7rem", wordBreak: "break-all" }}>
                  {myIdentity.value?.subscription.endpoint}
                </span>
              </div>
            </div>
          )}

          <p class="status">{status.value}</p>

          <md-filled-button onClick={copyMyIdentity} style={{ marginTop: "8px" }}>
            📋 Copiar meu pacote de identidade
          </md-filled-button>

          <md-text-button
            onClick={async () => {
              console.log("🔄 [app] ===== RENOVANDO SUBSCRIPTION MANUALMENTE =====");
              console.log("🔑 Usando VAPID public JWK atual:", JSON.stringify(myIdentity.value!.vapidPublicJwk, null, 2));
              
              const registration = await registerServiceWorker();
              const newSub = await subscribePushManager(registration, myIdentity.value!.vapidPublicJwk);
              
              console.log("✅ Subscription renovada:", newSub.endpoint);
              console.log("🔑 Nova subscription keys:");
              console.log("   p256dh:", newSub.keys.p256dh);
              console.log("   auth:", newSub.keys.auth);
              
              const updated = { ...myIdentity.value!, subscription: newSub };
              console.log("📦 Identidade atualizada com nova subscription:");
              console.log("   id:", updated.id);
              console.log("   displayName:", updated.displayName);
              console.log("   subscription.endpoint:", updated.subscription.endpoint);
              console.log("   subscription.keys.p256dh:", updated.subscription.keys.p256dh);
              console.log("   subscription.keys.auth:", updated.subscription.keys.auth);
              console.log("   vapidPublicJwk:", JSON.stringify(updated.vapidPublicJwk, null, 2));
              console.log("   vapidPrivateJwk:", JSON.stringify(updated.vapidPrivateJwk, null, 2));
              
              myIdentity.value = updated;
              identityPacked.value = packIdentity(updated);
              await set(STORE_KEYS.myIdentity, updated);
              
              console.log("📦 Pacote identidade atualizado (REEXPORTE):");
              console.log(packIdentity(updated));
              console.log("🔄 [app] =====================================================");
              
              status.value = `✅ Subscription renovada manualmente. Reexporte seu pacote!`;
              console.log("[app] subscription renovada manualmente:", newSub.endpoint);
            }}
            style={{ marginTop: "4px", fontSize: "0.75rem" }}
          >
            🔄 Renovar subscription
          </md-text-button>

          <md-text-button
            onClick={async () => {
              if (confirm("⚠️ Tem certeza que deseja renovar sua identidade? Todos os contatos e mensagens serão perdidos.")) {
                await renewIdentity();
              }
            }}
            style={{ marginTop: "4px", fontSize: "0.75rem", "--md-sys-color-primary": "var(--md-sys-color-error)" } as any}
          >
            ⚠️ Renovar Identidade
          </md-text-button>
        </div>

        <div class="add-contact">
          <div class="add-contact-fields">
            <md-outlined-text-field
              label="Cole o pacote do contato"
              value={newContactPack.value}
              onInput={(e: Event) => {
                newContactPack.value = (e.target as HTMLInputElement).value;
              }}
              style={{ width: "100%" }}
            ></md-outlined-text-field>
            <md-outlined-text-field
              label="Nome do contato (opcional)"
              value={newContactName.value}
              onInput={(e: Event) => {
                newContactName.value = (e.target as HTMLInputElement).value;
              }}
              style={{ width: "100%" }}
            ></md-outlined-text-field>
          </div>
          <md-filled-button type="button" onClick={addNewContact}>
            +
          </md-filled-button>
        </div>

        <div class="contact-list">
          {contacts.value.length === 0 && <p class="empty">Nenhum contato ainda.</p>}
          {contacts.value.map((contact) => {
            const lastMessage = messages.value
              .filter((msg) => {
                const otherId = msg.fromId === (myIdentity.value?.id ?? "") ? msg.toId : msg.fromId;
                return otherId === contact.id;
              })
              .sort((a, b) => b.timestamp - a.timestamp)[0];
            return (
              <div
                key={contact.id}
                class={`contact ${selectedContactId.value === contact.id ? "active" : ""}`}
              >
                <div
                  style={{ display: "flex", alignItems: "center", flex: 1 }}
                  onClick={() => selectContact(contact.id)}
                >
                  <div class="contact-avatar">{getContactDisplayName(contact).slice(0, 2).toUpperCase()}</div>
                  <div class="contact-info">
                    <div class="contact-name">{getContactDisplayName(contact)}</div>
                    <div class="contact-id">{contact.id}</div>
                    <div class="contact-preview">
                      {lastMessage ? `${lastMessage.fromId === (myIdentity.value?.id ?? "") ? "Você: " : ""}${lastMessage.text}` : "Sem mensagens"}
                    </div>
                  </div>
                </div>
                <md-icon-button
                  aria-label="Excluir contato"
                  onClick={(e: Event) => {
                    e.stopPropagation();
                    if (confirm(`Excluir "${getContactDisplayName(contact)}" e todas as suas mensagens?`)) {
                      deleteContact(contact.id);
                    }
                  }}
                  style={{ "--md-sys-color-primary": "var(--md-sys-color-error)" } as any}
                >
                  <md-icon>delete</md-icon>
                </md-icon-button>
              </div>
            );
          })}
        </div>
      </aside>

      <main class="chat">
        {!selectedContactId.value ? (
          <div class="chat-placeholder">
            <p>Selecione um contato para começar a conversar.</p>
          </div>
        ) : (
          <>
            <header class="chat-header">
              <md-icon-button aria-label="Voltar" class="back-button" onClick={backToContacts}>
                <md-icon>arrow_back</md-icon>
              </md-icon-button>
              <div class="contact-avatar">{getContactDisplayName(selectedContact).slice(0, 2).toUpperCase()}</div>
              <div class="contact-info" style={{ flex: 1 }}>
                <div class="contact-name">{getContactDisplayName(selectedContact)}</div>
                <div class="contact-id">{selectedContact?.id}</div>
              </div>
              <md-icon-button
                aria-label="Excluir contato"
                onClick={(e: Event) => {
                  if (confirm(`Excluir "${getContactDisplayName(selectedContact)}" e todas as suas mensagens?`)) {
                    deleteContact(selectedContact!.id);
                  }
                }}
                style={{ "--md-sys-color-primary": "var(--md-sys-color-error)" } as any}
              >
                <md-icon>delete</md-icon>
              </md-icon-button>
            </header>

            <div class="chat-messages">
              {filteredMessages.length === 0 && (
                <p class="empty">Nenhuma mensagem ainda.</p>
              )}
              {filteredMessages.map((msg, idx) => (
                <div key={idx} class={`message-bubble ${msg.fromId === (myIdentity.value?.id ?? "") ? "me" : "other"}`}>
                  <span class="message-text">{msg.text}</span>
                  <span class="message-time">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        <div class="chat-input" style={{ display: selectedContactId.value ? "flex" : "none" }}>
          <md-outlined-text-field
            label="Mensagem"
            value={messageText.value}
            onInput={(e: Event) => {
              messageText.value = (e.target as HTMLInputElement).value;
            }}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "Enter") sendMessage();
            }}
            style={{ flex: 1 }}
          ></md-outlined-text-field>
          <md-filled-button type="button" onClick={sendMessage}>
            Enviar
          </md-filled-button>
        </div>
      </main>

      {/* Painel de logs visível */}
      <div class="debug-panel">
        <div class="debug-panel-header">
          <button
            onClick={() => {
              showLogs.value = !showLogs.value;
            }}
            style={{ background: "transparent", border: "none", color: "white", cursor: "pointer", fontSize: "1rem" }}
          >
            {showLogs.value ? "▲ LOGS" : "▼ LOGS"} ({logLines.value.length})
          </button>
          <button
            onClick={(e) => {
              navigator.clipboard.writeText(logLines.value.join("\n"));
              const btn = e.currentTarget as HTMLElement;
              btn.textContent = "✓ Copiado!";
              setTimeout(() => { btn.textContent = "📋 Copiar"; }, 1500);
            }}
            style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "white", cursor: "pointer", borderRadius: "4px", padding: "2px 8px", marginLeft: "8px", fontSize: "0.75rem" }}
          >
            📋 Copiar
          </button>
        </div>
        {showLogs.value && (
          <div class="debug-logs" ref={(node) => { if (node) node.scrollTop = node.scrollHeight; }}>
            {logLines.value.map((line, i) => (
              <div key={i} class={`debug-line ${line.includes("ERROR") ? "error" : ""} ${line.includes("WARN") ? "warn" : ""}`}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const app = document.getElementById("app");
if (app) {
  try {
    app.innerHTML = "";
    render(<App />, app);
  } catch (err) {
    app.innerHTML = `<pre style="color:red;white-space:pre-wrap">${err instanceof Error ? err.stack || err.message : String(err)}</pre>`;
    console.error(err);
  }
}
