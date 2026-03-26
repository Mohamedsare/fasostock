import type { PredictionStructured } from "@/lib/features/ai/prediction-types";

/** Parse le JSON DeepSeek (même logique que `getPredictionsStructured` Flutter). */
export function parseStructuredFromDeepseekJson(parsed: Record<string, unknown>): PredictionStructured {
  const restockList = (parsed.restock_priorities as unknown[]) ?? [];
  const alertsList = (parsed.alerts as unknown[]) ?? [];
  const recsList = (parsed.recommendations as unknown[]) ?? [];

  return {
    forecastWeekCa: Number(parsed.forecast_week_ca ?? 0),
    forecastMonthCa: Number(parsed.forecast_month_ca ?? 0),
    trend: ((parsed.trend as string) ?? "stable") as "up" | "down" | "stable",
    trendReason: String(parsed.trend_reason ?? ""),
    restockPriorities: restockList.map((e) => {
      const m = e as Record<string, unknown>;
      const pr = String(m.priority ?? "low");
      return {
        productName: String(m.product_name ?? ""),
        quantitySuggested: String(m.quantity_suggested ?? ""),
        priority: pr === "high" || pr === "medium" || pr === "low" ? pr : "low",
      };
    }),
    alerts: alertsList.map((e) => {
      const m = e as Record<string, unknown>;
      return { type: String(m.type ?? ""), message: String(m.message ?? "") };
    }),
    recommendations: recsList.map((e) => {
      const m = e as Record<string, unknown>;
      return { action: String(m.action ?? "") };
    }),
    commentary: String(parsed.commentary ?? ""),
  };
}

export function extractJsonFromModelContent(text: string): string {
  const trimmed = text.trim();
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1]!.trim();
  if (trimmed.startsWith("{")) return trimmed;
  return trimmed;
}
