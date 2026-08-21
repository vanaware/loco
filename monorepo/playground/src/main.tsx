// src/main.tsx
import { render } from "preact";
import { App } from "./App.tsx";


// Buscamos o contêiner principal definido no index.html
const rootElement = document.getElementById("app");

// Verificação de segurança estrutural
if (rootElement) {
  // Inicializa a árvore de componentes reativos do Preact
  render(<App />, rootElement);
  console.log("🚀 Loco PWA: Interface reativa e Custom Elements (BeerCSS v5) montados com sucesso.");
} else {
  // Log de erro claro para facilitar o processo de depuração
  console.error("❌ Loco PWA Erro Fatal: Elemento de montagem '#app' não encontrado no DOM. Verifique a estrutura do arquivo index.html.");
}