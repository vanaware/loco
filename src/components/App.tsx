import { useEffect, useState } from "preact/hooks";
import { signal } from "@preact/signals";
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
  const [showLogs, setShowLogs] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);

  // Intercepta console para painel de debug
  useEffect(() => {
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;

    const addLine = (type: string, args: any[]) => {
      const line = `[${type}] ${args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ")}`;
      setLogLines(prev => {
        const next = [...prev, line];
        return next.length > 500 ? next.slice(-300) : next;
      });
    };

    console.log = (...args) => { addLine("LOG", args); origLog.apply(console, args); };
    console.warn = (...args) => { addLine("WARN", args); origWarn.apply(console, args); };
    console.error = (...args) => { addLine("ERROR", args); origError.apply(console, args); };

    addLine("INIT", ["Debug panel ativo — " + new Date().toISOString()]);

    return () => {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
    };
  }, []);

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

      {/* Painel de logs visível para debug em mobile */}
      <div class="debug-panel">
        <div class="debug-panel-header">
          <button
            onClick={() => setShowLogs(!showLogs)}
            style={{ background: "transparent", border: "none", color: "white", cursor: "pointer", fontSize: "1rem" }}
          >
            {showLogs ? "▲ LOGS" : "▼ LOGS"} ({logLines.length})
          </button>
          <button
            onClick={(e) => {
              navigator.clipboard.writeText(logLines.join("\n"));
              const btn = e.currentTarget as HTMLElement;
              btn.textContent = "✓ Copiado!";
              setTimeout(() => { btn.textContent = "📋 Copiar"; }, 1500);
            }}
            style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "white", cursor: "pointer", borderRadius: "4px", padding: "2px 8px", marginLeft: "8px", fontSize: "0.75rem" }}
          >
            📋 Copiar
          </button>
        </div>
        {showLogs && (
          <div class="debug-logs" ref={(node) => { if (node) node.scrollTop = node.scrollHeight; }}>
            {logLines.map((line, i) => (
              <div key={i} class={`debug-line ${line.includes("ERROR") ? "error" : ""} ${line.includes("WARN") ? "warn" : ""}`}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
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
