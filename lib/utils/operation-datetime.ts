/**
 * Affichage des horodatages « sur le terrain » : les timestamps Supabase sont en UTC,
 * mais la caisse / la créance sont vécues dans le fuseau du commerce.
 *
 * **Le fuseau vient de l'entreprise, jamais du poste.** Le propriétaire le choisit une
 * fois (Paramètres › Fuseau horaire) ; il vaut pour tous les caissiers, quel que soit
 * le réglage Windows de chaque PC. Se fier au navigateur laissait un poste mal réglé
 * décaler l'heure imprimée sur les tickets et ranger des ventes dans le mauvais jour.
 *
 * Défaut : Burkina Faso (`Africa/Ouagadougou`, UTC+0), tant qu'aucun choix n'est fait.
 */
import { DEFAULT_TIME_ZONE, isSupportedTimeZone } from "@/lib/config/timezones";

export const DEFAULT_OPERATIONS_TIME_ZONE = DEFAULT_TIME_ZONE;

/**
 * Fuseau de l'entreprise ouverte dans **ce navigateur**.
 *
 * État de module, et non contexte React — même raison que `activeCurrencyCode` dans
 * `lib/utils/currency.ts` : les horodatages s'affichent aussi hors composants (exports,
 * tickets, calculs), un hook imposerait une réécriture massive pour rien.
 *
 * **Jamais renseigné côté serveur.** Le rendu serveur est partagé entre requêtes : y
 * stocker un fuseau ferait imprimer l'heure de l'entreprise A sur la facture de
 * l'entreprise B. `setActiveTimeZone` est donc inopérant hors navigateur, et le code
 * serveur (PDF, e-mails) passe le fuseau **explicitement**.
 */
let activeTimeZone: string = DEFAULT_TIME_ZONE;

/** Appelé au chargement du contexte entreprise. Sans effet côté serveur — voir ci-dessus. */
export function setActiveTimeZone(id: string | null | undefined): void {
  if (typeof window === "undefined") return;
  const tz = String(id ?? "").trim();
  activeTimeZone = isSupportedTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;
}

/** Fuseau courant du navigateur. Toujours le fuseau par défaut côté serveur. */
export function getActiveTimeZone(): string {
  return activeTimeZone;
}

/**
 * Fuseau à appliquer pour un rendu donné.
 * `explicit` est **obligatoire côté serveur**, où l'état de module vaut toujours le défaut.
 */
function tzOf(explicit?: string | null): string {
  const tz = String(explicit ?? "").trim();
  return tz && isSupportedTimeZone(tz) ? tz : activeTimeZone;
}

/**
 * @deprecated Constante figée — ne l'utilisez pas pour un nouvel affichage.
 * Elle rend l'heure du Burkina quelle que soit l'entreprise. Utilisez
 * `getActiveTimeZone()` côté navigateur, ou passez le fuseau en argument côté serveur.
 */
export const OPERATIONS_TIME_ZONE = DEFAULT_TIME_ZONE;

function toValidDate(input: Date | string | number): Date | null {
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Chaque fonction accepte un `timeZone` explicite en dernier argument.
 * Omis, c'est le fuseau de l'entreprise ouverte dans ce navigateur ; côté serveur,
 * il est **obligatoire** (sinon le fuseau par défaut s'applique — voir `tzOf`).
 */

/** Ex. `02/05/2026 15:30` — listes, tableaux */
export function formatOperationDateTime(
  input: Date | string | number,
  timeZone?: string | null,
): string {
  const d = toValidDate(input);
  if (!d) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: tzOf(timeZone),
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Ex. `2 mai 2026, 15:30` — en-têtes / fiches */
export function formatOperationDateTimeMedium(
  input: Date | string | number,
  timeZone?: string | null,
): string {
  const d = toValidDate(input);
  if (!d) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: tzOf(timeZone),
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * Chaîne `yyyy-MM-dd` (filtre période) rendue au calendrier du pays d'activité.
 * Midi UTC évite les décalages de jour aux frontières pour toute la plage UTC-11..+12.
 */
export function formatOperationCalendarDayYmd(ymd: string, timeZone?: string | null): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: tzOf(timeZone),
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Date du jour « long » (ex. export Excel) dans le fuseau d'activité */
export function formatOperationNowDateFull(timeZone?: string | null): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: tzOf(timeZone),
    dateStyle: "full",
  }).format(new Date());
}

/** Suffixe reçu type `yyMMdd-HHmmss` dans le fuseau d'activité */
export function formatOperationReceiptCompact(d: Date, timeZone?: string | null): string {
  const p = operationParts(d, timeZone);
  if (!p) return "000000-000000";
  return `${p.year.slice(2)}${p.month}${p.day}-${p.hour}${p.minute}${p.second}`;
}

/** Champs date/heure d'un instant, lus au fuseau d'activité. */
export function operationParts(
  input: Date | string | number,
  timeZone?: string | null,
): {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
} | null {
  const d = toValidDate(input);
  if (!d) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tzOf(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const v = (t: string) => parts.find((x) => x.type === t)?.value ?? "00";
  // `hour12: false` peut rendre "24" pour minuit selon le moteur.
  const hour = v("hour") === "24" ? "00" : v("hour");
  return {
    year: v("year"),
    month: v("month"),
    day: v("day"),
    hour,
    minute: v("minute"),
    second: v("second"),
  };
}

/** Ex. `24/08/2026` */
export function formatOperationDate(input: Date | string | number, timeZone?: string | null): string {
  const p = operationParts(input, timeZone);
  return p ? `${p.day}/${p.month}/${p.year}` : "—";
}

/** Ex. `15:43` */
export function formatOperationTime(input: Date | string | number, timeZone?: string | null): string {
  const p = operationParts(input, timeZone);
  return p ? `${p.hour}:${p.minute}` : "—";
}

/** Ex. `15:43:07` — horloge de l'en-tête */
export function formatOperationTimeWithSeconds(
  input: Date | string | number,
  timeZone?: string | null,
): string {
  const p = operationParts(input, timeZone);
  return p ? `${p.hour}:${p.minute}:${p.second}` : "—";
}

/** `yyyy-MM-dd` d'un instant, au calendrier d'activité (clé de regroupement, filtres). */
export function operationYmd(input: Date | string | number, timeZone?: string | null): string {
  const p = operationParts(input, timeZone);
  if (!p) return typeof input === "string" ? input.slice(0, 10) : "";
  return `${p.year}-${p.month}-${p.day}`;
}

/** `yyyy-MM-dd` du jour courant au fuseau d'activité. */
export function operationTodayYmd(timeZone?: string | null): string {
  return operationYmd(new Date(), timeZone);
}

/** Décalage du fuseau d'activité (en minutes) à un instant donné. */
function operationOffsetMinutes(at: Date, timeZone?: string | null): number {
  const p = operationParts(at, timeZone);
  if (!p) return 0;
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return Math.round((asUtc - at.getTime()) / 60000);
}

/**
 * Instant réel (ISO UTC) d'une heure murale du pays.
 * Double passe : le décalage est relu à l'instant estimé — indispensable dès qu'un
 * fuseau à heure d'été est choisi (Maroc, Égypte, France).
 */
export function operationWallClockIso(
  ymd: string,
  h = 0,
  min = 0,
  s = 0,
  ms = 0,
  timeZone?: string | null,
): string | null {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const naive = Date.UTC(y, m - 1, d, h, min, s, ms);
  let guess = new Date(naive - operationOffsetMinutes(new Date(naive), timeZone) * 60000);
  guess = new Date(naive - operationOffsetMinutes(guess, timeZone) * 60000);
  return guess.toISOString();
}

/** Début de journée d'activité (ISO UTC) pour `yyyy-MM-dd`. */
export function operationDayStartIso(ymd: string, timeZone?: string | null): string {
  return operationWallClockIso(ymd, 0, 0, 0, 0, timeZone) ?? ymd;
}

/** Fin de journée d'activité (ISO UTC, 23:59:59.999) pour `yyyy-MM-dd`. */
export function operationDayEndIso(ymd: string, timeZone?: string | null): string {
  return operationWallClockIso(ymd, 23, 59, 59, 999, timeZone) ?? ymd;
}

/** Nombre de jours calendaires entre deux `yyyy-MM-dd` (b - a). */
export function operationCalendarDaysBetween(aYmd: string, bYmd: string): number {
  const [ay, am, ad] = aYmd.slice(0, 10).split("-").map(Number);
  const [by, bm, bd] = bYmd.slice(0, 10).split("-").map(Number);
  if (!ay || !by) return 0;
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

/** L'instant tombe-t-il aujourd'hui, au calendrier d'activité ? */
export function isOperationToday(input: Date | string | number, timeZone?: string | null): boolean {
  return operationYmd(input, timeZone) === operationTodayYmd(timeZone);
}

/** L'instant tombe-t-il hier, au calendrier d'activité ? */
export function isOperationYesterday(
  input: Date | string | number,
  timeZone?: string | null,
): boolean {
  return (
    operationCalendarDaysBetween(operationYmd(input, timeZone), operationTodayYmd(timeZone)) === 1
  );
}
