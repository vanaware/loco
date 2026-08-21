import { activeRoute, navigateTo, ROUTES } from "../router.ts";

interface NavItemsProps {
  isSidebar?: boolean;
}

export function NavItems({ isSidebar = false }: NavItemsProps) {
  // Lendo o Signal diretamente
  const currentRoute = activeRoute.value;

  return (
    <>
      {ROUTES.map((item) => {
        const isActive = currentRoute === item.id;
        
        const classes = ["transparent"];
        if (isSidebar) classes.push("circle");
        if (isActive) classes.push("active");

        return (
          <button
            key={item.id}
            className={classes.join(" ")}
            onClick={() => navigateTo(item.id)}
            aria-label={`Ir para ${item.label}`}
            title={item.label}
          >
            <i>{item.icon}</i>
            <span>{item.label}</span>
          </button>
        );
      })}
    </>
  );
}

export function NavBar() {
  return (
    <>
      <nav className="left m l border-right surface">
        <NavItems isSidebar={true} />
      </nav>
      <nav className="bottom s surface border-top">
        <NavItems isSidebar={false} />
      </nav>
    </>
  );
}