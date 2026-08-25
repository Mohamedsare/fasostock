"use client";

import { createClient } from "@/lib/supabase/client";

const KEY = "sales_seller_board_staff_enabled";

/** Cache session (évite un flash du classement à l'ouverture de /sales). */
const cache = new Map<string, boolean>();

export function peekSalesSellerBoardStaffEnabled(companyId: string): boolean | undefined {
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
 * Réglage entreprise « Classement des vendeurs visible par les employés »
 * (`company_settings.sales_seller_board_staff_enabled`). **Désactivé par défaut** :
 * le tableau « Qui a vendu combien » expose le chiffre d'affaires de toute l'équipe,
 * ce qui est une lecture de patron. Activé, l'employé le voit — mais **sur la seule
 * journée du jour** (voir `SalesScreen`), jamais sur tout l'historique.
 */
export async function fetchSalesSellerBoardStaffEnabled(
  companyId: string,
): Promise<boolean> {
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

/** Propriétaire : montre ou cache le classement des vendeurs à ses employés. */
export async function setSalesSellerBoardStaffEnabled(
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
