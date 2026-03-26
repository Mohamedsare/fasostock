import { P } from "@/lib/constants/permissions";
import { ROUTES } from "@/lib/config/routes";
import type { NavItem } from "@/lib/config/navigation";

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
  storeId: string | null;
  stores: { id: string; name: string }[];
  isSuperAdmin: boolean;
  permissionKeys: string[];
  roleSlug: string | null;
};

export type AccessHelpers = {
  hasPermission: (key: string) => boolean;
  isOwner: boolean;
  isCashier: boolean;
  canDashboard: boolean;
  canProducts: boolean;
  canSales: boolean;
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
  const canAi = hasPermission(P.aiInsightsView);
  const canUsers =
    hasPermission(P.usersManage) || isOwner;
  const canSettings = hasPermission(P.settingsManage);
  const canTransfers =
    hasPermission(P.stockTransfer) ||
    hasPermission(P.transfersCreate) ||
    hasPermission(P.transfersApprove);
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
  const canStores =
    hasPermission(P.storesView) || hasPermission(P.storesCreate);
  const canInventory =
    hasPermission(P.stockView) ||
    hasPermission(P.stockAdjust) ||
    hasPermission(P.stockTransfer);
  const canPurchases =
    hasPermission(P.purchasesView) ||
    hasPermission(P.purchasesCreate) ||
    hasPermission(P.purchasesCancel) ||
    hasPermission(P.purchasesUpdate) ||
    hasPermission(P.purchasesDelete);
  const canCustomers =
    hasPermission(P.customersView) || hasPermission(P.customersManage);
  const canSuppliers =
    hasPermission(P.suppliersView) || hasPermission(P.suppliersManage);
  const canAudit = hasPermission(P.auditView) || isOwner;

  return {
    hasPermission,
    isOwner,
    isCashier,
    canDashboard,
    canProducts,
    canSales,
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
): NavItem[] {
  if (permissionsLoading) {
    return items.filter((i) => cashierFallbackSet.has(i.href));
  }

  if (!h) {
    return items.filter((i) => cashierFallbackSet.has(i.href));
  }

  return items.filter((item) => {
    const href = item.href;
    if (href === ROUTES.stockCashier) {
      return h.canInventory && !h.isOwner;
    }
    if (href === ROUTES.dashboard) return h.canDashboard;
    if (href === ROUTES.products) return h.canProducts;
    if (href === ROUTES.sales) return h.canSales;
    if (href === ROUTES.stores) return h.canStores;
    if (href === ROUTES.inventory) return h.canInventory && !h.isCashier;
    if (href === ROUTES.purchases) return h.canPurchases;
    if (href === ROUTES.warehouse) return h.isOwner;
    if (href === ROUTES.customers) return h.canCustomers;
    if (href === ROUTES.suppliers) return h.canSuppliers;
    if (href === ROUTES.reports) return h.canReports;
    if (href === ROUTES.ai) return h.canAi;
    if (href === ROUTES.users) return h.canUsers;
    if (href === ROUTES.settings) return h.canSettings;
    if (href === ROUTES.transfers) return h.canTransfers;
    if (href === ROUTES.audit) return h.canAudit && !h.isOwner;
    if (href === ROUTES.help) return h.isOwner;
    if (href === ROUTES.notifications) return h.isOwner;
    if (href === ROUTES.integrations) return false;
    return true;
  });
}

/**
 * Vérifie l’accès à une URL (garde de route). Aligné sur les mêmes règles que le menu.
 */
export function canAccessPathname(pathname: string, h: AccessHelpers | null): boolean {
  if (!h) return false;
  const p = pathname.split("?")[0] ?? pathname;

  if (p.startsWith("/stores/") && (p.endsWith("/pos") || p.endsWith("/pos-quick"))) {
    return h.canSales;
  }

  const route = p === "/" || p === "" ? ROUTES.dashboard : p;

  if (route === ROUTES.dashboard || route === "/") return h.canDashboard;
  if (route.startsWith(ROUTES.products)) return h.canProducts;
  if (route.startsWith(ROUTES.sales)) return h.canSales;
  if (route.startsWith(ROUTES.stores)) return h.canStores;
  if (route.startsWith(ROUTES.inventory)) return h.canInventory && !h.isCashier;
  if (route.startsWith(ROUTES.stockCashier)) return h.canInventory && !h.isOwner;
  if (route.startsWith(ROUTES.purchases)) return h.canPurchases;
  if (route.startsWith(ROUTES.warehouse)) return h.isOwner;
  if (route.startsWith(ROUTES.transfers)) return h.canTransfers;
  if (route.startsWith(ROUTES.customers)) return h.canCustomers;
  if (route.startsWith(ROUTES.suppliers)) return h.canSuppliers;
  if (route.startsWith(ROUTES.reports)) return h.canReports;
  if (route.startsWith(ROUTES.ai)) return h.canAi;
  if (route.startsWith(ROUTES.users)) return h.canUsers;
  if (route.startsWith(ROUTES.audit)) return h.canAudit && !h.isOwner;
  if (route.startsWith(ROUTES.settings)) return h.canSettings;
  if (route.startsWith(ROUTES.help)) return h.isOwner;
  if (route.startsWith(ROUTES.notifications)) return h.isOwner;
  if (route.startsWith(ROUTES.integrations)) return h.canSettings || h.isOwner;

  return true;
}
