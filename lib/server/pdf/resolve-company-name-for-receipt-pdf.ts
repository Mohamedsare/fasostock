import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Nom affiché « entreprise » en tête du reçu : toujours `companies.name` quand la lecture RLS le permet.
 */
export async function resolveCompanyNameForReceiptPdf(
  supabase: SupabaseClient,
  companyId: string,
  fallbackFromPayload: string,
): Promise<string> {
  const id = companyId.trim();
  const fb = fallbackFromPayload.trim();
  if (!id) return fb || "Entreprise";

  const { data, error } = await supabase.from("companies").select("name").eq("id", id).maybeSingle();

  if (error || !data) return fb || "Entreprise";

  const n = String((data as { name?: string | null }).name ?? "").trim();
  return n.length > 0 ? n : fb || "Entreprise";
}
