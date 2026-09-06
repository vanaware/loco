/**
 * seeder-panel.tsx — Seleciona arquivo de vídeo e faz seed.
 */
import { useSignal } from "@preact/signals";
import {
  seedFile,
  torrentSignal,
  modeSignal,
  PUBLIC_TRACKERS,
} from "../torrent-context.tsx";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function SeederPanel() {
  const selectedFile = useSignal<File | null>(null);
  const loading = useSignal(false);
  const pieceCount = useSignal(0);
  const pieceLength = useSignal(0);

  const handleFile = (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (input.files?.[0]) {
      selectedFile.value = input.files[0]!;
    }
  };

  const handleSeed = async () => {
    const file = selectedFile.value;
    if (!file) return;

    loading.value = true;
    try {
      await seedFile(file);
      // Atualiza piece info após seed
      const t = torrentSignal.value;
      if (t) {
        pieceCount.value = t.pieces.length;
        pieceLength.value = t.pieceLength;
      }
    } finally {
      loading.value = false;
    }
  };

  const torrent = torrentSignal.value;
  const isSeeding = modeSignal.value === "seeding";

  return (
    <div class="panel left-5 medium-10 large-4 no-padding">
      <div class="middle">
        <span class="material-symbols">upload</span>
        <h4>Seeder</h4>
      </div>

      {!isSeeding
        ? (
          <div class="field label border">
            <input
              type="file"
              accept="video/*"
              id="seeder-file"
              onChange={handleFile}
            />
            <label for="seeder-file">Selecionar vídeo</label>
          </div>
        )
        : (
          <div class="green small-text">
            <span class="material-symbols small">check_circle</span>
            {torrent?.name ?? "seeding..."}
          </div>
        )}

      {selectedFile.value && !isSeeding && (
        <div class="field label border">
          <input type="text" value={selectedFile.value.name} readonly />
          <label>Arquivo</label>
          <span class="helper">{formatSize(selectedFile.value.size)}</span>
        </div>
      )}

      <div class="field label border suffix">
        <input type="text" value={PUBLIC_TRACKERS[0] ?? ""} readonly />
        <label>Tracker</label>
        <i class="front">🌐</i>
      </div>

      <button
        class={loading.value ? "loading" : ""}
        disabled={!selectedFile.value || loading.value}
        onClick={handleSeed}
      >
        <span class="material-symbols">play_arrow</span>
        Seed
      </button>

      {isSeeding && torrent && (
        <div class="field label suffix border">
          <input
            type="text"
            value={torrent.magnetURI}
            id="magnet-output"
            readonly
            onClick={(e) => {
              (e.target as HTMLInputElement).select();
              navigator.clipboard.writeText(torrent.magnetURI);
            }}
          />
          <label>Magnet URI</label>
          <i
            class="front"
            style="cursor:pointer"
            onClick={() => {
              navigator.clipboard.writeText(torrent.magnetURI);
            }}
          >
            📋
          </i>
        </div>
      )}

      {isSeeding && (
        <>
          <div class="field label suffix border">
            <input type="text" value={torrent?.infoHash ?? ""} readonly />
            <label>InfoHash</label>
          </div>
          <div class="row">
            <div class="field label suffix border">
              <input type="text" value={pieceCount.value} readonly />
              <label>Peças</label>
            </div>
            <div class="field label suffix border">
              <input type="text" value={`${formatSize(pieceLength.value)}`} readonly />
              <label>Tam. peça</label>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
