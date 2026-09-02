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