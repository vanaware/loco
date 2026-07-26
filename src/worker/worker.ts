/// <reference lib="webworker" />

interface WebTorrentFile {
  name: string;
  _getMimeType: () => string;
  createReadStream: () => ReadableStream<Uint8Array>;
}

interface WebTorrentTorrent {
  magnetURI: string;
  infoHash: string;
  progress: number;
  uploaded: number;
  downloaded: number;
  uploadSpeed: number;
  downloadSpeed: number;
  numPeers: number;
  length: number;
  files: WebTorrentFile[];
  on(event: string, listener: (...args: unknown[]) => void): void;
  destroy(opts?: { destroyStore?: boolean }, cb?: () => void): void;
}

interface WebTorrentClient {
  seed(file: File, cb?: (torrent: WebTorrentTorrent) => void): void;
  add(magnetURI: string, cb?: (torrent: WebTorrentTorrent) => void): void;
  destroy(cb?: () => void): void;
}

declare const self: DedicatedWorkerGlobalScope;

let client: WebTorrentClient | null = null;
let currentTorrent: WebTorrentTorrent | null = null;

self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;

  try {
    switch (type) {
      case "P2P_START_SEED": {
        const { file }: { file: File } = payload;
        const { default: WebTorrent } = await import("webtorrent");

        if (client) client.destroy();
        client = new WebTorrent() as WebTorrentClient;

        client.seed(file, (torrent: WebTorrentTorrent) => {
          currentTorrent = torrent;

          let lastPeerCount = 0;
          const interval = setInterval(() => {
            if (torrent.numPeers === 0 && lastPeerCount === 0) {
              clearInterval(interval);
              finalizarSessao("SEED_COMPLETO");
            }
            lastPeerCount = torrent.numPeers;
          }, 5000);

          self.postMessage({
            type: "P2P_SEED_READY",
            payload: {
              magnetURI: torrent.magnetURI,
              infoHash: torrent.infoHash,
              fileName: file.name,
              fileSize: file.size,
            },
          });

          torrent.on("upload", () => {
            self.postMessage({
              type: "P2P_PROGRESS",
              payload: {
                role: "sender",
                progress: torrent.progress,
                uploaded: torrent.uploaded,
                uploadSpeed: torrent.uploadSpeed,
                peers: torrent.numPeers,
              },
            });
          });
        });
        break;
      }

      case "P2P_START_DOWNLOAD": {
        const { magnetURI, fileName }: { magnetURI: string; fileName: string } =
          payload;
        const { default: WebTorrent } = await import("webtorrent");

        if (client) client.destroy();
        client = new WebTorrent() as WebTorrentClient;

        client.add(magnetURI, (torrent: WebTorrentTorrent) => {
          currentTorrent = torrent;

          torrent.on("download", () => {
            self.postMessage({
              type: "P2P_PROGRESS",
              payload: {
                role: "receiver",
                progress: torrent.progress,
                downloaded: torrent.downloaded,
                downloadSpeed: torrent.downloadSpeed,
                peers: torrent.numPeers,
              },
            });
          });

          torrent.on("done", async () => {
            try {
              const fileObj = torrent.files[0];
              const stream = fileObj.createReadStream();
              const chunks: Uint8Array[] = [];
              for await (const chunk of stream) {
                chunks.push(chunk);
              }
              const blob = new Blob(chunks as BlobPart[], {
                type: fileObj._getMimeType(),
              });

              const root = await navigator.storage.getDirectory();
              const fileHandle = await root.getFileHandle(fileName, {
                create: true,
              });
              const writable = await fileHandle.createWritable();
              await writable.write(blob);
              await writable.close();
            } catch (e) {
              console.warn("OPFS save failed, file in memory only:", e);
            }

            self.postMessage({
              type: "P2P_DOWNLOAD_COMPLETE",
              payload: {
                fileName,
                fileSize: torrent.length,
              },
            });

            finalizarSessao("DOWNLOAD_COMPLETO");
          });
        });
        break;
      }

      case "P2P_CANCEL": {
        finalizarSessao("CANCELADO_PELO_USUARIO");
        break;
      }
    }
  } catch (error) {
    self.postMessage({
      type: "P2P_ERROR",
      payload: { message: (error as Error).message },
    });
    finalizarSessao("ERRO");
  }
};

function finalizarSessao(motivo: string) {
  if (currentTorrent) {
    currentTorrent.destroy({ destroyStore: false });
    currentTorrent = null;
  }
  if (client) {
    client.destroy();
    client = null;
  }

  self.postMessage({
    type: "P2P_SESSION_ENDED",
    payload: { reason: motivo },
  });
}

export {};
