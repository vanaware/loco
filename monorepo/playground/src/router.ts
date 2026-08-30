// Arquivo: monorepo/playground/src/router.ts
import { signal } from "@preact/signals";

export type Route = "chats" | "contacts" | "settings";

export interface RouteConfig {
  id: Route;
  label: string;
  icon: string;
  title: string;
}

/**
 * REGISTRO CENTRAL DE ROTAS (SSOT para Navegação e UI)
 */
export const ROUTES: RouteConfig[] = [
  { id: "chats", label: "Conversas", icon: "chat", title: "Mensagens E2EE" },
  { id: "contacts", label: "Contatos", icon: "group", title: "Contatos P2P" },
  { id: "settings", label: "Ajustes", icon: "settings", title: "Ajustes e Segurança" },
];

const VALID_ROUTES = ROUTES.map((r) => r.id);

/**
 * Função pura para extrair e validar a rota a partir de uma string de hash.
 * Exportada para permitir testes unitários isolados sem dependência do `window.location`.
 */
export function parseHash(hash: string): Route {
  const rawHash = hash.replace(/^#\/?/, "");
  if (rawHash && VALID_ROUTES.includes(rawHash as Route)) {
    return rawHash as Route;
  }
  return "chats";
}

function parseRoute(): Route {
  if (typeof globalThis.location === "undefined") {
    return "chats";
  }
  return parseHash(globalThis.location.hash);
}

// O Signal limpo e global
export const activeRoute = signal<Route>(parseRoute());

// Atualiza o estado quando a URL muda nativamente
if (typeof globalThis.window !== "undefined") {
  globalThis.addEventListener("hashchange", () => {
    activeRoute.value = parseRoute();
  });
}

// Mutação simples
export function navigateTo(route: Route) {
  if (typeof globalThis.location !== "undefined") {
    globalThis.location.hash = route;
  }
}