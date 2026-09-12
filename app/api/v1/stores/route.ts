import {
  apiError,
  apiJson,
  apiPreflight,
  apiRpcErrorResponse,
  beginApiCall,
} from "@/lib/server/public-api/v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/stores — boutiques accessibles avec la clé API. */
export async function GET(req: Request) {
  const begin = await beginApiCall(req);
  if (!begin.ok) return begin.response;
  const { svc, keyHash } = begin.ctx;

  const { data, error } = await svc.rpc("api_stores_list", { p_key_hash: keyHash });
  if (error) {
    return apiError(503, "unavailable", "Service temporairement indisponible.");
  }
  const body = (data ?? {}) as { error?: string };
  if (body.error) return apiRpcErrorResponse(body.error);
  return apiJson(body);
}

export function OPTIONS() {
  return apiPreflight();
}
