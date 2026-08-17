
import { sendResponse, handlePreflight } from "../shared.ts";

export async function handlePing(request: Request, env?: any): Promise<Response> {
  return sendResponse(request, { success: true, service: "loco-proxy", timestamp: Date.now() });
}

export const onRequestPost = async (context: any) => {
  return await handlePing(context.request, context.env);
};

export const onRequestOptions = async (context: any) => {
  return handlePreflight(context.request);;
};
