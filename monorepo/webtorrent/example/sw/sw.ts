/**
 * sw.ts — Service Worker para streaming P2P.
 *
 * Este SW intercepta requisições a URLs no formato:
 *   /webtorrent/<infoHash>/<fileIndex>/<fileName>
 *
 * e as repassa para a página principal via MessageChannel.
 * A página principal cria o ReadableStream real via InProcessTransport
 * e responde através do SW.
 *
 * Fluxo:
 *   Browser → SW (fetch /webtorrent/...)
 *         ↓
 *   SW postMessage → Página principal
 *         ↓
 *   Página devolve Response via port.postMessage
 *         ↓
 *   SW consumidor ReadableStream → Browser
 */
const SW_SCOPE = "/";

declare const self: ServiceWorkerGlobalScope;

// ─── Mensagens SW ↔ Página ────────────────────────────────────────────────────

interface StreamRequest {
  type: "webtorrent-request";
  requestId: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  scope: string;
  destination: string;
}

interface StreamResponse {
  type: "webtorrent-response";
  requestId: number;
  status: number;
  headers: Record<string, string>;
  body?: ReadableStream | null;
}

const pendingRequests = new Map<number, {
  resolve: (r: StreamResponse) => void;
  port: MessagePort;
}>();

let pagePort: MessagePort | null = null;
let requestId = 0;

// ─── Registro ─────────────────────────────────────────────────────────────────

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

// ─── Conexão com a página ────────────────────────────────────────────────────

self.addEventListener("message", (e) => {
  const { data } = e;
  if (data?.type === "PORT") {
    // Página enviou a porta de comunicação
    pagePort = e.ports[0]!;
    pagePort.onmessage = (ev) => {
      const res: StreamResponse = ev.data;
      const pending = pendingRequests.get(res.requestId);
      if (pending) {
        pendingRequests.delete(res.requestId);
        pending.resolve(res);
        // Encaminha o stream de body para o cliente original
        pending.port.postMessage({ type: "stream-response", ...res });
      }
    };
    console.log("[SW] Página conectada via MessageChannel");
    return;
  }

  if (data?.type === "webtorrent-response") {
    const pending = pendingRequests.get(data.requestId);
    if (pending) {
      pendingRequests.delete(data.requestId);
      pending.resolve(data);
    }
  }
});

// ─── Fetch handler ───────────────────────────────────────────────────────────

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Só intercepta requisições de streaming
  if (!url.pathname.startsWith("/webtorrent/")) return;

  e.respondWith(handleStream(e.request, url));
});

async function handleStream(req: Request, url: URL): Promise<Response> {
  if (!pagePort) {
    // Aguarda a página se conectar
    await waitForPagePort();
  }

  const rid = ++requestId;
  const scope = SW_SCOPE;
  const dest = url.pathname.endsWith(".mp4") || url.pathname.endsWith(".webm")
    ? "video"
    : url.pathname.endsWith(".mp3") || url.pathname.endsWith(".m4a")
    ? "audio"
    : "video";

  const streamReq: StreamRequest = {
    type: "webtorrent-request",
    requestId: rid,
    url: url.pathname + url.search,
    method: req.method,
    headers: Object.fromEntries(req.headers.entries()),
    scope,
    destination: dest,
  };

  // Cria MessageChannel para o stream de body
  const { port1, port2 } = new MessageChannel();

  const response = await new Promise<StreamResponse>((resolve) => {
    pendingRequests.set(rid, { resolve, port: port1 });
    pagePort!.postMessage(streamReq);
  });

  if (response.status >= 400) {
    return new Response(response.status.toString(), { status: response.status });
  }

  // Constrói Headers
  const headers = new Headers();
  for (const [k, v] of Object.entries(response.headers ?? {})) {
    headers.set(k, v);
  }

  // Body é enviado via MessageChannel — criamos um ReadableStream proxy
  const bodyStream = new ReadableStream({
    start(controller) {
      port1.onmessage = (ev) => {
        if (ev.data?.type === "stream-chunk") {
          controller.enqueue(new Uint8Array(ev.data.chunk));
        } else if (ev.data?.type === "stream-end") {
          controller.close();
          port1.close();
        } else if (ev.data?.type === "stream-error") {
          controller.error(new Error(ev.data.error));
          port1.close();
        }
      };
    },
    cancel() {
      port1.close();
    },
  });

  return new Response(bodyStream, {
    status: response.status,
    headers,
  });
}

function waitForPagePort(): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (pagePort) {
        resolve();
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });
}
