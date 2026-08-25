# 📡 Documentação: Permissionamento Inteligente em WebSockets

O `@loco/router` possui um sistema nativo e robusto de permissionamento para WebSockets, permitindo que mensagens de broadcast sejam filtradas dinamicamente com base nos **parâmetros da rota** e no **conteúdo da mensagem**. 

Além disso, o sistema gerencia automaticamente o "Último Broadcast" (Last Broadcast), garantindo que novos membros de um grupo recebam o contexto histórico, respeitando as mesmas regras de permissão.

---

## 🔑 Conceitos Fundamentais

### 1. `RouteParams`
São os parâmetros extraídos da URL quando o cliente se conecta. 
Exemplo: Na rota `/chat/:room/:user`, se a URL for `/chat/lobby/joao`, os parâmetros serão `{ room: "lobby", user: "joao" }`.

### 2. `PermissionFn` (Função de Permissão)
É um callback opcional passado ao método `group.broadcast()`. Sua assinatura é:
```typescript
type PermissionFn = (params: RouteParams, message: string) => boolean;
```
- **`params`**: Os parâmetros da conexão do cliente que está sendo avaliado para receber a mensagem.
- **`message`**: O conteúdo da mensagem sendo enviada.
- **Retorno**: `true` (envia a mensagem) ou `false` (bloqueia a mensagem para este cliente específico).

### 3. `senderParams`
São os parâmetros de quem **originou** a mensagem. O router os armazena automaticamente para que, quando um novo membro entrar, o sistema possa reavaliar se aquele membro tem direito de receber o último broadcast com base no contexto original.

---

## ⚙️ Como Funciona (Fluxo Interno)

1. Um cliente envia uma mensagem via WebSocket.
2. O handler chama `group.broadcast(mensagem, permissionFn, paramsDoSender)`.
3. O router salva essa combinação (`mensagem` + `permissionFn` + `paramsDoSender`) como o `lastBroadcast` do grupo.
4. O router itera sobre **todos** os sockets conectados ao grupo.
5. Para cada socket, ele executa a `permissionFn` passando os parâmetros *desse socket específico* e a mensagem.
6. Se a função retornar `true`, a mensagem é enviada. Se retornar `false`, o socket é ignorado.
7. **Novos Membros**: Quando um novo socket se conecta, o router aguarda o handshake finalizar (50ms) e reexecuta a `permissionFn` do `lastBroadcast`. Se for `true`, o novo membro recebe a mensagem histórica automaticamente.

---

## 🌍 Exemplos Práticos do Mundo Real

### Cenário 1: Isolamento de Salas de Chat (O Clássico)
**Objetivo:** Garantir que uma mensagem enviada na sala "geral" não vaze para a sala "vip".

```typescript
app.ws("/chat/:room/:user", (ws, _req, params) => {
  const currentRoom = params.room as string;
  const group = app.getWsGroupByPath("/chat/:room/:user");

  ws.onmessage = (event) => {
    // A função de permissão verifica se o cliente destinatário está na mesma sala do remetente
    group.broadcast(
      `[${params.user}]: ${event.data}`,
      (clientParams) => clientParams.room === currentRoom,
      params // Passamos os params do remetente para histórico
    );
  };
});
```

### Cenário 2: Controle de Acesso por Nível de Usuário (RBAC)
**Objetivo:** Em um dashboard, apenas usuários com role `admin` ou `moderator` podem receber alertas de sistema críticos.

```typescript
app.ws("/dashboard/:role/:userId", (ws, _req, params) => {
  const group = app.getWsGroupByPath("/dashboard/:role/:userId");

  // Função simulada que envia um alerta
  function sendSystemAlert(alertMessage: string) {
    group.broadcast(
      `🚨 ALERTA: ${alertMessage}`,
      (clientParams) => {
        // Só permite a passagem se o role do destinatário for admin ou moderator
        return clientParams.role === "admin" || clientParams.role === "moderator";
      }
    );
  }
});
```

### Cenário 3: Filtragem Baseada no Conteúdo da Mensagem
**Objetivo:** Impedir que mensagens contendo a menção `@everyone` sejam enviadas, a menos que o remetente seja um administrador.

```typescript
app.ws("/community/:serverId/:userId", (ws, _req, params) => {
  const group = app.getWsGroupByPath("/community/:serverId/:userId");

  ws.onmessage = (event) => {
    const message = event.data;

    group.broadcast(
      message,
      (clientParams, msgContent) => {
        // Se a mensagem contiver @everyone, só passa se o DESTINATÁRIO for admin 
        // (ou você pode checar o senderParams se salvar no contexto, mas aqui filtramos o destino)
        if (msgContent.includes("@everyone")) {
          return clientParams.role === "admin"; 
        }
        return true; // Mensagens normais passam para todos
      },
      params
    );
  };
});
```

### Cenário 4: Mensagens Diretas (DM) ou Notificações Privadas
**Objetivo:** Enviar uma notificação apenas para o usuário específico dentro de um grupo amplo.

```typescript
app.ws("/notifications/:tenantId/:userId", (ws, _req, params) => {
  const group = app.getWsGroupByPath("/notifications/:tenantId/:userId");

  // Função chamada pelo backend quando há uma nova notificação para o user "42"
  function notifyUser(targetUserId: string, notificationData: string) {
    group.broadcast(
      notificationData,
      (clientParams) => clientParams.userId === targetUserId, // Filtra pelo ID exato
      params
    );
  }
});
```

---

## 💡 Recursos Avançados e "Mágica" do Last Broadcast

### O Problema que isso resolve:
Em aplicações de chat ou dashboards em tempo real, se um usuário entra em uma sala onde uma discussão já está acontecendo, ele perde o contexto. 

### A Solução do `@loco/router`:
Graças ao armazenamento do `lastBroadcast`, o sistema faz isso automaticamente:

```typescript
// 10:00:00 -> User A (room: "lobby") envia: "Olá a todos!"
// O router salva: { message: "Olá a todos!", permissionFn: (p) => p.room === "lobby", senderParams: { room: "lobby", user: "A" } }

// 10:00:05 -> User B conecta na rota /chat/lobby/userB
// O router detecta a conexão, aguarda 50ms (para o socket ficar OPEN), 
// reavalia a permissionFn do último broadcast e, como "lobby" === "lobby", 
// envia "Olá a todos!" automaticamente para o User B.
```

**Nota de Segurança:** O router reavalia a permissão usando os `senderParams` originais no momento da reconexão/histórico. Isso garante que a regra de negócio original (ex: "esta mensagem era apenas para a sala X") seja respeitada, evitando que um usuário entre em uma sala diferente e receba mensagens vazadas de outro contexto.

---

## ⚠️ Melhores Práticas e Cuidados

1. **Mantenha a `PermissionFn` Leve:** 
   A função é executada para **cada** cliente conectado no grupo. Evite operações assíncronas (como consultas ao banco de dados) dentro da `PermissionFn`. Use-a apenas para verificações síncronas de estado (strings, arrays, roles).

2. **Não Confie Apenas no Frontend:** 
   Os `RouteParams` são extraídos da URL no momento do handshake. Se a autenticação for crítica, valide o token JWT *antes* de chamar `Deno.upgradeWebSocket` ou dentro do handler do WebSocket, e injete o `role` ou `userId` validado nos parâmetros ou em um contexto seguro.

3. **Use `senderParams` Corretamente:** 
   Sempre passe o terceiro argumento `params` no `group.broadcast(msg, fn, params)`. Sem isso, o recurso de "Last Broadcast" para novos membros não terá o contexto necessário para reavaliar a permissão de forma segura.

4. **Limpeza de Grupos:** 
   Se um grupo ficar obsoleto (ex: uma sala de jogo que acabou), use `app.closeGroupByPath("/game/:roomId")` para liberar a memória e fechar os sockets pendentes, o que também limpa o `lastBroadcast`.

--- 

*Este documento faz parte da especificação oficial do `@loco/router`. Para mais detalhes sobre a API, consulte o `README.md` principal.*