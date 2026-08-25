A powerful, type-safe HTTP and WebSocket router for Deno with advanced features like intelligent broadcasting, path traversal protection, and seamless deployment support.

## ✨ Features

- 🚀 **URL Pattern API** - Native browser standard for route matching
- 🔒 **Path Traversal Protection** - Built-in security against directory traversal attacks
- 📡 **WebSocket Broadcasting** - Intelligent message filtering with dual-parameter permissions
- 🔄 **Last Broadcast** - New members automatically receive the last message
- 🌐 **HTTP/2 Ready** - Seamless deployment with Deno Deploy (automatic HTTPS)
- 🔐 **JWT Authentication** - Complete examples with WebSocket subprotocol
- 📦 **Static Files** - Serve from disk or embedded in executable
- 🎯 **Type-Safe** - Full TypeScript support with strict mode
- ⚡ **Zero Dependencies** - Only uses Deno standard library

## 📦 Installation

Add to your `deno.jsonc`:

```json
{
  "imports": {
    "@loco/router": "./src/mod.ts"
  }
}
```

Or import directly:

```typescript
import { Router } from "./src/mod.ts";
```

## 🚀 Quick Start

```typescript
import { Router } from "@loco/router";

const app = new Router("/api", "./public", null);

// HTTP routes
app.get("/users/:id", (req, params) => ({
  body: JSON.stringify({ id: params.id }),
  init: { headers: { "Content-Type": "application/json" } }
}));

// WebSocket with intelligent broadcasting
app.ws("/chat/:room/:user", (ws, req, params) => {
  const group = app.getWsGroupByPath("/chat/:room/:user");
  
  ws.onmessage = (event) => {
    group.broadcast(
      `[${params.user}]: ${event.data}`,
      (receiver, sender, msg) => receiver.room === sender.room,
      params
    );
  };
});

// Start server
Deno.serve({ port: 8000 }, app.handleRequest.bind(app));
```

## 📖 API Reference

### Constructor

```typescript
new Router(
  basePath?: string,           // Route prefix (e.g., "/api")
  staticDir?: string | null,   // Static files directory
  embeddedDir?: string | null, // Embedded files directory
  mimeTypeResolver?: (ext: string) => string | undefined
)
```

### HTTP Methods

All HTTP methods follow the same signature:

```typescript
app.get(path, handler)
app.post(path, handler)
app.put(path, handler)
app.delete(path, handler)
app.patch(path, handler)
app.options(path, handler)
app.head(path, handler)
```

**Handler signature:**

```typescript
type HttpHandler = (
  req: Request,
  params: RouteParams
) => {
  body: BodyInit;
  init?: ResponseInit;
} | Promise<{ body: BodyInit; init?: ResponseInit }>;
```

**Example:**

```typescript
app.post("/users", async (req, params) => {
  const data = await req.json();
  return {
    body: JSON.stringify({ created: true, data }),
    init: {
      status: 201,
      headers: { "Content-Type": "application/json" }
    }
  };
});
```

### WebSocket Routes

```typescript
app.ws(path, handler)
```

**Handler signature:**

```typescript
type WsHandler = (
  ws: WebSocket,
  req: Request,
  params: RouteParams
) => void;
```

**Example:**

```typescript
app.ws("/chat/:room/:user", (ws, req, params) => {
  console.log(`User ${params.user} joined room ${params.room}`);
  
  ws.onmessage = (event) => {
    ws.send(`Echo: ${event.data}`);
  };
  
  ws.onclose = () => {
    console.log("Connection closed");
  };
});
```

### Route Parameters

Parameters are extracted from the URL pattern:

```typescript
app.get("/users/:id/posts/:postId", (req, params) => {
  console.log(params.id);      // "123"
  console.log(params.postId);  // "456"
  return { body: "OK" };
});
```

**Catch-all routes:**

```typescript
app.get("/files/*", (req, params) => {
  console.log(params.catch);  // ["path", "to", "file.txt"]
  return { body: "OK" };
});
```

## 🔐 WebSocket Broadcasting

### Basic Broadcasting

```typescript
app.ws("/chat/:room/:user", (ws, req, params) => {
  const group = app.getWsGroupByPath("/chat/:room/:user");
  
  ws.onmessage = (event) => {
    // Broadcast to all members in the group
    group.broadcast(
      `[${params.user}]: ${event.data}`,
      undefined,  // No permission filter
      params      // Sender params
    );
  };
});
```

### Permission-Based Broadcasting

The `PermissionFn` receives **three parameters**:

```typescript
type PermissionFn = (
  receiverParams: RouteParams,  // Who will receive
  senderParams: RouteParams,    // Who sent the message
  message: string               // The message content
) => boolean;
```

**Example: Room-based filtering**

```typescript
group.broadcast(
  message,
  (receiver, sender, msg) => {
    // Only send to users in the same room
    return receiver.room === sender.room;
  },
  params
);
```

**Example: Role-based filtering**

```typescript
group.broadcast(
  message,
  (receiver, sender, msg) => {
    // Only admins can send to all rooms
    if (sender.role === "admin") return true;
    // Others can only send to their own room
    return receiver.room === sender.room;
  },
  params
);
```

**Example: Content filtering**

```typescript
group.broadcast(
  message,
  (receiver, sender, msg) => {
    // Block messages containing "spam"
    return !msg.includes("spam");
  },
  params
);
```

### Last Broadcast Feature

When a new member joins a WebSocket group, they automatically receive the last broadcast message (if they pass the permission check):

```typescript
// User A sends message at 10:00
// User B joins at 10:05
// User B automatically receives the message from 10:00
```

This is perfect for chat applications where new users need to see recent messages.

## 🔒 Security Features

### Path Traversal Protection

The router automatically protects against path traversal attacks:

```typescript
// These requests are blocked:
GET /../../etc/passwd          → 404
GET /..%2F..%2Fetc%2Fpasswd    → 404
GET /..\..\etc\passwd          → 404
```

### CORS Configuration

**Basic CORS (allow all origins):**

```typescript
app.options("/*", (req) => ({
  body: "",
  init: {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400"
    }
  }
}));
```

**Restricted CORS:**

```typescript
const allowedOrigins = ["https://example.com", "https://app.example.com"];

app.options("/*", (req) => {
  const origin = req.headers.get("origin") || "";
  const allowed = allowedOrigins.includes(origin);
  
  return {
    body: "",
    init: {
      status: allowed ? 204 : 403,
      headers: allowed ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      } : {}
    }
  };
});
```

## 🔐 JWT Authentication

### HTTP Authentication

```typescript
import { SignJWT, jwtVerify } from "jsr:@luca/jose";

const JWT_SECRET = "your-secret-key";

// Login endpoint
app.post("/login", async (req) => {
  const { username, password } = await req.json();
  
  // Validate credentials...
  
  const token = await new SignJWT({ username, role: "user" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(JWT_SECRET));
  
  return {
    body: JSON.stringify({ token }),
    init: { headers: { "Content-Type": "application/json" } }
  };
});

// Protected endpoint
app.get("/protected", async (req) => {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  
  if (!token) {
    return { body: "Unauthorized", init: { status: 401 } };
  }
  
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET)
    );
    
    return {
      body: JSON.stringify({ user: payload.username }),
      init: { headers: { "Content-Type": "application/json" } }
    };
  } catch {
    return { body: "Invalid token", init: { status: 401 } };
  }
});
```

### WebSocket Authentication (Subprotocol)

```typescript
app.ws("/chat/:room/:user", async (ws, req, params) => {
  // Extract token from Sec-WebSocket-Protocol header
  const protocol = req.headers.get("sec-websocket-protocol") || "";
  const [_, token] = protocol.split(",").map(s => s.trim());
  
  if (!token) {
    ws.close(4001, "Authentication required");
    return;
  }
  
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET)
    );
    
    console.log(`Authenticated: ${payload.username}`);
    
    ws.onmessage = (event) => {
      ws.send(`Echo: ${event.data}`);
    };
  } catch {
    ws.close(4002, "Invalid token");
  }
});
```

**Client-side:**

```javascript
const token = "your-jwt-token";
const ws = new WebSocket(
  "ws://localhost:8000/api/chat/room1/user1",
  ["Bearer", token]  // Subprotocol
);
```

## 🌐 HTTPS and HTTP/2

### Local Development

For local HTTPS, generate certificates and configure:

```typescript
const cert = await Deno.readTextFile("./localhost.pem");
const key = await Deno.readTextFile("./localhost-key.pem");

Deno.serve({
  port: 8443,
  cert,
  key
}, app.handleRequest.bind(app));
```

### Deno Deploy (Automatic HTTPS)

When deploying to Deno Deploy, HTTPS and HTTP/2 are automatic:

```bash
deployctl deploy --project=my-app example/main.ts
```

Your app will be available at `https://my-app.deno.dev` with automatic SSL certificates.

### Force HTTPS Redirect

```typescript
const app = new Router("/api", "./public", null);

// Enable HTTPS redirect (ignored for localhost)
app.forceHttps = true;

// Or use environment variable
app.forceHttps = Deno.env.get("FORCE_HTTPS") === "true";
```

## 📦 Static Files

### Serving from Directory

```typescript
const app = new Router("/api", "./public", null);
```

Files in `./public` are automatically served:
- `GET /api/index.html` → `./public/index.html`
- `GET /api/css/style.css` → `./public/css/style.css`

### Embedded Files

For executables, embed files at compile time:

```typescript
const app = new Router("/api", null, import.meta.dirname);
```

Compile with:

```bash
deno compile --include=./public/**/* main.ts
```

### MIME Type Resolution

The router automatically resolves MIME types:

```typescript
// Custom MIME resolver
const app = new Router("/api", "./public", null, (ext) => {
  const types = {
    "html": "text/html",
    "css": "text/css",
    "js": "application/javascript",
    "json": "application/json"
  };
  return types[ext];
});
```

## 🧪 Testing

Run the test suite:

```bash
deno task tests
```

Individual test files:

```bash
deno test --allow-net --allow-read tests/router_http_test.ts
deno test --allow-net --allow-read tests/websocket_real_test.ts
```

## 🚢 Deployment

### Deno Deploy

```bash
# Install deployctl
deno install -A jsr:@deno/deployctl

# Deploy
deployctl deploy --project=my-app example/main.ts
```

### Docker

```dockerfile
FROM denoland/deno:latest
WORKDIR /app
COPY . .
RUN deno cache example/main.ts
CMD ["run", "--allow-net", "--allow-read", "example/main.ts"]
```

### Standalone Executable

```bash
deno compile \
  --allow-net \
  --allow-read \
  --include=./public/**/* \
  --output=my-app \
  example/main.ts
```

## 📝 Examples

See the `example/` directory for complete examples:

- `example/main.ts` - Basic HTTP and WebSocket routes
- `example/jwt/` - JWT authentication with WebSocket
- `example/public/` - Static HTML files for testing

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please open an issue or pull request.

## 🔗 Links

- [Deno Documentation](https://deno.land/)
- [URL Pattern API](https://developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [Deno Deploy](https://deno.com/deploy)
