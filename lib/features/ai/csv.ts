import { escapeCsv } from "@/lib/utils/csv";
import type { ProSheetCell } from "@/lib/utils/spreadsheet-export-pro";
import type { AiInsightsData } from "./types";

const AI_HEADERS = ["Section", "Type / ID", "Date", "Résumé / données", "Tokens / total"] as const;

export function aiInsightsToSpreadsheetMatrix(data: AiInsightsData): {
  headers: string[];
  rows: ProSheetCell[][];
} {
  const rows: ProSheetCell[][] = [];
  for (const r of data.requests) {
    rows.push([
      "Requêtes IA",
      r.type,
      r.createdAt,
      r.outputSummary ?? r.inputSummary ?? "",
      r.tokensUsed ?? "",
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
  rows.push(["Synthèse", "Total tokens (période)", "", "", data.totalTokens]);
  return { headers: [...AI_HEADERS], rows };
}

export function aiInsightsToCsv(data: AiInsightsData): string {
  const { headers, rows: matrix } = aiInsightsToSpreadsheetMatrix(data);
  const lines = matrix.map((line) =>
    line.map((v) => (typeof v === "number" ? String(v) : escapeCsv(String(v ?? "")))).join(","),
  );
  return [headers.map(escapeCsv).join(","), ...lines].join("\n");
}
