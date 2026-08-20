import { activeRoute } from "./router.ts";
import { NavSidebar } from "./components/NavSidebar.tsx";
import { NavBottom } from "./components/NavBottom.tsx";
import { ChatsPage } from "./pages/ChatsPage.tsx";
import { ContactsPage } from "./pages/ContactsPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";

export function App() {
  // Assina a Fonte Única de Verdade (SSOT) das rotas
  const currentRoute = activeRoute.value;

  return (
    <>
      {/* COMPONENTES DE NAVEGAÇÃO REATIVOS */}
      <NavSidebar />
      <NavBottom />

      {/* CONTAINER PRINCIPAL RESPONSIVO */}
      <main className="responsive max no-space">
        {/* RENDERIZAÇÃO DECLARATIVA DAS PÁGINAS */}
        <ChatsPage active={currentRoute === "chats"} />
        <ContactsPage active={currentRoute === "contacts"} />
        <SettingsPage active={currentRoute === "settings"} />
      </main>
    </>
  );
}