/**
 * Wrapper do WebTorrent para discovery de presença.
 * Acessa WebTorrent via window (carregado por CDN no index.html).
 */

export interface PeerInfo {
  id: string;
  status: "online" | "offline";
  joinedAt: number;
  leftAt: number | null;
  wire: any;
}

export interface WTCallbacks {
  onPeerJoined: (infoHash: string, peer: PeerInfo) => void;
  onPeerLeft: (infoHash: string, peerId: string, sessionMs: number) => void;
  onSwarmReady: (infoHash: string, joinMs: number) => void;
  onError: (msg: string) => void;
  onLog: (msg: string) => void;
}

  const RELIABLE_TRACKERS = [
  "wss://tracker.webtorrent.dev:443",
  "wss://tracker.openwebtorrent.com:443",
  "wss://open.ftorrent.com:443"
];

export class WTClient {
  private client: any;
  private torrents = new Map<string, any>();
  private peers = new Map<string, Map<string, PeerInfo>>();
  private joinTimes = new Map<string, number>();
  private cb: WTCallbacks;

  constructor(cb: WTCallbacks) {
    this.cb = cb;

    // Acessa WebTorrent explicitamente via window
    const WT = (window as any).WebTorrent;
    
    if (!WT) {
      cb.onError("WebTorrent não encontrado em window.WebTorrent. Verifique o CDN no index.html.");
      console.error("[WTClient] WebTorrent não disponível. Objeto window:", Object.keys(window).filter(k => k.toLowerCase().includes('torrent')));
      throw new Error("WebTorrent não carregado");
    }

    cb.onLog("WebTorrent encontrado, inicializando client...");

    try {
      // 🔥 CORREÇÃO CRÍTICA: Configuração completa do WebTorrent
      this.client = new WT({
        // Trackers para discovery de peers
        tracker: {
          announce: [
            ...RELIABLE_TRACKERS
          ],
        },
        // 🔥 CORREÇÃO: Configuração DHT para discovery descentralizado
        dht: true,
        // 🔥 CORREÇÃO: Configuração WebRTC com ICE servers
        rtcConfig: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
            { urls: "stun:stun3.l.google.com:19302" },
            { urls: "stun:stun4.l.google.com:19302" }
          ]
        },
        // Configurações adicionais
        maxConns: 55,
        trackerAnnounce: true,
        webSeeds: false // Desabilitado para presença pura
      });

      // 🔥 CORREÇÃO: Event listeners para debug
      this.client.on("error", (err: any) => {
        cb.onError(`WT client error: ${err.message || err}`);
      });

      this.client.on("listening", () => {
        cb.onLog("WebTorrent client está ouvindo conexões");
      });

      this.client.on("warning", (err: any) => {
        cb.onLog(`WT warning: ${err.message || err}`);
      });

      cb.onLog("WebTorrent client criado com sucesso");
    } catch (err: any) {
      cb.onError(`Falha ao criar WebTorrent client: ${err.message}`);
      throw err;
    }
  }

  joinSwarm(infoHash: string): void {
    // Verificação de segurança
    if (!this.client) {
      this.cb.onError("Client não inicializado. Não é possível entrar no swarm.");
      return;
    }

    if (this.torrents.has(infoHash)) {
      this.cb.onLog(`Já no swarm ${infoHash.slice(0, 8)}…`);
      return;
    }

    this.joinTimes.set(infoHash, Date.now());
    this.peers.set(infoHash, new Map());
    this.cb.onLog(`Entrando no swarm ${infoHash.slice(0, 8)}…`);

    try {
      // 🔥 CORREÇÃO: Configuração completa do torrent
      const t = this.client.add(infoHash, {
        announce: [
          ...RELIABLE_TRACKERS
        ],
        // 🔥 CORREÇÃO: Forçar uso de WebRTC
        rtcConfig: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
            { urls: "stun:stun3.l.google.com:19302" },
            { urls: "stun:stun4.l.google.com:19302" }
          ]
        }
      });

      // 🔥 CORREÇÃO: Event listeners detalhados
      t.on("infoHash", () => {
        this.cb.onLog(`InfoHash confirmado: ${infoHash.slice(0, 8)}…`);
      });

      t.on("metadata", () => {
        this.cb.onLog(`Metadados recebidos para ${infoHash.slice(0, 8)}…`);
      });

      t.on("ready", () => {
        const ms = Date.now() - (this.joinTimes.get(infoHash) || Date.now());
        this.cb.onSwarmReady(infoHash, ms);
        this.cb.onLog(`Swarm pronto em ${ms}ms`);
      });

      t.on("warning", (err: any) => {
        this.cb.onLog(`Torrent warning: ${err.message || err}`);
      });

      t.on("error", (err: any) => {
        this.cb.onError(`Swarm ${infoHash.slice(0, 8)} error: ${err.message || err}`);
      });

      t.on("wire", (wire: any) => {
        const peerId = wire.peerId || wire.remoteAddress || `peer-${Date.now()}`;
        const peer: PeerInfo = {
          id: peerId,
          status: "online",
          joinedAt: Date.now(),
          leftAt: null,
          wire,
        };
        this.peers.get(infoHash)?.set(peerId, peer);
        this.cb.onPeerJoined(infoHash, peer);
        this.cb.onLog(`Peer ONLINE: ${peerId.slice(0, 12)}…`);

        wire.on("close", () => {
          const p = this.peers.get(infoHash)?.get(peerId);
          if (p) {
            p.status = "offline";
            p.leftAt = Date.now();
            const sessionMs = p.leftAt - p.joinedAt;
            this.cb.onPeerLeft(infoHash, peerId, sessionMs);
            this.cb.onLog(
              `Peer OFFLINE: ${peerId.slice(0, 12)}… (${Math.round(sessionMs / 1000)}s)`
            );
          }
        });

        wire.on("error", () => {
          // Erro de conexão com peer — ignora silenciosamente
        });
      });

      // 🔥 CORREÇÃO: Evento de descoberta de peers
      t.on("peer", (peer: any) => {
        this.cb.onLog(`Peer descoberto: ${peer.id || peer}`);
      });

      this.torrents.set(infoHash, t);
    } catch (err: any) {
      this.cb.onError(`Falha ao entrar no swarm: ${err.message}`);
    }
  }

  leaveSwarm(infoHash: string): void {
    const t = this.torrents.get(infoHash);
    if (t) {
      t.destroy();
      this.torrents.delete(infoHash);
      this.peers.delete(infoHash);
      this.cb.onLog(`Saiu do swarm ${infoHash.slice(0, 8)}…`);
    }
  }

  getPeers(infoHash: string): PeerInfo[] {
    const m = this.peers.get(infoHash);
    return m ? Array.from(m.values()) : [];
  }

  getWire(infoHash: string, peerId: string): any | null {
    return this.peers.get(infoHash)?.get(peerId)?.wire || null;
  }

  destroy(): void {
    for (const [hash] of this.torrents) {
      this.leaveSwarm(hash);
    }
    if (this.client) {
      this.client.destroy();
    }
    this.cb.onLog("Client destruído");
  }
}