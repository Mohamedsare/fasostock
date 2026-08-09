import { currencySymbolOf, DEFAULT_CURRENCY_CODE } from "@/lib/config/currencies";

/** Intl `fr-FR` peut utiliser U+202F comme séparateur de milliers — absent des subsets Noto latin (woff2). */
function sanitizeIntlNumberPart(s: string): string {
  return s.replace(/[\u2000-\u206F\u00A0]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Devise de l'entreprise ouverte dans **ce navigateur**.
 *
 * Volontairement un état de module, et non un contexte React : plus de six cents appels
 * à `formatCurrency` existent dans l'application, dont beaucoup hors composants (calculs,
 * exports, libellés). Les convertir en hook coûterait une réécriture massive pour un
 * bénéfice nul.
 *
 * **Cet état ne doit jamais être renseigné côté serveur.** Le rendu serveur est partagé
 * entre requêtes : y stocker une devise ferait apparaître celle de l'entreprise A sur la
 * facture de l'entreprise B. `setActiveCurrency` est donc inopérant hors navigateur, et
 * le code serveur (PDF, e-mails) passe la devise **explicitement** en argument.
 */
let activeCurrencyCode: string = DEFAULT_CURRENCY_CODE;

/** Appelé au chargement du contexte entreprise. Sans effet côté serveur — voir ci-dessus. */
export function setActiveCurrency(code: string | null | undefined): void {
  if (typeof window === "undefined") return;
  activeCurrencyCode = String(code ?? "").trim().toUpperCase() || DEFAULT_CURRENCY_CODE;
}

/** Devise courante du navigateur. Toujours la devise par défaut côté serveur. */
export function getActiveCurrency(): string {
  return activeCurrencyCode;
}

/**
 * Montant formaté dans la devise de l'entreprise.
 *
 * `currencyCode` explicite : **obligatoire côté serveur** (PDF, e-mails), où l'état de
 * module vaut toujours la devise par défaut.
 */
export function formatCurrency(value: number, currencyCode?: string | null): string {
  const code = currencyCode ?? activeCurrencyCode;
  const n = Math.round(Number.isFinite(value) ? value : 0);
  /*
   * `Intl` en `style: "currency"` place le symbole selon ses propres règles et ignore
   * un symbole maison (« FCFA », « FRw »…). On formate donc le nombre seul, puis on
   * accole le symbole — rendu identique pour toutes les devises de la liste, qui sont
   * toutes sans décimales.
   */
  const numPart = sanitizeIntlNumberPart(
    new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n),
  );
  return `${numPart} ${currencySymbolOf(code)}`;
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
export function formatCurrencyFlutter(value: number, currencyCode?: string | null): string {
  const n = Math.round(Number.isFinite(value) ? value : 0);
  const numPart = sanitizeIntlNumberPart(
    new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n),
  );
  // Espace ins\u00E9cable : le symbole ne doit jamais passer \u00E0 la ligne seul sur un ticket.
  return `${numPart}\u00A0${currencySymbolOf(currencyCode ?? activeCurrencyCode)}`;
}

export function toNumber(input: string): number {
  const n = Number(input.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}