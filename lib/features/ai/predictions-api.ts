"use client";

import { fetchPredictionContext } from "@/lib/features/dashboard/api";
import { formatCurrency } from "@/lib/utils/currency";
import { createClient } from "@/lib/supabase/client";
import { parseStructuredFromDeepseekJson } from "@/lib/features/ai/deepseek-parse";
import type {
  ContextSummary,
  LastPredictionPayload,
  PredictionContext,
  PredictionStructured,
} from "@/lib/features/ai/prediction-types";

const LAST_PREDICTION_TYPE = "last_prediction";

/** Texte contexte envoyé à DeepSeek — aligné `_buildContextText` (Flutter). */
export function buildPredictionContextText(ctx: PredictionContext): string {
  const fmt = (v: number) => formatCurrency(Number.isFinite(v) ? v : 0);
  const scope =
    ctx.storeName != null
      ? `Boutique: ${ctx.storeName}`
      : `Entreprise: ${ctx.companyName} (toutes boutiques)`;

  let trend = "";
  if (ctx.salesByDay.length >= 2) {
    const mid = Math.floor(ctx.salesByDay.length / 2);
    const sumFirst = ctx.salesByDay.slice(0, mid).reduce((s, d) => s + d.total, 0);
    const sumSecond = ctx.salesByDay.slice(mid).reduce((s, d) => s + d.total, 0);
    const trendPct = sumFirst > 0 ? ((sumSecond - sumFirst) / sumFirst) * 100 : 0;
    trend = `Tendance CA en cours de mois: ${trendPct >= 0 ? "+" : ""}${trendPct.toFixed(1)}% (2e moitié vs 1re moitié).`;
  }

  let comparison = "";
  if (ctx.previousMonthSummary != null) {
    const p = ctx.previousMonthSummary;
    const deltaCa = ctx.salesSummary.totalAmount - p.totalAmount;
    const deltaPct = p.totalAmount > 0 ? (deltaCa / p.totalAmount) * 100 : 0;
    comparison = `
Mois précédent (comparaison):
  CA: ${fmt(p.totalAmount)} (${p.count} ventes)
  Évolution ce mois: ${deltaCa >= 0 ? "+" : ""}${fmt(deltaCa)} (${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%)
  Marge mois précédent: ${fmt(p.margin)}`;
  }

  const dailyLine =
    ctx.salesByDay.length > 0
      ? `\nCA par jour (${ctx.salesByDay.length} jours avec ventes):\n${ctx.salesByDay
          .map((d) => `  ${d.date}: ${fmt(d.total)} (${d.count} ventes)`)
          .join("\n")}`
      : "\nAucune vente détaillée par jour ce mois.";

  return `
Période: ${ctx.period}
Contexte: ${scope}
${trend ? `\n${trend}` : ""}

--- CE MOIS ---
Chiffre d'affaires: ${fmt(ctx.salesSummary.totalAmount)} (${ctx.salesSummary.count} ventes, ${ctx.salesSummary.itemsSold} articles vendus)
Marge: ${fmt(ctx.salesSummary.margin)} (taux: ${ctx.marginRatePercent.toFixed(1)}%)
Achats: ${fmt(ctx.purchasesSummary.totalAmount)} (${ctx.purchasesSummary.count} commandes)
Valeur stock: ${fmt(ctx.stockValue)}
Alertes stock (produits sous seuil minimum): ${ctx.lowStockCount}
${comparison}
${dailyLine}

--- TOP 15 PRODUITS VENDUS (ce mois) ---
${ctx.topProducts
  .map(
    (e, i) =>
      `${i + 1}. ${e.productName}: ${e.quantitySold} vendus, CA ${fmt(e.revenue)}, marge ${fmt(e.margin)}`,
  )
  .join("\n")}
`.trim();
}

export async function getLastPrediction(
  companyId: string,
  storeId: string | null,
): Promise<LastPredictionPayload | null> {
  const supabase = createClient();
  const { data: rows, error } = await supabase
    .from("ai_insights_cache")
    .select("payload, created_at, store_id")
    .eq("company_id", companyId)
    .eq("insight_type", LAST_PREDICTION_TYPE)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  const list = (rows ?? []) as Array<{ payload?: unknown; store_id?: string | null }>;
  const match = list.find((r) => {
    if (storeId == null) return r.store_id == null;
    return r.store_id === storeId;
  });
  if (!match?.payload || typeof match.payload !== "object") return null;
  const p = match.payload as Record<string, unknown>;
  const raw = p.structured as Record<string, unknown> | undefined;
  if (!raw) return null;
  const structured = parseStructuredFromDeepseekJson(raw);
  const cs = p.contextSummary as Record<string, unknown> | undefined;
  if (!cs) return null;
  return {
    structured,
    text: String(p.text ?? structured.commentary ?? ""),
    contextSummary: {
      period: String(cs.period ?? ""),
      salesSummaryTotalAmount: Number(cs.salesSummaryTotalAmount ?? 0),
    },
  };
}

export async function saveLastPrediction(
  companyId: string,
  storeId: string | null,
  payload: LastPredictionPayload,
): Promise<void> {
  const supabase = createClient();
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 10);
  const map = {
    structured: {
      forecast_week_ca: payload.structured.forecastWeekCa,
      forecast_month_ca: payload.structured.forecastMonthCa,
      trend: payload.structured.trend,
      trend_reason: payload.structured.trendReason,
      restock_priorities: payload.structured.restockPriorities.map((r) => ({
        product_name: r.productName,
        quantity_suggested: r.quantitySuggested,
        priority: r.priority,
      })),
      alerts: payload.structured.alerts.map((a) => ({ type: a.type, message: a.message })),
      recommendations: payload.structured.recommendations.map((r) => ({ action: r.action })),
      commentary: payload.structured.commentary,
    },
    text: payload.text,
    contextSummary: {
      period: payload.contextSummary.period,
      salesSummaryTotalAmount: payload.contextSummary.salesSummaryTotalAmount,
    },
  };
  const { error } = await supabase.from("ai_insights_cache").insert({
    company_id: companyId,
    store_id: storeId,
    insight_type: LAST_PREDICTION_TYPE,
    payload: map,
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw error;
}

export async function fetchDeepseekConfigured(): Promise<boolean> {
  try {
    const res = await fetch("/api/ai/config", { cache: "no-store" });
    if (!res.ok) return false;
    const j = (await res.json()) as { deepseekConfigured?: boolean };
    return j.deepseekConfigured === true;
  } catch {
    return false;
  }
}

export async function runPredictionGeneration(params: {
  companyId: string;
  companyName: string;
  storeId: string | null;
  storeName: string | null;
}): Promise<{ structured: PredictionStructured; text: string; context: PredictionContext }> {
  const ctx = await fetchPredictionContext(params);
  const contextText = buildPredictionContextText(ctx);
  const res = await fetch("/api/ai/predictions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contextText }),
  });
  const errText = await res.text();
  if (!res.ok) {
    let msg = errText;
    try {
      const j = JSON.parse(errText) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* */
    }
    throw new Error(msg || `Erreur API ${res.status}`);
  }
  const data = (await res.json()) as { structured: PredictionStructured; text: string };
  return { structured: data.structured, text: data.text, context: ctx };
}
