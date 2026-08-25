// monorepo/router/tests/websocket_group_test.ts
import { assertEquals } from "@std/assert";
import { WebSocketGroup, type RouteParams } from "../src/mod.ts";

class MockWebSocket {
  readyState: number = 1;
  sent: string[] = [];

  send(data: string | ArrayBuffer | Blob) {
    if (typeof data === "string") {
      this.sent.push(data);
    }
  }

  close(code?: number, reason?: string) {
    this.readyState = 3;
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

Deno.test("broadcast com permissionFn filtra por receiver", () => {
  const group = new WebSocketGroup();
  const ws1 = new MockWebSocket();
  const ws2 = new MockWebSocket();

  group.addSocket(ws1 as unknown as WebSocket, { room: "A" });
  group.addSocket(ws2 as unknown as WebSocket, { room: "B" });

  // ✅ DUAL PARAMS: Filtra por receiverParams
  group.broadcast(
    "only-A",
    (receiver, _sender, _msg) => receiver.room === "A",
    { room: "A" }
  );

  assertEquals(ws1.sent, ["only-A"]);
  assertEquals(ws2.sent, []);
});

Deno.test("broadcast com permissionFn filtra por sender", () => {
  const group = new WebSocketGroup();
  const ws1 = new MockWebSocket();
  const ws2 = new MockWebSocket();

  group.addSocket(ws1 as unknown as WebSocket, { room: "A" });
  group.addSocket(ws2 as unknown as WebSocket, { room: "A" });

  // ✅ DUAL PARAMS: Filtra por senderParams
  group.broadcast(
    "admin-only",
    (_receiver, sender, _msg) => sender.role === "admin",
    { room: "A", role: "admin" }
  );

  assertEquals(ws1.sent, ["admin-only"]);
  assertEquals(ws2.sent, ["admin-only"]);
});

Deno.test("broadcast com permissionFn filtra por ambos", () => {
  const group = new WebSocketGroup();
  const ws1 = new MockWebSocket();
  const ws2 = new MockWebSocket();
  const ws3 = new MockWebSocket();

  group.addSocket(ws1 as unknown as WebSocket, { room: "A", user: "alice" });
  group.addSocket(ws2 as unknown as WebSocket, { room: "A", user: "bob" });
  group.addSocket(ws3 as unknown as WebSocket, { room: "B", user: "charlie" });

  // ✅ DUAL PARAMS: Filtra por receiver E sender
  group.broadcast(
    "message",
    (receiver, sender, _msg) => {
      return receiver.room === sender.room && receiver.user !== sender.user;
    },
    { room: "A", user: "alice" }
  );

  assertEquals(ws1.sent, []); // alice não recebe (é o sender)
  assertEquals(ws2.sent, ["message"]); // bob recebe (mesma sala, usuário diferente)
  assertEquals(ws3.sent, []); // charlie não recebe (sala diferente)
});

Deno.test("broadcast com permissionFn filtra por mensagem", () => {
  const group = new WebSocketGroup();
  const ws1 = new MockWebSocket();

  group.addSocket(ws1 as unknown as WebSocket, { room: "A" });

  // ✅ DUAL PARAMS: Filtra por conteúdo da mensagem
  group.broadcast(
    "spam message",
    (_receiver, _sender, msg) => !msg.includes("spam"),
    { room: "A" }
  );

  assertEquals(ws1.sent, []); // não recebe porque contém "spam"
});

Deno.test("novo membro recebe último broadcast ao entrar", async () => {
  const group = new WebSocketGroup();
  const ws1 = new MockWebSocket();
  
  group.addSocket(ws1 as unknown as WebSocket, { room: "A" });
  group.broadcast("first-msg", undefined, { room: "A" });

  const ws2 = new MockWebSocket();
  group.addSocket(ws2 as unknown as WebSocket, { room: "A" });
  group.sendLastBroadcastTo(ws2 as unknown as WebSocket, { room: "A" });

  await new Promise((resolve) => setTimeout(resolve, 100));

  assertEquals(ws2.sent, ["first-msg"]);
});

Deno