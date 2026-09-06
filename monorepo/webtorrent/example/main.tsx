/**
 * main.tsx — Entry point do demo.
 * 1. Espera OPFS disponível
 * 2. Registra o Service Worker
 * 3. Monta a app Preact
 */
import { render } from "preact";
import { App } from "./app.tsx";
import { TorrentProvider } from "./torrent-context.tsx";

async function bootstrap() {
  // Garante que OPFS está disponível
  if (!navigator.storage?.getDirectory) {
    console.warn("[main] OPFS não disponível — usando MemoryChunkStore");
  }

  // Registra Service Worker
  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      console.log("[SW] Registered:", reg.scope);
    } catch (e) {
      console.error("[SW] Registration failed:", e);
    }
  }

  // Monta Preact
  render(
    <TorrentProvider>
      <App />
    </TorrentProvider>,
    document.getElementById("app")!,
  );
}

bootstrap().catch(console.error);
