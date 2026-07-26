import { render, h } from "preact";
import "preact/hooks";
import { useSignal } from "@preact/signals";

function App() {
  const count = useSignal(0);

  return h("div", null,
    h("h1", null, "Proto Template"),
    h("p", null, "Contador: ", h("strong", null, count.value)),
    h("button", { type: "button", onClick: () => count.value++ }, "Incrementar")
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
