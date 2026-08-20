import { ContactsView } from "../components/ContactsView.tsx";

interface ContactsPageProps {
  active: boolean;
}

export function ContactsPage({ active }: ContactsPageProps) {
  // Impede a renderização no DOM se a rota não estiver ativa
  if (!active) return null;

  return (
    <page className="active scroll">
      <ContactsView />
    </page>
  );
}