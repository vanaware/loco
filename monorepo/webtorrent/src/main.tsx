// Arquivo: monorepo/webtorrent/src/main.tsx
import { render } from "preact";
import { App } from "./App.tsx";

const rootElement = document.getElementById("app");
if (rootElement) {
  render(<App />, rootElement);
  console.log("🚀 WebTorrent Test: Interface montada com sucesso.");
} else {
  console.error("❌ Elemento '#app' não encontrado.");
}