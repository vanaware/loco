/**
 * app.tsx — Componente raiz da demo WebTorrent.
 * Layout: 3 cards (Seeder | Leecher | Player) responsivos.
 */
import { useSignal } from "@preact/signals";
import { SeederPanel } from "./components/seeder-panel.tsx";
import { LeecherPanel } from "./components/leecher-panel.tsx";
import { PlayerPanel } from "./components/player-panel.tsx";
import { modeSignal, errorSignal, cleanup, peersSignal } from "./torrent-context.tsx";

export function App() {
  const wtEnabled = useSignal(false);
  const mode = modeSignal.value;
  const error = errorSignal.value;

  const handleToggle = () => {
    if (wtEnabled.value) {
      cleanup();
      wtEnabled.value = false;
    } else {
      wtEnabled.value = true;
    }
  };

  return (
    <>
      {/* Header com status */}
      <nav class="top primary">
        {/* Status no header */}
        <label class="chip transparent white-text">
          <i class="material-symbols small white-text">
            {mode === "idle" ? "power_off" : mode === "seeding" ? "upload" : "download"}
          </i>
          {mode === "idle" ? "Off" : mode === "seeding" ? "Seeding" : "Leeching"}
        </label>
        <label class="chip transparent white-text">
          <i class="material-symbols small white-text">group</i>
          {peersSignal.value.length}
        </label>

        <label class="max center-align">
          <h5 class="white-text">Loco WebTorrent</h5>
        </label>

        {/* Toggle WebTorrent */}
        <label class="switch">
          <input
            type="checkbox"
            checked={wtEnabled.value}
            onChange={handleToggle}
          />
          <span class="white-text">
            <i class="material-symbols small">power_settings_new</i>
          </span>
        </label>
      </nav>

      {/* Erro */}
      {error && (
        <article class="error-container border left-margin right-margin top-margin">
          <i class="red-text">error</i>
          <span class="red-text">{error}</span>
        </article>
      )}

      {/* 3 cards full-width verticais em mobile, lado a lado em large */}
      <main class="responsive">
        {/* Card 1: Seeder */}
        <article class="border round">
          <nav class="middle">
            <i class="material-symbols">upload</i>
            <h5>Seeder</h5>
          </nav>
          <SeederPanel disabled={!wtEnabled.value} />
        </article>

        {/* Card 2: Leecher */}
        <article class="border round">
          <nav class="middle">
            <i class="material-symbols">download</i>
            <h5>Leecher</h5>
          </nav>
          <LeecherPanel disabled={!wtEnabled.value} />
        </article>

        {/* Card 3: Player */}
        <article class="border round">
          <nav class="middle">
            <i class="material-symbols">play_circle</i>
            <h5>Player</h5>
          </nav>
          <PlayerPanel />
        </article>
      </main>
    </>
  );
}
