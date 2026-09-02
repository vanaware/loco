> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém experimentos e código da área de WEBTORRENT.
> O projeto é o **Loco ** estruturado em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco - Modo: WEBTORRENT

Gerado automaticamente em: 9/2/2026, 1:16:58 AM

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
  // Usa globalThis.crypto para garantir compatibilidade em todos os ambientes de browser
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj) {
    throw new Error("API Crypto não disponível neste navegador.");
  }

  const bytes = new Uint8Array(32);
  cryptoObj.getRandomValues(bytes);
  const publicKey = bytesToHex(bytes);
  
  const infoHash = await deriveInfoHash(publicKey);
  return { publicKey, infoHash };
}

export async function deriveInfoHash(publicKey: string): Promise<string> {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.subtle) {
    throw new Error("Crypto.subtle não disponível. Verifique se está usando HTTPS ou localhost.");
  }

  const data = new TextEncoder().encode(publicKey);
  const hash = await cryptoObj.subtle.digest("SHA-1", data);
  return bytesToHex(new Uint8Array(hash));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

---

## Arquivo: `monorepo/webtorrent/src/lib/webtorrent.ts`

```ts
/**
 * Wrapper do WebTorrent para discovery de presença.
 * Importado diretamente via esm.sh, o esbuild cuidará dos polyfills do Node.js.
 */
import WebTorrent from "webtorrent";

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

    try {
      this.client = new WebTorrent({
        tracker: {
          announce: [
            "wss://tracker.openwebtorrent.com",
            "wss://tracker.btorrent.xyz",
            "wss://tracker.webtorrent.dev",
          ],
        },
      });

      this.client.on("error", (err: any) => {
        cb.onError(`WT client: ${err.message || err}`);
      });

      cb.onLog("WebTorrent client criado com sucesso via esbuild polyfills");
    } catch (err: any) {
      cb.onError(`Falha ao criar WebTorrent client: ${err.message}`);
      throw err;
    }
  }

  joinSwarm(infoHash: string): void {
    if (this.torrents.has(infoHash)) {
      this.cb.onLog(`Já no swarm ${infoHash.slice(0, 8)}…`);
      return;
    }

    this.joinTimes.set(infoHash, Date.now());
    this.peers.set(infoHash, new Map());
    this.cb.onLog(`Entrando no swarm ${infoHash.slice(0, 8)}…`);

    try {
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
```

---

## Arquivo: `monorepo/webtorrent/src/App.tsx`

```tsx
// Arquivo: monorepo/webtorrent/src/App.tsx
import { useEffect } from "preact/hooks";
import {
  localId,
  swarmStatus,
  peers,
  logs,
  contactKey,
  monitoring,
  swStatus,
  init,
  registerSW,
  startSwarm,
  stopSwarm,
  monitorContact,
  stopMonitoring,
  regenerate,
} from "./store.ts";

export function App() {
  useEffect(() => {
    init();
    registerSW();
  }, []);

  const statusIcon = swarmStatus.value === "on"
    ? "check_circle"
    : swarmStatus.value === "connecting"
    ? "hourglass_empty"
    : "cancel";

  const swReady = swStatus.value === "activated";

  return (
    <main className="responsive">
      <nav className="left l">
        <h5 className="max padding">🧪 WebTorrent</h5>
        <a className="active">
          <i>science</i>
          <div>Teste de Presença</div>
        </a>
      </nav>
      <nav className="bottom s">
        <a className="active">
          <i>science</i>
          <div>Teste</div>
        </a>
      </nav>
      <article className="surface-container-low padding max">
        <header>
          <h3 className="bold">Teste de Presença WebTorrent</h3>
          <p className="text-secondary">
            Validação de mecanismo P2P para detecção de presença online
          </p>
        </header>

        {/* Status do Service Worker */}
        <section className="padding">
          <h5>1. Infraestrutura (Service Worker)</h5>
          <div className={`chip margin-top ${swReady ? "success" : "warning"}`}>
            <i>{swReady ? "check_circle" : "hourglass_empty"}</i>
            <span>SW Status: {swStatus.value}</span>
          </div>
          {!swReady && (
            <p className="small-text text-secondary margin-top">
              O Service Worker é obrigatório para o servidor interno do WebTorrent interceptar requisições e gerenciar os streams P2P.
            </p>
          )}
        </section>

        {/* Identidade Local */}
        <section className="padding">
          <h5>2. Identidade Local</h5>
          {localId.value ? (
            <>
              <div className="field prefix round border">
                <i>fingerprint</i>
                <div className="max">
                  <label>Chave Pública</label>
                  <pre className="small-text">{localId.value.publicKey}</pre>
                </div>
              </div>
              <div className="field prefix round border">
                <i>tag</i>
                <div className="max">
                  <label>InfoHash (Swarm)</label>
                  <pre className="small-text">{localId.value.infoHash}</pre>
                </div>
              </div>
            </>
          ) : (
            <progress className="circle large" />
          )}
          <nav className="row margin-top">
            <button className="button border round" onClick={regenerate}>
              <i>refresh</i>
              <span>Nova Identidade</span>
            </button>
            {swarmStatus.value === "off" ? (
              <button className="button fill round" onClick={startSwarm} disabled={!swReady}>
                <i>play_arrow</i>
                <span>Entrar no Swarm</span>
              </button>
            ) : (
              <button className="button border round" onClick={stopSwarm}>
                <i>stop</i>
                <span>Sair do Swarm</span>
              </button>
            )}
          </nav>
          <div className="chip margin-top">
            <i className={swarmStatus.value === "on" ? "success" : swarmStatus.value === "connecting" ? "warning" : "error"}>
              {statusIcon}
            </i>
            <span>
              {swarmStatus.value === "on"
                ? "Conectado"
                : swarmStatus.value === "connecting"
                ? "Conectando..."
                : "Desconectado"}
            </span>
          </div>
        </section>

        {/* Monitorar Contato */}
        <section className="padding">
          <h5>3. Monitorar Contato</h5>
          <div className="field prefix round fill">
            <i>person_search</i>
            <input
              type="text"
              placeholder="Cole a chave pública do contato aqui..."
              value={contactKey.value}
              onInput={(e) => {
                contactKey.value = (e.target as HTMLInputElement).value.trim();
              }}
            />
          </div>
          <nav className="row margin-top">
            {!monitoring.value ? (
              <button
                className="button fill round"
                onClick={monitorContact}
                disabled={contactKey.value.length < 40 || swarmStatus.value === "off" || !swReady}
              >
                <i>visibility</i>
                <span>Monitorar</span>
              </button>
            ) : (
              <button className="button border round" onClick={stopMonitoring}>
                <i>visibility_off</i>
                <span>Parar</span>
              </button>
            )}
          </nav>
        </section>

        {/* Peers Detectados */}
        <section className="padding">
          <h5>4. Peers Detectados ({peers.value.length})</h5>
          {peers.value.length === 0 ? (
            <p className="text-secondary">Nenhum peer detectado ainda.</p>
          ) : (
            <ul className="list">
              {peers.value.map((peer) => (
                <li key={peer.id} className="row middle-align padding">
                  <i className={peer.status === "online" ? "success" : "error"}>
                    {peer.status === "online" ? "circle" : "cancel"}
                  </i>
                  <div className="max margin-left">
                    <div className="bold">{peer.id.slice(0, 20)}...</div>
                    <div className="small-text text-secondary">
                      {peer.status === "online"
                        ? `Online há ${Math.round((Date.now() - peer.joinedAt) / 1000)}s`
                        : `Offline`}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Logs */}
        <section className="padding">
          <h5>5. Logs</h5>
          <div className="card surface-container-high padding">
            <div className="scroll" style={{ maxHeight: "300px" }}>
              {logs.value.length === 0 ? (
                <p className="text-secondary">Aguardando eventos...</p>
              ) : (
                <pre className="small-text">
                  {logs.value.map((log, i) => (
                    <div key={i} className={log.startsWith("❌") ? "error" : ""}>
                      {log}
                    </div>
                  ))}
                </pre>
              )}
            </div>
            <button
              className="button border round margin-top"
              onClick={() => { logs.value = []; }}
            >
              <i>delete</i>
              <span>Limpar</span>
            </button>
          </div>
        </section>
      </article>
    </main>
  );
}
```

---

## Arquivo: `monorepo/webtorrent/src/main.tsx`

```tsx
// Arquivo: monorepo/webtorrent/src/main.tsx
import { render } from "preact";
import { App } from "./App.tsx";

const rootElement = document.getElementById("app");
if (rootElement) {
  render(<App />, rootElement);
  console.log("🚀 WebTorrent Test: Interface montada com sucesso.");
} else {
  console.error("❌ Elemento '#app' não encontrado.");
}
```

---

## Arquivo: `monorepo/webtorrent/src/index.html`

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Loco — Teste WebTorrent Presença</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🧪</text></svg>">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/beercss@5.0.3/dist/cdn/beer.min.css">
  <script type="module" src="https://cdn.jsdelivr.net/npm/beercss@5.0.3/dist/cdn/beer.min.js"></script>
  <script type="module" src="https://cdn.jsdelivr.net/npm/material-dynamic-colors@1.1.4/dist/cdn/material-dynamic-colors.min.js"></script>
  <script type="module" src="https://cdn.jsdelivr.net/npm/material-dynamic-fonts@0.0.3/dist/cdn/material-dynamic-fonts.min.js?font=Material Symbols Outlined&selector=i"></script>
</head>
<body class="dark">
  <div id="app"></div>
  <script type="module" src="/main.js"></script>
</body>
</html>
```

---

## Arquivo: `monorepo/webtorrent/src/worker-server.ts`

```ts
// Arquivo: monorepo/webtorrent/src/sw/worker-server.ts
const portTimeoutDuration = 5000;
let cancellable = false;

export interface WorkerServerEvent {
  request: Request;
}

const listener = (event: FetchEvent) => {
  const { url } = event.request;
  if (!url.includes(self.registration.scope + 'webtorrent/')) return null;
  if (url.includes(self.registration.scope + 'webtorrent/keepalive/')) return new Response();
  if (url.includes(self.registration.scope + 'webtorrent/cancel/')) {
    return new Response(new ReadableStream({
      cancel() {
        cancellable = true;
      }
    }));
  }
  return serve(event);
};

export default listener;

async function serve({ request }: FetchEvent) {
  const { url, method, headers, destination } = request;
  const clientlist = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  
  const [data, port] = await new Promise<[any, MessagePort]>((resolve) => {
    for (const client of clientlist) {
      const messageChannel = new MessageChannel();
      const { port1, port2 } = messageChannel;
      port1.onmessage = ({ data }) => {
        resolve([data, port1]);
      };
      client.postMessage({
        url,
        method,
        headers: Object.fromEntries(headers.entries()),
        scope: self.registration.scope,
        destination,
        type: 'webtorrent'
      }, [port2]);
    }
  });

  let timeOut: number | null = null;
  const cleanup = () => {
    port.postMessage(false);
    if (timeOut) clearTimeout(timeOut);
    port.onmessage = null;
  };

  if (data.body !== 'STREAM') {
    cleanup();
    return new Response(data.body, data);
  }

  return new Response(new ReadableStream({
    pull(controller) {
      return new Promise<void>((resolve) => {
        port.onmessage = ({ data }) => {
          if (data) {
            controller.enqueue(data);
          } else {
            cleanup();
            controller.close();
          }
          resolve();
        };
        if (!cancellable) {
          if (timeOut) clearTimeout(timeOut);
          if (destination !== 'document') {
            timeOut = setTimeout(() => {
              cleanup();
              resolve();
            }, portTimeoutDuration) as unknown as number;
          }
        }
        port.postMessage(true);
      });
    },
    cancel() {
      cleanup();
    }
  }), data);
}
```

---

## Arquivo: `monorepo/webtorrent/src/worker.ts`

```ts
// Arquivo: monorepo/webtorrent/src/sw/worker.ts
/// <reference lib="webworker" />
import fileResponse from './worker-server.ts';

declare const self: ServiceWorkerGlobalScope;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('fetch', (event: FetchEvent) => {
  const res = fileResponse(event);
  if (res) event.respondWith(res);
});

self.addEventListener('activate', () => {
  self.clients.claim();
});
```

---

## Arquivo: `monorepo/webtorrent/src/sw example/sw-server.ts`

```ts
// Adaptação do worker-server.js do WebTorrent para TypeScript.
// Gerencia as requisições HTTP interceptadas pelo SW e as roteia para os torrents.

interface FetchEvent {
  request: Request;
  respondWith: (response: Response | Promise<Response>) => void;
}

// Mapa de servidores ativos (infoHash -> MessagePort)
const servers = new Map<string, MessagePort>();

// O client.createServer() na main thread envia uma mensagem para registrar o server no SW
self.addEventListener("message", (event) => {
  if (event.data?.type === "webtorrent-server-register") {
    const { infoHash, port } = event.data;
    servers.set(infoHash, port);
  }
});

export function fileResponse(event: FetchEvent): Response | Promise<Response> | null {
  const url = new URL(event.request.url);
  
  // O WebTorrent serve arquivos em /webtorrent/<infoHash>/<filepath>
  if (!url.pathname.startsWith("/webtorrent/")) {
    return null;
  }

  // Extrai o infoHash do path
  const parts = url.pathname.split("/");
  const infoHash = parts[2]; // /webtorrent/<infoHash>/...
  
  const port = servers.get(infoHash);
  if (!port) {
    return new Response("Torrent não encontrado ou server não registrado", { status: 404 });
  }

  // Cria um canal para receber o stream da main thread
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (e) => {
      if (e.data?.type === "webtorrent-response") {
        resolve(new Response(e.data.body, {
          status: e.data.status,
          headers: e.data.headers,
        }));
      }
    };

    // Envia a requisição para a main thread processar
    port.postMessage(
      {
        type: "webtorrent-request",
        url: url.toString(),
        method: event.request.method,
        headers: Object.fromEntries(event.request.headers.entries()),
      },
      [channel.port2]
    );
  });
}
```

---

## Arquivo: `monorepo/webtorrent/src/sw example/sw.ts`

```ts
import { fileResponse } from "./sw-server.ts";

declare const self: ServiceWorkerGlobalScope;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  // Delega a resposta para o módulo sw-server
  const res = fileResponse(event);
  if (res) event.respondWith(res);
});

self.addEventListener("activate", () => {
  self.clients.claim();
});
```

---

## Arquivo: `monorepo/webtorrent/src/store.ts`

```ts
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

## Arquivo: `monorepo/webtorrent/server.ts`

```ts
// Arquivo: monorepo/webtorrent/server.ts
import { serveDir } from "@std/http/file-server";
const PORT = 8000;
console.log(`\n🌐 Servidor WebTorrent Test rodando.`);
console.log(`   Acesse: http://localhost:${PORT}/index.html\n`);
console.log(`   Abra em DUAS abas para testar a presença P2P.\n`);
Deno.serve({ port: PORT }, async (req: Request) => {
  const response = await serveDir(req, {
    fsRoot: "./build/dist",
    showDirListing: true,
  });
  response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  // Headers necessários para Service Worker e SharedArrayBuffer (se necessário)
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  return response;
});
```

---

## Arquivo: `monorepo/webtorrent/deno.jsonc`

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "lib": ["dom", "dom.iterable", "dom.asynciterable", "deno.ns", "deno.unstable"],
    "strict": true
  },
  "imports": {
    "preact": "https://esm.sh/preact@10.29.7",
    "preact/": "https://esm.sh/preact@10.29.7/",
    "preact/jsx-runtime": "https://esm.sh/preact@10.29.7/jsx-runtime",
    "@preact/signals": "https://esm.sh/@preact/signals@1.3.1?deps=preact@10.29.7",
    "@std/fs": "jsr:@std/fs",
    "@std/path": "jsr:@std/path",
    "@std/http": "jsr:@std/http",
    "esbuild": "npm:esbuild@0.24.0",
    "@deno/esbuild-plugin": "jsr:@deno/esbuild-plugin@1.2.1",
    "webtorrent": "npm:webtorrent@3.0.21"
  },
  "tasks": {
    "build": "deno run -A esbuild.ts",
    "serve": "deno run -A server.ts",
    "dev": "deno task build && deno task serve"
  }
}
```

---

