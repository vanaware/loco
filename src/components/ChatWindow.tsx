import { signal, useEffect } from "@preact/signals";
import {
  currentChatContact, contacts, chatSessions, smartSendMessage,
  connectionStatus, sendMyLocation, navigateTo, decryptMessage,
  updateContactSettings, storedFiles, deleteFile, downloadFile,
  startFileSend, pendingShare,
} from "../store.ts";

export function ChatWindow() {
  const id = currentChatContact.value;
  if (!id) return null;
  const contact = contacts.value.get(id);
  const session = chatSessions.value.get(id);
  const inputText = signal("");
  const editContactModal = signal(false);
  const editName = signal(contact?.displayName || "");
  const decryptedMsgs = signal<{ [key: string]: string }>({});

  useEffect(() => {
    if (session) {
      session.messages.forEach(async (m) => {
        if (m.isEncrypted && !decryptedMsgs.value[m.id]) {
          const decrypted = await decryptMessage(m.text);
          decryptedMsgs.value = { ...decryptedMsgs.value, [m.id]: decrypted };
        }
      });
    }
  }, [session]);

  const handleSend = async () => {
    if (!inputText.value.trim()) return;
    await smartSendMessage(id, inputText.value);
    inputText.value = "";
  };

  const handleFileSelect = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    startFileSend(file);
  };

  const handleSendPendingShare = async () => {
    if (!pendingShare.value) return;
    const text = [pendingShare.value.title, pendingShare.value.text, pendingShare.value.url]
      .filter(Boolean).join("\n");
    await smartSendMessage(id, text);
    pendingShare.value = null;
  };

  return (
    <div class="chat-screen">
      <div class="chat-header">
        <md-icon-button onClick={() => navigateTo("list")}>
          <md-icon>arrow_back</md-icon>
        </md-icon-button>
        <div class="chat-header-info" onClick={() => editContactModal.value = true}>
          {contact?.photo ? (
            <img src={contact.photo} class="header-photo" />
          ) : (
            <div class="header-photo-placeholder">
              {contact?.displayName?.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div style="font:var(--md-sys-typescale-title-medium);">{contact?.displayName}</div>
            <div style="font:var(--md-sys-typescale-body-small); color:var(--md-sys-color-on-surface-variant);">
              {connectionStatus.value === "p2p" ? "⚡ P2P Direto" : "☁️ Via Push"}
            </div>
          </div>
        </div>
      </div>

      {pendingShare.value && (
        <div style="background:var(--md-sys-color-tertiary-container); padding:0.5rem 1rem; display:flex; align-items:center; gap:0.5rem;">
          <md-icon>share</md-icon>
          <span style="flex:1; font-size:0.875rem;">Enviar conteúdo compartilhado?</span>
          <md-filled-tonal-button onClick={handleSendPendingShare}>Enviar</md-filled-tonal-button>
        </div>
      )}

      <div class="chat-messages">
        {session?.messages.map((m) => {
          const displayText = m.isEncrypted
            ? decryptedMsgs.value[m.id] || "🔒 Mensagem criptografada..."
            : m.text;
          const file = m.fileId ? storedFiles.value.get(m.fileId) : null;
          const isImage = file?.mimeType?.startsWith("image/");

          return (
            <div class={`chat-msg ${m.from === window.myId ? "sent" : "received"}`}>
              <div class="msg-text">
                {m.isEncrypted && <span class="encrypted-badge">🔒</span>}
                {isImage && file && (
                  <img
                    src={file.url}
                    alt={file.fileName}
                    style="max-width:200px; max-height:200px; border-radius:0.5rem; margin-top:0.5rem; display:block;"
                  />
                )}
                {displayText}
              </div>

              {file && (
                <div class="file-actions">
                  <md-text-button onClick={() => downloadFile(m.fileId!)}>
                    <md-icon slot="icon">download</md-icon>
                    Baixar
                  </md-text-button>
                  <md-text-button
                    onClick={() => {
                      if (confirm("Excluir este arquivo?")) deleteFile(m.fileId!);
                    }}
                    style="--md-sys-color-on-surface: var(--md-sys-color-error);"
                  >
                    <md-icon slot="icon">delete</md-icon>
                    Excluir
                  </md-text-button>
                </div>
              )}

              {m.location && (
                <a
                  href={`https://www.google.com/maps?q=${m.location.lat},${m.location.lng}`}
                  target="_blank"
                  class="location-link"
                >
                  📍 Ver no mapa
                </a>
              )}

              <div class="msg-meta">
                <span>{new Date(m.timestamp).toLocaleTimeString()}</span>
                <span>{m.channel === "p2p" ? "P2P" : "Push"}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div class="chat-input-area">
        <md-icon-button onClick={() => sendMyLocation(id)}>
          <md-icon>location_on</md-icon>
        </md-icon-button>
        <md-icon-button onClick={() => document.getElementById("fileInput")?.click()}>
          <md-icon>attach_file</md-icon>
        </md-icon-button>
        <input
          id="fileInput"
          type="file"
          style="display:none"
          onChange={handleFileSelect}
        />
        <input
          class="chat-input"
          value={inputText.value}
          onInput={(e) => (inputText.value = (e.target as HTMLInputElement).value)}
          onKeyPress={(e) => e.key === "Enter" && handleSend()}
          placeholder="Mensagem..."
        />
        <md-fab variant="small" onClick={handleSend}>
          <md-icon slot="icon">send</md-icon>
        </md-fab>
      </div>

      {editContactModal.value && (
        <div style="position:fixed; inset:0; background:rgba(0,0,0,0.32); display:flex; align-items:center; justify-content:center; z-index:2000;">
          <md-dialog open>
            <div slot="headline">Editar Contato</div>
            <form slot="content" style="padding:1rem;">
              <md-filled-text-field
                label="Nome"
                value={editName.value}
                onInput={(e: any) => (editName.value = e.target.value)}
              />
            </form>
            <div slot="actions">
              <md-text-button onClick={() => (editContactModal.value = false)}>Cancelar</md-text-button>
              <md-filled-button
                onClick={() => {
                  updateContactSettings(id, { displayName: editName.value });
                  editContactModal.value = false;
                }}
              >
                Salvar
              </md-filled-button>
            </div>
          </md-dialog>
        </div>
      )}
    </div>
  );
}
