"use client";

import { createClient } from "@/lib/supabase/client";

const KEY = "sale_pickup_tracking_enabled";

/** Cache session (évite que l'icône « à retirer » clignote à l'ouverture de Ventes). */
const cache = new Map<string, boolean>();

export function peekSalePickupTrackingEnabled(companyId: string): boolean | undefined {
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
 * Réglage entreprise « Marchandise payée non emportée »
 * (`company_settings.sale_pickup_tracking_enabled`).
 *
 * **Désactivé par défaut**, pour tout le monde : la majorité des commerces remettent la
 * marchandise sur-le-champ, et une icône de plus dans la liste des ventes serait, pour
 * eux, une question sans objet. Le propriétaire l'ouvre dans Paramètres.
 */
export async function fetchSalePickupTrackingEnabled(companyId: string): Promise<boolean> {
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

/** Propriétaire : ouvre ou ferme le suivi des retraits pour l'entreprise. */
export async function setSalePickupTrackingEnabled(
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
