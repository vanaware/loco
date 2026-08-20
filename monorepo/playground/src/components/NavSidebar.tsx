// src/components/NavSidebar.tsx
import { NavItems } from "./NavItems.tsx";

export function NavSidebar() {
  return (
    <nav className="left m l border-right surface">
      <NavItems isSidebar />
    </nav>
  );
}