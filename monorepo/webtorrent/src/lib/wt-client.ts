/**
 * Wrapper do WebTorrent para discovery de presença.
 *
 * Carrega WebTorrent via window (script tag CDN no index.html).
 * Usa client.add(infoHash) para entrar em swarms arbitrários
 * e detectar peers via tracker público.
 */

/* WebTorrent é carregado via <script> tag no index.html */
declare const WebTorrent: any;

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

export class WTClient {
  private client: any;
  private torrents = new Map<string, any>();
  private peers = new Map<string, Map<string, PeerInfo>>();
  private joinTimes = new Map<string, number>();
  private cb: WTCallbacks;

  constructor(cb: WTCallbacks) {
    this.cb = cb;

    if (typeof WebTorrent === "undefined") {
      cb.onError("WebTorrent não encontrado. Verifique o CDN no index.html.");
      return;
    }

    this.client = new WebTorrent({
      tracker: {
        announce: [
          "wss://tracker.openwebtorrent.com",
          "wss://tracker.btorrent.xyz",
        ],
      },
    });

    this.client.on("error", (err: any) => {
      cb.onError(`WT client: ${err.message || err}`);
    });

    cb.onLog("WebTorrent client criado");
  }

  joinSwarm(infoHash: string): void {
    if (this.torrents.has(infoHash)) {
      this.cb.onLog(`Já no swarm ${infoHash.slice(0, 8)}…`);
      return;
    }

    this.joinTimes.set(infoHash, Date.now());
    this.peers.set(infoHash, new Map());
    this.cb.onLog(`Entrando no swarm ${infoHash.slice(0, 8)}…`);

    const t = this.client.add(infoHash, {
      announce: [
        "wss://tracker.openwebtorrent.com",
        "wss://tracker.btorrent.xyz",
      ],
    });

    t.on("ready", () => {
      const ms = Date.now() - (this.joinTimes.get(infoHash) || Date.now());
      this.cb.onSwarmReady(infoHash, ms);
      this.cb.onLog(`Swarm pronto em ${ms}ms`);
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
          this.cb.onLog(`Peer OFFLINE: ${peerId.slice(0, 12)}… (${Math.round(sessionMs / 1000)}s)`);
        }
      });

      wire.on("error", () => {
        // Erro de conexão com peer — ignora silenciosamente
      });
    });

    t.on("error", (err: any) => {
      this.cb.onError(`Swarm ${infoHash.slice(0, 8)}: ${err.message || err}`);
    });

    this.torrents.set(infoHash, t);
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