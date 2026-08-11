/**
 * Clés TanStack Query — à aligner sur les repositories Flutter / tables Supabase.
 */
import type { DashboardPeriod } from "@/lib/features/dashboard/date-range";

export const queryKeys = {
  appContext: ["app-context"] as const,
  company: (id: string) => ["company", id] as const,
  /** Catalogue complet (`ProductItem[]`) — ne PAS réutiliser pour une projection allégée. */
  products: (companyId: string) => ["products", companyId] as const,
  /**
   * Projection allégée pour les sélecteurs de produits (`listProductsForPicker`).
   * Clé distincte de `products` — la forme diffère — mais **préfixée** par elle pour rester
   * couverte par les `invalidateQueries({ queryKey: products(companyId) })` existants.
   */
  productsPicker: (companyId: string) => ["products", companyId, "picker"] as const,
  /** Module Pièces — modèles (moto / auto / appareil) de l'entreprise. */
  partModels: (companyId: string) => ["parts", companyId, "models"] as const,
  /** Module Pièces — compatibilités `produit → modèles` de l'entreprise (caisse). */
  partCompatibilities: (companyId: string) =>
    ["parts", companyId, "compatibilities"] as const,
  /** Réglage owner « afficher le modèle compatible en caisse » (`company_settings`). */
  partsPosModelsEnabled: (companyId: string) => ["parts-pos-models", companyId] as const,
  /** Module Pièces — pièces compatibles avec un modèle (ou une recherche texte). */
  partsCompatible: (params: {
    companyId: string;
    storeId: string | null;
    modelId: string | null;
    query: string;
  }) => ["parts", params.companyId, "compatible", params] as const,
  /** Module Pièces — produits ayant au moins une équivalence. */
  partsEquivalencesOverview: (companyId: string, storeId: string | null) =>
    ["parts", companyId, "equivalences", storeId ?? "__all__"] as const,
  /** Module Pièces — remplaçants d'un produit précis (avec stock). */
  partsEquivalencesFor: (productId: string, storeId: string | null) =>
    ["parts", "equivalences-for", productId, storeId ?? "__all__"] as const,
  /** Module Pièces — familles de déclinaisons et leurs membres. */
  partsVariantGroups: (companyId: string, storeId: string | null) =>
    ["parts", companyId, "variant-groups", storeId ?? "__all__"] as const,
  /** Module Réassort — produits à recommander + quantité conseillée. */
  restockCandidates: (params: {
    companyId: string;
    storeId: string | null;
    days: number;
    coverDays: number;
  }) => ["restock", params] as const,
  /** Module Emplacements — modèle d'organisation d'une boutique (niveaux + statut). */
  locationScheme: (storeId: string | null) =>
    ["product-locations", storeId ?? "__none__", "scheme"] as const,
  /** Module Emplacements — arbre des emplacements d'une boutique. */
  locationTree: (storeId: string | null) =>
    ["product-locations", storeId ?? "__none__", "tree"] as const,
  /** Module Emplacements — rangements `product_id → emplacement` d'une boutique. */
  productLocations: (storeId: string | null) =>
    ["product-locations", storeId ?? "__none__", "assignments"] as const,
  /** Réglage owner « afficher l'emplacement en caisse » (`company_settings`). */
  productLocationsPosEnabled: (companyId: string) =>
    ["product-locations-pos", companyId] as const,
  /** Module Emplacements — recherche « c'est où ? ». */
  productLocationSearch: (storeId: string | null, query: string) =>
    ["product-locations", storeId ?? "__none__", "search", query] as const,
  /** Module Prix de revient — arrivages d'une entreprise (préfixe `['cost-batches']`). */
  costBatches: (companyId: string, storeId: string | null) =>
    ["cost-batches", companyId, storeId ?? "__all__"] as const,
  /** Lignes produits d'un arrivage. */
  costBatchItems: (batchId: string) => ["cost-batches", "items", batchId] as const,
  /** Frais d'approche d'un arrivage. */
  costBatchCharges: (batchId: string) => ["cost-batches", "charges", batchId] as const,
  /** Calcul serveur d'un arrivage (frais répartis, coûts, prix conseillés). */
  costBatchCompute: (batchId: string) => ["cost-batches", "compute", batchId] as const,
  /** Achats déjà saisis, importables dans un arrivage. */
  costBatchImportable: (companyId: string, storeId: string | null) =>
    ["cost-batches", "importable", companyId, storeId ?? "__all__"] as const,
  /** Historique des changements de prix d'un produit. */
  productPriceHistory: (productId: string) => ["product-price-history", productId] as const,
  /** Tous les SKU (y compris produits supprimés) — pour la génération auto sans collision. */
  productSkus: (companyId: string) => ["product-skus", companyId] as const,
  /** Stock brut d'une boutique : `Record<product_id, quantité>` (`listStoreInventory`). */
  productInventory: (storeId: string | null) =>
    ["product-inventory", storeId] as const,
  /**
   * Données agrégées de l'écran Stock (`fetchInventoryScreenData` : lignes + seuil + catégories).
   * Clé distincte de `productInventory` — la forme diffère — mais **préfixée** par elle pour
   * rester couverte par les `invalidateQueries({ queryKey: productInventory(storeId) })` existants.
   */
  inventoryScreen: (companyId: string, storeId: string | null) =>
    ["product-inventory", storeId, "screen", companyId] as const,
  /** Aligné `purchasesStreamProvider` Flutter — pas de plage de dates par défaut. */
  purchases: (params: {
    companyId: string;
    storeId: string | null;
    supplierId: string | null;
    status: string | null;
  }) => ["purchases", params] as const,
  /** Ventes d'engins (module Vente Engins). */
  engineSales: (params: { companyId: string; storeId: string | null }) =>
    ["engine-sales", params] as const,
  /** Engins identifiés d'un produit (châssis / moteur / couleur) — fiche produit. */
  engineUnits: (productId: string) => ["engine-units", productId] as const,
  /** Engins encore en stock pour ce produit — choix de la moto à la vente. */
  engineUnitsAvailable: (productId: string, storeId: string | null) =>
    ["engine-units", productId, "available", storeId ?? "__all__"] as const,
  /** Dossiers d'immatriculation engins (module Immatriculation Engins). */
  engineRegistrations: (params: { companyId: string; storeId: string | null }) =>
    ["engine-registrations", params] as const,
  /** Dossiers d'achat progressif (module Achats Progressifs). */
  progressivePlans: (params: { companyId: string; storeId: string | null }) =>
    ["progressive-plans", params] as const,
  /** Relevé (versements / remboursements) d'un dossier d'achat progressif. */
  progressiveLedger: (planId: string) => ["progressive-ledger", planId] as const,
  /** Module Location — baux et leurs agrégats de règlement. */
  rentalLeases: (params: { companyId: string; storeId: string | null }) =>
    ["rental-leases", params] as const,
  /** Module Location — biens immobiliers (occupation, rendement). */
  rentalProperties: (params: { companyId: string; storeId: string | null }) =>
    ["rental-properties", params] as const,
  /** Module Location — lots louables. */
  rentalUnits: (params: { companyId: string; storeId: string | null }) =>
    ["rental-units", params] as const,
  /** Module Location — locataires. */
  rentalTenants: (companyId: string) => ["rental-tenants", companyId] as const,
  /** Module Location — charges du bailleur. */
  rentalCharges: (params: { companyId: string; storeId: string | null }) =>
    ["rental-charges", params] as const,
  /** Module Location — indicateurs du mois. */
  rentalStats: (params: { companyId: string; storeId: string | null; month: string | null }) =>
    ["rental-stats", params] as const,
  /** Module Location — échéancier d'un bail. */
  rentalSchedule: (leaseId: string) => ["rental-schedule", leaseId] as const,
  /** Module Location — encaissements d'un bail. */
  rentalPayments: (leaseId: string) => ["rental-payments", leaseId] as const,
  customers: (companyId: string) => ["customers", companyId] as const,
  suppliers: (companyId: string) => ["suppliers", companyId] as const,
  /** Fournisseurs + situation de dette (RPC `supplier_payables_overview`). */
  supplierAccounts: (companyId: string) => ["supplier-accounts", companyId] as const,
  /** Dettes fournisseurs — `settled` inclut l'historique soldé. */
  supplierInvoices: (params: {
    companyId: string;
    supplierId: string | null;
    settled: boolean;
  }) => ["supplier-invoices", params] as const,
  /** Règlements versés aux fournisseurs. */
  supplierPayments: (params: {
    companyId: string;
    supplierId: string | null;
    from: string | null;
    to: string | null;
  }) => ["supplier-payments", params] as const,
  /** Imputations règlement → dette, pour le relevé d'un fournisseur. */
  supplierAllocations: (companyId: string, supplierId: string) =>
    ["supplier-allocations", companyId, supplierId] as const,
  /** Dépenses sur une plage de dates (filtres catégorie/recherche côté client). */
  expenses: (params: { companyId: string; from: string; to: string }) =>
    ["expenses", params] as const,
  /** Postes de dépense propres à l'entreprise (« Personnaliser mes dépenses »). */
  expenseCategories: (companyId: string, includeArchived = false) =>
    ["expense-categories", companyId, includeArchived] as const,
  aiInsights: (params: {
    companyId: string;
    storeId: string | null;
    days: number;
  }) => ["ai-insights", params] as const,
  companyUsers: (companyId: string) => ["company-users", companyId] as const,
  /** Affectations employé <-> boutique de l'entreprise (un employé peut en avoir plusieurs). */
  companyStoreAssignments: (companyId: string) =>
    ["company-store-assignments", companyId] as const,
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
  /**
   * Coût d'achat des ventes affichées (colonne « Bénéfice ») — clé bâtie sur la page
   * de résultats en cours, pas sur la période : on ne charge que ce qui est à l'écran.
   */
  salesCost: (saleIds: string[]) => ["sales-cost", saleIds.join(",")] as const,
  creditSales: (params: {
    companyId: string;
    storeId: string | null;
    from: string;
    to: string;
  }) => ["credit-sales", params] as const,
  legacyCredits: (params: {
    companyId: string;
    storeId: string | null;
    from: string;
    to: string;
  }) => ["legacy-credits", params] as const,
  /** Liste boutiques (`listStores`) — ne pas confondre avec `storesPage`. */
  stores: (companyId: string) => ["stores", companyId] as const,
  /** Page Boutiques : `fetchStoresPageData` (liste + quota). */
  storesPage: (companyId: string) => ["stores", companyId, "page"] as const,
  /** Catalogue personnalisé d'une boutique (produits autorisés). `null` si la boutique partage tout. */
  storeCatalog: (storeId: string | null) => ["store-catalog", storeId] as const,
  dashboard: (params: {
    companyId: string;
    storeId: string | null;
    period: DashboardPeriod;
    selectedDay: string;
    customFrom: string | null;
    customTo: string | null;
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
  /** Performance par membre de l'équipe (page Rapports, onglet Équipe). */
  reportsTeam: (params: {
    companyId: string;
    storeId: string | null;
    fromDate: string;
    toDate: string;
  }) => ["reports-team", params] as const,
  /** Liste complète par entreprise — filtres appliqués côté client (aligné `TransfersPage` Flutter). */
  stockTransfers: (companyId: string) => ["stock-transfers", companyId] as const,
  stockTransferDetail: (id: string) => ["stock-transfer", id] as const,
  /** Préférences panier POS — préfixe `['pos-cart-settings']` pour invalider tous les modes. */
  posCartSettings: ["pos-cart-settings"] as const,
  /** `a4-table` partage les mêmes clés localStorage que `a4` (quantités panier). */
  posCartSettingsMode: (mode: "quick" | "a4" | "a4-table") =>
    ["pos-cart-settings", mode === "quick" ? "quick" : "a4"] as const,
  invoiceTablePosEnabled: (companyId: string) =>
    ["invoice-table-pos", companyId] as const,
  /** Réglage owner « vente à crédit en caisse rapide » (`company_settings`). */
  quickPosCreditEnabled: (companyId: string) =>
    ["quick-pos-credit", companyId] as const,
  /** Réglage owner « saisie du prix en caisse rapide » (`company_settings`). */
  quickPosPriceEditEnabled: (companyId: string) =>
    ["quick-pos-price-edit", companyId] as const,
  /** Réglage owner « encaissement en caisse rapide » — opérateurs, mixte, client. */
  quickPosPayments: (companyId: string) => ["quick-pos-payments", companyId] as const,
  /** Dépôt central (`WarehousePage` Flutter) — invalider le préfixe `['warehouse', companyId]`. */
  warehouseInventory: (companyId: string) => ["warehouse", companyId, "inventory"] as const,
  warehouseMovements: (companyId: string) => ["warehouse", companyId, "movements"] as const,
  warehouseDispatch: (companyId: string) => ["warehouse", companyId, "dispatch"] as const,
  warehouseTransfers: (companyId: string) => ["warehouse", companyId, "transfers"] as const,
  /** Sessions d'inventaire physique d'un dépôt (comptage / écarts / validation). */
  warehouseInventorySessions: (companyId: string, warehouseId: string | null) =>
    ["warehouse", companyId, "inventory-sessions", warehouseId ?? "__primary__"] as const,
  /** Panneau owner (ruptures, tendances…) — aligné `OwnerNotificationsDialog` Flutter. */
  ownerNotifications: (companyId: string, storeId: string | null) =>
    ["owner-notifications", companyId, storeId ?? "__all__"] as const,
  /** Historique `notifications` de l'utilisateur connecté (messages reçus + push). */
  myNotifications: ["my-notifications"] as const,
  /** Compteur non lus — clé **préfixée** par `myNotifications` pour être invalidée avec elle. */
  myNotificationsUnread: ["my-notifications", "unread-count"] as const,
  /** Module Comptabilité — préfixe `['accounting', companyId]` pour tout invalider. */
  accountingSetup: (companyId: string) => ["accounting", companyId, "setup"] as const,
  accountingAccounts: (companyId: string) => ["accounting", companyId, "accounts"] as const,
  accountingJournals: (companyId: string) => ["accounting", companyId, "journals"] as const,
  accountingFiscalYears: (companyId: string) => ["accounting", companyId, "fiscal-years"] as const,
  accountingEntries: (params: { companyId: string; from: string; to: string; journalId: string | null }) =>
    ["accounting", params.companyId, "entries", params] as const,
  /** Module R. Humaine — préfixe `['hr', companyId]` pour tout invalider. */
  hrEmployees: (companyId: string) => ["hr", companyId, "employees"] as const,
  hrLeaves: (companyId: string) => ["hr", companyId, "leaves"] as const,
  hrPayrollSettings: (companyId: string) => ["hr", companyId, "payroll-settings"] as const,
  hrIutsBrackets: (companyId: string) => ["hr", companyId, "iuts-brackets"] as const,
  hrPayslips: (params: { companyId: string; year: number; month: number }) =>
    ["hr", params.companyId, "payslips", params.year, params.month] as const,
} as const;
