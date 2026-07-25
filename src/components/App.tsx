import { useEffect } from "preact/hooks";
import "@material/web/all.js";
import {
  currentView, menuOpen, contacts, chatSessions, currentChatContact,
  navigateTo, initApp, pendingShare, updateBadge,
} from "../store.ts";
import { ChatWindow } from "./ChatWindow.tsx";
import { Profile } from "./Profile.tsx";
import { Settings } from "./Settings.tsx";
import { About } from "./About.tsx";
import { TransferDock } from "./TransferDock.tsx";

export function App() {
  useEffect(() => {
    initApp();

    // Registra Service Worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }

    // App shortcuts
    if (location.hash.startsWith("#action=")) {
      const action = location.hash.split("=")[1];
      if (action === "share-profile") navigateTo("profile");
      else if (action === "open-chats") navigateTo("list");
    }

    const badgeInterval = setInterval(updateBadge, 5000);
    return () => clearInterval(badgeInterval);
  }, []);

  useEffect(() => {
    updateBadge();
  }, [chatSessions.value]);

  const renderContent = () => {
    switch (currentView.value) {
      case "profile": return <Profile />;
      case "settings": return <Settings />;
      case "about": return <About />;
      case "chat": return <ChatWindow />;
      default: return <ContactList />;
    }
  };

  return (
    <div class="app-container">
      <div class="top-bar">
        <md-icon-button onClick={() => (menuOpen.value = !menuOpen.value)}>
          <md-icon>menu</md-icon>
        </md-icon-button>
        <span class="top-bar-title">Push P2P Chat</span>
      </div>

      <div class={`drawer ${menuOpen.value ? "open" : ""}`}>
        <md-list>
          <md-list-item onClick={() => { navigateTo("list"); menuOpen.value = false; }}>
            <md-icon slot="start">people</md-icon>
            <div slot="headline">Contatos</div>
          </md-list-item>
          <md-list-item onClick={() => { navigateTo("profile"); menuOpen.value = false; }}>
            <md-icon slot="start">person</md-icon>
            <div slot="headline">Perfil</div>
          </md-list-item>
          <md-list-item onClick={() => { navigateTo("settings"); menuOpen.value = false; }}>
            <md-icon slot="start">settings</md-icon>
            <div slot="headline">Configurações</div>
          </md-list-item>
          <md-divider />
          <md-list-item onClick={() => { navigateTo("about"); menuOpen.value = false; }}>
            <md-icon slot="start">info</md-icon>
            <div slot="headline">Sobre</div>
          </md-list-item>
        </md-list>
      </div>

      {menuOpen.value && (
        <div class="drawer-overlay open" onClick={() => (menuOpen.value = false)} />
      )}

      {pendingShare.value && (
        <div style="background:var(--md-sys-color-primary-container); padding:0.75rem 1rem; display:flex; align-items:center; gap:0.5rem;">
          <md-icon>share</md-icon>
          <span style="flex:1; font:var(--md-sys-typescale-body-medium);">
            Conteúdo recebido: {pendingShare.value.text?.slice(0, 40) || pendingShare.value.url || pendingShare.value.title}
          </span>
          <md-text-button onClick={() => (pendingShare.value = null)}>Dispensar</md-text-button>
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
                {c.photo ? <img src={c.photo} alt="" /> : c.theirDisplayName?.charAt(0)?.toUpperCase() || "?"}
              </div>
              <div slot="headline">{c.displayName}</div>
              <div slot="supporting-text">
                {last
                  ? last.type === "location"
                    ? "📍 Localização"
                    : last.text.slice(0, 40)
                  : "Toque para conversar"}
              </div>
              {s?.unreadCount ? <div slot="end" class="unread-badge">{s.unreadCount}</div> : null}
            </md-list-item>
          );
        })}
    </md-list>
  );
}

// Renderiza
import { render } from "preact";
render(<App />, document.body);
