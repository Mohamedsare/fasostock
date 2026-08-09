/**
 * Devises proposées au propriétaire (Paramètres › Devise).
 *
 * **Toutes sans décimales, et ce n'est pas un hasard.** Le calcul monétaire de
 * l'application arrondit à l'unité d'un bout à l'autre (près d'une centaine de
 * `Math.round` / `Math.trunc` : totaux, remises, marges, valorisation du stock,
 * montant en toutes lettres). Ouvrir la porte à une devise à décimales — dollar,
 * euro, cedi, naira — n'est donc pas un ajout de symbole : il faudrait revoir tout
 * ce calcul, sur des documents qui engagent le commerçant (factures, reçus).
 *
 * Le périmètre retenu couvre l'essentiel du marché visé : UEMOA, CEMAC et voisins.
 * Ajouter une devise à décimales demandera d'abord de traiter les arrondis — d'où
 * le champ `decimals`, déjà présent pour que ce jour-là rien ne soit à deviner.
 */
export type CurrencyDef = {
  /** Code ISO 4217. */
  code: string;
  /** Symbole imprimé sur tickets et factures. */
  symbol: string;
  /** Nom affiché dans le sélecteur. */
  label: string;
  /** Pays d'usage — aide le propriétaire à reconnaître la sienne. */
  countries: string;
  /** Toujours 0 ici : voir l'avertissement ci-dessus avant d'ajouter autre chose. */
  decimals: 0;
};

export const SUPPORTED_CURRENCIES: readonly CurrencyDef[] = [
  {
    code: "XOF",
    symbol: "FCFA",
    label: "Franc CFA (UEMOA)",
    countries: "Burkina Faso, Sénégal, Mali, Côte d'Ivoire, Bénin, Togo, Niger, Guinée-Bissau",
    decimals: 0,
  },
  {
    code: "XAF",
    symbol: "FCFA",
    label: "Franc CFA (CEMAC)",
    countries: "Cameroun, Tchad, Gabon, Congo, Centrafrique, Guinée équatoriale",
    decimals: 0,
  },
  {
    code: "GNF",
    symbol: "GNF",
    label: "Franc guinéen",
    countries: "Guinée",
    decimals: 0,
  },
  {
    /*
     * ISO 4217 prévoit 2 décimales pour le franc congolais, mais les centimes n'ont
     * plus cours dans la pratique commerciale : les prix s'affichent en francs entiers.
     * On le traite donc comme une devise sans décimales, cohérent avec l'usage réel.
     */
    code: "CDF",
    symbol: "FC",
    label: "Franc congolais",
    countries: "République démocratique du Congo",
    decimals: 0,
  },
  {
    code: "RWF",
    symbol: "FRw",
    label: "Franc rwandais",
    countries: "Rwanda",
    decimals: 0,
  },
  {
    code: "BIF",
    symbol: "FBu",
    label: "Franc burundais",
    countries: "Burundi",
    decimals: 0,
  },
  {
    code: "KMF",
    symbol: "FC",
    label: "Franc comorien",
    countries: "Comores",
    decimals: 0,
  },
  {
    code: "DJF",
    symbol: "Fdj",
    label: "Franc djiboutien",
    countries: "Djibouti",
    decimals: 0,
  },
] as const;

/** Devise par défaut — celle de l'immense majorité du parc installé. */
export const DEFAULT_CURRENCY_CODE = "XOF";

const BY_CODE = new Map(SUPPORTED_CURRENCIES.map((c) => [c.code, c]));

export function isSupportedCurrency(code: string): boolean {
  return BY_CODE.has(code.trim().toUpperCase());
}

/**
 * Devise correspondant au code, ou celle par défaut.
 *
 * Ne lève jamais : un code inconnu en base (devise retirée, saisie manuelle) doit
 * dégrader vers le franc CFA plutôt que casser l'affichage d'une facture.
 */
export function currencyOf(code: string | null | undefined): CurrencyDef {
  const found = BY_CODE.get(String(code ?? "").trim().toUpperCase());
  return found ?? BY_CODE.get(DEFAULT_CURRENCY_CODE)!;
}

/** Symbole seul — utilisé par les formateurs client et serveur. */
export function currencySymbolOf(code: string | null | undefined): string {
  return currencyOf(code).symbol;
}
