// router-lib/mod.ts

import { contentType } from "https://deno.land/std@0.157.0/media_types/mod.ts";
import { join } from "https://deno.land/std@0.157.0/path/mod.ts";

export class Router {
    private basePath: string;
    private httpRoutes: { method: string; pattern: URLPattern; handler: (req: Request, params: Record<string, string | string[]>) => { body: BodyInit; init?: ResponseInit } }[] = [];
    private wsRoutes: { pattern: URLPattern; handler: (ws: WebSocket, req: Request, params: Record<string, string | string[]>) => void; group: WebSocketGroup }[] = [];
    private webSockets: Map<WebSocket, { pattern: URLPattern; params: Record<string, string | string[]>; group: WebSocketGroup }> = new Map();
    private staticDir: string | null;
    private embeddedDir: string | null;
    private mimeTypeResolver: (ext: string) => string | undefined;

    constructor(basePath = '', staticDir: string | null = 'public', embeddedDir: string | null = null, mimeTypeResolver: (ext: string) => string | undefined = defaultMimeTypeResolver) {
        this.basePath = basePath;
        this.staticDir = staticDir;
        this.embeddedDir = embeddedDir;
        this.mimeTypeResolver = mimeTypeResolver;
    }

    // Method to add an HTTP route
    private addHttpRoute(method: string, path: string, handler: (req: Request, params: Record<string, string | string[]>) => { body: BodyInit; init?: ResponseInit }) {
        const fullPath = join(this.basePath, path);
        const pattern = new URLPattern({ pathname: fullPath });
        this.httpRoutes.push({ method, pattern, handler });
    }

    // Method to add a WebSocket route
    private addWsRoute(path: string, handler: (ws: WebSocket, req: Request, params: Record<string, string | string[]>) => void) {
        const fullPath = join(this.basePath, path);
        const pattern = new URLPattern({ pathname: fullPath });
        const group = new WebSocketGroup();
        this.wsRoutes.push({ pattern, handler, group });
    }

    // Convenience methods for HTTP routes
    get(path: string, handler: (req: Request, params: Record<string, string | string[]>) => { body: BodyInit; init?: ResponseInit }) {
        this.addHttpRoute('GET', path, handler);
    }

    post(path: string, handler: (req: Request, params: Record<string, string | string[]>) => { body: BodyInit; init?: ResponseInit }) {
        this.addHttpRoute('POST', path, handler);
    }

    // Add more HTTP methods as needed
    put(path: string, handler: (req: Request, params: Record<string, string | string[]>) => { body: BodyInit; init?: ResponseInit }) {
        this.addHttpRoute('PUT', path, handler);
    }

    delete(path: string, handler: (req: Request, params: Record<string, string | string[]>) => { body: BodyInit; init?: ResponseInit }) {
        this.addHttpRoute('DELETE', path, handler);
    }

    // Convenience method for WebSocket routes
    ws(path: string, handler: (ws: WebSocket, req: Request, params: Record<string, string | string[]>) => void) {
        this.addWsRoute(path, handler);
    }

    // Handle HTTP requests
    private async handleHttpRequest(req: Request): Promise<Response> {
        const { method, url } = req;
        const adjustedUrl = new URL(url);
        adjustedUrl.pathname = adjustedUrl.pathname.replace(`/${this.basePath}`, '');

        for (const route of this.httpRoutes) {
            if (route.method === method) {
                const match = route.pattern.exec(adjustedUrl);
                if (match) {
                    const params = this._extractParams(match.pathname.groups);
                    const { body, init } = route.handler(req, params);
                    return new Response(body, init);
                }
            }
        }

        return await this.handleStaticFile(req);
    }

    // Handle WebSocket upgrade requests
    private async handleWsUpgrade(req: Request): Promise<Response> {
        const { url } = req;
        const adjustedUrl = new URL(url);
        adjustedUrl.pathname = adjustedUrl.pathname.replace(`/${this.basePath}`, '');

        for (const route of this.wsRoutes) {
            const match = route.pattern.exec(adjustedUrl);
            if (match) {
                const { socket, response } = Deno.upgradeWebSocket(req);
                const params = this._extractParams(match.pathname.groups);
                this.webSockets.set(socket, { pattern: route.pattern, params, group: route.group });

                // Send the last broadcast to the new member
                if (route.group.lastBroadcast) {
                    socket.send(route.group.lastBroadcast.message);
                }

                route.group.addSocket(socket, params, route.group.lastBroadcast?.permissionFn, route.group.lastBroadcast?.params);
                route.handler(socket, req, params);
                socket.onclose = () => {
                    this.webSockets.delete(socket);
                    route.group.removeSocket(socket);
                };
                socket.onerror = (event) => {
                    console.error(`WebSocket error: ${event.message}`);
                    this.webSockets.delete(socket);
                    route.group.removeSocket(socket);
                };
                return response;
            }
        }

        return new Response('WebSocket Not Found', { status: 404 });
    }

    // Main handler for all requests
    async handleRequest(req: Request): Promise<Response> {
        if (req.headers.get('upgrade') === 'websocket') {
            return this.handleWsUpgrade(req);
        } else {
            return this.handleHttpRequest(req);
        }
    }

    // Close all WebSockets
    closeAllWebSockets() {
        for (const [socket] of this.webSockets.entries()) {
            if (socket.readyState === WebSocket.OPEN) {
                socket.close(1000, 'Server is shutting down');
            }
        }
    }

    // Handle static file requests
    private async handleStaticFile(req: Request): Promise<Response> {
        if (this.staticDir === null) {
            return new Response('Static Directory Not Configured', { status: 500 });
        }

        const { pathname } = new URL(req.url);
        const adjustedPathname = pathname.replace(`/${this.basePath}`, '');
        const filePath = join(this.staticDir, adjustedPathname);

        try {
            // Check if the file is embedded
            if (this.embeddedDir !== null) {
                const embeddedFilePath = join(this.embeddedDir, adjustedPathname);
                try {
                    const embeddedFile = await Deno.readTextFile(embeddedFilePath);
                    const ext = embeddedFilePath.split('.').pop()?.toLowerCase() || '';
                    const mimeType = this.mimeTypeResolver(ext) || 'application/octet-stream';
                    return new Response(embeddedFile, {
                        headers: { 'Content-Type': mimeType },
                    });
                } catch (embeddedErr) {
                    if (!(embeddedErr instanceof Deno.errors.NotFound)) {
                        console.error(`Error serving embedded file: ${embeddedErr.message}`);
                        return new Response('Internal Server Error', { status: 500 });
                    }
                }
            }

            // Check if the file exists in the static directory
            const fileInfo = await Deno.stat(filePath);

            if (fileInfo.isDirectory) {
                // Try to serve index.html or index.htm if the path is a directory
                const indexFiles = ['index.html', 'index.htm'];
                for (const indexFile of indexFiles) {
                    const indexPath = join(filePath, indexFile);
                    try {
                        const indexFileInfo = await Deno.stat(indexPath);
                        if (indexFileInfo.isFile) {
                            return await this.serveFileWithMimeType(indexPath);
                        }
                    } catch (err) {
                        if (!(err instanceof Deno.errors.NotFound)) {
                            console.error(`Error serving file: ${err.message}`);
                            return new Response('Internal Server Error', { status: 500 });
                        }
                    }
                }
            } else if (fileInfo.isFile) {
                return await this.serveFileWithMimeType(filePath);
            }
        } catch (err) {
            if (err instanceof Deno.errors.NotFound) {
                // Try to serve with auto extensions if the file is not found
                const autoExtensions = ['.html', '.htm'];
                for (const ext of autoExtensions) {
                    const autoFilePath = `${filePath}${ext}`;
                    try {
                        const autoFileInfo = await Deno.stat(autoFilePath);
                        if (autoFileInfo.isFile) {
                            return await this.serveFileWithMimeType(autoFilePath);
                        }
                    } catch (autoErr) {
                        if (!(autoErr instanceof Deno.errors.NotFound)) {
                            console.error(`Error serving file: ${autoErr.message}`);
                            return new Response('Internal Server Error', { status: 500 });
                        }
                    }
                }
            } else {
                console.error(`Error serving file: ${err.message}`);
                return new Response('Internal Server Error', { status: 500 });
            }
        }

        return new Response('Not Found', { status: 404 });
    }

    // Serve file with correct MIME type
    private async serveFileWithMimeType(filePath: string): Promise<Response> {
        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        const mimeType = this.mimeTypeResolver(ext) || 'application/octet-stream';
        const file = await Deno.open(filePath);
        return new Response(file.readable, {
            headers: { 'Content-Type': mimeType },
        });
    }

    // Get WebSocket group by path
    getWsGroupByPath(path: string): WebSocketGroup | undefined {
        const pattern = new URLPattern({ pathname: path });
        for (const route of this.wsRoutes) {
            if (pattern.test(route.pattern.pathname)) {
                return route.group;
            }
        }
        return undefined;
    }

    // Extract parameters from URLPattern groups
    private _extractParams(groups: Record<string, string>): Record<string, string | string[]> {
        const params: Record<string, string | string[]> = {};
        for (const [key, value] of Object.entries(groups)) {
            if (key.startsWith('*')) {
                const catchKey = 'catch';
                if (!params[catchKey]) {
                    params[catchKey] = [];
                }
                (params[catchKey] as string[]).push(value);
            } else {
                params[key] = value;
            }
        }
        return params;
    }
}

class WebSocketGroup {
    private sockets: Map<WebSocket, { params: Record<string, string | string[]>; permissionFn?: (params: Record<string, string | string[]>, message: string) => boolean }> = new Map();
    private lastBroadcast: { message: string; permissionFn?: (params: Record<string, string | string[]>, message: string) => boolean; params: Record<string, string | string[]> } | null = null;

    addSocket(ws: WebSocket, params: Record<string, string | string[]>, permissionFn?: (params: Record<string, string | string[]>, message: string) => boolean, lastBroadcastParams?: Record<string, string | string[]>) {
        this.sockets.set(ws, { params, permissionFn });

        // Send the last broadcast to the new member if they meet the permission criteria
        if (this.lastBroadcast && (!permissionFn || permissionFn(lastBroadcastParams || params, this.lastBroadcast.message))) {
            ws.send(this.lastBroadcast.message);
        }
    }

    removeSocket(ws: WebSocket) {
        this.sockets.delete(ws);
    }

    broadcast(message: string, permissionFn?: (params: Record<string, string | string[]>, message: string) => boolean) {
        for (const [socket, { params, permissionFn: socketPermissionFn }] of this.sockets.entries()) {
            if (socket.readyState === WebSocket.OPEN) {
                if (!permissionFn || permissionFn(params, message)) {
                    if (!socketPermissionFn || socketPermissionFn(params, message)) {
                        socket.send(message);
                    }
                }
            }
        }

        // Update the last broadcast
        this.lastBroadcast = { message, permissionFn, params: this._extractParamsFromPermissionFn(permissionFn) };
    }

    closeGroup() {
        for (const [socket] of this.sockets.entries()) {
            if (socket.readyState === WebSocket.OPEN) {
                socket.close(1000, 'Group is being closed');
            }
        }
        this.sockets.clear();
    }

    // Extract parameters from the permission function
    private _extractParamsFromPermissionFn(permissionFn?: (params: Record<string, string | string[]>, message: string) => boolean): Record<string, string | string[]> {
        if (!permissionFn) {
            return {};
        }

        // This is a simplified way to extract parameters from the permission function
        // In practice, you might need to parse the function to extract actual parameters
        return {};
    }
}

// Default MIME type resolver
function defaultMimeTypeResolver(ext: string): string | undefined {
    switch (ext) {
        case 'html':
        case 'htm':
            return 'text/html';
        case 'css':
            return 'text/css';
        case 'js':
            return 'application/javascript';
        case 'json':
            return 'application/json';
        case 'png':
            return 'image/png';
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        case 'gif':
            return 'image/gif';
        case 'svg':
            return 'image/svg+xml';
        case 'txt':
            return 'text/plain';
        case 'pdf':
            return 'application/pdf';
        default:
            return undefined;
    }
}