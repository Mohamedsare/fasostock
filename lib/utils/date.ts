/**
 * Formatage des dates **à l'heure du pays d'exploitation**, jamais au fuseau du poste.
 *
 * Un PC client mal réglé (ex. Windows sur UTC+1 alors que le Burkina est en UTC+0)
 * ne doit décaler ni les listes, ni les tickets, ni les filtres. Tout passe par
 * `lib/utils/operation-datetime`.
 */
import {
  formatOperationDate,
  formatOperationDateTime,
  operationYmd,
} from "@/lib/utils/operation-datetime";

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatOperationDateTime(d);
}

/** `dd/MM/yyyy` à l'heure du pays. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatOperationDate(d);
}

/** `yyyy-MM-dd` au calendrier du pays (clé de filtre / de regroupement). */
export function toIsoDate(date: Date): string {
  return operationYmd(date);
}
