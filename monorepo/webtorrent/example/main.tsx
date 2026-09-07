/**
 * main.tsx — Entry point do demo.
 *
 * Implementa o protocolo webtorrent.io via Service Worker:
 *
 *   SW intercepta /webtorrent/... → cria MessageChannel → envia para cá
 *   → buscamos o arquivo no streamManager → pump de chunks via porta
 *
 * Protocolo (compatível com sw.min.js):
 *
 *   1. SW envia `webtorrent-request` com port2
 *   2. Página responde: `port2.postMessage(responseMetadata)`
 *   3. SW abre Response(body=ReadableStream)
 *   4. SW pede chunks: `port1.postMessage(true)`
 *   5. Página responde com chunks: `port1.postMessage(Uint8Array)` ou `null`
 */
import { render } from "preact";
import { App } from "./app.tsx";
import { TorrentProvider } from "./torrent-context.tsx";
import { streamManager, parseStreamURL, type WebTorrentServer } from "@loco/webtorrent";

function waitForActivation(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve) => {
    if (worker.state === "activated") {
      resolve();
      return;
    }
    const onChange = () => {
      if (worker.state === "activated") {
        worker.removeEventListener("statechange", onChange);
        resolve();
      }
    };
    worker.addEventListener("statechange", onChange);
  });
}

async function establishSWConnection() {
  if (!("serviceWorker" in navigator)) return;

  const reg = await navigator.serviceWorker.ready;
  const sw = reg.active;
  if (!sw) return;

  const { port1, port2 } = new MessageChannel();

  // Porta que fica no SW para streaming
  sw.postMessage({ type: "PORT" }, [port1]);

  // Porta que fica na página (recebe requests do SW)
  port2.onmessage = async (e: MessageEvent) => {
    const msg = e.data;
    if (msg?.type !== "webtorrent-request") return;

    const { url, method, headers, scope, destination } = msg;
    // Porta transferida do SW para streaming (port1 no SW = recebe chunks)
    const streamPort: MessagePort = e.ports[0]!;

    console.log("[main] SW request:", method, url);

    try {
      // Parse URL → (infoHash, fileIndex)
      const parsed = parseStreamURL(url, scope || "/");
      if (!parsed) {
        streamPort.postMessage({ status: 404, body: "Not Found" });
        streamPort.postMessage(null);
        streamPort.close();
        return;
      }

      // Lookup file via streamManager
      const entry = streamManager.get(parsed.infoHash, parsed.fileIndex);
      if (!entry) {
        streamPort.postMessage({ status: 404, body: "File not registered" });
        streamPort.postMessage(null);
        streamPort.close();
        return;
      }

      const file = entry.file;

      // Parse Range header
      const range = parseRange(headers["range"], file.length);
      const status = range ? 206 : 200;
      const statusText = range ? "Partial Content" : "OK";
      const contentType = guessContentType(file.name);

      const respHeaders: Record<string, string> = {
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      };

      if (range) {
        respHeaders["Content-Range"] = `bytes ${range.start}-${range.end}/${file.length}`;
        respHeaders["Content-Length"] = String(range.end - range.start + 1);
      } else {
        respHeaders["Content-Length"] = String(file.length);
      }

      // ── Instalar handler ANTES de enviar response metadata ──────────────
      // (seguindo o padrão do webtorrent.min.js original)
      let closed = false;
      const cleanup = () => {
        closed = true;
        streamPort.close();
      };

      streamPort.onmessage = async (ev: MessageEvent) => {
        if (closed) return;
        const data = ev.data;

        if (data === null || data === false) {
          cleanup();
          return;
        }

        // data === true → SW está pedindo o próximo chunk
        if (data === true) {
          const chunk = await readNextChunk(file, range?.start ?? 0, range?.end ?? (file.length - 1));
          if (closed) return;

          if (chunk.byteLength === 0) {
            streamPort.postMessage(null);
            cleanup();
            return;
          }

          streamPort.postMessage(chunk);
        }
      };

      streamPort.start?.();

      // ── Enviar metadata da resposta PRIMEIRO ───────────────────────────
      // (seguindo o padrão do webtorrent.min.js)
      streamPort.postMessage({
        status,
        statusText,
        headers: respHeaders,
        body: "STREAM",
      });

      console.log("[main] Response sent, body=STREAM");
    } catch (err) {
      console.error("[main] Error:", err);
      streamPort.postMessage({ status: 500, body: String(err) });
      streamPort.postMessage(null);
      streamPort.close();
    }
  };
}

async function readNextChunk(
  file: any,
  start: number,
  end: number,
): Promise<Uint8Array> {
  // Usa createReadStream com range
  const stream = file.createReadStream({ start, end });
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done || !value) break;
    totalSize += value.byteLength;
    chunks.push(value);
    // Reset to avoid unlimited growth — only keep first chunk for now
    if (chunks.length > 1) {
      // Concatenate
      const combined = new Uint8Array(totalSize);
      let offset = 0;
      for (const c of chunks) {
        combined.set(c, offset);
        offset += c.byteLength;
      }
      return combined;
    }
  }

  return chunks[0] ?? new Uint8Array(0);
}

function parseRange(
  header: string | undefined,
  fileLength: number,
): { start: number; end: number } | null {
  if (!header) return null;
  const match = header.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) return null;
  const start = Number(match[1]);
  const endStr = match[2];
  const end = endStr ? Number(endStr) : fileLength - 1;
  if (!Number.isFinite(start) || start < 0 || start >= fileLength) return null;
  if (!Number.isFinite(end) || end < start || end >= fileLength) return null;
  return { start, end };
}

function guessContentType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    mp4: "video/mp4",
    webm: "video/webm",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    wav: "audio/wav",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
  };
  return types[ext ?? ""] ?? "application/octet-stream";
}

async function bootstrap() {
  if (!navigator.storage?.getDirectory) {
    console.warn("[main] OPFS não disponível");
  }

  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      console.log("[main] SW Registered:", reg.scope);

      // Wait for the SW to be active. On a fresh page load, reg.active is
      // null until install + activate complete. Use serviceWorker.ready
      // (which resolves when there's an active worker) instead of checking
      // reg.active at registration time.
      const activeWorker = reg.active ?? reg.installing ?? reg.waiting;
      if (activeWorker) {
        if (activeWorker.state === "activated") {
          await establishSWConnection();
          console.log("[main] SW MessageChannel established");
        } else {
          await waitForActivation(activeWorker);
          await establishSWConnection();
          console.log("[main] SW MessageChannel established (after activation)");
        }
      } else {
        // Last-resort: register again so updatefound fires
        const reg2 = await navigator.serviceWorker.ready;
        const w = reg2.active;
        if (w) {
          await establishSWConnection();
          console.log("[main] SW MessageChannel established (via ready)");
        }
      }
    } catch (e) {
      console.error("[main] SW Registration failed:", e);
    }
  }

  render(
    <TorrentProvider>
      <App />
    </TorrentProvider>,
    document.getElementById("app")!,
  );
}

bootstrap().catch(console.error);
