import { useEffect, useState } from "preact/hooks";
import WebTorrent from "webtorrent";

export function App() {
  const [status, setStatus] = useState("Inicializando...");
  const [infoHash, setInfoHash] = useState("");

  useEffect(() => {
    async function init() {
      // Verifica suporte a WebRTC
      if (!WebTorrent.WEBRTC_SUPPORT) {
        setStatus("❌ WebRTC não suportado neste browser.");
        return;
      }

      const client = new WebTorrent();
      
      // Aguarda o SW ficar pronto
      const reg = await navigator.serviceWorker.ready;
      
      // Cria o server HTTP interno do WebTorrent, forçando o modo browser
      // e vinculando ao Service Worker registrado
      client.createServer({ controller: reg }, "browser");
      
      setStatus("✅ WebTorrent Client + Server ativos.");

      // Exemplo: Criar um torrent vazio (apenas para presence/swarm)
      // Na prática, você usaria client.seed() ou client.add(magnet)
      const buf = new Uint8Array([1, 2, 3]);
      (buf as any).name = "presence.txt";
      
      client.seed(buf, { announce: ["wss://tracker.openwebtorrent.com"] }, (torrent) => {
        setInfoHash(torrent.infoHash);
        setStatus(`✅ Seeding presence swarm: ${torrent.infoHash}`);
        
        torrent.on("wire", (wire) => {
          console.log("🟢 Peer conectado via WebRTC:", wire.peerId);
        });
      });
    }

    init();
  }, []);

  return (
    <main class="responsive padding">
      <h3>🧪 WebTorrent NPM + Service Worker</h3>
      
      <article class="surface-container-low padding">
        <h5>Status do Client</h5>
        <p>{status}</p>
        
        {infoHash && (
          <div class="field prefix round border margin-top">
            <i>tag</i>
            <div class="max">
              <label>InfoHash (Swarm)</label>
              <pre class="small-text">{infoHash}</pre>
            </div>
          </div>
        )}
        
        <p class="small-text margin-top">
          O Service Worker está interceptando requisições em <code>/webtorrent/</code>.
          Abra em outra aba/dispositivo e conecte ao mesmo InfoHash para validar o P2P.
        </p>
      </article>
    </main>
  );
}