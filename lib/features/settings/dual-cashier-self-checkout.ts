"use client";

import { createClient } from "@/lib/supabase/client";

const KEY = "dual_cashier_self_checkout";

/** Cache session (évite que le bouton « Encaisser ici » clignote à l'ouverture de la caisse). */
const cache = new Map<string, boolean>();

export function peekDualCashierSelfCheckout(companyId: string): boolean | undefined {
  return cache.get(companyId);
}

/**
 * **Soustractif** : l'absence de réglage vaut AUTORISÉ.
 *
 * C'est l'inverse des autres drapeaux du projet, et c'est voulu : le bouton « Encaisser
 * ici » existe déjà chez les clients qui ont ouvert la caisse à deux. Un défaut à `false`
 * le leur retirerait du jour au lendemain, sans que personne n'ait rien demandé.
 */
function parseValue(raw: unknown): boolean {
  if (raw == null) return true;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    return !(s === "false" || s === "0" || s === "no");
  }
  if (typeof raw === "number") return raw !== 0;
  return true;
}

/**
 * Réglage entreprise « le vendeur peut encaisser lui-même »
 * (`company_settings.dual_cashier_self_checkout`).
 *
 * Coupé, le panier ne peut plus QUE partir à la caisse : c'est ce que veut le
 * propriétaire qui exige que l'argent ne passe que par une seule personne. Ouvert (par
 * défaut), le vendeur garde sa porte de sortie quand il est seul au comptoir.
 */
export async function fetchDualCashierSelfCheckout(companyId: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("company_settings")
    .select("value")
    .eq("company_id", companyId)
    .eq("key", KEY)
    .maybeSingle();
  if (error) throw error;
  const row = data as { value?: unknown } | null;
  const result = row == null ? true : parseValue(row.value);
  cache.set(companyId, result);
  return result;
}

/** Propriétaire : autorise ou interdit au vendeur d'encaisser son propre panier. */
export async function setDualCashierSelfCheckout(
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
