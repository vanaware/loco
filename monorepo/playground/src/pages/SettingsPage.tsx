import { SettingsView } from "../components/SettingsView.tsx";

interface SettingsPageProps {
  active: boolean;
}

export function SettingsPage({ active }: SettingsPageProps) {
  // Impede a renderização no DOM se a rota não estiver ativa
  if (!active) return null;

  return (
    <page className="active scroll">
      <SettingsView />
    </page>
  );
}