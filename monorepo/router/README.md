# Deno Router Library

Uma biblioteca de roteamento moderna e flexível para Deno, construída sobre a **URL Pattern API** nativa. Suporta rotas HTTP, WebSockets com sistema de grupos e broadcast inteligente, arquivos estáticos (locais e embarcados em executáveis), e parâmetros dinâmicos com catch-all.

## 🚀 Características

- ✅ **URL Pattern API nativa** - Padrão web moderno para matching de rotas
- ✅ **HTTP completo** - Métodos `.get()`, `.post()`, `.put()`, `.delete()`
- ✅ **WebSockets** - Rota dedicada com `.ws()` e sistema de grupos
- ✅ **Broadcast inteligente** - Com função de permissão por cliente
- ✅ **Histórico de broadcast** - Novos membros recebem a última mensagem automaticamente
- ✅ **Arquivos estáticos** - Servidos de pasta local ou embarcados no executável
- ✅ **Catch-all flexível** - Parâmetro `catch` como array para múltiplos wildcards
- ✅ **Base path configurável** - Para deploy em subpastas (ex: `/servidor/`)
- ✅ **MIME types automáticos** - Resolução inteligente por extensão
- ✅ **Graceful shutdown** - Fechamento limpo de WebSockets em sinais SIGINT/SIGTERM

---

## 📦 Instalação

### Via GitHub (recomendado)

```typescript
import { Router } from "https://raw.githubusercontent.com/vanaware/loco/main/monorepo/router/mod.ts";
```

### Cópia local

```typescript
import { Router } from "./mod.ts";
```

---

## 🏗️ Construtor do Router

```typescript
new Router(basePath, staticDir, embeddedDir, mimeTypeResolver)
```

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|--------|-----------|
| `basePath` | `string` | `''` | Prefixo aplicado a todas as rotas (ex: `/api`) |
| `staticDir` | `string \| null` | `'public'` | Pasta de arquivos estáticos. `null` desabilita |
| `embeddedDir` | `string \| null` | `null` | Prefixo para arquivos embarcados no executável |
| `mimeTypeResolver` | `function` | interna | Função `(ext: string) => string \| undefined` |

### Exemplo básico

```typescript
const app = new Router('/api', './public', null);
```

### Exemplo com arquivos embarcados

```typescript
// Para executáveis compilados com: deno compile --include=public/* main.ts
const app = new Router('/api', './public', import.meta.dirname);
```

---

## 🌐 Rotas HTTP

### Métodos disponíveis

```typescript
app.get(path, handler)
app.post(path, handler)
app.put(path, handler)
app.delete(path, handler)
```

### Assinatura do handler

```typescript
(req: Request, params: Record<string, string | string[]>) => {
  body: BodyInit;
  init?: ResponseInit;
}
```

### Exemplos

#### Rota simples

```typescript
app.get('/hello', (req, params) => {
  return {
    body: 'Hello, World!',
    init: { headers: { 'Content-Type': 'text/plain' } }
  };
});
```

#### Rota com parâmetros

```typescript
app.get('/users/:id/posts/:postId', (req, params) => {
  return {
    body: JSON.stringify({
      userId: params.id,
      postId: params.postId
    }),
    init: { headers: { 'Content-Type': 'application/json' } }
  };
});
// GET /users/42/posts/7 → { userId: "42", postId: "7" }
```

#### Rota POST com body

```typescript
app.post('/users', async (req, params) => {
  const data = await req.json();
  return {
    body: JSON.stringify({ created: data }),
    init: { status: 201, headers: { 'Content-Type': 'application/json' } }
  };
});
```

---

## 🎯 Catch-all e Parâmetro `catch`

A biblioteca usa a **URL Pattern API** nativa. Quando você usa `*` (wildcard), o valor capturado é armazenado no parâmetro `catch` como **array**.

### Regras de matching

| Padrão | URL | `params` |
|--------|-----|----------|
| `/files/*` | `/files/docs/readme.md` | `{ catch: ["docs/readme.md"] }` |
| `/a/*/b/*/c` | `/a/x/b/y/z/c` | `{ catch: ["x", "y/z"] }` |
| `/api/:id/*` | `/api/42/foo/bar` | `{ id: "42", catch: ["foo/bar"] }` |

### Exemplo

```typescript
app.get('/files/*', (req, params) => {
  const path = (params.catch as string[])[0];
  return {
    body: `Arquivo solicitado: ${path}`,
    init: { status: 200 }
  };
});
```

> **Nota:** O `*` captura tudo até o próximo delimitador fixo ou fim da URL.

---

## 📂 Arquivos Estáticos

### Pasta local (`staticDir`)

Quando uma rota HTTP não é encontrada, o router tenta servir arquivos da pasta `staticDir`.

**Comportamentos:**

1. **Arquivo exato encontrado** → servido com MIME type correto
2. **Pasta sem `/` final** → busca `index.html` ou `index.htm`
3. **Pasta com `/` final** → busca `index.html` ou `index.htm`
4. **Arquivo sem extensão** → tenta `.html` e `.htm` automaticamente
5. **Nada encontrado** → retorna 404

### Arquivos embarcados (`embeddedDir`)

Quando você compila com `deno compile --include=...`, os arquivos ficam disponíveis via `import.meta.dirname`.

**Prioridade:**
1. Primeiro tenta o arquivo embarcado (`embeddedDir`)
2. Se não encontrado, tenta a pasta local (`staticDir`)

### Exemplo de compilação

```bash
deno compile --include=public/* --allow-net --allow-read main.ts
```

### Desabilitar estáticos

```typescript
const app = new Router('/api', null, null); // Nenhum arquivo estático
```

---

## 🔌 WebSockets

### Rota WebSocket

```typescript
app.ws(path, handler)
```

### Assinatura do handler

```typescript
(ws: WebSocket, req: Request, params: Record<string, string | string[]>) => void
```

### Exemplo básico

```typescript
app.ws('/chat/:room/:user', (ws, req, params) => {
  console.log(`Conectado: ${params.user} na sala ${params.room}`);

  ws.onmessage = (event) => {
    console.log(`Mensagem de ${params.user}: ${event.data}`);
    ws.send(`Echo: ${event.data}`);
  };

  ws.onclose = () => {
    console.log(`${params.user} desconectou`);
  };

  ws.onerror = (event) => {
    console.error('Erro:', event);
  };
});
```

---

## 👥 Grupos de WebSocket

Cada rota `.ws()` cria automaticamente um **grupo** que gerencia todos os clientes conectados àquela rota.

### Obtendo um grupo

```typescript
const group = app.getWsGroupByPath('/api/chat/:room/:user');
```

### Métodos do grupo

#### `broadcast(message, permissionFn?)`

Envia mensagem para todos os membros do grupo.

```typescript
group.broadcast('Olá a todos!', (clientParams, message) => {
  // Retorna true para enviar, false para pular
  return clientParams.room === 'geral';
});
```

#### `closeGroup()`

Fecha todas as conexões do grupo.

```typescript
group.closeGroup();
```

### Exemplo completo com broadcast

```typescript
app.ws('/chat/:room/:user', (ws, req, params) => {
  const group = app.getWsGroupByPath('/api/chat/:room/:user');
  if (!group) return;

  ws.onmessage = (event) => {
    // Broadcast para todos na mesma sala
    group.broadcast(
      `${params.user}: ${event.data}`,
      (clientParams, msg) => clientParams.room === params.room
    );
  };
});
```

---

## 📜 Histórico de Broadcast (Last Broadcast)

**Funcionalidade especial:** O último broadcast de cada grupo é armazenado. Quando um **novo membro se conecta**, ele recebe automaticamente a última mensagem broadcastada (se atender aos critérios de permissão).

### O que é armazenado

- A mensagem enviada
- A função de permissão usada
- Os parâmetros do contexto original

### Exemplo prático

```typescript
// Cliente A envia mensagem às 10:00
// Cliente B conecta às 10:05
// → Cliente B recebe automaticamente a mensagem das 10:00
```

```typescript
app.ws('/news/:topic', (ws, req, params) => {
  const group = app.getWsGroupByPath('/api/news/:topic');
  if (!group) return;

  ws.onmessage = (event) => {
    group.broadcast(
      `[${params.topic}] ${event.data}`,
      (clientParams, msg) => clientParams.topic === params.topic
    );
  };
});
```

> **Importante:** O envio ao novo membro respeita a `permissionFn` original do broadcast.

---

## 🔒 Graceful Shutdown

Feche todas as conexões WebSocket ao desligar o servidor:

```typescript
const server = Deno.serve(app.handleRequest.bind(app));

const shutdownSignals = ['SIGINT', 'SIGTERM'] as const;

for (const signal of shutdownSignals) {
  Deno.addSignalListener(signal, () => {
    console.log(`Recebido ${signal}. Encerrando...`);
    app.closeAllWebSockets();
    server.shutdown().then(() => {
      console.log('Servidor encerrado.');
      Deno.exit(0);
    });
  });
}
```

---

## 🎨 MIME Type Resolver Personalizado

```typescript
const myResolver = (ext: string): string | undefined => {
  const map: Record<string, string> = {
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'svg': 'image/svg+xml',
    'wasm': 'application/wasm',
    // ... adicione o que precisar
  };
  return map[ext.toLowerCase()];
};

const app = new Router('/api', './public', null, myResolver);
```

---

## 📋 Exemplo Completo

```typescript
import { Router } from "https://raw.githubusercontent.com/vanaware/loco/main/monorepo/router/src/mod.ts";

const app = new Router('/api', './public', import.meta.dirname);

// === ROTAS HTTP ===

app.get('/users/:id', (req, params) => ({
  body: JSON.stringify({ id: params.id }),
  init: { headers: { 'Content-Type': 'application/json' } }
}));

app.post('/users', async (req) => {
  const data = await req.json();
  return {
    body: JSON.stringify({ created: true, data }),
    init: { status: 201, headers: { 'Content-Type': 'application/json' } }
  };
});

// === CATCH-ALL ===

app.get('/docs/*', (req, params) => ({
  body: `Documentação: ${(params.catch as string[])[0]}`,
  init: { status: 200 }
}));

// === WEBSOCKET ===

app.ws('/chat/:room/:user', (ws, req, params) => {
  const group = app.getWsGroupByPath('/api/chat/:room/:user');
  if (!group) return;

  console.log(`✅ ${params.user} entrou em ${params.room}`);

  ws.onmessage = (event) => {
    console.log(`💬 ${params.user}: ${event.data}`);

    // Broadcast apenas para quem está na mesma sala
    group.broadcast(
      `${params.user}: ${event.data}`,
      (clientParams) => clientParams.room === params.room
    );
  };

  ws.onclose = () => {
    console.log(`❌ ${params.user} saiu de ${params.room}`);
  };
});

// === SERVIDOR ===

const server = Deno.serve({ port: 8000 }, app.handleRequest.bind(app));

// Graceful shutdown
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  Deno.addSignalListener(signal, () => {
    console.log(`🛑 ${signal} recebido. Encerrando...`);
    app.closeAllWebSockets();
    server.shutdown().then(() => Deno.exit(0));
  });
}
```

---

## 🧪 Testando

### Executar em desenvolvimento

```bash
deno run --allow-net --allow-read main.ts
```

### Compilar como executável com assets embarcados

```bash
deno compile --include=public/* --allow-net --allow-read main.ts
```

### Testar com curl

```bash
# HTTP
curl http://localhost:8000/api/users/42

# WebSocket (use wscat ou navegador)
wscat -c ws://localhost:8000/api/chat/sala1/joao
```

---

## 📁 Estrutura recomendada

```
meu-projeto/
├── main.ts              # Entry point
├── public/              # Arquivos estáticos
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── deno.json            # Configuração Deno (opcional)
```

---

## 🐛 Troubleshooting

| Problema | Solução |
|----------|---------|
| Arquivo estático não encontrado | Verifique se `staticDir` está correto e permissões `--allow-read` |
| WebSocket 404 | Confirme que o path bate com `.ws()` registrado |
| Broadcast não chega | Verifique a `permissionFn` - ela deve retornar `true` |
| Novo membro não recebe último broadcast | Confirme que houve ao menos um `broadcast()` antes da conexão |
| `import.meta.dirname` undefined | Use apenas em arquivos compilados ou módulos ES |

---

## 📄 Licença

MIT License - veja arquivo LICENSE para detalhes.

---

## 🔗 Recursos

- [Deno Documentation](https://deno.land/)
- [URL Pattern API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API)
- [WebSocket API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
