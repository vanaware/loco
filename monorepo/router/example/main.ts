// main.ts

import { Router } from "../src/mod.ts";

const app = new Router('/api', 'servidor', './public', null);

// HTTP GET route with cascading parameters
app.get('/:id/:tipo', (req, params) => {
    console.log(params); // { id: '123', tipo: 'tipoA' }
    const id = params.id;
    const tipo = params.tipo;
    return { body: JSON.stringify({ id, tipo }), init: { headers: { 'Content-Type': 'application/json' } } };
});

// HTTP POST route
app.post('/users', async (req) => {
    const body = await req.text();
    return { body, init: { status: 201, headers: { 'Content-Type': 'application/json' } } };
});

// WebSocket route with cascading parameters
app.ws('/chat/:room/:user', (ws, req, params) => {
    console.log(params); // { room: 'room1', user: 'user1' }
    const room = params.room;
    const user = params.user;
    console.log(`New WebSocket connection for room: ${room}, user: ${user}`);

    const targetGroup = app.getWsGroupByPath(`/api/chat/${params.room}`);
    if (targetGroup) {
        // Send the last broadcast to the new member
        if (targetGroup.lastBroadcast) {
            ws.send(targetGroup.lastBroadcast);
        }

        ws.onmessage = (event) => {
            console.log(`Message received in room ${room} from user ${user}: ${event.data}`);
            // Broadcast message to a specific group based on the route
            targetGroup.broadcast(`Broadcast from ${user}: ${event.data}`, (clientParams, msg) => {
                // Example permission check: only broadcast if the client is in the same room
                return clientParams.room === params.room;
            });
        };

        ws.onclose = () => {
            console.log(`WebSocket connection closed for room: ${room}, user: ${user}`);
        };

        ws.onerror = (event) => {
            console.error(`WebSocket error for room: ${room}, user: ${user}`, event);
        };
    } else {
        console.log(`No group found for room: ${params.room}`);
    }
});

// HTTP catch-all route with * parameter
app.get('/subfolder/*', (req, params) => {
    console.log(params); // { catch: ["anything/ever/last.html"] }
    return { body: `HTTP catch-all route with catch: ${JSON.stringify(params.catch)}`, init: { status: 200 } };
});

// WebSocket catch-all route with * parameter
app.ws('/subfolder/*', (ws, req, params) => {
    console.log(params); // { catch: ["anything/ever/last.html"] }
    ws.onmessage = (event) => {
        console.log(`Message received in catch-all WebSocket: ${event.data}`);
        ws.send(`Echo: ${event.data}`);
    };
    ws.onclose = () => {
        console.log('WebSocket catch-all connection closed');
    };
    ws.onerror = (event) => {
        console.error(`WebSocket catch-all error: ${event.message}`);
    };
});

// Serve the application
const server = Deno.serve(app.handleRequest.bind(app));

// Handle shutdown signals
const shutdownSignals = ['SIGINT', 'SIGTERM'] as const;

for (const signal of shutdownSignals) {
    Deno.addSignalListener(signal, () => {
        console.log(`Received ${signal}. Shutting down server...`);
        app.closeAllWebSockets();
        server.close().then(() => {
            console.log('Server has been shut down.');
            Deno.exit(0);
        }).catch(err => {
            console.error('Error shutting down server:', err);
            Deno.exit(1);
        });
    });
}

// Example of closing a specific group
// This can be triggered by any condition or event
function closeSpecificGroup(room: string) {
    const route = app.wsRoutes.find(r => r.pattern.pathname.includes(`/:room/:user`));
    if (route) {
        route.group.closeGroup();
        console.log(`Group for room ${room} has been closed.`);
    } else {
        console.log(`No group found for room ${room}.`);
    }
}

// Simulate closing a specific group after some time
setTimeout(() => {
    closeSpecificGroup('room1');
}, 30000); // Close group for room1 after 30 seconds