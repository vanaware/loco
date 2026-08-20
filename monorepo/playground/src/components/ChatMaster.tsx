import {
  contactsSignal,
  selectedChatId,
  selectChat,
  type Contact,
} from "../store/chatStore.ts";

export function ChatMaster() {
  const contacts = contactsSignal.value;
  const activeId = selectedChatId.value;

  // Alternância responsiva de telas em Mobile (s) vs Desktop (m/l)
  const responsiveGridClass = activeId ? "col m4 l3 m l" : "col s12 m4 l3";

  return (
    <section
      className={`${responsiveGridClass} surface border-right column max no-space`}
    >
      {/* CABEÇALHO DA LISTA */}
      <header className="padding border-bottom surface">
        <div className="row middle-align small-bottom-margin">
          <h5 className="max bold margin-none">Conversas</h5>
          <button
            type="button"
            className="circle transparent"
            aria-label="Nova conversa"
          >
            <i>edit_square</i>
          </button>
        </div>

        <div className="field prefix round fill small margin-none">
          <i>search</i>
          <input type="search" placeholder="Buscar conversas..." />
        </div>
      </header>

      {/* PAINEL DE ROLAGEM ISOLADO */}
      <div className="scroll max padding-small">
        <div className="list">
          {contacts.map((contact: Contact) => {
            const isSelected = activeId === contact.id;

            return (
              <button
                key={contact.id}
                type="button"
                className={`row wave padding round transparent left-align no-margin small-bottom-margin ${
                  isSelected ? "active primary-container" : ""
                }`}
                onClick={() => selectChat(contact.id)}
              >
                <div className="pos-relative">
                  <img
                    src={contact.avatar}
                    className="circle medium"
                    alt={contact.name}
                  />
                  {contact.online && (
                    <span className="badge dot green pos-bottom pos-right"></span>
                  )}
                </div>

                <div className="max min margin-left-small">
                  <div className="row middle-align no-space">
                    <h6 className="small-text bold max truncate margin-none">
                      {contact.name}
                    </h6>
                    <span className="small-text text-secondary">
                      {contact.time}
                    </span>
                  </div>
                  <p className="small-text text-secondary truncate margin-none">
                    {contact.lastMessage}
                  </p>
                </div>

                {contact.unreadCount > 0 && (
                  <span className="badge circle primary small">
                    {contact.unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}