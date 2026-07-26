import { render, h } from "preact";
import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { get, set } from "idb-keyval";
import "@material/web/all.js";

const STORE_KEYS = {
  count: "template:count",
  userName: "template:userName",
} as const;

async function loadPersistedState() {
  try {
    const [count, userName] = await Promise.all([
      get<number>(STORE_KEYS.count),
      get<string>(STORE_KEYS.userName),
    ]);
    return {
      count: typeof count === "number" ? count : 0,
      userName: typeof userName === "string" ? userName : "",
    };
  } catch {
    return { count: 0, userName: "" };
  }
}

function App() {
  const count = useSignal(0);
  const userName = useSignal("");
  const loaded = useSignal(false);

  useEffect(() => {
    loadPersistedState().then((state) => {
      count.value = state.count;
      userName.value = state.userName;
      loaded.value = true;
    });
  }, []);

  function increment() {
    count.value++;
    set(STORE_KEYS.count, count.value).catch(console.error);
  }

  function decrement() {
    count.value--;
    set(STORE_KEYS.count, count.value).catch(console.error);
  }

  function reset() {
    count.value = 0;
    set(STORE_KEYS.count, 0).catch(console.error);
  }

  function updateName(value: string) {
    userName.value = value;
    set(STORE_KEYS.userName, value).catch(console.error);
  }

  return h("main", { className: "container" },
    h("h1", { className: "title" }, "Proto Template"),
    h("p", { className: "subtitle" }, "Persistência com idb-keyval + UI Material"),

    h("div", { className: "card" },
      h("h2", { className: "card-title" }, "Dados persistidos"),

      h("md-outlined-text-field", {
        label: "Seu nome",
        value: userName.value,
        onInput: (e: Event) => updateName((e.target as HTMLInputElement).value),
      }),

      h("p", { className: "greeting" },
        userName.value ? `Olá, ${userName.value}!` : "Digite seu nome acima"
      ),

      h("div", { className: "counter-section" },
        h("p", { className: "count" },
          "Contador: ",
          h("strong", null, count.value)
        ),
        h("div", { className: "actions" },
          h("md-filled-button", { onClick: increment }, "+"),
          h("md-outlined-button", { onClick: decrement }, "-"),
          h("md-outlined-button", { onClick: reset }, "Reset")
        )
      ),

      !loaded.value && h("p", { className: "loading" }, "Carregando...")
    )
  );
}

const app = document.getElementById("app");
if (app) {
  try {
    app.innerHTML = "";
    render(h(App, {}), app);
  } catch (err) {
    app.innerHTML = `<pre style="color:red;white-space:pre-wrap">${err instanceof Error ? err.stack || err.message : String(err)}</pre>`;
    console.error(err);
  }
}
