import { render } from "preact";
import { useSignal } from "@preact/signals";

function App() {
  const count = useSignal(0);

  return (
    <div>
      <h1>Proto Template</h1>
      <p>
        Contador: <strong>{count.value}</strong>
      </p>
      <button type="button" onClick={() => count.value++}>Incrementar</button>
    </div>
  );
}

render(<App />, document.getElementById("app")!);
