import { render } from "preact";
import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { get, set } from "idb-keyval";
import "@material/web/all.js";

interface PushMessage {
  title: string;
  text: string;
  fromId: string;
}

interface Message {
  text: string;
  fromId: string;
  toId: string;
  timestamp: number;
}

interface Contact {
  id: string;
  name?: string;
}

const STORE_KEYS = {
  myId: "push:myId",
  contacts: "push:contacts",
  selectedContactId: "push:selectedContactId",
  vapidPublicKey: "push:vapidPublicKey",
  messages: "push:messages",
} as const;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function generateId(): string {
  return crypto.randomUUID().slice(0, 8);
}

async function loadPersistedState() {
  try {
    const [myId, contacts, selectedContactId, vapidPublicKey, messages] = await Promise.all([
      get<string>(STORE_KEYS.myId),
      get<Contact[]>(STORE_KEYS.contacts),
      get<string>(STORE_KEYS.selectedContactId),
      get<string>(STORE_KEYS.vapidPublicKey),
      get<Message[]>(STORE_KEYS.messages),
    ]);
    return {
      myId: typeof myId === "string" ? myId : generateId(),
      contacts: Array.isArray(contacts) ? contacts : [] as Contact[],
      selectedContactId: typeof selectedContactId === "string" ? selectedContactId : "",
      vapidPublicKey: typeof vapidPublicKey === "string" ? vapidPublicKey : "",
      messages: Array.isArray(messages) ? messages : [] as Message[],
    };
  } catch {
    return {
      myId: generateId(),
      contacts: [] as Contact[],
      selectedContactId: "",
      vapidPublicKey: "",
      messages: [] as Message[],
    };
  }
}

function App() {
  const myId = useSignal<string>(generateId());
  const vapidPublicKey = useSignal<string>("");
  const contacts = useSignal<Contact[]>([]);
  const selectedContactId = useSignal<string>("");
  const newContactInput = useSignal<string>("");
  const messageText = useSignal<string>("");
  const status = useSignal<string>("Inicializando...");
  const messages = useSignal<Message[]>([]);
  const loaded = useSignal(false);
  const mobileView = useSignal<"contacts" | "chat">("contacts");

  useEffect(() => {
    loadPersistedState().then(async (state) => {
      myId.value = state.myId;
      contacts.value = state.contacts;
      selectedContactId.value = state.selectedContactId;
      vapidPublicKey.value = state.vapidPublicKey;
      messages.value = state.messages;
      await set(STORE_KEYS.myId, state.myId);
      loaded.value = true;
    });
    init();
  }, []);

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

  function ensureContact(id: string) {
    if (!id) return;
    const exists = contacts.value.some((c) => c.id === id);
    if (!exists) {
      persistContacts([...contacts.value, { id }]).catch(console.error);
    }
  }

  async function init() {
    try {
      const vapidRes = await fetch("/vapid");
      const vapid = await vapidRes.json() as { publicKey: string };
      vapidPublicKey.value = vapid.publicKey;
      await set(STORE_KEYS.vapidPublicKey, vapid.publicKey);

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        status.value = "Permissão de notificação negada";
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid.publicKey) as BufferSource,
        });
      }

      await fetch("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: myId.value, subscription: subscription.toJSON() }),
      });

      status.value = `Pronto. ID: ${myId.value}`;

      navigator.serviceWorker.addEventListener("message", (event) => {
        const data = event.data as { type?: string; payload?: PushMessage };
        if (data.type === "PUSH_MESSAGE" && data.payload) {
          const fromId = data.payload.fromId;
          ensureContact(fromId);
          persistSelectedContactId(fromId);
          persistMessages([...messages.value, {
            text: data.payload.text,
            fromId,
            toId: myId.value,
            timestamp: Date.now(),
          }]).catch(console.error);
          mobileView.value = "chat";
        }
      });
    } catch (err) {
      status.value = `Erro: ${err instanceof Error ? err.message : String(err)}`;
      console.error(err);
    }
  }

  async function sendMessage() {
    if (!selectedContactId.value.trim() || !messageText.value.trim()) return;

    const toId = selectedContactId.value.trim();
    const fromId = myId.value;
    const text = messageText.value.trim();

    ensureContact(toId);

    if (toId !== fromId) {
      try {
        await fetch(`/send/${encodeURIComponent(toId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromId, text }),
        });
      } catch (err) {
        status.value = `Falha ao enviar: ${err instanceof Error ? err.message : String(err)}`;
        return;
      }
    }

    await persistMessages([...messages.value, {
      text,
      fromId,
      toId,
      timestamp: Date.now(),
    }]);
    messageText.value = "";
  }

  async function addNewContact() {
    const id = newContactInput.value.trim();
    if (!id) return;
    ensureContact(id);
    await persistSelectedContactId(id);
    newContactInput.value = "";
    mobileView.value = "chat";
  }

  async function selectContact(id: string) {
    await persistSelectedContactId(id);
    mobileView.value = "chat";
  }

  function backToContacts() {
    mobileView.value = "contacts";
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(myId.value);
    } catch {
      // ignore
    }
  }

  const filteredMessages = messages.value
    .filter((msg) => {
      const otherId = msg.fromId === myId.value ? msg.toId : msg.fromId;
      return otherId === selectedContactId.value;
    })
    .sort((a, b) => a.timestamp - b.timestamp);

  const selectedContact = contacts.value.find((c) => c.id === selectedContactId.value);
  const appClass = `app ${mobileView.value === "chat" ? "mobile-chat" : "mobile-contacts"}`;

  return (
    <div class={appClass}>
      <aside class="sidebar">
        <div class="sidebar-header">
          <h1 class="app-title">Loco Push</h1>
          <div class="my-id">
            <md-outlined-text-field
              value={myId.value}
              readonly
              style={{ flex: 1, fontSize: "0.85rem" }}
            ></md-outlined-text-field>
            <md-icon-button type="button" onClick={copyId}>📋</md-icon-button>
          </div>
          <p class="status">{status.value}</p>
        </div>

        <div class="add-contact">
          <md-outlined-text-field
            label="Novo contato"
            value={newContactInput.value}
            onInput={(e: Event) => {
              newContactInput.value = (e.target as HTMLInputElement).value;
            }}
            style={{ flex: 1 }}
          ></md-outlined-text-field>
          <md-filled-button type="button" onClick={addNewContact}>
            +
          </md-filled-button>
        </div>

        <div class="contact-list">
          {contacts.value.length === 0 && <p class="empty">Nenhum contato ainda.</p>}
          {contacts.value.map((contact) => {
            const lastMessage = messages.value
              .filter((msg) => {
                const otherId = msg.fromId === myId.value ? msg.toId : msg.fromId;
                return otherId === contact.id;
              })
              .sort((a, b) => b.timestamp - a.timestamp)[0];
            return (
              <div
                key={contact.id}
                class={`contact ${selectedContactId.value === contact.id ? "active" : ""}`}
                onClick={() => selectContact(contact.id)}
              >
                <div class="contact-avatar">{contact.id.slice(0, 2).toUpperCase()}</div>
                <div class="contact-info">
                  <div class="contact-name">{contact.id}</div>
                  <div class="contact-preview">
                    {lastMessage ? `${lastMessage.fromId === myId.value ? "Você: " : ""}${lastMessage.text}` : "Sem mensagens"}
                  </div>
                </div>
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
              <div class="contact-avatar">{selectedContact?.id.slice(0, 2).toUpperCase()}</div>
              <div class="contact-name">{selectedContact?.id}</div>
            </header>

            <div class="chat-messages">
              {filteredMessages.length === 0 && (
                <p class="empty">Nenhuma mensagem ainda.</p>
              )}
              {filteredMessages.map((msg, idx) => (
                <div key={idx} class={`message-bubble ${msg.fromId === myId.value ? "me" : "other"}`}>
                  <span class="message-text">{msg.text}</span>
                  <span class="message-time">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>

            <div class="chat-input">
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
          </>
        )}
      </main>
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
