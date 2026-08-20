"use client";

import { createClient } from "@/lib/supabase/client";

const KEY = "packaging_price_per_piece_enabled";

/** Cache session : le libellé du champ prix ne doit pas changer sous les doigts. */
const cache = new Map<string, boolean>();

export function peekPackagingPricePerPiece(companyId: string): boolean | undefined {
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
 * Réglage entreprise « Prix du conditionnement à la pièce »
 * (`company_settings.packaging_price_per_piece_enabled`).
 *
 * **Désactivé par défaut** : le champ « Prix » d'un conditionnement demande alors le
 * prix du LOT ENTIER (35 000 pour un carton de 10), qui est aussi ce que la base
 * stocke depuis la migration 00129.
 *
 * Activé, le champ demande le prix D'UNE PIÈCE prise dans le lot (3 500), et
 * l'application multiplie par le nombre de pièces avant d'enregistrer. C'est la façon
 * dont beaucoup de commerçants annoncent réellement leur prix de gros — « le carton,
 * c'est 3 500 la pièce » — et c'est la confusion qui a déjà fait saisir des cartons
 * moins chers qu'une pièce.
 *
 * **Ce réglage ne change QUE la saisie.** La colonne `product_packagings.price` reste
 * le prix du lot entier : la caisse, les tickets, l'app Flutter et les données
 * existantes ne bougent pas, quel que soit l'état du réglage.
 */
export async function fetchPackagingPricePerPiece(companyId: string): Promise<boolean> {
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

/** Propriétaire : bascule la saisie du prix de conditionnement (lot entier ↔ pièce). */
export async function setPackagingPricePerPiece(
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
