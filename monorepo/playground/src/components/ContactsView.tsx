import { contactsSignal, startChatWithContact, type Contact } from "../store/chatStore.ts";

export function ContactsView() {
  const contacts = contactsSignal.value;

  return (
    <div className="padding max-width-medium margin-horizontal-auto">
      <header className="row middle-align margin-bottom">
        <h4 className="max bold margin-none">Contatos P2P</h4>
        <button type="button" className="button primary round">
          <i>person_add</i>
          <span>Adicionar</span>
        </button>
      </header>

      <div className="field prefix round fill margin-bottom">
        <i>search</i>
        <input type="search" placeholder="Buscar por nome ou fingerprint E2EE..." />
      </div>

      <div className="grid">
        {contacts.map((contact: Contact) => (
          <div key={contact.id} className="col s12 m6 l6">
            <article className="card surface-container-low padding round wave">
              <div className="row middle-align">
                <div className="pos-relative">
                  <img
                    src={contact.avatar}
                    className="circle large"
                    alt={contact.name}
                  />
                  {contact.online && (
                    <span className="badge dot green pos-bottom pos-right"></span>
                  )}
                </div>

                <div className="max margin-left-small">
                  <h6 className="small-text bold margin-none">{contact.name}</h6>
                  <span className="small-text text-secondary display-block truncate">
                    {contact.publicFingerprint || "Chave não verificada"}
                  </span>
                </div>
              </div>

              <div className="row right-align margin-top-small no-space">
                <button
                  type="button"
                  className="button transparent circle"
                  aria-label="Ver fingerprint"
                  title="Fingerprint E2EE"
                >
                  <i>fingerprint</i>
                </button>
                <button
                  type="button"
                  className="button primary round"
                  onClick={() => startChatWithContact(contact.id)}
                >
                  <i>chat</i>
                  <span>Conversar</span>
                </button>
              </div>
            </article>
          </div>
        ))}
      </div>

      {/* Respiro no final (Safe Area Bottom Mobile) */}
      <div className="large-space"></div>
    </div>
  );
}