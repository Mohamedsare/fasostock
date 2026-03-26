/** Intl `fr-FR` peut utiliser U+202F comme séparateur de milliers — absent des subsets Noto latin (woff2). */
function sanitizeIntlNumberPart(s: string): string {
  return s.replace(/[\u2000-\u206F\u00A0]/g, " ").replace(/\s+/g, " ").trim();
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "XOF",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

/**
 * Équivalent strict de `format_currency.dart` Flutter :
 * `NumberFormat.currency(locale: 'fr_FR', symbol: 'FCFA', decimalDigits: 0)`.
 * Utiliser pour tickets thermiques et factures PDF (parité avec l’app mobile).
 */
export function formatCurrencyFlutter(value: number): string {
  const n = Math.round(Number.isFinite(value) ? value : 0);
  const numPart = sanitizeIntlNumberPart(
    new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n),
  );
  return `${numPart}\u00A0FCFA`;
}

export function toNumber(input: string): number {
  const n = Number(input.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}