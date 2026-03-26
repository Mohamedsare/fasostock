/** Aligné sur `prediction.dart` (Flutter) — prédictions IA structurées. */

export type SalesSummaryForPrediction = {
  totalAmount: number;
  count: number;
  itemsSold: number;
  margin: number;
};

export type PreviousMonthSummary = {
  totalAmount: number;
  count: number;
  margin: number;
};

export type SalesByDayPrediction = { date: string; total: number; count: number };

export type TopProductPrediction = {
  productName: string;
  quantitySold: number;
  revenue: number;
  margin: number;
};

export type PurchasesSummaryForPrediction = {
  totalAmount: number;
  count: number;
};

export type PredictionContext = {
  companyName: string;
  storeName: string | null;
  period: string;
  salesSummary: SalesSummaryForPrediction;
  previousMonthSummary: PreviousMonthSummary | null;
  salesByDay: SalesByDayPrediction[];
  topProducts: TopProductPrediction[];
  purchasesSummary: PurchasesSummaryForPrediction;
  stockValue: number;
  lowStockCount: number;
  marginRatePercent: number;
};

export type RestockPriority = {
  productName: string;
  quantitySuggested: string;
  priority: "high" | "medium" | "low";
};

export type PredictionAlert = { type: string; message: string };

export type PredictionRecommendation = { action: string };

export type PredictionStructured = {
  forecastWeekCa: number;
  forecastMonthCa: number;
  trend: "up" | "down" | "stable";
  trendReason: string;
  restockPriorities: RestockPriority[];
  alerts: PredictionAlert[];
  recommendations: PredictionRecommendation[];
  commentary: string;
};

export type ContextSummary = {
  period: string;
  salesSummaryTotalAmount: number;
};

export type LastPredictionPayload = {
  structured: PredictionStructured;
  text: string;
  contextSummary: ContextSummary;
};
