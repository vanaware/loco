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

function parseRoute(): Route {
  if (typeof globalThis.location === "undefined") {
    return "chats";
  }

  const rawHash = globalThis.location.hash.replace(/^#\/?/, "");
  if (rawHash && VALID_ROUTES.includes(rawHash as Route)) {
    return rawHash as Route;
  }
  return "chats";
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