// Arquivo: monorepo/webtorrent/src/store.ts
import { signal } from "@preact/signals";
import { generateIdentity, deriveInfoHash } from "./lib/identity.ts";
import type { Identity } from "./lib/identity.ts";
import { WTClient } from "./lib/webtorrent.ts";
import type { PeerInfo } from "./lib/webtorrent.ts";
import { sendPingViaWire, processWireMessage } from "./lib/ping.ts";
import type { PingResult } from "./lib/ping.ts";
import { createMetrics } from "./lib/metrics.ts";
import type { MetricsData } from "./lib/metrics.ts";

export const localId = signal<Identity | null>(null);
export const swarmStatus = signal<"off" | "connecting" | "on">("off");
export const peers = signal<PeerInfo[]>([]);
export const logs = signal<string[]>([]);
export const metrics = signal<MetricsData>(createMetrics());
export const lastPing = signal<PingResult | null>(null);
export const contactKey = signal("");
export const monitoring = signal(false);
export const swStatus = signal<"unregistered" | "installing" | "activating" | "activated" | "error">("unregistered");

let wt: WTClient | null = null;

function log(msg: string, isError = false) {
  const t = new Date().toLocaleTimeString();
  const prefix = isError ? "❌" : "▸";
  logs.value = [`${prefix} [${t}] ${msg}`, ...logs.value.slice(0, 149)];
}

export async function init() {
  try {
    log("Iniciando geração de identidade...");
    const id = await generateIdentity();
    localId.value = id;
    log(`Identidade gerada: ${id.publicKey.slice(0, 16)}…`);
    log(`InfoHash: ${id.infoHash}`);
  } catch (err: any) {
    log(`FALHA: ${err.message}`, true);
  }
}

export async function registerSW() {
  if (!("serviceWorker" in navigator)) {
    swStatus.value = "error";
    log("Service Worker não suportado neste navegador.", true);
    return;
  }
  try {
    log("Registrando Service Worker...");
    // O type: "module" é crucial para que o SW possa usar import/export
    const registration = await navigator.serviceWorker.register("/worker.js", {
      scope: "/",
      type: "module",
    });
    
    const worker = registration.active || registration.waiting || registration.installing;
    
    const checkState = (w: ServiceWorker | null) => {
      if (!w) return;
      swStatus.value = w.state as "unregistered" | "installing" | "activating" | "activated" | "error";
      if (w.state === "activated") {
        log("Service Worker ativado com sucesso!");
      }
    };

    checkState(worker);
    
    if (worker && worker.state !== "activated") {
      worker.addEventListener("statechange", () => checkState(worker));
    }
  } catch (err: any) {
    log(`Erro ao registrar SW: ${err.message}`, true);
    swStatus.value = "error";
  }
}

export function initWTClient() {
  if (wt || !localId.value) return;
  log("Inicializando cliente WebTorrent para detecção de presença...");
  wt = new WTClient({
    onPeerJoined: (hash, peer) => {
      peers.value = wt?.getPeers(hash) || [];
      metrics.value = {
        ...metrics.value,
        peerDetections: [...metrics.value.peerDetections, Date.now() - peer.joinedAt],
      };
      if (peer.wire?._pe) {
        peer.wire._pe.on("data", (data: any) => {
          const result = processWireMessage(data, localId.value!.publicKey, contactKey.value, peer.wire);
          if (result) {
            lastPing.value = result;
            metrics.value = {
              ...metrics.value,
              pingRTTs: [...metrics.value.pingRTTs, result.rtt],
            };
            log(`PONG de ${result.from.slice(0, 12)}… RTT=${result.rtt}ms válido=${result.valid}`);
          }
        });
      }
    },
    onPeerLeft: (hash, _peerId, sessionMs) => {
      peers.value = wt?.getPeers(hash) || [];
      metrics.value = {
        ...metrics.value,
        peerLeaves: [...metrics.value.peerLeaves, sessionMs],
      };
    },
    onSwarmReady: (_hash, ms) => {
      swarmStatus.value = "on";
      metrics.value = {
        ...metrics.value,
        swarmJoinMs: ms,
        uptimeStart: Date.now(),
      };
      log(`Swarm pronto em ${ms}ms`);
    },
    onError: (msg) => {
      log(msg, true);
      metrics.value = { ...metrics.value, trackerErrors: metrics.value.trackerErrors + 1 };
    },
    onLog: (msg) => log(msg),
  });
  wt.joinSwarm(localId.value.infoHash);
  swarmStatus.value = "connecting";
}

export function startSwarm() {
  if (!localId.value || wt) return;
  initWTClient();
}

export function stopSwarm() {
  if (wt && localId.value) {
    wt.leaveSwarm(localId.value.infoHash);
    wt.destroy();
    wt = null;
  }
  swarmStatus.value = "off";
  peers.value = [];
}

export async function monitorContact() {
  if (!wt || !contactKey.value || monitoring.value) {
    if (!wt) initWTClient();
  }
  if (wt && contactKey.value) {
    try {
      const hash = await deriveInfoHash(contactKey.value);
      log(`Monitorando contato: hash=${hash.slice(0, 8)}…`);
      wt.joinSwarm(hash);
      monitoring.value = true;
    } catch (err: any) {
      log(`Erro: ${err.message}`, true);
    }
  }
}

export function stopMonitoring() {
  if (!wt || !contactKey.value) return;
  deriveInfoHash(contactKey.value).then((hash) => {
    wt?.leaveSwarm(hash);
  });
  monitoring.value = false;
  peers.value = [];
}

export function doPing(peer: PeerInfo) {
  if (!localId.value || !wt) return;
  lastPing.value = null;
  log(`Enviando PING para ${peer.id.slice(0, 12)}…`);
  const sent = sendPingViaWire(peer.wire, localId.value.publicKey);
  if (!sent) {
    lastPing.value = {
      rtt: -1,
      from: peer.id,
      valid: false,
      ts: Date.now(),
      method: "não suportado",
    };
    log("Ping falhou: método de envio não disponível", true);
  } else {
    setTimeout(() => {
      if (!lastPing.value) {
        lastPing.value = {
          rtt: -1,
          from: peer.id,
          valid: false,
          ts: Date.now(),
          method: "timeout",
        };
        log("Ping timeout (10s)", true);
      }
    }, 10000);
  }
}

export async function regenerate() {
  stopSwarm();
  monitoring.value = false;
  lastPing.value = null;
  metrics.value = createMetrics();
  logs.value = [];
  await init();
}