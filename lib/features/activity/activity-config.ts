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

/**
 * Clés de champs stockées dans des **colonnes SQL dédiées** (pharmacie, migration 00115).
 * Toutes les autres clés vivent dans `products.activity_attributes` (JSONB, migration 00189) :
 * un nouveau métier n'exige donc plus de migration de schéma.
 */
const COLUMN_BACKED_FIELD_KEYS = new Set([
  "dci",
  "dosage_form",
  "therapeutic_class",
  "laboratory",
  "prescription_required",
  "storage_conditions",
]);

export function isColumnBackedActivityFieldKey(key: string): boolean {
  return COLUMN_BACKED_FIELD_KEYS.has(key);
}

/** Un champ produit additionnel propre à un métier (ex. DCI pour la pharmacie). */
export type ActivityProductField = {
  /**
   * Clé stable (snake_case). Pharmacie → colonne SQL dédiée ;
   * tous les autres métiers → clé dans `products.activity_attributes`.
   * Ne jamais renommer une clé déjà livrée : les valeurs saisies s'y réfèrent.
   */
  key: string;
  label: string;
  /** Aide courte sous le champ (optionnel). */
  hint?: string;
  /**
   * `text` = saisie libre ; `bool` = case à cocher ; `number` = saisie numérique
   * (clavier chiffres sur mobile) ; `select` = liste fermée (`options` requis).
   */
  type: "text" | "bool" | "number" | "select";
  /** Valeurs proposées pour `type: "select"`. */
  options?: readonly string[];
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

/**
 * Métiers ajoutés — champs stockés dans `activity_attributes` (JSONB).
 * Écrit sous forme compacte : seul ce qui diffère du défaut est renseigné.
 */
type ActivityConfigDraft = Partial<Omit<ActivityConfig, "slug">>;

function defineConfig(slug: string, draft: ActivityConfigDraft): ActivityConfig {
  return { ...DEFAULT_ACTIVITY_CONFIG, slug, ...draft };
}

const ADDED_CONFIGS: ActivityConfig[] = [
  // ── Commerce & distribution ───────────────────────────────────────────────
  defineConfig("alimentation-generale", {
    // Vivres et produits frais : mêmes DLC qu'en grande distribution.
    batchTracking: true,
    expiryDashboard: true,
  }),
  defineConfig("depot-boissons", {
    productFieldsSectionTitle: "Informations boisson",
    productFields: [
      {
        key: "contenance",
        label: "Contenance",
        hint: "Ex. 33 cl, 50 cl, 1 L",
        type: "text",
        half: true,
      },
      {
        key: "casier_quantite",
        label: "Bouteilles par casier",
        hint: "Ex. 12, 24",
        type: "number",
        half: true,
      },
      {
        key: "emballage_consigne",
        label: "Emballage consigné (casier / bouteille à rendre)",
        type: "bool",
      },
    ],
    batchTracking: true,
    expiryDashboard: true,
  }),

  // ── Restauration & hôtellerie ─────────────────────────────────────────────
  defineConfig("boulangerie-patisserie", {
    productFieldsSectionTitle: "Informations produit",
    productFields: [
      {
        key: "famille",
        label: "Famille",
        type: "select",
        options: ["Pain", "Viennoiserie", "Pâtisserie", "Snack", "Boisson"],
        half: true,
      },
      {
        key: "poids_g",
        label: "Poids (g)",
        hint: "Ex. 200 pour une baguette",
        type: "number",
        half: true,
      },
      {
        key: "conservation_heures",
        label: "À consommer sous (heures)",
        hint: "Ex. 24 pour du pain frais",
        type: "number",
      },
      {
        key: "sur_commande",
        label: "Uniquement sur commande",
        type: "bool",
      },
    ],
    batchTracking: true,
    showBarcodeField: false,
    expiryDashboard: true,
  }),
  defineConfig("bar-maquis", {
    productFieldsSectionTitle: "Informations carte",
    productFields: [
      {
        key: "famille",
        label: "Famille",
        type: "select",
        options: ["Boisson fraîche", "Bière", "Alcool", "Plat", "Grillade", "Supplément"],
        half: true,
      },
      {
        key: "contenance",
        label: "Contenance",
        hint: "Ex. 33 cl, 65 cl",
        type: "text",
        half: true,
      },
      { key: "emballage_consigne", label: "Bouteille consignée", type: "bool" },
    ],
    showBarcodeField: false,
  }),
  defineConfig("boucherie-poissonnerie", {
    productFieldsSectionTitle: "Informations produit",
    productFields: [
      {
        key: "espece",
        label: "Espèce / provenance",
        hint: "Ex. Bœuf local, Mouton, Capitaine",
        type: "text",
      },
      {
        key: "decoupe",
        label: "Découpe",
        type: "select",
        options: ["Entier", "Découpé", "Haché", "Filet", "Abats"],
        half: true,
      },
      {
        key: "conservation",
        label: "Conservation",
        type: "select",
        options: ["Frais", "Réfrigéré", "Congelé", "Fumé", "Séché"],
        half: true,
      },
    ],
    batchTracking: true,
    showBarcodeField: false,
    expiryDashboard: true,
  }),
  defineConfig("hotel-auberge", {
    productFieldsSectionTitle: "Informations prestation",
    productFields: [
      {
        key: "type_prestation",
        label: "Type",
        type: "select",
        options: ["Chambre", "Restauration", "Boisson", "Salle / Événement", "Service"],
        half: true,
      },
      {
        key: "capacite_personnes",
        label: "Capacité (personnes)",
        type: "number",
        half: true,
      },
      {
        key: "equipements",
        label: "Équipements",
        hint: "Ex. Climatisation, TV, douche chaude, wifi",
        type: "text",
      },
    ],
    showBarcodeField: false,
  }),

  // ── Mode & beauté ─────────────────────────────────────────────────────────
  defineConfig("chaussures-maroquinerie", {
    productFieldsSectionTitle: "Informations article",
    productFields: [
      {
        key: "pointures",
        label: "Pointures disponibles",
        hint: "Ex. 39, 40, 41, 42",
        type: "text",
      },
      {
        key: "matiere",
        label: "Matière",
        type: "select",
        options: ["Cuir", "Synthétique", "Toile", "Caoutchouc", "Autre"],
        half: true,
      },
      {
        key: "genre",
        label: "Pour",
        type: "select",
        options: ["Homme", "Femme", "Enfant", "Mixte"],
        half: true,
      },
    ],
  }),
  defineConfig("tissus-pagnes", {
    productFieldsSectionTitle: "Informations tissu",
    productFields: [
      {
        key: "matiere",
        label: "Matière",
        type: "select",
        options: ["Wax", "Bazin", "Faso Dan Fani", "Voile", "Satin", "Coton", "Autre"],
        half: true,
      },
      {
        key: "motif",
        label: "Motif / référence",
        hint: "Ex. Hitarget 6060, Super wax",
        type: "text",
        half: true,
      },
      {
        key: "longueur_pagne_m",
        label: "Longueur du pagne (mètres)",
        hint: "Ex. 6 pour un pagne complet",
        type: "number",
        half: true,
      },
      {
        key: "laize_cm",
        label: "Laize / largeur (cm)",
        type: "number",
        half: true,
      },
    ],
    showBarcodeField: false,
  }),
  defineConfig("bijouterie-horlogerie", {
    productFieldsSectionTitle: "Informations bijou",
    productFields: [
      {
        key: "matiere",
        label: "Matière",
        type: "select",
        options: ["Or", "Argent", "Plaqué or", "Acier", "Fantaisie", "Autre"],
        half: true,
      },
      {
        key: "titre_carat",
        label: "Titre / carat",
        hint: "Ex. 18 carats, 925",
        type: "text",
        half: true,
      },
      { key: "poids_g", label: "Poids (g)", type: "number", half: true },
      { key: "garantie_mois", label: "Garantie (mois)", type: "number", half: true },
    ],
  }),
  defineConfig("salon-beaute", {
    productFieldsSectionTitle: "Informations prestation",
    productFields: [
      {
        key: "nature",
        label: "Nature",
        type: "select",
        options: ["Prestation", "Produit revendu", "Forfait"],
        half: true,
      },
      {
        key: "duree_minutes",
        label: "Durée (minutes)",
        hint: "Sert à organiser le planning du salon",
        type: "number",
        half: true,
      },
      {
        key: "produits_utilises",
        label: "Produits utilisés",
        hint: "Ex. mèches, défrisant, huile — pour votre suivi de consommation",
        type: "text",
      },
    ],
    showBarcodeField: false,
  }),

  // ── Santé & bien-être ─────────────────────────────────────────────────────
  defineConfig("optique-lunetterie", {
    productFieldsSectionTitle: "Informations optique",
    productFields: [
      {
        key: "type_article",
        label: "Type",
        type: "select",
        options: ["Monture", "Verre", "Solaire", "Lentille", "Accessoire", "Prestation"],
        half: true,
      },
      {
        key: "traitement_verre",
        label: "Indice / traitement",
        hint: "Ex. 1.56 anti-reflet, photochromique",
        type: "text",
        half: true,
      },
      { key: "garantie_mois", label: "Garantie (mois)", type: "number", half: true },
      { key: "reference_fabricant", label: "Référence fabricant", type: "text", half: true },
    ],
  }),
  defineConfig("clinique-cabinet", {
    productFieldsSectionTitle: "Informations médicale",
    productFields: [
      {
        key: "type_article",
        label: "Type",
        type: "select",
        options: ["Acte / Consultation", "Médicament", "Consommable", "Réactif", "Examen"],
        half: true,
      },
      {
        key: "reference_fabricant",
        label: "Référence fabricant",
        type: "text",
        half: true,
      },
      {
        key: "conditions_conservation",
        label: "Conditions de conservation",
        hint: "Ex. 2-8 °C, à l'abri de la lumière",
        type: "text",
      },
    ],
    batchTracking: true,
    showBarcodeField: false,
    expiryDashboard: true,
  }),

  // ── Technologie & maison ──────────────────────────────────────────────────
  defineConfig("informatique-bureautique", {
    productFieldsSectionTitle: "Informations matériel",
    productFields: [
      {
        key: "specifications",
        label: "Caractéristiques",
        hint: "Ex. i5 8 Go 256 Go SSD, 15 pouces",
        type: "text",
      },
      { key: "numero_serie", label: "N° de série", type: "text", half: true },
      { key: "garantie_mois", label: "Garantie (mois)", type: "number", half: true },
      { key: "etat", label: "État", type: "select", options: ["Neuf", "Occasion", "Reconditionné"], half: true },
    ],
  }),
  defineConfig("electromenager", {
    productFieldsSectionTitle: "Informations appareil",
    productFields: [
      {
        key: "puissance_capacite",
        label: "Puissance / capacité",
        hint: "Ex. 250 L, 1200 W, 12000 BTU",
        type: "text",
        half: true,
      },
      {
        key: "energie",
        label: "Alimentation",
        type: "select",
        options: ["220 V", "Solaire", "Gaz", "Batterie", "Mixte"],
        half: true,
      },
      { key: "numero_serie", label: "N° de série", type: "text", half: true },
      { key: "garantie_mois", label: "Garantie (mois)", type: "number", half: true },
      { key: "livraison_incluse", label: "Livraison incluse dans le prix", type: "bool" },
    ],
  }),
  defineConfig("papeterie-librairie", {
    productFieldsSectionTitle: "Informations article",
    productFields: [
      {
        key: "type_article",
        label: "Type",
        type: "select",
        options: ["Fourniture scolaire", "Livre", "Papeterie", "Consommable", "Service"],
        half: true,
      },
      {
        key: "niveau_scolaire",
        label: "Niveau scolaire",
        hint: "Ex. CP, 6e, Terminale, Université",
        type: "text",
        half: true,
      },
      { key: "isbn_reference", label: "ISBN / référence", type: "text" },
    ],
  }),
  defineConfig("energie-solaire-gaz", {
    productFieldsSectionTitle: "Informations équipement",
    productFields: [
      {
        key: "type_equipement",
        label: "Type",
        type: "select",
        options: [
          "Panneau solaire",
          "Batterie",
          "Onduleur",
          "Régulateur",
          "Lampe / Kit",
          "Bouteille de gaz",
          "Accessoire",
        ],
        half: true,
      },
      {
        key: "puissance_capacite",
        label: "Puissance / capacité",
        hint: "Ex. 150 W, 200 Ah, 6 kg",
        type: "text",
        half: true,
      },
      { key: "garantie_mois", label: "Garantie (mois)", type: "number", half: true },
      { key: "installation_incluse", label: "Installation incluse", type: "bool", half: true },
    ],
  }),

  // ── Auto, moto & engins ───────────────────────────────────────────────────
  defineConfig("garage-mecanique", {
    productFieldsSectionTitle: "Pièce ou prestation",
    productFields: [
      {
        key: "nature",
        label: "Nature",
        type: "select",
        options: ["Pièce", "Main-d'œuvre", "Forfait", "Ingrédient (huile, liquide)"],
        half: true,
      },
      {
        key: "temps_facture_min",
        label: "Temps facturé (minutes)",
        hint: "Pour la main-d'œuvre et les forfaits",
        type: "number",
        half: true,
      },
      {
        key: "vehicules_compatibles",
        label: "Véhicules compatibles",
        hint: "Ex. Toyota Corolla 2005-2012, moto 125",
        type: "text",
      },
    ],
    showBarcodeField: false,
  }),
  defineConfig("station-service", {
    productFieldsSectionTitle: "Informations produit",
    productFields: [
      {
        key: "type_produit",
        label: "Type",
        type: "select",
        options: ["Carburant", "Lubrifiant", "Gaz", "Boutique", "Service"],
        half: true,
      },
      {
        key: "unite_mesure",
        label: "Vendu par",
        type: "select",
        options: ["Litre", "Bidon", "Bouteille", "Pièce"],
        half: true,
      },
      {
        key: "indice_viscosite",
        label: "Indice / viscosité",
        hint: "Ex. Super 91, Gasoil, 15W40",
        type: "text",
      },
    ],
    showBarcodeField: false,
  }),

  // ── Construction & habitat ────────────────────────────────────────────────
  defineConfig("electricite-plomberie", {
    productFieldsSectionTitle: "Informations matériel",
    productFields: [
      {
        key: "usage",
        label: "Usage",
        type: "select",
        options: ["Électricité", "Plomberie", "Les deux"],
        half: true,
      },
      {
        key: "calibre_diametre",
        label: "Calibre / diamètre",
        hint: "Ex. 2,5 mm², 16 A, Ø 40 mm",
        type: "text",
        half: true,
      },
      {
        key: "norme_matiere",
        label: "Norme / matière",
        hint: "Ex. PVC, cuivre, NF C 15-100",
        type: "text",
      },
    ],
  }),
  defineConfig("peinture-decoration", {
    productFieldsSectionTitle: "Informations peinture",
    productFields: [
      {
        key: "teinte",
        label: "Teinte / code couleur",
        hint: "Ex. Blanc cassé, RAL 9010",
        type: "text",
        half: true,
      },
      {
        key: "contenance",
        label: "Contenance",
        hint: "Ex. 5 L, 20 kg",
        type: "text",
        half: true,
      },
      {
        key: "finition",
        label: "Finition",
        type: "select",
        options: ["Mate", "Satinée", "Brillante", "Laque", "Sans objet"],
        half: true,
      },
      {
        key: "rendement_m2",
        label: "Rendement (m²)",
        hint: "Surface couverte par unité",
        type: "number",
        half: true,
      },
    ],
  }),
  defineConfig("meubles-ameublement", {
    productFieldsSectionTitle: "Informations mobilier",
    productFields: [
      {
        key: "dimensions",
        label: "Dimensions (L × l × H)",
        hint: "Ex. 180 × 90 × 75 cm",
        type: "text",
      },
      { key: "matiere", label: "Matière", hint: "Ex. Bois massif, MDF, métal", type: "text", half: true },
      { key: "places", label: "Nombre de places", type: "number", half: true },
      { key: "livraison_incluse", label: "Livraison incluse dans le prix", type: "bool" },
    ],
    showBarcodeField: false,
  }),
  defineConfig("menuiserie-metallerie", {
    productFieldsSectionTitle: "Informations ouvrage",
    productFields: [
      {
        key: "type_ouvrage",
        label: "Type d'ouvrage",
        type: "select",
        options: ["Bois", "Aluminium", "Fer / Métal", "Vitrage", "Fourniture"],
        half: true,
      },
      {
        key: "dimensions",
        label: "Dimensions",
        hint: "Ex. Porte 90 × 210 cm",
        type: "text",
        half: true,
      },
      {
        key: "delai_jours",
        label: "Délai de fabrication (jours)",
        type: "number",
        half: true,
      },
      { key: "sur_mesure", label: "Fabriqué sur mesure", type: "bool", half: true },
    ],
    showBarcodeField: false,
  }),

  // ── Agriculture & élevage ─────────────────────────────────────────────────
  defineConfig("produits-agricoles", {
    productFieldsSectionTitle: "Informations récolte",
    productFields: [
      {
        key: "campagne",
        label: "Campagne / année",
        hint: "Ex. 2025-2026",
        type: "text",
        half: true,
      },
      {
        key: "qualite_calibre",
        label: "Qualité / calibre",
        hint: "Ex. Tout-venant, 1er choix",
        type: "text",
        half: true,
      },
      {
        key: "poids_sac_kg",
        label: "Poids du sac (kg)",
        hint: "Ex. 50, 100",
        type: "number",
        half: true,
      },
      {
        key: "humidite_pct",
        label: "Taux d'humidité (%)",
        type: "number",
        half: true,
      },
    ],
    showBarcodeField: false,
  }),
  defineConfig("intrants-elevage", {
    productFieldsSectionTitle: "Informations intrant",
    productFields: [
      {
        key: "type_intrant",
        label: "Type",
        type: "select",
        options: [
          "Engrais",
          "Semence",
          "Phytosanitaire",
          "Aliment bétail",
          "Produit vétérinaire",
          "Matériel",
        ],
        half: true,
      },
      {
        key: "dosage_composition",
        label: "Dosage / composition",
        hint: "Ex. NPK 14-23-14, 1 L/ha",
        type: "text",
        half: true,
      },
      {
        key: "culture_espece_cible",
        label: "Culture / espèce ciblée",
        hint: "Ex. Maïs, coton, volaille",
        type: "text",
      },
    ],
    // Phytosanitaires et produits vétérinaires ont une date de péremption ferme.
    batchTracking: true,
    expiryDashboard: true,
  }),

  // ── Services ──────────────────────────────────────────────────────────────
  defineConfig("imprimerie-serigraphie", {
    productFieldsSectionTitle: "Informations travail",
    productFields: [
      {
        key: "type_prestation",
        label: "Type",
        type: "select",
        options: ["Impression", "Sérigraphie", "Flocage", "Infographie", "Reliure", "Fourniture"],
        half: true,
      },
      {
        key: "support",
        label: "Support / matière",
        hint: "Ex. Bâche, papier 135 g, t-shirt",
        type: "text",
        half: true,
      },
      { key: "format", label: "Format", hint: "Ex. A4, A3, 2 × 1 m", type: "text", half: true },
      { key: "delai_jours", label: "Délai (jours)", type: "number", half: true },
    ],
    showBarcodeField: false,
  }),
  defineConfig("transport-logistique", {
    productFieldsSectionTitle: "Informations service",
    productFields: [
      {
        key: "type_service",
        label: "Type",
        type: "select",
        options: ["Colis", "Fret", "Location véhicule", "Déménagement", "Course"],
        half: true,
      },
      {
        key: "unite_facturation",
        label: "Facturé au",
        type: "select",
        options: ["Kilo", "Volume (m³)", "Trajet", "Jour", "Kilomètre"],
        half: true,
      },
      {
        key: "zone_destination",
        label: "Zone / destination",
        hint: "Ex. Ouaga → Bobo, national, sous-région",
        type: "text",
      },
    ],
    showBarcodeField: false,
  }),
  defineConfig("immobilier-location", {
    productFieldsSectionTitle: "Informations bien",
    productFields: [
      {
        key: "type_bien",
        label: "Type de bien",
        type: "select",
        options: ["Chambre", "Studio", "Appartement", "Villa", "Magasin", "Bureau", "Terrain"],
        half: true,
      },
      { key: "superficie_m2", label: "Superficie (m²)", type: "number", half: true },
      { key: "pieces", label: "Nombre de pièces", type: "number", half: true },
      { key: "quartier", label: "Quartier / secteur", type: "text", half: true },
      { key: "charges_incluses", label: "Charges incluses dans le loyer", type: "bool" },
    ],
    showBarcodeField: false,
  }),
  defineConfig("mobile-money-transfert", {
    productFieldsSectionTitle: "Informations opération",
    productFields: [
      {
        key: "operateur",
        label: "Opérateur",
        type: "select",
        options: ["Orange Money", "Moov Money", "Wave", "Coris Money", "Western Union", "Autre"],
        half: true,
      },
      {
        key: "type_operation",
        label: "Type d'opération",
        type: "select",
        options: ["Dépôt", "Retrait", "Transfert", "Vente d'unités", "Paiement facture", "Autre"],
        half: true,
      },
      {
        key: "commission_pct",
        label: "Commission (%)",
        hint: "Votre marge sur l'opération",
        type: "number",
      },
    ],
    showBarcodeField: false,
  }),
];

const CONFIGS: Record<string, ActivityConfig> = {
  [PHARMACY_CONFIG.slug]: PHARMACY_CONFIG,
  [SUPERMARKET_CONFIG.slug]: SUPERMARKET_CONFIG,
  ...Object.fromEntries(ADDED_CONFIGS.map((c) => [c.slug, c] as const)),
};

/**
 * Surcharges décidées par la plateforme (super admin), en plus du métier.
 * Toujours **additives** : elles ouvrent une fonctionnalité, jamais l'inverse
 * (une pharmacie garde son suivi de lots même si tout est à `false`).
 */
export type ActivityOverrides = {
  /**
   * Suivi de péremption ouvert « à la main » pour l'entreprise ou la boutique
   * (`companies.expiry_module_enabled` / `stores.expiry_module_enabled`).
   */
  expiryModule?: boolean;
};

/** Config métier effective pour un slug (jamais `null` — fallback défaut). */
export function activityConfig(
  businessTypeSlug: string | null | undefined,
  overrides?: ActivityOverrides,
): ActivityConfig {
  const base = businessTypeSlug
    ? CONFIGS[businessTypeSlug] ?? DEFAULT_ACTIVITY_CONFIG
    : DEFAULT_ACTIVITY_CONFIG;

  // Péremption activée par la plateforme : il faut aussi les lots (`batchTracking`),
  // sans quoi la page n'aurait aucune date à afficher.
  if (overrides?.expiryModule === true && !base.expiryDashboard) {
    return { ...base, batchTracking: true, expiryDashboard: true };
  }
  return base;
}

/** Raccourci : ce métier gère-t-il des champs produit spécifiques ? */
export function hasActivityProductFields(
  businessTypeSlug: string | null | undefined,
): boolean {
  return activityConfig(businessTypeSlug).productFields.length > 0;
}

/** Valeurs initiales des champs métier (chaîne vide / `false`) pour un métier. */
export function emptyActivityFieldValues(
  config: ActivityConfig,
): Record<string, string | boolean> {
  const values: Record<string, string | boolean> = {};
  for (const field of config.productFields) {
    values[field.key] = field.type === "bool" ? false : "";
  }
  return values;
}
