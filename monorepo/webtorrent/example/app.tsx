/**
 * app.tsx — Componente raiz da demo WebTorrent.
 */
import { useSignal } from "@preact/signals";
import { cleanup, modeSignal, errorSignal } from "./torrent-context.tsx";
import { SeederPanel } from "./components/seeder-panel.tsx";
import { ViewerPanel } from "./components/viewer-panel.tsx";
import { PeerPanel } from "./components/peer-panel.tsx";

export function App() {
  const mode = modeSignal.value;
  const error = errorSignal.value;

  return (
    <div style="min-height: 100vh; display: flex; flex-direction: column;">
      {/* Header */}
      <nav class="primary">
        <div class="max">
          <h5 class="white-text">
            <span class="material-symbols">hub</span>
            {" "}Loco WebTorrent Demo
          </h5>
        </div>
        <div>
          <button
            class="transparent border round"
            onClick={cleanup}
            title="Limpar torrent e client"
          >
            <span class="material-symbols white-text">refresh</span>
          </button>
        </div>
      </nav>

      {/* Modo atual */}
      <div class="padding">
        <div class="row">
          <div class="chip left-margin">
            <span class="material-symbols small">info</span>
            Modo:{" "}
            <b>
              {mode === "idle" ? "Inativo" : mode === "seeding" ? "Seedando" : "Baixando"}
            </b>
          </div>
        </div>
      </div>

      {/* Erro */}
      {error && (
        <div class="padding">
          <div class="red white-text border round">
            <span class="material-symbols small">error</span>
            {" "}{error}
          </div>
        </div>
      )}

      {/* Painéis */}
      <div
        class="row"
        style="flex: 1; padding: 0 1rem 1rem;"
      >
        <SeederPanel />
        <ViewerPanel />
        <PeerPanel />
      </div>

      {/* Footer */}
      <footer class="secondary">
        <div class="center-align">
          <span class="small-text">
            Loco WebTorrent v0.1.0 — P2P Streaming Demo
          </span>
        </div>
      </footer>
    </div>
  );
}
