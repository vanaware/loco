// src/sw/webtorrent.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

const PORT_TIMEOUT_DURATION = 5000;

// 🔥 ESTADO DE RESILIÊNCIA: Só tentamos stream se o main thread confirmou que o WebTorrent está ativo
let isWebTorrentReady = false;

interface WebTorrentRequestMessage {
  url: string;
  method: string;
  headers: Record<string, string>;
  scope: string;
  destination: RequestDestination;
  type: "webtorrent";
}

interface WebTorrentResponseData {
  body: "STREAM" | ArrayBuffer | string | null;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
}

/**
 * Lida com mensagens vindas do Main Thread.
 * Usado para o Main Thread avisar que o WebTorrent foi inicializado e está escutando.
 */
export function handleWebTorrentMessage(event: ExtendableMessageEvent) {
  if (event.data && event.data.type === "WEBTORRENT_READY") {
    console.log(
      "[SW-WEBTORRENT] ✅ Main thread solicitou ativação. Verificando estado...",
    );
    isWebTorrentReady = true;

    // 🔥 Responde usando a MessageChannel transferida (Padrão Loco)
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ type: "WEBTORRENT_ACK" });
      console.log(
        "[SW-WEBTORRENT] 📤 WEBTORRENT_ACK enviado via MessageChannel dedicada.",
      );
    } else {
      // Fallback de segurança caso a chamada venha de um código legado sem MessageChannel
      if (event.source) {
        (event.source as Client).postMessage({ type: "WEBTORRENT_ACK" });
      }
    }
  }
}

/**
 * Tenta interceptar e responder a requisições do WebTorrent.
 * @returns true se a requisição foi tratada (respondWith foi chamado), false caso contrário.
 */
export function handleWebTorrentFetch(event: FetchEvent): boolean {
  const { url } = event.request;
  const scope = self.registration.scope;

  // 1. Ignora requisições que não são do webtorrent
  if (!url.includes(`${scope}webtorrent/`)) {
    return false;
  }

  // 2. Keepalive para manter o SW ativo sem consumir recursos
  if (url.includes(`${scope}webtorrent/keepalive/`)) {
    event.respondWith(new Response());
    return true;
  }

  // 3. Cancelamento de stream (ex: usuário pulou o vídeo)
  if (url.includes(`${scope}webtorrent/cancel/`)) {
    event.respondWith(
      new Response(
        new ReadableStream({
          cancel() {
            // Lógica de cancelamento
          },
        }),
      ),
    );
    return true;
  }

  // 🔥 RESILIÊNCIA: Se o Main Thread não inicializou o WebTorrent, não tentamos stream.
  // Retornamos false para que o orquestrador principal faça o fetch normal (ou cache).
  if (!isWebTorrentReady) {
    console.warn(
      "[SW-WEBTORRENT] ⚠️ Requisição webtorrent recebida, mas o Main Thread não está pronto. Fallback para fetch normal.",
    );
    return false;
  }

  // 4. Serve o arquivo via MessageChannel com o Main Thread
  event.respondWith(serve(event));
  return true;
}

/**
 * Lógica principal de streaming: comunica-se com o main thread para buscar chunks sob demanda.
 */
async function serve(event: FetchEvent): Promise<Response> {
  const { request } = event;
  const { url, method, headers, destination } = request;

  const clientList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  const [data, port]: [WebTorrentResponseData, MessagePort] = await new Promise(
    (resolve) => {
      for (const client of clientList) {
        const messageChannel = new MessageChannel();
        const { port1, port2 } = messageChannel;

        port1.onmessage = ({ data }: MessageEvent<WebTorrentResponseData>) => {
          resolve([data, port1]);
        };

        const message: WebTorrentRequestMessage = {
          url,
          method,
          headers: Object.fromEntries(headers.entries()),
          scope: self.registration.scope,
          destination,
          type: "webtorrent",
        };

        client.postMessage(message, [port2]);
      }

      // Fallback de segurança caso nenhum cliente responda
      setTimeout(() => {
        resolve([{ body: null, status: 503 }, null as unknown as MessagePort]);
      }, 5000);
    },
  );

  let timeOut: number | null = null;
  let isCancelled = false;

  const cleanup = () => {
    if (port) {
      port.postMessage(false);
      port.onmessage = null;
    }
    if (timeOut !== null) {
      clearTimeout(timeOut);
    }
    isCancelled = true;
  };

  if (data.body !== "STREAM") {
    cleanup();
    return new Response(data.body as BodyInit, {
      status: data.status,
      statusText: data.statusText,
      headers: data.headers,
    });
  }

  return new Response(
    new ReadableStream({
      pull(controller) {
        return new Promise((resolve) => {
          if (isCancelled || !port) {
            controller.close();
            resolve();
            return;
          }

          port.onmessage = ({ data }: MessageEvent<Uint8Array | null>) => {
            if (data) {
              controller.enqueue(data);
            } else {
              cleanup();
              controller.close();
            }
            resolve();
          };

          if (destination !== "document") {
            clearTimeout(timeOut!);
            timeOut = self.setTimeout(() => {
              cleanup();
              resolve();
            }, PORT_TIMEOUT_DURATION);
          }

          port.postMessage(true);
        });
      },
      cancel() {
        cleanup();
      },
    }),
    {
      status: data.status,
      statusText: data.statusText,
      headers: data.headers,
    },
  );
}
