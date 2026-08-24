import { DEFAULT_TIME_ZONE, isSupportedTimeZone } from "@/lib/config/timezones";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fuseau horaire à appliquer au rendu serveur (PDF, notifications).
 *
 * Le rendu serveur tourne en UTC et est partagé entre requêtes : il ne peut pas
 * s'appuyer sur l'état de module du navigateur (`getActiveTimeZone`). Le fuseau est
 * donc relu en base, à chaque rendu, depuis l'entreprise de l'appelant.
 *
 * Volontairement **pas** transmis par le navigateur : l'heure imprimée sur une facture
 * engage le commerçant, elle ne doit pas dépendre de ce que le client envoie.
 *
 * Ne lève jamais : migration 00206 pas encore appliquée, réseau, session expirée — on
 * retombe sur le fuseau par défaut. Un document daté à l'heure d'Ouagadougou vaut mieux
 * qu'une impression en échec.
 */
export async function resolveServerTimeZone(supabase: SupabaseClient): Promise<string> {
  try {
    const { data, error } = await supabase.rpc("my_company_timezone");
    if (error) return DEFAULT_TIME_ZONE;
    const tz = String(data ?? "").trim();
    return isSupportedTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** Même lecture, pour une entreprise connue (traitements planifiés, e-mails). */
export async function resolveCompanyTimeZone(
  supabase: SupabaseClient,
  companyId: string,
): Promise<string> {
  try {
    const { data, error } = await supabase.rpc("company_timezone", {
      p_company_id: companyId,
    });
    if (error) return DEFAULT_TIME_ZONE;
    const tz = String(data ?? "").trim();
    return isSupportedTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}
