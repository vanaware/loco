import { useEffect } from "preact/hooks";
import "@material/web/all.js";
import {
  chatSessions,
  contacts,
  currentChatContact,
  currentView,
  handleIncomingPushMessage,
  initApp,
  menuOpen,
  navigateTo,
  pendingShare,
  updateBadge,
} from "../store.ts";
import { ChatWindow } from "./ChatWindow.tsx";
import { Profile } from "./Profile.tsx";
import { Settings } from "./Settings.tsx";
import { About } from "./About.tsx";
import { TransferDock } from "./TransferDock.tsx";
import { CallScreen } from "./CallScreen.tsx";
import { QRScanner } from "./QRScanner.tsx";

export function App() {
  useEffect(() => {
    initApp();

    // Verifica suporte a Service Worker antes de registrar
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("Falha ao registrar Service Worker:", err);
      });
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "PUSH_MESSAGE") {
          handleIncomingPushMessage(event.data.payload);
        }
      });
    } else {
      console.warn("Service Worker não suportado neste navegador");
    }

    // App shortcuts
    if (location.hash.startsWith("#action=")) {
      const action = location.hash.slice("#action=".length);
      if (action === "share-profile") navigateTo("profile");
      else if (action === "scan-qr") navigateTo("scanner");
      else if (action === "open-chats") navigateTo("list");
    }

    // Processa hash #add= para adicionar contato
    if (location.hash.startsWith("#add=")) {
      try {
        const encoded = location.hash.slice("#add=".length);
        const data = JSON.parse(decodeURIComponent(atob(encoded)));
        import("../store.ts").then(({ addContact }) => {
          addContact(data.id, {
            ...data,
            displayName: data.displayName || "Novo Contato",
            theirDisplayName: data.displayName || "",
            addedAt: Date.now(),
            lastContact: null,
          });
          alert(`✅ Contato "${data.displayName || data.id}" adicionado!`);
        });
        history.replaceState(null, "", "/");
      } catch (e) {
        console.error("Erro ao processar link de contato:", e);
      }
    }

    const badgeInterval = setInterval(updateBadge, 5000);
    return () => clearInterval(badgeInterval);
  }, []);

  useEffect(() => {
    updateBadge();
  }, [chatSessions.value]);

  const renderContent = () => {
    switch (currentView.value) {
      case "profile":
        return <Profile />;
      case "settings":
        return <Settings />;
      case "about":
        return <About />;
      case "chat":
        return <ChatWindow />;
      case "call":
        return <CallScreen />; // ← NOVO
      case "scanner":
        return <QRScanner />; // ← NOVO
      default:
        return <ContactList />;
    }
  };

  return (
    <div class="app-container">
      {/* QRScanner ocupa tela cheia, não mostra top-bar */}
      {currentView.value !== "scanner" && (
        <div class="top-bar">
          <md-icon-button onClick={() => (menuOpen.value = !menuOpen.value)}>
            <md-icon>menu</md-icon>
          </md-icon-button>
          <span class="top-bar-title">Loco</span>
        </div>
      )}

      <div class={`drawer ${menuOpen.value ? "open" : ""}`}>
        <md-list>
          <md-list-item
            onClick={() => {
              navigateTo("list");
              menuOpen.value = false;
            }}
          >
            <md-icon slot="start">people</md-icon>
            <div slot="headline">Contatos</div>
          </md-list-item>
          <md-list-item
            onClick={() => {
              navigateTo("profile");
              menuOpen.value = false;
            }}
          >
            <md-icon slot="start">person</md-icon>
            <div slot="headline">Perfil</div>
          </md-list-item>
          <md-list-item
            onClick={() => {
              navigateTo("scanner");
              menuOpen.value = false;
            }}
          >
            <md-icon slot="start">qr_code_scanner</md-icon>
            <div slot="headline">Escanear QR Code</div>
          </md-list-item>
          <md-list-item
            onClick={() => {
              navigateTo("settings");
              menuOpen.value = false;
            }}
          >
            <md-icon slot="start">settings</md-icon>
            <div slot="headline">Configurações</div>
          </md-list-item>
          <md-divider />
          <md-list-item
            onClick={() => {
              navigateTo("about");
              menuOpen.value = false;
            }}
          >
            <md-icon slot="start">info</md-icon>
            <div slot="headline">Sobre</div>
          </md-list-item>
        </md-list>
      </div>

      {menuOpen.value && (
        <div
          class="drawer-overlay open"
          onClick={() => (menuOpen.value = false)}
        />
      )}

      {pendingShare.value && currentView.value !== "scanner" && (
        <div style="background:var(--md-sys-color-primary-container); padding:0.75rem 1rem; display:flex; align-items:center; gap:0.5rem;">
          <md-icon>share</md-icon>
          <span style="flex:1; font:var(--md-sys-typescale-body-medium);">
            Conteúdo recebido:{" "}
            {pendingShare.value.text?.slice(0, 40) || pendingShare.value.url ||
              pendingShare.value.title}
          </span>
          <md-text-button onClick={() => (pendingShare.value = null)}>
            Dispensar
          </md-text-button>
        </div>
      )}

      <div class="main-content">{renderContent()}</div>

      <TransferDock />
    </div>
  );
}

function ContactList() {
  const contactsMap = contacts.value;
  const sessionsMap = chatSessions.value;

  if (contactsMap.size === 0) {
    return (
      <div class="empty">
        <div class="empty-icon">📭</div>
        <div>Nenhuma conversa</div>
        <md-filled-button onClick={() => navigateTo("profile")}>
          <md-icon slot="icon">person_add</md-icon>
          Adicionar Contato
        </md-filled-button>
      </div>
    );
  }

  return (
    <md-list>
      {[...contactsMap.entries()]
        .sort((a, b) => (b[1].lastContact || 0) - (a[1].lastContact || 0))
        .map(([id, c]) => {
          const s = sessionsMap.get(id);
          const last = s?.messages.slice(-1)[0];
          return (
            <md-list-item
              onClick={() => {
                currentChatContact.value = id;
                navigateTo("chat");
              }}
            >
              <div slot="start" class="contact-avatar">
                {c.photo
                  ? <img src={c.photo} alt="" />
                  : c.theirDisplayName?.charAt(0)?.toUpperCase() || "?"}
              </div>
              <div slot="headline">{c.displayName}</div>
              <div slot="supporting-text">
                {last
                  ? last.type === "location"
                    ? "📍 Localização"
                    : last.type === "file"
                    ? "📎 Arquivo"
                    : last.text.slice(0, 40)
                  : "Toque para conversar"}
              </div>
              {s?.unreadCount
                ? <div slot="end" class="unread-badge">{s.unreadCount}</div>
                : null}
            </md-list-item>
          );
        })}
    </md-list>
  );
}
