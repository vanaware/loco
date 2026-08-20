import { signal, computed } from "@preact/signals";

/**
 * Normaliza o caminho de navegação.
 * Caso o usuário acesse a raiz ("/") ou um caminho inválido,
 * redireciona o estado padrão para "/chats".
 */
export function normalizePath(path: string): string {
  if (!path || path === "/" || path.trim() === "") {
    return "/chats";
  }
  return path;
}

function getInitialPath(): string {
  if (typeof globalThis.location !== "undefined") {
    return normalizePath(globalThis.location.pathname);
  }
  return "/chats";
}

// Signal de estado reativo global para o caminho atual
export const currentPath = signal<string>(getInitialPath());

/**
 * Signal computado mantido no escopo do módulo.
 * Evita a destruição e recriação do sinal a cada renderização do Preact.
 */
export const activeRoute = computed(() => {
  const path = currentPath.value;
  if (path.startsWith("/contacts")) return "contacts";
  if (path.startsWith("/settings")) return "settings";
  return "chats";
});

/**
 * Navega para uma nova rota atualizando a History API e impedindo o reload da página.
 */
export function navigateTo(path: string, event?: Event): void {
  if (event) {
    event.preventDefault();
  }
  
  const targetPath = normalizePath(path);
  
  if (
    typeof globalThis.history !== "undefined" &&
    globalThis.location.pathname !== targetPath
  ) {
    globalThis.history.pushState({}, "", targetPath);
  }
  
  currentPath.value = targetPath;
}

// Escuta os botões "Voltar" e "Avançar" do navegador
if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("popstate", () => {
    const path = globalThis.location ? globalThis.location.pathname : "/chats";
    currentPath.value = normalizePath(path);
  });
}