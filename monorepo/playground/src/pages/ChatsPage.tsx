import { ChatMaster } from "../components/ChatMaster.tsx";
import { ChatDetail } from "../components/ChatDetail.tsx";

interface ChatsPageProps {
  active: boolean;
}

export function ChatsPage({ active }: ChatsPageProps) {
  // Impede a renderização no DOM se a rota não estiver ativa
  if (!active) return null;

  return (
    <page className="active max">
      <div className="grid no-space max">
        <ChatMaster />
        <ChatDetail />
      </div>
    </page>
  );
}