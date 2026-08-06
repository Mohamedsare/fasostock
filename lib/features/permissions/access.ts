import { P } from "@/lib/constants/permissions";
import { ROUTES } from "@/lib/config/routes";
import type { NavItem } from "@/lib/config/navigation";
import {
  adaptNavItemsForActivity,
  isRouteAllowedForActivity,
} from "@/lib/features/activity/activity-profiles";
import { activityConfig } from "@/lib/features/activity/activity-config";

/** Chemins affichés en menu restreint pendant le chargement des droits (Flutter `cashierPaths`). */
export const CASHIER_FALLBACK_HREFS = [
  ROUTES.sales,
  ROUTES.products,
  ROUTES.customers,
  ROUTES.stockCashier,
] as const;

export type AppContextData = {
  companyId: string;
  companyName: string;
  /** `companies.business_type_slug` — onboarding (personnalisation par activité). */
  businessTypeSlug: string | null;
  /** `companies.logo_url` — menu, factures, paramètres (aligné Flutter). */
  companyLogoUrl: string | null;
  storeId: string | null;
  stores: {
    id: string;
    name: string;
    isPrimary?: boolean;
    engineSalesEnabled?: boolean;
    engineRegistrationEnabled?: boolean;
    progressivePurchasesEnabled?: boolean;
    /** Module Location (gestion locative) activé pour cette boutique. */
    rentalModuleEnabled?: boolean;
    /** Suivi de péremption (DLC/DLUO) ouvert pour cette boutique par la plateforme. */
    expiryModuleEnabled?: boolean;
    /** Module Pièces (compatibilités / équivalences / variantes) ouvert pour cette boutique. */
    partsModuleEnabled?: boolean;
    /**
     * Module Réassort actif pour cette boutique. **Soustractif** : `true` par défaut,
     * le super admin peut le couper. `undefined` (contexte partiel) vaut donc actif.
     */
    restockModuleEnabled?: boolean;
    /** Boutique en ligne ouverte pour cette boutique par la plateforme. */
    onlineStoreEnabled?: boolean;
  }[];
  isSuperAdmin: boolean;
  permissionKeys: string[];
  roleSlug: string | null;
  /** Module Magasin (dépôt) — désactivé par la plateforme si false. */
  warehouseFeatureEnabled: boolean;
  /** Module Achats — masqué par la plateforme si false. */
  purchasesFeatureEnabled: boolean;
  /** Module Transferts — masqué par la plateforme si false. */
  transfersFeatureEnabled: boolean;
  /** Augmentation du quota de boutiques autorisée (plateforme). */
  storeQuotaIncreaseEnabled: boolean;
  /** Prédictions IA — désactivé par la plateforme si false. */
  aiPredictionsEnabled: boolean;
  /** Carte KPI « Valeur au prix d'achat » sur le dépôt Magasin (plateforme). */
  warehouseKpiShowPurchaseValue: boolean;
  /** Carte KPI « Valeur au prix de vente » sur le dépôt Magasin (plateforme). */
  warehouseKpiShowSaleValue: boolean;
  /** Module Comptabilité (SYSCOHADA) — désactivé par défaut ; activé par la plateforme. */
  accountingModuleEnabled: boolean;
  /** Module R. Humaine + Paie — désactivé par défaut ; activé par la plateforme. */
  hrModuleEnabled: boolean;
  /** Génération d'affiches publicitaires IA (promotions) — flag GLOBAL super admin, désactivé par défaut. */
  promoAdGenerationEnabled: boolean;
  /**
   * Suivi de péremption ouvert pour TOUTE l'entreprise par la plateforme
   * (`companies.expiry_module_enabled`). S'ajoute au métier, ne retire rien.
   */
  expiryModuleEnabled: boolean;
  /**
   * Module Pièces ouvert pour TOUTE l'entreprise par la plateforme
   * (`companies.parts_module_enabled`). S'ajoute aux drapeaux boutique.
   */
  partsModuleEnabled: boolean;
  /**
   * Module Réassort actif pour l'entreprise (`companies.restock_module_enabled`).
   * **Soustractif** : vrai par défaut, coupé à la main par le super admin.
   */
  restockModuleEnabled: boolean;
  /**
   * Module Emplacements (rangement physique des produits) — désactivé par défaut,
   * ouvert par le PROPRIÉTAIRE dans Paramètres (`companies.product_locations_enabled`).
   */
  productLocationsEnabled: boolean;
  /**
   * Boutique en ligne ouverte pour TOUTE l'entreprise par la plateforme
   * (`companies.online_store_enabled`). S'ajoute aux drapeaux boutique.
   */
  onlineStoreEnabled: boolean;
  /**
   * Mode dépannage : le super admin travaille dans l'entreprise d'un client.
   * Non nul ⇒ `companyId` ci-dessus est celle du client, pas la sienne.
   * L'intervention est bornée dans le temps et tracée dans le journal d'audit du client.
   */
  supportSession?: {
    id: string;
    companyId: string;
    companyName: string;
    reason: string;
    expiresAt: string;
  } | null;
};

/**
 * Le super admin a-t-il ouvert le module Pièces pour ce contexte ?
 * Entreprise entière, ou boutique courante (vue « toutes boutiques » : au moins une).
 */
export function partsModuleOverride(
  data: AppContextData | null | undefined,
): boolean {
  if (!data) return false;
  if (data.partsModuleEnabled === true) return true;
  if (data.storeId) {
    return (
      data.stores.find((s) => s.id === data.storeId)?.partsModuleEnabled === true
    );
  }
  return data.stores.some((s) => s.partsModuleEnabled === true);
}

/**
 * Le module Réassort est-il actif ici ? Logique **inverse** des autres modules :
 * actif par défaut, il faut que l'entreprise ET la boutique courante l'aient gardé.
 * En vue « toutes boutiques », il suffit qu'une boutique l'ait encore.
 */
export function restockModuleActive(
  data: AppContextData | null | undefined,
): boolean {
  if (!data) return false;
  if (data.restockModuleEnabled === false) return false;
  if (data.storeId) {
    const store = data.stores.find((s) => s.id === data.storeId);
    // Boutique inconnue du contexte : on ne bloque pas sur une donnée manquante.
    return store == null || store.restockModuleEnabled !== false;
  }
  if (data.stores.length === 0) return true;
  return data.stores.some((s) => s.restockModuleEnabled !== false);
}

/**
 * La plateforme a-t-elle ouvert la boutique en ligne ici ?
 * Entreprise entière, ou boutique courante (vue « toutes boutiques » : au moins une).
 */
export function onlineStoreOverride(
  data: AppContextData | null | undefined,
): boolean {
  if (!data) return false;
  if (data.onlineStoreEnabled === true) return true;
  if (data.storeId) {
    return (
      data.stores.find((s) => s.id === data.storeId)?.onlineStoreEnabled === true
    );
  }
  return data.stores.some((s) => s.onlineStoreEnabled === true);
}

/**
 * Le super admin a-t-il ouvert le suivi de péremption pour ce contexte ?
 * Entreprise entière, ou boutique courante (toutes boutiques : au moins une).
 */
export function expiryModuleOverride(
  data: AppContextData | null | undefined,
): boolean {
  if (!data) return false;
  if (data.expiryModuleEnabled === true) return true;
  if (data.storeId) {
    return (
      data.stores.find((s) => s.id === data.storeId)?.expiryModuleEnabled === true
    );
  }
  return data.stores.some((s) => s.expiryModuleEnabled === true);
}

/** Config métier du contexte, drapeaux plateforme (péremption…) déjà appliqués. */
export function activityConfigForContext(
  data: AppContextData | null | undefined,
): ReturnType<typeof activityConfig> {
  return activityConfig(data?.businessTypeSlug, {
    expiryModule: expiryModuleOverride(data),
  });
}

export type AccessHelpers = {
  hasPermission: (key: string) => boolean;
  isOwner: boolean;
  isCashier: boolean;
  canDashboard: boolean;
  canProducts: boolean;
  canSales: boolean;
  /** Module Vente Engins — boutique courante autorisée par la plateforme ET droit ventes. */
  canEngineSales: boolean;
  /** Module Immatriculation Engins — boutique autorisée ET droit ventes. */
  canEngineRegistration: boolean;
  /** Module Achats Progressifs — boutique autorisée ET droit dédié (ou propriétaire). */
  canProgressive: boolean;
  /** Module Location — boutique autorisée ET droit dédié (ou propriétaire). */
  canRental: boolean;
  canStores: boolean;
  canInventory: boolean;
  canPurchases: boolean;
  canCustomers: boolean;
  canSuppliers: boolean;
  canReports: boolean;
  canAi: boolean;
  canUsers: boolean;
  canSettings: boolean;
  canTransfers: boolean;
  canAudit: boolean;
  /** Propriétaire ou permission dépôt central (Magasinier). */
  canWarehouse: boolean;
  /** Propriétaire ou permission page Crédit / créances. */
  canCredit: boolean;
  /** Propriétaire ou permission page Code Barre. */
  canBarcodes: boolean;
  /** Propriétaire ou permission page Promotions. */
  canPromotions: boolean;
  /** Module Pièces ouvert par la plateforme (entreprise ou boutique courante). */
  partsModuleOn: boolean;
  /** Page Pièces : module ouvert ET propriétaire / permission dédiée. */
  canParts: boolean;
  /** Module Réassort actif (non coupé par la plateforme) pour ce périmètre. */
  restockModuleOn: boolean;
  /** Page Réassort : module actif ET propriétaire / permission dédiée. */
  canRestock: boolean;
  /** Module Emplacements ouvert par le propriétaire pour l'entreprise. */
  productLocationsOn: boolean;
  /** Page Emplacements : module ouvert ET propriétaire / permission dédiée. */
  canProductLocations: boolean;
  /** Boutique en ligne ouverte par la plateforme (entreprise ou boutique courante). */
  onlineStoreOn: boolean;
  /** Page Boutique en ligne : module ouvert ET propriétaire / permission dédiée. */
  canOnlineStore: boolean;
  /**
   * Suivi de péremption (DLC/DLUO) actif pour ce contexte : métier concerné
   * (pharmacie, supermarché…) ou drapeau ouvert par le super admin.
   */
  expiryModuleOn: boolean;
  /** Page Péremptions : module actif ET propriétaire / permission dédiée. */
  canExpiry: boolean;
  /** Propriétaire ou permission de consultation des dépenses. */
  canExpenses: boolean;
  /** Propriétaire ou permission de gestion (CRUD) des dépenses. */
  canManageExpenses: boolean;
  /** Module Comptabilité activé par la plateforme ET droit de consultation. */
  canAccounting: boolean;
  /** Comptabilité : droit de gestion (saisie / modification des écritures). */
  canManageAccounting: boolean;
  /** Module R. Humaine activé par la plateforme ET droit de consultation. */
  canHr: boolean;
  /** RH : droit de gestion (employés, contrats, congés). */
  canManageHr: boolean;
  /** Paie : droit de gestion (bulletins, barèmes) — implique module RH activé. */
  canPayroll: boolean;
};

/** Construit les helpers à partir du contexte (même logique que `app_shell.dart` Flutter). */
export function buildAccessHelpers(
  data: AppContextData | null | undefined,
): AccessHelpers | null {
  if (!data) return null;
  const set = new Set(data.permissionKeys);
  const hasPermission = (key: string) =>
    data.isSuperAdmin || set.has(key);

  const isOwner = data.roleSlug === "owner";
  const isCashier = data.roleSlug === "cashier";

  const canReports =
    hasPermission(P.reportsViewGlobal) || hasPermission(P.reportsViewStore);
  const canAi =
    hasPermission(P.aiInsightsView) && data.aiPredictionsEnabled !== false;
  const canUsers =
    hasPermission(P.usersManage) || isOwner;
  const canSettings = hasPermission(P.settingsManage);
  const canTransfers =
    (hasPermission(P.stockTransfer) ||
      hasPermission(P.transfersCreate) ||
      hasPermission(P.transfersApprove)) &&
    data.transfersFeatureEnabled !== false;
  const canDashboard = hasPermission(P.dashboardView);
  const canProducts =
    hasPermission(P.productsView) ||
    hasPermission(P.productsCreate) ||
    hasPermission(P.productsUpdate) ||
    hasPermission(P.productsDelete);
  const canSales =
    hasPermission(P.salesView) ||
    hasPermission(P.salesCreate) ||
    hasPermission(P.salesInvoiceA4);
  // Vente Engins : visible si la boutique COURANTE est autorisée (ou, en vue
  // « toutes boutiques », si au moins une l'est) ET l'utilisateur peut vendre.
  const activeStore = data.stores.find((s) => s.id === data.storeId);
  const engineStoreOn = data.storeId
    ? activeStore?.engineSalesEnabled === true
    : data.stores.some((s) => s.engineSalesEnabled === true);
  const canEngineSales =
    engineStoreOn &&
    (hasPermission(P.salesInvoiceA4) ||
      hasPermission(P.salesCreate) ||
      hasPermission(P.salesView));
  // Immatriculation Engins : même logique de gating par boutique que Vente Engins.
  const registrationStoreOn = data.storeId
    ? activeStore?.engineRegistrationEnabled === true
    : data.stores.some((s) => s.engineRegistrationEnabled === true);
  const canEngineRegistration =
    registrationStoreOn &&
    (hasPermission(P.salesInvoiceA4) ||
      hasPermission(P.salesCreate) ||
      hasPermission(P.salesView) ||
      hasPermission(P.salesUpdate));
  // Achats Progressifs : même gating par boutique que les modules engins, mais
  // avec un droit dédié (owner par défaut) car il s'agit d'argent encaissé.
  const progressiveStoreOn = data.storeId
    ? activeStore?.progressivePurchasesEnabled === true
    : data.stores.some((s) => s.progressivePurchasesEnabled === true);
  const canProgressive =
    progressiveStoreOn && (isOwner || hasPermission(P.progressiveManage));
  // Location : module autonome (gestion locative), gating par boutique + droit dédié.
  const rentalStoreOn = data.storeId
    ? activeStore?.rentalModuleEnabled === true
    : data.stores.some((s) => s.rentalModuleEnabled === true);
  const canRental = rentalStoreOn && (isOwner || hasPermission(P.rentalManage));
  const canStores =
    hasPermission(P.storesView) || hasPermission(P.storesCreate);
  const canInventory =
    hasPermission(P.stockView) ||
    hasPermission(P.stockAdjust) ||
    hasPermission(P.stockTransfer);
  const canPurchases =
    (hasPermission(P.purchasesView) ||
      hasPermission(P.purchasesCreate) ||
      hasPermission(P.purchasesCancel) ||
      hasPermission(P.purchasesUpdate) ||
      hasPermission(P.purchasesDelete)) &&
    data.purchasesFeatureEnabled !== false;
  const canCustomers =
    hasPermission(P.customersView) || hasPermission(P.customersManage);
  const canSuppliers =
    hasPermission(P.suppliersView) || hasPermission(P.suppliersManage);
  const canAudit = hasPermission(P.auditView) || isOwner;
  const canWarehouse =
    (isOwner || hasPermission(P.warehouseManage)) &&
    data.warehouseFeatureEnabled !== false;
  const canCredit = isOwner || hasPermission(P.creditView);
  const canBarcodes = isOwner || hasPermission(P.barcodesManage);
  const canPromotions = isOwner || hasPermission(P.promotionsManage);
  // Pièces : additif comme la péremption — rien n'apparaît tant que la plateforme
  // n'a pas ouvert le module pour l'entreprise ou pour la boutique en cours.
  const partsModuleOn = partsModuleOverride(data);
  const canParts = partsModuleOn && (isOwner || hasPermission(P.partsManage));
  // Réassort : soustractif — proposé à tous les métiers, coupé à la main si besoin.
  const restockModuleOn = restockModuleActive(data);
  const canRestock = restockModuleOn && (isOwner || hasPermission(P.restockView));
  // Emplacements : additif, mais ouvert par le PROPRIÉTAIRE lui-même (Paramètres),
  // pas par la plateforme. Rien n'apparaît tant qu'il ne l'a pas activé.
  const productLocationsOn = data.productLocationsEnabled === true;
  const canProductLocations =
    productLocationsOn && (isOwner || hasPermission(P.productLocationsManage));
  // Boutique en ligne : additif, ouvert par la PLATEFORME (entreprise ou boutique).
  const onlineStoreOn = onlineStoreOverride(data);
  const canOnlineStore =
    onlineStoreOn && (isOwner || hasPermission(P.onlineStoreManage));
  // Péremptions : réservé aux métiers à suivi de lots (pharmacie, supermarché…) ou
  // aux entreprises / boutiques pour lesquelles le super admin l'a ouvert.
  const expiryModuleOn = activityConfigForContext(data).expiryDashboard;
  const canExpiry = expiryModuleOn && (isOwner || hasPermission(P.expiryView));
  const canManageExpenses = isOwner || hasPermission(P.expensesManage);
  const canExpenses =
    isOwner || hasPermission(P.expensesView) || canManageExpenses;

  // Modules plateforme : visibles seulement si le super admin les a activés pour l'entreprise.
  const accountingOn = data.accountingModuleEnabled === true;
  const hrOn = data.hrModuleEnabled === true;
  const canManageAccounting =
    accountingOn && (isOwner || hasPermission(P.accountingManage));
  const canAccounting =
    accountingOn && (isOwner || hasPermission(P.accountingView) || canManageAccounting);
  const canManageHr = hrOn && (isOwner || hasPermission(P.hrManage));
  const canHr = hrOn && (isOwner || hasPermission(P.hrView) || canManageHr);
  const canPayroll = hrOn && (isOwner || hasPermission(P.payrollManage));

  return {
    hasPermission,
    isOwner,
    isCashier,
    canDashboard,
    canProducts,
    canSales,
    canEngineSales,
    canEngineRegistration,
    canProgressive,
    canRental,
    canStores,
    canInventory,
    canPurchases,
    canCustomers,
    canSuppliers,
    canReports,
    canAi,
    canUsers,
    canSettings,
    canTransfers,
    canAudit,
    canWarehouse,
    canCredit,
    canBarcodes,
    canPromotions,
    partsModuleOn,
    canParts,
    restockModuleOn,
    canRestock,
    productLocationsOn,
    canProductLocations,
    onlineStoreOn,
    canOnlineStore,
    expiryModuleOn,
    canExpiry,
    canExpenses,
    canManageExpenses,
    canAccounting,
    canManageAccounting,
    canHr,
    canManageHr,
    canPayroll,
  };
}

/**
 * Filtre les entrées de navigation comme `visibleNavItems` dans `app_shell.dart` (Flutter).
 */
const cashierFallbackSet = new Set<string>(CASHIER_FALLBACK_HREFS);

export function filterNavItemsForPermissions(
  items: NavItem[],
  h: AccessHelpers | null,
  permissionsLoading: boolean,
  businessTypeSlug?: string | null,
): NavItem[] {
  if (permissionsLoading) {
    return adaptNavItemsForActivity(
      items.filter((i) => cashierFallbackSet.has(i.href)),
      businessTypeSlug,
    );
  }

  if (!h) {
    return adaptNavItemsForActivity(
      items.filter((i) => cashierFallbackSet.has(i.href)),
      businessTypeSlug,
    );
  }

  const filtered = items.filter((item) => {
    if (item.kind === "section") return true;
    const href = item.href;
    if (href === ROUTES.stockCashier) {
      return h.canInventory && !h.isOwner;
    }
    if (href === ROUTES.dashboard) return h.canDashboard;
    if (href === ROUTES.products) return h.canProducts;
    if (href === ROUTES.parts) return h.canParts;
    if (href === ROUTES.restock) return h.canRestock;
    if (href === ROUTES.productLocations) return h.canProductLocations;
    if (href === ROUTES.onlineStore) return h.canOnlineStore;
    if (href === ROUTES.barcodes) return h.canBarcodes;
    if (href === ROUTES.sales) return h.canSales;
    if (href === ROUTES.promotions) return h.canPromotions;
    if (href === ROUTES.engines) return h.canEngineSales;
    if (href === ROUTES.engineRegistration) return h.canEngineRegistration;
    if (href === ROUTES.progressive) return h.canProgressive;
    if (href === ROUTES.rental) return h.canRental;
    if (href === ROUTES.stores) return h.canStores;
    if (href === ROUTES.inventory) return h.canInventory && !h.isCashier;
    if (href === ROUTES.inventorySessions) {
      // Droit dédié « Faire l'inventaire » (ou propriétaire). Masqué aux caissiers.
      return (h.isOwner || h.hasPermission(P.inventoryManage)) && !h.isCashier;
    }
    // `canExpiry` porte déjà la condition « suivi de péremption actif » (métier ou
    // drapeau plateforme) en plus du droit utilisateur.
    if (href === ROUTES.expiry) return h.canExpiry;
    if (href === ROUTES.purchases) return h.canPurchases;
    if (href === ROUTES.expenses) return h.canExpenses;
    if (href === ROUTES.warehouse) return h.canWarehouse;
    if (href === ROUTES.customers) return h.canCustomers;
    if (href === ROUTES.credit) return h.canCredit;
    if (href === ROUTES.suppliers) return h.canSuppliers;
    if (href === ROUTES.reports) return h.canReports;
    /** Même logique que `app_shell.dart` (Flutter) — pas de filtre `isCashier` sur le menu. */
    if (href === ROUTES.ai) return h.canAi;
    if (href === ROUTES.users) return h.canUsers;
    if (href === ROUTES.settings) return h.canSettings;
    if (href === ROUTES.transfers) return h.canTransfers;
    if (href === ROUTES.accounting) return h.canAccounting;
    if (href === ROUTES.hr) return h.canHr;
    if (href === ROUTES.audit) return h.canAudit && !h.isOwner;
    // Aide : visible par tous (tutoriels vidéo + contacts). Le guide détaillé interne reste owner.
    if (href === ROUTES.help) return true;
    if (href === ROUTES.subscription) return h.isOwner;
    if (href === ROUTES.integrations) return false;
    return true;
  });

  // Navigation hiérarchique dédiée (restaurant) : garder l'ordre défini tel quel.
  if (filtered.some((item) => item.kind === "section")) return filtered;

  return adaptNavItemsForActivity(filtered, businessTypeSlug);
}

/** Normalise le chemin (sans query, sans slash final) pour la garde de route. */
function normalizeAppRoute(pathname: string): string {
  const p = pathname.split("?")[0] ?? pathname;
  const trimmed = p.replace(/\/+$/, "") || "/";
  if (trimmed === "/" || trimmed === "") return ROUTES.dashboard;
  return trimmed;
}

/**
 * Préfixes de routes sous `ShellRoute` (`app_router.dart` Flutter) — même principe que
 * `GoRouter.redirect` : pas de contrôle de permission sur ces chemins (sauf POS ci‑dessous) ;
 * chaque écran applique ses propres règles (ex. `settings_page` caissier → ventes,
 * `warehouse_page` non‑owner → carte « Accès réservé », etc.).
 */
const APP_SHELL_ROUTE_PREFIXES: readonly string[] = [
  ROUTES.dashboard,
  ROUTES.products,
  ROUTES.parts,
  ROUTES.restock,
  ROUTES.productLocations,
  ROUTES.onlineStore,
  ROUTES.barcodes,
  ROUTES.sales,
  ROUTES.promotions,
  ROUTES.engines,
  ROUTES.engineRegistration,
  ROUTES.progressive,
  ROUTES.rental,
  ROUTES.stores,
  ROUTES.inventory,
  ROUTES.inventorySessions,
  ROUTES.stockCashier,
  ROUTES.expiry,
  ROUTES.purchases,
  ROUTES.expenses,
  ROUTES.warehouse,
  ROUTES.transfers,
  ROUTES.customers,
  ROUTES.credit,
  ROUTES.suppliers,
  ROUTES.reports,
  ROUTES.ai,
  ROUTES.accounting,
  ROUTES.hr,
  ROUTES.users,
  ROUTES.audit,
  ROUTES.settings,
  ROUTES.help,
  ROUTES.subscription,
  ROUTES.integrations,
  "/restaurant",
];

function isAppShellRoute(route: string): boolean {
  for (const prefix of APP_SHELL_ROUTE_PREFIXES) {
    if (route === prefix || route.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

/**
 * Garde de route alignée sur `GoRouter` Flutter (`redirect` + routes shell) :
 * - utilisateur connecté : toutes les routes shell autorisées (les pages gèrent les droits) ;
 * - seules exceptions : caisse rapide (`sales.create`) et POS facture A4 (`sales.invoice_a4`).
 */
export function canAccessPathname(
  pathname: string,
  h: AccessHelpers | null,
  businessTypeSlug?: string | null,
): boolean {
  if (!h) return false;
  const p = pathname.split("?")[0] ?? pathname;

  if (p.startsWith("/stores/") && p.endsWith("/pos-quick")) {
    return (
      h.hasPermission(P.salesCreate) || h.hasPermission(P.salesUpdate)
    );
  }
  if (p.startsWith("/stores/") && p.endsWith("/pos") && !p.endsWith("/pos-quick")) {
    return (
      h.hasPermission(P.salesInvoiceA4) ||
      h.hasPermission(P.salesCreate) ||
      h.hasPermission(P.salesUpdate)
    );
  }
  if (p.startsWith("/stores/") && p.endsWith("/vente-engin")) {
    return (
      h.hasPermission(P.salesInvoiceA4) ||
      h.hasPermission(P.salesCreate) ||
      h.hasPermission(P.salesUpdate)
    );
  }
  if (p.startsWith("/stores/") && p.endsWith("/facture-tab")) {
    const canA4 =
      h.hasPermission(P.salesInvoiceA4) || h.hasPermission(P.salesCreate);
    return (
      h.hasPermission(P.salesUpdate) ||
      (h.hasPermission(P.salesInvoiceA4Table) && canA4)
    );
  }

  const route = normalizeAppRoute(pathname);
  if (!isRouteAllowedForActivity(route, businessTypeSlug)) return false;
  // Page Péremptions : suivi actif (métier ou drapeau plateforme) — accès URL direct.
  // Le droit utilisateur, lui, reste géré par l'écran (carte « Accès réservé »).
  if (route === ROUTES.expiry && !h.expiryModuleOn) return false;
  // Mêmes gardes pour les modules Pièces (ouvert par la plateforme) et Réassort
  // (actif par défaut, coupé par la plateforme) : l'URL directe ne contourne rien.
  if (route === ROUTES.parts && !h.partsModuleOn) return false;
  if (route === ROUTES.restock && !h.restockModuleOn) return false;
  // Emplacements : tant que le propriétaire n'a pas activé le module, l'URL directe
  // ne mène nulle part non plus.
  if (route === ROUTES.productLocations && !h.productLocationsOn) return false;
  // Boutique en ligne : tant que la plateforme ne l'a pas ouverte, l'URL ne mène nulle part.
  if (route === ROUTES.onlineStore && !h.onlineStoreOn) return false;
  return isAppShellRoute(route);
}
