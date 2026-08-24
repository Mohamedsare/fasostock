"use client";

import { DEFAULT_TIME_ZONE, isSupportedTimeZone } from "@/lib/config/timezones";
import { createClient } from "@/lib/supabase/client";
import { setActiveTimeZone } from "@/lib/utils/operation-datetime";

const KEY = "timezone";

/** Cache session : évite d'afficher une heure au mauvais fuseau le temps d'un aller-retour. */
const cache = new Map<string, string>();

export function peekCompanyTimeZone(companyId: string): string | undefined {
  return cache.get(companyId);
}

function parseValue(raw: unknown): string {
  const id = (typeof raw === "string" ? raw : String(raw ?? "")).trim();
  // Un fuseau inconnu (retiré de la liste, écrit à la main) ne doit pas casser l'heure
  // d'un ticket : on retombe sur le fuseau par défaut.
  return isSupportedTimeZone(id) ? id : DEFAULT_TIME_ZONE;
}

/**
 * Fuseau horaire de l'entreprise (`company_settings.timezone`).
 *
 * Met à jour au passage le fuseau actif du navigateur : tous les horodatages affichés
 * en découlent, sans qu'aucun appelant n'ait à le connaître.
 */
export async function fetchCompanyTimeZone(companyId: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("company_settings")
    .select("value")
    .eq("company_id", companyId)
    .eq("key", KEY)
    .maybeSingle();
  if (error) throw error;
  const row = data as { value?: unknown } | null;
  const id = row == null ? DEFAULT_TIME_ZONE : parseValue(row.value);
  cache.set(companyId, id);
  setActiveTimeZone(id);
  return id;
}

/**
 * Propriétaire : choisit le fuseau horaire de son commerce.
 *
 * Passe par une fonction serveur qui revalide le rôle — l'écran ne fait que refléter
 * la règle, il ne la garantit pas.
 *
 * Contrairement à la devise, aucun verrou : le fuseau ne change que l'**affichage**.
 * Les horodatages restent stockés en UTC, donc corriger un fuseau mal choisi remet
 * simplement l'historique à la bonne heure, sans rien réinterpréter de travers.
 */
export async function setCompanyTimeZone(companyId: string, id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_company_timezone", {
    p_company_id: companyId,
    p_timezone: id,
  });
  if (error) throw error;
  cache.set(companyId, id);
  setActiveTimeZone(id);
}
