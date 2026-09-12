import {
  apiError,
  apiJson,
  apiPreflight,
  apiRpcErrorResponse,
  beginApiCall,
  isUuid,
} from "@/lib/server/public-api/v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function intParam(value: string | null, fallback: number, min: number, max: number): number | null {
  if (value == null || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value.trim())) return null;
  return Math.min(max, Math.max(min, Number(value)));
}

/**
 * GET /api/v1/stores/{storeId}/products
 *
 * Paramètres : `limit` (1-500, défaut 100), `offset`, `search` (nom, SKU, code-barres,
 * autres noms), `barcode` (code exact du produit OU d'un conditionnement), `in_stock=true`.
 */
export async function GET(req: Request, ctx: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await ctx.params;
  if (!isUuid(storeId)) {
    return apiError(400, "invalid_store_id", "Identifiant de boutique invalide.");
  }

  const url = new URL(req.url);
  const limit = intParam(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = intParam(url.searchParams.get("offset"), 0, 0, 1_000_000);
  if (limit == null || offset == null) {
    return apiError(400, "invalid_pagination", "`limit` et `offset` doivent être des entiers positifs.");
  }
  const search = url.searchParams.get("search")?.trim().slice(0, 120) || null;
  const barcode = url.searchParams.get("barcode")?.trim().slice(0, 64) || null;
  const inStock = ["true", "1"].includes((url.searchParams.get("in_stock") ?? "").toLowerCase());

  const begin = await beginApiCall(req);
  if (!begin.ok) return begin.response;
  const { svc, keyHash } = begin.ctx;

  const { data, error } = await svc.rpc("api_products_catalog", {
    p_key_hash: keyHash,
    p_store_id: storeId,
    p_limit: limit,
    p_offset: offset,
    p_search: search,
    p_barcode: barcode,
    p_in_stock_only: inStock,
  });
  if (error) {
    return apiError(503, "unavailable", "Service temporairement indisponible.");
  }

  const body = (data ?? {}) as {
    error?: string;
    total?: number;
    limit?: number;
    offset?: number;
    products?: unknown[];
  };
  if (body.error) return apiRpcErrorResponse(body.error);

  const count = body.products?.length ?? 0;
  const total = Number(body.total ?? 0);
  return apiJson({
    ...body,
    count,
    has_more: offset + count < total,
    next_offset: offset + count < total ? offset + count : null,
  });
}

export function OPTIONS() {
  return apiPreflight();
}
