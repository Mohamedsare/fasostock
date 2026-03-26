import { escapeCsv } from "@/lib/utils/csv";
import type { AiInsightsData } from "./types";

export function aiInsightsToCsv(data: AiInsightsData): string {
  const rows: string[][] = [];
  rows.push(["Section", "Type", "Date", "Résumé", "Tokens"]);

  for (const r of data.requests) {
    rows.push([
      "Requêtes IA",
      r.type,
      r.createdAt,
      r.outputSummary ?? r.inputSummary ?? "",
      String(r.tokensUsed ?? 0),
    ]);
  }
  for (const i of data.insights) {
    rows.push([
      "Insights",
      i.insightType,
      i.createdAt,
      JSON.stringify(i.payload ?? {}).slice(0, 220),
      "",
    ]);
  }
  for (const f of data.forecasts) {
    rows.push([
      "Prévisions",
      f.productId ?? "global",
      f.createdAt,
      JSON.stringify(f.payload ?? {}).slice(0, 220),
      "",
    ]);
  }

  return rows.map((r) => r.map((v) => escapeCsv(v)).join(",")).join("\n");
}

