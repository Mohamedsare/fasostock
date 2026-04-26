"use client";

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
 */
const ACTIVITY_PROFILES: ActivityProfile[] = [
  {
    slug: "pharmacie",
    hiddenNavHrefs: [],
    navLabelOverrides: {
      [ROUTES.products]: "Médicaments",
      [ROUTES.inventory]: "Stock pharmacie",
      [ROUTES.purchases]: "Approvisionnements",
      [ROUTES.customers]: "Patients",
      [ROUTES.sales]: "Dispensation",
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
      ROUTES.printers,
      ROUTES.settings,
      ROUTES.help,
      ROUTES.notifications,
    ],
  },
  {
    slug: "grossiste-distribution",
    hiddenNavHrefs: [],
    navLabelOverrides: {
      [ROUTES.sales]: "Commandes",
      [ROUTES.customers]: "Clients B2B",
      [ROUTES.reports]: "Pilotage",
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
};

export function activityUiTerms(
  businessTypeSlug: string | null | undefined,
): ActivityUiTerms {
  if (businessTypeSlug === "pharmacie") {
    return {
      storeSingular: "Boutique",
      storesPlural: "Boutiques",
      dashboardTitle: "Tableau de bord",
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
    };
  }
  if (businessTypeSlug === "restaurant-fast-food") {
    return {
      storeSingular: "Point de vente",
      storesPlural: "Points de vente",
      dashboardTitle: "Tableau de bord",
      reportsTitle: "Rapports",
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
      creditTitle: "Crédit client",
      creditSubtitle: "Encours, échéances et paiements partiels des clients",
      customersTitle: "Clients",
      customersDescription: "Gérer vos clients (sur place, emporté, livraison)",
      inventoryTitle: "Stock cuisine",
    };
  }
  if (businessTypeSlug === "grossiste-distribution") {
    return {
      storeSingular: "Boutique",
      storesPlural: "Boutiques",
      dashboardTitle: "Pilotage",
      reportsTitle: "Pilotage",
      productsTitle: "Articles",
      productsSubtitle: "Catalogue, familles et marques",
      salesHistoryTitle: "Historique des commandes",
      purchasesTitle: "Achats",
      purchasesDescription: "Voir, modifier, annuler ou supprimer les achats fournisseurs.",
      purchasesCreateActionLabel: "Nouvel achat",
      purchasesCreatedToast: "Achat créé (brouillon)",
      purchasesCancelledToast: "Achat annulé",
      purchasesDeletedToast: "Achat supprimé",
      purchasesCreateDeniedToast: "Vous n'avez pas le droit de créer des achats.",
      creditTitle: "Crédit client",
      creditSubtitle: "Encours et règlements clients B2B",
      customersTitle: "Clients B2B",
      customersDescription: "Gérer vos clients professionnels (revendeurs, entreprises)",
      inventoryTitle: "Stock",
    };
  }
  if (businessTypeSlug === "materiaux-construction") {
    return {
      storeSingular: "Boutique",
      storesPlural: "Boutiques",
      dashboardTitle: "Tableau de bord",
      reportsTitle: "Rapports chantier",
      productsTitle: "Articles",
      productsSubtitle: "Catalogue chantier, catégories et marques",
      salesHistoryTitle: "Historique des ventes chantier",
      purchasesTitle: "Achats",
      purchasesDescription: "Voir, modifier, annuler ou supprimer les achats.",
      purchasesCreateActionLabel: "Nouvel achat",
      purchasesCreatedToast: "Achat créé (brouillon)",
      purchasesCancelledToast: "Achat annulé",
      purchasesDeletedToast: "Achat supprimé",
      purchasesCreateDeniedToast: "Vous n'avez pas le droit de créer des achats.",
      creditTitle: "Crédit client",
      creditSubtitle: "Encours, échéances et paiements partiels",
      customersTitle: "Clients",
      customersDescription: "Gérer vos clients (particuliers, artisans, entreprises)",
      inventoryTitle: "Stock dépôt",
    };
  }
  return {
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
    creditSubtitle: "Encours, échéances, paiements partiels — aligné sur vos ventes complétées avec client",
    customersTitle: "Clients",
    customersDescription: "Gérer vos clients (particuliers et entreprises)",
    inventoryTitle: "Stock",
  };
}

