

import { sendResponse, handlePreflight, getOrInitServerKeys } from "../shared.ts";

export async function handlePublicKey(request: Request, env?: any): Promise<Response> {
  const { serverPublicKeyMinified } = await getOrInitServerKeys(env);
  return sendResponse(request, serverPublicKeyMinified);
}

export const onRequestPost = async (context: any) => {
  return await handlePublicKey(context.request, context.env);
};

export const onRequestOptions = async (context: any) => {
  return handlePreflight(context.request);;
};