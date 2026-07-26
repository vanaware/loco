import { render } from "preact";
import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

interface PushMessage {
  title: string;
  text: string;
  fromId: string;
}

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

function App() {
  const myId = useSignal<string>(generateId());
  const vapidPublicKey = useSignal<string>("");
  const targetId = useSignal<string>("");
  const messageText = useSignal<string>("");
  const status = useSignal<string>("Inicializando...");
  const messages = useSignal<Array<{ text: string; fromId: string; me: boolean }>>([]);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      const vapidRes = await fetch("/vapid");
      const vapid = await vapidRes.json() as { publicKey: string };
      vapidPublicKey.value = vapid.publicKey;

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
          messages.value = [...messages.value, {
            text: data.payload.text,
            fromId: data.payload.fromId,
            me: false,
          }];
        }
      });
    } catch (err) {
      status.value = `Erro: ${err instanceof Error ? err.message : String(err)}`;
      console.error(err);
    }
  }

  async function sendMessage() {
    if (!targetId.value.trim() || !messageText.value.trim()) return;

    const fromId = myId.value;
    const text = messageText.value.trim();

    // Exemplo no front-end: enviando através do seu próprio Deno
    //const urlDoProxy = `/proxy/${subscription.endpoint}`;
    //await fetch(urlDoProxy, { ... });


    try {
      await fetch(`/send/${encodeURIComponent(targetId.value.trim())}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromId, text }),
      });

      messages.value = [...messages.value, { text, fromId, me: true }];
      messageText.value = "";
    } catch (err) {
      status.value = `Falha ao enviar: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return (
    <div>
      <h1>PWA Push entre clientes</h1>
      <p class="status">{status.value}</p>

      <div class="card">
        <label>Meu ID</label>
        <div class="row">
          <input type="text" value={myId.value} readonly />
          <button type="button" onClick={() => navigator.clipboard.writeText(myId.value)}>Copiar</button>
        </div>
      </div>

      <div class="card">
        <label>Chave pública VAPID</label>
        <input class="mono" type="text" value={vapidPublicKey.value} readonly />
      </div>

      <div class="card">
        <label>ID do destinatário</label>
        <input
          type="text"
          value={targetId.value}
          onInput={(e) => {
            targetId.value = (e.target as HTMLInputElement).value;
          }}
          placeholder="Cole o ID do outro cliente"
        />
        <label style={{ marginTop: "0.75rem" }}>Mensagem</label>
        <textarea
          value={messageText.value}
          onInput={(e) => {
            messageText.value = (e.target as HTMLTextAreaElement).value;
          }}
          placeholder="Digite uma mensagem"
        />
        <button type="button" style={{ marginTop: "0.75rem" }} onClick={sendMessage}>Enviar via Push</button>
      </div>

      <div class="card">
        <h2>Mensagens</h2>
        {messages.value.length === 0 && <p>Nenhuma mensagem ainda.</p>}
        {messages.value.map((msg, idx) => (
          <div key={idx} class={`message ${msg.me ? "me" : "other"}`}>
            <strong>{msg.me ? "Eu" : msg.fromId}:</strong> {msg.text}
          </div>
        ))}
      </div>
    </div>
  );
}

//render(<App />, document.getElementById("app")!);

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
