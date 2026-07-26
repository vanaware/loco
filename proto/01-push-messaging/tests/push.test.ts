/// <reference lib="deno.ns" />

import { assertEquals } from "@std/assert";

function b64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function generateSubscriptionKeys() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const authBuffer = crypto.getRandomValues(new Uint8Array(16));
  return {
    p256dh: b64url(publicKeyRaw),
    auth: b64url(authBuffer.buffer),
  };
}

Deno.test("servidor envia push para subscription v\u00e1lida", async () => {
  const protoUrl = "http://localhost:8080";
  const mockPort = 9000;

  let receivedUrl = "";
  let receivedContentType = "";

  const mockServer = Deno.serve({ port: mockPort }, async (req: Request) => {
    if (req.method === "POST") {
      receivedUrl = req.url;
      receivedContentType = req.headers.get("content-type") ?? "";
      await req.text();
      return new Response(null, { status: 201 });
    }
    return new Response("ok");
  });

  try {
    const { p256dh, auth } = await generateSubscriptionKeys();
    const endpoint = `http://localhost:${mockPort}/push/alice`;

    const registerRes = await fetch(`${protoUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "alice",
        subscription: { endpoint, keys: { p256dh, auth } },
      }),
    });
    assertEquals(registerRes.status, 200);

    const sendRes = await fetch(`${protoUrl}/send/alice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "oi do bob", fromId: "bob" }),
    });
    assertEquals(sendRes.status, 200);

    // Aguarda o mock processar a requisição push.
    await new Promise((resolve) => setTimeout(resolve, 500));

    assertEquals(receivedUrl, endpoint);
    assertEquals(receivedContentType.includes("application/octet-stream"), true);
  } finally {
    await mockServer.shutdown();
  }
});
