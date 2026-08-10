/**
 * Période affichée sur la page Dépenses — partagé par le mode standard et le mode
 * « Personnaliser mes dépenses », pour que les deux écrans comptent la même chose.
 */

export type ExpensePeriod = "this_month" | "last_month" | "this_year" | "all";

export const PERIODS: { key: ExpensePeriod; label: string }[] = [
  { key: "this_month", label: "Ce mois" },
  { key: "last_month", label: "Mois préc." },
  { key: "this_year", label: "Cette année" },
  { key: "all", label: "Tout" },
];

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function periodRange(period: ExpensePeriod): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (period) {
    case "this_month":
      return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
    case "last_month":
      return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case "this_year":
      return { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) };
    case "all":
    default:
      return { from: "2000-01-01", to: "2999-12-31" };
  }
}

export function formatDmy(isoDate: string): string {
  const [yy, mm, dd] = isoDate.split("-");
  if (!yy || !mm || !dd) return isoDate;
  return `${dd}/${mm}/${yy}`;
}
