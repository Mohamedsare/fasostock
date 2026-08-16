"use client";

import { createClient } from "@/lib/supabase/client";

const KEY = "bulk_stock_entry_enabled";

/** Cache session : évite que les cases à cocher clignotent au retour sur la page Stock. */
const cache = new Map<string, boolean>();

export function peekBulkStockEntryEnabled(companyId: string): boolean | undefined {
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
 * Réglage entreprise « Remplir le stock en un clic »
 * (`company_settings.bulk_stock_entry_enabled`).
 *
 * **Désactivé par défaut.** La page Stock reste alors ce qu'elle est : on ajuste un
 * produit à la fois, en connaissance de cause. Ouvert par le propriétaire, une colonne
 * de cases à cocher apparaît, avec un bouton « Tout cocher » et une entrée de stock
 * appliquée d'un coup à toute la sélection.
 *
 * Fermé par défaut parce que le geste est irréversible en un clic : cocher 400 produits
 * et se tromper de quantité fausse tout le stock du magasin. Le propriétaire décide s'il
 * veut ce raccourci dans les mains de ses employés — le droit « Ajuster le stock » reste
 * exigé par-dessus.
 */
export async function fetchBulkStockEntryEnabled(companyId: string): Promise<boolean> {
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

/** Propriétaire : ouvre ou ferme la saisie groupée du stock pour l'entreprise. */
export async function setBulkStockEntryEnabled(
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
