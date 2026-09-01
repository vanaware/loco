> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém experimentos e código da área de WEBTORRENT.
> O projeto é o **Loco ** estruturado em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco - Modo: WEBTORRENT

Gerado automaticamente em: 8/31/2026, 11:14:42 PM

---

## Arquivo: `monorepo/webtorrent/src/index.html`

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Loco — Teste WebTorrent Presença</title>

  <!-- WebTorrent via CDN (mais confiável que esm.sh para esta lib) -->
  <script src="https://cdn.jsdelivr.net/npm/webtorrent@2.5.1/webtorrent.min.js"></script>

  <!-- Import map para Preact + Signals + htm via esm.sh -->
  <script type="importmap">
  {
    "imports": {
      "preact": "https://esm.sh/preact@10.25.4",
      "preact/hooks": "https://esm.sh/preact@10.25.4/hooks",
      "@preact/signals": "https://esm.sh/@preact/signals@2.0.1",
      "@preact/signals-core": "https://esm.sh/@preact/signals-core@1.8.0",
      "htm": "https://esm.sh/htm@3.1.1"
    }
  }
  </script>

  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0f0f1a;
      color: #e0e0e0;
      padding: 12px;
      max-width: 600px;
      margin: 0 auto;
    }
    h1 { color: #e94560; font-size: 1.4rem; margin-bottom: 12px; }
    h2 {
      background: #e94560; color: white;
      padding: 6px 12px; border-radius: 8px;
      font-size: 0.9rem; margin: 14px 0 8px;
    }
    .card {
      background: #1a1a2e; border-radius: 12px;
      padding: 12px; margin-bottom: 10px;
    }
    .mono {
      font-family: 'Courier New', monospace; font-size: 11px;
      word-break: break-all; background: #0a0a1a;
      padding: 6px 8px; border-radius: 6px; margin: 4px 0;
      color: #7fdbca;
    }
    button {
      background: #e94560; color: white; border: none;
      padding: 8px 14px; border-radius: 8px; cursor: pointer;
      font-size: 13px; margin: 3px 2px; transition: background 0.2s;
    }
    button:hover { background: #c73652; }
    button:disabled { background: #444; cursor: not-allowed; }
    button.sec { background: #16213e; border: 1px solid #e94560; }
    button.sec:hover { background: #1a3a6e; }
    button.ok { background: #2ecc71; }
    button.ok:hover { background: #27ae60; }
    input[type="text"] {
      background: #0a0a1a; color: #7fdbca; border: 1px solid #333;
      padding: 8px 10px; border-radius: 8px; width: 100%;
      font-family: monospace; font-size: 12px; margin: 4px 0;
    }
    input[type="text"]:focus { border-color: #e94560; outline: none; }
    .dot {
      display: inline-block; width: 10px; height: 10px;
      border-radius: 50%; margin-right: 6px; vertical-align: middle;
    }
    .dot.on { background: #2ecc71; box-shadow: 0 0 6px #2ecc71; }
    .dot.off { background: #e74c3c; }
    .dot.wait { background: #f39c12; animation: pulse 1s infinite; }
    @keyframes pulse { 50% { opacity: 0.3; } }
    .peer-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px; background: #16213e; border-radius: 8px; margin: 4px 0;
      flex-wrap: wrap; gap: 6px;
    }
    .peer-id { font-family: monospace; font-size: 11px; color: #7fdbca; }
    .log-box {
      font-family: monospace; font-size: 10px;
      max-height: 160px; overflow-y: auto;
      background: #050510; padding: 8px; border-radius: 6px;
    }
    .log-line { padding: 1px 0; color: #888; }
    .log-line .t { color: #555; }
    .log-line .m { color: #2ecc71; }
    .log-line .e { color: #e74c3c; }
    .metric-row {
      display: flex; justify-content: space-between;
      padding: 3px 0; font-size: 13px;
    }
    .metric-row .l { color: #888; }
    .metric-row .v { color: #2ecc71; font-family: monospace; }
    .ping-box {
      padding: 8px; border-radius: 8px; margin: 6px 0;
      font-weight: bold; font-size: 13px;
    }
    .ping-box.ok { background: #2ecc71; color: #000; }
    .ping-box.fail { background: #e74c3c; color: #fff; }
    .ping-box.wait { background: #f39c12; color: #000; }
    label { font-size: 12px; color: #888; display: block; margin-top: 6px; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

---

## Arquivo: `monorepo/webtorrent/src/lib/identity.ts`

```ts
/**
 * Geração de identidade simulada e derivação de infoHash
 * para o swarm WebTorrent.
 *
 * infoHash = SHA-1(chave_pública) → 20 bytes = 40 chars hex
 * (formato padrão do protocolo BitTorrent)
 */

export interface Identity {
  publicKey: string;
  infoHash: string;
}

export async function generateIdentity(): Promise<Identity> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const publicKey = bytesToHex(bytes);
  const infoHash = await deriveInfoHash(publicKey);
  return { publicKey, infoHash };
}

export async function deriveInfoHash(publicKey: string): Promise<string> {
  const data = new TextEncoder().encode(publicKey);
  const hash = await crypto.subtle.digest("SHA-1", data);
  return bytesToHex(new Uint8Array(hash));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

---

## Arquivo: `monorepo/webtorrent/src/lib/metrics.ts`

```ts
/**
 * Coleta e cálculo de métricas de presença e latência.
 */

export interface MetricsData {
  swarmJoinMs: number | null;
  peerDetections: number[];
  peerLeaves: number[];
  pingRTTs: number[];
  reconnections: number;
  trackerErrors: number;
  uptimeStart: number | null;
}

export function createMetrics(): MetricsData {
  return {
    swarmJoinMs: null,
    peerDetections: [],
    peerLeaves: [],
    pingRTTs: [],
    reconnections: 0,
    trackerErrors: 0,
    uptimeStart: null,
  };
}

export function avg(arr: number[]): string {
  if (arr.length === 0) return "—";
  const v = arr.reduce((a, b) => a + b, 0) / arr.length;
  return `${Math.round(v)}ms`;
}

export function uptime(start: number | null): string {
  if (!start) return "—";
  const s = Math.floor((Date.now() - start) / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec}s`;
}
```

---

## Arquivo: `monorepo/webtorrent/src/lib/wt-client.ts`

```ts
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
```

---

## Arquivo: `monorepo/webtorrent/src/lib/ping.ts`

```ts
/**
 * Ping/Pong via conexão WebRTC subjacente ao WebTorrent.
 *
 * Estratégia de envio (tentativas em cascata):
 *   1. wire._pe.send()  → data channel do simple-peer (hacky mas funcional)
 *   2. wire.extended()  → protocolo de extensão BitTorrent
 *   3. Fallback: não suportado
 *
 * O pong inclui a chave pública do peer para validação de identidade.
 */

export interface PingMessage {
  type: "ping" | "pong";
  ts: number;
  from: string;
  origTs?: number;
}

export interface PingResult {
  rtt: number;
  from: string;
  valid: boolean;
  ts: number;
  method: string;
}

/**
 * Envia ping via wire do WebTorrent.
 * Retorna true se conseguiu enviar, false se não suportado.
 */
export function sendPingViaWire(
  wire: any,
  myPubKey: string,
): boolean {
  const msg: PingMessage = { type: "ping", ts: Date.now(), from: myPubKey };
  const json = JSON.stringify(msg);

  // Tentativa 1: simple-peer data channel (acesso direto ao WebRTC)
  try {
    if (wire?._pe?.send) {
      wire._pe.send(json);
      return true;
    }
  } catch {
    // Falha silenciosa, tenta próximo método
  }

  // Tentativa 2: extended protocol do BitTorrent
  try {
    if (typeof wire?.extended === "function") {
      const encoded = new TextEncoder().encode(json);
      wire.extended("loco_ping", encoded);
      return true;
    }
  } catch {
    // Falha silenciosa
  }

  return false;
}

/**
 * Tenta responder a um ping recebido.
 */
export function sendPongViaWire(
  wire: any,
  myPubKey: string,
  originalTs: number,
): void {
  const msg: PingMessage = {
    type: "pong",
    ts: Date.now(),
    from: myPubKey,
    origTs: originalTs,
  };
  const json = JSON.stringify(msg);

  try {
    if (wire?._pe?.send) {
      wire._pe.send(json);
      return;
    }
  } catch { /* ignore */ }

  try {
    if (typeof wire?.extended === "function") {
      wire.extended("loco_ping", new TextEncoder().encode(json));
    }
  } catch { /* ignore */ }
}

/**
 * Processa mensagem recebida via wire.
 * Retorna PingResult se for pong, null se for ping (já respondeu) ou inválida.
 */
export function processWireMessage(
  data: any,
  myPubKey: string,
  expectedPeerKey: string,
  wire: any,
): PingResult | null {
  try {
    let text: string;
    if (typeof data === "string") {
      text = data;
    } else if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
      text = new TextDecoder().decode(data);
    } else if (Buffer && typeof data === "object") {
      text = data.toString("utf-8");
    } else {
      return null;
    }

    const msg: PingMessage = JSON.parse(text);

    if (msg.type === "ping") {
      sendPongViaWire(wire, myPubKey, msg.ts);
      return null;
    }

    if (msg.type === "pong") {
      const rtt = Date.now() - (msg.origTs || 0);
      return {
        rtt,
        from: msg.from,
        valid: msg.from === expectedPeerKey,
        ts: Date.now(),
        method: "wire",
      };
    }
  } catch {
    // Não é JSON válido ou formato desconhecido
  }
  return null;
}
```

---

## Arquivo: `monorepo/webtorrent/src/main.ts`

```ts
/**
 * App principal do teste de presença WebTorrent.
 *
 * Usa Preact + Signals + htm (sem JSX, sem transpilação de JSX).
 * WebTorrent via window (CDN no index.html).
 */

import { h, render } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { signal } from "@preact/signals";
import htm from "htm";
import { generateIdentity, deriveInfoHash } from "./lib/identity.ts";
import type { Identity } from "./lib/identity.ts";
import { WTClient } from "./lib/wt-client.ts";
import type { PeerInfo } from "./lib/wt-client.ts";
import { sendPingViaWire, processWireMessage } from "./lib/ping.ts";
import type { PingResult } from "./lib/ping.ts";
import { createMetrics, avg, uptime } from "./lib/metrics.ts";
import type { MetricsData } from "./lib/metrics.ts";

const html = htm.bind(h);

/* ── Signals Globais ── */

const localId = signal<Identity | null>(null);
const swarmStatus = signal<"off" | "connecting" | "on">("off");
const peers = signal<PeerInfo[]>([]);
const logs = signal<string[]>([]);
const metrics = signal<MetricsData>(createMetrics());
const lastPing = signal<PingResult | null>(null);
const contactKey = signal("");
const monitoring = signal(false);

let wt: WTClient | null = null;

/* ── Helpers ── */

function log(msg: string, isError = false) {
  const t = new Date().toLocaleTimeString();
  const prefix = isError ? "❌" : "▸";
  logs.value = [`${prefix} [${t}] ${msg}`, ...logs.value.slice(0, 149)];
}

/* ── Inicialização ── */

async function init() {
  const id = await generateIdentity();
  localId.value = id;
  log(`Identidade gerada: ${id.publicKey.slice(0, 16)}…`);
  log(`InfoHash: ${id.infoHash}`);
}

function startSwarm() {
  if (!localId.value || wt) return;

  wt = new WTClient({
    onPeerJoined: (hash, peer) => {
      peers.value = wt?.getPeers(hash) || [];
      metrics.value = {
        ...metrics.value,
        peerDetections: [
          ...metrics.value.peerDetections,
          Date.now() - peer.joinedAt,
        ],
      };

      // Registra listener de mensagens no wire para ping/pong
      if (peer.wire?._pe) {
        peer.wire._pe.on("data", (data: any) => {
          const result = processWireMessage(
            data,
            localId.value!.publicKey,
            contactKey.value,
            peer.wire,
          );
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
    },
    onError: (msg) => {
      log(msg, true);
      metrics.value = {
        ...metrics.value,
        trackerErrors: metrics.value.trackerErrors + 1,
      };
    },
    onLog: (msg) => log(msg),
  });

  wt.joinSwarm(localId.value.infoHash);
  swarmStatus.value = "connecting";
}

function stopSwarm() {
  if (wt && localId.value) {
    wt.leaveSwarm(localId.value.infoHash);
    wt.destroy();
    wt = null;
  }
  swarmStatus.value = "off";
  peers.value = [];
}

async function monitorContact() {
  if (!wt || !contactKey.value || monitoring.value) return;
  const hash = await deriveInfoHash(contactKey.value);
  log(`Monitorando contato: hash=${hash.slice(0, 8)}…`);
  wt.joinSwarm(hash);
  monitoring.value = true;
}

function stopMonitoring() {
  if (!wt || !contactKey.value) return;
  deriveInfoHash(contactKey.value).then((hash) => {
    wt?.leaveSwarm(hash);
  });
  monitoring.value = false;
  peers.value = [];
}

function doPing(peer: PeerInfo) {
  if (!localId.value) return;
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
    // Timeout de 10s
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

async function regenerate() {
  stopSwarm();
  monitoring.value = false;
  lastPing.value = null;
  metrics.value = createMetrics();
  logs.value = [];
  await init();
}

/* ── Componente Raiz ── */

function App() {
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      init();
    }
    return () => { wt?.destroy(); };
  }, []);

  const statusDot = swarmStatus.value === "on"
    ? "on"
    : swarmStatus.value === "connecting"
    ? "wait"
    : "off";

  const statusLabel = swarmStatus.value === "on"
    ? "Conectado"
    : swarmStatus.value === "connecting"
    ? "Conectando…"
    : "Desconectado";

  return html`
    <h1>🧪 Loco — WebTorrent Presença</h1>

    <!-- IDENTIDADE -->
    <h2>1. Identidade Local</h2>
    <div class="card">
      ${localId.value
        ? html`
          <label>Chave Pública</label>
          <div class="mono">${localId.value.publicKey}</div>
          <label>InfoHash (swarm)</label>
          <div class="mono">${localId.value.infoHash}</div>
        `
        : html`<div class="mono">Gerando…</div>`
      }
      <div style="margin-top:8px">
        <button class="sec" onClick=${regenerate}>🔄 Nova Identidade</button>
        ${swarmStatus.value === "off"
          ? html`<button class="ok" onClick=${startSwarm}>▶ Entrar no Swarm</button>`
          : html`<button onClick=${stopSwarm}>⏹ Sair do Swarm</button>`
        }
      </div>
      <div style="margin-top:6px">
        <span class="dot ${statusDot}"></span>
        <span style="font-size:13px">${statusLabel}</span>
      </div>
    </div>

    <!-- CONTATO -->
    <h2>2. Monitorar Contato</h2>
    <div class="card">
      <label>Chave pública do contato (cole aqui)</label>
      <input
        type="text"
        placeholder="64 chars hex…"
        value=${contactKey.value}
        onInput=${(e: any) => { contactKey.value = e.target.value.trim(); }}
      />
      <div style="margin-top:6px">
        ${!monitoring.value
          ? html`<button class="ok" onClick=${monitorContact}
              disabled=${contactKey.value.length < 40 || swarmStatus.value === "off"}>
              👁 Monitorar
            </button>`
          : html`<button onClick=${stopMonitoring}>⏹ Parar</button>`
        }
      </div>
      ${monitoring.value
        ? html`<div style="margin-top:6px;font-size:12px;color:#f39c12">
            Monitorando swarm do contato…
          </div>`
        : null
      }
    </div>

    <!-- PEERS -->
    <h2>3. Peers Detectados</h2>
    <div class="card">
      ${peers.value.length === 0
        ? html`<div style="color:#666;font-size:13px">
            Nenhum peer detectado ainda.
          </div>`
        : peers.value.map((p) => html`
          <div class="peer-row">
            <div>
              <span class="dot ${p.status === "online" ? "on" : "off"}"></span>
              <span class="peer-id">${p.id.slice(0, 20)}…</span>
            </div>
            <div style="font-size:11px;color:#888">
              ${p.status === "online"
                ? `online há ${Math.round((Date.now() - p.joinedAt) / 1000)}s`
                : `offline (${p.leftAt ? Math.round((p.leftAt - p.joinedAt) / 1000) + "s" : "?"})`
              }
            </div>
            ${p.status === "online"
              ? html`<button class="sec" onClick=${() => doPing(p)}>🏓 Ping</button>`
              : null
            }
          </div>
        `)
      }
    </div>

    <!-- PING -->
    ${lastPing.value ? html`
      <h2>4. Último Ping</h2>
      <div class="card">
        <div class="ping-box ${lastPing.value.rtt >= 0 ? "ok" : "fail"}">
          ${lastPing.value.rtt >= 0
            ? html`RTT: ${lastPing.value.rtt}ms | De: ${lastPing.value.from.slice(0, 16)}… | Válido: ${lastPing.value.valid ? "✅" : "❌"}`
            : html`Falha: ${lastPing.value.method}`
          }
        </div>
      </div>
    ` : null}

    <!-- MÉTRICAS -->
    <h2>${lastPing.value ? "5" : "4"}. Métricas</h2>
    <div class="card">
      <div class="metric-row">
        <span class="l">Entrada no swarm</span>
        <span class="v">${metrics.value.swarmJoinMs !== null ? metrics.value.swarmJoinMs + "ms" : "—"}</span>
      </div>
      <div class="metric-row">
        <span class="l">Detecção de peer (avg)</span>
        <span class="v">${avg(metrics.value.peerDetections)}</span>
      </div>
      <div class="metric-row">
        <span class="l">Sessão de peer (avg)</span>
        <span class="v">${avg(metrics.value.peerLeaves)}</span>
      </div>
      <div class="metric-row">
        <span class="l">Ping RTT (avg)</span>
        <span class="v">${avg(metrics.value.pingRTTs)}</span>
      </div>
      <div class="metric-row">
        <span class="l">Uptime</span>
        <span class="v">${uptime(metrics.value.uptimeStart)}</span>
      </div>
      <div class="metric-row">
        <span class="l">Erros de tracker</span>
        <span class="v" style="color:${metrics.value.trackerErrors > 0 ? "#e74c3c" : "#2ecc71"}">
          ${metrics.value.trackerErrors}
        </span>
      </div>
    </div>

    <!-- LOGS -->
    <h2>${lastPing.value ? "6" : "5"}. Logs</h2>
    <div class="card">
      <div class="log-box">
        ${logs.value.map((l) => html`
          <div class="log-line">
            <span class="${l.startsWith("❌") ? "e" : "m"}">${l}</span>
          </div>
        `)}
        ${logs.value.length === 0 ? html`<div class="log-line">Aguardando eventos…</div>` : null}
      </div>
      <button class="sec" style="margin-top:6px" onClick=${() => { logs.value = []; }}>
        🗑 Limpar
      </button>
    </div>
  `;
}

/* ── Mount ── */

render(html`<${App} />`, document.getElementById("app")!);
```

---

## Arquivo: `monorepo/webtorrent/deno.jsonc`

```json
{
  "tasks": {
    "dev": "deno run --allow-all server.ts"
  },
  "imports": {
    "@deno/emit": "jsr:@deno/emit@0.46.0"
  }
}
```

---

## Arquivo: `monorepo/webtorrent/server.ts`

```ts
import { transpile } from "@deno/emit";

const PORT = 8000;
const ROOT = Deno.cwd();

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".ts": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-cache",
};

async function transpileTs(filePath: string): Promise<string> {
  const fileUrl = `file://${filePath}`;
  const result = await transpile(fileUrl, {
    compilerOptions: {
      target: "ESNext",
      module: "ESNext",
    },
  });
  return result.get(fileUrl) || "";
}

Deno.serve({ port: PORT }, async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = `${ROOT}/src${pathname}`;
  const ext = pathname.substring(pathname.lastIndexOf("."));

  try {
    if (ext === ".ts") {
      const js = await transpileTs(filePath);
      return new Response(js, {
        headers: { "Content-Type": MIME[".js"], ...CORS_HEADERS },
      });
    }

    const data = await Deno.readFile(filePath);
    return new Response(data, {
      headers: {
        "Content-Type": MIME[ext] || "application/octet-stream",
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    console.error(`404 ${pathname}`, err);
    return new Response("404 Not Found", { status: 404 });
  }
});

console.log(`\n🚀 Teste WebTorrent Presença`);
console.log(`   http://localhost:${PORT}\n`);
console.log(`   Abra em DUAS abas para testar presença.\n`);
```

---

## Arquivo: `monorepo/webtorrent/README.md`

````md
# Teste de Presença WebTorrent — Loco

## Objetivo

Validar se é viável usar **WebTorrent swarm** como mecanismo de detecção
de presença online em um PWA, com latência aceitável e funcionamento em mobile.

## Como Rodar

```bash
cd testes/webtorrent-presenca
deno task dev
````

---

