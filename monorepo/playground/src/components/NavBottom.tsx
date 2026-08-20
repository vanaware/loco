import { activeRoute, navigateTo } from "../router.ts";
import { NAV_ITEMS } from "./NavSidebar.tsx";

export function NavBottom() {
  return (
    <nav className="bottom s m surface elevation-2">
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