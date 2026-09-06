/**
 * torrent-context.tsx — Contexto global de Preact com Signals.
 * Gerencia o ciclo de vida do WebTorrent client, torrent ativo,
 * peers conectados e estatísticas de rede.
 */
import { createContext } from "preact";
import { signal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import type { WebTorrent, Torrent, Wire } from "@loco/webtorrent";
import type { WebTorrentServer } from "@loco/webtorrent";

// ─── Trackers públicos ─────────────────────────────────────────────────────────

export const PUBLIC_TRACKERS = [
  "wss://tracker.webtorrent.dev:443",
  "wss://tracker.openwebtorrent.com:443",
  "wss://open.ftorrent.com:443",
];

// ─── Estado global (signals) ─────────────────────────────────────────────────

export const clientSignal = signal<WebTorrent | null>(null);
export const serverSignal = signal<WebTorrentServer | null>(null);
export const torrentSignal = signal<Torrent | null>(null);
export const peersSignal = signal<Wire[]>([]);
export const downSpeedSignal = signal(0);
export const upSpeedSignal = signal(0);
export const errorSignal = signal<string | null>(null);
export const modeSignal = signal<"idle" | "seeding" | "leeching">("idle");

// ─── Helpers de ciclo de vida ────────────────────────────────────────────────

export async function initClient(): Promise<WebTorrent> {
  const existing = clientSignal.value;
  if (existing) return existing;

  const { WebTorrent: WT } = await import("@loco/webtorrent");
  const wt = new WT({
    peerId: undefined,
    maxConns: 55,
    useOPFS: navigator.storage?.getDirectory != null,
    rtcConfig: {},
  });

  wt.on("error", (e: Event) => {
    const ce = e as CustomEvent<Error>;
    errorSignal.value = ce.detail?.message ?? String(e);
  });

  clientSignal.value = wt;
  return wt;
}

export async function seedFile(file: File): Promise<void> {
  errorSignal.value = null;
  modeSignal.value = "idle";

  const wt = await initClient();
  let server = serverSignal.value;

  if (!server) {
    server = wt.createServer({ scope: "/" });
    await server.sendReadyAck();
    serverSignal.value = server;
  }

  try {
    const torrent = await wt.seed(file, {
      name: file.name,
      trackers: PUBLIC_TRACKERS,
    });

    torrentSignal.value = torrent;
    modeSignal.value = "seeding";

    // Escuta eventos de peer
    torrent.on("wire", (e: CustomEvent<{ wire: Wire; addr: string }>) => {
      const swarm = (torrent as any).swarm;
      const wires = [...(swarm?.peers.values() ?? [])]
        .map((p: any) => p.wire)
        .filter((w: Wire | null): w is Wire => w !== null);
      peersSignal.value = wires;
      e.detail.wire.on("close", () => {
        const updated = [...(swarm?.peers.values() ?? [])]
          .map((p: any) => p.wire)
          .filter((w: Wire | null): w is Wire => w !== null);
        peersSignal.value = updated;
      });
    });

    console.log("[seed] torrent created:", torrent.infoHash);
  } catch (e) {
    errorSignal.value = e instanceof Error ? e.message : String(e);
    throw e;
  }
}

export async function addTorrent(torrentId: string): Promise<void> {
  errorSignal.value = null;
  modeSignal.value = "idle";

  const wt = await initClient();
  let server = serverSignal.value;

  if (!server) {
    server = wt.createServer({ scope: "/" });
    await server.sendReadyAck();
    serverSignal.value = server;
  }

  try {
    const torrent = await wt.add(torrentId);

    torrentSignal.value = torrent;
    modeSignal.value = "leeching";

    // Escuta eventos
    torrent.on("wire", (e: CustomEvent<{ wire: Wire; addr: string }>) => {
      const swarm = (torrent as any).swarm;
      const wires = [...(swarm?.peers.values() ?? [])]
        .map((p: any) => p.wire)
        .filter((w: Wire | null): w is Wire => w !== null);
      peersSignal.value = wires;
      e.detail.wire.on("close", () => {
        const updated = [...(swarm?.peers.values() ?? [])]
          .map((p: any) => p.wire)
          .filter((w: Wire | null): w is Wire => w !== null);
        peersSignal.value = updated;
      });
    });

    console.log("[add] torrent:", torrent.infoHash);
  } catch (e) {
    errorSignal.value = e instanceof Error ? e.message : String(e);
    throw e;
  }
}

export function cleanup(): void {
  const server = serverSignal.value;
  if (server) {
    server.destroy();
    serverSignal.value = null;
  }
  const client = clientSignal.value;
  if (client) {
    client.destroy();
    clientSignal.value = null;
  }
  torrentSignal.value = null;
  peersSignal.value = [];
  modeSignal.value = "idle";
  downSpeedSignal.value = 0;
  upSpeedSignal.value = 0;
  errorSignal.value = null;
}

// ─── Context provider ────────────────────────────────────────────────────────

export const TorrentContext = createContext({});

export function TorrentProvider({ children }: { children: ComponentChildren }) {
  return (
    <TorrentContext.Provider value={{}}>
      {children}
    </TorrentContext.Provider>
  );
}
