import { Signal, ReadonlySignal } from "@preact/signals";
import { Contact } from "./ChatMaster.tsx";

export interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
  status: "sent" | "delivered" | "read";
}

interface ChatDetailProps {
  activeContact: ReadonlySignal<Contact | null>;
  activeMessages: ReadonlySignal<Message[]>;
  selectedChatId: Signal<string | null>;
  messageInput: Signal<string>;
  onSendMessage: (e: Event) => void;
}

export function ChatDetail({
  activeContact,
  activeMessages,
  selectedChatId,
  messageInput,
  onSendMessage,
}: ChatDetailProps) {
  return (
    <section
      className={`col ${
        selectedChatId.value ? "s12 m8 l9" : "m8 l9 m l"
      } surface-container-lowest`}
      style={{ height: "100%", overflow: "hidden" }}
    >
      {activeContact.value ? (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
          
          {/* CABEÇALHO DO CHAT */}
          <header className="padding row middle-align surface border-bottom" style={{ flexShrink: 0 }}>
            <button
              className="circle transparent s"
              style={{ marginRight: "0.5rem" }}
              onClick={() => {
                selectedChatId.value = null;
              }}
              aria-label="Voltar para a lista de conversas"
            >
              <i>arrow_back</i>
            </button>

            <img
              src={activeContact.value.avatar}
              className="circle medium"
              alt={activeContact.value.name}
            />

            <div className="max margin-left">
              <h6 className="small-text bold">{activeContact.value.name}</h6>
              <span className="small-text text-secondary">
                {activeContact.value.online ? "Online (E2EE Ativo)" : "Offline"}
              </span>
            </div>

            <button className="circle transparent" aria-label="Detalhes">
              <i>info</i>
            </button>
          </header>

          {/* ROLAGEM DE MENSAGENS */}
          <div className="scroll padding" style={{ flex: 1, overflowY: "auto" }}>
            {activeMessages.value.map((msg) => {
              const isMe = msg.senderId === "me";
              return (
                <div
                  key={msg.id}
                  className={`row ${isMe ? "right-align" : "left-align"} margin-bottom`}
                >
                  <div
                    className={`card padding round ${
                      isMe ? "primary-container" : "surface-container-high"
                    }`}
                    style={{ maxWidth: "75%", display: "inline-block" }}
                  >
                    <p className="margin-none">{msg.text}</p>
                    <div className="row right-align no-space margin-top-small">
                      <span
                        className="small-text text-secondary"
                        style={{ fontSize: "0.75rem" }}
                      >
                        {msg.timestamp}
                      </span>
                      {isMe && (
                        <i className="small margin-left-small text-primary">
                          {msg.status === "read" ? "done_all" : "done"}
                        </i>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* FORMULÁRIO DE ENVIO FIXO NO RODAPÉ */}
          <footer className="padding surface border-top" style={{ flexShrink: 0 }}>
            <form onSubmit={onSendMessage} className="row middle-align no-space">
              <button type="button" className="circle transparent" aria-label="Anexar">
                <i>attach_file</i>
              </button>

              <div className="field max round fill margin-horizontal">
                <input
                  type="text"
                  placeholder="Mensagem criptografada..."
                  value={messageInput.value}
                  onInput={(e) => {
                    messageInput.value = (e.target as HTMLInputElement).value;
                  }}
                />
              </div>

              <button type="submit" className="circle primary" aria-label="Enviar">
                <i>send</i>
              </button>
            </form>
          </footer>

        </div>
      ) : (
        /* PLACEHOLDER DESKTOP / TABLET */
        <div className="middle-align center-align max" style={{ height: "100%" }}>
          <div className="center-align opacity-60">
            <i className="extra">lock</i>
            <h5 className="margin-top">Loco PWA Messenger</h5>
            <p>Selecione uma conversa ao lado para iniciar a comunicação E2EE.</p>
          </div>
        </div>
      )}
    </section>
  );
}