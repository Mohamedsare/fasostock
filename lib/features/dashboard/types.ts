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

export type StockValue = { totalValue: number; productCount: number };

export type CategorySales = {
  categoryId: string | null;
  categoryName: string;
  revenue: number;
  quantity: number;
};

export type DashboardData = {
  salesSummary: SalesSummary;
  ticketAverage: number;
  salesByDay: SalesByDay[];
  topProducts: TopProduct[];
  salesByCategory: CategorySales[];
  purchasesSummary: PurchasesSummary;
  stockValue: StockValue;
  lowStockCount: number;
  daySalesSummary: SalesSummary;
  dayPurchasesSummary: PurchasesSummary;
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
};
