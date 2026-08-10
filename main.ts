/// <reference lib="deno.ns" />

import { serveDir } from "@std/http/file-server";
import workerHandler from "./worker.ts";

const env = Deno.env.toObject()
Deno.serve({ port: Number(env?.PORT || 8000) }, async (req) => {    
    const url = new URL(req.url);
    const ctx = {
        waitUntil: (p: Promise<any>) => { p.catch(console.error); },
        passThroughOnException: () => {}
    };

// 1. Tenta processar a requisição através do workerHandler (APIs e Proxy Push)
    const workerResponse = await workerHandler.fetch(req, env, ctx);

    // 2. Se o worker processou com sucesso ou retornou erro de API (ex: 400, 403, 500), retorna o resultado dele
    if (workerResponse.status !== 404) {
        return workerResponse;
    }

    // 3. Se o worker retornou 404 (Endpoint não encontrado), significa que não é uma API.
    // Deixamos o serveDir processar para entregar o arquivo estático correspondente (HTML, JS, CSS, Ícones) do ./dist.
    try {
        const staticResponse = await serveDir(req, {
            fsRoot: "./dist",
            showDirListing: false,
            quiet: true,
        });

        // Se o arquivo estático foi encontrado e servido com sucesso, retorna-o
        if (staticResponse.status !== 404) {
            return staticResponse;
        }
    } catch {
        // Silencia erros de IO do disco
    }

    // 4. Se nem a API nem o disco possuíam o recurso, retorna o 404 limpo do worker
    return workerResponse; 

});
