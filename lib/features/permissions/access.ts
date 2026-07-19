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
  stores: { id: string; name: string; isPrimary?: boolean; engineSalesEnabled?: boolean }[];
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
};

export type AccessHelpers = {
  hasPermission: (key: string) => boolean;
  isOwner: boolean;
  isCashier: boolean;
  canDashboard: boolean;
  canProducts: boolean;
  canSales: boolean;
  /** Module Vente Engins — boutique courante autorisée par la plateforme ET droit ventes. */
  canEngineSales: boolean;
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
  /** Propriétaire ou permission page Péremptions (DLC/DLUO). */
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
  const canExpiry = isOwner || hasPermission(P.expiryView);
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
    if (href === ROUTES.barcodes) return h.canBarcodes;
    if (href === ROUTES.sales) return h.canSales;
    if (href === ROUTES.engines) return h.canEngineSales;
    if (href === ROUTES.stores) return h.canStores;
    if (href === ROUTES.inventory) return h.canInventory && !h.isCashier;
    if (href === ROUTES.expiry) {
      // Page réservée aux métiers à suivi de péremption (pharmacie, supermarché…).
      return h.canExpiry && activityConfig(businessTypeSlug).expiryDashboard;
    }
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
    if (href === ROUTES.settings || href === ROUTES.printers) return h.canSettings;
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
  ROUTES.barcodes,
  ROUTES.sales,
  ROUTES.engines,
  ROUTES.stores,
  ROUTES.inventory,
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
  ROUTES.printers,
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
  // Page Péremptions : réservée aux métiers à suivi de lots (accès URL direct).
  if (route === ROUTES.expiry && !activityConfig(businessTypeSlug).expiryDashboard) {
    return false;
  }
  return isAppShellRoute(route);
}
