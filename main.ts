/// <reference lib="deno.ns" />

import workerHandler from "./worker.ts";

const env = Deno.env.toObject()
Deno.serve({ port: Number(env?.PORT || 8000) }, async (req) => {    
    const ctx = {
        waitUntil: (p: Promise<any>) => { p.catch(console.error); },
        passThroughOnException: () => {}
    };
    return await workerHandler.fetch(req, env, ctx);
});
