// monorepo/router/tests/websocket_real_test.ts
import { assertEquals, assertExists } from "@std/assert";
import { Router } from "../src/mod.ts";

// Helper: aguarda até que uma condição seja verdadeira ou timeout
function waitFor(
  condition: () => boolean,
  timeoutMs = 2000,
  intervalMs = 20,
): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (condition()) return resolve(true);
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(check, intervalMs);
    };
    check();
  });
}

// Helper: inicia servidor em porta aleatória disponível
async function startServer(app: Router): Promise<{ server: Deno.HttpServer; port: number }> {
  const controller = new AbortController();
  const server = Deno.serve(
    { port: 0, signal: controller.signal, onListen: () => {} },
    app.handleRequest.bind(app),
  );
  // Aguarda o servidor ficar pronto e descobre a porta
  const addr = server.addr;
  return { server, port: addr.port };
}

Deno.test("WebSocket real: conexão, broadcast e last broadcast para novo membro", async () => {
  const app = new Router("/api", null, null);
  const receivedByUser1: string[] = [];
  const receivedByUser2: string[] = [];

  app.ws("/chat/:room/:user", (ws, _req, params) => {
    const room = params.room as string;
    const user = params.user as string;
    const group = app.getWsGroupByPath("/chat/:room/:user");
    if (!group) {
      ws.close(1011, "No group");
      return;
    }

    ws.onmessage = (event) => {
      // Cada usuário faz broadcast filtrando pela própria sala
      group.broadcast(
        `[${user}]: ${event.data}`,
        (clientParams) => clientParams.room === room,
        params,
      );
    };
  });

  const { server, port } = await startServer(app);

  try {
    // Conecta user1
    const ws1 = new WebSocket(`ws://localhost:${port}/api/chat/roomA/user1`);
    await waitFor(() => ws1.readyState === WebSocket.OPEN);
    assertEquals(ws1.readyState, WebSocket.OPEN, "user1 deve conectar");
    ws1.onmessage = (e) => receivedByUser1.push(e.data);

    // Conecta user2 na mesma sala
    const ws2 = new WebSocket(`ws://localhost:${port}/api/chat/roomA/user2`);
    await waitFor(() => ws2.readyState === WebSocket.OPEN);
    assertEquals(ws2.readyState, WebSocket.OPEN, "user2 deve conectar");
    ws2.onmessage = (e) => receivedByUser2.push(e.data);

    // Aguarda ambos estabilizarem
    await new Promise((r) => setTimeout(r, 100));

    // user1 envia mensagem -> user2 deve receber
    ws1.send("hello from user1");
    await waitFor(() => receivedByUser2.length >= 1);
    assertEquals(receivedByUser2[0], "[user1]: hello from user1");
    // user1 também recebe (broadcast inclui o sender)
    assertEquals(receivedByUser1[0], "[user1]: hello from user1");

    // Agora conecta user3 -> deve receber o último broadcast automaticamente
    const receivedByUser3: string[] = [];
    const ws3 = new WebSocket(`ws://localhost:${port}/api/chat/roomA/user3`);
    
    // ✅ CORREÇÃO: Atribuir onmessage IMEDIATAMENTE para evitar condição de corrida
    // onde a mensagem chega antes do listener ser registrado.
    ws3.onmessage = (e) => receivedByUser3.push(e.data);
    
    await waitFor(() => ws3.readyState === WebSocket.OPEN);

    // Aguarda o último broadcast chegar ao user3
    const got = await waitFor(() => receivedByUser3.length >= 1, 2000);
    assertEquals(got, true, "user3 deve receber o último broadcast ao conectar");
    assertEquals(receivedByUser3[0], "[user1]: hello from user1");

    // user3 em sala diferente NÃO deve receber broadcast de roomA
    const receivedByUser4: string[] = [];
    const ws4 = new WebSocket(`ws://localhost:${port}/api/chat/roomB/user4`);
    
    ws4.onmessage = (e) => receivedByUser4.push(e.data);
    
    await waitFor(() => ws4.readyState === WebSocket.OPEN);
    await new Promise((r) => setTimeout(r, 200));
    assertEquals(receivedByUser4.length, 0, "user4 em roomB não deve receber broadcast de roomA");

    // Limpa
    ws1.close();
    ws2.close();
    ws3.close();
    ws4.close();
    await new Promise((r) => setTimeout(r, 100));
  } finally {
    app.closeAllWebSockets();
    await server.shutdown();
  }
});

Deno.test("WebSocket real: rota inexistente retorna 404", async () => {
  const app = new Router("/api", null, null);
  app.ws("/exists", () => {});

  const { server, port } = await startServer(app);

  try {
    const ws = new WebSocket(`ws://localhost:${port}/api/nope`);
    const errored = await waitFor(() => ws.readyState === WebSocket.CLOSED, 2000);
    assertEquals(errored, true, "WebSocket deve fechar ao tentar rota inexistente");
  } finally {
    await server.shutdown();
  }
});

Deno.test("WebSocket real: closeGroup fecha todos os sockets do grupo", async () => {
  const app = new Router("/api", null, null);
  app.ws("/chat/:room/:user", () => {});

  const { server, port } = await startServer(app);

  try {
    const ws1 = new WebSocket(`ws://localhost:${port}/api/chat/room1/user1`);
    const ws2 = new WebSocket(`ws://localhost:${port}/api/chat/room1/user2`);
    await waitFor(() => ws1.readyState === WebSocket.OPEN && ws2.readyState === WebSocket.OPEN);

    // Fecha o grupo
    const closed = app.closeGroupByPath("/chat/:room/:user");
    assertEquals(closed, true);

    // Ambos devem fechar
    await waitFor(() => ws1.readyState === WebSocket.CLOSED && ws2.readyState === WebSocket.CLOSED);
    assertEquals(ws1.readyState, WebSocket.CLOSED);
    assertEquals(ws2.readyState, WebSocket.CLOSED);
  } finally {
    app.closeAllWebSockets();
    await server.shutdown();
  }
});