import { formatCurrency } from "@/lib/utils/currency";

/**
 * Un coût de revient tombe rarement juste : 1 402,37 F. Arrondir à l'affichage
 * ferait douter du total (les colonnes ne s'additionneraient plus). On garde donc
 * les décimales tant qu'elles existent, et on les cache quand il n'y en a pas.
 */
export function formatCost(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  if (Math.abs(n - Math.round(n)) < 0.005) return formatCurrency(Math.round(n));
  // `Intl` fr-FR sépare les milliers par U+202F / U+00A0, absents des sous-ensembles
  // de police chargés : `\s` les couvre tous, on les ramène à une espace ordinaire
  // (même correctif que `currency.ts`).
  return `${new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(n)
    .replace(/\s/g, " ")} F CFA`;
}

/** Quantité : « 12 » et non « 12,000 », mais « 2,5 » reste « 2,5 ». */
export function formatQuantity(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(n);
}

export function formatPercent(value: number, digits = 1): string {
  const n = Number.isFinite(value) ? value : 0;
  return `${new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(n)} %`;
}

/** Variation entre deux prix, signée — `null` si l'ancien prix est inconnu. */
export function variationPercent(before: number, after: number): number | null {
  if (!Number.isFinite(before) || before <= 0) return null;
  return ((after - before) / before) * 100;
}

/** `2026-08-07` → `07/08/2026`. Les dates arrivent en ISO, jamais en local. */
export function formatDateFr(iso: string | null): string {
  if (!iso) return "—";
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return "—";
  return `${day}/${m}/${y}`;
}

/** Saisie tolérante : « 1 250,50 » comme « 1250.5 ». */
export function parseAmount(input: string): number {
  const n = Number(String(input).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
