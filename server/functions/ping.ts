/// <reference types="https://esm.sh/@cloudflare/workers-types@4.20241022.0/index.d.ts" />

import { sendResponse, handlePreflight } from "../shared.ts";

export async function handlePing(request: Request, env?: any): Promise<Response> {
  const method = request.method;
  if (request.method === "OPTIONS") {
    return handlePreflight(request);
  }
  return sendResponse(request, { status: "ok", service: "loco-proxy", timestamp: Date.now() });
}

export const onRequest: PagesFunction<any> = async (context) => {
  return await handlePing(context.request, context.env);
};