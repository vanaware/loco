import { render } from "preact";
import { App } from "./App.tsx";

async function bootstrap() {
  // 1. Registra o Service Worker
  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      console.log("✅ Service Worker registrado:", reg.scope);
    } catch (err) {
      console.error("❌ Falha ao registrar SW:", err);
    }
  }

  // 2. Monta a UI
  const root = document.getElementById("app");
  if (root) {
    render(<App />, root);
  }
}

bootstrap();