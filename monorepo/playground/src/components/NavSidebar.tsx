import { activeRoute, navigateTo } from "../router.ts";

export const NAV_ITEMS = [
  { path: "/chats", route: "chats", icon: "chat", label: "Conversas" },
  { path: "/contacts", route: "contacts", icon: "group", label: "Contatos" },
  { path: "/settings", route: "settings", icon: "settings", label: "Ajustes" },
];

export function NavSidebar() {
  return (
    <nav className="left l surface elevation-1">
      <header className="center-align padding">
        <i className="extra">lock</i>
      </header>
      {NAV_ITEMS.map((item) => (
        <a
          key={item.path}
          href={item.path}
          className={activeRoute.value === item.route ? "active" : ""}
          onClick={(e) => navigateTo(item.path, e)}
        >
          <i>{item.icon}</i>
          <span>{item.label}</span>
        </a>
      ))}
    </nav>
  );
}