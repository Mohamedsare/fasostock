/**
 * Clés TanStack Query — à aligner sur les repositories Flutter / tables Supabase.
 */
export const queryKeys = {
  appContext: ["app-context"] as const,
  company: (id: string) => ["company", id] as const,
  products: (companyId: string) => ["products", companyId] as const,
  productInventory: (storeId: string | null) =>
    ["product-inventory", storeId] as const,
  /** Aligné `purchasesStreamProvider` Flutter — pas de plage de dates par défaut. */
  purchases: (params: {
    companyId: string;
    storeId: string | null;
    supplierId: string | null;
    status: string | null;
  }) => ["purchases", params] as const,
  customers: (companyId: string) => ["customers", companyId] as const,
  suppliers: (companyId: string) => ["suppliers", companyId] as const,
  aiInsights: (params: {
    companyId: string;
    storeId: string | null;
    days: number;
  }) => ["ai-insights", params] as const,
  companyUsers: (companyId: string) => ["company-users", companyId] as const,
  /** Droits effectifs (owner) — préfixe `['user-rights', companyId]` pour invalider toutes les cibles. */
  userRights: (companyId: string, userId: string) =>
    ["user-rights", companyId, userId] as const,
  categories: (companyId: string) => ["categories", companyId] as const,
  brands: (companyId: string) => ["brands", companyId] as const,
  sales: (params: {
    companyId: string;
    storeId: string | null;
    status: string | null;
    from: string;
    to: string;
  }) => ["sales", params] as const,
  stores: (companyId: string) => ["stores", companyId] as const,
  dashboard: (params: {
    companyId: string;
    storeId: string | null;
    period: "today" | "week" | "month";
    selectedDay: string;
  }) => ["dashboard", params] as const,
  reports: (params: {
    companyId: string;
    storeId: string | null;
    fromDate: string;
    toDate: string;
    cashierUserId: string | null;
    productId: string | null;
    categoryId: string | null;
  }) => ["reports", params] as const,
  /** Liste complète par entreprise — filtres appliqués côté client (aligné `TransfersPage` Flutter). */
  stockTransfers: (companyId: string) => ["stock-transfers", companyId] as const,
  stockTransferDetail: (id: string) => ["stock-transfer", id] as const,
  /** Préférences panier POS (aligné `PosCartSettingsProvider` Flutter). */
  posCartSettings: ["pos-cart-settings"] as const,
  /** Dépôt central (`WarehousePage` Flutter) — invalider le préfixe `['warehouse', companyId]`. */
  warehouseInventory: (companyId: string) => ["warehouse", companyId, "inventory"] as const,
  warehouseMovements: (companyId: string) => ["warehouse", companyId, "movements"] as const,
  warehouseDispatch: (companyId: string) => ["warehouse", companyId, "dispatch"] as const,
  warehouseTransfers: (companyId: string) => ["warehouse", companyId, "transfers"] as const,
  /** Badge cloche + page Notifications (aligné `NotificationsRepository` Flutter). */
  notificationsInbox: ["notifications-inbox"] as const,
  notificationsUnread: ["topbar-notifications-unread"] as const,
  /** Panneau owner (ruptures, tendances…) — aligné `OwnerNotificationsDialog` Flutter. */
  ownerNotifications: (companyId: string, storeId: string | null) =>
    ["owner-notifications", companyId, storeId ?? "__all__"] as const,
} as const;
