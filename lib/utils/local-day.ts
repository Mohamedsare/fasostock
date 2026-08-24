/**
 * Bornes de journée **au fuseau du pays d'exploitation** (pas celui du poste).
 *
 * Les colonnes `created_at` sont des `timestamptz` (UTC). Comparer une date
 * `"YYYY-MM-DD"` directement (`gte("created_at", "2026-07-03")`) revient à borner à
 * minuit UTC ; et se fier au fuseau du navigateur revient à faire dépendre les stats
 * « du jour » du réglage Windows du client — un poste sur UTC+1 sortait les ventes
 * d'un jour décalé. On borne donc explicitement sur la journée vécue au comptoir.
 *
 * Utilisable côté client **et** serveur : le résultat ne dépend plus du runtime.
 */
import {
  operationDayEndIso,
  operationDayStartIso,
  operationYmd,
} from "@/lib/utils/operation-datetime";

/** Instant UTC (ISO) du **début de journée** du pays pour `"YYYY-MM-DD"`. */
export function localDayStartIso(date: string): string {
  return operationDayStartIso(date);
}

/** Instant UTC (ISO) de la **fin de journée** du pays (23:59:59.999) pour `"YYYY-MM-DD"`. */
export function localDayEndIso(date: string): string {
  return operationDayEndIso(date);
}

/** Date `"YYYY-MM-DD"` du pays correspondant à un instant ISO/timestamptz. */
export function localDateFromIso(iso: string): string {
  return operationYmd(iso);
}
