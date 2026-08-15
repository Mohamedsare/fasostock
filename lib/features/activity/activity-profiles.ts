import { ROUTES } from "@/lib/config/routes";
import type { NavItem } from "@/lib/config/navigation";

type ActivityProfile = {
  slug: string;
  hiddenNavHrefs: string[];
  navLabelOverrides: Partial<Record<string, string>>;
  navOrderHrefs?: string[];
};

const DEFAULT_PROFILE: ActivityProfile = {
  slug: "__default__",
  hiddenNavHrefs: [],
  navLabelOverrides: {},
};

/**
 * Personnalisation métier (navigation) par type d'activité.
 * - `hiddenNavHrefs`: liens masqués même si la permission existe.
 * - `navLabelOverrides`: renommage des entrées du menu selon le vocabulaire métier.
 *
 * Un métier absent de cette liste garde la navigation générique : ajouter une
 * activité ici est toujours additif.
 */
const ACTIVITY_PROFILES: ActivityProfile[] = [
  {
    slug: "pharmacie",
    // Officine unique : pas de dépôt central, ni transferts inter-boutiques,
    // ni code-barres (peu utilisé au comptoir). Réactivables pour une chaîne.
    // Promotions exclues : pas de remises commerciales sur les médicaments.
    hiddenNavHrefs: [ROUTES.warehouse, ROUTES.transfers, ROUTES.barcodes, ROUTES.promotions],
    navLabelOverrides: {
      [ROUTES.products]: "Médicaments",
      [ROUTES.inventory]: "Stock pharmacie",
      [ROUTES.purchases]: "Approvisionnements",
      [ROUTES.customers]: "Patients",
      [ROUTES.sales]: "Dispensation",
      [ROUTES.stores]: "Pharmacies",
      [ROUTES.suppliers]: "Laboratoires",
    },
  },
  {
    slug: "restaurant-fast-food",
    hiddenNavHrefs: [
      ROUTES.barcodes,
      ROUTES.stores,
      ROUTES.stockCashier,
      ROUTES.warehouse,
      ROUTES.transfers,
      ROUTES.reports,
      ROUTES.audit,
    ],
    navLabelOverrides: {
      [ROUTES.dashboard]: "Tableau de bord",
      [ROUTES.products]: "Menu",
      [ROUTES.inventory]: "Stock cuisine",
      [ROUTES.sales]: "Commandes",
      [ROUTES.purchases]: "Approvisionnements",
      [ROUTES.customers]: "Clients",
      [ROUTES.credit]: "Crédit",
      [ROUTES.ai]: "Prédictions IA",
    },
    navOrderHrefs: [
      ROUTES.dashboard,
      ROUTES.products,
      ROUTES.sales,
      ROUTES.inventory,
      ROUTES.purchases,
      ROUTES.customers,
      ROUTES.credit,
      ROUTES.suppliers,
      ROUTES.ai,
      ROUTES.users,
      ROUTES.settings,
      ROUTES.help,
      ROUTES.subscription,
    ],
  },
  {
    slug: "grossiste-distribution",
    hiddenNavHrefs: [],
    navLabelOverrides: {
      [ROUTES.customers]: "Clients B2B",
    },
  },
  {
    slug: "materiaux-construction",
    hiddenNavHrefs: [],
    navLabelOverrides: {
      [ROUTES.products]: "Articles",
      [ROUTES.sales]: "Ventes chantier",
      [ROUTES.inventory]: "Stock dépôt",
    },
  },

  // ── Métiers ajoutés (vocabulaire dédié, navigation générique conservée) ────
  {
    slug: "alimentation-generale",
    hiddenNavHrefs: [],
    navLabelOverrides: {
      [ROUTES.products]: "Articles",
      [ROUTES.inventory]: "Stock boutique",
    },
  },
  {
    slug: "depot-boissons",
    hiddenNavHrefs: [],
    navLabelOverrides: {
      [ROUTES.products]: "Boissons",
      [ROUTES.inventory]: "Stock casiers",
      [ROUTES.customers]: "Clients & revendeurs",
      [ROUTES.warehouse]: "Dépôt",
    },
  },
  {
    slug: "boulangerie-patisserie",
    hiddenNavHrefs: [ROUTES.barcodes],
    navLabelOverrides: {
      [ROUTES.products]: "Pains & pâtisseries",
      [ROUTES.inventory]: "Stock matières",
      [ROUTES.purchases]: "Approvisionnements",
      [ROUTES.sales]: "Ventes",
    },
  },
  {
    slug: "bar-maquis",
    hiddenNavHrefs: [ROUTES.barcodes, ROUTES.transfers],
    navLabelOverrides: {
      [ROUTES.products]: "Carte & boissons",
      [ROUTES.sales]: "Additions",
      [ROUTES.inventory]: "Stock bar",
      [ROUTES.purchases]: "Approvisionnements",
    },
  },
  {
    slug: "boucherie-poissonnerie",
    hiddenNavHrefs: [ROUTES.barcodes],
    navLabelOverrides: {
      [ROUTES.products]: "Découpes & produits",
      [ROUTES.inventory]: "Stock chambre froide",
      [ROUTES.purchases]: "Achats bêtes / arrivages",
    },
  },
  {
    slug: "hotel-auberge",
    hiddenNavHrefs: [ROUTES.barcodes, ROUTES.transfers, ROUTES.promotions],
    navLabelOverrides: {
      [ROUTES.products]: "Chambres & prestations",
      [ROUTES.sales]: "Séjours & consommations",
      [ROUTES.customers]: "Clients",
      [ROUTES.inventory]: "Stock hôtel",
      [ROUTES.stores]: "Établissements",
    },
  },
  {
    slug: "chaussures-maroquinerie",
    hiddenNavHrefs: [],
    navLabelOverrides: {
      [ROUTES.products]: "Modèles & pointures",
      [ROUTES.inventory]: "Stock boutique",
    },
  },
  {
    slug: "tissus-pagnes",
    hiddenNavHrefs: [],
    navLabelOverrides: {
      [ROUTES.products]: "Tissus & pagnes",
      [ROUTES.inventory]: "Stock rouleaux",
      [ROUTES.customers]: "Clients & couturiers",
    },
  },
  {
    slug: "bijouterie-horlogerie",
    hiddenNavHrefs: [],
    navLabelOverrides: {
      [ROUTES.products]: "Bijoux & montres",
      [ROUTES.inventory]: "Stock coffre",
      [ROUTES.suppliers]: "Fournisseurs & orfèvres",
    },
  },
  {
    slug: "salon-beaute",
    hiddenNavHrefs: [ROUTES.barcodes, ROUTES.transfers, ROUTES.warehouse],
    navLabelOverrides: {
      [ROUTES.products]: "Prestations & produits",
      [ROUTES.sales]: "Prestations réalisées",
      [ROUTES.inventory]: "Stock salon",
      [ROUTES.customers]: "Clientèle",
      [ROUTES.users]: "Équipe du salon",
    },
  },
  {
    slug: "optique-lunetterie",
    hiddenNavHrefs: [],
    navLabelOverrides: {
      [ROUTES.products]: "Montures & verres",
      [ROUTES.customers]: "Patients",
      [ROUTES.inventory]: "Stock optique",
    },
  },
  {
    slug: "clinique-cabinet",
    hiddenNavHrefs: [ROUTES.barcodes, ROUTES.promotions],
    navLabelOverrides: {
      [ROUTES.products]: "Actes & consommables",
      [ROUTES.sales]: "Consultations & soins",
      [ROUTES.customers]: "Patients",
      [ROUTES.inventory]: "Stock médical",
      [ROUTES.purchases]: "Approvisionnements",
      [ROUTES.stores]: "Sites de soins",
    },
  },
  {
    slug: "informatique-bureautique",
    hiddenNavHrefs: [],
    navLabelOverrides: {
      [ROUTES.products]: "Matériel & consommables",
      [ROUTES.inventory]: "Stock matériel",
    },
  },
  {
    slug: "electromenager",
    hiddenNavHrefs: [],
    navLabelOverrides: {
      [ROUTES.products]: "Appareils",
      [ROUTES.inventory]: "Stock magasin",
      [ROUTES.sales]: "Ventes & livraisons",
    },
  },
  {
    slug: "papeterie-librairie",
    hiddenNavHrefs: [],
    navLabelOverrides: {
      [ROUTES.products]: "Fournitures & livres",
      [ROUTES.inventory]: "Stock librairie",
    },
  },
  {
    slug: "energie-solaire-gaz",
    hiddenNavHrefs: [],
    navLabelOverrides: {
      [ROUTES.products]: "Équipements",
      [ROUTES.inventory]: "Stock équipements",
      [ROUTES.sales]: "Ventes & installations",
    },
  },
  {
    slug: "garage-mecanique",
    hiddenNavHrefs: [ROUTES.barcodes],
    navLabelOverrides: {
      [ROUTES.products]: "Pièces & prestations",
      [ROUTES.sales]: "Réparations facturées",
      [ROUTES.customers]: "Clients & véhicules",
      [ROUTES.inventory]: "Stock atelier",
      [ROUTES.users]: "Mécaniciens",
    },
  },
  {
    slug: "station-service",
    hiddenNavHrefs: [ROUTES.barcodes, ROUTES.transfers],
    navLabelOverrides: {
      [ROUTES.products]: "Carburants & produits",
      [ROUTES.sales]: "Ventes pompe & boutique",
      [ROUTES.inventory]: "Stock cuves",
      [ROUTES.purchases]: "Livraisons carburant",
      [ROUTES.users]: "Pompistes",
    },
  },
  {
    slug: "electricite-plomberie",
    hiddenNavHrefs: [],
    navLabelOverrides: {
      [ROUTES.products]: "Matériel élec. & sanitaire",
      [ROUTES.inventory]: "Stock magasin",
      [ROUTES.customers]: "Clients & installateurs",
    },
  },
  {
    slug: "peinture-decoration",
    hiddenNavHrefs: [],
    navLabelOverrides: {
      [ROUTES.products]: "Peintures & finitions",
      [ROUTES.inventory]: "Stock magasin",
      [ROUTES.customers]: "Clients & peintres",
    },
  },
  {
    slug: "meubles-ameublement",
    hiddenNavHrefs: [ROUTES.barcodes],
    navLabelOverrides: {
      [ROUTES.products]: "Mobilier",
      [ROUTES.sales]: "Ventes & livraisons",
      [ROUTES.inventory]: "Stock showroom",
    },
  },
  {
    slug: "menuiserie-metallerie",
    hiddenNavHrefs: [ROUTES.barcodes],
    navLabelOverrides: {
      [ROUTES.products]: "Ouvrages & fournitures",
      [ROUTES.sales]: "Commandes clients",
      [ROUTES.inventory]: "Stock atelier",
      [ROUTES.users]: "Équipe atelier",
    },
  },
  {
    slug: "produits-agricoles",
    hiddenNavHrefs: [ROUTES.barcodes],
    navLabelOverrides: {
      [ROUTES.products]: "Céréales & produits",
      [ROUTES.purchases]: "Achats aux producteurs",
      [ROUTES.inventory]: "Stock magasin",
      [ROUTES.warehouse]: "Magasin de stockage",
      [ROUTES.suppliers]: "Producteurs & collecteurs",
    },
  },
  {
    slug: "intrants-elevage",
    hiddenNavHrefs: [],
    navLabelOverrides: {
      [ROUTES.products]: "Intrants & aliments",
      [ROUTES.customers]: "Producteurs & éleveurs",
      [ROUTES.inventory]: "Stock intrants",
    },
  },
  {
    slug: "imprimerie-serigraphie",
    hiddenNavHrefs: [ROUTES.barcodes, ROUTES.transfers],
    navLabelOverrides: {
      [ROUTES.products]: "Travaux & supports",
      [ROUTES.sales]: "Commandes facturées",
      [ROUTES.inventory]: "Stock consommables",
      [ROUTES.customers]: "Clients & annonceurs",
    },
  },
  {
    slug: "transport-logistique",
    hiddenNavHrefs: [ROUTES.barcodes, ROUTES.transfers, ROUTES.promotions],
    navLabelOverrides: {
      [ROUTES.products]: "Services & tarifs",
      [ROUTES.sales]: "Expéditions facturées",
      [ROUTES.customers]: "Expéditeurs & clients",
      [ROUTES.inventory]: "Stock fournitures",
      [ROUTES.users]: "Chauffeurs & équipe",
    },
  },
  {
    slug: "immobilier-location",
    hiddenNavHrefs: [ROUTES.barcodes, ROUTES.transfers, ROUTES.warehouse, ROUTES.promotions],
    navLabelOverrides: {
      [ROUTES.products]: "Biens & services",
      [ROUTES.sales]: "Encaissements",
      [ROUTES.customers]: "Locataires & propriétaires",
      [ROUTES.credit]: "Loyers impayés",
      [ROUTES.stores]: "Agences",
    },
  },
  {
    slug: "mobile-money-transfert",
    hiddenNavHrefs: [ROUTES.barcodes, ROUTES.transfers, ROUTES.warehouse],
    navLabelOverrides: {
      [ROUTES.products]: "Opérations & services",
      [ROUTES.sales]: "Opérations du jour",
      [ROUTES.inventory]: "Flotte & unités",
      [ROUTES.customers]: "Clients réguliers",
    },
  },
];

function resolveProfile(businessTypeSlug: string | null | undefined): ActivityProfile {
  if (!businessTypeSlug) return DEFAULT_PROFILE;
  return (
    ACTIVITY_PROFILES.find((p) => p.slug === businessTypeSlug) ?? DEFAULT_PROFILE
  );
}

export function isRouteAllowedForActivity(
  href: string,
  businessTypeSlug: string | null | undefined,
): boolean {
  const profile = resolveProfile(businessTypeSlug);
  return !profile.hiddenNavHrefs.includes(href);
}

export function adaptNavItemsForActivity(
  items: NavItem[],
  businessTypeSlug: string | null | undefined,
): NavItem[] {
  const profile = resolveProfile(businessTypeSlug);
  const filtered = items
    .filter((item) => !profile.hiddenNavHrefs.includes(item.href))
    .map((item) => {
      const overrideLabel = profile.navLabelOverrides[item.href];
      return overrideLabel ? { ...item, label: overrideLabel } : item;
    });
  if (!profile.navOrderHrefs || profile.navOrderHrefs.length === 0) return filtered;

  const order = new Map(profile.navOrderHrefs.map((href, idx) => [href, idx] as const));
  return filtered.sort((a, b) => {
    const ia = order.get(a.href);
    const ib = order.get(b.href);
    if (ia === undefined && ib === undefined) return 0;
    if (ia === undefined) return 1;
    if (ib === undefined) return -1;
    return ia - ib;
  });
}

export type ActivityUiTerms = {
  storeSingular: string;
  storesPlural: string;
  dashboardTitle: string;
  reportsTitle: string;
  productsTitle: string;
  productsSubtitle: string;
  salesHistoryTitle: string;
  purchasesTitle: string;
  purchasesDescription: string;
  purchasesCreateActionLabel: string;
  purchasesCreatedToast: string;
  purchasesCancelledToast: string;
  purchasesDeletedToast: string;
  purchasesCreateDeniedToast: string;
  creditTitle: string;
  creditSubtitle: string;
  customersTitle: string;
  customersDescription: string;
  inventoryTitle: string;
  /**
   * Champs optionnels (ajout progressif). Les écrans consomment avec un
   * fallback (`?? "valeur générique"`) → métiers sans override = inchangés.
   */
  suppliersTitle?: string;
  suppliersDescription?: string;
  suppliersCreateLabel?: string;
  suppliersEntitySingular?: string;
  /** Caisse / point de vente. */
  posTitle?: string;
  posCartTitle?: string;
  posCheckoutLabel?: string;
  /** Stock caisse (vue caissier). */
  stockCashierTitle?: string;
  /**
   * Cartes de suivi de péremption (tableau de bord + rapports). Optionnels :
   * les composants retombent sur un libellé générique « produit ».
   */
  expiryReportsTitle?: string;
  expiredItemsLabel?: string;
  expiryManageLinkLabel?: string;
};

/**
 * Renommage des rôles selon le métier (libellés uniquement — les permissions et
 * les slugs sous-jacents restent identiques). Vide pour les métiers non listés.
 */
const ROLE_LABELS: Record<string, Record<string, string>> = {
  pharmacie: {
    owner: "Pharmacien titulaire",
    manager: "Pharmacien adjoint",
    store_manager: "Responsable d'officine",
    cashier: "Préparateur / Vendeur",
    stock_manager: "Gestionnaire de stock",
  },
  "restaurant-fast-food": {
    owner: "Gérant",
    manager: "Manager",
    store_manager: "Responsable de salle",
    cashier: "Serveur / Caissier",
    stock_manager: "Responsable cuisine",
  },
  "boulangerie-patisserie": {
    owner: "Gérant",
    manager: "Responsable production",
    store_manager: "Responsable boutique",
    cashier: "Vendeur",
    stock_manager: "Chef boulanger",
  },
  "bar-maquis": {
    owner: "Gérant",
    manager: "Manager",
    store_manager: "Responsable de salle",
    cashier: "Serveur / Barman",
    stock_manager: "Responsable bar",
  },
  "hotel-auberge": {
    owner: "Directeur",
    manager: "Manager",
    store_manager: "Chef de réception",
    cashier: "Réceptionniste",
    stock_manager: "Gouvernante / Économe",
  },
  "salon-beaute": {
    owner: "Gérant(e) du salon",
    manager: "Responsable salon",
    store_manager: "Chef d'équipe",
    cashier: "Coiffeur(se) / Esthéticien(ne)",
    stock_manager: "Responsable produits",
  },
  "clinique-cabinet": {
    owner: "Directeur médical",
    manager: "Administrateur",
    store_manager: "Responsable de site",
    cashier: "Accueil / Caisse",
    stock_manager: "Responsable pharmacie interne",
  },
  "garage-mecanique": {
    owner: "Patron du garage",
    manager: "Chef d'atelier",
    store_manager: "Responsable atelier",
    cashier: "Accueil / Facturation",
    stock_manager: "Magasinier pièces",
  },
  "station-service": {
    owner: "Gérant de station",
    manager: "Chef de piste",
    store_manager: "Responsable de station",
    cashier: "Pompiste / Caissier",
    stock_manager: "Responsable cuves",
  },
  "menuiserie-metallerie": {
    owner: "Patron d'atelier",
    manager: "Chef d'atelier",
    store_manager: "Responsable atelier",
    cashier: "Accueil / Devis",
    stock_manager: "Magasinier",
  },
  "imprimerie-serigraphie": {
    owner: "Gérant",
    manager: "Chef de production",
    store_manager: "Responsable agence",
    cashier: "Accueil / Facturation",
    stock_manager: "Responsable consommables",
  },
  "transport-logistique": {
    owner: "Gérant",
    manager: "Responsable exploitation",
    store_manager: "Chef d'agence",
    cashier: "Guichetier",
    stock_manager: "Responsable fournitures",
  },
  "immobilier-location": {
    owner: "Gérant de l'agence",
    manager: "Responsable gérance",
    store_manager: "Chef d'agence",
    cashier: "Chargé d'encaissement",
    stock_manager: "Responsable logistique",
  },
  "mobile-money-transfert": {
    owner: "Gérant",
    manager: "Superviseur",
    store_manager: "Responsable kiosque",
    cashier: "Agent de transfert",
    stock_manager: "Responsable flotte",
  },
  "produits-agricoles": {
    owner: "Gérant",
    manager: "Responsable collecte",
    store_manager: "Chef de magasin",
    cashier: "Caissier",
    stock_manager: "Magasinier",
  },
};

export function activityRoleLabels(
  businessTypeSlug: string | null | undefined,
): Record<string, string> {
  if (!businessTypeSlug) return {};
  return ROLE_LABELS[businessTypeSlug] ?? {};
}

const DEFAULT_UI_TERMS: ActivityUiTerms = {
  storeSingular: "Boutique",
  storesPlural: "Boutiques",
  dashboardTitle: "Tableau de bord",
  reportsTitle: "Rapports",
  productsTitle: "Produits",
  productsSubtitle: "Catalogue, catégories et marques",
  salesHistoryTitle: "Historique des ventes",
  purchasesTitle: "Achats",
  purchasesDescription: "Voir, modifier, annuler ou supprimer les achats.",
  purchasesCreateActionLabel: "Nouvel achat",
  purchasesCreatedToast: "Achat créé (brouillon)",
  purchasesCancelledToast: "Achat annulé",
  purchasesDeletedToast: "Achat supprimé",
  purchasesCreateDeniedToast: "Vous n'avez pas le droit de créer des achats.",
  creditTitle: "Crédit client",
  creditSubtitle:
    "Encours, échéances, paiements partiels — aligné sur vos ventes complétées avec client",
  customersTitle: "Clients",
  customersDescription: "Gérer vos clients (particuliers et entreprises)",
  inventoryTitle: "Stock",
};

/**
 * Vocabulaire par métier. Chaque entrée est fusionnée sur `DEFAULT_UI_TERMS` :
 * on ne décrit que ce qui change → ajouter un métier ne touche à aucun autre.
 */
const UI_TERMS_OVERRIDES: Record<string, Partial<ActivityUiTerms>> = {
  pharmacie: {
    storeSingular: "Pharmacie",
    storesPlural: "Pharmacies",
    reportsTitle: "Rapports pharmacie",
    productsTitle: "Médicaments",
    productsSubtitle: "Référentiel, classes thérapeutiques et laboratoires",
    salesHistoryTitle: "Historique des dispensations",
    purchasesTitle: "Approvisionnements",
    purchasesDescription: "Voir, modifier, annuler ou supprimer les approvisionnements.",
    purchasesCreateActionLabel: "Nouvel approvisionnement",
    purchasesCreatedToast: "Approvisionnement créé (brouillon)",
    purchasesCancelledToast: "Approvisionnement annulé",
    purchasesDeletedToast: "Approvisionnement supprimé",
    purchasesCreateDeniedToast: "Vous n'avez pas le droit de créer des approvisionnements.",
    creditTitle: "Crédit patient",
    creditSubtitle: "Encours, échéances et paiements partiels des patients",
    customersTitle: "Patients",
    customersDescription: "Gérer vos patients (particuliers et entreprises de santé)",
    inventoryTitle: "Stock pharmacie",
    suppliersTitle: "Laboratoires / Grossistes",
    suppliersDescription: "Gérer vos laboratoires et grossistes répartiteurs",
    suppliersCreateLabel: "Nouveau laboratoire",
    suppliersEntitySingular: "laboratoire",
    posTitle: "Dispensation",
    posCartTitle: "Ordonnance / Panier",
    posCheckoutLabel: "Valider la dispensation",
    stockCashierTitle: "Stock pharmacie",
    expiryReportsTitle: "Rapports pharmacie",
    expiredItemsLabel: "Médicaments périmés",
    expiryManageLinkLabel: "Gérer les médicaments",
  },
  "supermarche-alimentation": {
    storeSingular: "Magasin",
    storesPlural: "Magasins",
    productsSubtitle: "Catalogue, rayons et marques",
    purchasesDescription: "Voir, modifier, annuler ou supprimer les achats fournisseurs.",
    creditSubtitle: "Encours, échéances et paiements partiels des clients",
    inventoryTitle: "Stock",
    posTitle: "Caisse",
    posCartTitle: "Panier",
    posCheckoutLabel: "Encaisser",
    stockCashierTitle: "Stock caisse",
    expiryReportsTitle: "Suivi des dates limites (DLC/DLUO)",
    expiredItemsLabel: "Produits périmés",
    expiryManageLinkLabel: "Gérer les produits",
  },
  "restaurant-fast-food": {
    storeSingular: "Point de vente",
    storesPlural: "Points de vente",
    productsTitle: "Menu",
    productsSubtitle: "Plats, catégories et marques/fournisseurs",
    salesHistoryTitle: "Historique des commandes",
    purchasesTitle: "Approvisionnements",
    purchasesDescription: "Voir, modifier, annuler ou supprimer les approvisionnements cuisine.",
    purchasesCreateActionLabel: "Nouvel approvisionnement",
    purchasesCreatedToast: "Approvisionnement créé (brouillon)",
    purchasesCancelledToast: "Approvisionnement annulé",
    purchasesDeletedToast: "Approvisionnement supprimé",
    purchasesCreateDeniedToast: "Vous n'avez pas le droit de créer des approvisionnements.",
    creditSubtitle: "Encours, échéances et paiements partiels des clients",
    customersDescription: "Gérer vos clients (sur place, emporté, livraison)",
    inventoryTitle: "Stock cuisine",
  },
  "grossiste-distribution": {
    productsTitle: "Articles",
    productsSubtitle: "Catalogue, familles et marques",
    purchasesDescription: "Voir, modifier, annuler ou supprimer les achats fournisseurs.",
    creditSubtitle: "Encours et règlements clients B2B",
    customersTitle: "Clients B2B",
    customersDescription: "Gérer vos clients professionnels (revendeurs, entreprises)",
  },
  "materiaux-construction": {
    reportsTitle: "Rapports chantier",
    productsTitle: "Articles",
    productsSubtitle: "Catalogue chantier, catégories et marques",
    salesHistoryTitle: "Historique des ventes chantier",
    creditSubtitle: "Encours, échéances et paiements partiels",
    customersDescription: "Gérer vos clients (particuliers, artisans, entreprises)",
    inventoryTitle: "Stock dépôt",
  },

  // ── Métiers ajoutés ───────────────────────────────────────────────────────
  "alimentation-generale": {
    productsTitle: "Articles",
    productsSubtitle: "Catalogue, rayons et marques",
    inventoryTitle: "Stock boutique",
    posTitle: "Caisse",
    posCartTitle: "Panier",
    posCheckoutLabel: "Encaisser",
    stockCashierTitle: "Stock boutique",
    expiryReportsTitle: "Suivi des dates limites (DLC/DLUO)",
    expiredItemsLabel: "Articles périmés",
    expiryManageLinkLabel: "Gérer les articles",
  },
  "depot-boissons": {
    storeSingular: "Dépôt",
    storesPlural: "Dépôts",
    productsTitle: "Boissons",
    productsSubtitle: "Références, contenances et casiers",
    salesHistoryTitle: "Historique des sorties",
    purchasesTitle: "Approvisionnements",
    purchasesCreateActionLabel: "Nouvel approvisionnement",
    creditTitle: "Crédit revendeurs",
    creditSubtitle: "Encours des revendeurs, casiers consignés et règlements",
    customersTitle: "Clients & revendeurs",
    customersDescription: "Gérer vos revendeurs, maquis et clients particuliers",
    inventoryTitle: "Stock casiers",
    suppliersTitle: "Brasseries & fournisseurs",
    suppliersEntitySingular: "fournisseur",
    posTitle: "Vente au dépôt",
    posCheckoutLabel: "Encaisser",
    expiryReportsTitle: "Suivi des DLUO",
    expiredItemsLabel: "Boissons périmées",
  },
  "boulangerie-patisserie": {
    storeSingular: "Boulangerie",
    storesPlural: "Boulangeries",
    productsTitle: "Pains & pâtisseries",
    productsSubtitle: "Références, poids et durées de conservation",
    salesHistoryTitle: "Historique des ventes",
    purchasesTitle: "Approvisionnements",
    purchasesDescription: "Farine, levure, emballages : voir et gérer vos approvisionnements.",
    purchasesCreateActionLabel: "Nouvel approvisionnement",
    purchasesCreatedToast: "Approvisionnement créé (brouillon)",
    inventoryTitle: "Stock matières",
    posTitle: "Vente au comptoir",
    posCartTitle: "Panier",
    posCheckoutLabel: "Encaisser",
    stockCashierTitle: "Stock comptoir",
    expiryReportsTitle: "Produits du jour à écouler",
    expiredItemsLabel: "Produits invendus / périmés",
    expiryManageLinkLabel: "Gérer les produits",
  },
  "bar-maquis": {
    storeSingular: "Maquis",
    storesPlural: "Maquis",
    productsTitle: "Carte & boissons",
    productsSubtitle: "Boissons, plats et suppléments",
    salesHistoryTitle: "Historique des additions",
    purchasesTitle: "Approvisionnements",
    purchasesCreateActionLabel: "Nouvel approvisionnement",
    creditTitle: "Ardoises clients",
    creditSubtitle: "Ardoises en cours, échéances et règlements",
    customersDescription: "Gérer vos habitués et clients à ardoise",
    inventoryTitle: "Stock bar",
    posTitle: "Prise de commande",
    posCartTitle: "Addition",
    posCheckoutLabel: "Encaisser l'addition",
    stockCashierTitle: "Stock bar",
  },
  "boucherie-poissonnerie": {
    storeSingular: "Boucherie",
    storesPlural: "Points de vente",
    productsTitle: "Découpes & produits",
    productsSubtitle: "Découpes, provenances et modes de conservation",
    purchasesTitle: "Arrivages",
    purchasesDescription: "Bêtes, carcasses et arrivages : voir, modifier ou supprimer.",
    purchasesCreateActionLabel: "Nouvel arrivage",
    purchasesCreatedToast: "Arrivage créé (brouillon)",
    inventoryTitle: "Stock chambre froide",
    posTitle: "Vente au comptoir",
    posCheckoutLabel: "Encaisser",
    stockCashierTitle: "Stock comptoir",
    expiryReportsTitle: "Fraîcheur & dates limites",
    expiredItemsLabel: "Produits périmés",
  },
  "hotel-auberge": {
    storeSingular: "Établissement",
    storesPlural: "Établissements",
    reportsTitle: "Rapports d'exploitation",
    productsTitle: "Chambres & prestations",
    productsSubtitle: "Chambres, restauration et services facturables",
    salesHistoryTitle: "Historique des séjours & consommations",
    purchasesTitle: "Approvisionnements",
    purchasesCreateActionLabel: "Nouvel approvisionnement",
    creditTitle: "Notes clients",
    creditSubtitle: "Notes ouvertes, séjours à régler et paiements partiels",
    customersDescription: "Gérer vos clients, sociétés et agences partenaires",
    inventoryTitle: "Stock hôtel",
    posTitle: "Réception",
    posCartTitle: "Note du client",
    posCheckoutLabel: "Encaisser la note",
  },
  "chaussures-maroquinerie": {
    productsTitle: "Modèles & pointures",
    productsSubtitle: "Modèles, pointures, matières et marques",
    inventoryTitle: "Stock boutique",
    posTitle: "Caisse",
    posCheckoutLabel: "Encaisser",
  },
  "tissus-pagnes": {
    productsTitle: "Tissus & pagnes",
    productsSubtitle: "Matières, laizes, motifs et longueurs",
    salesHistoryTitle: "Historique des ventes",
    creditSubtitle: "Encours et règlements (clients, couturiers, revendeuses)",
    customersTitle: "Clients & couturiers",
    customersDescription: "Gérer vos clientes, couturiers et revendeuses",
    inventoryTitle: "Stock rouleaux",
    posTitle: "Vente au mètre",
    posCheckoutLabel: "Encaisser",
  },
  "bijouterie-horlogerie": {
    storeSingular: "Bijouterie",
    storesPlural: "Bijouteries",
    productsTitle: "Bijoux & montres",
    productsSubtitle: "Matières, titres, poids et garanties",
    inventoryTitle: "Stock coffre",
    suppliersTitle: "Fournisseurs & orfèvres",
    suppliersEntitySingular: "fournisseur",
    posTitle: "Vente",
    posCheckoutLabel: "Encaisser",
  },
  "salon-beaute": {
    storeSingular: "Salon",
    storesPlural: "Salons",
    reportsTitle: "Rapports du salon",
    productsTitle: "Prestations & produits",
    productsSubtitle: "Prestations facturées, durées et produits revendus",
    salesHistoryTitle: "Historique des prestations",
    purchasesTitle: "Achats produits",
    purchasesDescription: "Mèches, produits capillaires et consommables du salon.",
    creditTitle: "Crédit clientèle",
    creditSubtitle: "Prestations à régler et paiements partiels",
    customersTitle: "Clientèle",
    customersDescription: "Gérer votre clientèle et son historique de prestations",
    inventoryTitle: "Stock salon",
    posTitle: "Encaissement prestation",
    posCartTitle: "Prestations réalisées",
    posCheckoutLabel: "Encaisser",
  },
  "optique-lunetterie": {
    productsTitle: "Montures & verres",
    productsSubtitle: "Montures, verres, traitements et garanties",
    salesHistoryTitle: "Historique des ventes",
    creditTitle: "Crédit patient",
    creditSubtitle: "Équipements à régler, échéances et paiements partiels",
    customersTitle: "Patients",
    customersDescription: "Gérer vos patients et leurs équipements",
    inventoryTitle: "Stock optique",
    posTitle: "Vente",
    posCheckoutLabel: "Encaisser",
  },
  "clinique-cabinet": {
    storeSingular: "Site de soins",
    storesPlural: "Sites de soins",
    reportsTitle: "Rapports d'activité",
    productsTitle: "Actes & consommables",
    productsSubtitle: "Actes facturables, médicaments et consommables",
    salesHistoryTitle: "Historique des consultations & soins",
    purchasesTitle: "Approvisionnements",
    purchasesDescription: "Consommables, réactifs et médicaments.",
    purchasesCreateActionLabel: "Nouvel approvisionnement",
    creditTitle: "Crédit patient",
    creditSubtitle: "Soins à régler, prises en charge et paiements partiels",
    customersTitle: "Patients",
    customersDescription: "Gérer vos patients et organismes de prise en charge",
    inventoryTitle: "Stock médical",
    posTitle: "Encaissement",
    posCartTitle: "Actes & produits",
    posCheckoutLabel: "Encaisser",
    expiryReportsTitle: "Péremptions (médicaments & réactifs)",
    expiredItemsLabel: "Produits périmés",
  },
  "informatique-bureautique": {
    productsTitle: "Matériel & consommables",
    productsSubtitle: "Matériel, consommables, garanties et références",
    inventoryTitle: "Stock matériel",
    posTitle: "Caisse",
    posCheckoutLabel: "Encaisser",
  },
  "electromenager": {
    storeSingular: "Magasin",
    storesPlural: "Magasins",
    productsTitle: "Appareils",
    productsSubtitle: "Appareils, puissances, garanties et références",
    salesHistoryTitle: "Historique des ventes & livraisons",
    creditSubtitle: "Achats à crédit, échéances et paiements partiels",
    inventoryTitle: "Stock magasin",
    posTitle: "Vente",
    posCheckoutLabel: "Encaisser",
  },
  "papeterie-librairie": {
    storeSingular: "Librairie",
    storesPlural: "Librairies",
    productsTitle: "Fournitures & livres",
    productsSubtitle: "Fournitures scolaires, livres et papeterie",
    inventoryTitle: "Stock librairie",
    posTitle: "Caisse",
    posCheckoutLabel: "Encaisser",
  },
  "energie-solaire-gaz": {
    storeSingular: "Magasin",
    storesPlural: "Magasins",
    productsTitle: "Équipements",
    productsSubtitle: "Panneaux, batteries, onduleurs et bouteilles de gaz",
    salesHistoryTitle: "Historique des ventes & installations",
    creditSubtitle: "Installations à crédit, échéances et paiements partiels",
    inventoryTitle: "Stock équipements",
    posTitle: "Vente",
    posCheckoutLabel: "Encaisser",
  },
  "garage-mecanique": {
    storeSingular: "Garage",
    storesPlural: "Garages",
    reportsTitle: "Rapports atelier",
    productsTitle: "Pièces & prestations",
    productsSubtitle: "Pièces, forfaits et temps de main-d'œuvre",
    salesHistoryTitle: "Historique des réparations facturées",
    purchasesTitle: "Achats pièces",
    purchasesDescription: "Pièces, huiles et fournitures d'atelier.",
    creditTitle: "Factures impayées",
    creditSubtitle: "Réparations livrées non réglées, échéances et acomptes",
    customersTitle: "Clients & véhicules",
    customersDescription: "Gérer vos clients et l'historique de leurs véhicules",
    inventoryTitle: "Stock atelier",
    posTitle: "Facturation réparation",
    posCartTitle: "Pièces & main-d'œuvre",
    posCheckoutLabel: "Facturer",
  },
  "station-service": {
    storeSingular: "Station",
    storesPlural: "Stations",
    reportsTitle: "Rapports station",
    productsTitle: "Carburants & produits",
    productsSubtitle: "Carburants, lubrifiants, gaz et boutique",
    salesHistoryTitle: "Historique des ventes (pompe & boutique)",
    purchasesTitle: "Livraisons carburant",
    purchasesDescription: "Livraisons de carburant et achats boutique.",
    purchasesCreateActionLabel: "Nouvelle livraison",
    purchasesCreatedToast: "Livraison créée (brouillon)",
    creditTitle: "Crédit clients & sociétés",
    creditSubtitle: "Bons, comptes sociétés et règlements",
    customersDescription: "Gérer vos clients particuliers et comptes sociétés",
    inventoryTitle: "Stock cuves",
    posTitle: "Encaissement",
    posCheckoutLabel: "Encaisser",
    stockCashierTitle: "Stock boutique",
  },
  "electricite-plomberie": {
    storeSingular: "Magasin",
    storesPlural: "Magasins",
    productsTitle: "Matériel élec. & sanitaire",
    productsSubtitle: "Câbles, disjoncteurs, tuyauterie et sanitaires",
    customersTitle: "Clients & installateurs",
    customersDescription: "Gérer vos clients, électriciens et plombiers",
    inventoryTitle: "Stock magasin",
    posTitle: "Caisse",
    posCheckoutLabel: "Encaisser",
  },
  "peinture-decoration": {
    storeSingular: "Magasin",
    storesPlural: "Magasins",
    productsTitle: "Peintures & finitions",
    productsSubtitle: "Teintes, contenances, finitions et rendements",
    customersTitle: "Clients & peintres",
    customersDescription: "Gérer vos clients, peintres et entreprises",
    inventoryTitle: "Stock magasin",
    posTitle: "Caisse",
    posCheckoutLabel: "Encaisser",
  },
  "meubles-ameublement": {
    storeSingular: "Showroom",
    storesPlural: "Showrooms",
    productsTitle: "Mobilier",
    productsSubtitle: "Modèles, dimensions, matières et livraison",
    salesHistoryTitle: "Historique des ventes & livraisons",
    creditSubtitle: "Achats à crédit, échéances et paiements partiels",
    inventoryTitle: "Stock showroom",
    posTitle: "Vente",
    posCheckoutLabel: "Encaisser",
  },
  "menuiserie-metallerie": {
    storeSingular: "Atelier",
    storesPlural: "Ateliers",
    reportsTitle: "Rapports atelier",
    productsTitle: "Ouvrages & fournitures",
    productsSubtitle: "Ouvrages sur mesure, matières et fournitures",
    salesHistoryTitle: "Historique des commandes",
    purchasesTitle: "Achats matières",
    purchasesDescription: "Bois, aluminium, fer et fournitures d'atelier.",
    creditTitle: "Commandes à régler",
    creditSubtitle: "Soldes de commandes livrées, acomptes et échéances",
    customersDescription: "Gérer vos clients et leurs commandes sur mesure",
    inventoryTitle: "Stock atelier",
    posTitle: "Facturation commande",
    posCheckoutLabel: "Facturer",
  },
  "produits-agricoles": {
    storeSingular: "Magasin",
    storesPlural: "Magasins",
    reportsTitle: "Rapports de campagne",
    productsTitle: "Céréales & produits",
    productsSubtitle: "Spéculations, calibres, sacs et campagnes",
    purchasesTitle: "Achats aux producteurs",
    purchasesDescription: "Collectes et achats auprès des producteurs.",
    purchasesCreateActionLabel: "Nouvelle collecte",
    purchasesCreatedToast: "Collecte créée (brouillon)",
    creditSubtitle: "Livraisons non réglées, avances et échéances",
    customersDescription: "Gérer vos acheteurs, transformateurs et exportateurs",
    inventoryTitle: "Stock magasin",
    suppliersTitle: "Producteurs & collecteurs",
    suppliersDescription: "Gérer vos producteurs, groupements et collecteurs",
    suppliersCreateLabel: "Nouveau producteur",
    suppliersEntitySingular: "producteur",
    posTitle: "Vente",
    posCheckoutLabel: "Encaisser",
  },
  "intrants-elevage": {
    storeSingular: "Magasin",
    storesPlural: "Magasins",
    productsTitle: "Intrants & aliments",
    productsSubtitle: "Engrais, semences, phytosanitaires et aliments bétail",
    creditTitle: "Crédit producteurs",
    creditSubtitle: "Intrants à crédit, échéances de campagne et remboursements",
    customersTitle: "Producteurs & éleveurs",
    customersDescription: "Gérer vos producteurs, éleveurs et groupements",
    inventoryTitle: "Stock intrants",
    posTitle: "Vente",
    posCheckoutLabel: "Encaisser",
    expiryReportsTitle: "Péremptions (phyto & vétérinaire)",
    expiredItemsLabel: "Produits périmés",
  },
  "imprimerie-serigraphie": {
    storeSingular: "Agence",
    storesPlural: "Agences",
    productsTitle: "Travaux & supports",
    productsSubtitle: "Prestations, supports, formats et délais",
    salesHistoryTitle: "Historique des commandes facturées",
    purchasesTitle: "Achats consommables",
    purchasesDescription: "Encres, papiers, supports et consommables.",
    creditTitle: "Factures impayées",
    creditSubtitle: "Travaux livrés non réglés, acomptes et échéances",
    customersTitle: "Clients & annonceurs",
    customersDescription: "Gérer vos clients, annonceurs et institutions",
    inventoryTitle: "Stock consommables",
    posTitle: "Facturation travaux",
    posCheckoutLabel: "Facturer",
  },
  "transport-logistique": {
    storeSingular: "Agence",
    storesPlural: "Agences",
    reportsTitle: "Rapports d'exploitation",
    productsTitle: "Services & tarifs",
    productsSubtitle: "Services, unités de facturation et destinations",
    salesHistoryTitle: "Historique des expéditions facturées",
    purchasesTitle: "Achats & charges",
    purchasesDescription: "Carburant, pièces et fournitures d'exploitation.",
    creditTitle: "Factures clients",
    creditSubtitle: "Expéditions non réglées, comptes sociétés et échéances",
    customersTitle: "Expéditeurs & clients",
    customersDescription: "Gérer vos expéditeurs, sociétés et clients réguliers",
    inventoryTitle: "Stock fournitures",
    posTitle: "Guichet",
    posCartTitle: "Expédition",
    posCheckoutLabel: "Encaisser",
  },
  "immobilier-location": {
    storeSingular: "Agence",
    storesPlural: "Agences",
    reportsTitle: "Rapports de gérance",
    productsTitle: "Biens & services",
    productsSubtitle: "Biens proposés, services et frais d'agence",
    salesHistoryTitle: "Historique des encaissements",
    purchasesTitle: "Charges & travaux",
    purchasesDescription: "Travaux, entretien et charges des biens gérés.",
    creditTitle: "Loyers impayés",
    creditSubtitle: "Loyers en retard, échéanciers et règlements partiels",
    customersTitle: "Locataires & propriétaires",
    customersDescription: "Gérer vos locataires, propriétaires et cautions",
    inventoryTitle: "Fournitures",
    posTitle: "Encaissement",
    posCheckoutLabel: "Encaisser",
  },
  "mobile-money-transfert": {
    storeSingular: "Kiosque",
    storesPlural: "Kiosques",
    reportsTitle: "Rapports d'activité",
    productsTitle: "Opérations & services",
    productsSubtitle: "Types d'opérations, opérateurs et commissions",
    salesHistoryTitle: "Historique des opérations",
    purchasesTitle: "Approvisionnements",
    purchasesDescription: "Approvisionnements de flotte, unités et espèces.",
    purchasesCreateActionLabel: "Nouvel approvisionnement",
    creditTitle: "Avances clients",
    creditSubtitle: "Avances accordées et remboursements",
    customersTitle: "Clients réguliers",
    customersDescription: "Gérer vos clients réguliers et comptes commerçants",
    inventoryTitle: "Flotte & unités",
    posTitle: "Guichet",
    posCartTitle: "Opération",
    posCheckoutLabel: "Valider l'opération",
  },
};

export function activityUiTerms(
  businessTypeSlug: string | null | undefined,
): ActivityUiTerms {
  if (!businessTypeSlug) return { ...DEFAULT_UI_TERMS };
  const overrides = UI_TERMS_OVERRIDES[businessTypeSlug];
  if (!overrides) return { ...DEFAULT_UI_TERMS };
  return { ...DEFAULT_UI_TERMS, ...overrides };
}
