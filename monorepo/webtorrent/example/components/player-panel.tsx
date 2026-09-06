/**
 * player-panel.tsx — Player de stream P2P + status de peers.
 */
import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import {
  torrentSignal,
  clientSignal,
  peersSignal,
  modeSignal,
  downSpeedSignal,
  upSpeedSignal,
} from "../torrent-context.tsx";
import { buildStreamURL } from "@loco/webtorrent";

function formatSpeed(bps: number): string {
  if (bps < 1024) return `${bps} B/s`;
  if (bps < 1024 ** 2) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / 1024 ** 2).toFixed(1)} MB/s`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function PlayerPanel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamUrl = useSignal<string | null>(null);
  const isPlaying = useSignal(false);
  const updateInterval = useSignal<number | null>(null);

  const torrent = torrentSignal.value;
  const mode = modeSignal.value;
  const peers = peersSignal.value;
  const isActive = mode !== "idle";

  // Atualiza speeds periodicamente
  useEffect(() => {
    const id = setInterval(() => {
      const t = torrentSignal.value;
      if (t) {
        downSpeedSignal.value = t.downloadSpeed;
        upSpeedSignal.value = t.uploadSpeed;
      }
    }, 500) as unknown as number;

    updateInterval.value = id;
    return () => clearInterval(id);
  }, []);

  // Reconstrói stream URL quando torrent está pronto
  useEffect(() => {
    if (!torrent || !clientSignal.value) return;

    const file = torrent.files[0];
    if (!file) return;

    const client = clientSignal.value;
    const server = client.server;
    if (!server) return;

    const url = buildStreamURL("/", torrent.infoHash, 0, file.name);
    streamUrl.value = url;

    // Conecta stream ao <video> via client._makeFileObjects()
    if (videoRef.current) {
      const files = (client as any)._makeFileObjects(torrent, "/");
      files[0]?.streamTo(videoRef.current);
    }
  }, [torrent?.infoHash, clientSignal.value?.server]);

  const handleCanPlay = () => {
    isPlaying.value = true;
  };

  const handleEnded = () => {
    isPlaying.value = false;
  };

  const isVideo = (() => {
    const name = torrent?.files[0]?.name ?? "";
    return /\.(mp4|webm|mkv|avi|mov)$/i.test(name);
  })();

  return (
    <div class="field">
      {/* Video/Audio player */}
      {isActive && streamUrl.value && isVideo && (
        <video
          ref={videoRef}
          controls
          autoplay
          class="responsive round"
          onCanPlay={handleCanPlay}
          onEnded={handleEnded}
        />
      )}

      {/* Status de streaming */}
      {isActive && !isVideo && (
        <div class="chip">
          <i class="material-symbols small">audio_file</i>
          Áudio detectado — use player externo com:
        </div>
      )}

      {isActive && streamUrl.value && (
        <div class="field label suffix border">
          <input
            type="text"
            value={streamUrl.value}
            readonly
            onClick={(e) => {
              (e.target as HTMLInputElement).select();
              navigator.clipboard.writeText(streamUrl.value!);
            }}
          />
          <label>Stream URL</label>
          <button
            class="transparent front"
            onClick={() => navigator.clipboard.writeText(streamUrl.value!)}
            title="Copiar URL"
          >
            <i class="material-symbols small">content_copy</i>
          </button>
        </div>
      )}

      {/* Progresso */}
      {isActive && torrent && (
        <div class="field">
          <progress value={torrent.progress} class="max" />
          <label>{Math.round(torrent.progress * 100)}%</label>
        </div>
      )}

      {/* Velocidades */}
      {isActive && (
        <div class="row no-space">
          <div class="field label border">
            <input
              type="text"
              value={formatSpeed(downSpeedSignal.value)}
              readonly
            />
            <label class="green-text">
              <i class="material-symbols small">download</i>
              Download
            </label>
          </div>
          <div class="field label border">
            <input
              type="text"
              value={formatSpeed(upSpeedSignal.value)}
              readonly
            />
            <label class="red-text">
              <i class="material-symbols small">upload</i>
              Upload
            </label>
          </div>
        </div>
      )}

      {/* Peers conectados */}
      {isActive && peers.length > 0 && (
        <div class="chip">
          <i class="material-symbols small">group</i>
          {peers.length} peer{peers.length !== 1 ? "s" : ""}
        </div>
      )}

      {/* Info do arquivo */}
      {isActive && torrent && torrent.files[0] && (
        <div class="chip">
          <i class="material-symbols small">file_present</i>
          {torrent.files[0].name} ({formatSize(torrent.files[0].length)})
        </div>
      )}

      {/* Estado ocioso */}
      {!isActive && (
        <div class="secondary-text small-text">
          <i class="material-symbols small">info</i>
          Ative o WebTorrent e adicione um torrent para iniciar
        </div>
      )}
    </div>
  );
}
