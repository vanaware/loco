// src/router.ts
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
  const rawHash = window.location.hash.replace(/^#\/?/, "");
  if (rawHash && VALID_ROUTES.includes(rawHash as Route)) {
    return rawHash as Route;
  }
  return "chats";
}

export const activeRoute = signal<Route>(parseRoute());

// Escuta mudanças na URL nativa para atualizar o estado global
window.addEventListener("hashchange", () => {
  activeRoute.value = parseRoute();
});

// A mutação agora altera a Hash, o que dispara o listener acima
export function navigateTo(route: Route) {
  window.location.hash = route;
}