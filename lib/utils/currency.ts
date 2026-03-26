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
 * Même montant que {@link formatCurrency}, avec espaces sécables pour que le texte
 * puisse se couper en plusieurs lignes dans les cartes étroites (POS, listes).
 * `Intl` utilise souvent U+00A0 / U+202F entre milliers et symbole — sans cela le prix déborde.
 */
export function formatCurrencyWrappable(value: number): string {
  return formatCurrency(value)
    .replace(/[\u00A0\u202F\u2007]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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