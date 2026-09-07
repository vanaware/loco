/**
 * sw.ts — Service Worker para streaming P2P.
 *
 * Intercepts /webtorrent/<infoHash>/<fileIndex>/<fileName> e repassa
 * para a página via MessageChannel.  Implementa o protocolo pull-based
 * usado por `webtorrent.min.js`:
 *
 *   1. SW recebe fetch, cria MessageChannel (port1 fica no SW, port2 vai pra página)
 *   2. SW envia `webtorrent-request` com port2 para a página
 *   3. Página responde com `port2.postMessage(responseMetadata)` no MESMO port2
 *   4. SW abre Response(body=ReadableStream) onde o body pede chunks via
 *      `port1.postMessage(true)` e recebe `Uint8Array` (ou null) de volta
 */
/// <reference lib="dom" />
const SW_SCOPE = "/";

declare const self: ServiceWorkerGlobalScope;

// ─── Estado ──────────────────────────────────────────────────────────

const requestQueue: Array<{ resolve: (r: Response) => void; url: URL }> = [];
let pagePort: MessagePort | null = null;

// ─── Registro ─────────────────────────────────────────────────────────

self.addEventListener("install", () => { self.skipWaiting(); });

self.addEventListener("activate", (e: ExtendableEvent) => {
  e.waitUntil(self.clients.claim());
});

// ─── Conexão com a página ────────────────────────────────────────────

self.addEventListener("message", (e: ExtendableMessageEvent) => {
  const { data } = e;
  if (data?.type === "PORT") {
    pagePort = e.ports[0]!;
    processQueue();
  }
});

// ─── Fetch handler ───────────────────────────────────────────────────

self.addEventListener("fetch", (e: FetchEvent) => {
  const url = new URL(e.request.url);
  if (!url.pathname.startsWith("/webtorrent/")) return;
  if (!pagePort) {
    e.respondWith(
      new Promise<Response>((resolve) => {
        requestQueue.push({ resolve, url });
      }),
    );
    return;
  }
  e.respondWith(handleStream(e.request, url));
});

async function processQueue() {
  while (requestQueue.length > 0) {
    const item = requestQueue[0]!;
    const url = item.url;
    const fakeReq = new Request(url.toString());
    const resp = await handleStream(fakeReq, url);
    item.resolve(resp);
    requestQueue.shift();
  }
}

function handleStream(req: Request, url: URL): Promise<Response> {
  return new Promise<Response>((resolve) => {
    const { port1, port2 } = new MessageChannel();
    const dest = guessDestination(url.pathname);

    pagePort!.postMessage(
      {
        type: "webtorrent-request",
        url: url.pathname + url.search,
        method: req.method,
        headers: Object.fromEntries(req.headers.entries()),
        scope: SW_SCOPE,
        destination: dest,
      },
      [port2],
    );

    // The first message on port1 is the response metadata.
    // Subsequent messages are Uint8Array chunks (or null to end).
    let metadata: any = null;
    let pendingChunkResolver: ((chunk: Uint8Array | null) => void) | null = null;
    let pendingPullResolver: (() => void) | null = null;
    let closed = false;
    let bodyStreamController: ReadableStreamDefaultController<Uint8Array> | null = null;

    const onPortMessage = (ev: MessageEvent) => {
      const data = ev.data;

      // First message: response metadata
      if (metadata === null) {
        metadata = data;
        if (closed) return;

        if (metadata.body !== "STREAM") {
          // Non-streaming response
          port1.close();
          resolve(new Response(String(metadata.body ?? ""), {
            status: metadata.status ?? 200,
            headers: new Headers(metadata.headers ?? {}),
          }));
          return;
        }

        // Streaming response: build body stream and resolve outer promise
        const headers = new Headers(metadata.headers ?? {});
        const bodyStream = new ReadableStream<Uint8Array>({
          start(controller) {
            bodyStreamController = controller;
            // Request the first chunk immediately
            port1.postMessage(true);
          },
          pull() {
            // The ReadableStream asks for more data — we already have the
            // pull-signal protocol in place via onPortMessage.  Nothing
            // to do here; chunks are enqueued as they arrive.
            if (pendingPullResolver) {
              const r = pendingPullResolver;
              pendingPullResolver = null;
              r();
            }
          },
          cancel() {
            closed = true;
            port1.postMessage(false);
            port1.close();
          },
        });

        resolve(new Response(bodyStream, {
          status: metadata.status ?? 200,
          headers,
        }));
        return;
      }

      // Subsequent messages: chunks (Uint8Array) or end (null)
      if (data === null || data === false) {
        closed = true;
        if (bodyStreamController) {
          try { bodyStreamController.close(); } catch { /* already closed */ }
        }
        port1.close();
        return;
      }

      if (data instanceof Uint8Array) {
        if (bodyStreamController) {
          bodyStreamController.enqueue(data);
        }
        // Request the next chunk
        port1.postMessage(true);
        return;
      }
    };

    port1.onmessage = onPortMessage;
    port1.start?.();
  });
}

function guessDestination(pathname: string): string {
  if (/\.(mp4|webm|mkv|avi|mov)$/i.test(pathname)) return "video";
  if (/\.(mp3|m4a|ogg|wav)$/i.test(pathname)) return "audio";
  if (/\.(jpe?g|png|gif|webp)$/i.test(pathname)) return "image";
  return "document";
}