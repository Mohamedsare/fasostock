/**
 * Affichage des horodatages « sur le terrain » : les timestamps Supabase sont en UTC,
 * mais la caisse / la créance sont vécues dans le fuseau du commerce.
 *
 * Défaut : Burkina Faso (`Africa/Ouagadougou`, UTC+0, sans heure d’été).
 * Si le produit couvre d’autres pays, prévoir un paramètre entreprise (IANA) et le passer ici.
 */
export const DEFAULT_OPERATIONS_TIME_ZONE = "Africa/Ouagadougou";

function toValidDate(input: Date | string | number): Date | null {
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Ex. `02/05/2026 15:30` — listes, tableaux */
export function formatOperationDateTime(input: Date | string | number): string {
  const d = toValidDate(input);
  if (!d) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: DEFAULT_OPERATIONS_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Ex. `2 mai 2026, 15:30` — en-têtes / fiches */
export function formatOperationDateTimeMedium(input: Date | string | number): string {
  const d = toValidDate(input);
  if (!d) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: DEFAULT_OPERATIONS_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * Chaîne `yyyy-MM-dd` (filtre période) rendue au calendrier du pays d’activité.
 * Midi UTC évite les décalages de jour aux frontières (OK pour BF en UTC+0).
 */
export function formatOperationCalendarDayYmd(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: DEFAULT_OPERATIONS_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Date du jour « long » (ex. export Excel) dans le fuseau d’activité */
export function formatOperationNowDateFull(): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: DEFAULT_OPERATIONS_TIME_ZONE,
    dateStyle: "full",
  }).format(new Date());
}

/** Suffixe reçu type `yyMMdd-HHmmss` dans le fuseau d’activité */
export function formatOperationReceiptCompact(d: Date): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: DEFAULT_OPERATIONS_TIME_ZONE,
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${v("year")}${v("month")}${v("day")}-${v("hour")}${v("minute")}${v("second")}`;
}
