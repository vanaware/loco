import { signal, useEffect } from "preact/hooks";
import {
  currentChatContact,
  contacts,
  chatSessions,
  smartSendMessage,
  connectionStatus,
  sendMyLocation,
  navigateTo,
  decryptMessage,
  updateContactSettings,
  storedFiles,
  deleteFile,
  downloadFile,
  startFileSend,
  startFileDownload,
  pendingShare,
  myId,
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

  // Decodifica mensagens criptografadas
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
    const text = inputText.value.trim();
    if (!text) return;

    // Detecta magnet link para iniciar download P2P
    const magnetMatch = text.match(/magnet:\?[^"\s]+/);
    if (magnetMatch) {
      const magnetURI = magnetMatch[0];
      const fileNameMatch = text.match(/dn=([^&]+)/);
      const fileName = fileNameMatch
        ? decodeURIComponent(fileNameMatch[1])
        : `file_${Date.now()}`;
      startFileDownload(magnetURI, fileName);
    } else {
      await smartSendMessage(id, text);
    }
    inputText.value = "";
  };

  const handleFileSelect = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    startFileSend(file);
    (e.target as HTMLInputElement).value = "";
  };

  const handleSendPendingShare = async () => {
    if (!pendingShare.value) return;
    const text = [
      pendingShare.value.title,
      pendingShare.value.text,
      pendingShare.value.url,
    ]
      .filter(Boolean)
      .join("\n");
    await smartSendMessage(id, text);
    pendingShare.value = null;
  };

  if (!contact) {
    return (
      <div class="empty">
        <md-icon style="font-size:4rem; opacity:0.5;">person_off</md-icon>
        <div>Contato não encontrado</div>
        <md-filled-button onClick={() => navigateTo("list")}>
          Voltar
        </md-filled-button>
      </div>
    );
  }

  return (
    <div class="chat-screen">
      {/* ============ HEADER ============ */}
      <div class="chat-header">
        <md-icon-button onClick={() => navigateTo("list")}>
          <md-icon>arrow_back</md-icon>
        </md-icon-button>

        <div class="chat-header-info" onClick={() => {
          editName.value = contact.displayName;
          editContactModal.value = true;
        }}>
          {contact.photo ? (
            <img src={contact.photo} class="header-photo" />
          ) : (
            <div class="header-photo-placeholder">
              {contact.displayName?.charAt(0).toUpperCase() || "?"}
            </div>
          )}
          <div>
            <div style="font:var(--md-sys-typescale-title-medium);">
              {contact.displayName}
            </div>
            <div
              style="font:var(--md-sys-typescale-body-small, 400 0.75rem/1rem sans-serif); color:var(--md-sys-color-on-surface-variant);"
            >
              {connectionStatus.value === "p2p" ? "⚡ P2P Direto" : "☁️ Via Push"}
            </div>
          </div>
        </div>

        <md-icon-button
          onClick={() => navigateTo("call")}
          title="Ligar"
        >
          <md-icon>call</md-icon>
        </md-icon-button>

        <md-icon-button
          onClick={() => navigateTo("scanner")}
          title="QR Code"
        >
          <md-icon>qr_code_scanner</md-icon>
        </md-icon-button>
      </div>

      {/* ============ SHARE BANNER ============ */}
      {pendingShare.value && (
        <div
          style="background:var(--md-sys-color-tertiary-container); padding:0.5rem 1rem; display:flex; align-items:center; gap:0.5rem;"
        >
          <md-icon>share</md-icon>
          <span style="flex:1; font-size:0.875rem;">
            Enviar conteúdo compartilhado?
          </span>
          <md-filled-tonal-button onClick={handleSendPendingShare}>
            Enviar
          </md-filled-tonal-button>
          <md-icon-button onClick={() => (pendingShare.value = null)}>
            <md-icon>close</md-icon>
          </md-icon-button>
        </div>
      )}

      {/* ============ MENSAGENS ============ */}
      <div class="chat-messages">
        {session?.messages.length === 0 && (
          <div class="empty" style="height:auto; padding:3rem 1rem;">
            <div style="font-size:2.5rem;">💬</div>
            <div style="color:var(--md-sys-color-on-surface-variant);">
              Nenhuma mensagem ainda. Envie a primeira!
            </div>
          </div>
        )}

        {session?.messages.map((m) => {
          const displayText = m.isEncrypted
            ? decryptedMsgs.value[m.id] || "🔒 Mensagem criptografada..."
            : m.text;

          const file = m.fileId ? storedFiles.value.get(m.fileId) : null;
          const isImage = file?.mimeType?.startsWith("image/");
          const isVideo = file?.mimeType?.startsWith("video/");
          const isSent = m.from === myId.value;

          return (
            <div key={m.id} class={`chat-msg ${isSent ? "sent" : "received"}`}>
              <div class="msg-text">
                {m.isEncrypted && <span class="encrypted-badge">🔒</span>}

                {/* Preview de imagem inline */}
                {isImage && file && (
                  <img
                    src={file.url}
                    alt={file.fileName}
                    loading="lazy"
                    style="max-width:220px; max-height:220px; border-radius:0.5rem; margin-bottom:0.5rem; display:block; cursor:pointer;"
                    onClick={() => window.open(file.url, "_blank")}
                  />
                )}

                {/* Preview de vídeo inline */}
                {isVideo && file && (
                  <video
                    src={file.url}
                    controls
                    preload="metadata"
                    style="max-width:260px; max-height:200px; border-radius:0.5rem; margin-bottom:0.5rem; display:block;"
                  />
                )}

                {/* Texto (ou nome do arquivo) */}
                {displayText}
              </div>

              {/* Ações do arquivo */}
              {file && (
                <div class="file-actions">
                  <md-text-button onClick={() => downloadFile(m.fileId!)}>
                    <md-icon slot="icon">download</md-icon>
                    Baixar
                  </md-text-button>
                  <md-text-button
                    onClick={() => {
                      if (confirm("Excluir este arquivo do dispositivo?")) {
                        deleteFile(m.fileId!);
                      }
                    }}
                    style="--md-sys-color-on-surface: var(--md-sys-color-error);"
                  >
                    <md-icon slot="icon">delete</md-icon>
                    Excluir
                  </md-text-button>
                </div>
              )}

              {/* Link de localização */}
              {m.location && (
                <a
                  href={`https://www.google.com/maps?q=${m.location.lat},${m.location.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="location-link"
                >
                  📍 Ver no mapa
                </a>
              )}

              {/* Metadados */}
              <div class="msg-meta">
                <span>{new Date(m.timestamp).toLocaleTimeString()}</span>
                <span>{m.channel === "p2p" ? "P2P" : "Push"}</span>
                {isSent && (
                  <span>
                    {m.status === "delivered" ? "✓✓" : m.status === "failed" ? "❌" : "✓"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ============ INPUT AREA ============ */}
      <div class="chat-input-area">
        <md-icon-button
          onClick={() => sendMyLocation(id)}
          title="Enviar localização"
        >
          <md-icon>location_on</md-icon>
        </md-icon-button>

        <md-icon-button
          onClick={() => document.getElementById("fileInput")?.click()}
          title="Anexar arquivo"
        >
          <md-icon>attach_file</md-icon>
        </md-icon-button>

        <input
          id="fileInput"
          type="file"
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
          style="display:none"
          onChange={handleFileSelect}
        />

        <input
          class="chat-input"
          value={inputText.value}
          onInput={(e) =>
            (inputText.value = (e.target as HTMLInputElement).value)
          }
          onKeyPress={(e) => e.key === "Enter" && handleSend()}
          placeholder="Mensagem..."
          autocomplete="off"
        />

        <md-fab variant="small" onClick={handleSend} title="Enviar">
          <md-icon slot="icon">send</md-icon>
        </md-fab>
      </div>

      {/* ============ MODAL EDITAR CONTATO ============ */}
      {editContactModal.value && (
        <div
          style="position:fixed; inset:0; background:rgba(0,0,0,0.32); display:flex; align-items:center; justify-content:center; z-index:2000; padding:1rem;"
          onClick={() => (editContactModal.value = false)}
        >
          <div
            style="background:var(--md-sys-color-surface); border-radius:1.5rem; padding:1.5rem; max-width:400px; width:100%; box-shadow:0 8px 24px rgba(0,0,0,0.2);"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style="font:var(--md-sys-typescale-title-large); margin-bottom:1rem;">
              Editar Contato
            </h3>

            <md-filled-text-field
              label="Nome exibido"
              value={editName.value}
              onInput={(e: any) => (editName.value = e.target.value)}
              style="width:100%;"
            />

            <div style="display:flex; gap:0.5rem; margin-top:1.5rem; justify-content:flex-end;">
              <md-text-button onClick={() => (editContactModal.value = false)}>
                Cancelar
              </md-text-button>
              <md-filled-button
                onClick={() => {
                  updateContactSettings(id, { displayName: editName.value });
                  editContactModal.value = false;
                }}
              >
                Salvar
              </md-filled-button>
            </div>

            <div style="margin-top:1.5rem; padding-top:1rem; border-top:1px solid var(--md-sys-color-outline-variant);">
              <div style="font:var(--md-sys-typescale-title-medium); margin-bottom:0.5rem;">
                Privacidade
              </div>
              <div class="toggle-row">
                <span class="toggle-label">📍 Permitir localização</span>
                <md-switch
                  selected={contact.allowLocation || false}
                  onClick={() =>
                    updateContactSettings(id, {
                      allowLocation: !contact.allowLocation,
                    })
                  }
                />
              </div>
              <div class="toggle-row">
                <span class="toggle-label">🔒 Criptografar mensagens</span>
                <md-switch
                  selected={contact.encryptMessages || false}
                  onClick={() =>
                    updateContactSettings(id, {
                      encryptMessages: !contact.encryptMessages,
                    })
                  }
                />
              </div>
              <div class="toggle-row">
                <span class="toggle-label">🔕 Não perturbe</span>
                <md-switch
                  selected={contact.doNotDisturb || false}
                  onClick={() =>
                    updateContactSettings(id, {
                      doNotDisturb: !contact.doNotDisturb,
                    })
                  }
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
