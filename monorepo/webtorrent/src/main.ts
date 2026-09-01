/**
 * App principal do teste de presença WebTorrent.
 * Usa Preact + Signals + htm (sem JSX, sem transpilação de JSX).
 * WebTorrent via window (CDN no index.html).
 */
import { h, render } from "https://esm.sh/preact@10.25.4";
import { useEffect, useRef } from "https://esm.sh/preact@10.25.4/hooks";
import { signal } from "https://esm.sh/@preact/signals@2.0.1";
import htm from "https://esm.sh/htm@3.1.1";
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
const initError = signal<string | null>(null);

let wt: WTClient | null = null;

/* ── Helpers ── */
function log(msg: string, isError = false) {
  const t = new Date().toLocaleTimeString();
  const prefix = isError ? "❌" : "▸";
  logs.value = [`${prefix} [${t}] ${msg}`, ...logs.value.slice(0, 149)];
}

/* ── Inicialização ── */
async function init() {
  try {
    log("Iniciando geração de identidade...");
    const id = await generateIdentity();
    localId.value = id;
    initError.value = null;
    log(`Identidade gerada: ${id.publicKey.slice(0, 16)}…`);
    log(`InfoHash: ${id.infoHash}`);
  } catch (err: any) {
    const msg = err?.message || String(err);
    initError.value = msg;
    log(`FALHA CRÍTICA na identidade: ${msg}`, true);
    console.error("Falha ao gerar identidade:", err);
  }
}

function startSwarm() {
  if (!localId.value || wt) return;

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
            metrics.value = { ...metrics.value, pingRTTs: [...metrics.value.pingRTTs, result.rtt] };
            log(`PONG de ${result.from.slice(0, 12)}… RTT=${result.rtt}ms válido=${result.valid}`);
          }
        });
      }
    },
    onPeerLeft: (hash, _peerId, sessionMs) => {
      peers.value = wt?.getPeers(hash) || [];
      metrics.value = { ...metrics.value, peerLeaves: [...metrics.value.peerLeaves, sessionMs] };
    },
    onSwarmReady: (_hash, ms) => {
      swarmStatus.value = "on";
      metrics.value = { ...metrics.value, swarmJoinMs: ms, uptimeStart: Date.now() };
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
  try {
    const hash = await deriveInfoHash(contactKey.value);
    log(`Monitorando contato: hash=${hash.slice(0, 8)}…`);
    wt.joinSwarm(hash);
    monitoring.value = true;
  } catch (err: any) {
    log(`Erro ao derivar hash do contato: ${err.message}`, true);
  }
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
    lastPing.value = { rtt: -1, from: peer.id, valid: false, ts: Date.now(), method: "não suportado" };
    log("Ping falhou: método de envio não disponível", true);
  } else {
    setTimeout(() => {
      if (!lastPing.value) {
        lastPing.value = { rtt: -1, from: peer.id, valid: false, ts: Date.now(), method: "timeout" };
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

  const statusDot = swarmStatus.value === "on" ? "on" : swarmStatus.value === "connecting" ? "wait" : "off";
  const statusLabel = swarmStatus.value === "on" ? "Conectado" : swarmStatus.value === "connecting" ? "Conectando…" : "Desconectado";

  return html`
    <h1>🧪 Loco — WebTorrent Presença</h1>

    <!-- IDENTIDADE -->
    <h2>1. Identidade Local</h2>
    <div class="card">
      ${initError.value
        ? html`<div class="mono" style="color:#e74c3c">ERRO: ${initError.value}</div>`
        : localId.value
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
        ${swarmStatus.value === "off" && !initError.value
          ? html`<button class="ok" onClick=${startSwarm} disabled=${!localId.value}>▶ Entrar no Swarm</button>`
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
          ? html`<button class="ok" onClick=${monitorContact} disabled=${contactKey.value.length < 40 || swarmStatus.value === "off"}>👁 Monitorar</button>`
          : html`<button onClick=${stopMonitoring}>⏹ Parar</button>`
        }
      </div>
      ${monitoring.value ? html`<div style="margin-top:6px;font-size:12px;color:#f39c12">Monitorando swarm do contato…</div>` : null}
    </div>

    <!-- PEERS -->
    <h2>3. Peers Detectados</h2>
    <div class="card">
      ${peers.value.length === 0
        ? html`<div style="color:#666;font-size:13px">Nenhum peer detectado ainda.</div>`
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
            ${p.status === "online" ? html`<button class="sec" onClick=${() => doPing(p)}>🏓 Ping</button>` : null}
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
      <div class="metric-row"><span class="l">Entrada no swarm</span><span class="v">${metrics.value.swarmJoinMs !== null ? metrics.value.swarmJoinMs + "ms" : "—"}</span></div>
      <div class="metric-row"><span class="l">Detecção de peer (avg)</span><span class="v">${avg(metrics.value.peerDetections)}</span></div>
      <div class="metric-row"><span class="l">Sessão de peer (avg)</span><span class="v">${avg(metrics.value.peerLeaves)}</span></div>
      <div class="metric-row"><span class="l">Ping RTT (avg)</span><span class="v">${avg(metrics.value.pingRTTs)}</span></div>
      <div class="metric-row"><span class="l">Uptime</span><span class="v">${uptime(metrics.value.uptimeStart)}</span></div>
      <div class="metric-row"><span class="l">Erros de tracker</span><span class="v" style="color:${metrics.value.trackerErrors > 0 ? "#e74c3c" : "#2ecc71"}">${metrics.value.trackerErrors}</span></div>
    </div>

    <!-- LOGS -->
    <h2>${lastPing.value ? "6" : "5"}. Logs</h2>
    <div class="card">
      <div class="log-box">
        ${logs.value.map((l) => html`<div class="log-line"><span class="${l.startsWith("❌") ? "e" : "m"}">${l}</span></div>`)}
        ${logs.value.length === 0 ? html`<div class="log-line">Aguardando eventos…</div>` : null}
      </div>
      <button class="sec" style="margin-top:6px" onClick=${() => { logs.value = []; }}>🗑 Limpar</button>
    </div>
  `;
}

/* ── Mount ── */
render(html`<${App} />`, document.getElementById("app")!);