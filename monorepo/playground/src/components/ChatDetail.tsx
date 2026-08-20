import {
  activeContact,
  activeMessages,
  selectedChatId,
  messageInput,
  sendMessage,
  selectChat,
  type Message,
} from "../store/chatStore.ts";

export function ChatDetail() {
  const contact = activeContact.value;
  const messages = activeMessages.value;
  const activeId = selectedChatId.value;

  // Alternância responsiva de telas em Mobile (s) vs Desktop (m/l)[cite: 4]
  const responsiveGridClass = activeId ? "col s12 m8 l9" : "col m8 l9 m l";

  return (
    <section className={`${responsiveGridClass} surface-container-lowest max column no-space`}>
      {contact ? (
        <div className="column max no-space">
          {/* TOPO: CABEÇALHO FIXO - Reforçado com restrições flex */}
          <header className="padding row middle-align surface border-bottom" style={{ flexShrink: 0 }}>
            <button
              type="button"
              className="circle transparent s margin-right"
              onClick={() => selectChat(null)}
              aria-label="Voltar para a lista"
            >
              <i>arrow_back</i>
            </button>

            <img
              src={contact.avatar}
              className="circle medium"
              alt={contact.name}
            />

            <div className="max margin-left">
              <h6 className="small-text bold margin-none truncate">
                {contact.name}
              </h6>
              <span className="small-text text-secondary truncate">
                {contact.online ? "Online (E2EE Ativo)" : "Offline"}
              </span>
            </div>

            <button
              type="button"
              className="circle transparent"
              aria-label="Detalhes"
            >
              <i>info</i>
            </button>
          </header>

          {/* MEIO: ÁREA DE ROLAGEM ISOLADA */}
          <div className="scroll max padding column" style={{ flex: 1, overflowY: "auto" }}>
            {messages.map((msg: Message) => {
              const isMe = msg.senderId === "me";
              return (
                <div
                  key={msg.id}
                  className={`row ${
                    isMe ? "right-align" : "left-align"
                  } small-bottom-margin`}
                >
                  <div
                    className={`padding round ${
                      isMe ? "primary-container" : "surface-container-high"
                    }`}
                  >
                    <p className="margin-none">{msg.text}</p>
                    <div className="row right-align no-space small-top-margin">
                      <span className="small-text text-secondary margin-right-small">
                        {msg.timestamp}
                      </span>
                      {isMe && (
                        <i className="small text-primary">
                          {msg.status === "read" ? "done_all" : "done"}
                        </i>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Respiro no final do scroll das mensagens */}
            <div className="small-space"></div>
          </div>

          {/* BASE: RODAPÉ FIXO */}
          <footer className="padding surface border-top" style={{ flexShrink: 0 }}>
            <form onSubmit={sendMessage} className="row middle-align no-space">
              <button
                type="button"
                className="circle transparent margin-right-small"
                aria-label="Anexar arquivo"
              >
                <i>attach_file</i>
              </button>

              <div className="field max round fill no-margin">
                <input
                  type="text"
                  placeholder="Mensagem criptografada..."
                  value={messageInput.value}
                  onInput={(e) => {
                    messageInput.value = (e.target as HTMLInputElement).value;
                  }}
                />
              </div>

              <button
                type="submit"
                className="circle primary margin-left-small"
                aria-label="Enviar mensagem"
              >
                <i>send</i>
              </button>
            </form>
          </footer>
        </div>
      ) : (
        /* ESTADO VAZIO (DESKTOP) */
        <div className="column middle-align center-align max padding">
          <div className="center-align opacity-60">
            <i className="extra">lock</i>
            <h5 className="top-margin">Loco PWA Messenger</h5>
            <p>Selecione uma conversa para iniciar a comunicação E2EE.</p>
          </div>
        </div>
      )}
    </section>
  );
}