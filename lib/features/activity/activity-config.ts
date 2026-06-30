/**
 * Registre de configuration **métier** par type d'activité (`business_type_slug`).
 *
 * Étend (sans le remplacer) `activity-profiles.ts` qui gère déjà le vocabulaire de
 * navigation et les titres d'écran. Ici on décrit les **fonctionnalités** : champs de
 * formulaire spécifiques, suivi lots/péremption, widgets de tableau de bord…
 *
 * Principe : 100 % additif et piloté par le slug. Tout métier non listé retombe sur
 * `DEFAULT_ACTIVITY_CONFIG` → comportement historique strictement inchangé.
 */

/** Un champ produit additionnel propre à un métier (ex. DCI pour la pharmacie). */
export type ActivityProductField = {
  /** Clé stable = colonne SQL (snake_case) ajoutée par migration additive. */
  key:
    | "dci"
    | "dosage_form"
    | "therapeutic_class"
    | "laboratory"
    | "prescription_required"
    | "storage_conditions";
  label: string;
  /** Aide courte sous le champ (optionnel). */
  hint?: string;
  /** `text` = saisie libre ; `bool` = case à cocher. */
  type: "text" | "bool";
  /** Affiché côté formulaire sur une demi-largeur quand possible. */
  half?: boolean;
};

export type ActivityConfig = {
  slug: string;
  /** Champs produit additionnels (section dédiée dans le formulaire produit). */
  productFields: ActivityProductField[];
  /** Titre de la section regroupant `productFields` dans le formulaire. */
  productFieldsSectionTitle?: string;
  /** Suivi des lots + dates de péremption (table `product_batches`). */
  batchTracking: boolean;
  /** Le code-barres a-t-il du sens pour ce métier (sinon champ masqué par défaut). */
  showBarcodeField: boolean;
  /** Bloc d'alertes de péremption sur le tableau de bord. */
  expiryDashboard: boolean;
  /**
   * Suivi des « ventes sur ordonnance » dans la carte rapports (pharmacie).
   * Distinct de `expiryDashboard` : un supermarché suit la péremption sans
   * notion d'ordonnance.
   */
  prescriptionReports: boolean;
};

const DEFAULT_ACTIVITY_CONFIG: ActivityConfig = {
  slug: "__default__",
  productFields: [],
  batchTracking: false,
  showBarcodeField: true,
  expiryDashboard: false,
  prescriptionReports: false,
};

const PHARMACY_CONFIG: ActivityConfig = {
  slug: "pharmacie",
  productFieldsSectionTitle: "Informations médicament",
  productFields: [
    {
      key: "dci",
      label: "DCI / Molécule",
      hint: "Dénomination commune internationale (ex. Paracétamol)",
      type: "text",
    },
    {
      key: "dosage_form",
      label: "Forme & dosage",
      hint: "Ex. Comprimé 500 mg, Sirop 125 mg/5 ml",
      type: "text",
      half: true,
    },
    {
      key: "therapeutic_class",
      label: "Classe thérapeutique",
      hint: "Ex. Antalgique, Antibiotique",
      type: "text",
      half: true,
    },
    {
      key: "laboratory",
      label: "Laboratoire",
      hint: "Fabricant / titulaire de l'AMM",
      type: "text",
    },
    {
      key: "storage_conditions",
      label: "Conditions de conservation",
      hint: "Ex. À conserver < 25 °C, à l'abri de la lumière",
      type: "text",
    },
    {
      key: "prescription_required",
      label: "Délivrance sur ordonnance",
      type: "bool",
    },
  ],
  batchTracking: true,
  // Code-barres peu utilisé au comptoir d'officine → champ masqué (comme le menu).
  showBarcodeField: false,
  expiryDashboard: true,
  prescriptionReports: true,
};

const SUPERMARKET_CONFIG: ActivityConfig = {
  slug: "supermarche-alimentation",
  // Pas de champ produit additionnel (réutilise le formulaire générique).
  productFields: [],
  // Frais / DLC : on réutilise tel quel le suivi de lots et l'alerte de
  // péremption déjà éprouvés en pharmacie (table `product_batches`).
  batchTracking: true,
  // Code-barres central en grande distribution (douchette caisse).
  showBarcodeField: true,
  expiryDashboard: true,
  // Pas de notion d'ordonnance en alimentation.
  prescriptionReports: false,
};

const CONFIGS: Record<string, ActivityConfig> = {
  [PHARMACY_CONFIG.slug]: PHARMACY_CONFIG,
  [SUPERMARKET_CONFIG.slug]: SUPERMARKET_CONFIG,
};

/** Config métier effective pour un slug (jamais `null` — fallback défaut). */
export function activityConfig(
  businessTypeSlug: string | null | undefined,
): ActivityConfig {
  if (!businessTypeSlug) return DEFAULT_ACTIVITY_CONFIG;
  return CONFIGS[businessTypeSlug] ?? DEFAULT_ACTIVITY_CONFIG;
}

/** Raccourci : ce métier gère-t-il des champs produit spécifiques ? */
export function hasActivityProductFields(
  businessTypeSlug: string | null | undefined,
): boolean {
  return activityConfig(businessTypeSlug).productFields.length > 0;
}
