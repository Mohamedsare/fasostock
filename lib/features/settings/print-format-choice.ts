"use client";

import { createClient } from "@/lib/supabase/client";

const KEY = "print_format_choice_enabled";

/** Cache session (évite que le bouton du second format clignote après une vente). */
const cache = new Map<string, boolean>();

export function peekPrintFormatChoiceEnabled(companyId: string): boolean | undefined {
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
 * Réglage entreprise « Choisir le format d'impression »
 * (`company_settings.print_format_choice_enabled`).
 *
 * **Désactivé par défaut**, pour tout le monde : par défaut le document suit la caisse
 * utilisée — ticket thermique en caisse rapide, facture A4 en POS Facture. C'est ce que
 * font déjà tous les clients, et un bouton de plus après chaque vente serait, pour eux,
 * une question sans objet.
 *
 * Ouvert par le propriétaire dans Paramètres, chaque vente peut être sortie dans
 * **l'autre** format sans rien changer à la façon de vendre : le client de la caisse
 * rapide qui réclame une facture A4 l'obtient au comptoir, et la facture A4 peut être
 * doublée d'un ticket thermique pour la caisse.
 */
export async function fetchPrintFormatChoiceEnabled(companyId: string): Promise<boolean> {
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

/** Propriétaire : ouvre ou ferme le choix du format d'impression pour l'entreprise. */
export async function setPrintFormatChoiceEnabled(
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
