/**
 * Web Worker dedicado para Transferência P2P (WebTorrent + OPFS)
 */

let client = null;
let currentTorrent = null;
let accessHandle = null;

self.onmessage = async (e) => {
  const { type, payload } = e.data;

  try {
    switch (type) {
      case 'P2P_START_SEED': {
        const { file } = payload;
        const { default: WebTorrent } = await import('https://esm.sh/webtorrent@2.5.1?bundle');

        if (client) client.destroy();
        client = new WebTorrent();

        client.seed(file, async (torrent) => {
          currentTorrent = torrent;
          
          // Auto-termina seed quando não há peers conectados
          let lastPeerCount = 0;
          const interval = setInterval(() => {
            if (torrent.numPeers === 0 && lastPeerCount === 0) {
              clearInterval(interval);
              finalizarSessao('SEED_COMPLETO');
            }
            lastPeerCount = torrent.numPeers;
          }, 5000);

          self.postMessage({
            type: 'P2P_SEED_READY',
            payload: {
              magnetURI: torrent.magnetURI,
              infoHash: torrent.infoHash,
              fileName: file.name,
              fileSize: file.size
            }
          });

          torrent.on('upload', () => {
            self.postMessage({
              type: 'P2P_PROGRESS',
              payload: {
                role: 'sender',
                progress: torrent.progress,
                uploaded: torrent.uploaded,
                uploadSpeed: torrent.uploadSpeed,
                peers: torrent.numPeers
              }
            });
          });
        });
        break;
      }

      case 'P2P_START_DOWNLOAD': {
        const { magnetURI, fileName } = payload;
        const { default: WebTorrent } = await import('https://esm.sh/webtorrent@2.5.1?bundle');

        if (client) client.destroy();
        client = new WebTorrent();

        client.add(magnetURI, async (torrent) => {
          currentTorrent = torrent;

          torrent.on('download', () => {
            self.postMessage({
              type: 'P2P_PROGRESS',
              payload: {
                role: 'receiver',
                progress: torrent.progress,
                downloaded: torrent.downloaded,
                downloadSpeed: torrent.downloadSpeed,
                peers: torrent.numPeers
              }
            });
          });

          torrent.on('done', async () => {
            try {
              // Usa stream API para maior compatibilidade
              const fileObj = torrent.files[0];
              const stream = fileObj.createReadStream();
              const chunks = [];
              for await (const chunk of stream) {
                chunks.push(chunk);
              }
              const blob = new Blob(chunks, { type: fileObj._getMimeType() });

              // Salva no OPFS
              const root = await navigator.storage.getDirectory();
              const fileHandle = await root.getFileHandle(fileName, { create: true });
              const writable = await fileHandle.createWritable();
              await writable.write(blob);
              await writable.close();
            } catch (e) {
              console.warn("OPFS save failed, file in memory only:", e);
            }

            self.postMessage({
              type: 'P2P_DOWNLOAD_COMPLETE',
              payload: {
                fileName,
                fileSize: torrent.length
              }
            });

            finalizarSessao('DOWNLOAD_COMPLETO');
          });
        });
        break;
      }

      case 'P2P_CANCEL': {
        finalizarSessao('CANCELADO_PELO_USUARIO');
        break;
      }
    }
  } catch (error) {
    self.postMessage({
      type: 'P2P_ERROR',
      payload: { message: error.message }
    });
    finalizarSessao('ERRO');
  }
};

function finalizarSessao(motivo) {
  if (currentTorrent) {
    currentTorrent.destroy({ destroyStore: false });
    currentTorrent = null;
  }
  if (client) {
    client.destroy();
    client = null;
  }

  self.postMessage({
    type: 'P2P_SESSION_ENDED',
    payload: { reason: motivo }
  });
}