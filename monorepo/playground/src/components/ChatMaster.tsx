import { Signal } from "@preact/signals";

export interface Contact {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  time: string;
  unreadCount: number;
  online: boolean;
}

interface ChatMasterProps {
  contacts: Contact[];
  selectedChatId: Signal<string | null>;
}

export function ChatMaster({ contacts, selectedChatId }: ChatMasterProps) {
  return (
    <section
      className={`col ${
        selectedChatId.value ? "m4 l3 m l" : "s12 m4 l3"
      } surface border-right`}
      style={{ height: "100%", overflow: "hidden" }}
    >
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <header className="padding row middle-align" style={{ flexShrink: 0 }}>
          <h5 className="max">Conversas</h5>
          <button className="circle transparent" aria-label="Novo Chat">
            <i>edit</i>
          </button>
        </header>

        <div className="padding no-top" style={{ flexShrink: 0 }}>
          <div className="field prefix round fill max">
            <i>search</i>
            <input type="text" placeholder="Buscar conversas..." />
          </div>
        </div>

        <div className="scroll" style={{ flex: 1, overflowY: "auto" }}>
          {contacts.map((contact) => (
            <a
              key={contact.id}
              href={`/chats?id=${contact.id}`}
              className={`row wave padding ${
                selectedChatId.value === contact.id ? "active surface-container-high" : ""
              }`}
              onClick={(e) => {
                e.preventDefault();
                selectedChatId.value = contact.id;
              }}
            >
              <div className="pos-relative">
                <img src={contact.avatar} className="circle extra" alt={contact.name} />
                {contact.online && (
                  <span className="badge dot green pos-absolute bottom right" />
                )}
              </div>
              <div className="max min">
                <div className="row middle-align">
                  <h6 className="max small-text bold">{contact.name}</h6>
                  <span className="small-text text-secondary">{contact.time}</span>
                </div>
                <p className="small-text line-clamp-1">{contact.lastMessage}</p>
              </div>
              {contact.unreadCount > 0 && (
                <span className="badge circle primary">{contact.unreadCount}</span>
              )}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}