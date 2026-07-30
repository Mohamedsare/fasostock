"use client";

import { createClient } from "@/lib/supabase/client";

const KEY = "quick_pos_credit_enabled";

/** Cache session (évite un flash « crédit indisponible » à l'ouverture de la caisse). */
const cache = new Map<string, boolean>();

export function peekQuickPosCreditEnabled(companyId: string): boolean | undefined {
  return cache.get(companyId);
}

function parseValue(raw: unknown): boolean {
  if (raw == null) return false;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes";
  }
  if (typeof raw === "number") return raw !== 0;
  return false;
}

/**
 * Réglage entreprise « Vente à crédit en caisse rapide »
 * (`company_settings.quick_pos_credit_enabled`). Désactivé par défaut : sans lui,
 * la caisse rapide n'encaisse que du comptant (espèces / carte / mobile money).
 */
export async function fetchQuickPosCreditEnabled(companyId: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("company_settings")
    .select("value")
    .eq("company_id", companyId)
    .eq("key", KEY)
    .maybeSingle();
  if (error) throw error;
  const row = data as { value?: unknown } | null;
  const result = row == null ? false : parseValue(row.value);
  cache.set(companyId, result);
  return result;
}

/** Propriétaire : autorise ou interdit la vente à crédit en caisse rapide (`company_settings`). */
export async function setQuickPosCreditEnabled(
  companyId: string,
  enabled: boolean,
): Promise<void> {
  const supabase = createClient();
  const { data: existing, error: selErr } = await supabase
    .from("company_settings")
    .select("id")
    .eq("company_id", companyId)
    .eq("key", KEY)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing != null) {
    const { error } = await supabase
      .from("company_settings")
      .update({ value: enabled })
      .eq("company_id", companyId)
      .eq("key", KEY);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("company_settings").insert({
      company_id: companyId,
      key: KEY,
      value: enabled,
    });
    if (error) throw error;
  }
  cache.set(companyId, enabled);
}
