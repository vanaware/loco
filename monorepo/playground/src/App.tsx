import { activeRoute } from "./router.ts";
import { NavBar } from "./components/NavBar.tsx";
import { ChatsPage } from "./pages/ChatsPage.tsx";
import { ContactsPage } from "./pages/ContactsPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";

export function App() {
  // Leitura direta do Signal (agora funcionará graças ao ajuste no deno.jsonc)
  const currentRoute = activeRoute.value;

  return (
    <>
      <NavBar />
      <main className="responsive max">
        <ChatsPage active={currentRoute === "chats"} />
        <ContactsPage active={currentRoute === "contacts"} />
        <SettingsPage active={currentRoute === "settings"} />
      </main>
    </>
  );
}