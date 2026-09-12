import { createClient } from "@/lib/supabase/client";

/**
 * Clés de l'API publique produits (migration 00226). La liste et la révocation passent
 * par la RLS (owner uniquement) ; la création passe par la RPC `create_api_key`, seule
 * à connaître la clé en clair — et une seule fois.
 */

export type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  storeId: string | null;
  lastUsedAt: string | null;
  requestCount: number;
  createdAt: string;
};

export async function listApiKeys(companyId: string): Promise<ApiKeyRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, store_id, last_used_at, request_count, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    keyPrefix: String(r.key_prefix ?? ""),
    storeId: r.store_id ? String(r.store_id) : null,
    lastUsedAt: r.last_used_at ? String(r.last_used_at) : null,
    requestCount: Number(r.request_count ?? 0),
    createdAt: String(r.created_at ?? ""),
  }));
}

export async function createApiKey(params: {
  companyId: string;
  name: string;
  storeId: string | null;
}): Promise<{ id: string; keyRaw: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_api_key", {
    p_company_id: params.companyId,
    p_name: params.name,
    p_store_id: params.storeId,
  });
  if (error) throw error;
  const row = (data ?? {}) as { id?: string; key_raw?: string };
  if (!row.key_raw) throw new Error("La clé n'a pas été créée. Réessayez.");
  return { id: String(row.id ?? ""), keyRaw: row.key_raw };
}

export async function revokeApiKey(id: string): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase.from("api_keys").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Révocation refusée : seule la personne propriétaire peut révoquer une clé.");
  }
}
