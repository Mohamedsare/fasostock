import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { normalizeSupabaseUrl } from "@/lib/supabase/normalize-url";

export type AuthUser = { id: string };

export async function requireAuthUser(
  supabase: SupabaseClient,
): Promise<{ ok: true; user: AuthUser } | { ok: false; response: NextResponse }> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user?.id) {
    return { ok: false, response: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) };
  }
  return { ok: true, user: { id: user.id } };
}

export async function userBelongsToCompany(
  supabase: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<boolean> {
  const id = companyId.trim();
  if (!id) return false;
  const { data, error } = await supabase
    .from("user_company_roles")
    .select("company_id")
    .eq("user_id", userId)
    .eq("company_id", id)
    .eq("is_active", true)
    .maybeSingle();
  return !error && data != null;
}

export async function requireSuperAdmin(
  supabase: SupabaseClient,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const { data: isSa, error } = await supabase.rpc("is_super_admin");
  if (error) {
    return {
      ok: false,
      response: NextResponse.json({ error: error.message }, { status: 500 }),
    };
  }
  if (!isSa) {
    return { ok: false, response: NextResponse.json({ error: "Non autorisé" }, { status: 403 }) };
  }
  return { ok: true };
}

export async function companyAllowsAiPredictions(
  supabase: SupabaseClient,
  companyId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("companies")
    .select("ai_predictions_enabled")
    .eq("id", companyId.trim())
    .maybeSingle();
  if (error || !data) return false;
  return (data as { ai_predictions_enabled?: boolean }).ai_predictions_enabled === true;
}

export async function userHasActiveCompanyMembership(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("user_company_roles")
    .select("company_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_active", true);
  if (error) return false;
  return (count ?? 0) > 0;
}

/** Pour PDF ticket : lecture vente sous RLS (doit correspondre au numéro affiché). */
export async function getSaleCompanyAndNumber(
  supabase: SupabaseClient,
  saleId: string,
): Promise<{ companyId: string; saleNumber: string } | null> {
  const id = saleId.trim();
  if (!id) return null;
  const { data, error } = await supabase
    .from("sales")
    .select("company_id, sale_number")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { company_id?: string; sale_number?: string };
  const companyId = String(row.company_id ?? "").trim();
  const saleNumber = String(row.sale_number ?? "").trim();
  if (!companyId) return null;
  return { companyId, saleNumber };
}

/** Autorise uniquement images Supabase Storage du projet ou data URLs image (aperçu PDF). */
export function isAllowedPdfEmbedImageUrl(url: string, supabasePublicUrlRaw: string | undefined): boolean {
  const u = url.trim();
  if (u.length === 0 || u.length > 2_000_000) return false;
  if (u.startsWith("data:")) {
    const head = u.slice(0, 48).toLowerCase();
    if (!/^data:image\/(png|jpeg|jpg|gif|webp);base64,/.test(head)) return false;
    if (u.length > 600_000) return false;
    return true;
  }
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (parsed.username || parsed.password) return false;
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) return false;
  const path = parsed.pathname;
  if (!path.startsWith("/storage/v1/object/")) return false;
  if (!supabasePublicUrlRaw?.trim()) return false;
  let expectedHost: string;
  try {
    expectedHost = new URL(normalizeSupabaseUrl(supabasePublicUrlRaw.trim())).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === expectedHost;
}
