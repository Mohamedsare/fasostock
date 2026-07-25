/**
 * Vocabulaire du module « Achats Progressifs » selon l'activité de l'entreprise.
 *
 * Le module vaut pour TOUS les métiers : un client peut épargner petit à petit
 * pour une moto, un téléviseur, un salon, un groupe électrogène, un lot de
 * matériaux… Seuls les libellés changent — la mécanique est identique.
 */
export type ProgressiveTerms = {
  /** « engin » / « article » — minuscule, singulier. */
  singular: string;
  /** « engins » / « articles » — minuscule, pluriel. */
  plural: string;
  /** « Engin » / « Article » — capitale, singulier. */
  singularCap: string;
  /** « Engins » / « Articles » — capitale, pluriel. */
  pluralCap: string;
  /** Statut d'un dossier converti : « Engin remis » / « Article remis ». */
  handedOverStatus: string;
  /** Action de conversion : « Remettre l'engin » / « Remettre l'article ». */
  handOverAction: string;
  /** Article contracté pour les phrases : « l'engin » / « l'article » / « le produit ». */
  theSingular: string;
  /** Complément du nom : « de l'engin » / « de l'article » / « du produit ». */
  ofSingular: string;
};

const ENGINE_TERMS: ProgressiveTerms = {
  singular: "engin",
  plural: "engins",
  singularCap: "Engin",
  pluralCap: "Engins",
  handedOverStatus: "Engin remis",
  handOverAction: "Remettre l'engin",
  theSingular: "l'engin",
  ofSingular: "de l'engin",
};

const GENERIC_TERMS: ProgressiveTerms = {
  singular: "article",
  plural: "articles",
  singularCap: "Article",
  pluralCap: "Articles",
  handedOverStatus: "Article remis",
  handOverAction: "Remettre l'article",
  theSingular: "l'article",
  ofSingular: "de l'article",
};

const PRODUCT_TERMS: ProgressiveTerms = {
  singular: "produit",
  plural: "produits",
  singularCap: "Produit",
  pluralCap: "Produits",
  handedOverStatus: "Produit remis",
  handOverAction: "Remettre le produit",
  theSingular: "le produit",
  ofSingular: "du produit",
};

/** Libellés de statut adaptés au métier (le statut « converti » varie). */
export function progressiveStatusLabels(
  businessTypeSlug: string | null | undefined,
): Record<"open" | "converted" | "cancelled", string> {
  return {
    open: "En cours",
    converted: progressiveTerms(businessTypeSlug).handedOverStatus,
    cancelled: "Annulé",
  };
}

export function progressiveTerms(
  businessTypeSlug: string | null | undefined,
): ProgressiveTerms {
  switch (businessTypeSlug) {
    case "vente-engins":
      return ENGINE_TERMS;
    case "pharmacie":
    case "supermarche-alimentation":
    case "restaurant-fast-food":
      return PRODUCT_TERMS;
    default:
      return GENERIC_TERMS;
  }
}
