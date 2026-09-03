"use client";

import { createClient } from "@/lib/supabase/client";

const KEY = "ai_cart_vision_enabled";

/** Cache session (évite un flash du bouton « Panier IA » à l'ouverture de la caisse). */
const cache = new Map<string, boolean>();

export function peekAiCartVisionEnabled(companyId: string): boolean | undefined {
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
 * Réglage entreprise « Panier IA (photo + discussion) »
 * (`company_settings.ai_cart_vision_enabled`). Fermé par défaut : la fonction envoie
 * la photo de la liste du client à un service externe, c'est au propriétaire — et à
 * lui seul — de décider si son commerce le fait.
 */
export async function fetchAiCartVisionEnabled(companyId: string): Promise<boolean> {
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

/** Propriétaire : active ou désactive le remplissage du panier par photo pour l'entreprise. */
export async function setAiCartVisionEnabled(companyId: string, enabled: boolean): Promise<void> {
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
