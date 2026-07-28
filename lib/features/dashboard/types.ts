export type SalesSummary = {
  totalAmount: number;
  count: number;
  itemsSold: number;
  margin: number;
};

export type SalesByDay = { date: string; total: number; count: number };

export type TopProduct = {
  productId: string;
  productName: string;
  quantitySold: number;
  revenue: number;
  margin: number;
};

export type PurchasesSummary = { totalAmount: number; count: number };

export type ExpensesSummary = { totalAmount: number; count: number };

export type StockValue = { totalValue: number; productCount: number };

export type CategorySales = {
  categoryId: string | null;
  categoryName: string;
  revenue: number;
  quantity: number;
};

export type StockWatchSample = {
  productName: string;
  quantity: number;
  threshold: number;
  /** Renseigné en vue entreprise (plusieurs boutiques). */
  storeName?: string;
};

export type DashboardData = {
  salesSummary: SalesSummary;
  ticketAverage: number;
  salesByDay: SalesByDay[];
  topProducts: TopProduct[];
  /** Top ventes par marge sur la période (propriétaire — panneau performance). */
  topByMargin: TopProduct[];
  /** Faible rotation (CA le plus bas sur la période). */
  leastByRevenue: TopProduct[];
  salesByCategory: CategorySales[];
  purchasesSummary: PurchasesSummary;
  /** Dépenses (charges) sur la période — pour le Bénéfice net = marge − dépenses. */
  expensesSummary: ExpensesSummary;
  stockValue: StockValue;
  lowStockCount: number;
  stockWatchSamples: StockWatchSample[];
  /** Même fenêtre que la période courante, décalée en arrière. */
  previousPeriodSummary: SalesSummary;
  previousPurchasesSummary: PurchasesSummary;
  previousExpensesSummary: ExpensesSummary;
  daySalesSummary: SalesSummary;
  dayPurchasesSummary: PurchasesSummary;
  /** Dépenses du jour sélectionné (charges saisies page Dépenses). */
  dayExpenses: ExpensesSummary;
  /** Logique caisse : part de l'encaissé du JOUR provenant de crédits d'anciennes ventes remboursés ce jour. */
  dayCreditRepayments: number;
  /** Logique caisse : part de l'encaissé de la PÉRIODE provenant de crédits d'anciennes ventes. */
  periodCreditRepayments: number;
};

/** Aligné `StockAlerts` / `getStockAlerts` (Flutter `reports_offline_repository.dart`). */
export type StockAlertItem = {
  productId: string;
  productName: string;
  quantity: number;
  threshold: number;
};

export type StockMovementByDay = { date: string; netQuantity: number };

export type StockReportData = {
  currentStockCount: number;
  outOfStock: StockAlertItem[];
  lowStock: StockAlertItem[];
  entries: number;
  exits: number;
  net: number;
  byDayNet: StockMovementByDay[];
};

/** Données page Rapports — aligné `ReportsPage` / `getSalesKpis` + dashboard + stock. */
export type ReportsPageData = {
  salesSummary: SalesSummary;
  ticketAverage: number;
  marginRatePercent: number;
  salesByDay: SalesByDay[];
  topProducts: TopProduct[];
  leastProducts: TopProduct[];
  salesByCategory: CategorySales[];
  purchasesSummary: PurchasesSummary;
  stockValue: StockValue;
  lowStockCount: number;
  stockReport: StockReportData | null;
  /** Même durée que la période courante, décalée en arrière — sert aux deltas « vs période précédente ». */
  previousSummary: SalesSummary;
};

/** Ventilation par moyen de paiement (`sale_payments.method`). */
export type PaymentBreakdown = {
  method: string;
  amount: number;
  count: number;
};

/**
 * Performance d'un membre de l'équipe (caissier / vendeur) sur la période.
 * Le propriétaire y voit « qui a vendu combien », la marge apportée, les crédits
 * accordés, les heures d'activité et les produits phares de chacun.
 */
export type CashierPerformance = {
  userId: string;
  displayName: string;
  roleName: string;
  /** Encaissé sur la période attribué à ce vendeur (remboursements de ses crédits inclus). */
  revenue: number;
  /** Marge reconnue au prorata de l'encaissé. */
  margin: number;
  marginRatePercent: number;
  /** Nombre de ventes créées sur la période. */
  salesCount: number;
  itemsSold: number;
  /** Panier moyen = facturé / nb ventes. */
  ticketAverage: number;
  /** Total facturé (Σ `sales.total`) sur ses ventes de la période. */
  billedTotal: number;
  /** Remises accordées (Σ `sales.discount`). */
  discountTotal: number;
  /** Reste dû sur ses ventes de la période (crédit accordé non remboursé). */
  creditOutstanding: number;
  /** Part de l'encaissé provenant du remboursement de crédits antérieurs. */
  creditRepayments: number;
  byDay: SalesByDay[];
  /** 24 cases (heure locale) — profil d'activité. */
  byHour: { hour: number; count: number; revenue: number }[];
  payments: PaymentBreakdown[];
  topProducts: TopProduct[];
  /** Nombre de jours distincts avec au moins une vente. */
  activeDays: number;
  firstSaleAt: string | null;
  lastSaleAt: string | null;
  storeNames: string[];
};

export type TeamPerformanceData = {
  cashiers: CashierPerformance[];
  totals: {
    revenue: number;
    margin: number;
    salesCount: number;
    itemsSold: number;
    billedTotal: number;
    creditOutstanding: number;
  };
};
