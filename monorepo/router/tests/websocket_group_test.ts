// monorepo/router/tests/websocket_group_test.ts
import { assertEquals } from "@std/assert";
import { WebSocketGroup, type RouteParams } from "../src/mod.ts";

// Mock simples de WebSocket para testes
class MockWebSocket {
  readyState: number = 1; // WebSocket.OPEN
  sent: string[] = [];

  send(data: string | ArrayBuffer | Blob) {
    if (typeof data === "string") {
      this.sent.push(data);
    }
  }

  close(code?: number, reason?: string) {
    this.readyState = 3; // WebSocket.CLOSED
  }
}

Deno.test("broadcast envia para todos os sockets", () => {
  const group = new WebSocketGroup();
  const ws1 = new MockWebSocket();
  const ws2 = new MockWebSocket();

  group.addSocket(ws1 as unknown as WebSocket, { room: "A" });
  group.addSocket(ws2 as unknown as WebSocket, { room: "A" });

  group.broadcast("hello");

  assertEquals(ws1.sent, ["hello"]);
  assertEquals(ws2.sent, ["hello"]);
});

Deno.test("broadcast com permissionFn filtra destinatários", () => {
  const group = new WebSocketGroup();
  const ws1 = new MockWebSocket();
  const ws2 = new MockWebSocket();

  group.addSocket(ws1 as unknown as WebSocket, { room: "A" });
  group.addSocket(ws2 as unknown as WebSocket, { room: "B" });

  group.broadcast("only-A", (p) => p.room === "A");

  assertEquals(ws1.sent, ["only-A"]);
  assertEquals(ws2.sent, []);
});

Deno.test("novo membro recebe último broadcast ao entrar", async () => {
  const group = new WebSocketGroup();
  const ws1 = new MockWebSocket();
  
  group.addSocket(ws1 as unknown as WebSocket, { room: "A" });
  group.broadcast("first-msg", undefined, { room: "A" });

  // Novo membro entra
  const ws2 = new MockWebSocket();
  group.addSocket(ws2 as unknown as WebSocket, { room: "A" });
  group.sendLastBroadcastTo(ws2 as unknown as WebSocket, { room: "A" });

  // ✅ CORREÇÃO: Aguarda o delay do setTimeout interno (50ms) + margem de segurança
  await new Promise((resolve) => setTimeout(resolve, 100));

  assertEquals(ws2.sent, ["first-msg"]);
});

// ✅ NOVO TESTE: Garante que a correção de permissão funcione para salas diferentes
Deno.test("novo membro em sala diferente NÃO recebe último broadcast", async () => {
  const group = new WebSocketGroup();
  const ws1 = new MockWebSocket();
  
  group.addSocket(ws1 as unknown as WebSocket, { room: "A" });
  group.broadcast("first-msg", (p) => p.room === "A", { room: "A" });

  // Novo membro em sala B entra
  const ws2 = new MockWebSocket();
  group.addSocket(ws2 as unknown as WebSocket, { room: "B" });
  group.sendLastBroadcastTo(ws2 as unknown as WebSocket, { room: "B" });

  // Aguarda o delay do setTimeout interno (50ms) + margem de segurança
  await new Promise((resolve) => setTimeout(resolve, 100));

  assertEquals(ws2.sent, []);
});

Deno.test("closeGroup fecha todos os sockets", () => {
  const group = new WebSocketGroup();
  const ws1 = new MockWebSocket();
  const ws2 = new MockWebSocket();

  group.addSocket(ws1 as unknown as WebSocket, {});
  group.addSocket(ws2 as unknown as WebSocket, {});

  group.closeGroup();

  assertEquals(ws1.readyState, 3);
  assertEquals(ws2.readyState, 3);
  assertEquals(group.size, 0);
});