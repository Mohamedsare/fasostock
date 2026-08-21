"use client";

import { createClient } from "@/lib/supabase/client";

const KEY = "dashboard_payment_mix_enabled";

/** Cache session : évite que le volet apparaisse après coup au retour sur le tableau de bord. */
const cache = new Map<string, boolean>();

export function peekDashboardPaymentMixEnabled(companyId: string): boolean | undefined {
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
 * Réglage entreprise « Détail des encaissements »
 * (`company_settings.dashboard_payment_mix_enabled`).
 *
 * **Désactivé par défaut.** Le tableau de bord reste alors exactement ce qu'il est :
 * des totaux globaux. Ouvert par le propriétaire, un volet repliable s'ajoute sous le
 * bandeau du jour et sous les tuiles de la période : il ventile l'argent encaissé par
 * moyen de paiement — espèces, Orange Money, Moov Money, Wave, carte, virement.
 *
 * Fermé par défaut parce que c'est une information de caisse sensible : elle dit
 * combien de liquide dort dans le tiroir. Le propriétaire décide s'il veut l'afficher.
 *
 * Aucune migration : `company_settings` est une table clé/valeur déjà en place, et la
 * ventilation est calculée à partir des paiements que le tableau de bord charge déjà.
 */
export async function fetchDashboardPaymentMixEnabled(
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

/** Propriétaire : affiche ou masque le détail des encaissements du tableau de bord. */
export async function setDashboardPaymentMixEnabled(
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
