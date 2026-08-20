// src/components/NavItems.tsx
import { activeRoute, navigateTo, ROUTES } from "../router.ts";

interface NavItemsProps {
  isSidebar?: boolean;
}

export function NavItems({ isSidebar = false }: NavItemsProps) {
  return (
    <>
      {ROUTES.map((item) => {
        const isActive = activeRoute.value === item.id;
        const buttonClass = `transparent ${isSidebar ? "circle" : ""} ${
          isActive ? "active" : ""
        }`.trim();

        return (
          <button
            key={item.id}
            className={buttonClass}
            onClick={() => navigateTo(item.id)}
            aria-label={item.label}
          >
            <i>{item.icon}</i>
            <span>{item.label}</span>
          </button>
        );
      })}
    </>
  );
}