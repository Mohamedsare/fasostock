/**
 * Bornes de journée **au fuseau local du runtime** (navigateur = fuseau de l'utilisateur).
 *
 * Les colonnes `created_at` sont des `timestamptz` (UTC). Comparer une date locale
 * `"YYYY-MM-DD"` directement (`gte("created_at", "2026-07-03")`) revient à borner à
 * **minuit UTC**, ce qui décale les stats « du jour » pour tout utilisateur hors UTC+0
 * (ex. Maroc UTC+1 : une vente faite à 00:30 locale = 23:30 UTC la veille était exclue).
 *
 * ⚠️ Réservé au code client (`"use client"`). Côté serveur (Node = UTC) ces helpers
 * renverraient des bornes UTC — inutiles pour refléter le fuseau de l'utilisateur.
 */

/**
 * Découpe `"YYYY-MM-DD"` (tolère un ISO complet `"YYYY-MM-DDTHH:…"` → prend la partie date).
 * Renvoie `null` si la date est invalide.
 */
function parseYmd(date: string): [number, number, number] | null {
  const [y, m, d] = date.slice(0, 10).split("-").map((v) => Number(v));
  if (!y || !m || !d || Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) {
    return null;
  }
  return [y, m, d];
}

/** Instant UTC (ISO) du **début de journée locale** pour `"YYYY-MM-DD"`. */
export function localDayStartIso(date: string): string {
  const ymd = parseYmd(date);
  if (!ymd) return date;
  return new Date(ymd[0], ymd[1] - 1, ymd[2], 0, 0, 0, 0).toISOString();
}

/** Instant UTC (ISO) de la **fin de journée locale** (23:59:59.999) pour `"YYYY-MM-DD"`. */
export function localDayEndIso(date: string): string {
  const ymd = parseYmd(date);
  if (!ymd) return date;
  return new Date(ymd[0], ymd[1] - 1, ymd[2], 23, 59, 59, 999).toISOString();
}

/** Date **locale** `"YYYY-MM-DD"` correspondant à un instant ISO/timestamptz. */
export function localDateFromIso(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso.slice(0, 10);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
