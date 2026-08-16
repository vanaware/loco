/// <reference types="https://esm.sh/@cloudflare/workers-types@4.20241022.0/index.d.ts" />

import { sendResponse, handlePreflight, getOrInitServerKeys } from "../shared.ts";

export async function handlePublicKey(request: Request, env?: any): Promise<Response> {
  const method = request.method;
  if (request.method === "OPTIONS") {
    return handlePreflight(request);
  }
  const { serverPublicKeyMinified } = await getOrInitServerKeys(env);
  return sendResponse(request, serverPublicKeyMinified);
}

export const onRequest: PagesFunction<any> = async (context) => {
  return await handlePublicKey(context.request, context.env);
};